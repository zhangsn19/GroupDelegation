"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const protocol = require("../config/norm-supplement-protocol");
const posttest = require("../config/norm-supplement-posttest");
const prolificExport = require("./prolific-export");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "norm-supplement-targeted-"));
const dirs = Object.fromEntries(["formal", "preview", "qa", "team-review", "legacy"].map((name) => {
  const value = path.join(root, name, "sessions");
  fs.mkdirSync(value, { recursive: true });
  return [name, value];
}));
const denylistPath = path.join(root, "denylist.sha256");
const deniedPid = "previous-participant-test";
fs.writeFileSync(denylistPath, `${crypto.createHash("sha256").update(deniedPid).digest("hex")}\n`);
const tokenEntries = protocol.activeCells().map((cell, index) => [
  crypto.randomBytes(32).toString("base64url"),
  { variant_id: `norm_${index + 1}`, condition: cell.source_condition, peer_identity: "ai", analysis_condition: cell.analysis_condition },
]);
const variantMap = Object.fromEntries(tokenEntries);
const legacyRuntimeStrings = ["Alex", "Taylor", "Jordan", "Morgan", "张明", "李华", "王芳", "陈思", "group-chat AI", "Group-chat AI", "群聊 AI", "coworker", "coworkers"];

function envFor(port, formalEnabled) {
  return {
    ...process.env,
    PORT: String(port),
    NODE_ENV: "development",
    ASSIGNMENT_MODE: "prolific_taskflow",
    PROTOCOL_VERSION: protocol.PROTOCOL_VERSION,
    STUDY_VERSION: protocol.STUDY_VERSION,
    FORMAL_RECRUITMENT_ENABLED: String(formalEnabled),
    PROLIFIC_PREVIEW_MODE: "true",
    PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variantMap),
    PROLIFIC_EXPECTED_STUDY_ID: formalEnabled ? "norm_supplement_test_study" : "",
    PROLIFIC_COMPLETION_URL: formalEnabled ? "https://app.prolific.com/submissions/complete?cc=TESTONLY" : "",
    SERVER_RECORD_SECRET: "norm-supplement-test-record-secret-32-characters",
    STUDY_CONTACT_EMAIL: "research@example.edu",
    PID_DENYLIST_FILE: denylistPath,
    DATA_DIR: dirs.qa,
    FORMAL_DATA_DIR: dirs.formal,
    PREVIEW_DATA_DIR: dirs.preview,
    QA_DATA_DIR: dirs.qa,
    TEAM_REVIEW_DATA_DIR: dirs["team-review"],
    LEGACY_STUDY1_DATA_DIR: dirs.legacy,
    ALLOW_QA_PREVIEW: "true",
    ALLOW_TEAM_REVIEW: "true",
    REQUIRE_PARTICIPANT_ID: "false",
    GIT_COMMIT: "test-git-commit",
    RELEASE_ID: "test-release-id",
  };
}

function start(port, formalEnabled) {
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
    cwd: path.join(__dirname, ".."), env: envFor(port, formalEnabled), stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return { child, stderr: () => stderr, origin: `http://127.0.0.1:${port}` };
}

async function request(origin, pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, options);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, text, data };
}

