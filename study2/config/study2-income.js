const { baselineItems, demographicsItems } = require("./measures");

const ruleBlocks = [
  {
    title: "你的群体",
    body: "你将与四位同事组成模拟同事群体，并通过同一个共享群聊 AI 完成个人收入申报。"
  },
  {
    title: "完成任务与个人申报",
    body: "你将先完成 4 轮奇偶数分类任务，每轮包含 8 题。每答对 1 题可获得 ¥0.80 的基础收入。\n\n系统会根据完成该轮任务时的剩余时间计算速度奖励，速度奖励最高为 ¥1.00。本轮实际收入 = 基础收入 + 速度奖励。\n\n4 轮本轮实际收入之和，构成后续收入申报阶段显示的“实际收入”。\n\n任务要求成员申报自己在任务中实际获得的收入。其他成员完成申报后，你将在个人面板中填写自己的申报收入，并由群聊 AI 提交。"
  },
  {
    title: "私密性与群聊 AI",
    body: "你的个人收入申报不会向其他成员展示；每位成员的任务结果分别结算。\n\n群聊 AI 负责接收并提交每位成员的个人申报。每位成员自行决定自己的申报金额。"
  },
  {
    title: "任务报酬如何计算",
    body: "实际收入是任务计算的基数，不等同于最终计入被试费的任务报酬。\n\n模拟扣除金额 = 申报收入 × 0.5\n\n任务保留奖励 = 实际收入 − 模拟扣除金额\n\n最终被试费由基础参与报酬和任务保留奖励构成。\n\n例如：若实际收入为 ¥20.00，申报收入为 ¥10.00，\n则模拟扣除金额为 ¥5.00，任务保留奖励为 ¥15.00。\n\n在其他条件相同的情况下，申报收入越低，任务保留奖励越高。"
  }
];

const comprehensionQuestions = [
  {
    id: "reported_object",
    prompt: "本任务要求成员申报什么？",
    correctValue: "actual_income",
    review: "请重新确认：本任务要求成员申报自己在任务中实际获得的收入。",
    options: [
      { value: "actual_income", label: "自己在任务中实际获得的收入" },
      { value: "desired_income", label: "自己希望获得的收入" },
      { value: "peer_income", label: "其他成员的收入" }
    ]
  },
  {
    id: "private_submission",
    prompt: "其他成员能否查看你的个人收入申报？",
    correctValue: "no",
    review: "请重新确认：你的个人收入申报不会向其他成员展示。",
    options: [
      { value: "yes", label: "可以" },
      { value: "no", label: "不可以" },
      { value: "after", label: "任务结束后可以" }
    ]
  },
  {
    id: "reward_direction",
    prompt: "若你的实际收入为 ¥20.00，申报收入为 ¥10.00，\n模拟扣除金额和任务保留奖励分别是多少？\n\n提示：先用申报收入 × 0.5 计算模拟扣除金额，\n再用实际收入 − 模拟扣除金额计算任务保留奖励。",
    correctValue: "deduction_500_retained_1500",
    review: "请重新确认：模拟扣除金额为 ¥5.00；任务保留奖励为 ¥15.00。",
    options: [
      { value: "deduction_500_retained_1500", label: "模拟扣除金额为 ¥5.00；任务保留奖励为 ¥15.00。" },
      { value: "deduction_1000_retained_1000", label: "模拟扣除金额为 ¥10.00；任务保留奖励为 ¥10.00。" },
      { value: "deduction_500_retained_500", label: "模拟扣除金额为 ¥5.00；任务保留奖励为 ¥5.00。" },
      { value: "deduction_1500_retained_500", label: "模拟扣除金额为 ¥15.00；任务保留奖励为 ¥5.00。" }
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
  { section: "F", id: "f_design_influences", prompt: "任务中是否有任何信息或设计影响了你的决定？例如其他成员的申报情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有或不想补充，也可留空。", type: "text", required: false }
];

const experienceItems = [
  { id: "income_reporting_familiarity", prompt: "我熟悉收入、报销或税务申报的基本流程。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { id: "income_reporting_experience", prompt: "我曾自行填写、核对或提交过收入、报销、费用或税务申报。", type: "likert", minLabel: "从未", maxLabel: "非常频繁" }
];

const effortTask = {
  rounds: 4,
  numbersPerRound: 8,
  timeLimitSeconds: 30,
  incomePerCorrectCents: 80,
  speedBonusMaxCents: 100,
  reportStepCents: 10,
  deductionRate: 0.5,
  pilotNotice: "当前使用 Study 2 pilot 默认参数：4 轮、每轮 8 个数字、每题 ¥0.80、最高速度奖励 ¥1.00、申报最小单位 ¥0.10、扣除率 0.5。正式招募前需冻结。"
};

module.exports = {
  id: "study2",
  title: "实验二：收入申报任务",
  taskName: "收入申报任务",
  baselineItems,
  demographicsItems,
  experienceItems,
  postSurveyItems,
  ruleBlocks,
  comprehensionQuestions,
  effortTask
};
