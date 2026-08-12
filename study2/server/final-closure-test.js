const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { activeCells, PROTOCOL_VERSION } = require("../config/human-ai-protocol");
const study2 = require("../config/study2-income");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "study2-human-ai-closure-"));
const recruitmentDir = path.join(root, "recruitment");
const internalDir = path.join(root, "internal");
const historicalDir = path.join(root, "historical");
for (const directory of [recruitmentDir, internalDir, historicalDir]) fs.mkdirSync(directory, { recursive: true });
const historicalPath = path.join(historicalDir, "legacy_fixture.json");
fs.writeFileSync(historicalPath, `${JSON.stringify({ id: "legacy_fixture", condition: "hidden", status: "completed", study_version: "study2-v1.1.0" })}\n`);
const historicalBefore = crypto.createHash("sha256").update(fs.readFileSync(historicalPath)).digest("hex");

const variants = Object.fromEntries(activeCells().map((cell, index) => [
  crypto.createHash("sha256").update(`study2-closure-${index}`).digest("base64url"), cell
]));
const tokens = Object.keys(variants);
const port = 3425;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: internalDir,
    RECRUITMENT_DATA_DIR: recruitmentDir,
    LEGACY_STUDY2_DATA_DIR: historicalDir,
    ASSIGNMENT_MODE: "review_only",
    FORMAL_RECRUITMENT_ENABLED: "false",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    ALLOW_QA_PREVIEW: "true",
    ALLOW_TEAM_REVIEW: "true",
    PROLIFIC_PREVIEW_MODE: "true",
    PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variants),
    SERVER_RECORD_SECRET: "study2-final-closure-record-secret-1234567890",
    STUDY_CONTACT_EMAIL: "research@example.test",
    PROTOCOL_VERSION,
    NODE_ENV: "development",
    ADMIN_TOKEN: "study2-closure-admin"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });
child.stdout.on("data", () => {});

async function request(route, options = {}) {
  const response = await fetch(`${origin}${route}`, options);
  const body = Buffer.from(await response.arrayBuffer());
  const text = body.toString("utf8");
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, body, text, data };
}
function post(route, body, admin = false) {
  return request(route, { method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-token": "study2-closure-admin" } : {}) }, body: JSON.stringify(body) });
}
function responsesFor(items) {
  return Object.fromEntries(items.map((item) => {
    if (item.type === "text") return [item.id, ""];
    if (item.type === "select") return [item.id, typeof item.options[0] === "object" ? item.options[0].value : item.options[0]];
    if (item.type === "number") return [item.id, item.min || 18];
    return [item.id, Math.min(item.scalePoints || 7, 4)];
  }));
}
async function completeInternalFlow(session) {
  const id = session.id;
  assert.strictEqual((await post(`/api/session/${id}/consent`, {})).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/baseline`, { responses: responsesFor(study2.baselineItems) })).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/rules-viewed`, {})).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/comprehension`, { answers: Object.fromEntries(study2.comprehensionQuestions.map((item) => [item.id, item.correctValue])) })).response.status, 200);
  let current = (await post(`/api/session/${id}/effort/start`, {})).data.current;
  for (let round = 1; round <= study2.effortTask.rounds; round += 1) {
    const answers = Object.fromEntries(current.numbers.map((number, index) => [String(index), number % 2 === 0 ? "even" : "odd"]));
    const submitted = await post(`/api/session/${id}/effort/round`, { round_index: round, answers });
    assert.strictEqual(submitted.response.status, 200, submitted.text);
    current = submitted.data.current;
    if (!current.completed) current = (await post(`/api/session/${id}/effort/start`, {})).data.current;
  }
  assert.strictEqual((await post(`/api/session/${id}/income-viewed`, {})).response.status, 200);
  assert.strictEqual((await request(`/api/session/${id}/peer-records`)).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/peer-records-viewed`, {})).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/income-report`, { reported_income: "0.00" })).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/post-survey`, { responses: responsesFor(session.post_survey_items) })).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/experience`, { responses: responsesFor(session.experience_items) })).response.status, 200);
  const demographics = responsesFor(session.demographics_items); demographics.age = 30;
  assert.strictEqual((await post(`/api/session/${id}/demographics`, { responses: demographics })).response.status, 200);
  assert.strictEqual((await post(`/api/session/${id}/debrief-viewed`, {})).response.status, 200);
  const completed = await post(`/api/session/${id}/complete`, {});
  assert.strictEqual(completed.response.status, 200, completed.text);
  assert.strictEqual(completed.data.session.status, "completed");
  assert.strictEqual(completed.data.session.completion?.completion_redirect_url || null, null, "Internal session exposed a Prolific redirect");
}
async function waitForHealth() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Study2 closure server did not start: ${stderr}`);
}
function zipEntryNames(buffer) {
  const names = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    names.push(buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"));
    offset = nameStart + nameLength + extraLength + size;
  }
  return names;
}

