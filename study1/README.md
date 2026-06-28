# Group Deception Study 1

本项目实现 Study 1：一个基于共享群聊 AI 的骰子上报实验。参与者进入一个模拟同事群体，在 10 轮任务中看到本轮共同骰子结果和四位同事的本轮提交，然后通过私密提交卡选择自己的上报数字。

本项目用于开发、演示和 pilot 测试。正式招募前，还需要确认伦理文本、支付流程、剔除规则、样本量和数据保存方案。

## 1. 实验设计

Study 1 的唯一实验因素是 `Peer Reporting Behavior Information`，在程序中保存为 `condition`。

三种条件：

- `hidden`：每轮四位同事均先提交，但具体数字不可见。
- `honest`：每轮四位同事均按本轮共同骰子结果如实提交。
- `dishonest`：每轮四位同事均提交高于本轮共同骰子结果的数字。

三种条件保持一致的部分：

- 每轮参与者和四位同事看到同一个骰子结果。
- 四位同事姓名、顺序、消息数量、布局和呈现节奏一致。
- 参与者最终提交只在私密卡中完成。
- 其他同事看不到参与者的最终提交。
- 其他同事提交不会改变参与者个人奖励。
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

## 3. 本地运行

在项目根目录运行：

```powershell
copy .env.example .env
npm install
npm run dev
```

如果已经安装过依赖，之后只需要：

```powershell
npm run dev
```

启动成功后，打开下面的链接。

### 参与者入口

- [参与者入口](http://localhost:3000/?study=study1)

### 三种条件调试链接

- [hidden 条件](http://localhost:3000/?study=study1&condition=hidden)
- [honest 条件](http://localhost:3000/?study=study1&condition=honest)
- [dishonest 条件](http://localhost:3000/?study=study1&condition=dishonest)

### 管理端

- [管理端](http://localhost:3000/admin.html)

注意：只有 `.env` 中设置 `DEBUG_LINKS=true` 时，URL 里的 `condition` 才会生效。正式部署时应设置为 `DEBUG_LINKS=false`。

## 4. 数据保存在哪里

数据保存位置由 `.env` 中的 `DATA_DIR` 决定。

默认配置：

```text
DATA_DIR=./data/sessions
```

也就是说，默认情况下，session JSON 会保存在项目目录下：

```text
data/sessions/
```

每位参与者对应一个 JSON 文件。文件中会保存：

- session ID
- Prolific ID
- study
- condition
- 当前完成状态
- 各阶段时间戳
- 前测回答
- 理解检查记录
- 固定骰子序列
- 每轮同事提交脚本
- 参与者每轮提交
- 每轮奖励和累计奖励
- 决策时间
- 后测回答
- 人口学回答
- event log

自动测试会使用单独的测试目录，不会写入正式 session 目录。

## 5. 管理端导出

管理端需要 `ADMIN_TOKEN`。

导出接口：

- `GET /api/admin/export/json`
- `GET /api/admin/export/participants.csv`
- `GET /api/admin/export/study1_dice_rounds.csv`

导出表说明：

- `json`：完整原始 session 数据。
- `participants.csv`：一名参与者一行，适合做宽表分析。
- `study1_dice_rounds.csv`：一名参与者的一轮任务一行，包含真实骰子、参与者提交、奖励、决策时间和该轮同伴记录。

## 6. 项目结构

```text
group-deception-v2/
  .env.example
  package.json
  package-lock.json
  README.md
  REQUIREMENTS.md
  PILOT_CHECKLIST.md
  render.yaml

  config/
    common.js
    measures.js
    peer-records.js
    study1-dice.js
    study2-income.js

  data/
    sessions/
    synced/

  docs/
    DEVELOPMENT_GUIDE.md

  public/
    index.html
    admin.html
    css/
      style.css
    js/
      app.js
      chat.js
      comprehension.js
      study1-dice.js
      study2-income.js
      survey.js

  scripts/
    local-receiver.js
    tunnel.js

  server/
    index.js
    store.js
    export.js
    smoke-test.js
```

## 7. 主要文件说明

### 配置文件

- `config/common.js`：版本号、study 列表、condition 列表、状态顺序、成员列表。
- `config/measures.js`：前测题、Study 1 后测题、人口学题。
- `config/peer-records.js`：根据 condition 和共同骰子序列生成每轮同伴提交脚本。
- `config/study1-dice.js`：Study 1 规则、理解检查、固定骰子序列和奖励参数。
- `config/study2-income.js`：Study 2 预留配置，Study 1 当前流程不调用。

### 前端文件

- `public/index.html`：参与者页面外壳。
- `public/admin.html`：管理端导出页面。
- `public/css/style.css`：页面样式，包括成员栏、群聊消息、卡片、私密提交面板、问卷和骰子。
- `public/js/app.js`：前端主流程，负责页面切换、API 调用、状态恢复和骰子轮次展示。
- `public/js/chat.js`：只读群聊、左侧成员栏、逐条消息和自动滚动。
- `public/js/comprehension.js`：理解检查题渲染和错误反馈。
- `public/js/study1-dice.js`：骰子显示、私密提交卡和奖励反馈。
- `public/js/survey.js`：问卷渲染和回答收集。
- `public/js/study2-income.js`：Study 2 预留前端文件。

### 服务端文件

- `server/index.js`：Express 服务入口，包含 API、流程状态机、条件分配、提交校验和导出路由。
- `server/store.js`：JSON 文件读写，并对同一个 session 的写入做串行保护。
- `server/export.js`：管理端 JSON 和 CSV 导出。
- `server/smoke-test.js`：自动测试脚本。

### 文档和部署

- `REQUIREMENTS.md`：Study 1 设计需求。
- `PILOT_CHECKLIST.md`：pilot 前检查清单。
- `docs/DEVELOPMENT_GUIDE.md`：开发说明、API 摘要和修改原则。
- `render.yaml`：Render 部署配置参考。
- `scripts/local-receiver.js`：可选的数据接收测试服务。
- `scripts/tunnel.js`：可选的本地 tunnel 辅助脚本。

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

- 完整 Study 1 流程可以跑通。
- 每轮同事 `trueValue` 等于参与者本轮共同骰子值。
- honest 条件同事提交等于共同骰子值。
- dishonest 条件同事提交高于共同骰子值。
- 10 轮真实骰子值均不为 6。
- 同一轮重复提交不会生成第二条记录。
- 刷新当前轮不会重新生成同伴脚本或重置决策开始时间。
- `DEBUG_LINKS=false` 时 URL condition 无效。
- 后测题目与最终题库一致。
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

正式招募前还需要确认：

- 每点奖励。
- Prolific 基础报酬和 completion code。
- 样本量和 power analysis。
- 正式剔除规则。
- 伦理审批版本的 consent/debrief 文本。
- 数据保存、备份和保留流程。
