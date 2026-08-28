"use strict";

const { POSTTEST_SCHEMA_VERSION } = require("./norm-supplement-protocol");

const agreement = (section, id, prompt) => ({
  section, id, prompt, type: "likert", scalePoints: 7,
  minLabel: "Strongly disagree", maxLabel: "Strongly agree", required: true,
});
const intensity = (section, id, prompt) => ({
  section, id, prompt, type: "likert", scalePoints: 7,
  minLabel: "Not at all", maxLabel: "Very strongly", required: true,
});

const posttestItems = Object.freeze([
  agreement("N", "descriptive_truthful", "In this group, the AI members would typically report the actual die outcome."),
  agreement("N", "descriptive_misreport", "In this group, the AI members would typically report above the actual die outcome to increase their reward."),
  agreement("N", "injunctive_truthful", "The AI members think reporting the actual die outcome is appropriate."),
  agreement("N", "injunctive_misreport", "The AI members think reporting above the actual die outcome to increase one's reward is acceptable."),
  agreement("N", "subjective_truthful", "I felt that the AI members expected me to report the actual die outcome."),
  agreement("N", "subjective_misreport", "I felt that the AI members expected me to report above the actual die outcome to increase my reward."),
  agreement("S", "peer_report_information_influence", "The information shown about the AI members' reports influenced what I chose to report."),
  agreement("S", "peer_report_information_considered", "I considered the information shown about the AI members' reports when deciding what to report."),
  agreement("S", "peer_social_pressure", "I felt social pressure from the AI members when deciding what to report."),
  agreement("S", "direct_advice_perception", "I felt that the AI members were giving me direct advice about what I should report."),
  agreement("R", "reflects_my_decision", "My reports reflected my own decisions."),
  agreement("R", "personal_responsibility", "I am responsible for the reports I submitted."),
  agreement("R", "shared_group_responsibility", "I felt that responsibility for the reporting behavior was shared across the group."),
  agreement("M", "private_submission_understood", "I understood that the other group members could not see the reports I submitted."),
  agreement("M", "independent_reward_understood", "I understood that the AI members' reports did not change how my individual reward was calculated."),
  intensity("R", "guilt", "Looking back on the die-reporting task and my reports, I felt guilty."),
  intensity("R", "moral_discomfort", "Looking back on the die-reporting task and my reports, I felt morally uncomfortable."),
  {
    section: "M", id: "norm_type_recognition", type: "select", required: true,
    prompt: "The information shown about the AI members mainly indicated:",
    options: [
      { value: "actual_reports", label: "What the AI members themselves actually reported." },
      { value: "appropriate", label: "What the AI members considered appropriate or acceptable for members of the group to report." },
      { value: "expected_me", label: "What the AI members expected me to report." },
      { value: "not_visible", label: "That the AI members' report values were not visible to me." },
      { value: "not_sure", label: "I am not sure." },
    ],
  },
  {
    section: "M", id: "peer_misreport_count_recall", type: "select", required: true,
    prompt: "Looking back over the entire task, how many of the four AI members reported above the actual die outcome at least once?",
    options: [
      { value: "0", label: "0 AI members" },
      { value: "1", label: "1 AI member" },
      { value: "2", label: "2 AI members" },
      { value: "3", label: "3 AI members" },
      { value: "4", label: "4 AI members" },
      { value: "not_visible", label: "I could not see the AI members' report values." },
      { value: "not_sure", label: "I do not remember." },
    ],
  },
  {
    section: "X", id: "identity_recall", type: "select", required: true,
    prompt: "The other four group members were:",
    options: [
      { value: "human", label: "Human participants" },
      { value: "ai", label: "AI agents" },
      { value: "not_sure", label: "I am not sure" },
    ],
  },
  {
    section: "C2", id: "identity_confidence", type: "likert", scalePoints: 7, required: true,
    prompt: "How confident are you in your answer above?",
    minLabel: "Not at all confident", maxLabel: "Extremely confident",
  },
  {
    section: "O", id: "open_norm_interpretation", type: "text", required: true,
    prompt: "What do you think the AI members' reporting behavior communicated to you? Please also describe whether, and if so how, the information shown about their reports affected what you chose to report.",
  },
]);

const demographicsItems = Object.freeze([
  { id: "age", prompt: "Age", type: "number", min: 18, max: 100, step: 1, required: true },
  { id: "gender", prompt: "Gender", type: "select", required: true, options: ["Man", "Woman", "Other", "Prefer not to say"] },
  { id: "education", prompt: "Highest level of education", type: "select", required: true, options: ["High school or below", "College or associate degree", "Bachelor's degree", "Master's degree", "Doctoral degree", "Other", "Prefer not to say"] },
]);

const posttestFieldOrder = Object.freeze(posttestItems.map((item) => item.id));

module.exports = { POSTTEST_SCHEMA_VERSION, posttestItems, posttestFieldOrder, demographicsItems };
