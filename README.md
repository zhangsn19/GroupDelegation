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
- **数据存储**：JSON 文件（`data/sessions/`）
- **LLM**：OpenAI 兼容 API（后端代理，密钥不暴露给前端）

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

### 局域网 / 其他设备访问

服务默认绑定 `0.0.0.0`，同一 Wi‑Fi 下的手机或其他电脑也可访问。

1. 在本机查看局域网 IP（macOS）：
   ```bash
   ipconfig getifaddr en0
   ```
2. 在其他设备浏览器打开：`http://<局域网IP>:3456`  
   例如：`http://192.168.1.100:3456`

若无法访问，请检查本机防火墙是否放行 3456 端口。

## 使用说明

1. 在首页选择「实验一」或「实验二」
2. 可选填写 Prolific ID
3. 阅读知情同意书并同意
4. 按提示完成全部实验流程
5. 实验结束后查看事后说明（debriefing）

## 数据存储与导出

### 存储位置

每条被试的完整数据保存为一个 JSON 文件：

```
hci-experiment/data/sessions/<session-id>.json
```

运行时自动创建；该目录已加入 `.gitignore`，不会进入版本控制。

**研究员管理页：** 启动服务后访问 `http://localhost:3456/admin.html`，输入 `ADMIN_TOKEN` 可查看存储路径并下载导出文件。

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

### 导出命令

```bash
# JSON 全部
curl -H "X-Admin-Token: hci-admin-dev" http://localhost:3456/api/admin/export -o all.json

# CSV 全部（扁平化，适合 SPSS/R）
curl -H "X-Admin-Token: hci-admin-dev" "http://localhost:3456/api/admin/export?format=csv" -o results.csv

# 按实验筛选
curl -H "X-Admin-Token: hci-admin-dev" "http://localhost:3456/api/admin/export?experiment=experiment2&format=csv" -o exp2.csv

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

## 数据导出（简要）

实验数据保存在 `data/sessions/<session-id>.json`。详见上文「数据存储与导出」。

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

## 部署到 Render（云端访问）

> **说明：** `npm start` 仅在本地启动服务器，**不会**自动部署到 Render。  
> 标准流程：**Git push → Render 自动构建部署**（推荐）。

### 本地 vs 云端

| 命令 | 作用 |
|------|------|
| `npm start` | 本地运行，默认 `http://localhost:3456` |
| `npm run deploy` | 推送代码到 GitHub `main` 分支，触发 Render 自动部署（需先完成下方一次性配置） |

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

### 数据持久化说明

| 方案 | 说明 |
|------|------|
| **无磁盘（免费层默认）** | `data/sessions/` 在容器重启后会丢失 |
| **Render Disk（推荐）** | `render.yaml` 已配置 1GB 磁盘挂载到 `/var/data`，session JSON 持久保存 |

### 部署后验证

```bash
# 替换为你的 Render URL
curl https://hci-experiment.onrender.com/api/health
# 期望：{"ok":true,"llmConfigured":true}

# 被试访问
open https://hci-experiment.onrender.com

# 数据导出（使用 Render 中设置的 ADMIN_TOKEN）
curl -H "X-Admin-Token: <your-token>" \
  "https://hci-experiment.onrender.com/api/admin/export?format=csv" -o results.csv
```

**线上 URL 示例：** `https://hci-experiment.onrender.com`（实际 URL 以 Render Dashboard 显示为准）

### 后续更新

修改代码后：

```bash
git add -A && git commit -m "update" && npm run deploy
# 或：git push origin main
```

Render 检测到 push 后自动重新构建部署（约 2–5 分钟）。
