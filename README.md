# 赛鸽血统环号登记站

运行：

```bash
npm start
```

访问 `http://localhost:3024`。

## 业务文件拆分

| 文件 | 职责 |
| --- | --- |
| `src/request-entry.js` | 请求入口：HTTP 路由、参数解析、页面返回 |
| `src/admission.js` | 准入判定：14–365 天窗口、召回有效性、重算、名额占用 |
| `src/archive.js` | 档案存储：落盘/旧档迁移、鸽只、接种、召回、参赛登记写入规则 |
| `src/page.js` | 工作台页面 |
| `server.js` | 仅引导启动 |

## 规则

- 每羽同一疫病只保留一条**有效**接种：再次写入时旧记录转为只读（`superseded`）。
- 接种日早于出生日、同一羽批号重复：整条不写（422，不落任何记录）。
- 批号被召回：引用该批号的接种转只读，参赛登记立即失效转**待复核**；处置完结前不占用名额。
- 召回处置：`safe`（判定合格，恢复有效）/ `confirmed`（确认失效，按缺失重算）。
- 报名比赛核对最新有效接种距比赛日 **14–365 天**；过期、缺失、召回未完结均不得占用名额。
- 更正接种日期/批号会保留只读更正痕迹，并使原准入按新值重算。
- 重复提交（相同幂等键或同足环+赛事+比赛日）沿用首次结果。
- 列表、单羽追溯、刷新均现场判定，状态一致。

## 主要接口

- `POST /api/pigeons` 创建档案（含 `birthDate`）
- `POST /api/pigeons/:ring/vaccines` 接种登记
- `PATCH /api/pigeons/:ring/vaccines/:id/amend` 更正接种
- `POST /api/recalls` 批号召回；`POST /api/recalls/:batch/resolve` 处置结论
- `POST /api/pigeons/:ring/entries` 报名（`event`、`raceDate`、可选 `idempotencyKey`）
- `GET /api/entries` 全部参赛登记与名额占用
- `GET /api/pigeons/:ring/trace` 单羽追溯

旧接口（转让、归巢成绩、血统关系）保持不变。
