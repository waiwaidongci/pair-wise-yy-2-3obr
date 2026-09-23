// 准入判定：参赛资格、接种有效性、召回影响与重算。纯规则模块，不读写文件。

export const STATUS = Object.freeze({
  ADMITTED: "admitted", // 准入，占用名额
  DENIED: "denied", // 不准入（缺失/过期/未满14天）
  PENDING_REVIEW: "pending_review" // 召回后待复核，不占用名额
});

export const MIN_DAYS = 14;
export const MAX_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidDateString(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// 距比赛日的天数差（接种日 -> 比赛日）
export function diffDays(fromDate, toDate) {
  return Math.round((Date.parse(toDate) - Date.parse(fromDate)) / DAY_MS);
}

export function findRecall(db, batchNo) {
  return (db.recalls || []).find(item => item.batchNo === batchNo) || null;
}

// 一条接种记录当前是否“有效”：正常有效；或批号虽被召回但处置结论判定合格。
export function isVaccineEffective(db, vaccine) {
  if (!vaccine) return false;
  const recall = findRecall(db, vaccine.batchNo);
  if (recall) return recall.disposition === "closed" && recall.conclusion === "safe";
  return vaccine.status === "valid";
}

// 报名时核对的“最新有效接种记录”
export function latestEffectiveVaccine(db, pigeon) {
  let best = null;
  pigeon.vaccines.forEach((vaccine, index) => {
    if (!isVaccineEffective(db, vaccine)) return;
    if (!best) { best = { vaccine, index }; return; }
    const current = Date.parse(vaccine.date);
    const previous = Date.parse(best.vaccine.date);
    if (current > previous || (current === previous && index > best.index)) {
      best = { vaccine, index };
    }
  });
  return best ? best.vaccine : null;
}

export function snapshotOf(vaccine) {
  return {
    vaccineId: vaccine.id,
    disease: vaccine.disease,
    batchNo: vaccine.batchNo,
    date: vaccine.date
  };
}

const EMPTY_SNAPSHOT = { vaccineId: "", disease: "", batchNo: "", date: "" };

// 核心准入判定：缺失、未满14天、超365天、召回处置未完结均不得占用名额。
export function evaluateEntry(db, pigeon, entry) {
  const snapshot = entry.vaccineSnapshot || EMPTY_SNAPSHOT;
  const snapshotRecall = findRecall(db, snapshot.batchNo);
  if (snapshotRecall && snapshotRecall.disposition === "open") {
    return { status: STATUS.PENDING_REVIEW, reasons: ["recall_open"], vaccine: null };
  }
  let basis = pigeon.vaccines.find(v => v.id === snapshot.vaccineId) || null;
  const basisRecall = basis && findRecall(db, basis.batchNo);
  const basisConfirmedBad = basisRecall
    && basisRecall.disposition === "closed"
    && basisRecall.conclusion === "confirmed";
  // 被替代的旧记录仍支撑历史准入；批号确认失效后改用当前最新有效记录重算。
  if (!basis || basisConfirmedBad) basis = latestEffectiveVaccine(db, pigeon);
  if (!basis) return { status: STATUS.DENIED, reasons: ["missing"], vaccine: null };
  const gap = diffDays(basis.date, entry.raceDate);
  if (gap < MIN_DAYS) return { status: STATUS.DENIED, reasons: ["too_soon"], vaccine: basis };
  if (gap > MAX_DAYS) return { status: STATUS.DENIED, reasons: ["expired"], vaccine: basis };
  return { status: STATUS.ADMITTED, reasons: [], vaccine: basis };
}

// 更正接种日期/批号、召回或处置结论变化后，按新值重算该鸽全部参赛登记。
export function recomputePigeon(db, pigeon, at) {
  for (const entry of pigeon.entries || []) {
    const result = evaluateEntry(db, pigeon, entry);
    const basisChanged = Boolean(result.vaccine) && result.vaccine.id !== entry.vaccineSnapshot.vaccineId;
    if (result.vaccine) entry.vaccineSnapshot = snapshotOf(result.vaccine);
    entry.reasons = result.reasons.slice();
    if (entry.status !== result.status || basisChanged) {
      entry.history.push({
        at,
        from: entry.status,
        to: result.status,
        reasons: result.reasons.slice(),
        basisChanged
      });
      entry.status = result.status;
    }
  }
}

export function recomputeByBatch(db, batchNo, at) {
  for (const pigeon of db.pigeons) {
    if (pigeon.vaccines.some(v => v.batchNo === batchNo)) recomputePigeon(db, pigeon, at);
  }
}

// 对外视图一律现场判定，保证列表、单羽追溯、刷新后状态一致。
export function entryView(db, pigeon, entry) {
  const live = evaluateEntry(db, pigeon, entry);
  return {
    id: entry.id,
    event: entry.event,
    raceDate: entry.raceDate,
    distance: entry.distance || 0,
    idempotencyKey: entry.idempotencyKey || "",
    createdAt: entry.createdAt,
    ringNo: pigeon.ringNo,
    vaccineSnapshot: { ...entry.vaccineSnapshot },
    status: live.status,
    reasons: live.reasons.slice(),
    storedStatus: entry.status,
    history: entry.history,
    firstResult: entry.firstResult
  };
}

export function listEntries(db) {
  const views = [];
  for (const pigeon of db.pigeons) {
    for (const entry of pigeon.entries || []) views.push(entryView(db, pigeon, entry));
  }
  return views.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// 只有现场判定为 admitted 的登记占用名额。
export function eventOccupancy(db) {
  const map = new Map();
  for (const pigeon of db.pigeons) {
    for (const entry of pigeon.entries || []) {
      const live = evaluateEntry(db, pigeon, entry);
      if (live.status !== STATUS.ADMITTED) continue;
      const key = `${entry.event}@${entry.raceDate}`;
      if (!map.has(key)) {
        map.set(key, { event: entry.event, raceDate: entry.raceDate, pigeons: [] });
      }
      map.get(key).pigeons.push(pigeon.ringNo);
    }
  }
  return [...map.values()].sort((a, b) => a.raceDate.localeCompare(b.raceDate));
}
