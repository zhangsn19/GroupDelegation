# Study 1：实验一：骰子结果申报任务

## 1. 当前状态
本包是 Study 1 的本地开发包，不是 Git 仓库根目录。当前版本用于本地验收和后续 Render + Persistent Disk pilot 准备。

## 2. 研究设置与不可改变边界
固定五人群体：你、张明、李华、王芳、陈思，以及共享群聊 AI。群聊 AI 只执行提交，不建议、不评价、不修改。参与者最终提交仅自己与 AI 可见，同伴看不到；同伴提交不影响参与者奖励。

## 3. 三个实验条件
唯一 factor 是 Peer Reporting Behavior Information。`hidden`：同伴本轮已提交但具体内容不可见。`honest`：同伴按本轮共同骰子结果提交。`dishonest`：同伴提交高于本轮共同骰子结果的数字。

## 4. 参与者流程
同意 → 4 题前测 → 群体与共享群聊 AI 介绍 → 规则与理解检查 → 10 轮骰子任务 → 后测 → 人口学 → 事后说明 → 完成页。

## 5. 任务与关键数据
每轮先显示共同骰子结果，再依次显示四位同事本轮提交，之后参与者在私密卡片中选择 1–6，服务端记录 `selection_started_at`、`submitted_at`、`decision_duration_ms`、本轮奖励和累计奖励。

## 6. 本地运行与调试链接
首次运行：

```bat
cd /d "D:\mydevelops\github\group-deception-study1-package\group-deception-study1-package"
copy .env.example .env
npm install
npm run dev
```

调试链接示例：
- http://localhost:3300/?study=study1&condition=hidden
- http://localhost:3300/?study=study1&condition=honest
- http://localhost:3300/?study=study1&condition=dishonest
- http://localhost:3300/admin.html

只有 `.env` 中 `DEBUG_LINKS=true` 且非 production 时，URL condition 才生效。

## 7. Participant ID、恢复与完成机制
URL 参数优先级：`participant_id`、`participantId`、`PROLIFIC_PID`、`pid`。保存字段为 `participant_id`。生产环境或 `REQUIRE_PARTICIPANT_ID=true` 时缺失编号不得创建 session。同一 participant_id + Study 复用同一 session；已完成者恢复到完成页。completion code / redirect 只在完成后返回。

## 8. 管理端与数据导出
数据写入 `DATA_DIR`。管理端为 `/admin.html`，所有管理和导出请求都使用 `X-Admin-Token` 请求头。默认不展示、不导出 `is_test_session=true`，可勾选“包含测试 / 调试数据”。

## 9. Render 部署准备
每个 Study 单独创建一个 Web Service。Study 1 disk mount 为 `/var/data`，`DATA_DIR=/var/data/sessions`。生产环境必须设置 `ADMIN_TOKEN`，可手动设置 `COMPLETION_CODE` 和 `COMPLETION_REDIRECT_URL`，不要写入真实值到仓库文件。

## 10. 验收与小 pilot
运行 `npm run smoke`。首次部署后必须做：创建测试 session → 重新部署 → 管理端验证数据仍可导出。正式 pilot 前检查三条件、刷新恢复、重复提交、F 题留空、admin 导出。

## 11. 目录结构
`config/` 保存实验配置；`public/` 保存前端页面与交互；`server/` 保存 Express API、JSON store、导出和 smoke；`data/` 只作为本地数据目录。不要上传 `.env`、`node_modules`、真实 session JSON。

## 12. 已知限制
当前仍是 JSON 文件存储，不是数据库。正式大样本前需要研究团队最终确认奖励参数、completion 设置、招募平台 participant ID 参数名和 Render 持久盘读写。
