// 端到端规则验证：对运行中的服务执行全流程，断言每条业务规则。
const BASE = process.env.BASE || "http://localhost:3030";
let pass = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { failures.push(name); console.log("  ✗ " + name + (extra ? " -> " + JSON.stringify(extra) : "")); }
}
async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const A = "CHN-TEST-A", B = "CHN-TEST-B";

// 1. 档案创建：出生日期必填
let r = await api("POST", "/api/pigeons", { ringNo: A, owner: "测试棚", loft: "L1", color: "灰" });
check("缺出生日期拒绝建档", r.status === 400 && r.json.error === "birth_date_invalid", r.json);
r = await api("POST", "/api/pigeons", { ringNo: A, owner: "测试棚", loft: "L1", color: "灰", birthDate: "2026-01-01" });
check("正常建档", r.status === 201);
r = await api("POST", "/api/pigeons", { ringNo: B, owner: "测试棚", loft: "L1", color: "白", birthDate: "2026-01-01" });
check("第二羽建档", r.status === 201);
r = await api("POST", "/api/pigeons", { ringNo: A, owner: "测试棚", loft: "L1", color: "灰", birthDate: "2026-01-01" });
check("重复足环号冲突", r.status === 409);

// 2. 接种：接种日早于出生日 -> 整条不写
r = await api("POST", `/api/pigeons/${A}/vaccines`, { name: "新城疫", date: "2025-12-01", batchNo: "B0" });
check("接种日早于出生日拒绝", r.status === 400 && r.json.error === "before_birth_date", r.json);

// 3. 合法接种
r = await api("POST", `/api/pigeons/${A}/vaccines`, { name: "新城疫", date: "2026-03-01", batchNo: "B1" });
check("合法接种写入", r.status === 201 && r.json.vaccine.batchNo === "B1");
const vid = r.json.vaccine.id;

// 4. 同疫病重复提交 -> 沿用首次结果，不产生第二条
r = await api("POST", `/api/pigeons/${A}/vaccines`, { name: "新城疫", date: "2026-05-01", batchNo: "B9" });
check("同疫病重复提交沿用首次结果", r.status === 200 && r.json.duplicate === true && r.json.vaccine.id === vid);
r = await api("GET", `/api/pigeons/${A}/relation`);
check("每羽同一疫病只有一条记录", r.json.vaccines.filter(v => v.name === "新城疫").length === 1);
check("失败记录未落盘（无 B0 记录）", !r.json.vaccines.some(v => v.batchNo === "B0"));

// 5. 重复批号（换疫病也不行）
r = await api("POST", `/api/pigeons/${A}/vaccines`, { name: "禽流感", date: "2026-03-05", batchNo: "B1" });
check("重复批号整条不写", r.status === 400 && r.json.error === "duplicate_batch", r.json);
r = await api("POST", `/api/pigeons/${A}/vaccines`, { name: "禽流感", date: "2026-03-05", batchNo: "B2" });
check("不同疫病不同批号可写", r.status === 201);
const fluId = r.json.vaccine.id;

// 6. 参赛准入窗口
r = await api("POST", "/api/entries", { ringNo: A, event: "近距赛", raceDate: "2026-03-08", disease: "新城疫" }); // 7 天
check("接种不足14天不准", r.status === 201 && r.json.entry.status === "denied" && r.json.entry.reason === "vaccine_too_recent", r.json.entry);
const nearId = r.json.entry.id;
r = await api("POST", "/api/entries", { ringNo: A, event: "近距赛", raceDate: "2026-03-08", disease: "新城疫" });
check("参赛重复提交沿用首次结果", r.status === 200 && r.json.duplicate === true && r.json.entry.id === nearId);
r = await api("POST", "/api/entries", { ringNo: A, event: "远期赛", raceDate: "2027-04-01", disease: "新城疫" }); // 396 天
check("接种超过365天过期不准", r.json.entry.status === "denied" && r.json.entry.reason === "vaccine_expired", r.json.entry);
r = await api("POST", "/api/entries", { ringNo: B, event: "无苗赛", raceDate: "2026-09-01", disease: "新城疫" });
check("缺失接种记录不准", r.json.entry.status === "denied" && r.json.entry.reason === "vaccine_missing", r.json.entry);
r = await api("POST", "/api/entries", { ringNo: A, event: "秋季联赛", raceDate: "2026-09-01", disease: "新城疫" }); // 184 天
check("窗口内准入并占名额", r.json.entry.status === "qualified" && r.json.entry.age === 184, r.json.entry);
const entryId = r.json.entry.id;
r = await api("GET", "/api/entries");
check("名额统计只计准入", r.json.slotsUsed["秋季联赛@2026-09-01"] === 1 && r.json.entries.length === 4, r.json.slotsUsed);

