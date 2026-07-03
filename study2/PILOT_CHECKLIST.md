# Pilot Checklist

- [ ] 正式参与者链接只包含 pid，不包含 study、condition 或 debug。
- [ ] /api/config 不暴露 condition、debug 或 require participant id 信息。
- [ ] 公开 session 响应不暴露 condition、condition_label、debug_mode 或 randomization 字段。
- [ ] 前测 4 题为 5 点量表；后测/体验题保持 7 点量表。
- [ ] 理解检查为 3 题，并确认正式题目文案。
- [ ] 事后说明展示参与编号和研究联系邮箱，可复制参与编号。
- [ ] 管理端导出可下载 JSON、participants CSV 和任务明细 CSV。
- [ ] Render 配置持久磁盘、ADMIN_TOKEN、STUDY_CONTACT_EMAIL、DEBUG_LINKS=false。
