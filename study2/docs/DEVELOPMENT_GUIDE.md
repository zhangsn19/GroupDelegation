# Study 2 Development Guide

## 位置

当前应开发和运行的项目目录：

```text
E:\group-deception-study2
```

Codex 受沙盒限制时可能先在工作区副本 `C:\Users\zxy\Documents\CHI deception\group-deception-study2` 修改，再同步到 E 盘。以 E 盘运行结果为准。

## 架构

```text
group-deception-study2/
  config/
    common.js             # 条件、成员、状态顺序
    measures.js           # 通用背景题和人口学题
    peer-records.js       # Study 2 固定同事收入申报模板
    study2-income.js      # Study 2 规则、理解检查、后测、努力任务参数
  public/
    index.html            # 参与者入口
    admin.html            # 管理端导出
    css/style.css         # 群聊、私密面板、任务和问卷样式
    js/app.js             # 前端状态机和 API 调用
    js/chat.js            # 只读群聊与同伴记录呈现
    js/comprehension.js   # 理解检查组件
    js/study2-income.js   # 努力任务和收入申报 UI
    js/survey.js          # 问卷渲染与收集
  server/
    index.js              # Express API、状态流转、收入计算、服务端计时
    store.js              # JSON 读写和轻量 session lock
    export.js             # JSON/CSV 导出
    smoke-test.js         # API 合约烟测
  data/
    sessions/.gitkeep     # 正式/本地 session JSON 存放处
    synced/.gitkeep       # 预留同步目录
```

## 关键代码注解

- `config/common.js`
  - `CONDITIONS` 固定为 `hidden/honest/dishonest`。
  - `STATUS_ORDER` 决定服务端允许的流程顺序。
  - `MEMBERS` 决定左侧成员栏和群聊头像。

- `config/peer-records.js`
  - `PEER_INCOME_TEMPLATE` 是唯一同伴记录模板。
  - `buildIncomePeerRecords(condition)` 在创建 session 时生成并保存 snapshot。

- `server/index.js`
  - `DEBUG_LINKS` 只有显式字符串 `true` 才开启。
  - `createSession()` 负责条件分配和 Prolific ID 复入。
  - `prepareCurrentEffortRound()` 写入服务器开始时间和截止时间。
  - `/effort/round` 忽略前端传入的耗时，服务器自行计算 `duration_ms`。
  - `/income-report` 只接受 0 到实际收入之间的整数 cents，并计算扣除和保留奖励。

- `server/store.js`
  - `DATA_DIR` 由环境变量控制，默认 `./data/sessions`。
  - `updateSession()` 对同一 session ID 串行化写入，降低重复提交风险。

- `public/js/app.js`
  - `routeFromStatus()` 负责刷新/复入恢复。
  - `startEffortCountdown()` 根据服务器 deadline 倒计时，超时自动提交。
  - 收入滑条和数字输入都转换为 cents，再提交给服务端。

## API

- `POST /api/session`
- `POST /api/session/:id/consent`
- `POST /api/session/:id/baseline`
- `POST /api/session/:id/rules-viewed`
- `POST /api/session/:id/comprehension`
- `POST /api/session/:id/effort/start`
- `POST /api/session/:id/effort/round`
- `POST /api/session/:id/income-viewed`
- `GET /api/session/:id/peer-records`
- `POST /api/session/:id/peer-records-viewed`
- `POST /api/session/:id/income-report`
- `POST /api/session/:id/post-survey`
- `POST /api/session/:id/experience`
- `POST /api/session/:id/demographics`
- `POST /api/session/:id/complete`

管理端导出：

- `GET /api/admin/export/json`
- `GET /api/admin/export/participants.csv`
- `GET /api/admin/export/study2_effort_rounds.csv`
- `GET /api/admin/export/study2_income_reports.csv`

## 本地检查

```powershell
cd E:\group-deception-study2
npm install
npm run smoke
npm run dev
```

浏览器打开 `http://localhost:3001/?condition=hidden`、`honest`、`dishonest` 分别检查三种条件。正式模式把 `DEBUG_LINKS=false` 后，URL 条件应被忽略。

## 修改原则

- 不擅自修改 factor 或流程。
- 不新增 AI 建议、实时聊天、团队共同收益或同伴监督。
- 收入字段新增时同时更新 JSON、CSV、README 和 smoke test。
- 任何状态顺序变化必须同步改 `STATUS_ORDER`、前端恢复逻辑和 smoke test。
