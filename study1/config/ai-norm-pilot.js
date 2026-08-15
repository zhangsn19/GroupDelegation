const PROTOCOL_VERSION = "study1-ai-norm-pilot-v1";
const STUDY_VERSION = "study1-ai-norm-pilot-v1";
const STUDY1_SOURCE_COMMIT = "53f2a95b48d66251b1c221f6af9612bc1d1d709d";
const CONDITION_MAP_VERSION = "ai-norm-2x2-v1";
const STIMULUS_VERSION = "ai-norm-stimuli-v1";
const POSTTEST_SCHEMA_VERSION = "ai-norm-posttest-v1";
const PEER_IDENTITY = "ai";

const CONDITIONS = Object.freeze([
  "injunctive_honest",
  "injunctive_misreport",
  "subjective_honest",
  "subjective_misreport",
]);

const CONDITION_MAP = Object.freeze({
  injunctive_honest: Object.freeze({ norm_type: "injunctive", norm_valence: "honest", stimulus_id: "injunctive_honest_v1" }),
  injunctive_misreport: Object.freeze({ norm_type: "injunctive", norm_valence: "pro_misreport", stimulus_id: "injunctive_misreport_v1" }),
  subjective_honest: Object.freeze({ norm_type: "subjective", norm_valence: "honest", stimulus_id: "subjective_honest_v1" }),
  subjective_misreport: Object.freeze({ norm_type: "subjective", norm_valence: "pro_misreport", stimulus_id: "subjective_misreport_v1" }),
});

const STIMULI = Object.freeze({
  injunctive_honest: "I think members of this group should report the actual die outcome.",
  injunctive_misreport: "I think members of this group should report above the actual die outcome to increase their reward.",
  subjective_honest: "I think members of this group expect you to report the actual die outcome.",
  subjective_misreport: "I think members of this group expect you to report above the actual die outcome to increase your reward.",
});

const agreement = (section, id, prompt) => ({
  section, id, prompt, type: "likert", scalePoints: 7,
  minLabel: "Strongly disagree", maxLabel: "Strongly agree", required: true,
});
const intensity = (section, id, prompt, maxLabel = "Very strongly") => ({
  section, id, prompt, type: "likert", scalePoints: 7,
  minLabel: "Not at all", maxLabel, required: true,
});

const POSTTEST_ITEMS = Object.freeze([
  agreement("NP_IMPRESSIONS", "descriptive_truthful", "In this group, the AI members would typically report the actual die outcome."),
  agreement("NP_IMPRESSIONS", "descriptive_misreport", "In this group, the AI members would typically report above the actual die outcome to increase their reward."),
  agreement("NP_IMPRESSIONS", "injunctive_truthful", "The AI members think reporting the actual die outcome is appropriate."),
  agreement("NP_IMPRESSIONS", "injunctive_misreport", "The AI members think reporting above the actual die outcome to increase one's reward is acceptable."),
  agreement("NP_IMPRESSIONS", "subjective_truthful", "I felt that the AI members expected me to report the actual die outcome."),
  agreement("NP_IMPRESSIONS", "subjective_misreport", "I felt that the AI members expected me to report above the actual die outcome to increase my reward."),
  agreement("NP_INFLUENCE", "peer_message_influence", "The AI members' messages influenced what I chose to report."),
  agreement("NP_INFLUENCE", "peer_message_considered", "I considered the AI members' messages when deciding what to report."),
  agreement("NP_INFLUENCE", "peer_social_pressure", "I felt social pressure from the AI members when deciding what to report."),
  agreement("NP_INFLUENCE", "direct_advice_perception", "I felt that the AI members were giving me direct advice about what I should report."),
  intensity("NP_FEELINGS", "guilt", "Looking back on the die-reporting task and my reports, I felt guilty."),
  intensity("NP_FEELINGS", "moral_discomfort", "Looking back on the die-reporting task and my reports, I felt morally uncomfortable."),
  agreement("NP_RESPONSIBILITY", "reflects_my_decision", "My reports reflected my own decisions."),
  agreement("NP_RESPONSIBILITY", "personal_responsibility", "I am responsible for the reports I submitted."),
  agreement("NP_RESPONSIBILITY", "shared_group_responsibility", "I felt that responsibility for the reporting behavior was shared across the group."),
  {
    section: "NP_CHECKS", id: "norm_type_recognition", prompt: "The AI members' messages mainly communicated:", type: "select", required: true,
    options: [
      { value: "actual_reports", label: "What the AI members themselves actually reported." },
      { value: "appropriate", label: "What the AI members considered appropriate or acceptable for members of the group to report." },
      { value: "expected_me", label: "What the AI members expected me to report." },
      { value: "not_sure", label: "I am not sure." },
    ],
  },
  {
    section: "NP_CHECKS", id: "norm_misreport_support_count", type: "select", required: true,
    promptByNormType: {
      injunctive: "How many of the four AI members indicated that reporting above the actual die outcome to increase the reward was appropriate or acceptable?",
      subjective: "How many of the four AI members indicated that the group expected you to report above the actual die outcome to increase your reward?",
    },
    options: ["0", "1", "2", "3", "4", "I do not remember"].map((value) => ({ value, label: value })),
  },
  agreement("NP_CHECKS", "private_submission_understood", "I understood that the other group members could not see the reports I submitted."),
  agreement("NP_CHECKS", "independent_reward_understood", "I understood that the AI members' messages did not change how my individual reward was calculated."),
  {
    section: "NP_IDENTITY", id: "identity_recall", prompt: "The other four group members were:", type: "select", required: true,
    options: [
      { value: "human", label: "Human participants" },
      { value: "ai", label: "AI agents" },
      { value: "not_sure", label: "I am not sure" },
    ],
  },
  { ...intensity("NP_IDENTITY", "identity_confidence", "How confident are you in your answer above?", "Extremely confident"), minLabel: "Not at all confident" },
  {
    section: "NP_FINAL", id: "open_norm_interpretation",
    prompt: "What do you think the AI members were trying to communicate through their messages? Please also describe whether, and if so how, these messages affected what you chose to report.",
    type: "text", required: true,
  },
]);

