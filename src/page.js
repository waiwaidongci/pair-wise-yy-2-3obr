// 工作台页面。供 request-entry.js 直接返回。
export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽血统环号登记站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --green:#2e7d52; --amber:#9a6b1f; --red:#9b3f35; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:26px; } main { display:grid; grid-template-columns:380px 1fr; gap:22px; padding:22px 28px; }
    form,.panel,.card,.small { background:#fff; border:1px solid var(--line); border-radius:8px; padding:16px; }
    h2 { margin:0 0 12px; font-size:18px; } h3 { margin:0; }
    label { display:block; margin:10px 0 5px; color:var(--muted); font-size:13px; } input,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:9px; font:inherit; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:9px 12px; font-weight:700; cursor:pointer; }
    button.ghost { background:#e7edf2; color:var(--ink); } button.warn { background:var(--red); } button.small-btn { padding:5px 8px; font-size:12px; }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:14px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
    .card { display:grid; gap:8px; } .meta { color:var(--muted); font-size:13px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:3px 8px; font-size:12px; }
    .ok { color:var(--green); border-color:var(--green); } .hold { color:var(--amber); border-color:var(--amber); } .bad { color:var(--red); border-color:var(--red); }
    .section { margin-top:14px; } .stack { display:grid; gap:10px; }
    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { border-bottom:1px solid var(--line); padding:7px 8px; text-align:left; vertical-align:top; }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    #toast { position:fixed; right:20px; bottom:20px; display:grid; gap:8px; z-index:10; }
    .toast { background:#1f2833; color:#fff; border-radius:6px; padding:10px 14px; font-size:13px; max-width:340px; }
    .toast.err { background:var(--red); }
    @media (max-width:980px){ header{display:block;padding:18px 16px;} main{grid-template-columns:1fr;padding:16px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>赛鸽血统环号登记站</h1><div class="meta">档案血统 · 疫苗批次召回 · 参赛准入（名额只计入准入）</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <div class="stack">
      <form id="pigeonForm">
        <h2>创建鸽只档案</h2>
        <div class="row">
          <div><label>足环号</label><input name="ringNo" required></div>
          <div><label>出生日</label><input name="birthDate" type="date" required></div>
        </div>
        <div class="row">
          <div><label>鸽主</label><input name="owner" required></div>
          <div><label>羽色</label><input name="color" required></div>
        </div>
        <div class="row">
          <div><label>父鸽足环号</label><input name="fatherRing"></div>
          <div><label>母鸽足环号</label><input name="motherRing"></div>
        </div>
        <label>出生棚号</label><input name="loft" required>
        <button>保存档案</button>
      </form>

      <form id="vaccineForm" class="panel">
        <h2>接种登记</h2>
        <div class="row">
          <div><label>足环号</label><input name="ringNo" required></div>
          <div><label>接种日</label><input name="date" type="date" required></div>
        </div>
        <div class="row">
          <div><label>疫病</label><input name="disease" placeholder="如 新城疫" required></div>
          <div><label>批号</label><input name="batchNo" placeholder="如 B-ND-2609" required></div>
        </div>
        <button>写入接种（同疫病变更）</button>
      </form>

      <form id="entryForm" class="panel">
        <h2>报名比赛</h2>
        <div class="row">
          <div><label>足环号</label><input name="ringNo" required></div>
          <div><label>比赛日</label><input name="raceDate" type="date" required></div>
        </div>
        <label>赛事名称</label><input name="event" placeholder="如 300公里联赛" required>
        <label>幂等键（可空，重复提交沿用首次结果）</label><input name="idempotencyKey" placeholder="同一报名单号">
        <button>核对准入并报名</button>
      </form>

      <form id="recallForm" class="panel">
        <h2>批次召回 / 处置</h2>
        <div class="row">
          <div><label>批号</label><input name="batchNo" required></div>
          <div><label>处置结论（仅处置时选）</label>
            <select name="conclusion"><option value="">仅召回，待处置</option><option value="safe">判定合格</option><option value="confirmed">确认失效</option></select>
          </div>
        </div>
        <label>召回原因 / 备注</label><input name="reason" placeholder="如 冷链中断">
        <div class="row">
          <button class="warn">提交</button>
          <button type="button" class="ghost" id="reloadData">重新拉取</button>
        </div>
      </form>
    </div>

    <section>
      <div class="toolbar"><input id="search" placeholder="输入足环号单羽追溯（接种/召回/准入）"><button id="searchBtn">追溯</button></div>
      <div class="panel" id="detail"><h2>单羽追溯</h2><p class="meta">输入足环号查看父母子代、接种只读状态、召回处置与准入历史。</p></div>
      <div class="section panel" id="entriesPanel"></div>
      <div class="section grid" id="cards"></div>
    </section>
  </main>
  <div id="toast"></div>

  <script>
    var pigeons = [], entries = [], recalls = [], occupancy = [];
    function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
    async function api(path, options) {
      var res = await fetch(path, options && options.body ? { method: options.method || "POST", body: options.body, headers: { "Content-Type": "application/json" } } : options);
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");
      return data;
    }
    function post(path, payload) { return api(path, { method: "POST", body: JSON.stringify(payload) }); }
    function toast(msg, isErr) {
      var box = document.querySelector("#toast");
      var el = document.createElement("div");
      el.className = "toast" + (isErr ? " err" : "");
      el.textContent = msg;
      box.appendChild(el);
      setTimeout(function () { el.remove(); }, 4200);
    }
    function statusPill(status, reasons) {
      var map = {
        admitted: ["准入", "ok"],
        denied: ["不准入", "bad"],
        pending_review: ["待复核", "hold"]
      };
      var m = map[status] || [status || "未报名", ""];
      return '<span class="pill ' + m[1] + '">' + m[0] + (reasons && reasons.length ? "：" + esc(reasons.join(",")) : "") + "</span>";
    }
    function vaccinePill(v) {
      var label = v.status;
      if (v.status === "valid") label = "有效";
      if (v.status === "superseded") label = "已变更(只读)";
      if (v.status === "recalled") label = "已召回(只读)";
      var cls = v.status === "valid" ? "ok" : (v.status === "recalled" ? "bad" : "hold");
      var tail = v.recall ? " / 召回:" + esc(v.recall.disposition + (v.recall.conclusion ? "-" + v.recall.conclusion : "")) : "";
      return '<span class="pill ' + cls + '">' + label + tail + "</span>";
    }
    async function load() {
      pigeons = await api("/api/pigeons");
      var entryData = await api("/api/entries");
      entries = entryData.entries; occupancy = entryData.occupancy;
      recalls = await api("/api/recalls");
      renderCards(); renderEntries();
    }
    function renderCards() {
      document.querySelector("#cards").innerHTML = pigeons.map(function (p) {
        return '<article class="card"><h3>' + esc(p.ringNo) + "</h3>"
          + '<span class="pill">' + esc(p.owner) + "</span>"
          + '<div class="meta">' + esc(p.color) + " · " + esc(p.loft) + " · 出生 " + esc(p.birthDate) + "</div>"
          + '<div>父：' + esc(p.fatherRing || "未登记") + "　母：" + esc(p.motherRing || "未登记") + "</div>"
          + '<div class="meta">转让：' + esc(p.transfers.map(function (t) { return t.from + "→" + t.to; }).join(" / ") || "暂无") + "</div>"
          + '<div class="meta">归巢：' + esc(p.races.map(function (r) { return r.event + " 第" + r.rank + "名"; }).join(" / ") || "暂无") + "</div>"
          + '<label>录入转让（新归属人）</label><div class="row"><input data-to="' + esc(p.ringNo) + '" placeholder="新归属人"><button data-transfer="' + esc(p.ringNo) + '">保存转让</button></div>'
          + '<label>归巢成绩（赛事/距离/名次）</label><div class="row"><input data-race="' + esc(p.ringNo) + '" placeholder="200公里/200/6"><button data-score="' + esc(p.ringNo) + '">保存成绩</button></div>'
          + "</article>";
      }).join("");
      document.querySelectorAll("[data-transfer]").forEach(function (btn) {
        btn.onclick = async function () {
          var ringNo = btn.dataset.transfer;
          var to = document.querySelector('[data-to="' + ringNo + '"]').value;
          try { await post("/api/pigeons/" + encodeURIComponent(ringNo) + "/transfers", { to: to }); await load(); toast("转让已保存"); }
          catch (e) { toast(e.message, true); }
        };
      });
      document.querySelectorAll("[data-score]").forEach(function (btn) {
        btn.onclick = async function () {
          var ringNo = btn.dataset.score;
          var raw = document.querySelector('[data-race="' + ringNo + '"]').value.split("/");
          try {
            await post("/api/pigeons/" + encodeURIComponent(ringNo) + "/races", { event: raw[0] || "未命名赛事", distance: Number(raw[1] || 0), rank: Number(raw[2] || 0) });
            await load(); toast("成绩已保存");
          } catch (e) { toast(e.message, true); }
        };
      });
    }
    function renderEntries() {
      var occ = occupancy.map(function (o) {
        return "<tr><td>" + esc(o.event) + "</td><td>" + esc(o.raceDate) + "</td><td>" + o.pigeons.length + " 羽</td><td>" + esc(o.pigeons.join("、")) + "</td></tr>";
      }).join("");
      var rows = entries.map(function (e) {
        var sameFirst = e.firstResult && e.firstResult.status === e.status && e.firstResult.reasons.join() === e.reasons.join();
        return "<tr><td>" + esc(e.ringNo) + "</td><td>" + esc(e.event) + "</td><td>" + esc(e.raceDate) + "</td>"
          + "<td>" + statusPill(e.status, e.reasons) + "</td>"
          + '<td class="meta">' + esc(e.vaccineSnapshot.disease + " " + e.vaccineSnapshot.date + " " + e.vaccineSnapshot.batchNo) + "</td>"
          + '<td class="meta">首次：' + (e.firstResult ? esc(e.firstResult.status) : "-") + (sameFirst ? "（一致）" : "（已重算）") + "<br>变动 " + e.history.length + " 次</td></tr>";
      }).join("");
      document.querySelector("#entriesPanel").innerHTML =
        "<h2>参赛登记与名额占用</h2>"
        + '<table><thead><tr><th>赛事</th><th>比赛日</th><th>占用名额</th><th>准入足环号</th></tr></thead><tbody>'
        + (occ || '<tr><td colspan="4" class="meta">暂无占用名额（过期/缺失/待复核不占用）</td></tr>') + "</tbody></table>"
        + '<div class="section"><table><thead><tr><th>足环号</th><th>赛事</th><th>比赛日</th><th>当前准入</th><th>依据接种</th><th>重算</th></tr></thead><tbody>'
        + (rows || '<tr><td colspan="6" class="meta">暂无参赛登记</td></tr>') + "</tbody></table></div>"
        + '<div class="meta section">召回批次：' + (recalls.map(function (r) { return esc(r.batchNo) + "(" + esc(r.disposition + (r.conclusion ? "/" + r.conclusion : "")) + ")"; }).join("、") || "暂无") + "</div>";
    }
    async function showTrace(ringNo) {
      var data = await api("/api/pigeons/" + encodeURIComponent(ringNo) + "/trace");
      var p = data.pigeon;
      var vax = p.vaccines.map(function (v) {
        var amend = '<button class="ghost small-btn" data-amend="' + esc(v.id) + '">更正</button>';
        if (v.status !== "valid") amend = '<span class="meta">只读</span>';
        return "<tr><td>" + esc(v.disease) + "</td><td>" + esc(v.date) + "</td><td>" + esc(v.batchNo) + "</td><td>" + vaccinePill(v)
          + '</td><td class="meta">' + (v.amended ? v.amended.length : 0) + " 次更正</td><td>" + amend + "</td></tr>";
      }).join("");
      var ent = p.entries.map(function (e) {
        var hist = (e.history || []).map(function (h) {
          return esc(h.at.slice(0, 16).replace("T", " ")) + " " + esc(h.from || "新建") + "→" + esc(h.to) + (h.reasons && h.reasons.length ? "(" + esc(h.reasons.join(",")) + ")" : "");
        }).join("<br>");
        return "<tr><td>" + esc(e.event) + "</td><td>" + esc(e.raceDate) + "</td><td>" + statusPill(e.status, e.reasons)
          + '</td><td class="meta">' + esc(e.vaccineSnapshot.disease + " " + e.vaccineSnapshot.date + " " + e.vaccineSnapshot.batchNo)
          + '</td><td class="meta">' + (hist || "无") + "</td></tr>";
      }).join("");
      document.querySelector("#detail").innerHTML =
        "<h2>" + esc(p.ringNo) + " 单羽追溯</h2>"
        + '<div class="meta">' + esc(p.owner) + " · " + esc(p.color) + " · 出生 " + esc(p.birthDate) + " · 父 " + esc(data.father ? data.father.ringNo : (p.fatherRing || "未登记")) + " · 母 " + esc(data.mother ? data.mother.ringNo : (p.motherRing || "未登记")) + " · 子代 " + esc(data.children.map(function (c) { return c.ringNo; }).join("、") || "暂无") + "</div>"
        + '<div class="section"><h3>接种记录（同疫病仅一条有效）</h3><table><thead><tr><th>疫病</th><th>接种日</th><th>批号</th><th>状态</th><th>更正</th><th></th></tr></thead><tbody>'
        + (vax || '<tr><td colspan="6" class="meta">暂无</td></tr>') + "</tbody></table></div>"
        + '<div class="section"><h3>参赛准入（窗口 14–365 天）</h3><table><thead><tr><th>赛事</th><th>比赛日</th><th>状态</th><th>依据</th><th>状态历史</th></tr></thead><tbody>'
        + (ent || '<tr><td colspan="5" class="meta">暂无</td></tr>') + "</tbody></table></div>"
        + '<div class="section small"><label>更正选中接种（日期 / 批号）</label><div class="row"><input id="amendDate" type="date"><input id="amendBatch" placeholder="新批号"></div><div style="margin-top:8px"><button id="amendBtn">提交更正并重算</button></div></div>';

      var amendId = "";
      document.querySelectorAll("[data-amend]").forEach(function (btn) {
        btn.onclick = function () {
          amendId = btn.dataset.amend;
          var v = p.vaccines.find(function (x) { return x.id === amendId; });
          document.querySelector("#amendDate").value = v.date;
          document.querySelector("#amendBatch").value = v.batchNo;
        };
      });
      var amendBtn = document.querySelector("#amendBtn");
      if (amendBtn) amendBtn.onclick = async function () {
        if (!amendId) return toast("请先点击某条接种的“更正”", true);
        var payload = {};
        if (document.querySelector("#amendDate").value) payload.date = document.querySelector("#amendDate").value;
        if (document.querySelector("#amendBatch").value) payload.batchNo = document.querySelector("#amendBatch").value;
        try {
          await api("/api/pigeons/" + encodeURIComponent(ringNo) + "/vaccines/" + encodeURIComponent(amendId) + "/amend", { method: "PATCH", body: JSON.stringify(payload) });
          await load(); await showTrace(ringNo); toast("已更正并按新值重算");
        } catch (e) { toast(e.message, true); }
      };
    }
    function formJson(form) {
      var out = {};
      new FormData(form).forEach(function (value, key) { out[key] = String(value).trim(); });
      return out;
    }
    document.querySelector("#pigeonForm").onsubmit = async function (ev) {
      ev.preventDefault();
      try { await post("/api/pigeons", formJson(ev.target)); ev.target.reset(); await load(); toast("档案已保存"); }
      catch (e) { toast(e.message, true); }
    };
    document.querySelector("#vaccineForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var data = formJson(ev.target);
      try { await post("/api/pigeons/" + encodeURIComponent(data.ringNo) + "/vaccines", { date: data.date, disease: data.disease, batchNo: data.batchNo }); await load(); toast("接种已写入"); }
      catch (e) { toast(e.message, true); }
    };
    document.querySelector("#entryForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var data = formJson(ev.target);
      try {
        var result = await post("/api/pigeons/" + encodeURIComponent(data.ringNo) + "/entries", { event: data.event, raceDate: data.raceDate, idempotencyKey: data.idempotencyKey });
        await load();
        toast((result.duplicate ? "重复提交沿用首次结果：" : "报名结果：") + result.entry.status + " " + (result.entry.reasons || []).join(","));
        showTrace(data.ringNo).catch(function () {});
      } catch (e) { toast(e.message, true); }
    };
    document.querySelector("#recallForm").onsubmit = async function (ev) {
      ev.preventDefault();
      var data = formJson(ev.target);
      try {
        if (data.conclusion) {
          await post("/api/recalls/" + encodeURIComponent(data.batchNo) + "/resolve", { conclusion: data.conclusion, note: data.reason });
          toast("处置结论已登记并按新值重算");
        } else {
          await post("/api/recalls", { batchNo: data.batchNo, reason: data.reason });
          toast("批次已召回：相关参赛登记立即转待复核，旧记录只读");
        }
        await load();
      } catch (e) { toast(e.message, true); }
    };
    document.querySelector("#searchBtn").onclick = function () {
      showTrace(document.querySelector("#search").value.trim()).catch(function (e) { toast(e.message, true); });
    };
    document.querySelector("#reload").onclick = load;
    document.querySelector("#reloadData").onclick = function (e) { e.preventDefault(); load(); };
    load();
  </script>
</body>
</html>`;
