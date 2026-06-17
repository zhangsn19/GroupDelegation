# HCI 协作实验平台

基于《HCI 实验设计方案》构建的 Web 被试参与系统，支持两个实验的完整流程、数据记录与 LLM 辅助的机器人对话。

## 实验概述

### 实验一：群聊骰子协作（2×2 被试间设计）

- **因子 A**：受托节点类型（人类 vs AI）
- **因子 B**：团队规模（小 3 人 vs 大 5 人）
- **主因变量**：上报指令相对真实骰子结果的偏离程度
- **流程**：知情同意 → 群聊介绍 → 前置问卷 → 任务规则 → 骰子委托 → 结果公布 → 后置问卷 → 事后说明

### 实验二：法律文书审查（角色 × AI 拓扑）

- **因子一**：被试层级位置（起草者 / 审核者 / 签发合伙人）
- **因子二**：AI 拓扑位置（下游起草 / 上游指令 / 旁路平行审核）
- **主因变量**：植入错误捕获率、核验行为次数、审查时长
- **流程**：角色代入 → 团队介绍 → 前置问卷 → 备忘录审查 → 后置问卷 → 事后说明

## 技术栈

- **后端**：Node.js + Express
- **前端**：原生 HTML / CSS / JavaScript
- **数据存储**：JSON 文件（`data/sessions/`，自动写入，无需手动导出）
- **LLM**：OpenAI 兼容 API（后端代理，密钥不暴露给前端）

## 推荐工作流：本地优先

**数据会自动保存到本地 JSON 文件，不需要 CSV 导出流程。**

| 场景 | 推荐方案 | 数据位置 | 公网链接 |
|------|----------|----------|----------|
| **小规模实验 / 测试** | 本地运行 | `data/sessions/` | 局域网 IP 或 Cloudflare Tunnel |
| **需要稳定公网 URL + 本地数据** | 本地 + Tunnel（**最推荐**） | `data/sessions/` | `*.trycloudflare.com` |
| **已部署 Render，想同步到 Mac** | Render + Webhook | `data/synced/` | `groupdelegation.onrender.com` |
| **纯云端、不介意手动备份** | Render 单部署 | Render 磁盘 | `*.onrender.com` |

### 方案 A：本地运行 + Cloudflare Tunnel（最推荐）

被试通过公网链接访问，数据直接写入你 Mac 上的 `data/sessions/`，无需 CSV 导出。

**终端 1 — 启动实验服务**

```bash
cd hci-experiment
npm install
cp .env.example .env   # 填入 LLM_API_KEY
npm start
```

**终端 2 — 暴露公网 URL（免费）**

```bash
npm run tunnel
# 输出类似：https://random-name.trycloudflare.com
# 把此链接发给被试即可
```

需要安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)：`brew install cloudflared`

> Tunnel 运行期间 URL 稳定；重启 tunnel 会换一个新地址。比 ngrok 免费版（每次重启随机变）更省心。

### 方案 B：Render 公网 + Webhook 同步到本地

继续使用 `groupdelegation.onrender.com`，同时每次 session 保存时自动 POST 到你 Mac。

**终端 1**

```bash
npm run receiver
```

**终端 2**

```bash
npm run tunnel:receiver
# 记下输出的 https://xxxx.trycloudflare.com
```

**Render Dashboard → Environment** 添加 `DATA_WEBHOOK_URL` = 上面的 tunnel URL，重新部署。

同步文件写入 `data/synced/<session-id>.json`。做实验时 Mac 需开机且两个终端在运行。

### 方案 C：仅局域网

```bash
npm start
# 其他设备访问 http://<局域网IP>:3456
ipconfig getifaddr en0
```

## 快速开始

### 1. 安装依赖

```bash
cd hci-experiment
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 LLM API Key
```

`.env` 示例：

```
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.gpt.ge/v1
LLM_MODEL=gpt-4o-mini
PORT=3456
ADMIN_TOKEN=hci-admin-dev
```

### 3. 启动服务

```bash
npm start
# 或开发模式（自动重启）
npm run dev
```

浏览器访问：**http://localhost:3456**

被试数据会自动写入 `data/sessions/`，无需手动导出。公网访问见上文「方案 A」。

## 使用说明

1. 在首页选择「实验一」或「实验二」
2. 可选填写 Prolific ID
3. 阅读知情同意书并同意
4. 按提示完成全部实验流程
5. 实验结束后查看事后说明（debriefing）

## 数据存储

### 自动保存（主流程）

每条被试的完整数据在实验过程中**自动**保存为一个 JSON 文件：

```
hci-experiment/data/sessions/<session-id>.json
```

Webhook 同步（方案 B）额外写入 `data/synced/`。两个目录均已加入 `.gitignore`。

**研究员管理页：** 访问 `http://localhost:3456/admin.html`，输入 `ADMIN_TOKEN` 可查看 session 数量与存储路径。

### JSON 结构（单条 session）