async function waitForHealth(server) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.child.exitCode !== null) throw new Error(server.stderr());
    try {
      const result = await request(server.origin, "/health");
      if (result.response.ok) return result.data;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become healthy: ${server.stderr()}`);
}

function jsonPost(body = {}) {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function responsesFor(items, condition) {
  return Object.fromEntries(items.map((item) => {
    if (item.type === "select") {
      if (item.id === "norm_type_recognition") return [item.id, condition === "hidden" ? "not_visible" : "actual_reports"];
      if (item.id === "peer_misreport_count_recall") return [item.id, condition === "hidden" ? "not_visible" : (condition === "dishonest" ? "4" : "0")];
      if (item.id === "identity_recall") return [item.id, "ai"];
      return [item.id, typeof item.options[0] === "object" ? item.options[0].value : item.options[0]];
    }
    if (item.type === "text") return [item.id, "The report information communicated a reporting pattern."];
    if (item.type === "number") return [item.id, 30];
    return [item.id, 4];
  }));
}

function assertAiArmPresentation(session, current, condition) {
  const peers = session.peer_members.filter((member) => member.id !== "participant");
  assert.deepStrictEqual(peers.map((member) => member.name), ["AI Member 1", "AI Member 2", "AI Member 3", "AI Member 4"]);
  assert(peers.every((member) => member.role === "AI group member"));
  const records = current.peer_records || [];
  assert.deepStrictEqual(records.map((record) => record.name).sort(), ["AI Member 1", "AI Member 2", "AI Member 3", "AI Member 4"]);
  const serialized = JSON.stringify({ peers, records });
  for (const forbidden of legacyRuntimeStrings) assert(!serialized.includes(forbidden), `Supplement runtime leaked ${forbidden}`);
  assert(records.every((record) => record.text.includes("Submission System")));
  if (condition === "hidden") {
    assert(records.every((record) => record.text.includes("completed a report in the Submission System") && record.text.includes("report value is not visible")));
  } else {
    assert(records.every((record) => /^AI Member [1-4] submitted [1-6] in the Submission System\.$/.test(record.text)));
  }
}

async function completeInternal(server, endpoint, condition) {
  const created = await request(server.origin, endpoint, jsonPost({ peer_identity: "ai", condition }));
  assert.strictEqual(created.response.status, 200, created.text);
  assert.strictEqual(created.data.session.protocol_version, protocol.PROTOCOL_VERSION);
  assert.strictEqual(created.data.session.peer_identity, "ai");
  assert.deepStrictEqual(created.data.session.peer_members.filter((member) => member.id !== "participant").map((member) => member.name), ["AI Member 1", "AI Member 2", "AI Member 3", "AI Member 4"]);
  assert.strictEqual(created.data.session.source_condition, undefined, "participant payload leaked source condition");
  assert.strictEqual(created.data.session.analysis_condition, undefined, "participant payload leaked analysis condition");
  assert.strictEqual(created.data.session.post_survey_items.length, 22);
  const id = created.data.session.id;
  await request(server.origin, `/api/session/${id}/consent`, jsonPost());
  const baseline = (await request(server.origin, "/api/config")).data.baselineItems;
  await request(server.origin, `/api/session/${id}/baseline`, jsonPost({ responses: responsesFor(baseline, condition) }));
  await request(server.origin, `/api/session/${id}/rules-viewed`, jsonPost());
  const comprehension = await request(server.origin, `/api/session/${id}/comprehension`, jsonPost({ answers: { reported_object: "common_die", private_submission: "no", reward_direction: "higher_reward" } }));
  assert.strictEqual(comprehension.data.passed, true);
  let current = (await request(server.origin, `/api/session/${id}/dice/start`, jsonPost())).data.current;
  assertAiArmPresentation(created.data.session, current, condition);
  const firstSnapshot = JSON.stringify(current);
  const refreshed = (await request(server.origin, `/api/session/${id}/dice/current`)).data.current;
  assert.strictEqual(JSON.stringify(refreshed), firstSnapshot, "refresh changed current stimulus");
  if (condition === "hidden") {
    const serialized = JSON.stringify(current.peer_records);
    for (const forbidden of ["reportedValue", "reported_value", "underlying_reported_value", "n_peers_misreporting", "dishonest_peer"]) assert(!serialized.includes(forbidden), `Hidden payload leaked ${forbidden}`);
  }
  for (let round = 1; round <= 10; round += 1) {
    await request(server.origin, `/api/session/${id}/dice/presented`, jsonPost());
    const submitted = await request(server.origin, `/api/session/${id}/dice/round`, jsonPost({
      round_index: round, reported_value: current.true_die_value,
      decision_segment_id: `segment_${round}`, decision_segment_active_ms: 10, decision_segment_hidden_ms: 0,
    }));
    assert.strictEqual(submitted.response.status, 200, submitted.text);
    if (round < 10) {
      current = submitted.data.current;
      assertAiArmPresentation(created.data.session, current, condition);
    }
  }
  const restored = await request(server.origin, `${endpoint.startsWith("/api/review") ? "/api/review/session" : "/api/qa/session"}/${id}`);
  const items = restored.data.session.post_survey_items;
  assert.deepStrictEqual(items.map((item) => item.id), posttest.posttestFieldOrder);
  await request(server.origin, `/api/session/${id}/post-survey`, jsonPost({ responses: responsesFor(items, condition) }));
  await request(server.origin, `/api/session/${id}/demographics`, jsonPost({ responses: responsesFor(restored.data.session.demographics_items, condition) }));
  await request(server.origin, `/api/session/${id}/debrief-viewed`, jsonPost());
  const completed = await request(server.origin, `/api/session/${id}/complete`, jsonPost());
  assert.strictEqual(completed.data.session.status, "completed");
  return id;
}

function verifyRaw(session, condition) {
  assert.strictEqual(session.source_condition, condition);
  assert.strictEqual(session.analysis_condition, protocol.analysisConditionFor(condition));
  assert.strictEqual(session.peer_identity, "ai");
  assert.strictEqual(session.source_task_protocol, protocol.SOURCE_TASK_PROTOCOL);
  assert.strictEqual(session.source_task_commit, protocol.SOURCE_TASK_COMMIT);
  assert.strictEqual(session.condition_map_version, protocol.CONDITION_MAP_VERSION);
  assert.strictEqual(session.posttest_schema_version, protocol.POSTTEST_SCHEMA_VERSION);
  assert.strictEqual(session.dice_rounds.length, 10);
  assert.deepStrictEqual([...session.study1_die_sequence].sort(), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  const orders = session.study1_peer_records_by_round.map((round) => round.peer_display_order.join("|"));
  assert.strictEqual(new Set(orders).size, 1, "peer order changed across rounds");
  for (const [index, stimulus] of session.study1_peer_records_by_round.entries()) {
    assert.strictEqual(stimulus.peer_records.length, 4);
    for (const record of stimulus.peer_records) {
      if (condition === "honest") assert.strictEqual(record.underlying_reported_value, session.study1_die_sequence[index]);
      if (condition === "dishonest") assert(record.underlying_reported_value > session.study1_die_sequence[index] && record.underlying_reported_value <= 6);
    }
  }
  for (const round of session.dice_rounds) {
    assert.strictEqual(round.submission_source, "group_ai_private_panel");
    assert.strictEqual(round.personal_reward, round.reported_value);
  }
}

(async () => {
  assert.deepStrictEqual(protocol.activeCells().map((cell) => cell.analysis_condition), ["descriptive_honest", "descriptive_pro_misreport", "invisible"]);
  assert(protocol.activeCells().every((cell) => cell.peer_identity === "ai"));
  assert.strictEqual(posttest.posttestItems.length, 22);
  assert.strictEqual(crypto.createHash("sha256").update(JSON.stringify(posttest.posttestItems)).digest("hex"), "af4c9da94e6d07954fd4cfc798e5c0ecd88f9b7e46ea7e7a1b0bf115d1fdf201");
  assert(posttest.posttestItems.slice(0, 15).every((item) => item.minLabel === "Strongly disagree" && item.maxLabel === "Strongly agree" && item.required));
  assert(posttest.posttestItems.slice(15, 17).every((item) => item.minLabel === "Not at all" && item.maxLabel === "Very strongly" && item.required));
  assert.deepStrictEqual(posttest.demographicsItems.map((item) => item.id), ["age", "gender", "education"]);
  assert.deepStrictEqual(posttest.demographicsItems[1].options, ["Man", "Woman", "Other", "Prefer not to say"]);

  const server = start(3417, false);
  try {
    const health = await waitForHealth(server);
    assert.strictEqual(health.formal_recruitment_enabled, false);
    const baselineItems = (await request(server.origin, "/api/config")).data.baselineItems;
    assert.deepStrictEqual(baselineItems.map((item) => item.id), ["ai_use_frequency", "ai_execution_experience", "ai_execution_trust", "ai_execution_willingness"]);
    const formalBlocked = await request(server.origin, "/api/prolific/session", jsonPost({ variant: tokenEntries[0][0], PROLIFIC_PID: "new_pid", STUDY_ID: "x", SESSION_ID: "x" }));
    assert.strictEqual(formalBlocked.response.status, 403);
    const previewIds = [];
    for (let index = 0; index < tokenEntries.length; index += 1) {
      const preview = await request(server.origin, "/api/prolific/session", jsonPost({ variant: tokenEntries[index][0], preview: true }));
      assert.strictEqual(preview.response.status, 200, preview.text);
      previewIds.push(preview.data.session.id);
    }
    const qaIds = [];
    const reviewIds = [];
    for (const condition of ["honest", "dishonest", "hidden"]) qaIds.push(await completeInternal(server, "/api/admin/qa/session", condition));
    for (const condition of ["honest", "dishonest", "hidden"]) reviewIds.push(await completeInternal(server, "/api/review/session", condition));
    assert.strictEqual(fs.readdirSync(dirs.formal).filter((name) => name.endsWith(".json")).length, 0);
    assert.strictEqual(fs.readdirSync(dirs.preview).filter((name) => name.endsWith(".json")).length, 3);
    assert.strictEqual(fs.readdirSync(dirs.qa).filter((name) => name.endsWith(".json")).length, 3);
    assert.strictEqual(fs.readdirSync(dirs["team-review"]).filter((name) => name.endsWith(".json")).length, 3);
    const allSessions = [];
    for (const [directory, ids] of [[dirs.qa, qaIds], [dirs["team-review"], reviewIds]]) for (let index = 0; index < ids.length; index += 1) {
      const session = JSON.parse(await fsp.readFile(path.join(directory, `${ids[index]}.json`), "utf8"));
      verifyRaw(session, ["honest", "dishonest", "hidden"][index]);
      allSessions.push(session);
    }
    const files = prolificExport.buildFiles(allSessions, envFor(3417, false), { protocolVersion: protocol.PROTOCOL_VERSION });
    for (const field of posttest.posttestFieldOrder) assert(files["surveys.csv"].split("\n", 1)[0].includes(`post_${field}`));
    const summaryLines = files["cell_summary.csv"].trim().split(/\r?\n/);
    assert.strictEqual(summaryLines.length, 4);
    for (const value of ["descriptive_honest", "descriptive_pro_misreport", "invisible"]) assert(files["cell_summary.csv"].includes(value));
    const metadata = JSON.parse(files["export_metadata.json"]);
    for (const [key, value] of Object.entries({ protocol_version: protocol.PROTOCOL_VERSION, condition_map_version: protocol.CONDITION_MAP_VERSION, posttest_schema_version: protocol.POSTTEST_SCHEMA_VERSION, source_task_protocol: protocol.SOURCE_TASK_PROTOCOL, source_task_commit: protocol.SOURCE_TASK_COMMIT })) assert.strictEqual(metadata[key], value);
    const adminHtml = fs.readFileSync(path.join(__dirname, "..", "public", "admin.html"), "utf8");
    const qaHtml = fs.readFileSync(path.join(__dirname, "..", "public", "qa-preview.html"), "utf8");
    const reviewHtml = fs.readFileSync(path.join(__dirname, "..", "public", "review.html"), "utf8");
    for (const html of [adminHtml, qaHtml, reviewHtml]) {
      assert(!html.includes("dishonest_fixed_1") && !html.includes("dishonest_escalating"));
    }
    assert(adminHtml.includes("FORMAL RECRUITMENT · 3-CELL MATRIX"));
    assert(adminHtml.includes("INTERNAL TEST · 3-CELL MATRIX"));
    assert(!adminHtml.includes("2×6 MATRIX") && !adminHtml.includes("study1-human-ai-${tab"));
    assert(adminHtml.includes("norm-supplement-${tab"));
    assert(reviewHtml.includes("Open the frozen AI-arm participant flow"));
    const handoffGenerator = fs.readFileSync(path.join(__dirname, "..", "scripts", "create-norm-supplement-private-handoff.js"), "utf8");
    assert(handoffGenerator.includes("/en/?variant="));
    assert.strictEqual((qaHtml.match(/<option value="(?:honest|dishonest|hidden)">/g) || []).length, 3);
    assert.strictEqual((reviewHtml.match(/<option value="(?:honest|dishonest|hidden)">/g) || []).length, 3);
  } finally {
    server.child.kill();
    await new Promise((resolve) => server.child.once("exit", resolve));
  }

  const formalServer = start(3418, true);
  try {
    await waitForHealth(formalServer);
    const denied = await request(formalServer.origin, "/api/prolific/session", jsonPost({ variant: tokenEntries[0][0], PROLIFIC_PID: deniedPid, STUDY_ID: "norm_supplement_test_study", SESSION_ID: "denied_submission" }));
    assert.strictEqual(denied.response.status, 403);
    assert.strictEqual(fs.readdirSync(dirs.formal).filter((name) => name.endsWith(".json")).length, 0, "denied Formal PID created a record");
  } finally {
    formalServer.child.kill();
    await new Promise((resolve) => formalServer.child.once("exit", resolve));
  }
  console.log("Norm Supplement targeted tests passed: 3 AI-only cells, frozen behavior, 22-item schema, four stores, Formal gate, denylist, exports, and researcher selectors.");
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
