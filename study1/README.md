# Study 1：骰子结果申报任务

本目录是 Group Deception 项目的 Study 1 独立 Node 服务。

Study 1 研究参与者在共享群聊 AI 协助完成个人报告时，其他成员此前的报告信息如何影响其后的骰子结果申报行为。

## 1. 实验设计

### 固定场景

* 一名参与者与四位同事组成五人模拟同事群体；
* 所有人通过同一个共享群聊 AI 完成个人报告；
* 群聊 AI 负责接收并提交成员报告，不提供建议、评价或道德提示；
* 参与者的最终个人报告不会向其他成员展示；
* 每位成员的任务结果分别结算；
* Study 1 共进行 10 轮。

### 唯一实验因子

唯一操纵为参与者在个人报告前获得的其他成员报告信息：

| Condition   | 参与者看到的信息                   |
| ----------- | -------------------------- |
| `hidden`    | 四位同事已完成报告，但具体内容不可见         |
| `honest`    | 四位同事如实报告本轮共同看到的骰子结果        |
| `dishonest` | 四位同事以自身收益为导向，报告偏离真实骰子结果的数字 |

群聊是固定研究场景，不是实验 factor。不要重新引入 AI 身份、群体规模、共同收益、可追责、社会监督、人类或 AI 队友等新变量。

### 任务规则

每轮开始时，参与者会在个人任务区域看到本轮共同骰子结果。任务要求成员报告本轮共同看到的骰子结果。

群聊 AI 不会在聊天区公开播报具体骰子数字，而会提示：

```text
骰子结果已出，请大家在各自的个人面板中完成本轮报告。
```

每轮任务报酬为：

```text
本轮任务报酬 = 提交数字 × ¥1
```

例如，提交数字 4 时，本轮任务报酬为 ¥4。

最终被试费由基础参与报酬和任务报酬构成。基础参与报酬、最高总额与实际支付规则须在正式招募前由研究团队确认。

## 2. 目录结构

```text
study1/
├─ config/
│  ├─ common.js             # 成员、状态、版本等共同配置
│  ├─ measures.js           # 前测、后测、人口学题目
│  └─ study1-dice.js        # 骰子任务、规则、理解检查、固定序列
├─ public/
│  ├─ index.html            # 首页、知情同意、页面骨架
│  ├─ admin.html            # 管理端页面
│  ├─ css/style.css         # 页面样式
│  └─ js/
│     ├─ app.js             # 总流程、debrief、完成页
│     ├─ chat.js            # 群聊与成员栏
│     ├─ comprehension.js   # 理解检查
│     ├─ survey.js          # 前测、后测、人口学
│     └─ study1-dice.js     # 骰子任务与个人提交卡
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

## 3. 本地安装与 Smoke Test

在本目录执行：

```powershell
npm ci --ignore-scripts
npm run smoke
```

Smoke test 会使用临时数据目录，不应向项目中的 `data/` 写入测试 session、日志或随机化状态。

当前 smoke 覆盖的关键行为包括：

* hidden、honest、dishonest 的 block randomization；
* 同一 participant ID 并发进入时只创建一个 session；
* 同一 PID 重新进入时恢复原 session、原 condition 与原进度；
* 服务端开始计时与直接提交；
* 提交数字与报酬计算；
* 前测 5 点、后测 7 点；
* 年龄字段级中文错误；
* debrief 前置门槛；
* completion code 不提前泄露；
* 参与者公开 API 不泄露 condition、debug 或 randomization 信息；
* 管理端导出与测试数据过滤。

## 4. 本地启动

在 `study1/` 目录执行：

```powershell
$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "false"
$env:REQUIRE_PARTICIPANT_ID = "false"
$env:STUDY_CONTACT_EMAIL = "123456@163.com"
$env:DATA_DIR = "$env:TEMP\group-deception-study1-dev"
$env:PORT = "3800"

npm run dev
```

当前 `123456@163.com` 仅为本地测试占位。正式部署前必须替换为真实、可处理参与者撤回请求的研究联系邮箱。

## 5. 本地可打开链接

启动成功后，可直接打开：

| 用途        | 链接                                      |
| --------- | --------------------------------------- |
| 新参与者流程    | `http://localhost:3800/?pid=dev-s1-001` |
| 另一个新参与者流程 | `http://localhost:3800/?pid=dev-s1-002` |
| 恢复已有参与者进度 | `http://localhost:3800/?pid=dev-s1-001` |
| 管理端       | `http://localhost:3800/admin.html`      |
| 服务健康状态    | `http://localhost:3800/health`          |
| 公共配置检查    | `http://localhost:3800/api/config`      |

同一个 PID 会恢复原 session、原 condition 和原进度。测试新参与者流程时，请使用新的 PID。

不要把下列本地测试 PID 发给真实参与者：

```text
dev-s1-001
dev-s1-002
test
123
participant1
```

