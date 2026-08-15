const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright");

const CONDITIONS = {
  injunctive_honest: "I think members of this group should report the actual die outcome.",
  injunctive_misreport: "I think members of this group should report above the actual die outcome to increase their reward.",
  subjective_honest: "I think members of this group expect you to report the actual die outcome.",
  subjective_misreport: "I think members of this group expect you to report above the actual die outcome to increase your reward.",
};

const externalOrigin = process.env.NORM_TEST_ORIGIN || "";
const tempRoot = externalOrigin ? null : fs.mkdtempSync(path.join(os.tmpdir(), "norm-browser-"));
const port = 44000 + crypto.randomInt(1000);
let server;

function storeDir(scope) {
  return path.join(tempRoot, scope);
}

async function waitForServer(origin) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("AI Norm Pilot browser-test server did not become healthy");
}

async function completeVisibleSurvey(page, overrides = {}) {
  await page.locator(".survey-list").waitFor();
  await page.evaluate((values) => {
    const root = document.querySelector(".survey-list");
    const radioNames = [...new Set([...root.querySelectorAll('input[type="radio"]')].map((node) => node.name))];
    for (const name of radioNames) {
      const requested = Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : "4";
      const options = [...root.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`)];
      const selected = options.find((node) => node.value === requested) || options[0];
      selected.checked = true;
      selected.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const field of root.querySelectorAll("select")) {
      const requested = values[field.name];
      field.value = requested !== undefined ? String(requested) : [...field.options].find((option) => option.value)?.value || "";
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    for (const field of root.querySelectorAll('input[type="number"]')) {
      field.value = values[field.name] !== undefined ? String(values[field.name]) : "30";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    for (const field of root.querySelectorAll("textarea")) {
      field.value = values[field.name] !== undefined ? String(values[field.name]) : "Browser acceptance response\nwith a preserved second line.";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, overrides);
}

async function runCondition(browser, origin, condition, stimulus, index) {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, Math.min(Number(delay) || 0, 8), ...args);
  });
  const page = await context.newPage();
  await page.goto(`${origin}/review`, { waitUntil: "networkidle" });
  const matrixButton = page.locator(`button[data-condition="${condition}"]`);
  await assert.doesNotReject(() => matrixButton.waitFor());
  const [createResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/api/review/session") && response.request().method() === "POST"),
    matrixButton.click(),
  ]);
  if (createResponse.status() !== 200) {
    throw new Error(`${condition}: Review creation failed with HTTP ${createResponse.status()}`);
  }
  await page.waitForURL(/review_session=/);

  await page.locator("#consent-check").check();
  await page.locator("#btn-consent-agree").click();
  await completeVisibleSurvey(page);
  await page.locator('[data-action="baseline"]').click();
  await page.locator('[data-action="show-rules"]').waitFor();
  await page.locator('[data-action="show-rules"]').click();
  await page.locator('[data-action="rules-viewed"]').waitFor();
  await page.locator('[data-action="rules-viewed"]').click();
  await page.locator('input[name="private_submission"]').first().waitFor({ state: "attached" });
  const comprehension = {
    private_submission: "no",
    message_reward: "no",
    message_timing: "before",
    report_choice: "self",
    reward_direction: "higher_reward",
  };
  await page.evaluate((answers) => {
    for (const [name, value] of Object.entries(answers)) {
      const field = document.querySelector(`input[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
      assertField(field, name);
      field.checked = true;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function assertField(field, name) { if (!field) throw new Error(`Missing comprehension field: ${name}`); }
  }, comprehension);
  await page.locator('[data-action="submit-comprehension"]').click();

  for (let round = 1; round <= 10; round += 1) {
    await page.locator(".dice-private-zone").waitFor();
    let bubbles = await page.locator(".msg-bubble").allTextContents();
    assert.deepStrictEqual(bubbles, [stimulus, stimulus, stimulus, stimulus], `${condition}, round ${round}: frozen messages`);
    assert.strictEqual(await page.locator(".msg-bubble").count(), 4);
    if (round === 5) {
      await page.reload({ waitUntil: "networkidle" });
      await page.locator(".dice-private-zone").waitFor();
      bubbles = await page.locator(".msg-bubble").allTextContents();
      assert.deepStrictEqual(bubbles, [stimulus, stimulus, stimulus, stimulus], `${condition}: reload preserves stimulus`);
    }
    await page.locator('.number-button[data-value="6"]').click();
    await page.locator('[data-action="submit-dice"]').click();
    await page.locator(".dice-result-zone").waitFor();
    await page.locator('[data-action="next-dice"]').click();
  }

  const recognition = condition.startsWith("injunctive") ? "appropriate" : "expected_me";
  const supportCount = condition.endsWith("honest") ? "0" : "4";
  await completeVisibleSurvey(page, {
    norm_type_recognition: recognition,
    norm_misreport_support_count: supportCount,
    identity_recall: "ai",
    open_norm_interpretation: `Condition ${condition}\nmessage considered in browser acceptance.`,
  });
  assert.strictEqual(await page.locator(".survey-card").count(), 22, `${condition}: exactly 22 posttest items`);
  await page.locator('[data-action="post-survey"]').click();
  await page.locator('[data-action="demographics"]').waitFor();
  await completeVisibleSurvey(page, { age: 30 });
  await page.locator('[data-action="demographics"]').click();
  await page.locator('[data-action="complete"]').waitFor({ state: "attached" });
  await page.locator('[data-action="complete"]:not([disabled])').waitFor();
  await page.locator('[data-action="complete"]').click();
  await page.locator("#screen-complete.active").waitFor();

  const sessionId = new URL(page.url()).searchParams.get("review_session");
  assert.ok(sessionId, `${condition}: review session ID is retained`);
  await context.close();
  return sessionId;
}

async function verifyAdmin(browser, origin) {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (const scope of ["formal", "preview", "qa", "team-review"]) {
    await page.goto(`${origin}/admin/${scope}`, { waitUntil: "networkidle" });
    assert.strictEqual(await page.locator("#matrix tr").count(), 2, `${scope}: 2 norm-type rows`);
    assert.strictEqual(await page.locator("#matrix td").count(), 4, `${scope}: 2x2 cells`);
    const recordCount = await page.locator('#records button[data-id]').count();
    assert.strictEqual(recordCount, scope === "team-review" ? 4 : 0, `${scope}: scope-only participants`);
  }
  const response = await context.request.get(`${origin}/api/admin/scope/formal/export.zip`);
  assert.strictEqual(response.status(), 200);
  assert.match(response.headers()["content-type"] || "", /zip/);
  assert.ok((await response.body()).length > 100, "formal export is a valid nonempty bundle");
  await context.close();
}

async function main() {
  let origin = externalOrigin;
  if (!origin) {
    const variantMap = Object.fromEntries(Object.keys(CONDITIONS).map((condition) => {
      const [normType] = condition.split("_");
      const normValence = condition.endsWith("honest") ? "honest" : "pro_misreport";
      const token = crypto.createHash("sha256").update(`browser-${condition}`).digest("base64url");
      return [token, { variant_id: `browser_${condition}`, condition, peer_identity: "ai", protocol_version: "study1-ai-norm-pilot-v1", norm_type: normType, norm_valence: normValence }];
    }));
    for (const scope of ["formal", "preview", "qa", "team-review"]) fs.mkdirSync(storeDir(scope));
    server = spawn(process.execPath, [path.join(__dirname, "index.js")], {
      cwd: path.join(__dirname, ".."),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        AI_NORM_PILOT_ENABLED: "true",
        PROTOCOL_VERSION: "study1-ai-norm-pilot-v1",
        STUDY_VERSION: "study1-ai-norm-pilot-v1",
        ASSIGNMENT_MODE: "prolific_taskflow",
        FORMAL_RECRUITMENT_ENABLED: "false",
        PROLIFIC_PREVIEW_MODE: "true",
        ALLOW_PREVIEW: "true",
        ALLOW_QA_PREVIEW: "true",
        ALLOW_TEAM_REVIEW: "true",
        SERVER_RECORD_SECRET: "browser-test-record-secret-with-sufficient-entropy",
        STUDY_CONTACT_EMAIL: "browser-test@example.invalid",
        PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variantMap),
        FORMAL_DATA_DIR: storeDir("formal"),
        PREVIEW_DATA_DIR: storeDir("preview"),
        QA_DATA_DIR: storeDir("qa"),
        TEAM_REVIEW_DATA_DIR: storeDir("team-review"),
      },
    });
    server.stdout.on("data", () => {});
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
    origin = `http://127.0.0.1:${port}`;
    await waitForServer(origin);
  }

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.NORM_TEST_CHROMIUM ? { executablePath: process.env.NORM_TEST_CHROMIUM } : {}),
  });
  try {
    let index = 0;
    for (const [condition, stimulus] of Object.entries(CONDITIONS)) {
      await runCondition(browser, origin, condition, stimulus, index++);
    }
    await verifyAdmin(browser, origin);
  } finally {
    await browser.close();
  }
  console.log("AI Norm Pilot browser acceptance passed: 4 cells, 40 rounds, reload, posttest, Admin scopes, export.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (server) server.kill();
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});
