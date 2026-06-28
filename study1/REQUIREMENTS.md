# Study 1 Requirements

## 正式设计

Study 1 的唯一 factor 是 `Peer Reporting Behavior Information`。三种条件为：

- `hidden`：每轮四位同事均先提交，但具体数字不可见。
- `honest`：每轮四位同事均按本轮共同骰子结果如实提交。
- `dishonest`：每轮四位同事均提交高于本轮共同骰子结果的数字。

每轮都必须先显示共同骰子结果，再依次显示四位同事的本轮提交，然后参与者在私密卡片中提交。

## 固定流程

```text
同意
-> 4题前测
-> 群体与共享群聊 AI 介绍
-> 规则与理解检查
-> 10轮骰子任务：
   -> 公布本轮所有成员共同看到的骰子结果
   -> 四位同事依次展示本轮提交
   -> 被试通过私密卡选择 1-6
   -> 二次确认
   -> AI 中性确认
   -> 本轮奖励和累计奖励
-> 后测
-> 人口学
-> 事后说明
```

## 必须保持

- 所有人每轮看到同一个共同骰子结果。
- 10 轮骰子序列固定，且不出现 6。
- 三种 condition 使用相同骰子序列。
- 同伴脚本固定并保存在 session 中。
- 参与者最终提交仅自己与群聊 AI 可见。
- 同伴提交不影响参与者个人奖励。
- AI 只执行，不建议、不劝阻、不修改。
- 不向 `/api/config` 暴露未来骰子序列或同伴脚本。
- 同一 Prolific ID 在 Study 1 中只能对应一个 session。

## 数据要求

每轮保存：

- `round_index`
- `true_die_value`
- `peer_records`
- `reported_value`
- `upward_misreport`
- `misreport_magnitude`
- `personal_reward`
- `cumulative_reward`
- `selection_started_at`
- `submitted_at`
- `decision_duration_ms`
- `submission_source`

`selection_started_at` 和 `decision_duration_ms` 必须由服务端控制。
