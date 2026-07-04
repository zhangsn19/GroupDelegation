const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const vm = require("vm");
const { spawnSync } = require("child_process");

function makeBaseTestEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of [
    "DATA_DIR",
    "ASSIGNMENT_MODE",
    "PARTICIPANT_ID_POLICY",
    "REQUIRE_PARTICIPANT_ID",
    "PARTICIPANT_ID_ALLOWLIST_FILE",
    "ENTRY_CODE_HIDDEN",
    "ENTRY_CODE_HONEST",
    "ENTRY_CODE_DISHONEST",
    "TEST_CONDITION",
    "ADMIN_TOKEN",
    "DEBUG_LINKS",
    "STUDY_CONTACT_EMAIL"
  ]) {
    delete env[key];
  }
  Object.assign(env, {
    NODE_ENV: "development",
    DEBUG_LINKS: "true",
    ASSIGNMENT_MODE: "block",
    PARTICIPANT_ID_POLICY: "open",
    REQUIRE_PARTICIPANT_ID: "false",
    PARTICIPANT_ID_ALLOWLIST_FILE: "",
    ENTRY_CODE_HIDDEN: "",
    ENTRY_CODE_HONEST: "",
    ENTRY_CODE_DISHONEST: "",
    TEST_CONDITION: "",
    ADMIN_TOKEN: "dev-admin-token",
    STUDY_CONTACT_EMAIL: "123456@163.com",
    COMPLETION_CODE: "SMOKE-STUDY2-COMPLETE",
    COMPLETION_REDIRECT_URL: "https://example.com/study2-complete"
  });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === null) delete env[key];
    else env[key] = String(value);
  }
  return env;
}

function applyTestEnv(env) {
  for (const key of [
    "DATA_DIR",
    "ASSIGNMENT_MODE",
    "PARTICIPANT_ID_POLICY",
    "REQUIRE_PARTICIPANT_ID",
    "PARTICIPANT_ID_ALLOWLIST_FILE",
    "ENTRY_CODE_HIDDEN",
    "ENTRY_CODE_HONEST",
    "ENTRY_CODE_DISHONEST",
    "TEST_CONDITION",
    "ADMIN_TOKEN",
    "DEBUG_LINKS",
    "STUDY_CONTACT_EMAIL",
    "COMPLETION_CODE",
    "COMPLETION_REDIRECT_URL"
  ]) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
}

const smokeRoot = path.join(os.tmpdir(), `group-deception-study2-smoke-${process.pid}-${Date.now()}`);
fs.rmSync(smokeRoot, { recursive: true, force: true });
applyTestEnv(makeBaseTestEnv({ DATA_DIR: path.join(smokeRoot, "sessions") }));

