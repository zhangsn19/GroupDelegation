# PILOT_CHECKLIST：Study 2

- [ ] `npm run smoke` 通过，且使用系统临时 DATA_DIR。
- [ ] hidden / honest / dishonest 三条件可打开。
- [ ] 4 轮收入获取任务、超时归零和收入申报均可完成。
- [ ] 刷新后恢复原 session、轮次和计时。
- [ ] 重复点击不会产生重复提交。
- [ ] F1/F2 留空可继续，A–E 漏题会被拦截。
- [ ] admin 未带 token 被拒绝，正确 token 可导出。
- [ ] 默认不导出测试数据，勾选后才导出。
- [ ] production 缺 ADMIN_TOKEN / DATA_DIR 会拒绝启动。
- [ ] Render 重部署后 Persistent Disk 数据仍可导出。
- [ ] 收入模板校准前不得进入大规模正式样本。
