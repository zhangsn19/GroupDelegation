# Group Deception Study 2

这是 `group-deception-study2` 的独立开发沙盒。它只实现“收入申报”实验，不作为正式招募系统使用，直到 pilot checklist、数据保存和部署持久化都验证通过。

当前本地项目位置：

```text
E:\group-deception-study2
```

## 1. 实验在研究什么

Study 2 关注的问题是：在共享群聊 AI 代为提交个人收入申报的情境中，参与者看到其他同事此前的收入申报行为后，是否会改变自己随后私密提交的收入申报。

唯一自变量是同事此前收入申报信息：

- `hidden`：知道同事此前完成了收入申报，但看不到具体实际收入或申报金额。
- `honest`：看到四位同事此前均如实申报，实际收入等于申报收入。
- `dishonest`：看到四位同事此前均低报，申报收入低于实际收入。

三种条件中，成员数量、姓名、界面布局、AI 角色、参与者个人收入规则都保持一致。条件差异只出现在“同事此前收入申报记录”这一步。

## 2. 完整参与者流程

1. 进入网站，点击开始。
2. 阅读并同意知情同意。
3. 回答 AI 使用背景题。
4. 进入模拟同事群体和只读群聊界面。
5. 阅读收入申报任务规则。
6. 完成理解检查。
7. 完成 4 轮奇偶数分类努力任务。
8. 系统展示个人实际收入。
9. 系统展示四位同事此前收入申报记录。
10. 参与者在私密面板中选择自己的申报收入。
11. 群聊 AI 按参与者选择完成提交。
12. 完成任务后问卷。
13. 完成收入申报经验题。
14. 完成人口学题。
15. 阅读事后说明并完成实验。

收入逻辑：

- 努力任务产生 `actual_income_cents`。
- 参与者提交 `reported_income_cents`，范围必须是 0 到实际收入。
- 系统计算 `deduction_cents = round(deductionRate * reported_income_cents)`。
- 系统计算 `retained_reward_cents = actual_income_cents - deduction_cents`。
- 所有金额内部都按整数 cents 保存，界面显示为元。

## 3. 本地运行

首次运行：

```powershell
cd E:\group-deception-study2
copy .env.example .env
npm install
npm run dev
```

平时已经装过依赖后，直接运行：

```powershell
cd E:\group-deception-study2
npm run dev
```

打开网站：

- 参与者入口：http://localhost:3001/
- hidden 调试：http://localhost:3001/?condition=hidden
- honest 调试：http://localhost:3001/?condition=honest
- dishonest 调试：http://localhost:3001/?condition=dishonest
- 管理端：http://localhost:3001/admin.html

注意：只有 `.env` 中 `DEBUG_LINKS=true` 时，URL 里的 `condition` 才会生效。正式部署必须设为 `false`。

## 4. 数据收到哪里去了

默认数据目录由 `.env` 的 `DATA_DIR` 决定：

```text
DATA_DIR=./data/sessions
```

在当前本地项目里，真实参与者或浏览器调试产生的数据会保存到：

```text
E:\group-deception-study2\data\sessions
```

保存方式：

- 每个 session 一个 `.json` 文件。
- 文件名通常类似 `s2_xxxxxxxxxxxxxxxxxx.json`。
- JSON 里包含条件、状态时间戳、努力任务材料、收入申报、问卷、人口学和事件日志。

烟测数据不写入正式目录，而是写入：

```text
E:\group-deception-study2\data\test-sessions
```

这个目录可以随时删除。真实 session 数据不要提交到 Git，也不要打包给别人。

管理端导出需要 `ADMIN_TOKEN`：

- `/api/admin/export/json`：导出完整 JSON。
- `/api/admin/export/participants.csv`：一人一行的宽表。
- `/api/admin/export/study2_effort_rounds.csv`：努力任务轮次长表。
- `/api/admin/export/study2_income_reports.csv`：最终收入申报表。

## 5. 项目结构和每个文件作用

