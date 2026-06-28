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

const postSurveyStudy1 = [
  { section: "A", id: "a_specific_peer_records_seen", prompt: "我看到了同事此前报告记录中的具体提交内容。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_condition_memory", prompt: "我能清楚回忆同事此前记录的大致情况。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_private_submission_understood", prompt: "我理解自己的最终提交只有我和群聊 AI 可以看到。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_independent_reward_understood", prompt: "我理解其他成员的提交不会改变我的个人奖励。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "A", id: "a_ai_executes_understood", prompt: "我理解群聊 AI 只是按我的选择完成提交。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_true_reporting_common", prompt: "在类似任务中，同事通常会按看到的真实点数提交。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_reward_reporting_common", prompt: "在类似任务中，同事通常会提交更高点数来增加个人奖励。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "B", id: "b_peer_behavior_predictable", prompt: "同事在这类报告任务中的做法比较容易判断。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_true_reporting_acceptable", prompt: "同事会认为按真实点数提交是可以接受的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "C", id: "c_reward_reporting_acceptable", prompt: "同事会认为提交更高点数来增加个人奖励是可以接受的。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "D", id: "d_guilt", prompt: "完成任务后，我感到内疚。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "D", id: "d_moral_discomfort", prompt: "完成任务后，我感到道德上的不安。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_reflects_my_decision", prompt: "最终提交反映了我自己的决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_personal_responsibility", prompt: "我认为自己应为最终提交承担责任。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_followed_choice", prompt: "群聊 AI 按我的选择执行了提交。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_influenced_decision", prompt: "群聊 AI 影响了我的决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "E", id: "e_ai_decided_outcome", prompt: "最终结果主要由群聊 AI 决定。", type: "likert", minLabel: "非常不同意", maxLabel: "非常同意" },
  { section: "F", id: "f_decision_considerations", prompt: "决定最终提交时，你主要考虑了什么？", type: "text" },
  { section: "F", id: "f_design_influences", prompt: "同伴信息、AI 角色、奖励规则或其他设计中，哪些影响了你的决定？", type: "text" }
];

const demographicsItems = [
  { id: "age", prompt: "年龄", type: "number", min: 18, max: 100 },
  { id: "gender", prompt: "性别", type: "select", options: ["女性", "男性", "非二元／其他", "不愿回答"] },
  { id: "education", prompt: "最高教育程度", type: "select", options: ["高中及以下", "大专", "本科", "硕士", "博士", "其他", "不愿回答"] }
];

module.exports = {
  baselineItems,
  postSurveyStudy1,
  demographicsItems
};
