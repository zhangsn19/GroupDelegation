# Development Guide

本包按 peer-reporting-v2 运行。正式入口为 `/?pid=<random id>`，前端不读取 URL 中的 study 或 condition。条件分配由服务器完成；本地调试可用 `TEST_CONDITION`，仅在 development 且 `DEBUG_LINKS=true` 时生效。

数据默认写入 `data/sessions/`，随机化状态写入 `data/randomization-state.json`。Smoke test 使用系统临时目录，不应污染项目 data。

部署到 Render 时必须使用 Persistent Disk，并设置 `STUDY_CONTACT_EMAIL`。当前本地测试值为 `123456@163.com`，这是临时占位邮箱；正式外部部署前必须替换为真实研究联系邮箱。
