// 请求入口：HTTP 路由与页面。业务规则在 admission.js，落盘规则在 archive.js。

import http from "node:http";
import {
  addRaceResult, addTransfer, addVaccine, amendVaccine, ArchiveError, createPigeon,
  loadDb, openRecall, registerEntry, relation, resolveRecall,
  saveDb, trace
} from "./archive.js";
import { entryView, eventOccupancy, listEntries } from "./admission.js";
import { page } from "./page.js";

const port = Number(process.env.PORT || 3024);

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ArchiveError("invalid_json");
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

const STATUS_CODE = {
  pigeon_not_found: 404, vaccine_not_found: 404, recall_not_found: 404,
  ring_exists: 409,
  invalid_json: 400, missing_fields: 400, missing_to: 400,
  invalid_birth_date: 400, invalid_vaccine_date: 400, invalid_race_date: 400,
  missing_disease: 400, missing_batch: 400, missing_event: 400,
  vaccine_before_birth: 422, duplicate_batch: 422, vaccine_readonly: 409,
  nothing_to_amend: 400, invalid_conclusion: 400
};

function decode(segment) {
  try { return decodeURIComponent(segment); } catch { return segment; }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;
  const db = await loadDb();
  const now = new Date().toISOString();

  if (method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(page);
  }

  if (method === "GET" && path === "/api/pigeons") return sendJson(res, 200, db.pigeons);

  if (method === "POST" && path === "/api/pigeons") {
    const pigeon = createPigeon(db, await readBody(req));
    await saveDb(db);
    return sendJson(res, 201, pigeon);
  }

  if (method === "GET" && path === "/api/recalls") {
    return sendJson(res, 200, db.recalls);
  }

  if (method === "POST" && path === "/api/recalls") {
    const recall = openRecall(db, await readBody(req), now);
    await saveDb(db);
    return sendJson(res, 201, recall);
  }

  if (method === "GET" && path === "/api/entries") {
    return sendJson(res, 200, { entries: listEntries(db), occupancy: eventOccupancy(db) });
  }

  const relationMatch = path.match(/^\/api\/pigeons\/(.+)\/relation$/);
  if (relationMatch && method === "GET") {
    const data = relation(db, decode(relationMatch[1]));
    return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
  }

  const traceMatch = path.match(/^\/api\/pigeons\/(.+)\/trace$/);
  if (traceMatch && method === "GET") {
    const data = trace(db, decode(traceMatch[1]));
    return data ? sendJson(res, 200, data) : sendJson(res, 404, { error: "pigeon_not_found" });
  }

  const recallMatch = path.match(/^\/api\/recalls\/(.+)\/resolve$/);
  if (recallMatch && method === "POST") {
    const recall = resolveRecall(db, decode(recallMatch[1]), await readBody(req), now);
    await saveDb(db);
    return sendJson(res, 200, recall);
  }

  const amendMatch = path.match(/^\/api\/pigeons\/(.+)\/vaccines\/([^/]+)\/amend$/);
  if (amendMatch && method === "PATCH") {
    const ringNo = decode(amendMatch[1]);
    const vaccineId = decode(amendMatch[2]);
    const { pigeon } = amendVaccine(db, ringNo, vaccineId, await readBody(req), now);
    await saveDb(db);
    return sendJson(res, 200, trace(db, ringNo));
  }

  const actionMatch = path.match(/^\/api\/pigeons\/(.+)\/(transfers|races|vaccines|entries)$/);
  if (actionMatch && method === "POST") {
    const ringNo = decode(actionMatch[1]);
    const input = await readBody(req);
    let result;
    switch (actionMatch[2]) {
      case "transfers": result = addTransfer(db, ringNo, input); break;
      case "races": result = addRaceResult(db, ringNo, input); break;
      case "vaccines": result = addVaccine(db, ringNo, input, now); break;
      case "entries": {
        const registered = registerEntry(db, ringNo, input, now);
        await saveDb(db);
        const pigeon = db.pigeons.find(item => item.ringNo === ringNo);
        return sendJson(res, registered.duplicate ? 200 : 201, {
          duplicate: registered.duplicate,
          notice: registered.duplicate ? "重复提交沿用首次结果" : "",
          entry: entryView(db, pigeon, registered.entry)
        });
      }
      default: break;
    }
    await saveDb(db);
    return sendJson(res, 200, result);
  }

  return sendJson(res, 404, { error: "not_found" });
}

export function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (error) {
      if (error instanceof ArchiveError) {
        return sendJson(res, STATUS_CODE[error.code] || 400, { error: error.code });
      }
      sendJson(res, 500, { error: error.message });
    }
  });
  server.listen(port, () => console.log(`Racing pigeon registry app listening on http://localhost:${port}`));
  return server;
}
