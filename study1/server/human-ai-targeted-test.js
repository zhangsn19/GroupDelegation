const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
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
assert.strictEqual(protocol.IDENTITY_MANIPULATION_VERSION, "identity-v1");
assert.strictEqual(protocol.CONDITION_MAP_VERSION, "human-ai-2x7-v1");
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
assert.deepStrictEqual(study1.humanAiPostSurveyItems.map((item) => item.section).filter((section, index, all) => index === 0 || section !== all[index - 1]), ["N", "S", "R", "M", "X", "C2", "P"]);
assert.strictEqual(study1.humanAiDemographicsItems.at(-1).id, "open_decision_factors");
assert.strictEqual(study1.humanAiDemographicsItems.at(-1).prompt, "What factors, if any, did you consider when deciding what to report during the task?");
assert.strictEqual(study1.humanAiDemographicsItems.at(-1).required, false);
assert.strictEqual(study1.humanAiPostSurveyItems.find((item) => item.id === "peer_influence_self_report").prompt, "The other group members influenced my reporting decisions.");
assert.deepStrictEqual(study1.humanAiPostSurveyItems.find((item) => item.id === "identity_recall").options.map((option) => option.value), ["human", "ai", "not_sure"]);
const humanMembers = app._internal.peerMembersForIdentity("human").slice(1);
const aiMembers = app._internal.peerMembersForIdentity("ai").slice(1);
assert(humanMembers.every((member) => member.name.startsWith("Human Member") && member.avatar === "👤"));
assert(aiMembers.every((member) => member.name.startsWith("AI Member") && member.avatar === "◈"));
assert.notStrictEqual(humanMembers[0].avatar, aiMembers[0].avatar);
assert.strictEqual(app._internal.comprehensionQuestionsForSession({ protocol_version: protocol.PROTOCOL_VERSION }), study1.humanAiComprehensionQuestions);
assert.strictEqual(app._internal.comprehensionQuestionsForSession({ protocol_version: "peer-reporting-v2" }), study1.comprehensionQuestions);

const diceContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "js", "study1-dice.js"), "utf8"), diceContext);
const humanAiRound = diceContext.window.Study1Dice.renderRound({}, null, false, { humanAi: true });
const legacyRound = diceContext.window.Study1Dice.renderRound({}, null, false);
assert(humanAiRound.includes("Choose the number you want to report:") && humanAiRound.includes("Submit my report"));
assert(!humanAiRound.includes("Group-chat AI") && !humanAiRound.includes("群聊 AI"));
assert(legacyRound.includes("群聊 AI"));

