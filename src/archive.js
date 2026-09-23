// 业务文件一：档案存储
// 负责赛鸽档案、接种记录、批次召回、参赛登记的持久化。
// 所有写入均整库落盘；业务判定不在此处，由 eligibility.js 完成。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.PIGEON_DB || join(__dirname, "..", "data", "pigeons.json");

const seed = {
  pigeons: [
    {
      ringNo: "CHN-2026-001",
      owner: "北岸棚",
      fatherRing: "CHN-2022-188",
      motherRing: "CHN-2023-512",
      color: "灰",
      loft: "北岸A棚",
      birthDate: "2026-01-10",
      vaccines: [
        {
          id: "V-1001",
          name: "新城疫",
          date: "2026-04-01",
          batchNo: "NC260301",
          createdAt: "2026-04-02T09:00:00.000Z",
          corrections: []
        }
      ],
      transfers: [{ date: "2026-04-15", from: "育种棚", to: "北岸棚" }],
      races: [{ date: "2026-06-01", event: "120公里训放", distance: 120, returnTime: "10:42", rank: 18 }]
    },
    { ringNo: "CHN-2022-188", owner: "育种棚", fatherRing: "", motherRing: "", color: "雨点", loft: "种鸽棚", birthDate: "2022-03-05", vaccines: [], transfers: [], races: [] },
    { ringNo: "CHN-2023-512", owner: "育种棚", fatherRing: "", motherRing: "", color: "红轮", loft: "种鸽棚", birthDate: "2023-02-18", vaccines: [], transfers: [], races: [] }
  ],
  recalls: [],
  entries: []
};

// 旧档案迁移：补齐新字段；旧的无批号接种记录保留但视为无批号。
function migrate(db) {
  db.pigeons ||= [];
  db.recalls ||= [];
  db.entries ||= [];
  let seq = 1000;
  for (const pigeon of db.pigeons) {
    pigeon.birthDate ||= "";
    pigeon.vaccines ||= [];
    pigeon.transfers ||= [];
    pigeon.races ||= [];
    for (const vaccine of pigeon.vaccines) {
      if (!vaccine.id) vaccine.id = `V-${++seq}`;
      vaccine.batchNo ||= "";
      vaccine.corrections ||= [];
    }
  }
  return db;
}

export async function loadDb() {
  if (!existsSync(dbPath)) {
    await mkdir(dirname(dbPath), { recursive: true });
    await writeFile(dbPath, JSON.stringify(seed, null, 2));
    return structuredClone(seed);
  }
  return migrate(JSON.parse(await readFile(dbPath, "utf8")));
}

export async function saveDb(db) {
  await writeFile(dbPath, JSON.stringify(db, null, 2));
}

export function findPigeon(db, ringNo) {
  return db.pigeons.find(item => item.ringNo === ringNo) || null;
}

// 召回批次表（批号唯一），档案中批号引用均指向此处。
export function findRecall(db, batchNo) {
  return db.recalls.find(item => item.batchNo === batchNo) || null;
}

export function nextVaccineId(db) {
  let max = 1000;
  for (const pigeon of db.pigeons) {
    for (const vaccine of pigeon.vaccines) {
      const n = Number(String(vaccine.id).replace(/^V-/, ""));
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return `V-${max + 1}`;
}

export function nextEntryId(db) {
  let max = 0;
  for (const entry of db.entries) {
    const n = Number(String(entry.id).replace(/^E-/, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return `E-${String(max + 1).padStart(4, "0")}`;
}
