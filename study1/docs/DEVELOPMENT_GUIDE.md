# DEVELOPMENT_GUIDE：Study 1

## 本地启动
```bat
cd /d "D:\mydevelops\github\group-deception-study1-package\group-deception-study1-package"
copy .env.example .env
npm install
npm run dev
```

## .env 与临时 DATA_DIR
开发时可设置 `DEBUG_LINKS=true`、`REQUIRE_PARTICIPANT_ID=false`。临时验收建议设置 `DATA_DIR=%TEMP%\group-deception-study1-final-preview`。

## Debug URL
- http://localhost:3300/?study=study1&condition=hidden
- http://localhost:3300/?study=study1&condition=honest
- http://localhost:3300/?study=study1&condition=dishonest

## Smoke
运行 `npm run smoke`。脚本默认写系统临时目录，不应污染项目 `data/sessions/`。

## 导出与查看 session
管理端 `/admin.html` 输入 token 后导出。JSON session 存在 `DATA_DIR`，不要把真实 session JSON 上传或打包。

## 生产环境变量
必须设置 `NODE_ENV=production`、`DATA_DIR=/var/data/sessions`、`ADMIN_TOKEN`、`REQUIRE_PARTICIPANT_ID=true`、`DEBUG_LINKS=false`。`COMPLETION_CODE` 和 `COMPLETION_REDIRECT_URL` 只在服务端环境变量中配置。

## Render 配置
使用独立 Web Service，Persistent Disk mountPath 为 `/var/data`，health check 为 `/health`。

## 常见错误排查
缺 participant ID：检查招募平台 URL 参数。admin 401：检查 `X-Admin-Token`。刷新丢进度：检查是否使用同一 participant_id 和 DATA_DIR。

## 禁止操作
不要运行 Git，不要部署真实服务，不要删除 data、node_modules、.gitkeep、.env.example，不要修改 GroupDelegation。
