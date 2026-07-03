# Study 2：收入申报任务

本目录是 Group Deception 项目的 Study 2 独立 Node 服务。

Study 2 研究参与者在共享群聊 AI 协助完成个人收入申报时，其他成员此前的收入申报信息如何影响其后的个人申报行为。

## 1. 实验设计

### 1.1 固定场景

* 一名参与者与四位同事组成五人模拟同事群体；
* 所有人通过同一个共享群聊 AI 完成个人收入申报；
* 群聊 AI 负责接收并提交成员报告，不提供建议、评价或道德提示；
* 参与者的最终个人收入申报不会向其他成员展示；
* 每位成员的任务结果分别结算；
* 参与者先完成 4 轮奇偶数分类任务，再进行收入申报。

### 1.2 唯一实验因子

唯一操纵为参与者在个人收入申报前获得的其他成员此前申报信息：

| Condition   | 参与者看到的信息                 |
| ----------- | ------------------------ |
| `hidden`    | 四位同事已完成申报，但具体收入申报内容不可见   |
| `honest`    | 四位同事如实申报自己在任务中实际获得的收入    |
| `dishonest` | 四位同事以自身收益为导向，申报低于实际收入的金额 |

群聊是固定研究场景，不是实验 factor。不要重新引入 AI 身份、群体规模、共同收益、可追责、社会监督、人类或 AI 队友等新变量。

### 1.3 任务流程

```text
4 轮奇偶数分类任务
→ 系统计算实际收入
→ 展示其他成员此前收入申报记录
→ 参与者完成个人收入申报
→ 群聊 AI 提交
→ 显示实际收入、申报收入、模拟扣除金额、任务保留奖励
```

实际收入来自努力任务表现，是后续计算的基数，不等同于最终计入被试费的任务报酬。

### 1.4 金额规则

```text
模拟扣除金额 = 申报收入 × 0.5

任务保留奖励 = 实际收入 − 模拟扣除金额
```

最终被试费由基础参与报酬和任务保留奖励构成。

示例：

```text
实际收入：¥2.00
申报收入：¥1.00
模拟扣除金额：¥0.50
任务保留奖励：¥1.50
```

在其他条件相同的情况下，申报收入越低，任务保留奖励越高。

基础参与报酬、最高总额与实际支付规则须在正式招募前由研究团队确认。

## 2. 目录结构

```text
study2/
├─ config/
│  ├─ common.js             # 成员、状态、版本等共同配置
│  ├─ measures.js           # 前测、后测、人口学题目
│  └─ study2-income.js      # 收入任务、规则、理解检查、同伴申报模板
├─ public/
│  ├─ index.html            # 首页、知情同意、页面骨架
│  ├─ admin.html            # 管理端页面
│  ├─ css/style.css         # 页面样式
│  └─ js/
│     ├─ app.js             # 总流程、debrief、完成页
│     ├─ chat.js            # 群聊与成员栏
│     ├─ comprehension.js   # 理解检查
│     ├─ survey.js          # 前测、后测、人口学
│     └─ study2-income.js   # effort task、收入申报与结果页面
├─ server/
│  ├─ index.js              # API、随机化、计时、校验、数据写入
│  ├─ store.js              # JSON session 读写与锁
│  ├─ export.js             # 管理端 CSV / JSON 导出
│  └─ smoke-test.js         # 自动 smoke test
├─ data/
│  ├─ sessions/.gitkeep
│  └─ synced/.gitkeep
├─ docs/
│  └─ DEVELOPMENT_GUIDE.md
├─ .env.example
├─ render.yaml
├─ PILOT_CHECKLIST.md
├─ REQUIREMENTS.md
├─ package.json
└─ README.md
```

## 3. 本地运行

以下命令以 PowerShell 为例。

进入当前仓库中的 Study 2 目录：

```powershell
cd "<repository-root>\study2"
```

其中 `<repository-root>` 是本机克隆的 `GroupDelegation` 文件夹路径。

首次运行或依赖变化后执行：

```powershell
npm ci --ignore-scripts
```

运行自动测试：

```powershell
npm run smoke
```

启动普通本地服务：

```powershell
$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "false"
Remove-Item Env:TEST_CONDITION -ErrorAction SilentlyContinue
$env:REQUIRE_PARTICIPANT_ID = "false"

$env:ADMIN_TOKEN = "local-admin-token-change-me"
$env:STUDY_CONTACT_EMAIL = "local-test@example.invalid"
$env:DATA_DIR = "$env:TEMP\group-deception-study2-dev\sessions"
$env:PORT = "3801"

npm run dev
```

