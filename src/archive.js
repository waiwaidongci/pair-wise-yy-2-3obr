// 档案存储：鸽只档案、接种记录、批次召回、参赛登记的落盘与写入规则。

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STATUS,
  diffDays,
  evaluateEntry,
  findRecall,
  isValidDateString,
  latestEffectiveVaccine,
  recomputeByBatch,
  recomputePigeon,
  snapshotOf
} from "./admission.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = join(__dirname, "..", "data", "pigeons.json");

const seed = {
  seq: { vaccine: 1, recall: 1, entry: 1 },
  recalls: [],
  pigeons: [
    {
      ringNo: "CHN-2026-001", owner: "北岸棚", fatherRing: "CHN-2022-188", motherRing: "CHN-2023-512",
      color: "灰", loft: "北岸A棚", birthDate: "2026-01-10",
      vaccines: [{ id: "V1", date: "2026-04-01", disease: "新城疫", batchNo: "B-ND-2603", status: "valid", createdAt: "2026-04-01T09:00:00.000Z", amended: [] }],
      transfers: [{ date: "2026-04-15", from: "育种棚", to: "北岸棚" }],
      races: [{ date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 }],
      entries: []
    },
    { ringNo: "CHN-2022-188", owner: "育种棚", fatherRing: "", motherRing: "", color: "雨点", loft: "种鸽棚", birthDate: "2022-03-12", vaccines: [], transfers: [], races: [], entries: [] },
    { ringNo: "CHN-2023-512", owner: "育种棚", fatherRing: "", motherRing: "", color: "红轮", loft: "种鸽棚", birthDate: "2023-02-20", vaccines: [], transfers: [], races: [], entries: [] }
  ]
};

// 兼容旧档：补齐出生日、批号、有效状态、召回与参赛登记等字段。
function migrate(raw) {
  const db = raw && typeof raw === "object" ? raw : {};
  db.seq = { vaccine: 1, recall: 1, entry: 1, ...(db.seq || {}) };
  db.recalls = Array.isArray(db.recalls) ? db.recalls : [];
  db.pigeons = Array.isArray(db.pigeons) ? db.pigeons : [];
  for (const pigeon of db.pigeons) {
    if (!isValidDateString(pigeon.birthDate)) pigeon.birthDate = pigeon.ringNo?.slice(4, 8) + "-01-01" || "2000-01-01";
    pigeon.vaccines = Array.isArray(pigeon.vaccines) ? pigeon.vaccines : [];
    pigeon.transfers = Array.isArray(pigeon.transfers) ? pigeon.transfers : [];
    pigeon.races = Array.isArray(pigeon.races) ? pigeon.races : [];
    pigeon.entries = Array.isArray(pigeon.entries) ? pigeon.entries : [];
    pigeon.vaccines.forEach((vaccine, index) => {
      if (!vaccine.id) vaccine.id = `V-mig-${pigeon.ringNo}-${index + 1}`;
      vaccine.disease ||= vaccine.name || "未标注疫病";
      vaccine.batchNo ||= "";
      vaccine.status ||= "valid";
      vaccine.createdAt ||= `${vaccine.date}T00:00:00.000Z`;
      vaccine.amended = Array.isArray(vaccine.amended) ? vaccine.amended : [];
    });
    pigeon.entries.forEach(entry => {
      entry.history = Array.isArray(entry.history) ? entry.history : [];
      entry.reasons = Array.isArray(entry.reasons) ? entry.reasons : [];
      entry.vaccineSnapshot ||= { vaccineId: "", disease: "", batchNo: "", date: "" };
      entry.firstResult ||= { status: entry.status, reasons: entry.reasons.slice() };
    });
  }
  db.recalls.forEach(recall => {
    recall.history = Array.isArray(recall.history) ? recall.history : [];
    recall.affectedRingNos = Array.isArray(recall.affectedRingNos) ? recall.affectedRingNos : [];
  });
  return db;
}

export class ArchiveError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new ArchiveError(code); };

export async function loadDb(dbPath = process.env.DATA_FILE || DEFAULT_DB_PATH) {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return migrate(JSON.parse(JSON.stringify(seed)));
  }
  return migrate(JSON.parse(await readFile(dbPath, "utf8")));
}

export async function saveDb(db, dbPath = process.env.DATA_FILE || DEFAULT_DB_PATH) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function findPigeon(db, ringNo) {
  return db.pigeons.find(item => item.ringNo === ringNo) || null;
}

export function relation(db, ringNo) {
  const pigeon = findPigeon(db, ringNo);
  if (!pigeon) return null;
  const father = findPigeon(db, pigeon.fatherRing) || null;
  const mother = findPigeon(db, pigeon.motherRing) || null;
  const children = db.pigeons.filter(item => item.fatherRing === ringNo || item.motherRing === ringNo);
  return { pigeon, father, mother, children };
}

