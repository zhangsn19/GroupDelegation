const baselineItems = [
  {
    id: "ai_use_frequency",
    prompt: "过去三个月，我使用 AI 工具协助学习、工作或日常事务的频率是。",
    minLabel: "从不",
    maxLabel: "非常频繁"
  },
  {
    id: "ai_execution_experience",
    prompt: "过去三个月，我曾使用 AI 或自动化工具代替我完成、提交、发送或执行具体任务的频率是。",
    minLabel: "从不",
    maxLabel: "非常频繁"
  },
  {
    id: "ai_execution_trust",
    prompt: "当任务规则明确、步骤固定时，我相信 AI 能按我的指令完成任务。",
    minLabel: "非常不同意",
    maxLabel: "非常同意"
  },
  {
    id: "ai_execution_willingness",
    prompt: "对于规则明确、步骤固定的任务，我愿意让 AI 按我的指令代为执行。",
    minLabel: "非常不同意",
    maxLabel: "非常同意"
  }
];

const conditionMemoryOptionsStudy1 = [
  "我没有看到其他成员的具体提交内容",
  "其他成员大多如实提交了骰子点数",
  "其他成员大多提交了高于真实骰子点数的数字",
  "其他成员的提交情况混合且不一致",
  "我不记得"
];

const postSurveyStudy1 = [
  { section: "A", id: "a_specific_peer_records_seen", prompt: "在我作出自己的最终提交前，我看到了其他成员此前向群聊 AI 提交的具体内容。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_condition_memory", prompt: "根据刚才看到的信息，其他成员此前的提交情况最接近哪一种？", type: "select", options: conditionMemoryOptionsStudy1 },
  { section: "A", id: "a_private_submission_understood", prompt: "我理解其他成员无法看到我最终向群聊 AI 提交的骰子点数。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_independent_reward_understood", prompt: "我理解其他成员的提交不会改变我的个人奖励。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_ai_executes_understood", prompt: "我理解在本任务中，群聊 AI 只负责执行提交，不替成员决定应提交什么骰子点数。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_true_reporting_common", prompt: "在这个群聊中，其他成员通常会如实提交自己看到的骰子点数。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_reward_reporting_common", prompt: "在这个群聊中，其他成员通常会为了增加个人奖励而提交高于真实骰子点数的数字。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_behavior_predictable", prompt: "我刚才看到的信息，足以让我判断这个群聊中其他成员通常会如何提交骰子点数。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_true_reporting_acceptable", prompt: "在这个群聊中，其他成员认为如实提交骰子点数是应该的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_reward_reporting_acceptable", prompt: "在这个群聊中，其他成员认为为了增加个人奖励而提交高于真实骰子点数的数字是可以接受的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "D", id: "d_guilt", prompt: "回顾刚才的骰子任务和我的最终提交，我感到内疚。", type: "likert", minLabel: "完全没有", maxLabel: "非常强烈" },
  { section: "D", id: "d_moral_discomfort", prompt: "回顾刚才的骰子任务和我的最终提交，我感到道德上的不安。", type: "likert", minLabel: "完全没有", maxLabel: "非常强烈" },
  { section: "E", id: "e_reflects_my_decision", prompt: "我最终提交的骰子点数反映了我自己的决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_personal_responsibility", prompt: "我应当为自己最终提交的骰子点数承担责任。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_followed_choice", prompt: "群聊 AI 按照我的选择完成了提交。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_influenced_decision", prompt: "群聊 AI 影响了我最终决定提交什么点数。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_decided_outcome", prompt: "我认为最终提交的骰子点数主要由群聊 AI 决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "F", id: "f_decision_considerations", prompt: "请简要说明：在决定最终提交什么骰子点数时，你主要考虑了哪些因素？", type: "text" },
  { section: "F", id: "f_design_influences", prompt: "任务中是否有任何信息或设计影响了你的决定？例如其他成员的提交情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有，也请说明。", type: "text" }
];

const demographicsItems = [
  { id: "age", prompt: "年龄", type: "number", min: 18, max: 100 },
  { id: "gender", prompt: "性别", type: "select", options: ["女性", "男性", "非二元／其他", "不愿回答"] },
  { id: "education", prompt: "最高教育程度", type: "select", options: ["高中及以下", "大专", "本科", "硕士", "博士", "其他", "不愿回答"] }
];

module.exports = {
  baselineItems,
  conditionMemoryOptionsStudy1,
  postSurveyStudy1,
  demographicsItems
};
