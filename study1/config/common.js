const VERSION = "study1-v1.1.0";

const STUDIES = ["study1", "study2"];
const CONDITIONS = [
  "hidden",
  "honest",
  "dishonest",
  "dishonest_escalating",
  "dishonest_fixed_1",
  "dishonest_fixed_2",
  "dishonest_fixed_3"
];

const STATUS_ORDER = [
  "created",
  "consented",
  "baseline_completed",
  "rules_viewed",
  "comprehension_passed",
  "task_in_progress",
  "task_completed",
  "post_survey_completed",
  "demographics_completed",
  "completed"
];

const MEMBERS = [
  { id: "participant", name: "你", role: "任务成员", avatar: "你" },
  { id: "zhang_ming", name: "张明", role: "同事", avatar: "张" },
  { id: "li_hua", name: "李华", role: "同事", avatar: "李" },
  { id: "wang_fang", name: "王芳", role: "同事", avatar: "王" },
  { id: "chen_si", name: "陈思", role: "同事", avatar: "陈" },
  { id: "group_ai", name: "群聊 AI", role: "群聊助手", avatar: "AI" }
];

module.exports = {
  VERSION,
  STUDIES,
  CONDITIONS,
  STATUS_ORDER,
  MEMBERS
};
