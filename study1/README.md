# Group Deception Study 1

本项目实现 Group Deception 实验的 Study 1：参与者在模拟同事群体中完成 10 轮骰子上报任务。每轮开始时，系统先显示所有成员共同看到的骰子结果，再依次显示四位同事的本轮提交，最后由参与者在私密提交卡中选择自己的上报数字。

在正式招募前，还需要完成 pilot 检查、伦理文本确认、支付流程、剔除规则和数据持久化方案确认。

## 1. 研究设计

Study 1 的唯一自变量是 `Peer Reporting Behavior Information`，在数据中保存为 `condition`。

- `hidden`：每轮四位同事均先提交，但具体数字不可见。
- `honest`：每轮四位同事均按本轮共同骰子结果如实提交。
- `dishonest`：每轮四位同事均提交高于本轮共同骰子结果的数字。

三种条件保持一致的部分：

- 每轮参与者和四位同事看到同一个骰子结果；
- 同事姓名、顺序、消息数量、布局和呈现节奏一致；
- 参与者的最终提交只在私密卡中完成；
- 同事看不到参与者的最终提交；
- 同事提交不会改变参与者的个人奖励；
- 群聊 AI 只负责执行提交，不建议、不评价、不劝阻、不修改数字。

## 2. 参与者流程

```text
知情同意
-> 4 题 AI 使用背景前测
-> 模拟同事群体与共享群聊 AI 介绍
-> 任务规则
-> 理解检查
-> 10 轮骰子任务：
   -> 公布本轮共同骰子结果
   -> 张明提交
   -> 李华提交
   -> 王芳提交
   -> 陈思提交
   -> 参与者在私密锁定卡中选择 1-6
   -> 参与者二次确认
   -> 群聊 AI 中性确认
   -> 显示本轮个人奖励和累计奖励
-> 任务后问卷
-> 人口学题
-> 事后说明
```

## 3. 骰子和同伴脚本

Study 1 使用固定的 10 轮共同骰子序列，配置在 `config/study1-dice.js`。

实现规则：

- 真实骰子结果只使用 1 到 5；
- 真实骰子结果不出现 6；
- 三种条件使用同一套骰子序列；
- 每轮只有一个共同骰子结果；
- 每位同事的 `trueValue` 都等于该轮参与者看到的 `true_die_value`；
- hidden 条件保存共同骰子值，但不向参与者显示具体同事提交数字；
- honest 条件满足 `reportedValue === trueValue`；
- dishonest 条件满足 `reportedValue > trueValue`；
- 同伴脚本在 session 创建时生成并保存。

## 4. 本地运行

安装依赖：

```powershell
npm install
```

创建环境变量文件：

```powershell
copy .env.example .env
```

启动服务：

```powershell
npm run dev
```

访问页面：

- 参与者入口：`http://localhost:3000/?study=study1`
- hidden 调试：`http://localhost:3000/?study=study1&condition=hidden`
- honest 调试：`http://localhost:3000/?study=study1&condition=honest`
- dishonest 调试：`http://localhost:3000/?study=study1&condition=dishonest`
- 管理端：`http://localhost:3000/admin.html`

只有 `DEBUG_LINKS=true` 时，URL 中的 `condition` 参数才会生效。`DEBUG_LINKS=false` 时，服务器会忽略 URL condition，并由服务端分配条件。

## 5. 数据保存

session 数据保存位置由 `DATA_DIR` 控制。默认配置为：

```text
DATA_DIR=./data/sessions
```

每位参与者对应一个 JSON 文件。主要内容包括：

- study 和 condition；
- Prolific ID；
- 当前状态和各阶段时间戳；
- 前测回答；
- 理解检查记录；
- 固定骰子序列；
- 每轮同伴脚本；
- 参与者每轮提交；
- 后测回答；
- 人口学回答；
- event log。

自动测试使用单独的临时测试数据目录，不写入正式 session 目录。

## 6. 管理端导出

管理端接口需要 `ADMIN_TOKEN`。

可用导出：

- `GET /api/admin/export/json`
- `GET /api/admin/export/participants.csv`
- `GET /api/admin/export/study1_dice_rounds.csv`