export function createPigeon(db, input) {
  if (!input.ringNo || !input.owner || !input.color || !input.loft) fail("missing_fields");
  if (!isValidDateString(input.birthDate)) fail("invalid_birth_date");
  if (db.pigeons.some(item => item.ringNo === input.ringNo)) fail("ring_exists");
  const pigeon = {
    ringNo: input.ringNo, owner: input.owner, color: input.color, loft: input.loft, birthDate: input.birthDate,
    fatherRing: input.fatherRing || "", motherRing: input.motherRing || "",
    vaccines: [], transfers: [], races: [], entries: []
  };
  db.pigeons.unshift(pigeon);
  return pigeon;
}

export function addTransfer(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo) || fail("pigeon_not_found");
  const date = isValidDateString(input.date) ? input.date : new Date().toISOString().slice(0, 10);
  if (!input.to) fail("missing_to");
  pigeon.transfers.push({ date, from: pigeon.owner, to: input.to });
  pigeon.owner = input.to;
  return pigeon;
}

export function addRaceResult(db, ringNo, input) {
  const pigeon = findPigeon(db, ringNo) || fail("pigeon_not_found");
  pigeon.races.push({
    date: isValidDateString(input.date) ? input.date : new Date().toISOString().slice(0, 10),
    event: input.event || "未命名赛事",
    distance: Number(input.distance || 0),
    returnTime: input.returnTime || "",
    rank: Number(input.rank || 0)
  });
  return pigeon;
}

// 写入接种：接种日早于出生日或同一羽批号重复时整条不写；同疫病仅保留一条有效记录。
export function addVaccine(db, ringNo, input, at = new Date().toISOString()) {
  const pigeon = findPigeon(db, ringNo) || fail("pigeon_not_found");
  const date = input.date;
  const disease = (input.disease || "").trim();
  const batchNo = (input.batchNo || "").trim();
  if (!isValidDateString(date)) fail("invalid_vaccine_date");
  if (!disease) fail("missing_disease");
  if (!batchNo) fail("missing_batch");
  if (diffDays(pigeon.birthDate, date) < 0) fail("vaccine_before_birth");
  if (pigeon.vaccines.some(v => v.batchNo === batchNo)) fail("duplicate_batch");

  // 同一疫病只保留一条有效记录：新的有效，旧有效记录转只读历史。
  const previous = pigeon.vaccines.find(v => v.disease === disease && v.status === "valid");
  if (previous) previous.status = "superseded";

  const recall = findRecall(db, batchNo);
  const vaccine = {
    id: `V${db.seq.vaccine++}`,
    date, disease, batchNo,
    status: recall ? "recalled" : "valid",
    createdAt: at,
    amended: []
  };
  pigeon.vaccines.push(vaccine);
  // 补打后同步重算该鸽登记（如确认失效批号后补种新批）。
  recomputePigeon(db, pigeon, at);
  return { pigeon, vaccine };
}

// 更正接种日期/批号/处置结论：原记录只读保留更正痕迹，引用它的准入随后按新值重算。
export function amendVaccine(db, ringNo, vaccineId, patch, at = new Date().toISOString()) {
  const pigeon = findPigeon(db, ringNo) || fail("pigeon_not_found");
  const vaccine = pigeon.vaccines.find(v => v.id === vaccineId) || fail("vaccine_not_found");
  if (vaccine.status !== "valid") fail("vaccine_readonly");
  if (!["date", "batchNo"].some(key => key in patch)) fail("nothing_to_amend");

  const nextDate = "date" in patch ? patch.date : vaccine.date;
  if (!isValidDateString(nextDate)) fail("invalid_vaccine_date");
  if (diffDays(pigeon.birthDate, nextDate) < 0) fail("vaccine_before_birth");

  const nextBatch = "batchNo" in patch ? String(patch.batchNo || "").trim() : vaccine.batchNo;
  if (!nextBatch) fail("missing_batch");
  if (pigeon.vaccines.some(v => v.id !== vaccine.id && v.batchNo === nextBatch)) fail("duplicate_batch");

  vaccine.amended.push({
    at,
    from: { date: vaccine.date, batchNo: vaccine.batchNo, disposition: vaccine.status },
    to: { date: nextDate, batchNo: nextBatch }
  });
  vaccine.date = nextDate;
  vaccine.batchNo = nextBatch;
  vaccine.status = findRecall(db, nextBatch) ? "recalled" : "valid";

  // 同步引用快照并按新值重算。
  for (const entry of pigeon.entries || []) {
    if (entry.vaccineSnapshot.vaccineId === vaccine.id) {
      entry.vaccineSnapshot = snapshotOf(vaccine);
    }
  }
  recomputePigeon(db, pigeon, at);
  return { pigeon, vaccine };
}

