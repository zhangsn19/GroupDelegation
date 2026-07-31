const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { CONDITIONS } = require("../config/common");
const { createProlificSupport } = require("./prolific");

const study = CONDITIONS.length === 7 ? "study1" : "study2";
const expectedStudyId = `taskflow-test-${study}`;
const dataDir = path.join(os.tmpdir(), `group-deception-${study}-prolific-${process.pid}-${Date.now()}`);
const variants = Object.fromEntries(CONDITIONS.map((condition, index) => [
  crypto.randomBytes(32).toString("base64url"),
  { variant_id: `variant_${index + 1}`, condition }
]));

function setTestEnvironment() {
  Object.assign(process.env, {
    NODE_ENV: "development",
    ASSIGNMENT_MODE: "prolific_taskflow",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    DEBUG_LINKS: "false",
    ADMIN_TOKEN: "prolific-test-admin",
    STUDY_CONTACT_EMAIL: "research@example.edu",
    DATA_DIR: dataDir,
    PROLIFIC_EXPECTED_STUDY_ID: expectedStudyId,
    PROLIFIC_COMPLETION_URL: "https://app.prolific.com/submissions/complete?cc=TESTONLY",
    PROLIFIC_VARIANT_MAP_JSON: JSON.stringify(variants),
    SERVER_RECORD_SECRET: "test-only-record-secret-with-at-least-32-characters",
    BONUS_CURRENCY: "GBP",
    BONUS_DISPLAY_LABEL: "Task bonus"
    ,PROLIFIC_PREVIEW_MODE: "true"
  });
  for (const key of [
    "PARTICIPANT_ID_ALLOWLIST_FILE",
    "ENTRY_CODE_HIDDEN",
    "ENTRY_CODE_HONEST",
    "ENTRY_CODE_DISHONEST",
    "ENTRY_CODE_DISHONEST_ESCALATING",
    "ENTRY_CODE_DISHONEST_FIXED_1",
    "ENTRY_CODE_DISHONEST_FIXED_2",
    "ENTRY_CODE_DISHONEST_FIXED_3",
    "TEST_CONDITION"
  ]) delete process.env[key];
}

async function post(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/prolific/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, payload: await response.json() };
}

async function postPath(baseUrl, pathname, body = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  return { response, payload: text ? JSON.parse(text) : null };
}

function identity(index, token = Object.keys(variants)[0]) {
  return {
    PROLIFIC_PID: `prolific_pid_${index}`,
    STUDY_ID: expectedStudyId,
    SESSION_ID: `submission_${index}`,
    variant: token
  };
}

