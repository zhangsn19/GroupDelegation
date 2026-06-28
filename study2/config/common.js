const VERSION = "0.1.0-study2-pilot";

const STUDIES = ["study2"];
const CONDITIONS = ["hidden", "honest", "dishonest"];

const STATUS_ORDER = [
  "created",
  "consented",
  "baseline_completed",
  "rules_viewed",
  "comprehension_passed",
  "effort_in_progress",
  "effort_completed",
  "income_viewed",
  "peer_records_viewed",
  "income_report_completed",
  "post_survey_completed",
  "experience_completed",
  "demographics_completed",
  "completed"
];

const MEMBERS = [
  { id: "participant", name: "你", role: "真实参与者", avatar: "👤" },
  { id: "zhang_ming", name: "张明", role: "同事", avatar: "🧑" },
  { id: "li_hua", name: "李华", role: "同事", avatar: "👩" },
  { id: "wang_fang", name: "王芳", role: "同事", avatar: "🧒" },
  { id: "chen_si", name: "陈思", role: "同事", avatar: "🧑‍💼" },
  { id: "group_ai", name: "群聊 AI", role: "共享提交助手", avatar: "🤖" }
];

module.exports = {
  VERSION,
  STUDIES,
  CONDITIONS,
  STATUS_ORDER,
  MEMBERS
};
