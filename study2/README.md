# Study 2：实验二：模拟收入申报任务

## 1. 当前状态
本包是 Study 2 的本地开发包，不是 Git 仓库根目录。当前版本用于本地验收和后续 Render + Persistent Disk pilot 准备。

## 2. 研究设置与不可改变边界
固定五人群体：你、张明、李华、王芳、陈思，以及共享群聊 AI。群聊 AI 只执行申报，不建议、不评价、不修改。参与者最终申报仅自己与 AI 可见，同伴看不到；同伴申报不影响参与者奖励。

## 3. 三个实验条件
唯一 factor 是 Peer Reporting Behavior Information。`hidden`：同伴此前完成收入申报但具体内容不可见。`honest`：同伴按实际收入申报。`dishonest`：同伴申报低于实际收入。

## 4. 参与者流程
同意 → 4 题前测 → 群体与共享群聊 AI 介绍 → 规则与理解检查 → 4 轮收入获取任务 → 查看实际收入 → 同伴记录 → 私密收入申报 → 后测 → 体验题 → 人口学 → 事后说明 → 完成页。

## 5. 任务与关键数据
收入获取任务由服务端发放 `started_at` 和 `deadline_at`，超时计 0。收入申报由服务端记录 `income_report_selection_started_at`、`submitted_at`、`decision_duration_ms`、实际收入、申报收入、模拟扣除和保留奖励。

## 6. 本地运行与调试链接
首次运行：

```bat
cd /d "D:\mydevelops\github\group-deception-study2-package\group-deception-study2-package"
copy .env.example .env
npm install
npm run dev
```

调试链接示例：
- http://localhost:3301/?study=study2&condition=hidden
- http://localhost:3301/?study=study2&condition=honest
- http://localhost:3301/?study=study2&condition=dishonest
- http://localhost:3301/admin.html

只有 `.env` 中 `DEBUG_LINKS=true` 且非 production 时，URL condition 才生效。

## 7. Participant ID、恢复与完成机制
URL 参数优先级：`participant_id`、`participantId`、`PROLIFIC_PID`、`pid`。保存字段为 `participant_id`。生产环境或 `REQUIRE_PARTICIPANT_ID=true` 时缺失编号不得创建 session。同一 participant_id + Study 复用同一 session；已完成者恢复到完成页。completion code / redirect 只在完成后返回。

## 8. 管理端与数据导出
数据写入 `DATA_DIR`。管理端为 `/admin.html`，所有管理和导出请求都使用 `X-Admin-Token` 请求头。默认不展示、不导出 `is_test_session=true`，可勾选“包含测试 / 调试数据”。

## 9. Render 部署准备
每个 Study 单独创建一个 Web Service。Study 2 disk mount 为 `/var/data`，`DATA_DIR=/var/data/sessions`。生产环境必须设置 `ADMIN_TOKEN`，可手动设置 `COMPLETION_CODE` 和 `COMPLETION_REDIRECT_URL`，不要写入真实值到仓库文件。

## 10. 验收与小 pilot
运行 `npm run smoke`。首次部署后必须做：创建测试 session → 重新部署 → 管理端验证数据仍可导出。正式 pilot 前检查三条件、刷新恢复、重复提交、F 题留空、admin 导出和收入模板校准状态。

## 11. 目录结构
`config/` 保存实验配置；`public/` 保存前端页面与交互；`server/` 保存 Express API、JSON store、导出和 smoke；`data/` 只作为本地数据目录。不要上传 `.env`、`node_modules`、真实 session JSON。

## 12. 已知限制
四位脚本同事的收入模板金额，需要在 hidden 小 pilot 收到 5–10 名参与者真实收入分布后再校准；当前不得直接将该模板用于大规模正式样本。当前仍是 JSON 文件存储，不是数据库。