## 6. 三种 Condition 的本地调试

正式参与者链接中不能出现 condition。正式环境必须由服务端自动 block randomization 分配。

本地调试时，可以通过环境变量固定新 session 的 condition。每次测试一种 condition 时使用独立端口、独立临时数据目录和新的 PID。

### Hidden

```powershell
$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "hidden"
$env:REQUIRE_PARTICIPANT_ID = "false"
$env:STUDY_CONTACT_EMAIL = "123456@163.com"
$env:DATA_DIR = "$env:TEMP\group-deception-study1-hidden"
$env:PORT = "3811"

npm run dev
```

打开：

```text
http://localhost:3811/?pid=dev-s1-hidden-001
```

### Honest

```powershell
$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "honest"
$env:REQUIRE_PARTICIPANT_ID = "false"
$env:STUDY_CONTACT_EMAIL = "123456@163.com"
$env:DATA_DIR = "$env:TEMP\group-deception-study1-honest"
$env:PORT = "3812"

npm run dev
```

打开：

```text
http://localhost:3812/?pid=dev-s1-honest-001
```

### Dishonest

```powershell
$env:NODE_ENV = "development"
$env:DEBUG_LINKS = "true"
$env:TEST_CONDITION = "dishonest"
$env:REQUIRE_PARTICIPANT_ID = "false"
$env:STUDY_CONTACT_EMAIL = "123456@163.com"
$env:DATA_DIR = "$env:TEMP\group-deception-study1-dishonest"
$env:PORT = "3813"

npm run dev
```

打开：

```text
http://localhost:3813/?pid=dev-s1-dishonest-001
```

不要在 production 环境使用 `TEST_CONDITION`。正式环境必须：

```text
NODE_ENV=production
DEBUG_LINKS=false
REQUIRE_PARTICIPANT_ID=true
```

## 7. Condition 分配与正式参与者链接

正式参与者链接只使用：

```text
https://<study1-url>/?pid=<unique-participant-id>
```

链接中不得出现：

```text
condition
hidden
honest
dishonest
study
study1
study2
debug
```

新 PID 第一次进入时：

```text
唯一 PID
→ 服务端创建 session
→ 服务端 block randomization 分配 hidden / honest / dishonest
→ condition 写入内部 session
→ 后续使用同一 PID 时恢复原 condition
```

当前目标比例为：

```text
hidden : honest : dishonest = 1 : 1 : 1
```

例如，12 名新参与者分配完成后，应为：

```text
hidden = 4
honest = 4
dishonest = 4
```

参与者浏览器不应从 URL、公开 API 或页面文本中获知自己所属 condition。

## 8. 参与者可见内容的固定边界

未经研究负责人确认，不要修改以下内容：

```text
实验一：骰子结果申报任务
模拟同事群体
四位同事姓名
固定群聊开场消息
hidden 条件中的“具体内容对你不可见”
四位同事提交展示结束后的 AI 总结
请群聊 AI 提交我的选择
每轮任务报酬 = 提交数字 × ¥1
前测 5 点、后测 7 点
后测 A→B→C→D→E→F 的结构
F1、F2 可留空逻辑
```

Study 1 必须继续保持：

```text
无“确认并提交 / 返回修改”二次确认页
无“默认不会自动选择真实点数”提示
无“群聊 AI：已按您的选择完成提交”消息
无“群聊 AI 只显示中性执行确认”footer
无“个人任务阶段：其他成员无法查看你的最终提交”提示
```

## 9. 数据写入与导出

当前不使用外部数据库。每位参与者会对应一份原始 session JSON。

```text
DATA_DIR/
├─ randomization-state.json
└─ sessions/
   ├─ s_xxxxx.json
   ├─ s_yyyyy.json
   └─ ...
```

session 会在关键步骤完成时持续写入：

```text
consent
→ baseline
→ comprehension
→ 每轮骰子与报告
→ post-survey
→ demographics
→ debrief_viewed_at
→ completed_at
```

中途退出可能留下未完成 session。分析时应根据正式预注册或分析规则筛选。

管理端地址：

```text
https://<study1-url>/admin.html
```

管理端受 `ADMIN_TOKEN` 保护。原始 JSON 是最完整的数据源；CSV 是可重新导出的分析副本。

参与者可凭 participant ID 联系研究团队申请撤回或删除记录。收到申请后，数据管理员应：

```text
participant_id
→ 定位原始 session
→ 删除或匿名化原始记录
→ 同步处理分析副本
→ 记录处理结果
```

## 10. 生产部署

Study 1 应作为独立服务部署，并使用独立的持久化数据目录。

建议生产环境变量：

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
* 正式部署时，Study 1 与 Study 2 必须使用不同的 `DATA_DIR`；
* 未配置 `COMPLETION_REDIRECT_URL` 时，完成页不应显示失效的返回平台按钮。
