# 赛鸽血统环号登记站

运行：

```bash
npm start
```

访问 `http://localhost:3024`（端口可用 `PORT` 覆盖，库路径可用 `PIGEON_DB` 覆盖）。
支持档案、血统查询、转让、归巢成绩，以及疫苗批号召回与参赛准入。

## 三个业务文件

| 文件 | 职责 |
| --- | --- |
| `src/archive.js` | 档案存储：整库 JSON 读写、种子数据、旧档案迁移、ID 生成 |
| `src/eligibility.js` | 准入判定（纯函数）：接种写入校验、召回状态、14–365 天窗口、全量重算 |
| `src/routes.js` | 请求入口：HTTP 路由，编排存储与判定；写库后统一重算再落盘 |

`server.js` 仅保留 HTTP 引导，页面在 `src/page.js`。

## 业务规则

- 每羽同一疫病只保留一条有效接种记录；批号与本羽既有记录重复，或接种日早于
  出生日期时，整条记录不写库。
- 批号被召回后：引用它的参赛登记立即失效并转为「待复核」，不再占用名额；
  旧接种记录只读（更正返回 `vaccine_readonly_after_recall`）。
- 召回处置未完结前，新接种也不得引用该批号。
- 报名比赛按对应疫病的最新有效接种核对：接种日距比赛日须在 14–365 天之间；
  过期、缺失记录、召回处置未完结均不得占用名额。
- 处置结论为「复核有效」时回到窗口规则重算；更正为「作废」则准入失效。
- 更正接种日期、批号或处置结论后，原准入一律按新值全量重算；重复提交
  （同疫病再次接种、同赛事重复报名、同批号重复召回）沿用首次结果。
- 列表、单羽追溯接口与刷新后的状态来自同一份重算结果，保持一致。

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/api/pigeons` | 档案列表 / 建档（需 `birthDate`） |
| GET | `/api/pigeons/:ring/relation` | 单羽追溯：血统、接种（含召回只读态）、参赛准入与状态史 |
| POST | `/api/pigeons/:ring/vaccines` | 录入接种；失败整条不写，同疫病重复返回首次结果 |
| PATCH | `/api/pigeons/:ring/vaccines/:id` | 更正接种日期/批号并留痕；召回后只读 |
| POST | `/api/recalls` | 发起批次召回 |
| GET/PATCH | `/api/recalls/:batchNo` | 召回台账 / 更正处置结论（`复核有效`、`作废`） |
| GET/POST | `/api/entries` | 参赛登记列表与名额占用 / 报名 |

## 测试

```bash
PORT=3030 PIGEON_DB=/tmp/pigeon-test.json node server.js &
BASE=http://localhost:3030 npm test
```

`test-e2e.mjs` 覆盖 50 条规则断言（写入拦截、窗口边界、召回转待复核、
结论更正、重算一致性等）。
