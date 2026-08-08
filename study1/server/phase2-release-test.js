const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 3411;
const origin = `http://127.0.0.1:${port}`;
const adminToken = "phase2-synthetic-admin-token";
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study1-phase2-"));
const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dataRoot, "sessions"), ASSIGNMENT_MODE: "block", PARTICIPANT_ID_POLICY: "open", REQUIRE_PARTICIPANT_ID: "false", DEBUG_LINKS: "false", ALLOW_QA_PREVIEW: "true", ALLOW_TEAM_REVIEW: "true", ADMIN_TOKEN: adminToken, NODE_ENV: "development" },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });

async function request(url, options = {}) {
  const response = await fetch(`${origin}${url}`, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }
  return { response, data, text };
}

function answers(items) {
  return Object.fromEntries(items.map((item) => {
    if (item.type === "select") return [item.id, typeof item.options[0] === "object" ? item.options[0].value : item.options[0]];
    if (item.type === "number") return [item.id, item.min || 18];
    if (item.type === "text") return [item.id, "Synthetic Phase 2 acceptance response."];
    return [item.id, 4];
  }));
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const result = await request("/health"); if (result.response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not start: ${stderr}`);
}

async function exercise(peerIdentity, condition) {
  const created = await request("/api/review/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: peerIdentity, condition }) });
  assert.strictEqual(created.response.status, 200);
  const id = created.data.session.id;
  assert.strictEqual(created.data.session.peer_identity, peerIdentity);
  assert.strictEqual(created.data.session.assignment_mode, "team_review");
  assert(created.data.session.peer_members.slice(1).every((member) => member.name.startsWith(peerIdentity === "ai" ? "AI Member" : "Human Member")));
  assert(created.data.session.peer_members.slice(1).every((member) => member.avatar === (peerIdentity === "ai" ? "◈" : "👤")));
  const introText = created.data.session.rule_blocks.find((block) => block.title === "Your group").body;
  assert.strictEqual(introText, peerIdentity === "ai" ? "You will complete this task with four AI group members." : "You will complete this task with four other human group members.");
  const visibilityText = created.data.session.rule_blocks.find((block) => block.title === "Private reports").body;
  if (condition === "hidden") assert(visibilityText.includes("The other group members' report values are not shown in this task.") && !visibilityText.includes("You will see the other four"));
  const config = await request("/api/config");
  await request(`/api/session/${id}/consent`, { method: "POST" });
  const baseline = await request(`/api/session/${id}/baseline`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ responses: answers(config.data.baselineItems) }) });
  assert.strictEqual(baseline.response.status, 200);
  await request(`/api/session/${id}/rules-viewed`, { method: "POST" });
  const comprehension = await request(`/api/session/${id}/comprehension`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: { reported_object: "common_die", private_submission: "no", reward_direction: "higher_reward" } }) });
  assert.strictEqual(comprehension.data.passed, true);
  let current = (await request(`/api/session/${id}/dice/start`, { method: "POST" })).data.current;
  for (let round = 1; round <= 10; round += 1) {
    if (condition === "hidden") {
      const serialized = JSON.stringify(current.peer_records);
      assert(current.peer_records.every((record) => record.visibility === "hidden" && !("reportedValue" in record) && !("trueValue" in record) && !("underlying_reported_value" in record)));
      assert(!serialized.includes('"reportedValue"') && !serialized.includes('"trueValue"') && !serialized.includes('"underlying_reported_value"'));
    } else {
      assert(current.peer_records.every((record) => Number.isInteger(record.reportedValue)));
      if (condition === "honest") assert(current.peer_records.every((record) => record.reportedValue === current.true_die_value));
      if (condition === "dishonest") assert(current.peer_records.every((record) => record.reportedValue > current.true_die_value));
    }
    await request(`/api/session/${id}/dice/presented`, { method: "POST" });
    const submitted = await request(`/api/session/${id}/dice/round`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ round_index: round, reported_value: current.true_die_value, decision_segment_id: `synthetic_${round}`, decision_segment_active_ms: 10, decision_segment_hidden_ms: 0 }) });
    assert.strictEqual(submitted.response.status, 200);
    if (round < 10) current = (await request(`/api/session/${id}/dice/current`)).data.current;
  }
  const restored = await request(`/api/review/session/${id}`);
  const postItems = restored.data.session.post_survey_items;
  const post = await request(`/api/session/${id}/post-survey`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ responses: answers(postItems) }) });
  assert.strictEqual(post.response.status, 200);
  const demo = await request(`/api/session/${id}/demographics`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ responses: answers(restored.data.session.demographics_items) }) });
  assert.strictEqual(demo.response.status, 200);
  await request(`/api/session/${id}/debrief-viewed`, { method: "POST" });
  const complete = await request(`/api/session/${id}/complete`, { method: "POST" });
  assert.strictEqual(complete.data.session.status, "completed");
  return id;
}

(async () => {
  try {
    await waitForHealth();
    const unauthenticated = await request("/qa-preview");
    assert.strictEqual(unauthenticated.response.status, 200);
    assert(unauthenticated.text.includes("Authenticate") && !unauthenticated.text.includes('id="condition"'));
    const denied = await request("/api/admin/qa/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.strictEqual(denied.response.status, 401);
    const auth = await request("/api/qa/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: adminToken }) });
    assert.strictEqual(auth.response.status, 200);
    const cookie = auth.response.headers.get("set-cookie").split(";")[0];
    const selector = await request("/qa-preview", { headers: { cookie } });
    assert(selector.text.includes("LEGACY / NOT RECRUITED") && selector.text.includes('value="human"') && selector.text.includes('value="ai"'));
    const review = await request("/review");
    assert(review.response.ok && review.text.includes("Start Fresh Review Session") && !review.text.includes("dishonest_escalating"));
    const escalatingReview = await request("/api/review/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: "human", condition: "dishonest_escalating" }) });
    assert.strictEqual(escalatingReview.response.status, 400);
    const reviewIds = [];
    for (const peerIdentity of ["human", "ai"]) for (const condition of ["hidden", "honest", "dishonest"]) reviewIds.push(await exercise(peerIdentity, condition));
    for (const peerIdentity of ["human", "ai"]) for (const condition of ["dishonest_fixed_1", "dishonest_fixed_2", "dishonest_fixed_3"]) {
      const created = await request("/api/review/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: peerIdentity, condition }) });
      assert.strictEqual(created.response.status, 200);
      assert.strictEqual(created.data.session.assignment_mode, "team_review");
    }
    const protocol = require("../config/human-ai-protocol");
    for (const cell of protocol.supportedCells()) {
      const created = await request("/api/admin/qa/session", { method: "POST", headers: { "content-type": "application/json", "x-admin-token": adminToken }, body: JSON.stringify(cell) });
      assert.strictEqual(created.response.status, 200);
      assert.strictEqual(created.data.session.peer_identity, cell.peer_identity);
    }
    const prolificSummary = await request("/api/admin/prolific-summary?include_test=true", { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(prolificSummary.data.formal.arrived, 0);
    assert.strictEqual(prolificSummary.data.preview.arrived, 0);
    const reviewRecords = await request("/api/admin/records?include_test=true&scope=team_review", { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(reviewRecords.data.participants.length, 12);
    assert(reviewRecords.data.participants.every((record) => record.scope === "team_review" && record.peer_identity && "data_complete" in record));
    const qaRecords = await request("/api/admin/records?include_test=true&scope=qa", { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(qaRecords.data.participants.length, 14);
    const detail = await request(`/api/admin/session/${reviewIds[0]}`, { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(detail.data.rounds.length, 10);
    assert(detail.data.survey.post_survey.identity_recall);
    const qaBundle = await request("/api/admin/export/qa-bundle.zip", { headers: { "x-admin-token": adminToken } });
    assert.strictEqual(qaBundle.response.status, 200);
    const qaFiles = fs.readdirSync(path.join(dataRoot, "sessions")).filter((name) => name.endsWith(".json"));
    assert.strictEqual(qaFiles.length, 26);
    console.log("Phase 2 API/render acceptance passed: authenticated /qa-preview and six complete team-review flows.");
  } finally {
    child.kill();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