`study1_dice_rounds.csv` 为长表，一行代表一名参与者的一轮骰子任务，包含真实骰子值、参与者提交值、个人奖励、累计奖励、决策时长，以及该轮展示的同伴记录。

## 7. 项目结构

```text
group-deception-v2/
  .env.example                 环境变量模板
  package.json                 Node 项目配置和 npm scripts
  package-lock.json            依赖版本锁定文件
  README.md                    项目说明
  REQUIREMENTS.md              Study 1 设计需求
  PILOT_CHECKLIST.md           pilot 前检查清单
  render.yaml                  Render 部署配置

  config/
    common.js                  版本号、study、condition、状态顺序、成员列表
    measures.js                前测、Study 1 后测、人口学题
    peer-records.js            每轮同伴提交脚本生成逻辑
    study1-dice.js             Study 1 规则、理解检查、固定骰子序列、奖励参数
    study2-income.js           Study 2 预留配置，Study 1 流程不调用

  data/
    sessions/                  session JSON 默认保存目录
    synced/                    可选的数据同步目录

  docs/
    DEVELOPMENT_GUIDE.md       开发说明、API 摘要和修改原则

  public/
    index.html                 参与者页面外壳
    admin.html                 管理端导出页面
    css/style.css              群聊、成员栏、卡片、私密提交、问卷和骰子样式
    js/app.js                  前端流程控制和 API 调用
    js/chat.js                 只读群聊、成员栏、逐条消息和自动滚动
    js/comprehension.js        理解检查渲染和反馈
    js/study1-dice.js          骰子显示、私密提交卡和奖励反馈
    js/study2-income.js        Study 2 预留前端文件
    js/survey.js               问卷渲染和回答收集

  scripts/
    local-receiver.js          可选的数据接收测试服务
    tunnel.js                  可选的本地 tunnel 辅助脚本

  server/
    index.js                   Express 服务、API、流程状态机、条件分配和校验
    store.js                   JSON 文件读写和同 session 串行写入
    export.js                  JSON/CSV 导出逻辑
    smoke-test.js              Study 1 自动测试
```

## 8. API 摘要

参与者流程：

- `POST /api/session`
- `GET /api/session/:id`
- `POST /api/session/:id/consent`
- `POST /api/session/:id/baseline`
- `POST /api/session/:id/rules-viewed`
- `POST /api/session/:id/comprehension`
- `POST /api/session/:id/dice/start`
- `GET /api/session/:id/dice/current`
- `POST /api/session/:id/dice/round`
- `POST /api/session/:id/post-survey`
- `POST /api/session/:id/demographics`
- `POST /api/session/:id/complete`

管理端：

- `GET /api/admin/summary`
- `GET /api/admin/export/json`
- `GET /api/admin/export/participants.csv`
- `GET /api/admin/export/study1_dice_rounds.csv`

## 9. 自动测试

运行：

```powershell
npm run smoke
```

测试覆盖：

- 完整 Study 1 流程；
- 每轮同事 `trueValue` 等于参与者本轮共同骰子值；
- honest 条件同事提交等于共同骰子值；
- dishonest 条件同事提交高于共同骰子值；
- 10 轮真实骰子值均不为 6；
- 同一轮重复提交不会生成第二条记录；
- 刷新当前轮不会重新生成同伴脚本或重置决策开始时间；
- `DEBUG_LINKS=false` 时 URL condition 无效；
- 后测题目与最终题库一致；
- 已完成 Prolific ID 不会获得新 session 或新 condition。

## 10. 部署说明

项目包含 `render.yaml`，可作为 Render 部署配置参考。

正式环境建议：

- Build Command：`npm install`
- Start Command：`npm start`
- Node.js 20 或以上
- `DEBUG_LINKS=false`
- 设置正式 `ADMIN_TOKEN`
- 使用经过验证的持久化数据保存方案

正式收数不能只依赖临时文件系统保存数据。

## 11. 尚需确认

正式招募前还需研究团队确认：

- 每点奖励；
- Prolific 基础报酬和 completion code；
- 样本量和 power analysis；
- 正式剔除规则；
- 伦理审批版本的 consent/debrief 文本；
- 数据保存、备份和保留流程。
