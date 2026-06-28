# Study 2 Pilot Checklist

## 研究逻辑

- [ ] 只有 `hidden`、`honest`、`dishonest` 三种条件。
- [ ] 条件差异只出现在同事此前收入申报记录页。
- [ ] 没有团队共同收益、实时监督、AI 建议、自由聊天或 LLM 实时回复。
- [ ] 同事姓名、顺序、数量和布局在三种条件中一致。
- [ ] 参与者最终收入申报只显示在私密面板中。

## 收入与计时

- [ ] 所有收入相关字段内部使用整数 cents。
- [ ] 精确申报实际收入合法，例如实际收入 `￥2.73` 时可申报 `￥2.73`。
- [ ] 申报收入不能小于 0，不能超过实际收入。
- [ ] `deduction_cents = round(deductionRate * reported_income_cents)`。
- [ ] `retained_reward_cents = actual_income_cents - deduction_cents`。
- [ ] 努力任务 `started_at`、`deadline_at`、`duration_ms` 由服务器控制。
- [ ] 超时自动提交并保存 `timed_out`。

## 同伴记录

- [ ] hidden 显示“已完成”与“当前信息设置下无法查看具体内容”。
- [ ] honest 中四位同事实际收入等于申报收入。
- [ ] dishonest 中四位同事申报收入均低于实际收入。
- [ ] 固定模板：
  - 张明：1.10，dishonest 0.55
  - 李华：0.95，dishonest 0.50
  - 王芳：1.25，dishonest 0.60
  - 陈思：1.05，dishonest 0.45
- [ ] session JSON 保存实际呈现的同伴记录 snapshot。

## 问卷与状态

- [ ] 条件回忆题为单选题，选项包含 hidden/honest/dishonest/mixed/不记得。
- [ ] C1、D1、D2 和申报经验题文本与最新设计一致。
- [ ] 后测、经验题、人口学均由服务器验证类型与范围。
- [ ] 状态顺序包含 `experience_completed`。
- [ ] demographics 必须在 experience 完成后才能提交。
- [ ] 同一 Prolific ID 不能新建第二个 session；未完成则恢复，完成则返回完成状态。

## 运行与部署

- [ ] `npm run smoke` 通过。
- [ ] `render.yaml` 服务名为 `group-deception-study2`。
- [ ] 生产环境 `DEBUG_LINKS=false`，且 URL `condition` 不生效。
- [ ] README、需求文档和开发文档不再出现旧端口或旧项目说明。
- [ ] `data/sessions/` 中只保留 `.gitkeep`，不提交真实 session。