async function main() {
  const missingEnv = { ...process.env, ASSIGNMENT_MODE: "prolific_taskflow" };
  for (const key of [
    "PROLIFIC_EXPECTED_STUDY_ID",
    "PROLIFIC_COMPLETION_URL",
    "PROLIFIC_VARIANT_MAP_JSON",
    "SERVER_RECORD_SECRET"
  ]) delete missingEnv[key];
  const missingResult = spawnSync(process.execPath, ["-e", 'require("./server/index")'], {
    cwd: process.cwd(),
    env: missingEnv,
    encoding: "utf8"
  });
  assert.notStrictEqual(missingResult.status, 0, "missing Prolific config must fail closed");

  setTestEnvironment();
  const app = require("./index");
  await fs.mkdir(dataDir, { recursive: true });
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const tokenEntries = Object.entries(variants);
    for (let index = 0; index < tokenEntries.length; index += 1) {
      const [token, descriptor] = tokenEntries[index];
      const result = await post(baseUrl, identity(`map_${index}`, token));
      assert.strictEqual(result.response.status, 200);
      assert.strictEqual(result.payload.session.condition, undefined, "participant API must not expose condition");
      const raw = JSON.parse(await fs.readFile(path.join(dataDir, `${result.payload.session.id}.json`), "utf8"));
      assert.strictEqual(raw.condition, descriptor.condition);
      assert.strictEqual(raw.taskflow_variant_id, descriptor.variant_id);
      assert.strictEqual(raw.assignment_mode, "prolific_taskflow");
      assert.strictEqual(raw.locale, "en");
      assert.match(raw.record_key, /^[a-f0-9]{64}$/);
      assert.notStrictEqual(JSON.stringify(result.payload).includes(token), true, "raw variant token leaked");
    }

    const concurrentIdentity = identity("same");
    const [first, second] = await Promise.all([
      post(baseUrl, concurrentIdentity),
      post(baseUrl, concurrentIdentity)
    ]);
    assert.strictEqual(first.response.status, 200);
    assert.strictEqual(second.response.status, 200);
    assert.strictEqual(first.payload.session.id, second.payload.session.id);

    const resume = await post(baseUrl, concurrentIdentity);
    assert.strictEqual(resume.payload.session.id, first.payload.session.id);

    const aliasResume = await post(baseUrl, { ...concurrentIdentity, SESSION_ID: "submission_other" });
    assert.strictEqual(aliasResume.response.status, 200);
    assert.strictEqual(aliasResume.payload.session.id, first.payload.session.id);

    const [aliasA, aliasB] = await Promise.all([
      post(baseUrl, { ...concurrentIdentity, SESSION_ID: "submission_alias_a" }),
      post(baseUrl, { ...concurrentIdentity, SESSION_ID: "submission_alias_b" })
    ]);
    assert.strictEqual(aliasA.payload.session.id, first.payload.session.id);
    assert.strictEqual(aliasB.payload.session.id, first.payload.session.id);
    let formalRaw = JSON.parse(await fs.readFile(path.join(dataDir, `${first.payload.session.id}.json`), "utf8"));
    assert.deepStrictEqual(new Set(formalRaw.prolific_session_aliases), new Set(["submission_same", "submission_other", "submission_alias_a", "submission_alias_b"]));
    assert.strictEqual(formalRaw.resume_count, 3);
    assert.strictEqual(formalRaw.condition, variants[concurrentIdentity.variant].condition);

    const conflict = await post(baseUrl, { ...concurrentIdentity, PROLIFIC_PID: "different_pid" });
    assert.strictEqual(conflict.response.status, 409);

    const alternateToken = Object.keys(variants)[1];
    const variantConflict = await post(baseUrl, { ...concurrentIdentity, variant: alternateToken });
    assert.strictEqual(variantConflict.response.status, 409);

    formalRaw.status = "completed";
    formalRaw.completion_status = "completed";
    await fs.writeFile(path.join(dataDir, `${first.payload.session.id}.json`), `${JSON.stringify(formalRaw, null, 2)}\n`);
    const completedRefresh = await post(baseUrl, concurrentIdentity);
    assert.strictEqual(completedRefresh.response.status, 200);
    assert.strictEqual(completedRefresh.payload.session.id, first.payload.session.id);
    assert.strictEqual(completedRefresh.payload.session.status, "completed");
    const completedDuplicate = await post(baseUrl, { ...concurrentIdentity, SESSION_ID: "submission_after_complete" });
    assert.strictEqual(completedDuplicate.response.status, 409);

    const previewIdentity = { ...identity("preview"), preview: true };
    const previewFirst = await post(baseUrl, previewIdentity);
    const previewRefresh = await post(baseUrl, previewIdentity);
    assert.strictEqual(previewFirst.response.status, 200);
    assert.strictEqual(previewRefresh.payload.session.id, previewFirst.payload.session.id);
    const previewSecond = await post(baseUrl, { ...previewIdentity, SESSION_ID: "submission_preview_second" });
    assert.strictEqual(previewSecond.response.status, 200);
    assert.notStrictEqual(previewSecond.payload.session.id, previewFirst.payload.session.id);
    let previewRaw = JSON.parse(await fs.readFile(path.join(dataDir, `${previewFirst.payload.session.id}.json`), "utf8"));
    assert.strictEqual(previewRaw.is_preview, true);
    assert.strictEqual(previewRaw.preview_source, "prolific_preview");
    previewRaw.status = "completed";
    previewRaw.completion_status = "completed";
    await fs.writeFile(path.join(dataDir, `${previewFirst.payload.session.id}.json`), `${JSON.stringify(previewRaw, null, 2)}\n`);
    const previewThird = await post(baseUrl, { ...previewIdentity, SESSION_ID: "submission_preview_third" });
    assert.strictEqual(previewThird.response.status, 200);
    assert.notStrictEqual(previewThird.payload.session.id, previewFirst.payload.session.id);
    const previewVariantConflict = await post(baseUrl, { ...previewIdentity, variant: alternateToken });
    assert.strictEqual(previewVariantConflict.response.status, 409);

    const disabledPreviewSupport = createProlificSupport({
      assignmentMode: "prolific_taskflow", isProduction: false, allowedConditions: CONDITIONS,
      expectedVariantCount: CONDITIONS.length,
      env: { ...process.env, PROLIFIC_PREVIEW_MODE: "false" }
    });
    assert.throws(() => disabledPreviewSupport.validateRequest(previewIdentity), (error) => error.code === "preview_mode_disabled");

    const timingIdentity = identity("timing");
    const timingCreated = await post(baseUrl, timingIdentity);
    let timingRaw = JSON.parse(await fs.readFile(path.join(dataDir, `${timingCreated.payload.session.id}.json`), "utf8"));
    timingRaw.status = "peer_records_viewed";
    timingRaw.actual_income_cents = 1000;
    timingRaw.actual_income = 10;
    timingRaw.income_report_selection_started_at = new Date().toISOString();
    await fs.writeFile(path.join(dataDir, `${timingRaw.id}.json`), `${JSON.stringify(timingRaw, null, 2)}\n`);
    await postPath(baseUrl, `/api/session/${timingRaw.id}/decision-timing`, { decision_segment_id: "segment_one", decision_segment_active_ms: 1200, decision_segment_hidden_ms: 100 });
    const timingResumed = await post(baseUrl, { ...timingIdentity, SESSION_ID: "submission_timing_resumed" });
    assert.strictEqual(timingResumed.payload.session.id, timingRaw.id);
    await postPath(baseUrl, `/api/session/${timingRaw.id}/decision-timing`, { decision_segment_id: "segment_two", decision_segment_active_ms: 800, decision_segment_hidden_ms: 50 });
    await postPath(baseUrl, `/api/session/${timingRaw.id}/income-report`, { reported_income: "1.00", decision_segment_id: "segment_two", decision_segment_active_ms: 1000, decision_segment_hidden_ms: 80 });
    timingRaw = JSON.parse(await fs.readFile(path.join(dataDir, `${timingRaw.id}.json`), "utf8"));
    assert.strictEqual(timingRaw.income_report.decision_time_ms, 2200);
    assert.strictEqual(timingRaw.income_report.page_hidden_duration_ms, 180);
    assert.strictEqual(timingRaw.income_report.timer_resumed_after_reload, true);

    const invalidStudy = await post(baseUrl, { ...identity("bad_study"), STUDY_ID: "wrong_study" });
    assert.strictEqual(invalidStudy.response.status, 403);
    const invalidVariant = await post(baseUrl, { ...identity("bad_variant"), variant: crypto.randomBytes(32).toString("base64url") });
    assert.strictEqual(invalidVariant.response.status, 403);

    const twenty = await Promise.all(Array.from({ length: 20 }, (_, index) => {
      const token = tokenEntries[index % tokenEntries.length][0];
      return post(baseUrl, identity(`parallel_${index}`, token));
    }));
    assert.ok(twenty.every((result) => result.response.status === 200));
    assert.strictEqual(new Set(twenty.map((result) => result.payload.session.id)).size, 20);

    const files = (await fs.readdir(dataDir)).filter((name) => name.endsWith(".json"));
    const sessions = await Promise.all(files.map(async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"))));
    const sameSessions = sessions.filter((session) => session.prolific_pid === concurrentIdentity.PROLIFIC_PID && !session.is_preview);
    assert.strictEqual(sameSessions.length, 1, "concurrent submission created duplicate sessions");
    assert.ok(await fs.stat(path.join(dataDir, "identity-audit.ndjson")));
    const root = await fetch(`${baseUrl}/`);
    const rootHtml = await root.text();
    assert.match(rootHtml, /<html lang="en"/);
    assert.doesNotMatch(rootHtml, /[\u3400-\u9fff]/);
    const summaryResponse = await fetch(`${baseUrl}/api/admin/prolific-summary`, {
      headers: { "x-admin-token": process.env.ADMIN_TOKEN }
    });
    const summary = await summaryResponse.json();
    assert.strictEqual(summaryResponse.status, 200);
    assert.ok(summary.participants.every((row) => !String(row.prolific_pid).includes("prolific_pid_")));
    assert.strictEqual(summary.preview_mode_enabled, true);
    assert.ok(summary.participants.every((row) => row.is_preview === false));
    assert.ok(summary.preview_participants.length >= 3 && summary.preview_participants.every((row) => row.is_preview === true));
    const bundleResponse = await fetch(`${baseUrl}/api/admin/export/prolific-bundle.zip`, {
      headers: { "x-admin-token": process.env.ADMIN_TOKEN }
    });
    const bundle = Buffer.from(await bundleResponse.arrayBuffer());
    assert.strictEqual(bundleResponse.status, 200);
    assert.strictEqual(bundle.readUInt32LE(0), 0x04034b50);
    assert.ok(!bundle.includes(Buffer.from("prolific_pid_preview")), "formal bundle included Preview data");
    const previewBundleResponse = await fetch(`${baseUrl}/api/admin/export/prolific-preview-bundle.zip`, { headers: { "x-admin-token": process.env.ADMIN_TOKEN } });
    const previewBundle = Buffer.from(await previewBundleResponse.arrayBuffer());
    assert.strictEqual(previewBundleResponse.status, 200);
    assert.ok(previewBundle.includes(Buffer.from("prolific_pid_preview")), "Preview bundle missing Preview data");
    for (const name of ["participants.csv", "study2_rounds.csv", "surveys.csv", "bonus_payments.csv", "raw_sessions.ndjson", "export_metadata.json"]) {
      assert.ok(bundle.includes(Buffer.from(name)), `bundle missing ${name}`);
    }
    console.log(`${study} Prolific Taskflow smoke passed: variants=${CONDITIONS.length} parallel=20 same_submission_sessions=1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
