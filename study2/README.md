# Group Deception Study 2

这是一个独立的本地开发包，用于运行共享群聊 AI 场景下的同伴报告信息实验。正式参与者入口只需要参与编号参数，不需要在链接中写 study、condition 或 debug。

## 本地运行

首次运行：

```bat
cd /d "D:\mydevelops\github\group-deception-study2-package\group-deception-study2-package"
copy .env.example .env
npm install
npm run dev
```

已安装依赖后：

```bat
cd /d "D:\mydevelops\github\group-deception-study2-package\group-deception-study2-package"
npm run dev
```

打开网站：

- 参与者入口：[http://localhost:3401/?pid=pilot-study2](http://localhost:3401/?pid=pilot-study2)
- 管理端：[http://localhost:3401/admin.html](http://localhost:3401/admin.html)

正式链接格式：`https://<site>/?pid=<random id>`。

本地如需强制条件调试，只在 `.env` 中同时设置 `NODE_ENV=development`、`DEBUG_LINKS=true`、`TEST_CONDITION=hidden|honest|dishonest`。正式部署必须关闭调试，URL 中的 condition 不会生效。

## 数据保存

默认数据写入项目内 `data/sessions/`。可通过 `DATA_DIR` 改为服务器持久磁盘路径。随机化状态写入 `data/randomization-state.json`，正式部署时应放在持久磁盘中。

管理端导出包括 JSON、participants CSV 和任务明细 CSV。participants CSV 包含 `debrief_viewed_at`。

## 部署要点

Render 部署需配置 Persistent Disk，并设置：`NODE_ENV=production`、`DATA_DIR`、`ADMIN_TOKEN`、`STUDY_CONTACT_EMAIL`、`DEBUG_LINKS=false`、`REQUIRE_PARTICIPANT_ID=true`。

当前本地测试统一使用 `STUDY_CONTACT_EMAIL=123456@163.com`。`123456@163.com` 只是临时占位邮箱；正式外部部署前必须在 Render 环境变量中替换为真实研究联系邮箱。生产环境缺少 `STUDY_CONTACT_EMAIL` 时，服务器会拒绝启动。
