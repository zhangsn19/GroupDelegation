const { baselineItems, postSurveyStudy1, demographicsItems } = require("./measures");

const PILOT_DICE_SEQUENCES = [
  [3, 5, 2, 4, 1, 6, 3, 2, 5, 4],
  [2, 4, 6, 1, 5, 3, 4, 2, 6, 3],
  [5, 1, 3, 6, 2, 4, 1, 5, 3, 2]
];

const REWARD_PER_POINT = 0.1;

const ruleBlocks = [
  {
    title: "你的群体",
    body: "你与四位同事组成模拟同事群体，并使用同一个共享群聊 AI。"
  },
  {
    title: "群聊 AI 的角色",
    body: "每位成员独立决定自己的报告内容。群聊 AI 只按该成员的选择完成提交，不提供建议、评价或修改。"
  },
  {
    title: "个人奖励与私密性",
    body: "每个人的奖励独立计算。其他成员的提交不会影响你的奖励；其他成员无法看到你的最终提交。"
  },
  {
    title: "骰子任务",
    body: "你将完成 10 轮任务。每轮会看到真实骰子结果，并可选择让群聊 AI 提交 1-6 中任意数字。提交数字越高，本轮个人奖励越高。"
  }
];

const comprehensionQuestions = [
  {
    id: "private_submission",
    prompt: "其他成员能否看到你最终提交的骰子点数？",
    correctValue: "no",
    review: "请重新确认：你的最终提交仅你与群聊 AI 可见。",
    options: [
      { value: "yes", label: "能，所有同事都可以看到" },
      { value: "no", label: "不能，只有我和群聊 AI 可以看到" },
      { value: "after", label: "任务结束后同事可以看到" }
    ]
  },
  {
    id: "independent_rewards",
    prompt: "其他成员提交什么，是否会改变你的个人奖励？",
    correctValue: "no_change",
    review: "请重新确认：每个人的奖励独立计算，其他成员的提交不会改变你的个人奖励。",
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
    review: "请重新确认：群聊 AI 只按你的选择执行提交，不替你决定。",
    options: [
      { value: "executes", label: "按我的选择执行提交，不替我决定" },
      { value: "decides", label: "根据任务情况替我决定提交内容" },
      { value: "advises", label: "判断哪种提交更合适并给我建议" }
    ]
  }
];

module.exports = {
  id: "study1",
  title: "团队报告与决策研究",
  taskName: "骰子上报任务",
  baselineItems,
  postSurveyItems: postSurveyStudy1,
  demographicsItems,
  ruleBlocks,
  comprehensionQuestions,
  pilotDiceSequences: PILOT_DICE_SEQUENCES,
  rewardPerPoint: REWARD_PER_POINT,
  pilotNotice: "当前使用 pilot 默认骰子序列与每点奖励，正式招募前需冻结参数。"
};
