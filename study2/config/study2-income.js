const { baselineItems, demographicsItems } = require("./measures");

const ruleBlocks = [
  {
    title: "你的群体",
    body: "You will complete this task with four other group members. Each group member has an individual task income and submits an individual income report."
  },
  {
    title: "完成任务与个人申报",
    body: "You will first complete four rounds of an odd/even classification task, with eight items per round. Each correct answer earns ¥0.80 in base income.\n\nThe system calculates a speed bonus from the time remaining when you finish the round. The maximum speed bonus is ¥1.00. Actual income for the round = base income + speed bonus.\n\nYour actual income for the reporting stage is the sum of your actual income across the four rounds.\n\nThe task asks each member to report the income they actually earned. After the other group members have reported, you will enter your own reported income in a private panel. The Submission System records the report you choose."
  },
  {
    title: "Privacy and the Submission System",
    body: "Your individual income report will not be shown to the other group members. Each member's task outcome is calculated separately.\n\nEach member decides how much income to report. The Submission System only records the report selected by that member; it does not advise, evaluate, or decide what to report."
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

const agreement = { type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" };
const postSurveyItems = [
  { section: "A", id: "b_peer_truthful_reporting_common", prompt: "During this task, the other group members generally reported their task income truthfully.", ...agreement },
  { section: "A", id: "b_peer_underreporting_common", prompt: "During this task, the other group members generally reported an amount below their actual task income to reduce their individual deduction.", ...agreement },
  { section: "A", id: "c_truthful_reporting_acceptable", prompt: "During this task, the other group members considered reporting their task income truthfully to be appropriate.", ...agreement },
  { section: "A", id: "c_underreporting_acceptable", prompt: "During this task, the other group members considered reporting an amount below their actual task income to reduce one's deduction to be acceptable.", ...agreement },
  { section: "B", id: "peer_influence_self_report", prompt: "The other group members influenced my reporting decision.", ...agreement },
  { section: "B", id: "peer_reports_considered", prompt: "I considered the other group members' income reports when deciding what to report.", visibleOnly: true, ...agreement },
  { section: "B", id: "peer_behavior_appropriateness_influence", prompt: "The behavior of the other group members affected what I considered appropriate to report.", ...agreement },
  { section: "C", id: "e_reflects_my_decision", prompt: "The income amount I reported in the task reflected my own decision.", ...agreement },
  { section: "C", id: "e_personal_responsibility", prompt: "I should take responsibility for the income amount I reported in the task.", ...agreement },
  { section: "C", id: "shared_group_responsibility", prompt: "Responsibility for the task outcome was shared across group members.", ...agreement },
  { section: "C", id: "d_guilt", prompt: "Looking back on the income-reporting task and the amount I reported, I feel guilty.", type: "likert", minLabel: "Not at all", maxLabel: "Very strongly" },
  { section: "C", id: "d_moral_discomfort", prompt: "Looking back on the income-reporting task and the amount I reported, I feel morally uncomfortable.", type: "likert", minLabel: "Not at all", maxLabel: "Very strongly" },
  { section: "D", id: "b_peer_behavior_predictable", prompt: "The information I saw was sufficient for me to judge how the other group members reported their task income.", ...agreement },
  { section: "D", id: "a_truthful_peer_count", prompt: "Looking back on the task, how many of the four other group members reported their task income truthfully?", type: "select", options: [
    { value: "0", label: "0 group members" }, { value: "1", label: "1 group member" },
    { value: "2", label: "2 group members" }, { value: "3", label: "3 group members" },
    { value: "4", label: "4 group members" }, { value: "not_visible", label: "I did not see specific report amounts" },
    { value: "not_sure", label: "I do not remember" }
  ] },
  { section: "D", id: "a_private_submission_understood", prompt: "I understood that my income report was not shown to the other group members.", ...agreement },
  { section: "D", id: "a_independent_reward_understood", prompt: "I understood that the other group members' income reports did not directly determine my individual task reward.", ...agreement },
  { section: "E", id: "identity_recall", prompt: "The other four group members were:", type: "select", options: [
    { value: "human", label: "Human participants" }, { value: "ai", label: "AI agents" },
    { value: "not_sure", label: "Not sure" }
  ] },
  { section: "E", id: "identity_confidence", prompt: "How confident are you about your answer above?", type: "likert", minLabel: "Not at all confident", maxLabel: "Very confident" },
  { section: "E", id: "perceived_peer_agency", prompt: "The other group members seemed to make their own reporting decisions.", ...agreement },
  { section: "F", id: "f_decision_considerations", prompt: "What factors, if any, did you consider when deciding how much income to report during the task?", type: "text", required: false }
];

function postSurveyItemsForCondition(condition) {
  return postSurveyItems.filter((item) => condition !== "hidden" || item.id !== "peer_reports_considered");
}

function ruleBlocksFor(peerIdentity, condition) {
  const identityIntro = peerIdentity === "ai"
    ? "You will complete this task with four AI group members."
    : "You will complete this task with four other human group members.";
  const visibility = condition === "hidden"
    ? "The other group members' report values are not shown in this task. You will see that each member completed a report, but not any actual or reported amount."
    : "Before making your own report, you will see the available actual and reported income information from the other four group members.";
  return ruleBlocks.map((block, index) => index === 0
    ? { ...block, body: `${identityIntro} Each group member has an individual task income and submits an individual income report.\n\n${visibility}` }
    : block);
}

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
  postSurveyItemsForCondition,
  ruleBlocksFor,
  ruleBlocks,
  comprehensionQuestions,
  effortTask
};
