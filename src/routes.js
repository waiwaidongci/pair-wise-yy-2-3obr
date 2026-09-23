// 业务文件三：请求入口
// HTTP 路由层：解析请求、编排档案存储（archive.js）与准入判定（eligibility.js）。
// 所有改变事实的操作落盘后统一重算准入，保证列表、单羽追溯、刷新状态一致。
import { loadDb, saveDb, findPigeon, findRecall, nextVaccineId, nextEntryId } from "./archive.js";
import {
  MIN_DAYS,
  MAX_DAYS,
  validDate,
  validateVaccine,
  existingVaccine,
  latestEffectiveVaccine,
  decorateVaccine,
  decoratePigeon,
  decorateEntry,
  recomputeAll
} from "./eligibility.js";

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return Object.create(null);
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toISOString();
}

// 任何写操作之后的统一出口：重算全部参赛登记 → 落盘 → 响应
async function persist(db, res, status, payload, { reason } = {}) {
  recomputeAll(db, { now: now(), reason });
  await saveDb(db);
  return sendJson(res, status, payload);
}

export async function handleApi(req, res, url) {
  const db = await loadDb();
  const p = url.pathname;

  // ---------- 鸽只档案列表（含只读召回状态的接种记录） ----------
  if (req.method === "GET" && p === "/api/pigeons") {
    recomputeAll(db, { reason: "列表刷新重算" });
    return sendJson(res, 200, db.pigeons.map(pigeon => decoratePigeon(db, pigeon)));
  }

  // ---------- 创建鸽只档案 ----------
  if (req.method === "POST" && p === "/api/pigeons") {
    const input = await readBody(req);
    const ringNo = String(input.ringNo || "").trim();
    if (!ringNo) return sendJson(res, 400, { error: "ring_no_required" });
    if (db.pigeons.some(item => item.ringNo === ringNo)) return sendJson(res, 409, { error: "ring_exists" });
    if (!validDate(input.birthDate)) return sendJson(res, 400, { error: "birth_date_invalid" });
    if (input.fatherRing && !findPigeon(db, String(input.fatherRing).trim())) return sendJson(res, 404, { error: "father_not_found" });
    if (input.motherRing && !findPigeon(db, String(input.motherRing).trim())) return sendJson(res, 404, { error: "mother_not_found" });
    const pigeon = {
      ringNo,
      owner: String(input.owner || "").trim(),
      fatherRing: String(input.fatherRing || "").trim(),
      motherRing: String(input.motherRing || "").trim(),
      color: String(input.color || "").trim(),
      loft: String(input.loft || "").trim(),
      birthDate: String(input.birthDate).trim(),
      vaccines: [],
      transfers: [],
      races: []
    };
    db.pigeons.unshift(pigeon);
    await saveDb(db);
    return sendJson(res, 201, pigeon);
  }

  // ---------- 血统追溯 / 单羽全量追溯 ----------
  const relationMatch = p.match(/^\/api\/pigeons\/(.+)\/relation$/);
  if (relationMatch && req.method === "GET") {
    const pigeon = findPigeon(db, decodeURIComponent(relationMatch[1]));
    if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
    recomputeAll(db, { reason: "单羽追溯重算" });
    const entries = db.entries
      .filter(entry => entry.ringNo === pigeon.ringNo)
      .map(entry => decorateEntry(db, entry));
    const data = {
      pigeon: decoratePigeon(db, pigeon),
      father: decoratePigeon(db, findPigeon(db, pigeon.fatherRing)),
      mother: decoratePigeon(db, findPigeon(db, pigeon.motherRing)),
      children: db.pigeons.filter(item => item.fatherRing === pigeon.ringNo || item.motherRing === pigeon.ringNo).map(item => decoratePigeon(db, item)),
      vaccines: pigeon.vaccines.map(item => decorateVaccine(db, item)),
      entries
    };
    return sendJson(res, 200, data);
  }

  // ---------- 转让、归巢成绩（沿用原功能） ----------
  const actionMatch = p.match(/^\/api\/pigeons\/(.+)\/(transfers|races)$/);
  if (actionMatch && req.method === "POST") {
    const pigeon = findPigeon(db, decodeURIComponent(actionMatch[1]));
    if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
    const input = await readBody(req);
    if (actionMatch[2] === "transfers") {
      if (!String(input.to || "").trim()) return sendJson(res, 400, { error: "to_required" });
      const transfer = { date: input.date || now().slice(0, 10), from: pigeon.owner, to: String(input.to).trim() };
      pigeon.owner = transfer.to;
      pigeon.transfers.push(transfer);
    }
    if (actionMatch[2] === "races") {
      pigeon.races.push({
        date: input.date || now().slice(0, 10),
        event: String(input.event || "").trim(),
        distance: Number(input.distance || 0),
        returnTime: String(input.returnTime || ""),
        rank: Number(input.rank || 0)
      });
    }
    await saveDb(db);
    return sendJson(res, 200, pigeon);
  }

  // ---------- 接种记录：新增（每羽同一疫病只保留一条，校验失败整条不写） ----------
  const vaccinesMatch = p.match(/^\/api\/pigeons\/(.+)\/vaccines$/);
  if (vaccinesMatch) {
    const pigeon = findPigeon(db, decodeURIComponent(vaccinesMatch[1]));
    if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });

    if (req.method === "GET") {
      recomputeAll(db, { reason: "列表刷新重算" });
      return sendJson(res, 200, pigeon.vaccines.map(item => decorateVaccine(db, item)));
    }

    if (req.method === "POST") {
      const input = await readBody(req);
      const first = existingVaccine(pigeon, String(input.name || "").trim());
      if (first) {
        // 重复提交沿用首次结果：同疫病已有记录时原样返回，不产生第二条
        return sendJson(res, 200, { duplicate: true, vaccine: decorateVaccine(db, first) });
      }
      const check = validateVaccine(db, pigeon, input);
      if (!check.ok) return sendJson(res, 400, { error: check.error });
      const vaccine = {
        id: nextVaccineId(db),
        name: check.value.name,
        date: check.value.date,
        batchNo: check.value.batchNo,
        createdAt: now(),
        corrections: []
      };
      pigeon.vaccines.push(vaccine);
      return persist(db, res, 201, { duplicate: false, vaccine: decorateVaccine(db, vaccine) }, { reason: `新增接种 ${vaccine.name}` });
    }
  }

  // ---------- 接种记录：更正日期/批号（旧记录只读、更正按新值重算） ----------
  const vaccinePatchMatch = p.match(/^\/api\/pigeons\/(.+)\/vaccines\/(.+)$/);
  if (vaccinePatchMatch && req.method === "PATCH") {
    const pigeon = findPigeon(db, decodeURIComponent(vaccinePatchMatch[1]));
    if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
    const vaccine = pigeon.vaccines.find(item => item.id === decodeURIComponent(vaccinePatchMatch[2]));
    if (!vaccine) return sendJson(res, 404, { error: "vaccine_not_found" });
    if (findRecall(db, vaccine.batchNo)) {
      // 批号被召回后旧记录只读
      return sendJson(res, 409, { error: "vaccine_readonly_after_recall" });
    }
    const input = await readBody(req);
    const candidate = {
      name: vaccine.name,
      date: input.date !== undefined ? String(input.date).trim() : vaccine.date,
      batchNo: input.batchNo !== undefined ? String(input.batchNo).trim() : vaccine.batchNo
    };
    const check = validateVaccine(db, pigeon, candidate, vaccine.id);
    if (!check.ok) return sendJson(res, 400, { error: check.error });
    const before = { date: vaccine.date, batchNo: vaccine.batchNo };
    vaccine.date = check.value.date;
    vaccine.batchNo = check.value.batchNo;
    vaccine.corrections.push({ at: now(), from: before, to: { date: vaccine.date, batchNo: vaccine.batchNo } });
    return persist(db, res, 200, { vaccine: decorateVaccine(db, vaccine) }, { reason: `更正接种 ${vaccine.name} 的日期/批号` });
  }

  // ---------- 批次召回列表 ----------
  if (req.method === "GET" && p === "/api/recalls") {
    recomputeAll(db, { reason: "列表刷新重算" });
    return sendJson(res, 200, db.recalls.map(recall => ({
      ...recall,
      affectedEntries: db.entries
        .map(entry => decorateEntry(db, entry))
        .filter(entry => entry.vaccine?.batchNo === recall.batchNo)
    })));
  }

  // ---------- 发起批次召回：引用该批号的参赛登记立即失效并转待复核，旧记录只读 ----------
  if (req.method === "POST" && p === "/api/recalls") {
    const input = await readBody(req);
    const batchNo = String(input.batchNo || "").trim();
    if (!batchNo) return sendJson(res, 400, { error: "batch_no_required" });
    const existing = findRecall(db, batchNo);
    if (existing) {
      // 重复提交沿用首次结果
      return sendJson(res, 200, { duplicate: true, recall: existing });
    }
    const referenced = db.pigeons.some(pigeon => pigeon.vaccines.some(item => item.batchNo === batchNo));
    const recall = {
      batchNo,
      reason: String(input.reason || "").trim(),
      createdAt: now(),
      createdBy: String(input.createdBy || "登记站"),
      closedAt: "",
      conclusion: "",
      referenced
    };
    db.recalls.push(recall);
    return persist(db, res, 201, { duplicate: false, recall }, { reason: `批号 ${batchNo} 发起召回` });
  }

  // ---------- 更正召回处置结论（未完结→完结；已完结→按新结论重算） ----------
  const recallPatchMatch = p.match(/^\/api\/recalls\/(.+)$/);
  if (recallPatchMatch && req.method === "PATCH") {
    const batchNo = decodeURIComponent(recallPatchMatch[1]);
    const recall = findRecall(db, batchNo);
    if (!recall) return sendJson(res, 404, { error: "recall_not_found" });
    const input = await readBody(req);
    const conclusion = String(input.conclusion || "").trim();
    if (!conclusion) return sendJson(res, 400, { error: "conclusion_required" });
    if (!["复核有效", "作废"].includes(conclusion)) return sendJson(res, 400, { error: "conclusion_invalid" });
    if (!recall.closedAt) recall.closedAt = now();
    recall.conclusion = conclusion;
    recall.conclusionCorrectedAt = now();
    return persist(db, res, 200, { recall }, { reason: `批号 ${batchNo} 处置结论：${conclusion}` });
  }

  // ---------- 参赛登记列表（含名额占用情况） ----------
  if (req.method === "GET" && p === "/api/entries") {
    recomputeAll(db, { reason: "列表刷新重算" });
    const entries = db.entries.map(entry => decorateEntry(db, entry));
    const status = url.searchParams.get("status");
    const slots = {};
    for (const entry of entries) {
      if (entry.status === "qualified") {
        const key = `${entry.event}@${entry.raceDate}`;
        slots[key] = (slots[key] || 0) + 1;
      }
    }
    return sendJson(res, 200, {
      window: { minDays: MIN_DAYS, maxDays: MAX_DAYS },
      entries: status ? entries.filter(entry => entry.status === status) : entries,
      slotsUsed: slots
    });
  }

  // ---------- 报名比赛：14–365 天窗口；过期/缺失/召回处置未完结不得占用名额 ----------
  if (req.method === "POST" && p === "/api/entries") {
    const input = await readBody(req);
    const ringNo = String(input.ringNo || "").trim();
    const event = String(input.event || "").trim();
    const raceDate = String(input.raceDate || "").trim();
    const disease = String(input.disease || "").trim() || "新城疫";
    const pigeon = findPigeon(db, ringNo);
    if (!pigeon) return sendJson(res, 404, { error: "pigeon_not_found" });
    if (!event) return sendJson(res, 400, { error: "event_required" });
    if (!validDate(raceDate)) return sendJson(res, 400, { error: "race_date_invalid" });

    // 重复提交沿用首次结果（同一羽、同一赛事、同一比赛日）
    const same = db.entries.find(item => item.ringNo === ringNo && item.event === event && item.raceDate === raceDate);
    if (same) return sendJson(res, 200, { duplicate: true, entry: decorateEntry(db, same) });

    const vaccine = latestEffectiveVaccine(db, pigeon, disease);
    const entry = {
      id: nextEntryId(db),
      ringNo,
      event,
      raceDate,
      disease,
      vaccineId: vaccine ? vaccine.id : "",
      createdAt: now(),
      status: "denied",
      lastReason: "",
      statusHistory: []
    };
    db.entries.push(entry);
    // 首次判定：过期/缺失→denied；召回处置未完结→pending_review；窗口内→qualified
    return persist(db, res, 201, { duplicate: false, entry: decorateEntry(db, entry) }, { reason: "报名参赛首次判定" });
  }

  return sendJson(res, 404, { error: "not_found" });
}
