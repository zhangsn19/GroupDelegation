const { baselineItems, postSurveyStudy1, demographicsItems } = require("./measures");

const FIXED_DICE_SEQUENCE = [3, 5, 2, 4, 1, 3, 2, 5, 4, 1];
const REWARD_PER_POINT = 0.1;

const ruleBlocks = [
  {
    title: "你的群体",
    body: "你与四位同事组成模拟同事群体，并使用同一个共享群聊 AI。"
  },
  {
    title: "每轮共同骰子",
    body: "每一轮开始时，所有成员都会看到同一个骰子结果。随后四位同事会先通过群聊 AI 完成本轮提交。"
  },
  {
    title: "群聊 AI 的角色",
    body: "群聊 AI 只按每位成员自己的选择完成提交，不提供建议、评价、劝阻或修改。"
  },
  {
    title: "你的私密提交",
    body: "同事提交后，你将在私密卡片中选择 1–6 中的一个数字。你的最终提交仅你与群聊 AI 可见，同事看不到，也不会影响你的个人奖励。"
  }
];

const comprehensionQuestions = [
  {
    id: "private_submission",
    prompt: "其他成员能否看到你最终向群聊 AI 提交的骰子点数？",
    correctValue: "no",
    review: "请重新确认：你的最终提交仅你与群聊 AI 可见，其他成员无法查看。",
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
    review: "请重新确认：群聊 AI 只按你的选择执行提交，不替你决定，也不提供建议。",
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
  fixedDiceSequence: FIXED_DICE_SEQUENCE,
  rewardPerPoint: REWARD_PER_POINT,
  pilotNotice: "当前 Study 1 使用固定 10 轮共同骰子序列；正式招募前仍需研究团队确认奖励参数。"
};
