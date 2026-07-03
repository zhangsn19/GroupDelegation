const { baselineItems, postSurveyStudy1, demographicsItems } = require("./measures");

const FIXED_DICE_SEQUENCE = [3, 5, 2, 4, 1, 3, 2, 5, 4, 1];
const REWARD_PER_POINT = 1;

const ruleBlocks = [
  {
    title: "你的群体",
    body: "你与四位同事组成模拟同事群体，并使用同一个共享群聊 AI。"
  },
  {
    title: "每轮共同骰子",
    body: "每一轮开始时，所有成员都会看到同一个骰子结果。任务要求成员报告本轮共同看到的骰子结果。随后，其他成员会先完成本轮报告。"
  },
  {
    title: "群聊 AI 的角色",
    body: "群聊 AI 负责接收并提交每位成员的个人报告。每位成员自行决定自己的报告内容。"
  },
  {
    title: "你的个人报告",
    body: "其他成员完成报告后，你将在个人报告卡片中选择 1–6 中的一个数字。你的个人报告不会向其他成员展示。每位成员的任务结果分别结算。"
  },
  {
    title: "任务报酬",
    body: "每轮任务报酬 = 你提交的数字 × ¥1。在其他条件相同的情况下，提交数字越高，本轮任务报酬越高。完成全部流程后，你将获得基础参与报酬；任务报酬将根据页面规则计入最终被试费。"
  }
];

const comprehensionQuestions = [
  {
    id: "reported_object",
    prompt: "本轮任务要求成员报告什么？",
    correctValue: "common_die",
    review: "请重新确认：任务要求成员报告本轮共同看到的骰子结果。",
    options: [
      { value: "common_die", label: "本轮共同看到的骰子结果" },
      { value: "private_preference", label: "自己希望获得的奖励" },
      { value: "other_members", label: "其他成员提交的数字" }
    ]
  },
  {
    id: "private_submission",
    prompt: "其他成员能否查看你的个人报告？",
    correctValue: "no",
    review: "请重新确认：你的个人报告不会向其他成员展示。",
    options: [
      { value: "yes", label: "可以" },
      { value: "no", label: "不可以" },
      { value: "after", label: "任务结束后可以" }
    ]
  },
  {
    id: "reward_direction",
    prompt: "本轮提交数字与任务报酬的关系最符合下列哪一项？",
    correctValue: "higher_reward",
    review: "请重新确认：在其他条件相同的情况下，提交数字越高，本轮任务报酬越高。",
    options: [
      { value: "higher_reward", label: "提交数字越高，本轮任务报酬越高" },
      { value: "lower_reward", label: "提交数字越低，本轮任务报酬越高" },
      { value: "unrelated", label: "提交数字与本轮任务报酬无关" }
    ]
  }
];

module.exports = {
  id: "study1",
  title: "实验一：骰子结果申报任务",
  taskName: "骰子结果申报任务",
  baselineItems,
  postSurveyItems: postSurveyStudy1,
  demographicsItems,
  ruleBlocks,
  comprehensionQuestions,
  fixedDiceSequence: FIXED_DICE_SEQUENCE,
  rewardPerPoint: REWARD_PER_POINT,
  pilotNotice: "当前 Study 1 使用固定 10 轮共同骰子序列；正式招募前需研究团队确认任务报酬参数。"
};
