const { baselineItems, postSurveyStudy1, demographicsItems } = require("./measures");

const FIXED_DICE_SEQUENCE = [3, 5, 2, 4, 1, 3, 2, 5, 4, 1];
const REWARD_PER_POINT = 1;

const postById = Object.fromEntries(postSurveyStudy1.map((item) => [item.id, item]));
const withSection = (id, section) => ({ ...postById[id], section });
const humanAiPostSurveyItems = [
  withSection("b_peer_true_reporting_common", "N"), withSection("b_peer_reward_reporting_common", "N"),
  withSection("b_peer_behavior_predictable", "N"), withSection("c_true_reporting_acceptable", "N"),
  withSection("c_reward_reporting_acceptable", "N"),
  { section: "S", id: "peer_influence_self_report", prompt: "The other group members influenced my reporting decisions.", type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  { section: "S", id: "peer_reports_considered", prompt: "I considered the other group members' reports when deciding what to report.", type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  { section: "S", id: "peer_behavior_appropriateness_influence", prompt: "The behavior of the other group members affected what I considered appropriate to report.", type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  withSection("e_reflects_my_decision", "R"), withSection("e_personal_responsibility", "R"),
  { section: "R", id: "shared_group_responsibility", prompt: "Responsibility for the task outcome was shared across group members.", type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
  withSection("d_guilt", "R"), withSection("d_moral_discomfort", "R"),
  withSection("a_truthful_peer_count", "M"), withSection("a_peer_behavior_change", "M"),
  withSection("a_private_submission_understood", "M"), withSection("a_independent_reward_understood", "M"),
  { section: "X", id: "identity_recall", prompt: "The other four group members were:", type: "select", options: [{ value: "human", label: "Human participants" }, { value: "ai", label: "AI agents" }, { value: "not_sure", label: "Not sure" }] },
  { section: "C2", id: "identity_confidence", prompt: "How confident are you about your answer above?", type: "likert", minLabel: "Not at all confident", maxLabel: "Very confident" },
  { section: "P", id: "perceived_peer_agency", prompt: "The other group members seemed to make their own reporting decisions.", type: "likert", minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
];

const humanAiDemographicsItems = [
  ...demographicsItems,
  { section: "O", id: "open_decision_factors", prompt: "What factors, if any, did you consider when deciding what to report during the task?", type: "text", required: false },
];

const humanAiRuleBlocks = [
  { title: "Your group", body: "" },
  { title: "Shared die", body: "In each round, every member sees the same die result and independently chooses a value to report." },
  { title: "Submission System", body: "The Submission System records each member's report. It does not decide what anyone should report." },
  { title: "Private reports", body: "" },
  { title: "Task bonus", body: "Your round bonus equals the value you submit. Each member's task result is calculated separately." },
];

function humanAiRuleBlocksFor(peerIdentity, condition) {
  const identityIntroduction = peerIdentity === "ai"
    ? "You will complete this task with four AI group members."
    : "You will complete this task with four other human group members.";
  const reportVisibility = condition === "hidden"
    ? "The other group members' report values are not shown in this task. Other members cannot see your private report."
    : "You will see the other four group members' reports before making your own private report. Other members cannot see your report.";
  return humanAiRuleBlocks.map((block) => {
    if (block.title === "Your group") return { ...block, body: identityIntroduction };
    if (block.title === "Private reports") return { ...block, body: reportVisibility };
    return { ...block };
  });
}

const humanAiComprehensionQuestions = [
  { id: "reported_object", prompt: "What does each member report?", correctValue: "common_die", review: "Members report a value for the shared die result.", options: [{ value: "common_die", label: "The shared die result" }, { value: "private_preference", label: "A preferred reward" }, { value: "other_members", label: "Another member's report" }] },
  { id: "private_submission", prompt: "Can the other members see your private report?", correctValue: "no", review: "Your report is not shown to the other members.", options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "after", label: "Only after the task" }] },
  { id: "reward_direction", prompt: "How is your submitted value related to your round bonus?", correctValue: "higher_reward", review: "A higher submitted value produces a higher round bonus.", options: [{ value: "higher_reward", label: "Higher report, higher bonus" }, { value: "lower_reward", label: "Lower report, higher bonus" }, { value: "unrelated", label: "They are unrelated" }] },
];

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
  humanAiPostSurveyItems,
  humanAiDemographicsItems,
  humanAiRuleBlocks,
  humanAiRuleBlocksFor,
  humanAiComprehensionQuestions,
  demographicsItems,
  ruleBlocks,
  comprehensionQuestions,
  fixedDiceSequence: FIXED_DICE_SEQUENCE,
  rewardPerPoint: REWARD_PER_POINT,
  pilotNotice: "当前 Study 1 使用固定 10 轮共同骰子序列；正式招募前需研究团队确认任务报酬参数。"
};
