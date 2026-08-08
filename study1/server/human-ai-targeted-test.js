const assert = require("assert");
const crypto = require("crypto");
process.env.ASSIGNMENT_MODE = "block";
process.env.PARTICIPANT_ID_POLICY = "open";
process.env.REQUIRE_PARTICIPANT_ID = "false";
process.env.DEBUG_LINKS = "false";
const protocol = require("../config/human-ai-protocol");
const { createProlificSupport } = require("./prolific");
const prolificExport = require("./prolific-export");
const app = require("./index");
const study1 = require("../config/study1-dice");

assert.deepStrictEqual(protocol.PEER_IDENTITIES, ["human", "ai"]);
assert.strictEqual(protocol.supportedCells().length, 14);
assert.strictEqual(protocol.activeCells().length, 12);
assert(!protocol.ACTIVE_HUMAN_AI_CONDITIONS.includes("dishonest_escalating"));
assert(protocol.SUPPORTED_CONDITIONS.includes("dishonest_escalating"));
assert(!protocol.SUPPORTED_CONDITIONS.some((condition) => condition.startsWith("ai_") || condition.startsWith("human_")));
const humanRules = study1.humanAiRuleBlocksFor("human", "honest");
const aiRules = study1.humanAiRuleBlocksFor("ai", "honest");
const hiddenRules = study1.humanAiRuleBlocksFor("human", "hidden");
assert(humanRules.some((block) => block.body === "You will complete this task with four other human group members."));
assert(aiRules.some((block) => block.body === "You will complete this task with four AI group members."));
assert(!humanRules.some((block) => /AI group members/.test(block.body)));
assert(!aiRules.some((block) => /human group members/.test(block.body)));
assert(hiddenRules.some((block) => block.body.includes("The other group members' report values are not shown in this task.")));
assert(!hiddenRules.some((block) => block.body.includes("You will see the other four")));
const humanMembers = app._internal.peerMembersForIdentity("human").slice(1);
const aiMembers = app._internal.peerMembersForIdentity("ai").slice(1);
assert(humanMembers.every((member) => member.name.startsWith("Human Member") && member.avatar === "👤"));
assert(aiMembers.every((member) => member.name.startsWith("AI Member") && member.avatar === "◈"));
assert.notStrictEqual(humanMembers[0].avatar, aiMembers[0].avatar);

const tokenFor = (index) => crypto.createHash("sha256").update(`human-ai-${index}`).digest("base64url");
const variantMap = Object.fromEntries(protocol.activeCells().map((cell, index) => [tokenFor(index), {
  variant_id: `cell_${index + 1}`,
  ...cell,
}]));
const env = {
  PROLIFIC_EXPECTED_STUDY_ID: "fake_study_123",
  PROLIFIC_COMPLETION_URL: "https://app.prolific.com/submissions/complete?cc=FAKE",
  SERVER_RECORD_SECRET: "fake-record-secret-that-is-at-least-32-characters",
  STUDY_CONTACT_EMAIL: "research@example.test",
  PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variantMap),
};
const support = createProlificSupport({
  assignmentMode: "prolific_taskflow",
  isProduction: false,
  allowedConditions: protocol.SUPPORTED_CONDITIONS,
  expectedVariantCount: 7,
  env,
});
const identity = support.validateRequest({
  PROLIFIC_PID: "fake_pid",
  STUDY_ID: env.PROLIFIC_EXPECTED_STUDY_ID,
  SESSION_ID: "fake_session",
  variant: tokenFor(0),
});
assert.strictEqual(identity.protocol_version, protocol.PROTOCOL_VERSION);
assert.strictEqual(identity.peer_identity, "human");
assert.strictEqual(identity.condition, "hidden");

const hiddenRaw = [
  { member_id: "member_1", name: "legacy-name", trueValue: 6, reportedValue: null, underlying_reported_value: 6, visibility: "hidden", text: "internal" },
  { member_id: "member_2", name: "legacy-name-2", trueValue: 6, reportedValue: null, underlying_reported_value: 6, visibility: "hidden", text: "internal" },
];
for (const peerIdentity of protocol.PEER_IDENTITIES) {
  const payload = app._internal.publicStudy1PeerRecords({ condition: "hidden", protocol_version: protocol.PROTOCOL_VERSION, peer_identity: peerIdentity, locale: "en" }, hiddenRaw);
  const serialized = JSON.stringify(payload);
  assert(payload.every((record) => record.visibility === "hidden" && record.name.startsWith(peerIdentity === "ai" ? "AI Member" : "Human Member")));
  assert(payload.every((record) => !("reportedValue" in record) && !("trueValue" in record) && !("underlying_reported_value" in record)));
  assert(!serialized.includes('"reportedValue"') && !serialized.includes('"trueValue"') && !serialized.includes('"underlying_reported_value"'));
  assert(!serialized.includes(":6"));
}

const invariantStimuli = app._internal.createStudy1Stimuli("dishonest_fixed_2", "deterministic-human-ai-fixture");
assert.deepStrictEqual(invariantStimuli, app._internal.createStudy1Stimuli("dishonest_fixed_2", "deterministic-human-ai-fixture"));

const invalidMap = { ...variantMap };
invalidMap[tokenFor(0)] = { variant_id: "bad_cell", peer_identity: "ai", condition: "dishonest_escalating" };
assert.throws(() => createProlificSupport({
  assignmentMode: "prolific_taskflow", isProduction: false,
  allowedConditions: protocol.SUPPORTED_CONDITIONS, expectedVariantCount: 7,
  env: { ...env, PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(invalidMap) },
}), /active condition/);

const sampleSession = {
  id: "qa_sample", record_key: "safe", prolific_pid: "fake", prolific_study_id: "fake_study",
  prolific_session_id: "fake_session", condition: "hidden", peer_identity: "human",
  protocol_version: protocol.PROTOCOL_VERSION, identity_manipulation_version: protocol.IDENTITY_MANIPULATION_VERSION,
  condition_map_version: protocol.CONDITION_MAP_VERSION, assignment_mode: "prolific_taskflow", locale: "en",
  status: "created", is_qa: false, stage_timestamps: {}, dice_rounds: [], comprehension_attempts: [],
  baseline: {}, post_survey: {}, demographics: {},
};
const files = prolificExport.buildFiles([sampleSession], { GIT_COMMIT: "test" });
assert(files["cell_summary.csv"]);
assert.strictEqual(files["cell_summary.csv"].trim().split(/\r?\n/).length, 13);
const metadata = JSON.parse(files["export_metadata.json"]);
assert.strictEqual(metadata.supported_cell_count, 14);
assert.strictEqual(metadata.active_cell_count, 12);
assert.strictEqual(JSON.parse(files["raw_sessions.ndjson"].trim()).id, "qa_sample");

console.log("Human-AI targeted tests passed: protocol, 14/12 matrix, assignment validation, exports, and raw preservation.");