(async () => {
  try {
    await waitForHealth();
    const health = (await request("/health")).data;
    assert.strictEqual(health.study_version, "study2-human-ai-v1");
    assert.strictEqual(health.protocol_version, "study2-human-ai-v1");
    assert.strictEqual(health.formal_recruitment_enabled, false);
    assert.strictEqual((await request("/")).response.status, 403);
    assert.strictEqual((await request(`/?variant=${tokens[0]}`)).response.status, 403);
    assert.strictEqual((await request("/?preview=true&variant=invalid-token-value-that-is-long-enough")).response.status, 403);
    assert.strictEqual((await request(`/?preview=true&variant=${tokens[0]}`)).response.status, 200);
    for (const route of ["/review", "/qa-preview", "/admin.html"]) assert.strictEqual((await request(route)).response.status, 200, route);

    const previews = [];
    for (const token of tokens) {
      const created = await post("/api/prolific/session", { preview: true, variant: token });
      assert.strictEqual(created.response.status, 200, created.text);
      previews.push(created.data.session);
    }
    const previewCells = new Set();
    for (const session of previews) {
      const rawPath = path.join(recruitmentDir, `${session.id}.json`);
      assert(fs.existsSync(rawPath));
      assert(!fs.existsSync(path.join(internalDir, `${session.id}.json`)));
      const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
      assert.strictEqual(raw.scope, "preview");
      assert.strictEqual(raw.is_preview, true);
      assert.strictEqual(raw.study_version, "study2-human-ai-v1");
      assert.strictEqual(raw.identity_manipulation_version, "identity-v1");
      assert.deepStrictEqual(raw.peer_member_ids.sort(), ["member_1", "member_2", "member_3", "member_4"]);
      previewCells.add(`${raw.peer_identity}|${raw.condition}`);
    }
    assert.strictEqual(previewCells.size, 6);

    const qaSessions = [];
    const reviewSessions = [];
    for (const cell of activeCells()) {
      const qa = await post("/api/admin/qa/session", cell);
      const review = await post("/api/review/session", cell);
      assert.strictEqual(qa.response.status, 200, qa.text);
      assert.strictEqual(review.response.status, 200, review.text);
      assert.strictEqual(qa.data.session.is_qa, true);
      assert.strictEqual(qa.data.session.is_team_review, false);
      assert.strictEqual(review.data.session.is_qa, false);
      assert.strictEqual(review.data.session.is_team_review, true);
      assert(fs.existsSync(path.join(internalDir, `${qa.data.session.id}.json`)));
      assert(fs.existsSync(path.join(internalDir, `${review.data.session.id}.json`)));
      await completeInternalFlow(qa.data.session);
      await completeInternalFlow(review.data.session);
      qaSessions.push(qa.data.session);
      reviewSessions.push(review.data.session);
    }
    assert.strictEqual(new Set(qaSessions.map((session) => session.peer_identity)).size, 2);
    assert.strictEqual(new Set(reviewSessions.map((session) => session.peer_identity)).size, 2);

    const adminHeaders = { "x-admin-token": "study2-closure-admin" };
    const datasets = (await request("/api/admin/datasets", { headers: adminHeaders })).data;
    assert.strictEqual(datasets.recruitment.formal, 0);
    assert.strictEqual(datasets.recruitment.preview, 6);
    assert.strictEqual(datasets.internal.qa, 6);
    assert.strictEqual(datasets.internal.team_review, 6);
    assert.strictEqual(datasets.historical.count, 1);
    const integrity = (await request("/api/admin/integrity", { headers: adminHeaders })).data;
    assert(integrity.checks.every((check) => check.status === "PASS"), JSON.stringify(integrity));

    const expectedZip = ["participants.csv", "study2_rounds.csv", "study2_effort_rounds.csv", "study2_income_reports.csv", "surveys.csv", "bonus_payments.csv", "raw_sessions.ndjson", "cell_summary.csv", "export_metadata.json"].sort();
    for (const [route, scope] of [["/api/admin/export/formal-bundle.zip", "formal"], ["/api/admin/export/preview-bundle.zip", "preview"], ["/api/admin/export/qa-bundle.zip", "qa"], ["/api/admin/export/team-review-bundle.zip", "team_review"], ["/api/admin/export/historical-bundle.zip", "historical"]]) {
      const result = await request(route, { headers: adminHeaders });
      assert.strictEqual(result.response.status, 200, `${scope}: ${result.text}`);
      assert.deepStrictEqual(zipEntryNames(result.body).sort(), expectedZip, scope);
    }

    const historicalAfter = crypto.createHash("sha256").update(fs.readFileSync(historicalPath)).digest("hex");
    assert.strictEqual(historicalAfter, historicalBefore, "historical source was rewritten");
    console.log("Study2 final closure passed: six-cell Preview, Formal closed, scoped stores, selectors, Admin integrity, and five isolated bundles.");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
