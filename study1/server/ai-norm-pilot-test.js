const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const norm = require("../config/ai-norm-pilot");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-norm-pilot-test-"));
const dirs = Object.fromEntries(["formal", "preview", "qa", "team_review"].map((scope) => {
  const dir = path.join(root, scope, "sessions"); fs.mkdirSync(dir, { recursive: true }); return [scope, dir];
}));
const port = 43000 + crypto.randomInt(1000);
const adminToken = "test-admin-token-0123456789-abcdef";
const tokenFor = (condition) => crypto.createHash("sha256").update(`ai-norm-${condition}`).digest("base64url");
const variants = Object.fromEntries(norm.CONDITIONS.map((condition) => [tokenFor(condition), {
  variant_id: `norm_${condition}`,
  condition,
  peer_identity: "ai",
  protocol_version: norm.PROTOCOL_VERSION,
  norm_type: norm.CONDITION_MAP[condition].norm_type,
  norm_valence: norm.CONDITION_MAP[condition].norm_valence,
}]));

const env = {
  ...process.env,
  PORT: String(port),
  PROTOCOL_VERSION: norm.PROTOCOL_VERSION,
  STUDY_VERSION: norm.STUDY_VERSION,
  ASSIGNMENT_MODE: "prolific_taskflow",
  FORMAL_RECRUITMENT_ENABLED: "false",
  PROLIFIC_PREVIEW_MODE: "true",
  ALLOW_PREVIEW: "true",
  ALLOW_QA_PREVIEW: "true",
  ALLOW_TEAM_REVIEW: "true",
  FORMAL_DATA_DIR: dirs.formal,
  PREVIEW_DATA_DIR: dirs.preview,
  QA_DATA_DIR: dirs.qa,
  TEAM_REVIEW_DATA_DIR: dirs.team_review,
  DATA_DIR: dirs.qa,
  RECRUITMENT_DATA_DIR: dirs.formal,
  SERVER_RECORD_SECRET: "test-record-secret-0123456789-abcdef",
  ADMIN_TOKEN: adminToken,
  STUDY_CONTACT_EMAIL: "research@example.org",
  PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variants),
  GIT_COMMIT: "norm-test-commit",
};