| 字段 | 说明 |
|------|------|
| `id` | Session UUID |
| `experimentId` | `experiment1` 或 `experiment2` |
| `condition` | 随机分配的条件（如 `agentType`, `teamSize` 或 `role`, `aiTopology`） |
| `preSurvey` / `postSurvey` | 问卷回答 |
| `taskData` | 任务行为数据（见下） |
| `timings` | 各阶段耗时（毫秒） |
| `events` | 细粒度事件日志（聊天、核验、滚动等） |
| `completed` | 是否完成 |

**实验一 `taskData` 关键字段：**
- `diceValue` — 真实骰子点数
- `reportedValue` — 要求受托节点上报的数字
- `deviation` — 上报偏离（主因变量，行为指标）

**实验二 `taskData` 关键字段：**
- `reportedErrors` — 审核中勾选上报的问题 ID 列表（**主因变量：上报率**）
- `reportRate` — 上报率 = len(reportedErrors) / 5
- `recognitionResponses` — 事后回顾每题回答（`not_noticed` / `noticed_not_reported` / `noticed_reported`）
- `detectedErrors` — 回顾中表示「注意到」的问题 ID
- `detectionRate` — 觉察率
- `underReportedErrors` — 回顾中选「注意到了但未上报」的问题 ID
- `underReportingGap` — `detectedCount - reportedCount`（低报差距）
- `verificationActions` / `verificationCount` — 核验按钮点击
- `reviewDurationMs` — 审查时长

### 备份导出（可选）

管理页或 API 可下载 JSON/CSV 作为备份，**日常分析直接读 `data/sessions/` 里的 JSON 即可**，不必走 CSV 流程。

```bash
# JSON 全部（备份）
curl -H "X-Admin-Token: hci-admin-dev" http://localhost:3456/api/admin/export -o all.json

# CSV（SPSS/R 用，可选）
curl -H "X-Admin-Token: hci-admin-dev" "http://localhost:3456/api/admin/export?format=csv" -o results.csv

# 查看存储路径与 session 数量
curl -H "X-Admin-Token: hci-admin-dev" http://localhost:3456/api/admin/info
```

### 分析：觉察 vs 上报（实验二）

| 指标 | 计算方式 | 含义 |
|------|----------|------|
| **上报率** `task_reportRate` | 审核勾选数 / 5 | 主 DV：正式报告的问题 |
| **觉察率** `task_detectionRate` | 回顾中「注意到」数 / 5 | 次 DV：自我报告是否察觉 |
| **低报差距** `task_underReportingGap` | 觉察数 − 上报数 | 察觉但未上报（Type B） |
| **未觉察** | `recognitionResponses[err]=not_noticed` | 确实未注意到（Type A） |

实验一的行为偏离 `task_deviation` 为主 DV；后置问卷 `post_inflate_awareness` / `post_inflate_considered` 补充自我报告。

## 公网域名说明

### 免费子域名（无需注册，推荐）

| 服务 | 示例 | 说明 |
|------|------|------|
| **Cloudflare Tunnel** | `*.trycloudflare.com` | 免费、稳定，本项目 `npm run tunnel` 即用 |
| **Render** | `groupdelegation.onrender.com` | 已有部署，免费子域名 |
| **ngrok 免费版** | `*.ngrok-free.app` | 每次重启 URL 变化 |
| Vercel / Netlify | `*.vercel.app` 等 | 需改部署方式，本项目未配置 |

### 自定义域名（需付费）

| 来源 | 情况 |
|------|------|
| **阿里云 / 腾讯云 / 华为云** | `.com` / `.cn` 通常 ¥30–70/年，偶有首年优惠，**没有长期免费的自定义域名** |
| Freenom（`.tk` / `.ml`） | 已基本不可用，不建议 |
| Namecheap / Porkbun | 首年有时 $1–2，非免费 |

若已购买域名（如在阿里云注册 `yourlab.cn`），在 Render Dashboard → Settings → Custom Domains 添加，按提示配置 DNS CNAME 即可。

### 针对本项目的建议

1. **本地数据 + 公网被试链接**：`npm start` + `npm run tunnel`（方案 A）
2. **继续用 Render**：保留 `groupdelegation.onrender.com` + Webhook 同步到 Mac（方案 B）
3. **想要自己的域名**：在阿里云等购买后指向 Render，约几十元/年

## 项目结构

```
hci-experiment/
├── config/
│   ├── experiment1.js      # 实验一配置、问卷、条件分配
│   └── experiment2.js      # 实验二配置、植入错误、备忘录
├── server/
│   ├── index.js            # Express 主服务
│   ├── store.js            # JSON 数据持久化
│   ├── llm.js              # LLM API 代理
│   └── scripts.js          # Host 脚本化台词
├── public/
│   ├── index.html
│   ├── admin.html          # 研究员数据管理页
│   ├── css/style.css
│   └── js/                 # 前端逻辑
├── data/sessions/          # 运行时数据（gitignore）
├── data/synced/            # Webhook 同步到本地的备份（gitignore）
├── scripts/
│   ├── local-receiver.js   # 本地 Webhook 接收器（Render → Mac）
│   └── tunnel.js           # Cloudflare quick tunnel
├── render.yaml             # Render Blueprint 配置
├── .node-version
├── .env.example
├── .gitignore
└── package.json
```

