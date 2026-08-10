const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { activeCells, PROTOCOL_VERSION } = require("../config/human-ai-protocol");
const study1 = require("../config/study1-dice");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "study1-final-closure-"));
const recruitmentDir = path.join(root, "recruitment");
const internalDir = path.join(root, "internal");
const historicalDir = path.join(root, "historical");
for (const directory of [recruitmentDir, internalDir, historicalDir]) fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(historicalDir, "historical_fixture.json"), JSON.stringify({ id: "historical_fixture", condition: "hidden", status: "completed" }));

const variants = Object.fromEntries(activeCells().map((cell, index) => [
  crypto.createHash("sha256").update(`final-closure-${index}`).digest("base64url"),
  { variant_id: `closure_${index + 1}`, peer_identity: cell.peer_identity, condition: cell.condition },
]));
const tokens = Object.keys(variants);
const port = 3415;
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: internalDir,
    RECRUITMENT_DATA_DIR: recruitmentDir,
    LEGACY_STUDY1_DATA_DIR: historicalDir,
    ASSIGNMENT_MODE: "review_only",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    ALLOW_QA_PREVIEW: "true",
    ALLOW_TEAM_REVIEW: "true",
    PROLIFIC_PREVIEW_MODE: "true",
    PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variants),
    SERVER_RECORD_SECRET: "final-closure-test-record-secret-1234567890",
    STUDY_CONTACT_EMAIL: "research@example.test",
    PROTOCOL_VERSION,
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });

async function request(route, options = {}) {
  const response = await fetch(`${origin}${route}`, options);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, text, data };
}
async function post(route, body) {
  return request(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function waitForHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`Server did not start: ${stderr}`);
}

(async () => {
  try {
    await waitForHealth();
    assert.strictEqual((await request("/")).response.status, 403);
    assert.strictEqual((await request(`/?variant=${tokens[0]}`)).response.status, 403);
    assert.strictEqual((await request("/?preview=true&variant=invalid")).response.status, 403);
    const previewPage = await request(`/?preview=true&variant=${tokens[0]}`);
    assert.strictEqual(previewPage.response.status, 200);
    assert(previewPage.text.includes('lang="en"'));

    const previewSessions = [];
    for (const token of tokens) {
      const created = await post("/api/prolific/session", { preview: true, variant: token });
      assert.strictEqual(created.response.status, 200, created.text);
      previewSessions.push(created.data.session);
    }
    assert.strictEqual(previewSessions.length, 12);
    const previewRaws = [];
    for (const session of previewSessions) {
      const rawPath = path.join(recruitmentDir, `${session.id}.json`);
      assert(fs.existsSync(rawPath));
      const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
      previewRaws.push(raw);
      assert.strictEqual(raw.is_preview, true);
      assert.strictEqual(raw.scope, "preview");
      assert.strictEqual(raw.protocol_version, PROTOCOL_VERSION);
      assert(raw.peer_identity && raw.condition && raw.taskflow_variant_id);
      assert(!fs.existsSync(path.join(internalDir, `${session.id}.json`)));
    }
    assert.strictEqual(new Set(previewRaws.map((session) => `${session.peer_identity}|${session.condition}`)).size, 12);
    const hidden = previewRaws.find((session) => session.condition === "hidden");
    const hiddenPublic = (await request(`/api/session/${hidden.id}`)).data.session;
    assert(hidden && !hiddenPublic.post_survey_items.some((item) => item.id === "peer_reports_considered"));

    const qa = await post("/api/admin/qa/session", { peer_identity: "human", condition: "hidden" });
    const review = await post("/api/review/session", { peer_identity: "ai", condition: "honest" });
    assert.strictEqual(qa.response.status, 200);
    assert.strictEqual(review.response.status, 200);
    assert(fs.existsSync(path.join(internalDir, `${qa.data.session.id}.json`)));
    assert(fs.existsSync(path.join(internalDir, `${review.data.session.id}.json`)));
    assert(!fs.existsSync(path.join(recruitmentDir, `${qa.data.session.id}.json`)));

    const datasets = (await request("/api/admin/datasets")).data;
    assert.deepStrictEqual(
      datasets.storage,
      { recruitment_data_dir: recruitmentDir, internal_data_dir: internalDir, historical_data_dir: historicalDir },
    );
    assert.strictEqual(datasets.recruitment.formal, 0);
    assert.strictEqual(datasets.recruitment.preview, 12);
    assert.strictEqual(datasets.internal.qa, 1);
    assert.strictEqual(datasets.internal.team_review, 1);
    assert.strictEqual(datasets.historical.count, 1);
    const integrity = (await request("/api/admin/integrity")).data;
    assert(integrity.checks.every((check) => check.status === "PASS"), JSON.stringify(integrity.checks));

    for (const id of ["d_guilt", "d_moral_discomfort"]) {
      const item = study1.humanAiPostSurveyItems.find((candidate) => candidate.id === id);
      assert.deepStrictEqual([item.minLabel, item.maxLabel], ["Not at all", "Very strongly"]);
    }
    console.log("Final closure acceptance passed: preview 12/12, formal closed, physical stores, selectors, nonleakage, Admin integrity, and anchors.");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
