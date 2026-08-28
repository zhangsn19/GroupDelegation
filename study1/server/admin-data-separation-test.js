const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const protocol = require("../config/human-ai-protocol");

const port = 3413;
const origin = `http://127.0.0.1:${port}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "study1-admin-separation-"));
const currentDir = path.join(root, "sessions");
const historicalDir = path.join(root, "historical");
fs.mkdirSync(currentDir, { recursive: true });
fs.mkdirSync(historicalDir, { recursive: true });

function fixture(id, scope, peerIdentity, condition) {
  const now = "2026-08-09T00:00:00.000Z";
  return {
    id,
    record_key: `record_${id}`,
    participant_id: `participant_${id}`,
    prolific_pid: `pid_${id}`,
    prolific_study_id: "study_fixture",
    prolific_session_id: `submission_${id}`,
    assignment_mode: scope === "formal" || scope === "preview" ? "prolific_taskflow" : scope === "qa" ? "qa_preview" : "team_review",
    assignment_source: scope,
    is_preview: scope === "preview",
    is_qa: scope === "qa",
    is_team_review: scope === "team_review",
    peer_identity: peerIdentity,
    condition,
    protocol_version: protocol.PROTOCOL_VERSION,
    status: "completed",
    created_at: now,
    started_at: now,
    completed_at: now,
    completion_redirect_initiated_at: now,
    comprehension_attempts: [{ passed: true }],
    dice_rounds: Array.from({ length: 10 }, (_, index) => ({ round_index: index + 1, decision_time_ms: 10, page_hidden_duration_ms: 0 })),
    post_survey: {},
    demographics: {},
  };
}

const fixtures = [
  fixture("formal_fixture", "formal", "human", "hidden"),
  fixture("preview_fixture", "preview", "ai", "honest"),
  fixture("qa_fixture", "qa", "human", "dishonest"),
  fixture("review_fixture", "team_review", "ai", "hidden"),
];
for (const session of fixtures) fs.writeFileSync(path.join(currentDir, `${session.id}.json`), `${JSON.stringify(session)}\n`);
fs.writeFileSync(path.join(historicalDir, "historical_fixture.json"), `${JSON.stringify({ id: "historical_fixture", record_key: "historical_fixture", condition: "dishonest_escalating", status: "completed", dice_rounds: [] })}\n`);

function directoryHash(directory) {
  const hash = crypto.createHash("sha256");
  for (const name of fs.readdirSync(directory).sort()) hash.update(name).update(fs.readFileSync(path.join(directory, name)));
  return hash.digest("hex");
}
const currentHashBefore = directoryHash(currentDir);
const historicalHashBefore = directoryHash(historicalDir);

const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: currentDir,
    LEGACY_STUDY1_DATA_DIR: historicalDir,
    ASSIGNMENT_MODE: "review_only",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    ALLOW_QA_PREVIEW: "true",
    ALLOW_TEAM_REVIEW: "true",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });

async function request(url) {
  const response = await fetch(`${origin}${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  let data = null;
  try { data = JSON.parse(body.toString("utf8")); } catch {}
  return { response, body, text: body.toString("utf8"), data };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Admin separation server did not start: ${stderr}`);
}

function storedZipEntry(buffer, wantedName) {
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    if (name === wantedName) return buffer.subarray(dataStart, dataStart + size).toString("utf8");
    offset = dataStart + size;
  }
  throw new Error(`ZIP entry not found: ${wantedName}`);
}

async function assertBundle(endpoint, expectedId, excludedIds, filenamePrefix) {
  const result = await request(`${endpoint}?peer_identity=nonmatching&condition=nonmatching`);
  assert.strictEqual(result.response.status, 200);
  assert(result.response.headers.get("content-disposition").includes(filenamePrefix));
  const participants = storedZipEntry(result.body, "participants.csv");
  const sessionIds = new Set(participants.trim().split(/\r?\n/).slice(1).map((row) => row.split(",")[0]));
  assert(sessionIds.has(expectedId));
  for (const id of excludedIds) assert(!sessionIds.has(id));
}

(async () => {
  try {
    await waitForHealth();
    const admin = await request("/admin.html");
    assert.strictEqual(admin.response.status, 200);
    for (const marker of ["tab-recruitment", "tab-internal", "tab-historical", "FORMAL RECRUITMENT · 3-CELL MATRIX", "INTERNAL TEST · 3-CELL MATRIX", "Production recruitment data only", "READ-ONLY LEGACY DATA"]) assert(admin.text.includes(marker));
    assert(admin.text.includes('id="tab-recruitment" class="tab-panel"'));
    assert(admin.text.includes('id="tab-internal" class="tab-panel" hidden'));
    assert(admin.text.includes('id="tab-historical" class="tab-panel" hidden'));
    assert(admin.text.includes('id="integrity-details" class="admin-card"') && !admin.text.includes('id="integrity-details" class="admin-card" open'));
    assert(admin.text.includes('id="technical-details" class="admin-card"') && !admin.text.includes('id="technical-details" class="admin-card" open'));

    const datasets = (await request("/api/admin/datasets")).data;
    assert.deepStrictEqual({ formal: datasets.recruitment.formal, preview: datasets.recruitment.preview }, { formal: 1, preview: 1 });
    assert.deepStrictEqual({ qa: datasets.internal.qa, review: datasets.internal.team_review, total: datasets.internal.total }, { qa: 1, review: 1, total: 2 });
    assert.strictEqual(datasets.historical.count, 1);
    assert.strictEqual(datasets.historical.read_only, true);
    assert.strictEqual(datasets.recruitment.formal_matrix.reduce((sum, cell) => sum + cell.arrived, 0), 1);
    assert.strictEqual(datasets.recruitment.formal_matrix.find((cell) => cell.peer_identity === "human" && cell.condition === "hidden").arrived, 1);
    assert.strictEqual(datasets.internal.all_matrix.reduce((sum, cell) => sum + cell.arrived, 0), 2);
    assert.strictEqual(datasets.internal.qa_matrix.reduce((sum, cell) => sum + cell.arrived, 0), 1);
    assert.strictEqual(datasets.internal.team_review_matrix.reduce((sum, cell) => sum + cell.arrived, 0), 1);

    const recruitment = (await request("/api/admin/records?dataset=recruitment&include_test=true")).data.participants;
    assert.deepStrictEqual(new Set(recruitment.map((row) => row.scope)), new Set(["formal", "preview"]));
    const internal = (await request("/api/admin/records?dataset=internal&include_test=true")).data.participants;
    assert.deepStrictEqual(new Set(internal.map((row) => row.scope)), new Set(["qa", "team_review"]));

    await assertBundle("/api/admin/export/prolific-bundle.zip", "formal_fixture", ["preview_fixture", "qa_fixture", "review_fixture"], "study1-human-ai-formal-");
    await assertBundle("/api/admin/export/prolific-preview-bundle.zip", "preview_fixture", ["formal_fixture", "qa_fixture", "review_fixture"], "study1-human-ai-preview-");
    await assertBundle("/api/admin/export/qa-bundle.zip", "qa_fixture", ["formal_fixture", "preview_fixture", "review_fixture"], "study1-human-ai-qa-");
    await assertBundle("/api/admin/export/team-review-bundle.zip", "review_fixture", ["formal_fixture", "preview_fixture", "qa_fixture"], "study1-human-ai-team-review-");
    await assertBundle("/api/admin/export/legacy-study1-bundle.zip", "historical_fixture", ["formal_fixture", "preview_fixture", "qa_fixture", "review_fixture"], "study1-historical-readonly-");

    const integrity = (await request("/api/admin/integrity")).data;
    assert(integrity.checks.length >= 14);
    assert(integrity.checks.every((check) => ["PASS", "WARNING", "NOT VERIFIED"].includes(check.status)));
    assert.strictEqual(directoryHash(currentDir), currentHashBefore);
    assert.strictEqual(directoryHash(historicalDir), historicalHashBefore);
    execFileSync("git", ["diff", "--quiet", "--", "study2"], { cwd: path.join(__dirname, "..", "..") });
    console.log("Admin data-separation acceptance passed: Recruitment, Internal Testing, Historical, matrices, exports, collapsed details, and read-only data.");
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