## 设计说明与假设

1. **脚本优先、LLM 辅助**：Host 与关键流程使用预编写脚本保证跨条件一致性；LLM 仅用于机器人节点的轻量应答变体，失败时自动回退到脚本。
2. **受托节点不知真值**（实验一）：后端不将骰子真值发送给受托节点逻辑，确保人类/AI 差异仅通过委托者道德自我监控产生。
3. **同一份材料**（实验二）：所有条件下备忘录正文相同，仅叙事框架与角色位置不同。
4. **条件随机分配**：被试创建 session 时自动随机分配实验条件。
5. **伦理**：实验结束后展示 debriefing，说明后台角色由脚本扮演。

## 健康检查

```bash
curl http://localhost:3456/api/health
```

返回 `llmConfigured: true` 表示 LLM API 已配置。

## 注意事项

- **切勿将 `.env` 提交到版本控制**
- 正式部署时请修改 `ADMIN_TOKEN`
- Prolific 集成：可在 URL 中传入 `?PROLIFIC_PID=xxx` 后扩展前端自动填充（当前支持手动输入）

---

## 部署到 Render（备选：纯云端）

> 若采用上文 **方案 A（本地 + tunnel）** 或 **方案 B（Render + Webhook）**，可跳过本节的大部分内容。

### 本地 vs 云端

| 命令 | 作用 |
|------|------|
| `npm start` | 本地运行，数据在 `data/sessions/` |
| `npm run tunnel` | 为本地服务生成公网 HTTPS 链接 |
| `npm run deploy` | 推送代码到 GitHub，触发 Render 自动部署 |

### 一次性配置

#### 1. 推送代码到 GitHub

```bash
cd hci-experiment
git init
git add .
git commit -m "Initial commit: HCI experiment platform"
# 在 GitHub 创建空仓库 hci-experiment 后：
git remote add origin https://github.com/<你的用户名>/hci-experiment.git
git branch -M main
git push -u origin main
```

#### 2. 在 Render 创建服务

**方式 A — Blueprint（推荐，含持久化磁盘）**

1. 打开 [Render Dashboard](https://dashboard.render.com/)
2. 点击 **New +** → **Blueprint**
3. 连接 GitHub 仓库 `hci-experiment`
4. Render 自动读取根目录 `render.yaml` 并创建 Web Service + 1GB 持久化磁盘
5. 在部署界面为 `LLM_API_KEY` 填入 API Key（**不要写入代码仓库**）
6. `ADMIN_TOKEN` 可由 Render 自动生成，记下该值用于数据导出

**方式 B — 手动创建 Web Service**

1. **New +** → **Web Service** → 选择 GitHub 仓库
2. 配置：
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
3. **Environment Variables**（在 Render Dashboard → Environment）：

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `HOST` | `0.0.0.0` |
   | `LLM_API_KEY` | 你的 API Key |
   | `LLM_BASE_URL` | `https://api.gpt.ge/v1` |
   | `LLM_MODEL` | `gpt-4o-mini` |
   | `ADMIN_TOKEN` | 随机强密码 |
   | `DATA_DIR` | `/var/data`（若挂载磁盘） |

4. **（推荐）添加 Persistent Disk：**
   - Settings → Disks → Add Disk
   - Mount Path: `/var/data`
   - Size: 1 GB
   - 设置 `DATA_DIR=/var/data`

### 数据持久化（仅纯 Render 时关注）

| 方案 | 说明 |
|------|------|
| **无磁盘（免费层默认）** | `data/sessions/` 在容器重启后会丢失 |
| **Render Disk** | `render.yaml` 已配置 1GB 磁盘挂载到 `/var/data` |
| **Webhook 同步（推荐）** | 配合方案 B，数据自动写到 Mac `data/synced/` |

### Webhook 同步到本地（方案 B 详情）

每次 session 保存时，若 Render 设置了 `DATA_WEBHOOK_URL`，服务器会 fire-and-forget POST 完整 session JSON，不阻塞被试流程。

```bash
# 终端 1
npm run receiver

# 终端 2
npm run tunnel:receiver
# 将输出的 https://xxxx.trycloudflare.com/ 填入 Render → DATA_WEBHOOK_URL
```

完成一次实验后检查 `data/synced/` 是否出现新 JSON。

也可用 ngrok：`ngrok http 9999`（免费版 URL 每次重启会变）。

### 部署后验证

```bash
curl https://groupdelegation.onrender.com/api/health
# 期望：{"ok":true,"llmConfigured":true}

# 被试访问（示例 URL，以 Dashboard 为准）
open https://groupdelegation.onrender.com

# 备用导出（Webhook 未配置时）
curl -H "X-Admin-Token: <your-token>" \
  "https://groupdelegation.onrender.com/api/admin/export?format=csv" -o results.csv
```

**线上 URL：** `https://groupdelegation.onrender.com`

### 后续更新

修改代码后：

```bash
git add -A && git commit -m "update" && npm run deploy
# 或：git push origin main
```

Render 检测到 push 后自动重新构建部署（约 2–5 分钟）。
