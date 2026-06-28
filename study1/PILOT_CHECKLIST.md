# Study 1 Pilot Checklist

## 实验逻辑

- [ ] 唯一 factor 是 `Peer Reporting Behavior Information`。
- [ ] 三种 condition 只有 `hidden`、`honest`、`dishonest`。
- [ ] 理解检查后直接进入第 1 轮，不出现任务前 condition-specific 样例展示。
- [ ] 每轮先公布本轮共同骰子结果。
- [ ] 每轮四位同事依次展示本轮提交。
- [ ] 同事提交后，参与者才看到私密锁定提交卡。
- [ ] 参与者提交前有二次确认。
- [ ] 群聊 AI 只中性确认执行，不建议、不劝阻、不修改数字。

## 同伴脚本

- [ ] 10 轮共同骰子序列固定。
- [ ] 10 轮共同骰子都不为 6。
- [ ] 三种 condition 使用相同骰子序列。
- [ ] 每轮四位同伴的 `trueValue` 等于参与者本轮共同骰子。
- [ ] hidden 不显示具体提交数字。
- [ ] honest 每位同伴 `reportedValue === trueValue`。
- [ ] dishonest 每位同伴 `reportedValue > trueValue`。
- [ ] 同伴姓名、顺序、消息数量、延迟和布局在三条件中一致。

## 数据与恢复

- [ ] 服务端保存每轮 `selection_started_at`。
- [ ] 服务端计算 `decision_duration_ms`，不相信前端传入时长。
- [ ] 刷新页面不重置本轮开始时间。
- [ ] 同一轮重复提交不会新增第二条记录。
- [ ] 同一 Prolific ID 未完成时恢复原 session。
- [ ] 同一 Prolific ID 完成后显示完成状态，不新建 session。
- [ ] `DEBUG_LINKS=false` 时 URL condition 无效。
- [ ] `/api/config` 不暴露未来骰子序列或同伴脚本。

## 问卷

- [ ] Study 1 后测使用最终 A-F 题库。
- [ ] A2 是预设选项单选题。
- [ ] D1/D2 量尺为 `1 = 完全没有` 到 `7 = 非常强烈`。
- [ ] 所有 Likert 项服务端校验为 1-7。
- [ ] A2 服务端校验为预设选项。

## 验证

- [ ] `npm run smoke` 通过。
- [ ] smoke test 使用临时数据目录。
- [ ] 管理端导出包含 `participants.csv` 和 `study1_dice_rounds.csv`。
- [ ] README 和 DEVELOPMENT_GUIDE 均描述为每轮展示同伴本轮提交。