其中：

* `ADMIN_TOKEN` 是本地管理端密码，应自行替换；
* `STUDY_CONTACT_EMAIL` 仅用于本地页面测试，不能用于真实招募；
* `DATA_DIR` 是本次本地运行写入 session JSON 的位置；
* 普通启动前会清除可能残留的 `TEST_CONDITION`，避免误固定 condition。

启动成功后，以下链接可以直接打开。它们仅在运行服务的这台电脑上有效。

| 用途                    | 链接                                                             |
| --------------------- | -------------------------------------------------------------- |
| 新参与者流程                | [打开 Study 2：dev-s2-001](http://localhost:3801/?pid=dev-s2-001) |
| 另一个新参与者流程             | [打开 Study 2：dev-s2-002](http://localhost:3801/?pid=dev-s2-002) |
| 恢复 `dev-s2-001` 的已有进度 | [恢复 Study 2：dev-s2-001](http://localhost:3801/?pid=dev-s2-001) |
| 管理端                   | [打开 Study 2 管理端](http://localhost:3801/admin.html)             |
| 服务健康状态                | [打开 Study 2 健康状态](http://localhost:3801/health)                |
| 公共配置检查                | [打开 Study 2 公共配置](http://localhost:3801/api/config)            |

同一个 PID 会恢复同一个 session、同一个 condition 和同一个实验进度。测试新的参与者流程时，请使用新的 PID。

## 4. 三种 condition 的本地调试

正式实验不通过 URL 指定 condition。正式参与者链接只使用：

```text
https://<study2-url>/?pid=<unique-participant-id>
```

服务端会在新 PID 首次进入时，通过 block randomization 自动分配 `hidden`、`honest` 或 `dishonest`。

开发者检查三个 condition 时，应分别启动三个本地服务实例。每个实例使用独立终端、独立端口和独立临时数据目录。

### 4.1 Hidden condition

在新的 PowerShell 窗口中执行：

```powershell
cd "<repository-root>\study2"

$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "hidden"
$env:REQUIRE_PARTICIPANT_ID = "false"

$env:ADMIN_TOKEN = "local-admin-token-change-me"
$env:STUDY_CONTACT_EMAIL = "local-test@example.invalid"
$env:DATA_DIR = "$env:TEMP\group-deception-study2-hidden\sessions"
$env:PORT = "3821"

npm run dev
```

启动后直接打开：[Study 2 · hidden](http://localhost:3821/?pid=dev-s2-hidden-001)

### 4.2 Honest condition

在新的 PowerShell 窗口中执行：

```powershell
cd "<repository-root>\study2"

$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "honest"
$env:REQUIRE_PARTICIPANT_ID = "false"

$env:ADMIN_TOKEN = "local-admin-token-change-me"
$env:STUDY_CONTACT_EMAIL = "local-test@example.invalid"
$env:DATA_DIR = "$env:TEMP\group-deception-study2-honest\sessions"
$env:PORT = "3822"

npm run dev
```

启动后直接打开：[Study 2 · honest](http://localhost:3822/?pid=dev-s2-honest-001)

### 4.3 Dishonest condition

在新的 PowerShell 窗口中执行：

```powershell
cd "<repository-root>\study2"

$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "dishonest"
$env:REQUIRE_PARTICIPANT_ID = "false"

$env:ADMIN_TOKEN = "local-admin-token-change-me"
$env:STUDY_CONTACT_EMAIL = "local-test@example.invalid"
$env:DATA_DIR = "$env:TEMP\group-deception-study2-dishonest\sessions"
$env:PORT = "3823"

npm run dev
```

启动后直接打开：[Study 2 · dishonest](http://localhost:3823/?pid=dev-s2-dishonest-001)

Study 2 的 hidden 小 pilot 可先固定为 `hidden`，用于观察实际收入分布。正式主实验恢复三条件 block randomization。

正式环境必须关闭固定 condition：

```text
NODE_ENV=production
DEBUG_LINKS=false
REQUIRE_PARTICIP_ID=true
```

不要把 `TEST_CONDITION` 或 condition 调试链接发给真实参与者。

## 5. 管理端与数据导出

管理端是研究团队专用的数据查看、筛选与导出页面，不面向参与者，也不用于给新参与者指定 condition。

普通本地服务启动后，可直接打开：

[打开 Study 2 管理端](http://localhost:3801/admin.html)

进入后输入本次启动服务时设置的 `ADMIN_TOKEN`。页面显示：

```text
Admin token required
```

通常表示 token 为空或输入错误。

管理端中的内容：

| 区域                        | 用途                                 |
| ------------------------- | ---------------------------------- |
| 包含测试 / 调试数据               | 勾选后显示本地测试或 debug session；正式导出通常不勾选 |
| condition                 | 筛选已收集的数据；不用于给新参与者分配 condition      |
| 开始日期 / 结束日期               | 按时间筛选已有记录                          |
| 查看汇总                      | 查看当前筛选条件下的样本数和完成情况                 |
| JSON 原始数据                 | 下载完整 session JSON                  |
| participants.csv          | 每名参与者一行的汇总数据                       |
| study2_effort_rounds.csv  | 四轮奇偶数分类任务的过程数据                     |
| study2_income_reports.csv | 实际收入、同伴信息、个人申报、模拟扣除金额与任务保留奖励       |

Study 2 分析通常使用：

```text
participants.csv
study2_effort_rounds.csv
study2_income_reports.csv
```

原始 JSON 是最完整的数据源；CSV 是可重新导出的分析副本。

## 6. 数据写入与撤回

当前不使用外部数据库。每位参与者会对应一份原始 session JSON。

```text
DATA_DIR/
├─ randomization-state.json
└─ sessions/
   ├─ s2_xxxxx.json
   ├─ s2_yyyyy.json
   └─ ...
```

session 会在关键步骤完成时持续写入：

```text
consent
→ baseline
→ comprehension
→ 4 轮 effort task
→ actual income
→ peer records viewed
→ income report
→ post-survey
→ demographics
→ debrief_viewed_at
→ completed_at
```

中途退出可能留下未完成 session。分析时应根据正式预注册或分析规则筛选。

参与者可凭 participant ID 联系研究团队申请撤回或删除记录。收到申请后，数据管理员应：

```text
participant_id
→ 定位原始 session
→ 删除或匿名化原始记录
→ 同步处理分析副本
→ 记录处理结果
```

## 7. 生产部署

Study 2 应作为独立服务部署，并使用独立的持久化数据目录。

推荐生产环境变量：

```text
NODE_ENV=production
DEBUG_LINKS=false
REQUIRE_PARTICIPANT_ID=true

DATA_DIR=/var/data/sessions
ADMIN_TOKEN=<strong-random-secret>
STUDY_CONTACT_EMAIL=<real-research-email>

COMPLETION_CODE=<recruitment-platform-code>
COMPLETION_REDIRECT_URL=<optional-platform-return-url>
```

注意：

* 正式数据必须写入 Persistent Disk 或学校服务器持久化目录；
* 不要将正式数据写在容器临时磁盘；
* 当前 JSON 文件锁和随机化状态适合单实例运行；
* 不要启用多实例横向扩容；
* `.env`、真实 token、真实邮箱、真实参与者数据不得进入仓库；
* Study 1 与 Study 2 必须使用不同的 `DATA_DIR`；
* 未配置 `COMPLETION_REDIRECT_URL` 时，完成页不应显示失效的返回平台按钮。

## 8. 不可随意修改的参与者可见内容

未经研究负责人确认，不要修改以下内容：

```text
实验二：收入申报任务
模拟同事群体
模拟扣除金额
四位同事姓名
固定群聊开场消息
hidden 条件中的“具体内容对你不可见”
请群聊 AI 提交我的收入申报
4 轮奇偶数分类任务
PEER_INCOME_TEMPLATE
当前收入范围、扣除率和计算逻辑
前测 5 点、后测 7 点
后测 A→B→C→D→E→F 的结构
F1、F2 可留空逻辑
```

Study 2 必须继续保持：

```text
实际收入页不会直接提交收入申报
同伴记录展示后才进入个人收入申报页
收入申报开始计时发生在同伴记录展示完成之后
结果页展示实际收入、申报收入、模拟扣除金额、任务保留奖励
```

不得重新出现：

```text
renderIncomeReport is not defined
系统不会自动按实际收入申报
仅你与群聊 AI 可见
```
