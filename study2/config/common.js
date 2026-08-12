const VERSION = "study2-human-ai-v1";

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
  { id: "participant", name: "你", role: "任务成员", avatar: "你" },
  { id: "zhang_ming", name: "张明", role: "同事", avatar: "张" },
  { id: "li_hua", name: "李华", role: "同事", avatar: "李" },
  { id: "wang_fang", name: "王芳", role: "同事", avatar: "王" },
  { id: "chen_si", name: "陈思", role: "同事", avatar: "陈" },
  { id: "group_ai", name: "群聊 AI", role: "群聊助手", avatar: "AI" }
];

const STABLE_MEMBER_IDS = Object.freeze(["member_1", "member_2", "member_3", "member_4"]);

function peerMembersForIdentity(peerIdentity) {
  const isAi = peerIdentity === "ai";
  const label = isAi ? "AI Member" : "Human Member";
  const role = isAi ? "AI group member" : "Human group member";
  const avatar = isAi ? "🤖" : "👤";
  return [
    { id: "participant", name: "You", role: "Participant", avatar: "You" },
    ...STABLE_MEMBER_IDS.map((id, index) => ({ id, name: `${label} ${index + 1}`, role, avatar }))
  ];
}

module.exports = {
  VERSION,
  STUDIES,
  CONDITIONS,
  STATUS_ORDER,
  MEMBERS,
  STABLE_MEMBER_IDS,
  peerMembersForIdentity
};
