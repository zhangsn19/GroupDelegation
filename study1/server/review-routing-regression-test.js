const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 3414;
const origin = `http://127.0.0.1:${port}`;
const root = fs.mkdtempSync(path.join(os.tmpdir(), "study1-review-routing-"));
const sessionsDir = path.join(root, "sessions");
const historicalDir = path.join(root, "historical");
fs.mkdirSync(historicalDir, { recursive: true });

const child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
  cwd: path.join(__dirname, ".."),
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: sessionsDir,
    LEGACY_STUDY1_DATA_DIR: historicalDir,
    ASSIGNMENT_MODE: "review_only",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    ALLOW_QA_PREVIEW: "true",
    ALLOW_TEAM_REVIEW: "true",
    PROTOCOL_VERSION: "",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let stderr = "";
child.stderr.on("data", (chunk) => { stderr += chunk; });

async function request(url, options = {}) {
  const response = await fetch(`${origin}${url}`, options);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { response, text, data };
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await request("/health")).response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Review routing test server did not start: ${stderr}`);
}

function rawSession(id) {
  return JSON.parse(fs.readFileSync(path.join(sessionsDir, `${id}.json`), "utf8"));
}

(async () => {
  try {
    await waitForHealth();
    const health = await request("/health");
    assert.strictEqual(health.data.protocol_version, "study1-human-ai-v1");
    assert.strictEqual((await request("/")).response.status, 404);

    const reviewPage = await request("/review");
    assert.strictEqual(reviewPage.response.status, 200);
    assert(reviewPage.text.includes("Norm Supplement Review") && reviewPage.text.includes("Start Fresh Review Session") && reviewPage.text.includes("Open the frozen AI-arm participant flow"));
    assert(!reviewPage.text.includes("实验一：骰子结果申报任务") && !reviewPage.text.includes("共享群聊 AI"));

    const qaPage = await request("/qa-preview");
    assert.strictEqual(qaPage.response.status, 200);
    assert(qaPage.text.includes("Norm Supplement QA") && qaPage.text.includes("Start QA Preview"));
    assert(!qaPage.text.includes("参与编号缺失") && !qaPage.text.includes("实验一：骰子结果申报任务"));

    const adminPage = await request("/admin.html");
    assert(adminPage.text.includes("Norm Supplement Admin") && adminPage.text.includes("tab-recruitment") && adminPage.text.includes("tab-internal") && adminPage.text.includes("tab-historical"));

    const review = await request("/api/review/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: "ai", condition: "hidden" }) });
    assert.strictEqual(review.response.status, 200);
    assert.strictEqual(review.data.session.assignment_mode, "team_review");
    assert.strictEqual(review.data.session.protocol_version, "study1-human-ai-v1");
    const reviewRaw = rawSession(review.data.session.id);
    assert.strictEqual(reviewRaw.is_team_review, true);
    assert.strictEqual(reviewRaw.assignment_mode, "team_review");
    assert(review.data.session.peer_members.slice(1).every((member) => member.name.startsWith("AI Member")));
    assert(!review.data.session.post_survey_items.some((item) => item.id === "peer_reports_considered"));
    for (const id of ["d_guilt", "d_moral_discomfort"]) {
      const item = review.data.session.post_survey_items.find((candidate) => candidate.id === id);
      assert.strictEqual(item.minLabel, "Not at all");
      assert.strictEqual(item.maxLabel, "Very strongly");
    }
    const reviewFlow = await request(`/en/?review_session=${encodeURIComponent(review.data.session.id)}`);
    assert.strictEqual(reviewFlow.response.status, 200);
    assert(reviewFlow.text.includes('lang="en"') && reviewFlow.text.includes("Study 1: Dice Reporting Task"));

    const qa = await request("/api/admin/qa/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ peer_identity: "human", condition: "honest" }) });
    assert.strictEqual(qa.response.status, 200);
    assert.strictEqual(qa.data.session.assignment_mode, "qa_preview");
    assert.strictEqual(qa.data.session.protocol_version, "study1-human-ai-v1");
    const qaRaw = rawSession(qa.data.session.id);
    assert.strictEqual(qaRaw.is_qa, true);
    assert.strictEqual(qaRaw.assignment_mode, "qa_preview");
    assert(qa.data.session.peer_members.slice(1).every((member) => member.name.startsWith("Human Member")));
    const qaFlow = await request(`/en/?qa_session=${encodeURIComponent(qa.data.session.id)}`);
    assert.strictEqual(qaFlow.response.status, 200);
    assert(qaFlow.text.includes('lang="en"') && qaFlow.text.includes("Study 1: Dice Reporting Task"));

    console.log("Review routing regression passed: selectors, Human–AI sessions, English entry, protocol health, fail-closed root, Admin, and anchors.");
  } finally {
    child.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