// 7. 批次召回：立即失效转待复核，旧记录只读，名额释放
r = await api("POST", "/api/recalls", { batchNo: "B1", reason: "效价不合格" });
check("发起召回", r.status === 201);
r = await api("POST", "/api/recalls", { batchNo: "B1", reason: "重复" });
check("召回重复提交沿用首次结果", r.json.duplicate === true);
r = await api("GET", "/api/entries");
const recalled = r.json.entries.find(e => e.id === entryId);
check("引用批号登记立即转待复核", recalled.status === "pending_review" && recalled.reason === "batch_recall_open", recalled);
check("待复核不占用名额", r.json.slotsUsed["秋季联赛@2026-09-01"] === undefined, r.json.slotsUsed);
r = await api("GET", `/api/pigeons/${A}/relation`);
const lockedV = r.json.vaccines.find(v => v.id === vid);
check("召回后旧接种记录只读标记", lockedV.readOnly === true && lockedV.recallOpen === true, lockedV);
const traceEntry = r.json.entries.find(e => e.id === entryId);
check("单羽追溯状态与列表一致", traceEntry.status === "pending_review");
check("状态史记录首次判定与失效转复核", traceEntry.statusHistory.length >= 2, traceEntry.statusHistory);

r = await api("PATCH", `/api/pigeons/${A}/vaccines/${vid}`, { date: "2026-03-02" });
check("召回中旧记录拒绝更正(409)", r.status === 409 && r.json.error === "vaccine_readonly_after_recall", r.json);

// 8. 处置结论：复核有效 -> 回到窗口规则重新准入
r = await api("PATCH", "/api/recalls/B1", { conclusion: "复核有效" });
check("处置完结", r.status === 200 && r.json.recall.closedAt);
r = await api("GET", "/api/entries");
let e = r.json.entries.find(x => x.id === entryId);
check("复核有效后原准入按窗口重算为准入", e.status === "qualified", e);
check("名额恢复占用", r.json.slotsUsed["秋季联赛@2026-09-01"] === 1);

// 9. 更正处置结论 -> 按新值重算为失效
r = await api("PATCH", "/api/recalls/B1", { conclusion: "作废" });
check("结论可更正", r.status === 200);
r = await api("GET", "/api/entries");
e = r.json.entries.find(x => x.id === entryId);
check("结论作废后准入失效", e.status === "denied" && e.reason === "batch_recall_voided", e);
check("失效不占名额", r.json.slotsUsed["秋季联赛@2026-09-01"] === undefined);
r = await api("PATCH", "/api/recalls/B1", { conclusion: "乱写" });
check("非法结论拒绝", r.status === 400);

// 10. 更正接种日期 -> 原准入按新值重算（使用未召回的 B2 禽流感）
r = await api("POST", "/api/entries", { ringNo: A, event: "流感赛", raceDate: "2026-09-01", disease: "禽流感" }); // 距 03-05 180 天
check("流感赛先准入", r.json.entry.status === "qualified", r.json.entry);
const fluEntryId = r.json.entry.id;
r = await api("PATCH", `/api/pigeons/${A}/vaccines/${fluId}`, { date: "2026-08-25" }); // 距比赛 7 天
check("更正接种日期成功并留痕", r.status === 200 && r.json.vaccine.corrections.length === 1, r.json);
r = await api("GET", "/api/entries");
e = r.json.entries.find(x => x.id === fluEntryId);
check("更正日期后准入重算为不足14天", e.status === "denied" && e.reason === "vaccine_too_recent", e);
r = await api("PATCH", `/api/pigeons/${A}/vaccines/${fluId}`, { date: "2025-12-31" });
check("更正为早于出生日拒绝且不覆盖原值", r.status === 400, r.json);
r = await api("PATCH", `/api/pigeons/${A}/vaccines/${fluId}`, { date: "2026-03-05" });
check("改回后恢复准入", r.status === 200);
r = await api("PATCH", `/api/pigeons/${A}/vaccines/${fluId}`, { batchNo: "B1" });
check("更正为重复/已召回批号拒绝", r.status === 400, r.json);
r = await api("PATCH", `/api/pigeons/${A}/vaccines/${fluId}`, { batchNo: "B3" });
check("更正批号成功", r.status === 200 && r.json.vaccine.batchNo === "B3");
r = await api("GET", "/api/entries");
e = r.json.entries.find(x => x.id === fluEntryId);
check("批号更正后仍按窗口重算为准入", e.status === "qualified" && e.vaccine.batchNo === "B3", e);

// 11. 召回新批号 B3 -> 流感赛转待复核
r = await api("POST", "/api/recalls", { batchNo: "B3" });
check("发起第二批号召回", r.status === 201);
r = await api("GET", "/api/entries");
e = r.json.entries.find(x => x.id === fluEntryId);
check("批号召回后立即转待复核", e.status === "pending_review" && e.reason === "batch_recall_open", e);
r = await api("PATCH", "/api/recalls/B3", { conclusion: "复核有效" });
check("B3 处置完结", r.status === 200);

// 12. 列表/追溯/刷新一致性：三处状态逐一比对
r = await api("GET", "/api/entries");
const listMap = Object.fromEntries(r.json.entries.map(x => [x.id, x.status]));
for (const ring of [A, B]) {
  const t = await api("GET", `/api/pigeons/${ring}/relation`);
  for (const te of t.json.entries) check(`追溯状态一致 ${te.id}`, listMap[te.id] === te.status);
}
r = await api("GET", "/api/entries");
const afterRefresh = Object.fromEntries(r.json.entries.map(x => [x.id, x.status]));
check("刷新后状态不变", Object.keys(listMap).every(id => listMap[id] === afterRefresh[id]));

// 13. 召回台账含受影响登记
r = await api("GET", "/api/recalls");
check("召回台账列出两批及受影响登记数", r.json.length === 2 && r.json.find(x => x.batchNo === "B1").affectedEntries.length === 3, r.json);

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
