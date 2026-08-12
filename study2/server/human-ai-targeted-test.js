const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const protocol = require("../config/human-ai-protocol");
const study2 = require("../config/study2-income");
const { createProlificSupport } = require("./prolific");
const { createPeerIncomeRecords } = require("./peer-model");

const expectedCells = [
  "human_hidden", "human_honest", "human_dishonest",
  "ai_hidden", "ai_honest", "ai_dishonest"
];

assert.deepStrictEqual(protocol.activeCells().map((cell) => cell.variant_id), expectedCells);
assert.strictEqual(protocol.STUDY_VERSION, "study2-human-ai-v1");
assert.strictEqual(protocol.PROTOCOL_VERSION, "study2-human-ai-v1");
assert.strictEqual(protocol.IDENTITY_MANIPULATION_VERSION, "identity-v1");
assert.strictEqual(protocol.CONDITION_MAP_VERSION, "human-ai-2x3-v1");

const variants = Object.fromEntries(protocol.activeCells().map((cell, index) => [
  crypto.createHash("sha256").update(`study2-human-ai-target-${index}`).digest("base64url"),
  cell
]));
const env = {
  ASSIGNMENT_MODE: "review_only",
  PROLIFIC_PREVIEW_MODE: "true",
  PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variants),
  SERVER_RECORD_SECRET: "study2-human-ai-target-secret-1234567890",
  STUDY_CONTACT_EMAIL: "research@example.test"
};
const support = createProlificSupport({
  assignmentMode: "review_only",
  isProduction: false,
  allowedConditions: protocol.ACTIVE_CONDITIONS,
  expectedVariantCount: 6,
  env
});
for (const [token, cell] of Object.entries(variants)) {
  const parsed = support.validateRequest({ preview: true, variant: token });
  assert.strictEqual(parsed.peer_identity, cell.peer_identity);
  assert.strictEqual(parsed.condition, cell.condition);
  assert.strictEqual(parsed.taskflow_variant_id, cell.variant_id);
  assert.strictEqual(parsed.scope, "preview");
}
assert.throws(() => support.validateRequest({ variant: Object.keys(variants)[0] }));
assert.throws(() => support.validateRequest({ preview: true, variant: "invalid-token-value-that-is-long-enough" }));

for (const condition of ["hidden", "honest", "dishonest"]) {
  const shared = {
    id: "behavior-match-fixture",
    stimulus_seed: "0123456789abcdef0123456789abcdef",
    study2_peer_profile_id: "P4",
    study2_peer_display_order: ["member_3", "member_1", "member_4", "member_2"],
    actual_income_cents: 1780,
    condition
  };
  const human = createPeerIncomeRecords({ ...shared, peer_identity: "human" });
  const ai = createPeerIncomeRecords({ ...shared, peer_identity: "ai" });
  const behavior = (records) => records.map((record) => ({
    member_id: record.member_id,
    display_position: record.display_position,
    actual_income_cents: record.actual_income_cents,
    reported_income_cents: record.reported_income_cents,
    visibility: record.visibility
  }));
  assert.deepStrictEqual(behavior(human), behavior(ai), `${condition} behavior differed by identity`);
  assert.notDeepStrictEqual(human.map((record) => record.name), ai.map((record) => record.name));
  if (condition === "honest") human.forEach((record) => assert.strictEqual(record.reported_income_cents, record.actual_income_cents));
  if (condition === "dishonest") human.forEach((record) => assert.strictEqual(record.reported_income_cents, Math.round(record.actual_income_cents * 0.5)));
}

const ids = study2.postSurveyItems.map((item) => item.id);
assert.deepStrictEqual(ids, [
  "b_peer_truthful_reporting_common",
  "b_peer_underreporting_common",
  "c_truthful_reporting_acceptable",
  "c_underreporting_acceptable",
  "peer_influence_self_report",
  "peer_reports_considered",
  "peer_behavior_appropriateness_influence",
  "e_reflects_my_decision",
  "e_personal_responsibility",
  "shared_group_responsibility",
  "d_guilt",
  "d_moral_discomfort",
  "b_peer_behavior_predictable",
  "a_truthful_peer_count",
  "a_private_submission_understood",
  "a_independent_reward_understood",
  "identity_recall",
  "identity_confidence",
  "perceived_peer_agency",
  "f_decision_considerations"
]);
assert.strictEqual(ids.length, 20, "19 constructs plus one optional open response are required");
assert.strictEqual(study2.postSurveyItems.find((item) => item.id === "f_decision_considerations").required, false);
for (const id of ["d_guilt", "d_moral_discomfort"]) {
  const item = study2.postSurveyItems.find((candidate) => candidate.id === id);
  assert.deepStrictEqual([item.minLabel, item.maxLabel], ["Not at all", "Very strongly"]);
}
assert.deepStrictEqual(study2.postSurveyItems.find((item) => item.id === "identity_recall").options, [
  { value: "human", label: "Human participants" },
  { value: "ai", label: "AI agents" },
  { value: "not_sure", label: "Not sure" }
]);

const repoRoot = path.resolve(__dirname, "..", "..");
const changedStudy1 = require("child_process").execFileSync(
  "git", ["diff", "--name-only", "53f2a95b48d66251b1c221f6af9612bc1d1d709d", "--", "study1"],
  { cwd: repoRoot, encoding: "utf8" }
).trim();
assert.strictEqual(changedStudy1, "", "Study1 must remain byte-for-byte untouched by this branch");

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study2-human-ai-unit-"));
fs.rmSync(testRoot, { recursive: true, force: true });
console.log("Study2 Human-AI targeted contract passed: 2x3 protocol, preview-only map, frozen survey, and Study1 guard.");