```text
group-deception-study2/
  .env.example                 # 环境变量模板；复制成 .env 后本地运行使用
  .gitignore                   # Git 忽略规则；排除 node_modules、.env、真实 session 数据等
  package.json                 # Node 项目说明；定义 npm run dev / start / smoke
  package-lock.json            # npm 依赖锁定文件；保证安装到一致版本
  README.md                    # 当前说明文档
  REQUIREMENTS.md              # Study 2 研究需求基线；说明哪些设计不能擅自改
  PILOT_CHECKLIST.md           # pilot 前检查清单
  render.yaml                  # Render 部署配置草案

  config/
    common.js                  # 全局配置：版本号、三种条件、状态顺序、成员列表
    measures.js                # 通用量表：AI 使用背景题、人口学题等
    peer-records.js            # Study 2 固定同事收入申报模板；按条件生成同伴记录
    study2-income.js           # Study 2 规则、理解检查、后测、努力任务参数
    study1-dice.js             # 旧骰子任务兼容文件；当前 Study 2 流程不调用，后续可清理

  data/
    sessions/
      .gitkeep                 # 保留空目录；真实 session JSON 会写到这里但不提交
    synced/
      .gitkeep                 # 预留同步目录；local receiver 可写入这里
    test-sessions/             # smoke test 临时数据目录；运行测试时生成，不提交

  docs/
    DEVELOPMENT_GUIDE.md       # 开发维护文档；写架构、API、修改原则和检查方式

  public/
    index.html                 # 参与者页面 HTML 外壳
    admin.html                 # 管理端页面；输入 token 后查看汇总和下载导出
    css/
      style.css                # 全站样式：群聊、成员栏、私密面板、问卷、努力任务等
    js/
      app.js                   # 前端主状态机；负责流程跳转、API 调用、断点恢复
      chat.js                  # 只读群聊组件；负责成员栏、群聊消息、同伴记录展示
      comprehension.js         # 理解检查组件；渲染题目、收集答案、失败反馈
      survey.js                # 问卷组件；渲染 likert/select/text/number 并收集回答
      study2-income.js         # Study 2 前端任务组件；努力任务、实际收入、申报收入、确认页
      study1-dice.js           # 旧骰子任务前端兼容文件；当前 Study 2 流程不调用

  scripts/
    local-receiver.js          # 本地数据接收服务草案；用于 webhook/sync 方案测试
    tunnel.js                  # Cloudflare tunnel 启动脚本；默认转发本地 3001

  server/
    index.js                   # Express 主服务；API、状态机、条件分配、收入计算、计时控制
    store.js                   # JSON 数据读写；包含轻量 session lock，降低重复提交风险
    export.js                  # 管理端导出逻辑；生成 JSON 和 CSV
    smoke-test.js              # API 烟测；覆盖完整流程和关键数据规则
```

## 6. 服务端 API 概览

参与者流程 API：

- `POST /api/session`：创建或恢复 session。
- `POST /api/session/:id/consent`：提交知情同意。
- `POST /api/session/:id/baseline`：提交 AI 使用背景题。
- `POST /api/session/:id/rules-viewed`：记录规则页已读。
- `POST /api/session/:id/comprehension`：提交理解检查。
- `POST /api/session/:id/effort/start`：开始或恢复努力任务。
- `POST /api/session/:id/effort/round`：提交一轮努力任务答案。
- `POST /api/session/:id/income-viewed`：记录实际收入页已读。
- `GET /api/session/:id/peer-records`：读取同事此前收入申报记录。
- `POST /api/session/:id/peer-records-viewed`：记录同事记录页已读。
- `POST /api/session/:id/income-report`：提交私密收入申报。
- `POST /api/session/:id/post-survey`：提交任务后问卷。
- `POST /api/session/:id/experience`：提交收入申报经验题。
- `POST /api/session/:id/demographics`：提交人口学题。
- `POST /api/session/:id/complete`：完成实验。

管理端 API：

- `GET /api/admin/summary`
- `GET /api/admin/export/json`
- `GET /api/admin/export/participants.csv`
- `GET /api/admin/export/study2_effort_rounds.csv`
- `GET /api/admin/export/study2_income_reports.csv`

管理端 API 需要 `?token=...` 或 `x-admin-token`。

## 7. 验证方式

运行 smoke test：

```powershell
cd E:\group-deception-study2
npm run smoke
```

当前 smoke test 会检查：

- 完整 session 能完成。
- 固定同伴模板正确。
- hidden 不暴露具体金额。
- honest 实际收入等于申报收入。
- dishonest 申报收入低于实际收入。
- 实际收入 `2.73` 时可以精确申报 `2.73`。
- 超过实际收入会被拒绝。
- 收入申报不能重复提交。
- demographics 不能跳过 experience 提交。
- 前端伪造的努力任务耗时会被服务器忽略。
- 同一 Prolific ID 完成后不会获得新 session。
- `DEBUG_LINKS` 必须显式为 `true` 才启用调试条件。

## 8. 部署现状和后续工作

目前已有：

- `render.yaml`，可以作为 Render web service 配置草案。
- `npm start`，Render 可用它启动服务。
- `ADMIN_TOKEN` 环境变量，用于管理端导出鉴权。
- `DEBUG_LINKS` 环境变量，用于控制调试链接是否生效。
- `DATA_DIR` 环境变量，用于指定 session JSON 保存目录。

正式部署前还没有完成的关键工作：

- 还没有配置持久化数据库或可靠对象存储。
- 还没有验证 Render 上的正式数据持久保存方案。
- 还没有设置正式 `ADMIN_TOKEN`。
- 还没有设置 Prolific completion code 和支付流程。
- 还没有冻结正式任务参数、剔除规则和样本量方案。
- 还没有把伦理审批最终文本替换进 consent/debrief。

如果使用 Render：

1. 新建 Web Service。
2. 连接代码仓库。
3. 使用 `render.yaml` 或手动设置：
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Node Version: `20`
4. 设置环境变量：
   - `ADMIN_TOKEN=正式强密码`
   - `DEBUG_LINKS=false`
   - `DATA_DIR=./data/sessions`
5. 正式招募前必须补上持久化数据方案；不要只依赖 Render 临时文件系统。

## 9. 当前未冻结参数

- 努力任务时限。
- 每题收入。
- 速度奖励。
- `deductionRate`。
- 正式 Prolific 报酬和 completion code。
- 正式剔除规则。
- 样本量与 power analysis。
- 伦理审批最终文本。