// 批号召回：引用它的接种转只读，参赛登记立即失效并转待复核。
export function openRecall(db, input, at = new Date().toISOString()) {
  const batchNo = (input.batchNo || "").trim();
  if (!batchNo) fail("missing_batch");
  const existing = findRecall(db, batchNo);
  if (existing) return existing; // 重复召回沿用首次结果

  const reason = input.reason || "批次召回";
  const recall = {
    id: `R${db.seq.recall++}`,
    batchNo,
    reason,
    disposition: "open",
    conclusion: "",
    openedAt: at,
    resolvedAt: "",
    affectedRingNos: [],
    history: [{ at, action: "opened", reason, conclusion: "" }]
  };
  db.recalls.push(recall);

  for (const pigeon of db.pigeons) {
    let hit = false;
    for (const vaccine of pigeon.vaccines) {
      if (vaccine.batchNo !== batchNo) continue;
      hit = true;
      vaccine.status = "recalled"; // 旧记录只读
      for (const entry of pigeon.entries || []) {
        if (entry.vaccineSnapshot.batchNo === batchNo) entry.vaccineSnapshot = snapshotOf(vaccine);
      }
    }
    if (hit) {
      recall.affectedRingNos.push(pigeon.ringNo);
      recomputePigeon(db, pigeon, at);
    }
  }
  return recall;
}

// 召回处置结论：safe=该批判定合格；confirmed=确认失效，引用登记按缺失处理。
export function resolveRecall(db, batchNo, input, at = new Date().toISOString()) {
  const recall = findRecall(db, batchNo) || fail("recall_not_found");
  if (!["safe", "confirmed"].includes(input.conclusion)) fail("invalid_conclusion");
  recall.disposition = "closed";
  recall.conclusion = input.conclusion;
  recall.resolvedAt = at;
  recall.history.push({ at, action: "resolved", conclusion: input.conclusion, note: input.note || "" });
  recomputeByBatch(db, batchNo, at);
  return recall;
}

// 报名比赛：核对最新有效接种距比赛日 14–365 天；重复提交沿用首次结果。
export function registerEntry(db, ringNo, input, at = new Date().toISOString()) {
  const pigeon = findPigeon(db, ringNo) || fail("pigeon_not_found");
  if (!input.event) fail("missing_event");
  if (!isValidDateString(input.raceDate)) fail("invalid_race_date");

  const idempotencyKey = (input.idempotencyKey || "").trim();
  const duplicate = pigeon.entries.find(entry =>
    (idempotencyKey && entry.idempotencyKey === idempotencyKey)
    || (entry.event === input.event && entry.raceDate === input.raceDate));
  if (duplicate) return { pigeon, entry: duplicate, duplicate: true };

  const latest = latestEffectiveVaccine(db, pigeon);
  const entry = {
    id: `E${db.seq.entry++}`,
    event: input.event,
    raceDate: input.raceDate,
    distance: Number(input.distance || 0),
    idempotencyKey,
    createdAt: at,
    vaccineSnapshot: latest ? snapshotOf(latest) : { vaccineId: "", disease: "", batchNo: "", date: "" },
    status: "",
    reasons: [],
    history: [],
    firstResult: null
  };
  const result = evaluateEntry(db, pigeon, entry);
  entry.status = result.status;
  entry.reasons = result.reasons.slice();
  entry.firstResult = {
    at,
    status: result.status,
    reasons: result.reasons.slice(),
    vaccineSnapshot: { ...entry.vaccineSnapshot }
  };
  entry.history.push({ at, from: "", to: result.status, reasons: result.reasons.slice(), basisChanged: false });
  pigeon.entries.push(entry);
  return { pigeon, entry, duplicate: false };
}

export function trace(db, ringNo) {
  const rel = relation(db, ringNo);
  if (!rel) return null;
  const { pigeon, father, mother, children } = rel;
  const vaccines = pigeon.vaccines.map(v => ({
    ...v,
    recall: findRecall(db, v.batchNo) ? {
      disposition: findRecall(db, v.batchNo).disposition,
      conclusion: findRecall(db, v.batchNo).conclusion
    } : null
  }));
  const entries = pigeon.entries.map(entry => {
    const live = evaluateEntry(db, pigeon, entry);
    return {
      id: entry.id,
      event: entry.event,
      raceDate: entry.raceDate,
      status: live.status,
      reasons: live.reasons.slice(),
      vaccineSnapshot: { ...entry.vaccineSnapshot },
      firstResult: entry.firstResult,
      history: entry.history
    };
  });
  return { pigeon: { ...pigeon, vaccines, entries }, father, mother, children };
}
