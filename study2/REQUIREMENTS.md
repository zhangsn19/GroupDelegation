# Study 2 Requirements

## 目标

Study 2 研究共享群聊 AI 代为提交个人收入申报时，同事此前收入申报行为信息是否影响参与者随后的私密收入申报。

核心链条：

`同事此前收入申报信息 -> 感知描述性/认可性规范 -> 参与者低报行为`

## 唯一 factor

变量：`condition`

- `hidden`：知道同事此前完成了收入申报，但看不到具体实际收入或申报金额。
- `honest`：看到同事此前均如实申报，实际收入等于申报收入。
- `dishonest`：看到同事此前均低报，申报收入低于实际收入。

不得新增其他 factor，不得把任务改成团队收益、实时从众、AI 建议或自由聊天。

## 固定流程

1. 知情同意
2. AI 使用背景题
3. 群体与群聊 AI 说明
4. 收入申报任务规则
5. 理解检查
6. 4 轮奇偶数努力任务
7. 展示个人实际收入
8. 展示同事此前收入申报记录
9. 私密收入申报
10. 任务后问卷
11. 收入申报经验题
12. 人口学
13. 事后说明

## 努力任务

- 4 轮。
- 每轮 8 个两位数。
- 参与者判断奇偶。
- 服务器生成题目、开始时间、截止时间和最终收入。
- 前端只显示倒计时和提交答案。
- 每轮保存：题目、答案、正确数、`started_at`、`deadline_at`、`submitted_at`、`duration_ms`、`timed_out`、`income_cents`。

## 收入申报

所有内部计算使用整数 cents。

- `actual_income_cents`：努力任务产生的实际收入。
- `reported_income_cents`：参与者申报收入，范围为 0 到实际收入。
- `deductionRate`：固定扣除率，目前 pilot 默认 0.5。
- `deduction_cents = round(deductionRate * reported_income_cents)`。
- `retained_reward_cents = actual_income_cents - deduction_cents`。

界面文字使用“模拟扣除金额”和“任务保留奖励”。

## 同事记录模板

四位同事固定为：张明、李华、王芳、陈思。

| 姓名 | 实际收入 | honest 申报 | dishonest 申报 |
| --- | ---: | ---: | ---: |
| 张明 | 1.10 | 1.10 | 0.55 |
| 李华 | 0.95 | 0.95 | 0.50 |
| 王芳 | 1.25 | 1.25 | 0.60 |
| 陈思 | 1.05 | 1.05 | 0.45 |

hidden 条件不显示具体金额，只显示已完成和无法查看具体内容。

## 数据与恢复

- 每个 session 保存为一个 JSON 文件。
- 同一 Prolific ID 只能对应一个 session。
- 未完成时按 `status` 恢复；已完成时返回完成状态，不重新分配条件。
- 收入申报只能提交一次。
- 后测、经验题和人口学均需服务端校验。

状态顺序：

`created -> consented -> baseline_completed -> rules_viewed -> comprehension_passed -> effort_in_progress -> effort_completed -> income_viewed -> peer_records_viewed -> income_report_completed -> post_survey_completed -> experience_completed -> demographics_completed -> completed`

## 尚未冻结参数

- 努力任务时间限制。
- 每题收入和速度奖励。
- `deductionRate`。
- Prolific 支付和 completion code。
- 正式剔除规则。
- 样本量与 power analysis。
- 正式伦理审批文本。