const app = require("./index");
const store = require("./store");
const study2 = require("../config/study2-income");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testProductionConfigPollutionRegression() {
  const keys = [
    "ASSIGNMENT_MODE",
    "PARTICIPANT_ID_POLICY",
    "REQUIRE_PARTICIPANT_ID",
    "PARTICIPANT_ID_ALLOWLIST_FILE",
    "ENTRY_CODE_HIDDEN",
    "ENTRY_CODE_HONEST",
    "ENTRY_CODE_DISHONEST",
    "TEST_CONDITION",
    "ADMIN_TOKEN",
    "DEBUG_LINKS",
    "STUDY_CONTACT_EMAIL"
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    ASSIGNMENT_MODE: "controlled_link",
    PARTICIPANT_ID_POLICY: "allowlist",
    REQUIRE_PARTICIPANT_ID: "true",
    PARTICIPANT_ID_ALLOWLIST_FILE: "fake-production-allowlist.json",
    ENTRY_CODE_HIDDEN: "fake-production-hidden-entry",
    ENTRY_CODE_HONEST: "fake-production-honest-entry",
    ENTRY_CODE_DISHONEST: "fake-production-dishonest-entry",
    TEST_CONDITION: "dishonest",
    ADMIN_TOKEN: "fake-production-admin-token",
    DEBUG_LINKS: "false",
    STUDY_CONTACT_EMAIL: "production@example.invalid"
  });
  try {
    const env = makeBaseTestEnv({ DATA_DIR: path.join(os.tmpdir(), "study2-pollution-regression") });
    assert(env.ASSIGNMENT_MODE === "block", "base test env did not force block assignment");
    assert(env.PARTICIPANT_ID_POLICY === "open", "base test env did not force open participant policy");
    assert(env.REQUIRE_PARTICIPANT_ID === "false", "base test env did not disable required participant id");
    assert(env.ADMIN_TOKEN === "dev-admin-token", "base test env did not force dev admin token");
    assert(env.DEBUG_LINKS === "true", "base test env did not force debug links");
    assert(!env.PARTICIPANT_ID_ALLOWLIST_FILE, "base test env inherited allowlist file");
    assert(!env.ENTRY_CODE_HIDDEN && !env.ENTRY_CODE_HONEST && !env.ENTRY_CODE_DISHONEST, "base test env inherited entry codes");
    assert(!env.TEST_CONDITION, "base test env inherited TEST_CONDITION");
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function request(server, method, requestPath, body, expectedStatus = 200, headers = {}) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      method,
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...headers } : headers
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => {
        const expectJson = !requestPath.includes(".csv");
        if (expectJson && !res.headers["content-type"]?.includes("application/json")) {
          reject(new Error(`${method} ${requestPath} expected JSON, got ${res.headers["content-type"] || ""}: ${raw.slice(0, 200)}`));
          return;
        }
        const parsed = raw && res.headers["content-type"]?.includes("json") ? JSON.parse(raw) : raw;
        if (res.statusCode !== expectedStatus) {
          reject(new Error(`${method} ${requestPath} expected ${expectedStatus}, got ${res.statusCode}: ${raw}`));
        } else {
          resolve(parsed);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestRaw(server, method, requestPath, body, headers = {}) {
  const payload = body === undefined ? null : JSON.stringify(body);
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      method,
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload), ...headers } : headers
    }, (res) => {
      let raw = "";
      res.on("data", (chunk) => { raw += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, contentType: res.headers["content-type"] || "", body: raw }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function makeResponses(items) {
  const responses = {};
  for (const item of items) {
    if (item.type === "text") responses[item.id] = "";
    else if (item.type === "select") responses[item.id] = item.options[0];
    else if (item.type === "number") responses[item.id] = item.min ?? 18;
    else responses[item.id] = Math.min(item.scalePoints || 7, 4);
  }
  return responses;
}

function comprehensionAnswers() {
  return Object.fromEntries(study2.comprehensionQuestions.map((item) => [item.id, item.correctValue]));
}

function assertPublicSession(session) {
  for (const key of ["study", "condition", "condition_label", "condition_name", "is_test_session", "debug_mode", "debug_links_enabled", "randomization_block", "randomization_position", "assignment_source", "entry_link_id"]) {
    assert(!Object.prototype.hasOwnProperty.call(session, key), `public session exposed ${key}`);
  }
  assert(session.study_version === "study2-v1.1.0", "public session study_version mismatch");
  assert(session.protocol_version === "peer-reporting-v2", "public session protocol_version mismatch");
}

function assertPublicConfig(config) {
  assert(config.contact_email === "123456@163.com", "config contact_email must be 123456@163.com");
  for (const key of ["version", "study_version", "protocol_version", "pilotNotice", "condition", "randomization", "debug", "study1", "study2", "assignment_source", "entry_link_id"]) {
    assert(!Object.prototype.hasOwnProperty.call(config, key), `config exposed ${key}`);
  }
  assert(Array.isArray(config.baselineItems), "config baselineItems missing");
  assert(Array.isArray(config.postSurveyItems), "config postSurveyItems missing");
  assert(Array.isArray(config.demographicsItems), "config demographicsItems missing");
  assert(Array.isArray(config.experienceItems), "config experienceItems missing");
  assert(Array.isArray(config.ruleBlocks), "config ruleBlocks missing");
  assert(Array.isArray(config.comprehensionQuestions), "config comprehensionQuestions missing");
  assert(!JSON.stringify(config.comprehensionQuestions).includes("correctValue"), "config exposed comprehension correctValue");
  const f2 = config.postSurveyItems.find((item) => item.id === "f_design_influences");
  assert(f2.prompt.includes("请说明；若没有或不想补充，也可留空。"), "F2 final text mismatch");
}

async function testMissingSessionHandling(server) {
  const missing = await request(server, "GET", "/api/session/legal-missing-study2", undefined, 410);
  const text = JSON.stringify(missing);
  assert(missing.error === "当前参与记录无法恢复。请联系研究团队获取新的参与链接后重新开始。", "missing session message mismatch");
  for (const leak of ["ENOENT", "/tmp", "sessions", "data\\\\", "no such file", ".json"]) {
    assert(!text.includes(leak), `missing session leaked ${leak}`);
  }
}

async function testApiNeverReturnsHtml(server) {
  for (const probe of [
    ["POST", "/api/not-a-real-endpoint", {}],
    ["GET", "/api/not-a-real-endpoint", undefined],
    ["GET", "/api/session/bad%3Cid%3E", undefined],
    ["POST", "/not-a-real-mutation", {}]
  ]) {
    const result = await requestRaw(server, probe[0], probe[1], probe[2]);
    assert(result.contentType.includes("application/json"), `${probe[0]} ${probe[1]} did not return JSON`);
    assert(!result.body.includes("<!doctype") && !result.body.includes("<html"), `${probe[0]} ${probe[1]} returned HTML`);
    const text = result.body.toLowerCase();
    for (const leak of ["entry_code", "assignment_source", "entry_link_id", "admin_token", "ngrok", "sessions", "data\\\\", "data/"]) {
      assert(!text.includes(leak), `${probe[0]} ${probe[1]} leaked ${leak}`);
    }
  }
}

async function createReadySession(server, config, condition, participantId) {
  process.env.TEST_CONDITION = condition;
  const created = await request(server, "POST", "/api/session", { participant_id: participantId });
  assertPublicSession(created.session);
  const id = created.session.id;
  await request(server, "POST", `/api/session/${id}/consent`);
  await request(server, "POST", `/api/session/${id}/baseline`, { responses: makeResponses(config.baselineItems) });
  await request(server, "POST", `/api/session/${id}/rules-viewed`);
  await request(server, "POST", `/api/session/${id}/comprehension`, { answers: comprehensionAnswers() });
  return id;
}

async function runEffortToPeerRecords(server, config, condition, participantId) {
  const id = await createReadySession(server, config, condition, participantId);
  let current = (await request(server, "POST", `/api/session/${id}/effort/start`)).current;
  for (let round = 1; round <= study2.effortTask.rounds; round += 1) {
    const answers = {};
    current.numbers.forEach((number, index) => {
      answers[String(index)] = number % 2 === 0 ? "even" : "odd";
    });
    const body = {
      round_index: round,
      answers,
      duration_ms: 0,
      started_at: "2000-01-01T00:00:00.000Z"
    };
    const submitted = await request(server, "POST", `/api/session/${id}/effort/round`, body);
    const duplicate = await request(server, "POST", `/api/session/${id}/effort/round`, body);
    const storedAfterDuplicate = await store.readSession(id);
    assert(duplicate.duplicate === true, "duplicate effort round should return duplicate=true");
    assert(duplicate.round.round_index === submitted.round.round_index, "duplicate effort round did not return saved round");
    assert(storedAfterDuplicate.effort_rounds.length === round, "duplicate effort round changed saved round count");
    assert(storedAfterDuplicate.effort_rounds.reduce((sum, item) => sum + (item.round_actual_income_cents ?? item.income_cents), 0) === storedAfterDuplicate.effort_rounds.slice(0, round).reduce((sum, item) => sum + (item.round_actual_income_cents ?? item.income_cents), 0), "duplicate effort round changed accumulated income");
    assert(Number.isInteger(submitted.round.income_cents), "effort income must be integer cents");
    assert(submitted.round.base_income_cents === study2.effortTask.numbersPerRound * study2.effortTask.incomePerCorrectCents, "base income cents mismatch");
    assert(submitted.round.speed_bonus_cents >= 0 && submitted.round.speed_bonus_cents <= study2.effortTask.speedBonusMaxCents, "speed bonus out of range");
    assert(submitted.round.speed_bonus_cents % study2.effortTask.reportStepCents === 0, "speed bonus must follow report step");
    assert(submitted.round.round_actual_income_cents === submitted.round.base_income_cents + submitted.round.speed_bonus_cents, "round actual income mismatch");
    assert(submitted.round.income_cents === submitted.round.round_actual_income_cents, "legacy income alias mismatch");
    current = submitted.current;
    if (!current.completed) current = (await request(server, "POST", `/api/session/${id}/effort/start`)).current;
  }
  const incomeViewed = await request(server, "POST", `/api/session/${id}/income-viewed`);
  assertPublicSession(incomeViewed.session);
  const records = await request(server, "GET", `/api/session/${id}/peer-records`);
  await request(server, "POST", `/api/session/${id}/peer-records-viewed`, {
    displayed_at: "2000-01-01T00:00:00.000Z",
    duration_ms: 999999
  });
  const stored = await store.readSession(id);
  assert(stored.income_report_selection_started_at, "income report timing must start after peer records viewed");
  assert(stored.peer_records_view.duration_ms === null, "browser-provided peer duration must not be saved");
  assertStudy2PeerStimuliPersisted(stored, condition, records.records);
  return { id, records, actualIncomeCents: stored.actual_income_cents };
}

function assertStudy2PeerStimuliPersisted(session, condition, publicRecords) {
  const reread = JSON.parse(fs.readFileSync(path.join(store.DATA_DIR, `${session.id}.json`), "utf8"));
  assert(session.stimulus_version === "randomized-stimuli-v1", "Study 2 stimulus_version missing");
  assert(/^[0-9a-f]{32}$/.test(session.stimulus_seed), "Study 2 stimulus_seed missing");
  assert(/^P[1-6]$/.test(session.study2_peer_profile_id), "Study 2 peer profile id invalid");
  assert(session.study2_peer_display_order.length === 4, "Study 2 peer display order length mismatch");
  assert(session.study2_peer_profile_base_cents >= 500 && session.study2_peer_profile_base_cents <= 2710, "Study 2 profile base out of range");
  assert(JSON.stringify(session.study2_peer_profile_id) === JSON.stringify(reread.study2_peer_profile_id), "Study 2 profile id changed after reread");
  assert(JSON.stringify(session.study2_peer_display_order) === JSON.stringify(reread.study2_peer_display_order), "Study 2 peer order changed after reread");
  assert(JSON.stringify(session.study2_peer_income_records) === JSON.stringify(reread.study2_peer_income_records), "Study 2 peer records changed after reread");
  assert(session.study2_peer_income_records.length === 4, "Study 2 peer income records length mismatch");
  for (const record of session.study2_peer_income_records) {
    assert(record.actual_income_cents >= 250 && record.actual_income_cents <= 2960, "Study 2 peer actual income out of range");
    if (condition === "honest") assert(record.reported_income_cents === record.actual_income_cents, "Study 2 honest peer report mismatch");
    if (condition === "dishonest") {
      assert(record.reported_income_cents < record.actual_income_cents, "Study 2 dishonest report must be below actual");
      assert(record.reported_income_cents === Math.round(record.actual_income_cents * 0.5), "Study 2 dishonest report formula mismatch");
    }
  }
  if (condition === "hidden") {
    assert(session.study2_peer_income_records.every((record) => record.actual_income_cents !== null && record.reported_income_cents !== null), "Study 2 hidden raw records missing values");
    assert(publicRecords.every((record) => record.actual_income_cents === null && record.reported_income_cents === null), "Study 2 hidden public records leaked values");
  }
}

function testStudy2DeterministicSeeds() {
  const planA = app._internal.createStudy2StimulusPlan("deterministic-seed-a");
  const planAAgain = app._internal.createStudy2StimulusPlan("deterministic-seed-a");
  const planB = app._internal.createStudy2StimulusPlan("deterministic-seed-b");
  assert(JSON.stringify(planA) === JSON.stringify(planAAgain), "Study 2 same seed should reproduce plan");
  assert(
    planA.peerProfileId !== planB.peerProfileId ||
      JSON.stringify(planA.peerDisplayOrder) !== JSON.stringify(planB.peerDisplayOrder),
    "Study 2 different deterministic seeds should produce different profile/order"
  );
  const sessionA = {
    id: "deterministic-a",
    stimulus_seed: "deterministic-seed-a",
    condition: "dishonest",
    actual_income_cents: 2430,
    study2_peer_profile_id: planA.peerProfileId,
    study2_peer_display_order: planA.peerDisplayOrder
  };
  const recordsA = app._internal.buildStudy2PeerIncomeRecords(sessionA);
  const recordsAAgain = app._internal.buildStudy2PeerIncomeRecords(sessionA);
  assert(JSON.stringify(recordsA) === JSON.stringify(recordsAAgain), "Study 2 same seed should reproduce peer records");
}

function testDataDirLoadedBeforeStore() {
  const root = path.join(os.tmpdir(), `group-deception-study2-env-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "custom-sessions");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, ".env"), `DATA_DIR=${dataDir}\nDEBUG_LINKS=false\nSTUDY_CONTACT_EMAIL=123456@163.com\n`, "utf8");
  const defaultDir = path.join(__dirname, "..", "data", "sessions");
  const code = `
    delete process.env.DATA_DIR;
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "false";
    process.env.ASSIGNMENT_MODE = "block";
    process.env.PARTICIPANT_ID_POLICY = "open";
    process.env.REQUIRE_PARTICIPANT_ID = "false";
    delete process.env.PARTICIPANT_ID_ALLOWLIST_FILE;
    delete process.env.ENTRY_CODE_HIDDEN;
    delete process.env.ENTRY_CODE_HONEST;
    delete process.env.ENTRY_CODE_DISHONEST;
    delete process.env.TEST_CONDITION;
    const fs = require("fs");
    const path = require("path");
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function req(server) {
      const payload = JSON.stringify({ participant_id: "env-s2-" + Date.now() });
      return new Promise((resolve, reject) => {
        const r = http.request({ method: "POST", hostname: "127.0.0.1", port: server.address().port, path: "/api/session", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
          let raw = "";
          res.on("data", (chunk) => raw += chunk);
          res.on("end", () => res.statusCode === 200 ? resolve(JSON.parse(raw)) : reject(new Error(raw)));
        });
        r.on("error", reject);
        r.write(payload);
        r.end();
      });
    }
    (async () => {
      const server = app.listen(0);
      try {
        assert(store.DATA_DIR === ${JSON.stringify(dataDir)}, "store DATA_DIR did not use .env before module load");
        const created = await req(server);
        const expected = path.join(${JSON.stringify(dataDir)}, created.session.id + ".json");
        const defaultFile = path.join(${JSON.stringify(defaultDir)}, created.session.id + ".json");
        assert(fs.existsSync(expected), "session was not written to .env DATA_DIR");
        assert(!fs.existsSync(defaultFile), "session was written to package default data/sessions");
        console.log("Study 2 DATA_DIR load order check passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { cwd: root, encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: undefined }) });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "Study 2 DATA_DIR child failed");
}

async function completeAfterIncomeReport(server, config, id, actualIncomeCents) {
  for (const badValue of ["", "-1", "abc", "1.234"]) {
    const invalid = await request(server, "POST", `/api/session/${id}/income-report`, { reported_income: badValue }, 400);
    assert(invalid.error === "请输入不小于 0 的金额，最多保留两位小数。", "invalid income report error mismatch");
  }
  const report = await request(server, "POST", `/api/session/${id}/income-report`, { reported_income: "100.23" });
  assert(report.income_report.reported_income_cents === 10023, "income report did not save high reported cents");
  assert(report.income_report.deduction_cents === Math.round(10023 * 0.5), "deduction formula mismatch");
  assert(report.income_report.retained_reward_cents === actualIncomeCents - report.income_report.deduction_cents, "retained reward formula mismatch");
  assert(report.income_report.retained_reward_cents < 0, "high report should allow negative retained reward");
  assert(report.income_report.selection_started_at, "income report selection start missing");
  await request(server, "POST", `/api/session/${id}/income-report`, { reported_income: "100.23" }, 409);
  await request(server, "POST", `/api/session/${id}/post-survey`, { responses: makeResponses(config.postSurveyItems) });
  await request(server, "POST", `/api/session/${id}/experience`, { responses: makeResponses(config.experienceItems) });
  const invalidAge = makeResponses(config.demographicsItems);
  invalidAge.age = 8;
  const invalid = await request(server, "POST", `/api/session/${id}/demographics`, { responses: invalidAge }, 400);
  assert(invalid.message === "请检查以下信息：", "invalid age summary mismatch");
  assert(invalid.field_errors?.age === "年龄需填写为 18–100 岁之间的整数。", "invalid age field error mismatch");
  assert(!JSON.stringify(invalid).includes("Invalid responses"), "invalid age response must not include Invalid responses");
  const demographics = makeResponses(config.demographicsItems);
  demographics.age = 30;
  await request(server, "POST", `/api/session/${id}/demographics`, { responses: demographics });
  const rejected = await request(server, "POST", `/api/session/${id}/complete`, {}, 409);
  assert(rejected.error === "请先阅读并确认事后说明。", "complete must reject without debrief_viewed_at");
  const firstDebrief = await request(server, "POST", `/api/session/${id}/debrief-viewed`);
  const storedAfterFirstDebrief = await store.readSession(id);
  const secondDebrief = await request(server, "POST", `/api/session/${id}/debrief-viewed`);
  const storedAfterSecondDebrief = await store.readSession(id);
  assert(storedAfterFirstDebrief.debrief_viewed_at === storedAfterSecondDebrief.debrief_viewed_at, "debrief_viewed_at changed on repeated call");
  assert(firstDebrief.session.id === secondDebrief.session.id, "repeated debrief call returned a different session");
  assert(storedAfterSecondDebrief.event_log.filter((event) => event.type === "debrief_viewed").length === 1, "debrief_viewed event should be recorded once");
  const completed = await request(server, "POST", `/api/session/${id}/complete`);
  assert(completed.session.status === "completed", "complete after debrief failed");
  assert(completed.session.completion?.completion_code === "SMOKE-STUDY2-COMPLETE", "completion code missing");
  const csv = await request(server, "GET", "/api/admin/export/participants.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  assert(csv.includes("debrief_viewed_at"), "participants CSV missing debrief_viewed_at");
  assert(csv.split("\n")[0].includes("peer_profile_id"), "participants CSV missing peer_profile_id");
  assert(csv.split("\n")[0].includes("stimulus_version"), "participants CSV missing stimulus_version");
  const effortCsv = await request(server, "GET", "/api/admin/export/study2_effort_rounds.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  for (const column of ["participant_id", "round_index", "correct_count", "base_income", "speed_bonus", "round_actual_income"]) {
    assert(effortCsv.split("\n")[0].includes(column), `effort CSV missing ${column}`);
  }
  const incomeCsv = await request(server, "GET", "/api/admin/export/study2_income_reports.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  for (const column of ["stimulus_version", "stimulus_seed", "peer_profile_id", "peer_display_order_json", "peer_actual_income_records_json", "peer_reported_income_records_json"]) {
    assert(incomeCsv.split("\n")[0].includes(column), `income report CSV missing ${column}`);
  }
  return completed.session;
}

async function testAcceptedIncomeAmounts(server, config) {
  for (const amount of ["0.00", "0.01", "25.43"]) {
    const probe = await runEffortToPeerRecords(server, config, "hidden", `income-amount-s2-${amount.replace(".", "-")}-${Date.now()}`);
    const report = await request(server, "POST", `/api/session/${probe.id}/income-report`, { reported_income: amount });
    assert(report.income_report.reported_income === Number(amount), `income amount ${amount} was not accepted`);
  }
  console.log("Study 2 income report accepted free decimal amounts: 0.00, 0.01, 25.43, 100.23");
}

function testBlockAndConcurrency() {
  const root = path.join(os.tmpdir(), `group-deception-study2-block-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "false";
    process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    const fs = require("fs");
    const path = require("path");
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function req(server, participant_id) {
      const payload = JSON.stringify({ participant_id });
      return new Promise((resolve, reject) => {
        const r = http.request({ method: "POST", hostname: "127.0.0.1", port: server.address().port, path: "/api/session", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
          let raw = "";
          res.on("data", (chunk) => raw += chunk);
          res.on("end", () => res.statusCode === 200 ? resolve(JSON.parse(raw)) : reject(new Error(raw)));
        });
        r.on("error", reject);
        r.write(payload);
        r.end();
      });
    }
    function assert(condition, message) { if (!condition) throw new Error(message); }
    (async () => {
      const server = app.listen(0);
      try {
        for (let i = 0; i < 12; i += 1) await req(server, "block-s2-" + i);
        const state = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const allocations = state.allocations.filter((item) => item.study === "study2" && item.participant_id.startsWith("block-s2-"));
        const counts = allocations.reduce((acc, item) => { acc[item.condition] = (acc[item.condition] || 0) + 1; return acc; }, {});
        assert(counts.hidden === 4 && counts.honest === 4 && counts.dishonest === 4, "block counts mismatch " + JSON.stringify(counts));
        const [a, b] = await Promise.all([req(server, "same-s2"), req(server, "same-s2")]);
        assert(a.session.id === b.session.id, "same participant got different session ids");
        const sessions = (await store.listSessions()).filter((session) => session.participant_id === "same-s2");
        const state2 = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const sameAllocations = state2.allocations.filter((item) => item.participant_id === "same-s2");
        assert(sessions.length === 1, "same participant duplicate sessions");
        assert(sameAllocations.length === 1, "same participant duplicate allocations");
        console.log("Study 2 concurrent same participant: session_id=" + a.session.id + " sessions=" + sessions.length + " allocations=" + sameAllocations.length);
        console.log("Study 2 block randomization counts: hidden=" + counts.hidden + " honest=" + counts.honest + " dishonest=" + counts.dishonest);
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: dataDir, DEBUG_LINKS: "false" }) });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "block/concurrency child failed");
}

function testControlledLinkAssignment() {
  const root = path.join(os.tmpdir(), `group-deception-study2-controlled-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "true";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s2-entry-a-" + Date.now();
    process.env.ENTRY_CODE_HONEST = "s2-entry-b-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST = "s2-entry-c-" + Date.now();
    process.env.TEST_CONDITION = "dishonest";
    process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    const fs = require("fs");
    const path = require("path");
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    const entries = {
      hidden: process.env.ENTRY_CODE_HIDDEN,
      honest: process.env.ENTRY_CODE_HONEST,
      dishonest: process.env.ENTRY_CODE_DISHONEST
    };
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function req(server, body, expectedStatus = 200, requestPath = "/api/session") {
      const payload = body === undefined ? null : JSON.stringify(body);
      return new Promise((resolve, reject) => {
        const r = http.request({ method: requestPath === "/api/config" ? "GET" : "POST", hostname: "127.0.0.1", port: server.address().port, path: requestPath, headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {} }, (res) => {
          let raw = "";
          res.on("data", (chunk) => raw += chunk);
          res.on("end", () => {
            const parsed = raw ? JSON.parse(raw) : {};
            if (res.statusCode !== expectedStatus) reject(new Error("expected " + expectedStatus + ", got " + res.statusCode + ": " + raw));
            else resolve(parsed);
          });
        });
        r.on("error", reject);
        if (payload) r.write(payload);
        r.end();
      });
    }
    function assertPublicClean(value) {
      const forbiddenKeys = new Set(["condition", "assignment_source", "entry_link_id"]);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        for (const [key, child] of Object.entries(node)) {
          assert(!forbiddenKeys.has(key), "public response leaked key " + key);
          visit(child);
        }
      };
      visit(value);
      const text = JSON.stringify(value);
      for (const forbidden of [process.env.ENTRY_CODE_HIDDEN, process.env.ENTRY_CODE_HONEST, process.env.ENTRY_CODE_DISHONEST]) {
        assert(!text.includes(forbidden), "public response leaked entry secret");
      }
    }
    (async () => {
      const server = app.listen(0);
      try {
        assertPublicClean(await req(server, undefined, 200, "/api/config"));
        await req(server, { participant_id: "missing-entry-s2" }, 400);
        await req(server, { participant_id: "bad-entry-s2", entry: "wrong-entry" }, 400);
        const before = await store.listSessions();
        assert(before.length === 0, "missing/invalid entry created sessions");
        for (const condition of ["hidden","honest","dishonest"]) {
          const created = await req(server, { participant_id: "controlled-s2-" + condition, entry: entries[condition] });
          assertPublicClean(created.session);
          const raw = await store.readSession(created.session.id);
          assert(raw.condition === condition, "controlled condition mismatch");
          assert(raw.assignment_source === "controlled_link", "assignment_source mismatch");
          assert(["A","B","C"].includes(raw.entry_link_id), "entry_link_id missing");
          assert(raw.randomization_block === null && raw.randomization_position === null, "controlled link must not have block position");
          assert(JSON.stringify(raw).includes(entries[condition]) === false, "raw entry code leaked to session");
        }
        const same1 = await req(server, { participant_id: "same-controlled-s2", entry: entries.hidden });
        const same2 = await req(server, { participant_id: "same-controlled-s2", entry: entries.hidden });
        assert(same1.session.id === same2.session.id, "same entry did not resume same session");
        await req(server, { participant_id: "same-controlled-s2", entry: entries.honest }, 409);
        const sessions = await store.listSessions();
        assert(sessions.filter((session) => session.participant_id === "same-controlled-s2").length === 1, "different entry created duplicate session");
        const statePath = path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json");
        assert(!fs.existsSync(statePath), "controlled link created randomization state");
        console.log("Study 2 controlled_link assignment checks passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8",
    env: makeBaseTestEnv({
      DATA_DIR: dataDir,
      ASSIGNMENT_MODE: "controlled_link",
      PARTICIPANT_ID_POLICY: "open",
      REQUIRE_PARTICIPANT_ID: "false",
      ENTRY_CODE_HIDDEN: "s2-entry-a-test",
      ENTRY_CODE_HONEST: "s2-entry-b-test",
      ENTRY_CODE_DISHONEST: "s2-entry-c-test"
    })
  });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "controlled_link child failed");
}

function testParticipantAllowlistPolicy() {
  const invalidMode = spawnSync(process.execPath, ["-e", `
    process.env.NODE_ENV = "development";
    process.env.ASSIGNMENT_MODE = "block";
    process.env.PARTICIPANT_ID_POLICY = "allowlist";
    process.env.PARTICIPANT_ID_ALLOWLIST_FILE = "missing.json";
    require(${JSON.stringify(path.join(__dirname, "index.js"))});
  `], {
    encoding: "utf8",
    env: makeBaseTestEnv({
      DATA_DIR: path.join(os.tmpdir(), `study2-invalid-allowlist-${process.pid}-${Date.now()}`),
      ASSIGNMENT_MODE: "block",
      PARTICIPANT_ID_POLICY: "allowlist",
      PARTICIPANT_ID_ALLOWLIST_FILE: "missing.json"
    })
  });
  assert(invalidMode.status !== 0, "allowlist with block assignment should fail startup");

  const missingFile = spawnSync(process.execPath, ["-e", `
    process.env.NODE_ENV = "development";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s2-allow-a";
    process.env.ENTRY_CODE_HONEST = "s2-allow-b";
    process.env.ENTRY_CODE_DISHONEST = "s2-allow-c";
    process.env.PARTICIPANT_ID_POLICY = "allowlist";
    process.env.PARTICIPANT_ID_ALLOWLIST_FILE = "missing.json";
    require(${JSON.stringify(path.join(__dirname, "index.js"))});
  `], {
    encoding: "utf8",
    env: makeBaseTestEnv({
      DATA_DIR: path.join(os.tmpdir(), `study2-missing-allowlist-${process.pid}-${Date.now()}`),
      ASSIGNMENT_MODE: "controlled_link",
      PARTICIPANT_ID_POLICY: "allowlist",
      ENTRY_CODE_HIDDEN: "s2-allow-a",
      ENTRY_CODE_HONEST: "s2-allow-b",
      ENTRY_CODE_DISHONEST: "s2-allow-c",
      PARTICIPANT_ID_ALLOWLIST_FILE: "missing.json"
    })
  });
  assert(missingFile.status !== 0, "allowlist with missing file should fail startup");

  const root = path.join(os.tmpdir(), `group-deception-study2-allowlist-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const allowlistPath = path.join(root, "allowlist.json");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(allowlistPath, JSON.stringify([
    { participant_id: "GD-S2-K7M4Q2", entry_link_id: "A" },
    { participant_id: "GD-S2-P8N6R1", entry_link_id: "B" }
  ]), "utf8");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "true";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s2-allow-a-" + Date.now();
    process.env.ENTRY_CODE_HONEST = "s2-allow-b-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST = "s2-allow-c-" + Date.now();
    process.env.PARTICIPANT_ID_POLICY = "allowlist";
    process.env.PARTICIPANT_ID_ALLOWLIST_FILE = ${JSON.stringify(allowlistPath)};
    process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function req(server, body, expectedStatus = 200, requestPath = "/api/session") {
      const payload = body === undefined ? null : JSON.stringify(body);
      return new Promise((resolve, reject) => {
        const r = http.request({ method: requestPath === "/api/config" ? "GET" : "POST", hostname: "127.0.0.1", port: server.address().port, path: requestPath, headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {} }, (res) => {
          let raw = "";
          res.on("data", (chunk) => raw += chunk);
          res.on("end", () => {
            const parsed = raw ? JSON.parse(raw) : {};
            if (res.statusCode !== expectedStatus) reject(new Error("expected " + expectedStatus + ", got " + res.statusCode + ": " + raw));
            else resolve(parsed);
          });
        });
        r.on("error", reject);
        if (payload) r.write(payload);
        r.end();
      });
    }
    (async () => {
      const server = app.listen(0);
      try {
        const config = await req(server, undefined, 200, "/api/config");
        assert(!JSON.stringify(config).includes("allowlist"), "public config leaked allowlist internals");
        const missing = await req(server, { entry: process.env.ENTRY_CODE_HIDDEN }, 400);
        const badFormat = await req(server, { participant_id: "bad-format", entry: process.env.ENTRY_CODE_HIDDEN }, 400);
        const notListed = await req(server, { participant_id: "GD-S2-Z9Y8X7", entry: process.env.ENTRY_CODE_HIDDEN }, 403);
        const wrongEntry = await req(server, { participant_id: "GD-S2-K7M4Q2", entry: process.env.ENTRY_CODE_HONEST }, 403);
        assert(missing.error && badFormat.error && notListed.error && wrongEntry.error, "allowlist errors missing messages");
        const created = await req(server, { participant_id: "GD-S2-K7M4Q2", entry: process.env.ENTRY_CODE_HIDDEN });
        const resumed = await req(server, { participant_id: "GD-S2-K7M4Q2", entry: process.env.ENTRY_CODE_HIDDEN });
        assert(created.session.id === resumed.session.id, "allowlisted participant did not resume same session");
        const sessions = (await store.listSessions()).filter((session) => session.participant_id === "GD-S2-K7M4Q2");
        assert(sessions.length === 1, "allowlist created duplicate sessions");
        const raw = await store.readSession(created.session.id);
        assert(raw.assignment_source === "controlled_link" && raw.entry_link_id === "A", "allowlist entry assignment mismatch");
        console.log("Study 2 participant allowlist checks passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], {
    encoding: "utf8",
    env: makeBaseTestEnv({
      DATA_DIR: dataDir,
      ASSIGNMENT_MODE: "controlled_link",
      PARTICIPANT_ID_POLICY: "allowlist",
      ENTRY_CODE_HIDDEN: "s2-allow-a-test",
      ENTRY_CODE_HONEST: "s2-allow-b-test",
      ENTRY_CODE_DISHONEST: "s2-allow-c-test",
      PARTICIPANT_ID_ALLOWLIST_FILE: allowlistPath
    })
  });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "participant allowlist child failed");
}

function testBlockModeRejectsEntry() {
  const root = path.join(os.tmpdir(), `group-deception-study2-block-entry-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "false";
    process.env.ASSIGNMENT_MODE = "block";
    process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function req(server) {
      const payload = JSON.stringify({ participant_id: "block-entry-s2", entry: "unused-entry" });
      return new Promise((resolve, reject) => {
        const r = http.request({ method: "POST", hostname: "127.0.0.1", port: server.address().port, path: "/api/session", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
          let raw = "";
          res.on("data", (chunk) => raw += chunk);
          res.on("end", () => res.statusCode === 400 ? resolve(JSON.parse(raw)) : reject(new Error(raw)));
        });
        r.on("error", reject);
        r.write(payload);
        r.end();
      });
    }
    (async () => {
      const server = app.listen(0);
      try {
        await req(server);
        assert((await store.listSessions()).length === 0, "block mode entry created a session");
        console.log("Study 2 block mode rejects entry checks passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: dataDir, DEBUG_LINKS: "false" }) });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "block entry child failed");
}

function testFrontendSafeErrorMapping() {
  const root = path.join(__dirname, "..");
  const appJs = fs.readFileSync(path.join(root, "public/js/app.js"), "utf8");
  const classList = { add() {}, remove() {}, contains() { return false; } };
  const element = {
    classList,
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    insertAdjacentHTML() {},
    remove() {}
  };
  const context = {
    console,
    URLSearchParams,
    window: {
      __STUDY_SMOKE_TEST__: true,
      location: { search: "" }
    },
    document: {
      querySelector() { return element; },
      querySelectorAll() { return []; }
    }
  };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(appJs, context, { filename: "public/js/app.js" });
  const hooks = context.window.__study2TestHooks;
  assert(hooks, "Study 2 frontend test hooks missing");
  const generic = hooks.SAVE_ERROR_MESSAGE;
  assert(hooks.toParticipantMessage({ error: "Effort round requires effort_in_progress status" }) === generic, "Study 2 lifecycle error leaked to participant");
  assert(!hooks.toParticipantMessage({ error: "Effort round requires effort_in_progress status" }).includes("Effort round"), "Study 2 English lifecycle error leaked");
  const safe = "当前参与记录无法恢复。请联系研究团队获取新的参与链接后重新开始。";
  assert(hooks.toParticipantMessage({ error: safe }) === safe, "Study 2 safe missing-session message was not preserved");
}

function staticChecks() {
  const root = path.join(__dirname, "..");
  const incomeJs = fs.readFileSync(path.join(root, "public/js/study2-income.js"), "utf8");
  const appJs = fs.readFileSync(path.join(root, "public/js/app.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const styleCss = fs.readFileSync(path.join(root, "public/css/style.css"), "utf8");
  const surveyJs = fs.readFileSync(path.join(root, "public/js/survey.js"), "utf8");
  const peerConfig = fs.readFileSync(path.join(root, "config/peer-records.js"), "utf8");
  const studyConfig = fs.readFileSync(path.join(root, "config/study2-income.js"), "utf8");
  const measureConfig = fs.readFileSync(path.join(root, "config/measures.js"), "utf8");
  const allText = [incomeJs, appJs, indexHtml, styleCss, surveyJs, peerConfig, studyConfig, measureConfig].join("\n");
  for (const file of listFiles(root, ".js")) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: path.join(os.tmpdir(), `study2-check-${process.pid}`) }) });
    assert(check.status === 0, `node --check failed for ${file}: ${check.stderr}`);
  }
  assert(incomeJs.includes("function renderIncomeReport"), "renderIncomeReport must be defined");
  assert(incomeJs.includes("renderIncomeReport,"), "renderIncomeReport must be exported");
  assert(!incomeJs.includes("仅你与群聊 AI 可见。"), "old income report privacy copy must be removed");
  assert(incomeJs.includes("你的个人收入申报不会向其他成员展示。"), "new income report privacy copy missing");
  assert(incomeJs.includes("模拟扣除金额由申报收入计算；任务保留奖励 = 实际收入 − 模拟扣除金额。"), "income report final hint missing");
  assert(incomeJs.includes("基础收入") && incomeJs.includes("速度奖励") && incomeJs.includes("本轮实际收入"), "effort result income breakdown missing");
  assert(incomeJs.includes("努力任务已完成") && incomeJs.includes("你的实际收入由 4 轮任务的本轮实际收入累计得出。") && incomeJs.includes("查看同事此前的收入申报"), "actual income summary page missing");
  const actualSection = incomeJs.slice(incomeJs.indexOf("function renderActualIncome"), incomeJs.indexOf("function renderIncomeReport"));
  const reportSection = incomeJs.slice(incomeJs.indexOf("function renderIncomeReport"), incomeJs.indexOf("function renderIncomeConfirmation"));
  assert(!incomeJs.includes('type="range"'), "income report range slider must be removed");
  assert(!incomeJs.includes("range-input"), "income report must not use range-input class");
  const reportSectionInput = reportSection.slice(reportSection.indexOf("<input"), reportSection.indexOf("</div>", reportSection.indexOf("<input")));
  assert((reportSection.match(/type="number"/g) || []).length === 1, "income report must contain one number input");
  assert(reportSection.includes('inputmode="decimal"') && reportSection.includes('min="0"') && reportSection.includes('step="any"'), "income report number input attributes mismatch");
  assert(!reportSectionInput.includes("max="), "income report number input must not have max");
  assert(reportSection.includes('value="${reportedValue}"'), "income report number input must start blank when no selected value exists");
  assert(!incomeJs.includes("申报收入将按固定规则计算需支付部分") && !incomeJs.includes("较低的申报收入对应较高的个人保留奖励"), "old income report hint must be removed");
  assert(!actualSection.includes("submit-income-report"), "actual income page must not submit income report");
  assert(actualSection.includes('data-action="income-viewed"'), "actual income page must continue to peer records");
  assert(reportSection.includes("submit-income-report"), "income report page must contain submit-income-report");
  for (const label of ["实际收入", "当前申报收入", "模拟扣除金额", "任务保留奖励"]) assert(reportSection.includes(label), `income report page missing ${label}`);
  assert(appJs.includes("peer-records-viewed") && appJs.includes("renderIncomeReport"), "income report must be rendered after peer records viewed");
  assert(!appJs.includes("params.get(\"condition\")"), "frontend must not read URL condition");
  assert(appJs.includes('params.get("entry")') && appJs.includes("entry: state.entryCode"), "frontend must send entry without interpreting condition");
  assert(!appJs.includes("INCOME_REPORT_STEP_CENTS") && !appJs.includes("clampCents") && !appJs.includes("reported-income-number"), "frontend income report slider sync/clamp must be removed");
  assert(appJs.includes("reported_income: input.value.trim()"), "frontend must submit typed income string");
  assert(appJs.includes("INCOME_REPORT_ERROR") && appJs.includes("\\u8bf7\\u8f93\\u5165\\u4e0d\\u5c0f\\u4e8e 0"), "frontend income validation error missing");
  assert(!appJs.includes("response.json()"), "participant frontend must not call response.json() directly");
  assert(appJs.includes("parseJsonResponse") && appJs.includes("Non-JSON API response") && appJs.includes("bodyPreview: text.slice(0, 200)"), "frontend JSON response guard missing");
  assert(appJs.includes("toParticipantMessage") && appJs.includes("SAFE_SERVER_MESSAGES") && appJs.includes("__STUDY_SMOKE_TEST__"), "frontend safe error mapping missing");
  assert(!appJs.includes("new Error(data.message || data.error"), "frontend must not surface arbitrary backend messages");
  assert((appJs.match(/debrief-viewed/g) || []).length === 1, "frontend should call debrief-viewed only once");
  assert(appJs.includes("复制参与编号") && appJs.includes("已复制"), "copy participant id UI missing");
  assert(appJs.includes("参与信息") && appJs.includes("研究联系邮箱") && appJs.includes("123456@163.com"), "participant info card missing");
  assert(appJs.includes("感谢你完成本次任务！") && appJs.includes("你的任务与问卷记录仅用于研究。你可凭参与编号联系研究团队，了解更多安排、撤回本次参与或申请删除本次记录。"), "debrief final copy missing");
  assert(!appJs.includes("研究数据管理规范") && !appJs.includes("预先安排") && !appJs.includes("信息环境"), "debrief old research-detail copy must be removed");
  assert(appJs.includes("感谢你的参与。"), "completion thank-you copy missing");
  assert((appJs.match(/感谢你的参与。/g) || []).length === 1, "completion thank-you copy must appear exactly once");
  assert(appJs.includes("participant-id-copy-source") && appJs.includes("123456@163.com"), "completion participant id/contact fallback missing");
  assert(!indexHtml.includes("Group Deception v2") && !indexHtml.includes("GROUP DECEPTION V2"), "internal version label must be removed");
  assert(!indexHtml.includes("模拟收入申报任务") && indexHtml.includes("实验二：收入申报任务"), "Study 2 visible title must remove 模拟");
  assert(indexHtml.includes("<li>你的个人报告不会向其他成员展示。</li>"), "final consent bullet 1 missing");
  assert(indexHtml.includes("<li>完成全部流程后，你将获得基础参与报酬；此外，任务报酬将根据页面所示规则另行计算。最终被试费由基础参与报酬和任务报酬两部分构成。</li>"), "final consent bullet 2 missing");
  assert(indexHtml.includes("<li>你可以随时停止参与。</li>"), "final consent bullet 3 missing");
  assert(!indexHtml.includes("部分群体互动内容由系统生成") && !indexHtml.includes("其他成员也无法查看或更改你的个人报告内容") && !indexHtml.includes("任务结束后，我们将说明本研究的完整安排及数据处理方式"), "old consent copy must be removed");
  assert(appJs.includes("开始前，请回答几个关于日常 AI 使用经验的问题：") && appJs.includes("请根据你的真实情况选择"), "baseline title/subtitle copy missing");
  assert(!measureConfig.includes("频率是。") && !measureConfig.includes("具体任务。") && !measureConfig.includes("完成任务。") && !measureConfig.includes("代为执行。"), "baseline prompts should not end with full stop");
  assert(studyConfig.includes('title: "实验二：收入申报任务"') && studyConfig.includes('taskName: "收入申报任务"'), "Study 2 config visible title/taskName must remove 模拟");
  assert(!studyConfig.includes("实验二：模拟收入申报任务") && !studyConfig.includes('taskName: "模拟收入申报任务"'), "old Study 2 visible title returned");
  assert(studyConfig.includes("模拟同事群体") && studyConfig.includes("模拟扣除金额"), "required 模拟 terms missing");
  for (const text of ["你的群体", "完成任务与个人申报", "私密性与群聊 AI", "任务报酬如何计算"]) assert(studyConfig.includes(text), `Study 2 rule block missing ${text}`);
  assert(studyConfig.includes("实际收入是任务计算的基数，不等同于最终计入被试费的任务报酬。"), "Study 2 reward base explanation missing");
  assert(studyConfig.includes("模拟扣除金额 = 申报收入 × 0.5") && studyConfig.includes("任务保留奖励 = 实际收入 − 模拟扣除金额"), "Study 2 formulas missing");
  assert(studyConfig.includes("每答对 1 题可获得 ¥0.80 的基础收入") && studyConfig.includes("速度奖励最高为 ¥1.00") && studyConfig.includes("本轮实际收入 = 基础收入 + 速度奖励"), "effort income transparency copy missing");
  assert(studyConfig.includes("例如：若实际收入为 ¥20.00，申报收入为 ¥10.00") && studyConfig.includes("则模拟扣除金额为 ¥5.00，任务保留奖励为 ¥15.00。"), "Study 2 scaled example missing");
  assert(studyConfig.includes("在其他条件相同的情况下，申报收入越低，任务保留奖励越高。"), "Study 2 reward direction sentence missing");
  assert(studyConfig.includes("提示：先用申报收入 × 0.5 计算模拟扣除金额") && studyConfig.includes("模拟扣除金额为 ¥5.00；任务保留奖励为 ¥15.00。"), "Study 2 comprehension calculation item missing");
  assert(studyConfig.includes("incomePerCorrectCents: 80") && studyConfig.includes("speedBonusMaxCents: 100") && studyConfig.includes("reportStepCents: 10"), "scaled effort income params missing");
  assert(!allText.includes("¥0.08") && !allText.includes("¥0.10、申报最小单位 ¥0.01") && !allText.includes("若实际收入为 ¥2.00，申报收入为 ¥1.00"), "old unscaled Study 2 money text returned");
  assert(!allText.includes("申报收入将按固定规则计算需支付部分") && !allText.includes("较低的申报收入对应较高的个人保留奖励") && !allText.includes("仅你与群聊 AI 可见"), "removed Study 2 copy returned");
  assert(surveyJs.includes("showFieldErrors"), "survey field error renderer missing");
  assert(!surveyJs.includes(".replace("), "F2 frontend replace logic must be removed");
  assert(peerConfig.includes("PEER_INCOME_TEMPLATE"), "peer income template missing");
  assert(peerConfig.includes("actualIncomeCents: 1100") && peerConfig.includes("dishonestReportedCents: 550"), "peer income template must be scaled by 10");
  assert(studyConfig.includes("timeLimitSeconds") && studyConfig.includes("deductionRate"), "effort params missing");
  const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  assert(serverJs.includes("ASSIGNMENT_MODE") && serverJs.includes("controlled_link") && serverJs.includes("ENTRY_CODE_HIDDEN"), "controlled_link assignment source missing");
  assert(!/[?]\/(?:h2|p|span)>|寮€|鐠囬攱/.test(allText), "obvious mojibake or broken HTML marker found");
}

function listFiles(dir, extension, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "data") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, extension, result);
    else if (full.endsWith(extension)) result.push(full);
  }
  return result;
}

async function main() {
  testProductionConfigPollutionRegression();
  staticChecks();
  testDataDirLoadedBeforeStore();
  testStudy2DeterministicSeeds();
  testFrontendSafeErrorMapping();
  testBlockAndConcurrency();
  testControlledLinkAssignment();
  testParticipantAllowlistPolicy();
  testBlockModeRejectsEntry();
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    const health = await request(server, "GET", "/health");
    assert(health.study === "study2", "health study mismatch");
    assert(health.study_version === "study2-v1.1.0", "health study_version mismatch");
    assert(health.protocol_version === "peer-reporting-v2", "health protocol_version mismatch");
    assertPublicConfig(config);
    await testMissingSessionHandling(server);
    await testApiNeverReturnsHtml(server);
    await testAcceptedIncomeAmounts(server, config);
    const dishonest = await runEffortToPeerRecords(server, config, "dishonest", `flow-s2-dishonest-${Date.now()}`);
    dishonest.records.records.forEach((record) => assert(record.reported_income_cents < record.actual_income_cents, "dishonest peer must underreport"));
    const completed = await completeAfterIncomeReport(server, config, dishonest.id, dishonest.actualIncomeCents);
    const resumed = await request(server, "POST", "/api/session", { participant_id: completed.participant_id });
    assert(resumed.session.id === dishonest.id, "completed participant received a new session");
    assert(resumed.session.status === "completed", "completed participant did not resume completed status");
    const honest = await runEffortToPeerRecords(server, config, "honest", `flow-s2-honest-${Date.now()}`);
    honest.records.records.forEach((record) => assert(record.reported_income_cents === record.actual_income_cents, "honest peer must report actual income"));
    const hidden = await runEffortToPeerRecords(server, config, "hidden", `flow-s2-hidden-${Date.now()}`);
    hidden.records.records.forEach((record) => assert(record.visibility === "hidden" && record.reported_income_cents === null, "hidden peer values must be hidden"));
    console.log(`Study 2 smoke test completed for ${dishonest.id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

