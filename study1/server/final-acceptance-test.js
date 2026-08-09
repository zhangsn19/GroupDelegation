const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");

const port = 3412;
const origin = `http://127.0.0.1:${port}`;
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study1-final-acceptance-"));
const sessionsDir = path.join(dataRoot, "sessions");
const legacyDir = path.join(dataRoot, "legacy-sessions");
fs.mkdirSync(legacyDir, { recursive: true });
fs.writeFileSync(path.join(legacyDir, "legacy_fixture.json"), `${JSON.stringify({ id: "legacy_fixture", status: "completed", dice_rounds: [] })}\n`);

const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: sessionsDir,
    LEGACY_STUDY1_DATA_DIR: legacyDir,
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

async function request(url, options = {}) {
  const response = await fetch(`${origin}${url}`, options);
  const body = Buffer.from(await response.arrayBuffer());
  const text = body.toString("utf8");
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { response, body, text, data };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Final acceptance server did not start: ${stderr}`);
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

function validatePrivateHandoff() {
  const root = process.env.STUDY1_HANDOFF_ROOT || "D:\\GroupDeceptionPrivate\\Study1-HumanAI-v1";
  const csvPath = path.join(root, "prolific", "Study1_HumanAI_Taskflow_pilot_READY.csv");
  const mappingPath = path.join(root, "prolific", "Study1_HumanAI_Taskflow_variant_mapping_PRIVATE.txt");
  for (const required of [root, path.join(root, "00_OPEN_ME.html"), csvPath, mappingPath]) assert(fs.existsSync(required), `Missing handoff path: ${required}`);

  const rows = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
  assert.strictEqual(rows.length, 12);
  const tokens = rows.map((row) => {
    const match = row.match(/^https:\/\/study1\.8-216-54-76\.sslip\.io\/\?variant=([A-Za-z0-9_-]+),1$/);
    assert(match, `Invalid Taskflow row: ${row}`);
    assert(!/human|ai|hidden|honest|dishonest|fixed|condition/i.test(match[1]));
    return match[1];
  });
  assert.strictEqual(new Set(tokens).size, 12);
  assert(!/PROLIFIC_PID|STUDY_ID|SESSION_ID|dishonest_escalating/i.test(rows.join("\n")));

  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  assert.strictEqual(Object.keys(mapping).length, 12);
  assert.deepStrictEqual(new Set(Object.keys(mapping)), new Set(tokens));
  const cells = Object.values(mapping).map(({ peer_identity, condition }) => `${peer_identity}:${condition}`);
  assert.strictEqual(new Set(cells).size, 12);
  assert.strictEqual(cells.filter((cell) => cell.startsWith("human:")).length, 6);
  assert.strictEqual(cells.filter((cell) => cell.startsWith("ai:")).length, 6);
  assert(!cells.some((cell) => cell.includes("escalating")));

  const openMe = fs.readFileSync(path.join(root, "00_OPEN_ME.html"), "utf8");
  for (const uri of [
    "file:///D:/GroupDeceptionPrivate/Study1-HumanAI-v1/",
    "file:///D:/GroupDeceptionPrivate/Study1-HumanAI-v1/prolific/Study1_HumanAI_Taskflow_pilot_READY.csv",
    "file:///D:/GroupDeceptionPrivate/Study1-HumanAI-v1/prolific/Study1_HumanAI_Taskflow_variant_mapping_PRIVATE.txt",
    "file:///D:/mydevelops/github/GroupDelegation/study1/",
  ]) assert(openMe.includes(uri), `Missing handoff URI: ${uri}`);
}

(async () => {
  try {
    await waitForHealth();

    for (const endpoint of ["/admin.html", "/qa-preview", "/api/admin/summary", "/api/admin/records", "/api/admin/integrity", "/api/admin/prolific-summary"]) {
      assert.strictEqual((await request(endpoint)).response.status, 200, `${endpoint} must be directly accessible`);
    }

    const qa = await request("/api/admin/qa/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: "human", condition: "hidden" }),
    });
    assert.strictEqual(qa.response.status, 200);
    assert.strictEqual(qa.data.session.assignment_mode, "qa_preview");
    const qaDetail = await request(`/api/admin/session/${qa.data.session.id}`);
    assert.strictEqual(qaDetail.data.metadata.scope, "qa");
    const rawQa = JSON.parse(fs.readFileSync(path.join(sessionsDir, `${qa.data.session.id}.json`), "utf8"));
    assert.strictEqual(rawQa.is_qa, true);

    const review = await request("/api/review/session", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: "ai", condition: "hidden" }),
    });
    assert.strictEqual(review.response.status, 200);
    assert.strictEqual(review.data.session.assignment_mode, "team_review");
    const reviewDetail = await request(`/api/admin/session/${review.data.session.id}`);
    assert.strictEqual(reviewDetail.data.metadata.scope, "team_review");
    const rawReview = JSON.parse(fs.readFileSync(path.join(sessionsDir, `${review.data.session.id}.json`), "utf8"));
    assert.strictEqual(rawReview.is_team_review, true);

    const fullTeam = await request("/api/admin/export/team-review-bundle.zip?scope=qa&peer_identity=human&condition=honest&status=completed");
    assert.strictEqual(fullTeam.response.status, 200);
    const bundledParticipants = storedZipEntry(fullTeam.body, "participants.csv");
    assert(bundledParticipants.includes(review.data.session.id));
    assert(!bundledParticipants.includes(qa.data.session.id));

    const filteredParticipants = await request("/api/admin/export/participants.csv?include_test=true&peer_identity=human&condition=hidden");
    assert(filteredParticipants.text.includes(qa.data.session.id));
    assert(!filteredParticipants.text.includes(review.data.session.id));
    const filteredJson = await request("/api/admin/export/json?include_test=true&peer_identity=human&condition=hidden");
    assert.deepStrictEqual(filteredJson.data.sessions.map((session) => session.id), [qa.data.session.id]);
    const serverSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    assert(serverSource.includes("study1DiceRoundsCsv(filterSessions(await store.listSessions(), req.query))"));

    const items = require("../config/study1-dice").humanAiPostSurveyItems;
    for (const id of ["d_guilt", "d_moral_discomfort"]) {
      const item = items.find((candidate) => candidate.id === id);
      assert.strictEqual(item.minLabel, "Not at all");
      assert.strictEqual(item.maxLabel, "Very strongly");
    }
    for (const id of ["e_reflects_my_decision", "e_personal_responsibility", "shared_group_responsibility"]) {
      const item = items.find((candidate) => candidate.id === id);
      assert.strictEqual(item.minLabel, "Strongly disagree");
      assert.strictEqual(item.maxLabel, "Strongly agree");
    }

    validatePrivateHandoff();
    execFileSync("git", ["diff", "--quiet", "--", "study2"], { cwd: path.join(__dirname, "..", "..") });
    console.log("Final acceptance passed: no-auth admin/QA, isolated scopes, export filtering, anchors, Taskflow, handoff paths, and Study2 unchanged.");
  } finally {
    child.kill();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