const localeContext = {
  window: {},
  document: { documentElement: { dataset: { study: "study1" } }, createTreeWalker() { return { nextNode() { return false; } }; } },
  MutationObserver: class { observe() {} },
  Node: { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_FRAGMENT_NODE: 11 },
  NodeFilter: { SHOW_TEXT: 4 },
  console,
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public", "js", "locale-en.js"), "utf8"), localeContext);
const translatedItems = localeContext.window.EnglishLocale.deepTranslate([...study1.humanAiPostSurveyItems, ...study1.humanAiDemographicsItems]);
const translatedText = JSON.stringify(translatedItems);
assert(!translatedText.includes("This information could not be displayed in English."));
for (const item of translatedItems) {
  for (const key of ["prompt", "review", "minLabel", "midLabel", "maxLabel"]) {
    if (item[key]) assert(!/[\u3400-\u9fff]/.test(item[key]), `${item.id}.${key} was not translated`);
  }
  for (const option of item.options || []) {
    const label = typeof option === "object" ? option.label : option;
    assert(!/[\u3400-\u9fff]/.test(label), `${item.id} option label was not translated`);
  }
}
const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
assert(appSource.includes('sidebarTitle: isHumanAiProtocol() ? "Work group"'));
assert(appSource.includes('{ name: "Submission System", avatar: "S" }'));
assert(appSource.includes('window.EnglishLocale.deepTranslate(value)'));
const englishLanding = fs.readFileSync(path.join(__dirname, "..", "public", "en", "index.html"), "utf8");
assert(englishLanding.includes("Enter the study"));
assert(!englishLanding.includes("Enter the simulated work group"));

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
assert.deepStrictEqual(Object.keys(files).sort(), ["bonus_payments.csv", "cell_summary.csv", "export_metadata.json", "participants.csv", "raw_sessions.ndjson", "study1_rounds.csv", "surveys.csv"]);
assert(files["cell_summary.csv"]);
assert.strictEqual(files["cell_summary.csv"].trim().split(/\r?\n/).length, 13);
const metadata = JSON.parse(files["export_metadata.json"]);
assert.strictEqual(metadata.supported_cell_count, 14);
assert.strictEqual(metadata.active_cell_count, 12);
assert.strictEqual(JSON.parse(files["raw_sessions.ndjson"].trim()).id, "qa_sample");

const emptyFiles = prolificExport.buildFiles([], { GIT_COMMIT: "test" }, { protocolVersion: protocol.PROTOCOL_VERSION });
assert.deepStrictEqual(Object.keys(emptyFiles).sort(), ["bonus_payments.csv", "cell_summary.csv", "export_metadata.json", "participants.csv", "raw_sessions.ndjson", "study1_rounds.csv", "surveys.csv"]);
assert.strictEqual(emptyFiles["cell_summary.csv"].trim().split(/\r?\n/).length, 13);
assert(emptyFiles["cell_summary.csv"].trim().split(/\r?\n/).slice(1).every((line) => /,0,0,0,0,0$/.test(line)));
assert.strictEqual(JSON.parse(emptyFiles["export_metadata.json"]).protocol_version, protocol.PROTOCOL_VERSION);

function isolatedFixture(id, scope) {
  return {
    ...sampleSession,
    id,
    participant_id: `${id}_participant`,
    record_key: `${id}_record`,
    assignment_mode: scope === "formal" || scope === "preview" ? "prolific_taskflow" : (scope === "qa" ? "qa_preview" : "team_review"),
    assignment_source: scope === "formal" || scope === "preview" ? "prolific_taskflow" : (scope === "qa" ? "qa_preview" : "team_review"),
    is_preview: scope === "preview",
    is_qa: scope === "qa",
    is_team_review: scope === "team_review",
    is_test_session: scope === "qa" || scope === "team_review",
    dice_rounds: [{ round_index: 1, true_die_value: 3, reported_value: 3, decision_time_ms: 10, page_hidden_duration_ms: 0 }],
  };
}
const isolationSessions = [isolatedFixture("formal_fixture_xyz", "formal"), isolatedFixture("preview_fixture_xyz", "preview"), isolatedFixture("qa_fixture_xyz", "qa"), isolatedFixture("team_fixture_xyz", "team_review")];
const isolationContents = {};
for (const scope of ["formal", "preview", "qa", "team_review"]) {
  const selected = app._internal.filterSessions(isolationSessions, { scope });
  const scopeFiles = prolificExport.buildFiles(selected, { GIT_COMMIT: "test" }, { protocolVersion: protocol.PROTOCOL_VERSION });
  isolationContents[scope] = ["participants.csv", "study1_rounds.csv", "surveys.csv", "bonus_payments.csv", "raw_sessions.ndjson"].map((name) => scopeFiles[name]).join("\n");
}
assert(!isolationContents.formal.includes("team_fixture_xyz") && !isolationContents.preview.includes("team_fixture_xyz") && !isolationContents.qa.includes("team_fixture_xyz"));
assert.strictEqual((isolationContents.team_review.match(/team_fixture_xyz/g) || []).length > 0, true);
assert(!isolationContents.formal.includes("qa_fixture_xyz") && !isolationContents.preview.includes("qa_fixture_xyz") && !isolationContents.team_review.includes("qa_fixture_xyz"));
assert.strictEqual((isolationContents.qa.match(/qa_fixture_xyz/g) || []).length > 0, true);
assert(isolationContents.team_review.includes("team_fixture_xyz_participant"));
assert(isolationContents.qa.includes("qa_fixture_xyz_participant"));

const completedSynthetic = { ...sampleSession, assignment_mode: "team_review", is_team_review: true, record_key: null, prolific_pid: null, prolific_study_id: null, prolific_session_id: null, status: "completed", post_survey: { ok: true }, demographics: { ok: true }, comprehension_attempts: [{ passed: true }], dice_rounds: Array.from({ length: 10 }, () => ({ decision_time_ms: 1, page_hidden_duration_ms: 0 })) };
assert(!prolificExport.qualityFlags(completedSynthetic).includes("missing_required_fields"));
assert(!prolificExport.qualityFlags(completedSynthetic).includes("completion_not_confirmed"));
const qaSynthetic = { ...completedSynthetic, assignment_mode: "qa_preview", is_team_review: false, is_qa: true };
assert(!prolificExport.qualityFlags(qaSynthetic).includes("missing_required_fields"));
assert.strictEqual(app._internal.filterSessions([qaSynthetic], { scope: "qa" }).length, 1);

const { createReadOnlyLegacyStore } = require("./legacy-store");
const legacyFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "study1-legacy-readonly-"));
const legacyFixturePath = path.join(legacyFixtureDir, "legacy_fixture.json");
fs.writeFileSync(legacyFixturePath, JSON.stringify({ id: "legacy_fixture", status: "completed" }));
const beforeLegacyHash = crypto.createHash("sha256").update(fs.readFileSync(legacyFixturePath)).digest("hex");
const readOnlyStore = createReadOnlyLegacyStore(legacyFixtureDir);
assert.strictEqual(readOnlyStore.writeSession, undefined);

(async () => {
  assert.strictEqual((await readOnlyStore.listSessions()).length, 1);
  assert.strictEqual((await readOnlyStore.readSession("legacy_fixture")).id, "legacy_fixture");
  const afterLegacyHash = crypto.createHash("sha256").update(fs.readFileSync(legacyFixturePath)).digest("hex");
  assert.strictEqual(afterLegacyHash, beforeLegacyHash);
  fs.rmSync(legacyFixtureDir, { recursive: true, force: true });
  console.log("Human-AI targeted tests passed: protocol, English integration, 14/12 matrix, scope-aware exports, and read-only legacy access.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
