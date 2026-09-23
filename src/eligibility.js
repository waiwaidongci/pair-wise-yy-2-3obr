// 业务文件二：准入判定
// 纯函数模块：接种记录写入校验、批次召回状态、参赛准入窗口判定与全量重算。
// 不读写文件，只对传入的档案数据做判定，保证列表、单羽追溯、刷新看到同一结果。
import { findRecall } from "./archive.js";

export const MIN_DAYS = 14;   // 距比赛日至少 14 天
export const MAX_DAYS = 365; // 距比赛日至多 365 天

const DAY = 24 * 60 * 60 * 1000;

export function dayValue(value) {
  return Math.floor(Date.parse(`${value}T00:00:00Z`) / DAY);
}

export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

// 召回处置结论：未召回 / 召回处置中（占用立即失效）/ 处置完结（结论可复核）
export function recallState(db, batchNo) {
  if (!batchNo) return { recalled: false };
  const recall = findRecall(db, batchNo);
  if (!recall) return { recalled: false };
  return { recalled: true, open: !recall.closedAt, recall };
}

// 同一羽同一疫病只保留一条：取该疫病下已写入的记录（至多一条，按名称精确匹配）
export function existingVaccine(pigeon, name) {
  return pigeon.vaccines.find(item => item.name === name) || null;
}

export function batchDuplicate(pigeon, batchNo, ignoreId) {
  if (!batchNo) return false;
  return pigeon.vaccines.some(item => item.batchNo === batchNo && item.id !== ignoreId);
}

// 写入前校验。任何一条不通过即“整条不写”，调用方据此拒绝请求。
export function validateVaccine(db, pigeon, input, ignoreId) {
  const name = String(input.name || "").trim();
  const date = String(input.date || "").trim();
  const batchNo = String(input.batchNo || "").trim();
  if (!name) return { ok: false, error: "name_required" };
  if (!validDate(date)) return { ok: false, error: "date_invalid" };
  if (pigeon.birthDate && dayValue(date) < dayValue(pigeon.birthDate)) {
    return { ok: false, error: "before_birth_date" };
  }
  if (batchDuplicate(pigeon, batchNo, ignoreId)) return { ok: false, error: "duplicate_batch" };
  // 批号已被召回且处置尚未完结时，新接种同样不得引用
  const state = recallState(db, batchNo);
  if (state.open) return { ok: false, error: "batch_recall_open" };
  return { ok: true, value: { name, date, batchNo } };
}

// 取某羽针对某疫病最新一条有效接种记录；
// 召回处置未完结的记录不作为有效保护依据。
export function latestEffectiveVaccine(db, pigeon, name) {
  const records = pigeon.vaccines
    .filter(item => item.name === name)
    .filter(item => !recallState(db, item.batchNo).open)
    .sort((a, b) => dayValue(b.date) - dayValue(a.date) || b.createdAt.localeCompare(a.createdAt));
  return records[0] || null;
}

// 单条参赛准入判定
export function evaluateEntry(db, pigeon, entry) {
  if (!pigeon) return { status: "denied", reason: "pigeon_not_found" };
  const vaccine = pigeon.vaccines.find(item => item.id === entry.vaccineId) || null;
  if (!vaccine) return { status: "denied", reason: "vaccine_missing" };
  if (vaccine.name !== entry.disease) return { status: "denied", reason: "vaccine_missing" };

  const state = recallState(db, vaccine.batchNo);
  // 批号被召回：引用它的参赛登记立即失效并转待复核，处置完结前不得占用名额
  if (state.recalled && state.open) {
    return { status: "pending_review", reason: "batch_recall_open", batchNo: vaccine.batchNo };
  }

  // 处置已完结：凭结论复核。结论明确“作废”则判失效，其余结论回到窗口规则复核。
  if (state.recalled && state.recall.conclusion === "作废") {
    return { status: "denied", reason: "batch_recall_voided", batchNo: vaccine.batchNo };
  }

  if (!validDate(entry.raceDate)) return { status: "denied", reason: "race_date_invalid" };
  const age = dayValue(entry.raceDate) - dayValue(vaccine.date);
  if (age < MIN_DAYS) return { status: "denied", reason: "vaccine_too_recent", age };
  if (age > MAX_DAYS) return { status: "denied", reason: "vaccine_expired", age };
  return { status: "qualified", reason: "ok", age };
}

export function reasonText(reason) {
  return ({
    ok: "符合准入",
    pigeon_not_found: "鸽只档案不存在",
    vaccine_missing: "缺少对应疫病的有效接种记录",
    batch_recall_open: "引用批号召回处置未完结，转待复核",
    batch_recall_voided: "召回批号结论为作废，准入失效",
    race_date_invalid: "比赛日期无效",
    vaccine_too_recent: `接种距比赛日不足${MIN_DAYS}天`,
    vaccine_expired: `接种距比赛日超过${MAX_DAYS}天，已过期`
  })[reason] || reason;
}

export function decorateVaccine(db, vaccine) {
  const state = recallState(db, vaccine.batchNo);
  return {
    ...vaccine,
    recall: state.recall || null,
    recallOpen: Boolean(state.open),
    readOnly: Boolean(state.recall) // 批号进入召回流程后，旧接种记录只读
  };
}

export function decoratePigeon(db, pigeon) {
  if (!pigeon) return null;
  return { ...pigeon, vaccines: pigeon.vaccines.map(item => decorateVaccine(db, item)) };
}

export function decorateEntry(db, entry) {
  const pigeon = db.pigeons.find(item => item.ringNo === entry.ringNo) || null;
  const result = evaluateEntry(db, pigeon, entry);
  const vaccine = pigeon?.vaccines.find(item => item.id === entry.vaccineId) || null;
  return {
    ...entry,
    ...result,
    reasonText: reasonText(result.reason),
    vaccine: vaccine ? {
      id: vaccine.id, name: vaccine.name, date: vaccine.date, batchNo: vaccine.batchNo,
      recall: recallState(db, vaccine.batchNo).recall || null
    } : null
  };
}

// 全量重算：更正接种日期/批号、召回发起或处置结论变更后，所有原准入按新值重算。
// 状态写入登记记录的状态史；首次状态保留为只读快照。
export function recomputeAll(db, { now = new Date().toISOString(), reason = "refresh" } = {}) {
  for (const entry of db.entries) {
    const pigeon = db.pigeons.find(item => item.ringNo === entry.ringNo) || null;
    const result = evaluateEntry(db, pigeon, entry);
    entry.statusHistory ||= [];
    if (entry.statusHistory.length === 0) {
      entry.statusHistory.push({ status: result.status, reason: result.reason, at: entry.createdAt, reasonDetail: "首次判定（只读快照）" });
    } else if (entry.status !== result.status || entry.lastReason !== result.reason) {
      entry.statusHistory.push({ status: result.status, reason: result.reason, at: now, reasonDetail: reason });
    }
    entry.status = result.status;
    entry.lastReason = result.reason;
  }
}

export { MIN_DAYS as WINDOW_MIN_DAYS, MAX_DAYS as WINDOW_MAX_DAYS };
