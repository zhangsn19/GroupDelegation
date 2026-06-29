const { baselineItems, demographicsItems } = require("./measures");

const ruleBlocks = [
  {
    title: "你的群体",
    body: "你与四位同事组成模拟同事群体，并使用同一个共享群聊 AI。"
  },
  {
    title: "群聊 AI 的角色",
    body: "每位成员独立决定自己的申报内容。群聊 AI 只按该成员的选择完成提交，不提供建议、评价或修改。"
  },
  {
    title: "收入与私密性",
    body: "你的实际收入由努力任务表现决定。后续收入申报仅你与群聊 AI 可见，其他成员无法查看。"
  },
  {
    title: "收入申报任务",
    body: "你将完成 4 轮奇偶数分类任务获得实际收入，随后选择要申报的收入金额。模拟扣除金额 = 申报收入 × 0.5。任务保留奖励 = 实际收入 − 模拟扣除金额。在其他条件相同的情况下，申报收入越低，任务保留奖励越高。"
  }
];

const comprehensionQuestions = [
  {
    id: "private_submission",
    prompt: "其他成员能否看到你的最终收入申报？",
    correctValue: "no",
    review: "请重新确认：你的最终收入申报仅你与群聊 AI 可见。",
    options: [
      { value: "yes", label: "能，所有同事都可以看到" },
      { value: "no", label: "不能，只有我和群聊 AI 可以看到" },
      { value: "after", label: "任务结束后同事可以看到" }
    ]
  },
  {
    id: "independent_rewards",
    prompt: "其他成员申报什么，是否会改变你的个人奖励？",
    correctValue: "no_change",
    review: "请重新确认：每个人的奖励独立计算，其他成员的申报不会改变你的个人奖励。",
    options: [
      { value: "increase", label: "会提高我的个人奖励" },
      { value: "decrease", label: "会降低我的个人奖励" },
      { value: "no_change", label: "不会改变" }
    ]
  },
  {
    id: "ai_role",
    prompt: "群聊 AI 在本任务中的角色是什么？",
    correctValue: "executes",
    review: "请重新确认：群聊 AI 只按你的选择执行收入申报，不替你决定。",
    options: [
      { value: "executes", label: "按我的选择执行提交，不替我决定" },
      { value: "decides", label: "根据收入情况替我决定申报金额" },
      { value: "advises", label: "判断怎样申报更合适并给我建议" }
    ]
  }
];

const postSurveyItems = [
  { section: "A", id: "a_specific_peer_records_seen", prompt: "在我作出自己的最终申报前，我看到了其他成员此前向群聊 AI 提交的具体申报内容。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  {
    section: "A",
    id: "a_condition_memory",
    prompt: "根据刚才看到的信息，其他成员此前的申报情况最接近哪一种？",
    type: "select",
    options: [
      "我没有看到其他成员的具体申报内容",
      "其他成员大多如实申报了实际收入",
      "其他成员大多申报了低于实际收入的金额",
      "其他成员的申报情况混合且不一致",
      "我不记得"
    ]
  },
  { section: "A", id: "a_private_submission_understood", prompt: "我理解其他成员无法看到我最终向群聊 AI 提交的收入申报。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_independent_reward_understood", prompt: "我理解其他成员的申报不会改变我的个人奖励。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_ai_executes_understood", prompt: "我理解在本任务中，群聊 AI 只负责执行申报，不替成员决定应申报多少收入。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_truthful_reporting_common", prompt: "在这个群聊中，其他成员通常会如实申报自己实际获得的收入。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_underreporting_common", prompt: "在这个群聊中，其他成员通常会为了增加个人奖励而申报低于实际获得的收入。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_behavior_predictable", prompt: "我刚才看到的信息，足以让我判断这个群聊中其他成员通常会如何申报收入。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_truthful_reporting_acceptable", prompt: "在这个群聊中，其他成员认为如实申报实际收入是应该的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_underreporting_acceptable", prompt: "在这个群聊中，其他成员认为为了增加个人奖励而申报低于实际获得的收入是可以接受的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "D", id: "d_guilt", prompt: "回顾刚才的收入申报任务和我的最终提交，我感到内疚。", type: "likert", minLabel: "完全没有", maxLabel: "非常强烈" },
  { section: "D", id: "d_moral_discomfort", prompt: "回顾刚才的收入申报任务和我的最终提交，我感到道德上的不安。", type: "likert", minLabel: "完全没有", maxLabel: "非常强烈" },
  { section: "E", id: "e_reflects_my_decision", prompt: "我最终申报的收入反映了我自己的决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_personal_responsibility", prompt: "我应当为自己最终申报的收入承担责任。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_followed_choice", prompt: "群聊 AI 按照我的选择完成了收入申报。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_influenced_decision", prompt: "群聊 AI 影响了我最终决定申报多少收入。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_decided_outcome", prompt: "我认为最终申报的收入主要由群聊 AI 决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "F", id: "f_decision_considerations", prompt: "请简要说明：在决定最终申报多少收入时，你主要考虑了哪些因素？", type: "text", required: false },
  { section: "F", id: "f_design_influences", prompt: "任务中是否有任何信息或设计影响了你的决定？例如其他成员的申报情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有，也请说明。", type: "text", required: false }
];

const experienceItems = [
  { id: "income_reporting_familiarity", prompt: "我熟悉收入、报销或税务申报的基本流程。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { id: "income_reporting_experience", prompt: "我曾自行填写、核对或提交过收入、报销、费用或税务申报。", type: "likert", minLabel: "从未", maxLabel: "非常频繁" }
];

const effortTask = {
  rounds: 4,
  numbersPerRound: 8,
  timeLimitSeconds: 30,
  incomePerCorrectCents: 8,
  speedBonusMaxCents: 10,
  reportStepCents: 1,
  deductionRate: 0.5,
  pilotNotice: "当前使用 Study 2 pilot 默认参数：4 轮、每轮 8 个数字、每题 ¥0.08、最高速度奖励 ¥0.10、申报最小单位 ¥0.01、扣除率 0.5。正式招募前需冻结。"
};

module.exports = {
  id: "study2",
  title: "团队报告与决策研究",
  taskName: "收入申报任务",
  baselineItems,
  demographicsItems,
  experienceItems,
  postSurveyItems,
  ruleBlocks,
  comprehensionQuestions,
  effortTask
};
