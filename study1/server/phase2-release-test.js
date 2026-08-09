const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 3411;
const externalOrigin = String(process.env.EXTERNAL_ORIGIN || "").replace(/\/$/, "");
const origin = externalOrigin || `http://127.0.0.1:${port}`;
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study1-phase2-"));
const legacyRoot = path.join(dataRoot, "legacy-sessions");
fs.mkdirSync(legacyRoot, { recursive: true });
const legacyFixturePath = path.join(legacyRoot, "legacy_readonly_fixture.json");
fs.writeFileSync(legacyFixturePath, `${JSON.stringify({ id: "legacy_readonly_fixture", study: "study1", condition: "honest", status: "completed", created_at: "2024-01-01T00:00:00.000Z", dice_rounds: [] }, null, 2)}\n`);
const legacyHashBefore = fs.readFileSync(legacyFixturePath, "utf8");
const child = externalOrigin ? null : spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: { ...process.env, PORT: String(port), DATA_DIR: path.join(dataRoot, "sessions"), LEGACY_STUDY1_DATA_DIR: legacyRoot, ASSIGNMENT_MODE: "review_only", PARTICIPANT_ID_POLICY: "open", REQUIRE_PARTICIPANT_ID: "false", DEBUG_LINKS: "false", ALLOW_QA_PREVIEW: "true", ALLOW_TEAM_REVIEW: "true", NODE_ENV: "development" },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child?.stderr.on("data", (chunk) => { stderr += chunk; });

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
    if (item.type === "text") return [item.id, item.required === false ? "" : "Synthetic Phase 2 acceptance response."];
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
  const createdDetail = await request(`/api/admin/session/${id}`);
  assert.strictEqual(createdDetail.data.metadata.assignment_source, "team_review");
  assert(created.data.session.peer_members.slice(1).every((member) => member.name.startsWith(peerIdentity === "ai" ? "AI Member" : "Human Member")));
  assert(created.data.session.peer_members.slice(1).every((member) => member.avatar === (peerIdentity === "ai" ? "🤖" : "👤")));
  const introText = created.data.session.rule_blocks.find((block) => block.title === "Your group").body;
  assert.strictEqual(introText, peerIdentity === "ai" ? "You will complete this task with four AI group members." : "You will complete this task with four other human group members.");
  const visibilityText = created.data.session.rule_blocks.find((block) => block.title === "Private reports").body;
  if (condition === "hidden") assert(visibilityText.includes("The other group members' report values are not shown in this task.") && !visibilityText.includes("You will see the other four"));
  const config = await request("/api/config");
  await request(`/api/session/${id}/consent`, { method: "POST" });
  const baseline = await request(`/api/session/${id}/baseline`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ responses: answers(config.data.baselineItems) }) });
  assert.strictEqual(baseline.response.status, 200);
  await request(`/api/session/${id}/rules-viewed`, { method: "POST" });
  const wrongComprehension = await request(`/api/session/${id}/comprehension`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: { reported_object: "private_preference", private_submission: "no", reward_direction: "higher_reward" } }) });
  assert.strictEqual(wrongComprehension.data.passed, false);
  assert.strictEqual(wrongComprehension.data.wrong_items[0].review, "Members report a value for the shared die result.");
  assert(!/[\u3400-\u9fff]/.test(JSON.stringify(wrongComprehension.data.wrong_items)));
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
    const root = await request("/");
    assert.strictEqual(root.response.status, 403);
    assert.strictEqual(root.text, "Study access requires a valid study link.");
    const bareEnglish = await request("/en/");
    assert.strictEqual(bareEnglish.response.status, 403);
    const formalEntry = await request("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.strictEqual(formalEntry.response.status, 404);
    assert.strictEqual((await request("/api/admin/summary")).response.status, 200);
    assert.strictEqual((await request("/api/admin/records")).response.status, 200);
    assert.strictEqual((await request("/api/admin/integrity")).response.status, 200);
    const adminPage = await request("/admin.html");
    for (const marker of ["Study1 Human–AI Admin", "count-formal", "export-groups", "matrix-output", "filter-scope", "all-records-output", "integrity-output", "technical-details"]) assert(adminPage.text.includes(marker));
    assert(!adminPage.text.includes('id="admin-token"'));
    const selector = await request("/qa-preview");
    assert.strictEqual(selector.response.status, 200);
    assert(selector.text.includes("LEGACY / NOT RECRUITED") && selector.text.includes('value="human"') && selector.text.includes('value="ai"'));
    const initialReviewRecords = await request("/api/admin/records?scope=team_review");
    const initialQaRecords = await request("/api/admin/records?scope=qa");
    const initialReviewCount = initialReviewRecords.data.participants.length;
    const initialQaCount = initialQaRecords.data.participants.length;
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
    let firstQaId = "";
    for (const cell of protocol.supportedCells()) {
      const created = await request("/api/admin/qa/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cell) });
      assert.strictEqual(created.response.status, 200);
      assert.strictEqual(created.data.session.peer_identity, cell.peer_identity);
      assert.strictEqual((await request(`/api/admin/session/${created.data.session.id}`)).data.metadata.assignment_source, "qa_preview");
      firstQaId ||= created.data.session.id;
    }
    const resumedQa = await request(`/api/qa/session/${firstQaId}`);
    assert.strictEqual(resumedQa.response.status, 200);
    assert.strictEqual(resumedQa.data.session.id, firstQaId);
    const prolificSummary = await request("/api/admin/prolific-summary?include_test=true");
    assert.strictEqual(prolificSummary.data.active_matrix.length, 12);
    assert.strictEqual(prolificSummary.data.formal.arrived, 0);
    assert.strictEqual(prolificSummary.data.preview.arrived, 0);
    const reviewRecords = await request("/api/admin/records?scope=team_review");
    assert.strictEqual(reviewRecords.data.participants.length, initialReviewCount + 12);
    assert(reviewRecords.data.participants.every((record) => record.scope === "team_review" && record.peer_identity && "data_complete" in record));
    const filteredRecords = await request("/api/admin/records?scope=team_review&peer_identity=human&condition=hidden&status=completed");
    assert(filteredRecords.data.participants.length >= 1);
    assert(filteredRecords.data.participants.every((record) => record.scope === "team_review" && record.peer_identity === "human" && record.condition === "hidden" && record.status === "completed"));
    const qaRecords = await request("/api/admin/records?scope=qa");
    assert.strictEqual(qaRecords.data.participants.length, initialQaCount + 14);
    assert([...reviewRecords.data.participants, ...qaRecords.data.participants].every((record) => !(record.quality_flags || []).includes("missing_required_fields") && !(record.quality_flags || []).includes("completion_not_confirmed")));
    const detail = await request(`/api/admin/session/${reviewIds[0]}`);
    assert.strictEqual(detail.data.rounds.length, 10);
    assert(detail.data.survey.post_survey.identity_recall);
    const qaBundle = await request("/api/admin/export/qa-bundle.zip");
    assert.strictEqual(qaBundle.response.status, 200);
    const reviewBundle = await request("/api/admin/export/team-review-bundle.zip");
    assert.strictEqual(reviewBundle.response.status, 200);
    const emptyFormalBundle = await request("/api/admin/export/prolific-bundle.zip");
    assert.strictEqual(emptyFormalBundle.response.status, 200);
    assert.strictEqual((await request("/api/admin/export/prolific-preview-bundle.zip")).response.status, 200);
    assert.strictEqual((await request("/api/admin/export/participants.csv")).response.status, 200);
    assert.strictEqual((await request("/api/admin/export/study1_dice_rounds.csv")).response.status, 200);
    assert.strictEqual((await request("/api/admin/export/json")).response.status, 200);
    const integrity = await request("/api/admin/integrity");
    assert.strictEqual(integrity.response.status, 200);
    assert(integrity.data.checks.length >= 14);
    assert(integrity.data.checks.every((check) => ["PASS", "WARNING", "NOT VERIFIED"].includes(check.status)));
    const legacySummary = await request("/api/admin/legacy/summary?include_test=true");
    assert.strictEqual(legacySummary.response.status, 200);
    assert.strictEqual(legacySummary.data.read_only, true);
    if (!externalOrigin) {
      assert.strictEqual(legacySummary.data.record_count, 1);
      const legacyDetail = await request("/api/admin/legacy/session/legacy_readonly_fixture");
      assert.strictEqual(legacyDetail.data.read_only, true);
      assert.strictEqual(fs.readFileSync(legacyFixturePath, "utf8"), legacyHashBefore);
    }
    if (!externalOrigin) {
      const qaFiles = fs.readdirSync(path.join(dataRoot, "sessions")).filter((name) => name.endsWith(".json"));
      assert.strictEqual(qaFiles.length, initialReviewCount + initialQaCount + 26);
    }
    console.log("Phase 2 API/render acceptance passed: direct-access /qa-preview and six complete team-review flows.");
  } finally {
    child?.kill();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
