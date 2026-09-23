// 页面模块：登记站操作界面（档案 / 接种与批号 / 批次召回 / 参赛准入 / 单羽追溯）
export const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>赛鸽血统环号登记站</title>
  <style>
    :root { --bg:#eff2f5; --panel:#fff; --ink:#1f2833; --muted:#697786; --line:#d3dce4; --accent:#315f83; --green:#2e7d4f; --orange:#b57319; --red:#9b3f35; }
    * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:Arial,"PingFang SC",sans-serif; }
    header { padding:22px 28px; background:#fff; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:24px; } h2 { margin:0 0 12px; font-size:17px; } h3 { margin:0; font-size:15px; }
    main { display:grid; grid-template-columns:400px 1fr; gap:18px; padding:18px 28px; align-items:start; }
    form,.panel,.card { background:#fff; border:1px solid var(--line); border-radius:8px; padding:14px; margin-bottom:14px; }
    label { display:block; margin:8px 0 4px; color:var(--muted); font-size:12px; }
    input,select { width:100%; border:1px solid var(--line); border-radius:6px; padding:8px; font:inherit; }
    button { border:0; border-radius:6px; background:var(--accent); color:#fff; padding:8px 11px; font-weight:700; cursor:pointer; }
    button.mini { padding:5px 8px; font-size:12px; } button.ghost { background:#697786; } button.warn { background:var(--red); } button.ok { background:var(--green); }
    .row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    .toolbar { display:grid; grid-template-columns:1fr auto; gap:10px; margin-bottom:12px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:10px; }
    .card { display:grid; gap:6px; margin:0; }
    .meta { color:var(--muted); font-size:12px; }
    .pill { display:inline-block; border:1px solid var(--line); border-radius:999px; padding:2px 8px; font-size:12px; }
    .pill.qualified { background:#e7f4ec; color:var(--green); border-color:#b7dcc5; }
    .pill.pending_review { background:#fbf1e0; color:var(--orange); border-color:#ecd6ac; }
    .pill.denied { background:#f8e8e6; color:var(--red); border-color:#e2bbb6; }
    table { width:100%; border-collapse:collapse; font-size:13px; } th,td { text-align:left; border-bottom:1px solid var(--line); padding:7px 6px; vertical-align:top; }
    .vaccine { border:1px solid var(--line); border-radius:8px; padding:10px; margin-top:8px; background:#f8fafb; }
    .vaccine.locked { background:#fdf3f2; }
    .hist { font-size:12px; color:var(--muted); margin:4px 0 0; padding-left:16px; }
    .msg { font-size:12px; margin-top:8px; min-height:16px; } .msg.err { color:var(--red); } .msg.done { color:var(--green); }
    @media (max-width:960px){ header{display:block;padding:16px;} main{grid-template-columns:1fr;padding:14px;} }
  </style>
</head>
<body>
  <header>
    <div><h1>赛鸽血统环号登记站</h1><div class="meta">档案 · 接种批号 · 批次召回 · 参赛准入（窗口 14–365 天）</div></div>
    <button id="reload">刷新</button>
  </header>
  <main>
    <div>
      <form id="pigeonForm">
        <h2>创建鸽只档案</h2>
        <div class="row"><div><label>足环号</label><input name="ringNo" required></div><div><label>出生日期</label><input name="birthDate" type="date" required></div></div>
        <div class="row"><div><label>鸽主</label><input name="owner" required></div><div><label>出生棚号</label><input name="loft" required></div></div>
        <div class="row"><div><label>父鸽足环号</label><input name="fatherRing"></div><div><label>母鸽足环号</label><input name="motherRing"></div></div>
        <label>羽色</label><input name="color" required>
        <div class="msg" data-msg="pigeonForm"></div>
        <button>保存档案</button>
      </form>

      <form id="vaccineForm">
        <h2>录入接种（同一疫病只保留一条）</h2>
        <div class="row"><div><label>足环号</label><input name="ringNo" required></div><div><label>疫病</label><input name="name" value="新城疫" required list="diseaseList"></div></div>
        <datalist id="diseaseList"><option value="新城疫"><option value="禽流感"><option value="腺病毒"></datalist>
        <div class="row"><div><label>接种日期</label><input name="date" type="date" required></div><div><label>疫苗批号</label><input name="batchNo" placeholder="如 NC260301"></div></div>
        <div class="msg" data-msg="vaccineForm"></div>
        <button>保存接种</button>
      </form>

      <form id="recallForm">
        <h2>发起疫苗批次召回</h2>
        <div class="row"><div><label>召回批号</label><input name="batchNo" required></div><div><label>经办人</label><input name="createdBy" value="登记站"></div></div>
        <label>召回原因</label><input name="reason" placeholder="如 效价抽检不合格">
        <div class="msg" data-msg="recallForm"></div>
        <button class="warn">发起召回（引用登记立即转待复核）</button>
      </form>

      <form id="entryForm">
        <h2>报名比赛</h2>
        <div class="row"><div><label>足环号</label><input name="ringNo" required></div><div><label>核对疫病</label><input name="disease" value="新城疫"></div></div>
        <div class="row"><div><label>赛事名称</label><input name="event" placeholder="如 300公里联赛" required></div><div><label>比赛日期</label><input name="raceDate" type="date" required></div></div>
        <div class="msg" data-msg="entryForm"></div>
        <button class="ok">提交报名</button>
      </form>
    </div>

    <div>
      <div class="panel">
        <div class="toolbar"><input id="search" placeholder="输入足环号做单羽追溯"><button id="searchBtn">追溯查询</button></div>
        <div id="detail"><div class="meta">输入足环号查看档案、接种批号（含召回只读状态）、参赛准入及重算历史。</div></div>
      </div>

      <div class="panel">
        <h2>参赛登记与名额占用</h2>
        <div class="meta" id="slots"></div>
        <table>
          <thead><tr><th>赛事 / 日期</th><th>足环号</th><th>疫病窗口</th><th>状态</th><th>依据</th></tr></thead>
          <tbody id="entries"></tbody>
        </table>
      </div>

      <div class="panel">
        <h2>召回批次台账</h2>
        <div id="recalls" class="grid"></div>
      </div>

      <div class="panel">
        <h2>鸽只档案</h2>
        <div id="cards" class="grid"></div>
      </div>
    </div>
  </main>

  <script>
    var state = { pigeons: [], entries: [], recalls: [] };
    function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
    function api(path, options) {
      var opts = options && options.body ? { method: options.method || "POST", body: options.body, headers: { "Content-Type": "application/json" } } : options;
      return fetch(path, opts).then(function (res) {
        return res.json().then(function (data) { if (!res.ok) throw new Error(data.error || "请求失败"); return data; });
      });
    }
    function statusPill(s) {
      var text = { qualified: "准入·占名额", pending_review: "待复核·不占名额", denied: "不准·不占名额" }[s] || s;
      return '<span class="pill ' + s + '">' + text + "</span>";
    }
    function setMsg(form, text, ok) {
      var el = document.querySelector('[data-msg="' + form + '"]');
      el.textContent = text || "";
      el.className = "msg " + (text ? (ok ? "done" : "err") : "");
    }
    function bindForm(id, url, build, label) {
      document.querySelector("#" + id).onsubmit = function (ev) {
        ev.preventDefault();
        setMsg(id, "");
        api(url, { body: JSON.stringify(build(this)) })
          .then(function (data) { setMsg(id, (data.duplicate ? "重复提交，沿用首次结果；" : "") + label + "成功", true); this.reset(); loadAll(); }.bind(this))
          .catch(function (e) { setMsg(id, "失败：" + e.message); });
      };
    }

    function renderEntries() {
      var tbody = state.entries.map(function (e) {
        var basis = e.vaccine
          ? esc(e.vaccine.date) + " · " + esc(e.vaccine.batchNo || "无批号") + (e.age != null ? "（间隔 " + e.age + " 天）" : "")
          : "无有效记录";
        return "<tr><td>" + esc(e.event) + "<br><span class='meta'>" + esc(e.raceDate) + "</span></td><td>" + esc(e.ringNo) +
          "</td><td>" + esc(e.disease) + "</td><td>" + statusPill(e.status) +
          "<div class='meta'>" + esc(e.reasonText) + "</div></td><td>" + basis + "</td></tr>";
      }).join("");
      document.querySelector("#entries").innerHTML = tbody || "<tr><td colspan='5' class='meta'>暂无参赛登记</td></tr>";
      var slotText = Object.keys(state.slotsUsed || {}).map(function (k) { return esc(k) + "：占用 " + state.slotsUsed[k] + " 个名额"; });
      document.querySelector("#slots").textContent = slotText.length ? slotText.join("　｜　") : "当前没有准入占用名额";
    }

    function renderRecalls() {
      var html = state.recalls.map(function (r) {
        var status = r.closedAt ? '<span class="pill qualified">已完结：' + esc(r.conclusion) + "</span>" : '<span class="pill pending_review">处置未完结</span>';
        var affected = (r.affectedEntries || []).length;
        var buttons = '<div><button class="mini ok" data-conclusion="复核有效" data-batch="' + esc(r.batchNo) + '">结论：复核有效</button> ' +
          '<button class="mini warn" data-conclusion="作废" data-batch="' + esc(r.batchNo) + '">结论：作废</button></div>';
        return '<div class="card"><h3>' + esc(r.batchNo) + "</h3>" + status +
          '<div class="meta">' + esc(r.reason || "—") + " · 影响登记 " + affected + " 条</div>" +
          (r.closedAt ? '<div class="meta">更正结论将按新值重算</div>' + buttons : buttons) + "</div>";
      }).join("");
      document.querySelector("#recalls").innerHTML = html || "<div class='meta'>暂无召回批次</div>";
      document.querySelectorAll("[data-conclusion]").forEach(function (btn) {
        btn.onclick = function () {
          api("/api/recalls/" + encodeURIComponent(btn.dataset.batch), { method: "PATCH", body: JSON.stringify({ conclusion: btn.dataset.conclusion }) })
            .then(loadAll).catch(function (e) { alert(e.message); });
        };
      });
    }

    function renderCards() {
      document.querySelector("#cards").innerHTML = state.pigeons.map(function (p) {
        var rec = p.vaccines.map(function (v) {
          var tag = v.recallOpen ? "（召回处置中·只读）" : (v.recall ? "（召回已完结：" + esc(v.recall.conclusion || "") + "）" : "");
          return esc(v.name) + " " + esc(v.date) + " " + esc(v.batchNo || "无批号") + tag;
        }).join("<br>") || '<span class="meta">暂无接种</span>';
        return '<article class="card"><h3>' + esc(p.ringNo) + '</h3><span class="pill">' + esc(p.owner) + "</span>" +
          '<div class="meta">' + esc(p.color) + " · 出生 " + esc(p.birthDate) + " · " + esc(p.loft) + "</div>" +
          "<div><b>接种</b><br>" + rec + "</div>" +
          '<button class="mini ghost" data-trace="' + esc(p.ringNo) + '">单羽追溯</button></article>';
      }).join("");
      document.querySelectorAll("[data-trace]").forEach(function (btn) {
        btn.onclick = function () { document.querySelector("#search").value = btn.dataset.trace; trace(); };
      });
    }

    function renderTrace(data) {
      var p = data.pigeon;
      var vaccines = data.vaccines.map(function (v) {
        var lock = v.readOnly ? " locked" : "";
        var tag = v.recallOpen ? '<span class="pill pending_review">召回处置中·只读</span>'
          : v.recall ? '<span class="pill ' + (v.recall.conclusion === "作废" ? "denied" : "qualified") + '">召回已完结：' + esc(v.recall.conclusion || "") + "</span>"
          : '<span class="pill qualified">有效</span>';
        var patch = v.readOnly ? "" :
          '<div class="row"><div><label>更正接种日期</label><input type="date" value="' + esc(v.date) + '" data-vdate="' + esc(v.id) + '"></div>' +
          '<div><label>更正批号</label><input value="' + esc(v.batchNo) + '" data-vbatch="' + esc(v.id) + '"></div></div>' +
          '<button class="mini" data-correct="' + esc(v.id) + '">更正并重算准入</button>';
        var corrections = v.corrections.map(function (c) {
          return "<li class='meta'>" + esc(c.at.slice(0, 16).replace("T", " ")) + "：" + esc(c.from.date) + "/" + esc(c.from.batchNo || "无") + " → " + esc(c.to.date) + "/" + esc(c.to.batchNo || "无") + "</li>";
        }).join("");
        return '<div class="vaccine' + lock + '"><b>' + esc(v.name) + "</b> " + tag +
          '<div class="meta">接种日 ' + esc(v.date) + " · 批号 " + esc(v.batchNo || "无批号") + " · 记录号 " + esc(v.id) + "</div>" +
          (corrections ? '<ul class="hist">' + corrections + "</ul>" : "") + patch + "</div>";
      }).join("") || "<div class='meta'>暂无接种记录</div>";

      var entries = data.entries.map(function (e) {
        var hist = (e.statusHistory || []).map(function (h) {
          return "<li>" + esc(h.at.slice(0, 16).replace("T", " ")) + " " + esc(h.status) + "：" + esc(h.reasonText || h.reason) + "（" + esc(h.reasonDetail || "") + "）</li>";
        }).join("");
        return '<div class="vaccine"><b>' + esc(e.event) + "</b>（" + esc(e.raceDate) + "） " + statusPill(e.status) +
          '<div class="meta">' + esc(e.reasonText) + (e.age != null ? " · 间隔 " + e.age + " 天" : "") + "</div>" +
          '<ul class="hist">' + hist + "</ul></div>";
      }).join("") || "<div class='meta'>暂无参赛登记</div>";

      document.querySelector("#detail").innerHTML =
        "<h2>" + esc(p.ringNo) + " 单羽追溯</h2>" +
        '<div class="meta">' + esc(p.owner) + " · " + esc(p.color) + " · 出生 " + esc(p.birthDate) + " · " + esc(p.loft) + "</div>" +
        '<div class="meta">父：' + esc(data.father?.ringNo || p.fatherRing || "未登记") + "　母：" + esc(data.mother?.ringNo || p.motherRing || "未登记") +
        "　子代：" + esc((data.children || []).map(function (c) { return c.ringNo; }).join("、") || "暂无") + "</div>" +
        "<h3 style='margin-top:10px'>接种记录</h3>" + vaccines +
        "<h3 style='margin-top:10px'>参赛准入</h3>" + entries;

      document.querySelectorAll("[data-correct]").forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.dataset.correct;
          var date = document.querySelector('[data-vdate="' + id + '"]').value;
          var batch = document.querySelector('[data-vbatch="' + id + '"]').value;
          api("/api/pigeons/" + encodeURIComponent(p.ringNo) + "/vaccines/" + encodeURIComponent(id),
            { method: "PATCH", body: JSON.stringify({ date: date, batchNo: batch }) })
            .then(loadAll).then(trace).catch(function (e) { alert(e.message); });
        };
      });
    }

    function trace() {
      var ringNo = document.querySelector("#search").value.trim();
      if (!ringNo) return;
      api("/api/pigeons/" + encodeURIComponent(ringNo) + "/relation").then(renderTrace).catch(function (e) {
        document.querySelector("#detail").innerHTML = '<div class="meta">未找到档案：' + esc(e.message) + "</div>";
      });
    }

    function loadAll() {
      return Promise.all([
        api("/api/pigeons"),
        api("/api/entries"),
        api("/api/recalls")
      ]).then(function (res) {
        state.pigeons = res[0];
        state.entries = res[1].entries;
        state.slotsUsed = res[1].slotsUsed;
        state.recalls = res[2];
        renderEntries(); renderRecalls(); renderCards();
        var ringNo = document.querySelector("#search").value.trim();
        if (ringNo) api("/api/pigeons/" + encodeURIComponent(ringNo) + "/relation").then(renderTrace).catch(function () {});
      });
    }

    bindForm("pigeonForm", "/api/pigeons", function (f) {
      return {
        ringNo: f.ringNo.value.trim(), owner: f.owner.value.trim(), loft: f.loft.value.trim(),
        color: f.color.value.trim(), birthDate: f.birthDate.value,
        fatherRing: f.fatherRing.value.trim(), motherRing: f.motherRing.value.trim()
      };
    }, "档案");
    bindForm("recallForm", "/api/recalls", function (f) {
      return { batchNo: f.batchNo.value.trim(), reason: f.reason.value.trim(), createdBy: f.createdBy.value.trim() };
    }, "召回");
    bindForm("entryForm", "/api/entries", function (f) {
      return { ringNo: f.ringNo.value.trim(), event: f.event.value.trim(), raceDate: f.raceDate.value, disease: f.disease.value.trim() };
    }, "报名");

    // 接种提交需要足环号拼路径，单独绑定
    document.querySelector("#vaccineForm").onsubmit = function (ev) {
      ev.preventDefault();
      setMsg("vaccineForm", "");
      var f = this;
      var body = { name: f.name.value.trim(), date: f.date.value, batchNo: f.batchNo.value.trim() };
      api("/api/pigeons/" + encodeURIComponent(f.ringNo.value.trim()) + "/vaccines", { body: JSON.stringify(body) })
        .then(function (data) {
          setMsg("vaccineForm", data.duplicate ? "该羽此疫病已有记录，沿用首次结果" : "接种已写入（校验失败整条不写）", true);
          f.date.value = ""; f.batchNo.value = ""; loadAll();
        })
        .catch(function (e) {
          var map = { before_birth_date: "接种日早于出生日，整条不写", duplicate_batch: "批号与本羽既有记录重复，整条不写", batch_recall_open: "批号召回处置未完结，不得引用" };
          setMsg("vaccineForm", map[e.message] || ("失败：" + e.message));
        });
    };

    document.querySelector("#searchBtn").onclick = trace;
    document.querySelector("#reload").onclick = loadAll;
    loadAll();
  </script>
</body>
</html>`;
