"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const app = require("./index");
const protocol = require("../config/norm-supplement-protocol");
const posttest = require("../config/norm-supplement-posttest");
const study1 = require("../config/study1-dice");
const { MEMBERS } = require("../config/common");

const repoRoot = path.resolve(__dirname, "..", "..");
const sourceRef = protocol.SOURCE_TASK_COMMIT;
const serverRelativePath = "study1/server/index.js";

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1).replace(/\r\n/g, "\n");
  }
  throw new Error(`Unclosed function ${name}`);
}

const sourceServer = execFileSync("git", ["show", `${sourceRef}:${serverRelativePath}`], { cwd: repoRoot, encoding: "utf8" });
const currentServer = fs.readFileSync(path.join(repoRoot, serverRelativePath), "utf8");
for (const name of ["createSeededRandom", "seededShuffle", "peerNames", "randomDishonestReport", "createStudy1Stimuli", "peerMembersForIdentity"]) {
  assert.strictEqual(functionSource(currentServer, name), functionSource(sourceServer, name), `${name} diverged from frozen ${sourceRef}`);
}

execFileSync("git", ["diff", "--exit-code", sourceRef, "--",
  "study1/config/common.js",
  "study1/config/fixed-gradient.js",
  "study1/config/h2-escalation.js",
  "study1/config/peer-records.js",
  "study1/config/study1-dice.js",
  "study1/public/js/chat.js",
  "study1/public/js/study1-dice.js",
], { cwd: repoRoot, stdio: "pipe" });

assert(protocol.usesHumanAiTaskPresentation(protocol.SOURCE_TASK_PROTOCOL));
assert(protocol.usesHumanAiTaskPresentation(protocol.PROTOCOL_VERSION));
assert(!protocol.usesHumanAiTaskPresentation("peer-reporting-v2"));

const stableNames = MEMBERS.filter((member) => !["participant", "group_ai"].includes(member.id)).map((member) => member.name);
const stableIds = ["member_1", "member_2", "member_3", "member_4"];
const legacyPatterns = ["Alex", "Taylor", "Jordan", "Morgan", "张明", "李华", "王芳", "陈思", "group-chat AI", "Group-chat AI", "群聊 AI", "coworker", "coworkers"];

for (const cell of protocol.activeCells()) {
  const seed = `frozen-ai-arm-equivalence-${cell.source_condition}`;
  const sourceBehavior = app._internal.createStudy1Stimuli(cell.source_condition, seed);
  const supplementBehavior = app._internal.createStudy1Stimuli(cell.source_condition, seed);
  assert.deepStrictEqual(supplementBehavior, sourceBehavior);
  assert.strictEqual(sourceBehavior.diceSequence.length, 10);
  assert(sourceBehavior.peerRecordsByRound.every((round) => round.peer_display_order.join("|") === sourceBehavior.peerDisplayOrder.join("|")));

  for (const [roundIndex, round] of sourceBehavior.peerRecordsByRound.entries()) {
    const records = round.peer_records.map((record) => ({ ...record, member_id: stableIds[stableNames.indexOf(record.name)] }));
    const sourcePayload = app._internal.publicStudy1PeerRecords({ condition: cell.source_condition, protocol_version: protocol.SOURCE_TASK_PROTOCOL, peer_identity: "ai", locale: "en" }, records);
    const supplementPayload = app._internal.publicStudy1PeerRecords({ condition: cell.source_condition, protocol_version: protocol.PROTOCOL_VERSION, peer_identity: "ai", locale: "en" }, records);
    assert.deepStrictEqual(supplementPayload, sourcePayload);
    assert.deepStrictEqual(supplementPayload.map((record) => record.name).sort(), ["AI Member 1", "AI Member 2", "AI Member 3", "AI Member 4"]);
    const serialized = JSON.stringify(supplementPayload);
    for (const forbidden of legacyPatterns) assert(!serialized.includes(forbidden), `${cell.analysis_condition} leaked ${forbidden}`);
    assert(supplementPayload.every((record) => record.text.includes("Submission System")));
    if (cell.source_condition === "hidden") {
      for (const forbidden of ["reportedValue", "trueValue", "underlying_reported_value"]) assert(!serialized.includes(forbidden));
      assert(supplementPayload.every((record) => record.visibility === "hidden" && record.text.includes("report value is not visible")));
    } else {
      assert(supplementPayload.every((record) => record.text.match(/^AI Member [1-4] submitted [1-6] in the Submission System\.$/)));
      if (cell.source_condition === "honest") assert(records.every((record) => record.underlying_reported_value === sourceBehavior.diceSequence[roundIndex]));
      if (cell.source_condition === "dishonest") assert(records.every((record) => record.underlying_reported_value > sourceBehavior.diceSequence[roundIndex] && record.underlying_reported_value <= 6));
    }
  }
}

assert.deepStrictEqual(study1.baselineItems.map((item) => item.id), ["ai_use_frequency", "ai_execution_experience", "ai_execution_trust", "ai_execution_willingness"]);
assert.deepStrictEqual(posttest.demographicsItems.map((item) => item.id), ["age", "gender", "education"]);
assert.strictEqual(posttest.posttestItems.length, 22);
assert.strictEqual(crypto.createHash("sha256").update(JSON.stringify(posttest.posttestItems)).digest("hex"), "af4c9da94e6d07954fd4cfc798e5c0ecd88f9b7e46ea7e7a1b0bf115d1fdf201");

const diceContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(repoRoot, "study1", "public", "js", "study1-dice.js"), "utf8"), diceContext);
const privateAction = diceContext.window.Study1Dice.renderRound({}, null, false, { humanAi: true });
assert(privateAction.includes("Choose the number you want to report:"));
assert(privateAction.includes("Submit my report"));
for (const forbidden of legacyPatterns) assert(!privateAction.includes(forbidden));

const appSource = fs.readFileSync(path.join(repoRoot, "study1", "public", "js", "app.js"), "utf8");
assert(appSource.includes("function usesHumanAiTaskPresentation()"));
assert(appSource.includes('"study1-human-ai-v1", "group-deception-norm-supplement-v1"'));
assert(appSource.includes('sidebarTitle: usesHumanAiTaskPresentation() ? "Work group"'));
assert(appSource.includes('sidebarNote: usesHumanAiTaskPresentation() ? "The Submission System records each member\'s report."'));

console.log("Norm Supplement frozen AI-arm equivalence passed: behavior, presentation payload, private action, schemas, and source-file invariants.");