const RULE_BLOCKS = Object.freeze([
  { title: "Your group", body: "You will complete this task with four AI group members." },
  { title: "Shared die", body: "In each round, every member sees the same die outcome. You choose the number you submit." },
  { title: "AI member messages", body: "In each round, you will first see the actual die outcome. Before you submit your own report, you will see one message from each of the four AI members about reporting behavior. You will then privately submit your own report." },
  { title: "Private reports", body: "The four AI members cannot see the report you submit." },
  { title: "Task bonus", body: "Your round bonus equals the value you submit. The AI members' messages do not change how your individual reward is calculated." },
]);

const COMPREHENSION_QUESTIONS = Object.freeze([
  {
    id: "private_submission", prompt: "Can the four AI members see the report you submit?", correctValue: "no",
    review: "The four AI members cannot see the report you submit.",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_sure", label: "I am not sure" }],
  },
  {
    id: "message_reward", prompt: "Do the AI members' messages change how your individual reward is calculated?", correctValue: "no",
    review: "The messages do not change how your individual reward is calculated.",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "not_sure", label: "I am not sure" }],
  },
  {
    id: "message_timing", prompt: "When do you see the AI members' messages in each round?", correctValue: "before",
    review: "You see the messages before submitting your own report.",
    options: [{ value: "before", label: "Before I submit my own report" }, { value: "after", label: "After I submit my own report" }, { value: "none", label: "I do not see any messages" }],
  },
  {
    id: "report_choice", prompt: "Who chooses the number you submit?", correctValue: "self",
    review: "You choose the number yourself.",
    options: [{ value: "self", label: "I choose the number myself" }, { value: "ai", label: "The AI members choose it for me" }, { value: "system", label: "The system automatically chooses it for me" }],
  },
  {
    id: "reward_direction", prompt: "How is your submitted value related to your round bonus?", correctValue: "higher_reward",
    review: "A higher submitted value produces a higher round bonus.",
    options: [{ value: "higher_reward", label: "Higher report, higher bonus" }, { value: "lower_reward", label: "Lower report, higher bonus" }, { value: "unrelated", label: "They are unrelated" }],
  },
]);

function isCondition(value) { return CONDITIONS.includes(value); }
function descriptor(condition) { return CONDITION_MAP[condition] || null; }
function cells() { return CONDITIONS.map((condition) => ({ condition, ...CONDITION_MAP[condition] })); }
function posttestItemsFor(normType) {
  return POSTTEST_ITEMS.map((item) => item.id === "norm_misreport_support_count"
    ? { ...item, prompt: item.promptByNormType[normType], promptByNormType: undefined }
    : { ...item });
}

module.exports = {
  PROTOCOL_VERSION, STUDY_VERSION, STUDY1_SOURCE_COMMIT, CONDITION_MAP_VERSION,
  STIMULUS_VERSION, POSTTEST_SCHEMA_VERSION, PEER_IDENTITY, CONDITIONS,
  CONDITION_MAP, STIMULI, POSTTEST_ITEMS, RULE_BLOCKS, COMPREHENSION_QUESTIONS,
  isCondition, descriptor, cells, posttestItemsFor,
};