const base = `http://127.0.0.1:${port}`;
async function request(url, options = {}) {
  const response = await fetch(`${base}${url}`, options);
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json") ? await response.json() : await response.text();
  return { response, data };
}
async function post(url, body) {
  return request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function waitForHealth(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error("Norm Pilot test server exited early");
    try { const result = await request("/health"); if (result.response.ok) return result.data; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Norm Pilot test server did not become healthy");
}
function raw(scope, id) { return JSON.parse(fs.readFileSync(path.join(dirs[scope], `${id}.json`), "utf8")); }
function surveyResponses(items, condition) {
  const descriptor = norm.descriptor(condition);
  return Object.fromEntries(items.map((item) => {
    if (item.type === "likert") return [item.id, 4];
    if (item.id === "norm_type_recognition") return [item.id, descriptor.norm_type === "injunctive" ? "appropriate" : "expected_me"];
    if (item.id === "norm_misreport_support_count") return [item.id, descriptor.norm_valence === "honest" ? "0" : "4"];
    if (item.id === "identity_recall") return [item.id, "ai"];
    if (item.type === "text") return [item.id, "Line one\nLine two"];
    return [item.id, item.options[0].value ?? item.options[0]];
  }));
}
function baselineResponses(items) { return Object.fromEntries(items.map((item) => [item.id, 3])); }
function demographicResponses(items) {
  return Object.fromEntries(items.map((item) => item.type === "number" ? [item.id, 30] : [item.id, item.options[0].value ?? item.options[0]]));
}
async function completeReview(condition, reloadRound = null) {
  const created = await post("/api/review/session", { peer_identity: "ai", condition });
  assert.strictEqual(created.response.status, 200);
  let session = created.data.session;
  assert.strictEqual(session.protocol_version, norm.PROTOCOL_VERSION);
  assert.strictEqual(session.peer_identity, "ai");
  const consent = await post(`/api/session/${session.id}/consent`, {}); session = consent.data.session;
  session = (await post(`/api/session/${session.id}/baseline`, { responses: baselineResponses((await request("/api/config")).data.baselineItems) })).data.session;
  session = (await post(`/api/session/${session.id}/rules-viewed`, {})).data.session;
  const answers = Object.fromEntries(norm.COMPREHENSION_QUESTIONS.map((item) => [item.id, item.correctValue]));
  const comp = await post(`/api/session/${session.id}/comprehension`, { answers }); assert.strictEqual(comp.data.passed, true); session = comp.data.session;
  let current = (await post(`/api/session/${session.id}/dice/start`, {})).data.current;
  for (let round = 1; round <= 10; round += 1) {
    assert.strictEqual(current.round_index, round);
    assert.strictEqual(current.peer_messages.length, 4);
    assert.strictEqual(new Set(current.peer_messages.map((item) => item.peer_id)).size, 4);
    assert.deepStrictEqual([...new Set(current.peer_messages.map((item) => item.message))], [norm.STIMULI[condition]]);
    assert.strictEqual(current.norm_stimulus_id, norm.CONDITION_MAP[condition].stimulus_id);
    assert(!JSON.stringify(current).match(/reportedValue|underlying_reported_value|n_peers_misreporting|misreporting_peer/));
    if (round === reloadRound) {
      const reloaded = (await request(`/api/session/${session.id}/dice/current`)).data.current;
      assert.deepStrictEqual({ die: reloaded.true_die_value, messages: reloaded.peer_messages, condition }, { die: current.true_die_value, messages: current.peer_messages, condition });
    }
    current = (await post(`/api/session/${session.id}/dice/presented`, {})).data.current;
    const submitted = await post(`/api/session/${session.id}/dice/round`, { round_index: round, reported_value: 6, decision_segment_id: `segment_${round}`, decision_segment_active_ms: 10, decision_segment_hidden_ms: 0 });
    assert.strictEqual(submitted.response.status, 200);
    if (round === reloadRound) {
      const duplicate = await post(`/api/session/${session.id}/dice/round`, { round_index: round, reported_value: 1 });
      assert.strictEqual(duplicate.data.round.reported_value, 6);
    }
    if (round < 10) current = (await request(`/api/session/${session.id}/dice/current`)).data.current;
  }
  session = (await request(`/api/session/${session.id}`)).data.session;
  const posttest = surveyResponses(session.post_survey_items, condition);
  assert.strictEqual(Object.keys(posttest).length, 22);
  session = (await post(`/api/session/${session.id}/post-survey`, { responses: posttest })).data.session;
  session = (await post(`/api/session/${session.id}/demographics`, { responses: demographicResponses(session.demographics_items) })).data.session;
  session = (await post(`/api/session/${session.id}/debrief-viewed`, {})).data.session;
  session = (await post(`/api/session/${session.id}/complete`, {})).data.session;
  assert.strictEqual(session.status, "completed");
  const stored = raw("team_review", session.id);
  assert.strictEqual(stored.scope, "team_review");
  assert.strictEqual(stored.post_survey.norm_misreport_support_count, norm.descriptor(condition).norm_valence === "honest" ? "0" : "4");
  assert.strictEqual(stored.post_survey.open_norm_interpretation, "Line one\nLine two");
  assert.deepStrictEqual(stored.study1_die_sequence.slice().sort(), [1,1,2,2,3,3,4,4,5,5]);
  assert.strictEqual(stored.dice_rounds.at(-1).cumulative_reward, 60);
  assert(!Object.prototype.hasOwnProperty.call(stored, "study1_peer_records_by_round"));
  assert(!JSON.stringify(stored).match(/reportedValue|underlying_reported_value|n_peers_misreporting|misreporting_peer_names|misreporting_peer_ids/));
  return stored;
}

(async () => {
  assert.deepStrictEqual(norm.CONDITIONS, ["injunctive_honest", "injunctive_misreport", "subjective_honest", "subjective_misreport"]);
  assert.strictEqual(norm.POSTTEST_ITEMS.length, 22);
  assert.strictEqual(norm.PROTOCOL_VERSION, "study1-ai-norm-pilot-v1");
  assert.strictEqual(norm.CONDITION_MAP_VERSION, "ai-norm-2x2-v1");
  assert.strictEqual(norm.STIMULUS_VERSION, "ai-norm-stimuli-v1");
  assert.strictEqual(norm.POSTTEST_SCHEMA_VERSION, "ai-norm-posttest-v1");
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], { cwd: path.join(__dirname, ".."), env, stdio: ["ignore", "pipe", "pipe"] });
  try {
    const health = await waitForHealth(child); assert.strictEqual(health.protocol_version, norm.PROTOCOL_VERSION); assert.strictEqual(health.formal_recruitment_enabled, false);
    assert.strictEqual((await post("/api/prolific/session", { variant: tokenFor(norm.CONDITIONS[0]) })).response.status, 403);
    const completed = [];
    for (let i = 0; i < norm.CONDITIONS.length; i += 1) completed.push(await completeReview(norm.CONDITIONS[i], i === 0 ? 5 : null));
    const qa = await post("/api/admin/qa/session", { peer_identity: "ai", condition: norm.CONDITIONS[0] }); assert.strictEqual(qa.response.status, 200); assert(fs.existsSync(path.join(dirs.qa, `${qa.data.session.id}.json`)));
    const preview = await post("/api/preview/session", { condition: norm.CONDITIONS[1] }); assert.strictEqual(preview.response.status, 200); assert(fs.existsSync(path.join(dirs.preview, `${preview.data.session.id}.json`)));
    const formalFixture = { ...completed[0], id: "formal_fixture", participant_id: "formal_fixture", scope: "formal", assignment_mode: "prolific_taskflow", is_team_review: false, is_qa: false, is_preview: false };
    fs.writeFileSync(path.join(dirs.formal, "formal_fixture.json"), `${JSON.stringify(formalFixture, null, 2)}\n`);
    for (const [urlScope, fileScope] of [["formal","formal"],["preview","preview"],["qa","qa"],["team-review","team_review"]]) {
      const result = await request(`/api/admin/scope/${urlScope}/summary?scope=all`, { headers: { "x-admin-token": adminToken } }); assert.strictEqual(result.response.status, 200); assert.strictEqual(result.data.scope, fileScope); assert.strictEqual(result.data.matrix.length, 4); assert(result.data.participants.every((row) => row.scope === fileScope));
      const bundle = await request(`/api/admin/scope/${urlScope}/export.zip?scope=all`, { headers: { "x-admin-token": adminToken } }); assert.strictEqual(bundle.response.status, 200);
    }
    const detail = await request(`/api/admin/scope/team-review/session/${completed[0].id}`, { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(detail.response.status, 200); assert.strictEqual(detail.data.metadata.norm_type, completed[0].norm_type); assert.strictEqual(detail.data.metadata.norm_valence, completed[0].norm_valence); assert.strictEqual(detail.data.metadata.stimulus_version, norm.STIMULUS_VERSION); assert.strictEqual(detail.data.metadata.posttest_schema_version, norm.POSTTEST_SCHEMA_VERSION); assert.strictEqual(detail.data.metadata.git_commit, env.GIT_COMMIT); assert.strictEqual(detail.data.rounds.length, 10); assert.strictEqual(Object.keys(detail.data.survey.post_survey).length, 22);
    assert.strictEqual((await request("/api/admin/scope/formal/summary")).response.status, 401);
    const { buildFiles } = require("./prolific-export");
    const files = buildFiles(completed, env, { protocolVersion: norm.PROTOCOL_VERSION, exportScope: "team_review" });
    for (const name of ["participants.csv","study1_rounds.csv","surveys.csv","bonus_payments.csv","raw_sessions.ndjson","export_metadata.json","cell_summary.csv"]) assert(files[name], name);
    assert(files["surveys.csv"].includes("norm_misreport_support_count")); assert(files["surveys.csv"].includes("\n0," ) || files["surveys.csv"].includes(",0,")); assert(files["surveys.csv"].includes('"Line one\nLine two"'));
    for (const forbidden of ["n_peers_misreporting","misreporting_peer_names_json","misreporting_peer_ids_json","underlying_reported_value"]) assert(!files["study1_rounds.csv"].includes(forbidden));
    for (const line of files["raw_sessions.ndjson"].trim().split("\n")) JSON.parse(line);
    const metadata = JSON.parse(files["export_metadata.json"]); assert.strictEqual(metadata.export_scope, "team_review"); assert.deepStrictEqual(Object.keys(metadata.condition_map), norm.CONDITIONS); assert.strictEqual(metadata.stimuli.length, 4);
    console.log("AI Norm Pilot acceptance passed: protocol, stimuli, flow, reload, posttest, four stores, matrices, exports, and closed Formal gate.");
  } finally {
    child.kill(); fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
