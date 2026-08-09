const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const nodeAssert = require("node:assert");
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
    "ENTRY_CODE_DISHONEST_ESCALATING",
    "ENTRY_CODE_DISHONEST_FIXED_1",
    "ENTRY_CODE_DISHONEST_FIXED_2",
    "ENTRY_CODE_DISHONEST_FIXED_3",
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
    ENTRY_CODE_DISHONEST_ESCALATING: "",
    ENTRY_CODE_DISHONEST_FIXED_1: "",
    ENTRY_CODE_DISHONEST_FIXED_2: "",
    ENTRY_CODE_DISHONEST_FIXED_3: "",
    TEST_CONDITION: "",
    ADMIN_TOKEN: "dev-admin-token",
    STUDY_CONTACT_EMAIL: "123456@163.com",
    COMPLETION_CODE: "SMOKE-STUDY1-COMPLETE",
    COMPLETION_REDIRECT_URL: "https://example.com/study1-complete"
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
    "ENTRY_CODE_DISHONEST_ESCALATING",
    "ENTRY_CODE_DISHONEST_FIXED_1",
    "ENTRY_CODE_DISHONEST_FIXED_2",
    "ENTRY_CODE_DISHONEST_FIXED_3",
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

const smokeRoot = path.join(os.tmpdir(), `group-deception-study1-smoke-${process.pid}-${Date.now()}`);
fs.rmSync(smokeRoot, { recursive: true, force: true });
applyTestEnv(makeBaseTestEnv({ DATA_DIR: path.join(smokeRoot, "sessions") }));

const app = require("./index");
const store = require("./store");
const study1 = require("../config/study1-dice");
const h2Schedule = require("../config/h2-escalation");
const { CONDITIONS } = require("../config/common");
const fixedGradient = require("../config/fixed-gradient");
const exporters = require("./export");

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
    "ENTRY_CODE_DISHONEST_ESCALATING",
    "ENTRY_CODE_DISHONEST_FIXED_1",
    "ENTRY_CODE_DISHONEST_FIXED_2",
    "ENTRY_CODE_DISHONEST_FIXED_3",
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
    ENTRY_CODE_DISHONEST_ESCALATING: "fake-production-escalating-entry",
    ENTRY_CODE_DISHONEST_FIXED_1: "fake-production-fixed-1-entry",
    ENTRY_CODE_DISHONEST_FIXED_2: "fake-production-fixed-2-entry",
    ENTRY_CODE_DISHONEST_FIXED_3: "fake-production-fixed-3-entry",
    TEST_CONDITION: "dishonest",
    ADMIN_TOKEN: "fake-production-admin-token",
    DEBUG_LINKS: "false",
    STUDY_CONTACT_EMAIL: "production@example.invalid"
  });
  try {
    const env = makeBaseTestEnv({ DATA_DIR: path.join(os.tmpdir(), "study1-pollution-regression") });
    assert(env.ASSIGNMENT_MODE === "block", "base test env did not force block assignment");
    assert(env.PARTICIPANT_ID_POLICY === "open", "base test env did not force open participant policy");
    assert(env.REQUIRE_PARTICIPANT_ID === "false", "base test env did not disable required participant id");
    assert(env.ADMIN_TOKEN === "dev-admin-token", "base test env did not force dev admin token");
    assert(env.DEBUG_LINKS === "true", "base test env did not force debug links");
    assert(!env.PARTICIPANT_ID_ALLOWLIST_FILE, "base test env inherited allowlist file");
    assert(
      !env.ENTRY_CODE_HIDDEN &&
      !env.ENTRY_CODE_HONEST &&
      !env.ENTRY_CODE_DISHONEST &&
      !env.ENTRY_CODE_DISHONEST_ESCALATING &&
      !env.ENTRY_CODE_DISHONEST_FIXED_1 &&
      !env.ENTRY_CODE_DISHONEST_FIXED_2 &&
      !env.ENTRY_CODE_DISHONEST_FIXED_3,
      "base test env inherited entry codes"
    );
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
    else if (item.type === "select") {
      const option = item.options[0];
      responses[item.id] = typeof option === "object" ? option.value : option;
    }
    else if (item.type === "number") responses[item.id] = item.min ?? 18;
    else responses[item.id] = Math.min(item.scalePoints || 7, 4);
  }
  return responses;
}

function comprehensionAnswers() {
  return Object.fromEntries(study1.comprehensionQuestions.map((item) => [item.id, item.correctValue]));
}

function assertPublicSession(session) {
  for (const key of ["study", "condition", "condition_label", "condition_name", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names", "peer_behavior_assignments", "composition_version", "schedule_version", "peer_onset_rounds", "n_peers_misreporting", "misreporting_peer_names", "is_test_session", "debug_mode", "debug_links_enabled", "randomization_block", "randomization_position", "assignment_source", "entry_link_id"]) {
    assert(!Object.prototype.hasOwnProperty.call(session, key), `public session exposed ${key}`);
  }
  assert(session.study_version === "study1-v1.1.0", "public session study_version mismatch");
  assert(session.protocol_version === "peer-reporting-v2", "public session protocol_version mismatch");
}

function assertPublicConfig(config) {
  assert(config.contact_email === "123456@163.com", "config contact_email must be 123456@163.com");
  for (const key of ["version", "study_version", "protocol_version", "pilotNotice", "condition", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names", "peer_behavior_assignments", "composition_version", "schedule_version", "peer_onset_rounds", "randomization", "debug", "study1", "study2", "assignment_source", "entry_link_id"]) {
    assert(!Object.prototype.hasOwnProperty.call(config, key), `config exposed ${key}`);
  }
  assert(Array.isArray(config.baselineItems), "config baselineItems missing");
  assert(Array.isArray(config.postSurveyItems), "config postSurveyItems missing");
  assert(Array.isArray(config.demographicsItems), "config demographicsItems missing");
  assert(Array.isArray(config.ruleBlocks), "config ruleBlocks missing");
  assert(Array.isArray(config.comprehensionQuestions), "config comprehensionQuestions missing");
  assert(!JSON.stringify(config.comprehensionQuestions).includes("correctValue"), "config exposed comprehension correctValue");
  const f2 = config.postSurveyItems.find((item) => item.id === "f_design_influences");
  assert(f2.prompt.includes("请说明；若没有或不想补充，也可留空。"), "F2 final text mismatch");
  const truthfulCount = config.postSurveyItems.find((item) => item.id === "a_truthful_peer_count");
  assert(truthfulCount?.prompt === "回顾整个任务，你认为四名同事中有多少人曾经如实提交骰子点数？", "truthful peer count manipulation check mismatch");
  assert(JSON.stringify(truthfulCount.options.map((option) => option.value)) === JSON.stringify(["0", "1", "2", "3", "4", "not_visible", "not_sure"]), "truthful peer count stable values mismatch");
  const behaviorChange = config.postSurveyItems.find((item) => item.id === "a_peer_behavior_change");
  assert(behaviorChange?.prompt === "在任务进行过程中，其他同事的报告行为发生了怎样的变化？", "behavior change manipulation check mismatch");
  assert(behaviorChange.minLabel === "变得更加诚实" && behaviorChange.midLabel === "基本没有变化" && behaviorChange.maxLabel === "变得更加不诚实", "behavior change scale labels mismatch");
}

async function testMissingSessionHandling(server) {
  const missing = await request(server, "GET", "/api/session/legal-missing-study1", undefined, 410);
  const text = JSON.stringify(missing);
  assert(missing.error === "当前参与记录无法恢复。请联系研究团队获取新的参与链接后重新开始。", "missing session message mismatch");
  for (const leak of ["ENOENT", "/tmp", "sessions", "data\\\\", "no such file", ".json"]) {
    assert(!text.includes(leak), `missing session leaked ${leak}`);
  }
}

async function testApiNeverReturnsHtml(server) {
  for (const probe of [
    ["POST", "/api/not-a-real-endpoint", {}, 404],
    ["GET", "/api/not-a-real-endpoint", undefined, 404],
    ["GET", "/api/session/legal-missing-study1", undefined, 410],
    ["POST", "/not-a-real-mutation", {}, 404]
  ]) {
    const result = await requestRaw(server, probe[0], probe[1], probe[2]);
    assert(result.statusCode === probe[3], `${probe[0]} ${probe[1]} status mismatch`);
    assert(result.contentType.includes("application/json"), `${probe[0]} ${probe[1]} did not return JSON`);
    assert(!result.body.includes("<!doctype") && !result.body.includes("<html"), `${probe[0]} ${probe[1]} returned HTML`);
    const text = result.body.toLowerCase();
    for (const leak of ["condition", "assignment_source", "allowlist", "admin_token", "ngrok", "sessions", "data\\\\", "data/"]) {
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
  const started = await request(server, "POST", `/api/session/${id}/dice/start`);
  assertPublicSession(started.session);
  return { id, current: started.current };
}

function assertPeerRound(condition, current) {
  assert(current.true_die_value !== 6, "fixed common die sequence must not include 6");
  assert(current.peer_records.length === 4, "each round must have four peer records");
  for (const key of ["condition", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names", "peer_behavior_assignments", "composition_version", "schedule_version", "peer_onset_rounds", "n_peers_misreporting", "misreporting_peer_names"]) {
    assert(!Object.prototype.hasOwnProperty.call(current, key), `public dice payload exposed ${key}`);
  }
  let visibleMisreportCount = 0;
  for (const record of current.peer_records) {
    if (condition === "hidden") {
      assert(JSON.stringify(Object.keys(record).sort()) === JSON.stringify(["name", "text", "visibility"]), "hidden public peer record must only expose name/visibility/text");
      assert(record.visibility === "hidden", "hidden peer record visibility mismatch");
      assert(!Object.prototype.hasOwnProperty.call(record, "trueValue"), "hidden public peer record leaked trueValue");
      assert(!Object.prototype.hasOwnProperty.call(record, "reportedValue"), "hidden public peer record leaked reportedValue");
      assert(!Object.prototype.hasOwnProperty.call(record, "underlying_reported_value"), "hidden public peer record leaked underlying value");
      assert(!Object.prototype.hasOwnProperty.call(record, "round_index"), "hidden public peer record leaked round_index");
      assert(!Object.prototype.hasOwnProperty.call(record, "true_die_value"), "hidden public peer record leaked true_die_value");
    } else {
      assert(record.trueValue === current.true_die_value, "peer true value must equal participant common die");
      if (record.reportedValue > current.true_die_value) visibleMisreportCount += 1;
    }
    if (condition === "honest") assert(record.reportedValue === current.true_die_value, "honest peer report must equal true die");
    if (condition === "dishonest_escalating") {
      const peerId = h2Schedule.peerIdForName(record.name);
      const shouldMisreport = current.round_index >= h2Schedule.PEER_ONSET_ROUNDS[peerId];
      assert((record.reportedValue > current.true_die_value) === shouldMisreport, `escalating status mismatch for ${record.name} in round ${current.round_index}`);
      if (shouldMisreport) assert(record.reportedValue <= 6, "escalating peer report must not exceed 6");
    }
  }
  if (condition === "honest") assert(visibleMisreportCount === 0, "honest public misreport count mismatch");
  const fixedCount = fixedGradient.fixedDishonestCountForCondition(condition);
  if (fixedCount !== null) {
    assert(visibleMisreportCount === fixedCount, `${condition} public misreport count mismatch`);
    for (const record of current.peer_records) {
      if (record.reportedValue > current.true_die_value) {
        assert(record.reportedValue <= 6, `${condition} peer report must not exceed 6`);
      } else {
        assert(record.reportedValue === current.true_die_value, `${condition} honest peer report mismatch`);
      }
    }
  }
  if (condition === "dishonest_escalating") {
    assert(visibleMisreportCount === h2Schedule.EXPECTED_MISREPORTING_COUNTS[current.round_index - 1], "escalating public count mismatch");
  }
}

async function assertStudy1StimuliPersisted(id, condition) {
  const first = await store.readSession(id);
  const second = await store.readSession(id);
  assert(first.stimulus_version === "randomized-stimuli-v1", "Study 1 stimulus_version missing");
  assert(/^[0-9a-f]{32}$/.test(first.stimulus_seed), "Study 1 stimulus_seed missing");
  assert(JSON.stringify(first.study1_die_sequence) === JSON.stringify(second.study1_die_sequence), "Study 1 die sequence changed after reread");
  assert(JSON.stringify(first.study1_peer_display_order) === JSON.stringify(second.study1_peer_display_order), "Study 1 peer order changed after reread");
  assert(JSON.stringify(first.study1_peer_records_by_round) === JSON.stringify(second.study1_peer_records_by_round), "Study 1 peer records changed after reread");
  assert(first.study1_die_sequence.length === 10, "Study 1 die sequence length mismatch");
  for (const value of [1, 2, 3, 4, 5]) {
    assert(first.study1_die_sequence.filter((item) => item === value).length === 2, `Study 1 die value ${value} count mismatch`);
  }
  assert(!first.study1_die_sequence.includes(6), "Study 1 die sequence must not include 6");
  assert(first.study1_peer_display_order.length === 4, "Study 1 peer display order length mismatch");
  assert(first.study1_peer_records_by_round.length === 10, "Study 1 peer records by round length mismatch");
  assert(first.schedule_version === h2Schedule.SCHEDULE_VERSION, "Study 1 schedule_version missing");
  assert(JSON.stringify(first.peer_onset_rounds) === JSON.stringify(h2Schedule.PEER_ONSET_ROUNDS), "Study 1 peer onset rounds mismatch");
  assert(first.condition_analysis_label === (condition === "dishonest" ? "dishonest_static" : condition), "Study 1 condition analysis label mismatch");
  const expectedFixedCount = fixedGradient.fixedDishonestCountForCondition(condition);
  assert(first.condition_family === fixedGradient.conditionFamilyForCondition(condition), "Study 1 condition_family mismatch");
  assert(first.fixed_dishonest_count === expectedFixedCount, "Study 1 fixed dishonest count mismatch");
  assert(first.composition_version === fixedGradient.compositionVersionForCondition(condition), "Study 1 composition version mismatch");
  if (expectedFixedCount === null) {
    assert(first.fixed_dishonest_peer_names === null, "non-fixed condition should not persist fixed peer names");
    assert(first.peer_behavior_assignments === null, "non-fixed condition should not persist fixed peer assignments");
  } else {
    assert(first.fixed_dishonest_peer_names.length === expectedFixedCount, "fixed peer name count mismatch");
    assert(new Set(first.fixed_dishonest_peer_names).size === expectedFixedCount, "fixed peer names must be unique");
    const expectedAssignments = Object.fromEntries(first.study1_peer_display_order.map((name) => [
      name,
      first.fixed_dishonest_peer_names.includes(name) ? "dishonest" : "honest"
    ]));
    nodeAssert.deepStrictEqual(first.peer_behavior_assignments, expectedAssignments, "fixed peer behavior assignments mismatch");
  }
  for (const round of first.study1_peer_records_by_round) {
    assert(JSON.stringify(round.peer_display_order) === JSON.stringify(first.study1_peer_display_order), "Study 1 peer order not stable across rounds");
    assert(round.true_die_value === first.study1_die_sequence[round.round_index - 1], "Study 1 round true value mismatch");
    assert(round.schedule_version === h2Schedule.SCHEDULE_VERSION, "Study 1 round schedule_version mismatch");
    assert(round.condition_family === first.condition_family, "Study 1 round condition_family mismatch");
    assert(round.fixed_dishonest_count === first.fixed_dishonest_count, "Study 1 round fixed count mismatch");
    assert(JSON.stringify(round.fixed_dishonest_peer_names) === JSON.stringify(first.fixed_dishonest_peer_names), "Study 1 fixed peer names changed across rounds");
    assert(round.composition_version === first.composition_version, "Study 1 round composition version mismatch");
    const actualMisreportingNames = round.peer_records
      .filter((record) => record.underlying_reported_value > round.true_die_value)
      .map((record) => record.name);
    if (condition === "hidden") {
      assert(round.n_peers_misreporting === null, "Study 1 hidden n_peers_misreporting must be null");
      assert(round.misreporting_peer_names === null, "Study 1 hidden misreporting_peer_names must be null");
      round.peer_records.forEach((record) => {
        assert(record.trueValue === round.true_die_value, "Study 1 hidden raw trueValue mismatch");
        assert(record.reportedValue === null, "Study 1 hidden raw reportedValue should remain null");
        assert(record.underlying_reported_value === round.true_die_value, "Study 1 hidden raw underlying value mismatch");
        assert(record.round_index === round.round_index, "Study 1 hidden raw round_index mismatch");
      });
    }
    if (expectedFixedCount !== null) {
      assert(round.n_peers_misreporting === expectedFixedCount, `Study 1 ${condition} misreport count mismatch`);
      assert(actualMisreportingNames.length === expectedFixedCount, `Study 1 ${condition} actual misreport count mismatch`);
      assert(JSON.stringify(round.misreporting_peer_names) === JSON.stringify(actualMisreportingNames), `Study 1 ${condition} names mismatch`);
      assert(
        JSON.stringify([...actualMisreportingNames].sort()) === JSON.stringify([...first.fixed_dishonest_peer_names].sort()),
        `Study 1 ${condition} fixed peer identities changed`
      );
      round.peer_records.forEach((record) => {
        if (first.fixed_dishonest_peer_names.includes(record.name)) {
          assert(record.reportedValue > round.true_die_value, `Study 1 ${condition} report must exceed true value`);
          assert(record.reportedValue <= 6, `Study 1 ${condition} report must not exceed 6`);
        } else {
          assert(record.reportedValue === round.true_die_value, `Study 1 ${condition} honest peer report mismatch`);
        }
      });
    }
    if (condition === "dishonest_escalating") {
      const expectedCount = h2Schedule.EXPECTED_MISREPORTING_COUNTS[round.round_index - 1];
      assert(round.n_peers_misreporting === expectedCount, "Study 1 escalating misreport count mismatch");
      assert(JSON.stringify(round.misreporting_peer_names) === JSON.stringify(actualMisreportingNames), "Study 1 escalating names mismatch");
      for (const record of round.peer_records) {
        const onset = h2Schedule.PEER_ONSET_ROUNDS[h2Schedule.peerIdForName(record.name)];
        const shouldMisreport = round.round_index >= onset;
        assert((record.reportedValue > round.true_die_value) === shouldMisreport, `Study 1 escalating onset mismatch for ${record.name}`);
        if (shouldMisreport) {
          assert(record.reportedValue >= round.true_die_value + 1, "Study 1 escalating report must be at least true + 1");
          assert(record.reportedValue <= 6, "Study 1 escalating report must not exceed 6");
        } else {
          assert(record.reportedValue === round.true_die_value, "Study 1 pre-onset peer must report honestly");
        }
      }
    }
  }
  if (condition === "dishonest_fixed_1") {
    const code = `
      process.env.DATA_DIR = ${JSON.stringify(store.DATA_DIR)};
      const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
      store.readSession(${JSON.stringify(id)}).then((session) => {
        const expectedNames = ${JSON.stringify(first.fixed_dishonest_peer_names)};
        if (JSON.stringify(session.fixed_dishonest_peer_names) !== JSON.stringify(expectedNames)) throw new Error("fixed peer names changed after restart");
        if (JSON.stringify(session.study1_peer_records_by_round) !== ${JSON.stringify(JSON.stringify(first.study1_peer_records_by_round))}) throw new Error("peer records changed after restart");
        console.log("Study 1 restart persistence check passed");
      }).catch((error) => { console.error(error); process.exit(1); });
    `;
    const restarted = spawnSync(process.execPath, ["-e", code], {
      encoding: "utf8",
      env: makeBaseTestEnv({ DATA_DIR: store.DATA_DIR })
    });
    if (restarted.stdout) process.stdout.write(restarted.stdout);
    assert(restarted.status === 0, restarted.stderr || "Study 1 restart persistence child failed");
  }
}

function testStudy1DeterministicSeeds() {
  const a = app._internal.createStudy1Stimuli("dishonest", "deterministic-seed-a");
  const aAgain = app._internal.createStudy1Stimuli("dishonest", "deterministic-seed-a");
  const b = app._internal.createStudy1Stimuli("dishonest", "deterministic-seed-b");
  assert(JSON.stringify(a) === JSON.stringify(aAgain), "Study 1 same seed should reproduce stimuli");
  assert(
    JSON.stringify(a.diceSequence) !== JSON.stringify(b.diceSequence) ||
      JSON.stringify(a.peerDisplayOrder) !== JSON.stringify(b.peerDisplayOrder) ||
      JSON.stringify(a.peerRecordsByRound.map((round) => round.peer_records.map((record) => record.reportedValue))) !== JSON.stringify(b.peerRecordsByRound.map((round) => round.peer_records.map((record) => record.reportedValue))),
    "Study 1 different deterministic seeds should produce different legal stimuli"
  );
  const escalating = app._internal.createStudy1Stimuli("dishonest_escalating", "deterministic-escalating-seed");
  assert(JSON.stringify(escalating.peerRecordsByRound.map((round) => round.n_peers_misreporting)) === JSON.stringify(h2Schedule.EXPECTED_MISREPORTING_COUNTS), "Study 1 escalating deterministic schedule mismatch");
  for (const condition of ["dishonest_fixed_1", "dishonest_fixed_2", "dishonest_fixed_3"]) {
    const signatures = new Set();
    for (let i = 0; i < 30; i += 1) {
      const stimuli = app._internal.createStudy1Stimuli(condition, `fixed-composition-${condition}-${i}`);
      signatures.add([...stimuli.fixedDishonestPeerNames].sort().join("|"));
    }
    assert(signatures.size > 1, `${condition} should produce different peer compositions across sessions`);
  }
}

function testDataDirLoadedBeforeStore() {
  const root = path.join(os.tmpdir(), `group-deception-study1-env-${process.pid}-${Date.now()}`);
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
    delete process.env.ENTRY_CODE_DISHONEST_ESCALATING;
    delete process.env.TEST_CONDITION;
    const fs = require("fs");
    const path = require("path");
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function assert(condition, message) { if (!condition) throw new Error(message); }
    function req(server) {
      const payload = JSON.stringify({ participant_id: "env-s1-" + Date.now() });
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
        console.log("Study 1 DATA_DIR load order check passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { cwd: root, encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: undefined }) });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "Study 1 DATA_DIR child failed");
}

async function runDiceTask(server, id, current, condition) {
  let cursor = current;
  for (let round = 1; round <= 10; round += 1) {
    assert(cursor.round_index === round, `expected round ${round}`);
    assertPeerRound(condition, cursor);
    assert(cursor.selection_started_at === null, "selection start must be null before peer records complete");
    const presented = await request(server, "POST", `/api/session/${id}/dice/presented`);
    const repeated = await request(server, "POST", `/api/session/${id}/dice/presented`);
    assert(presented.current.selection_started_at === repeated.current.selection_started_at, "refresh must not reset selection_started_at");
    const submitted = await request(server, "POST", `/api/session/${id}/dice/round`, {
      round_index: round,
      reported_value: Math.min(6, cursor.true_die_value + 1),
      selection_started_at: "2000-01-01T00:00:00.000Z",
      decision_duration_ms: 0
    });
    assert(submitted.round.selection_started_at === presented.current.selection_started_at, "server must use stored selection_started_at");
    assert(submitted.round.decision_duration_ms >= 0, "server must compute decision duration");
    for (const key of ["condition", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names", "peer_behavior_assignments", "composition_version", "schedule_version", "peer_onset_rounds", "n_peers_misreporting", "misreporting_peer_names"]) {
      assert(!Object.prototype.hasOwnProperty.call(submitted.round, key), `public submitted round exposed ${key}`);
    }
    if (round === 1) {
      const repeatedSubmit = await request(server, "POST", `/api/session/${id}/dice/round`, {
        round_index: round,
        reported_value: Math.min(6, cursor.true_die_value + 1)
      });
      assert(repeatedSubmit.duplicate === true, "duplicate dice submission must be idempotent");
      const storedAfterDuplicate = await store.readSession(id);
      assert(storedAfterDuplicate.dice_rounds.length === 1, "duplicate dice submission created another round");
      assert(JSON.stringify(storedAfterDuplicate.dice_rounds[0].peer_records) === JSON.stringify(storedAfterDuplicate.study1_peer_records_by_round[0].peer_records), "duplicate dice submission changed peer records");
    }
    cursor = submitted.current;
  }
  assert(cursor.completed === true, "dice task should complete after 10 rounds");
  const stored = await store.readSession(id);
  assert(stored.dice_rounds.length === 10, "stored dice round count mismatch");
  for (const round of stored.dice_rounds) {
    const stimulusRound = stored.study1_peer_records_by_round[round.round_index - 1];
    assert(round.n_peers_misreporting === stimulusRound.n_peers_misreporting, "stored round misreport count differs from stimulus");
    assert(JSON.stringify(round.misreporting_peer_names) === JSON.stringify(stimulusRound.misreporting_peer_names), "stored round misreport names differ from stimulus");
    assert(round.condition_family === stimulusRound.condition_family, "stored round condition family differs from stimulus");
    assert(round.fixed_dishonest_count === stimulusRound.fixed_dishonest_count, "stored round fixed count differs from stimulus");
    assert(JSON.stringify(round.fixed_dishonest_peer_names) === JSON.stringify(stimulusRound.fixed_dishonest_peer_names), "stored round fixed peer names differ from stimulus");
    assert(round.composition_version === stimulusRound.composition_version, "stored round composition version differs from stimulus");
    assert(round.schedule_version === h2Schedule.SCHEDULE_VERSION, "stored round schedule version mismatch");
  }
}

async function completeAfterTask(server, config, id) {
  await request(server, "POST", `/api/session/${id}/post-survey`, { responses: makeResponses(config.postSurveyItems) });
  const storedAfterPostSurvey = await store.readSession(id);
  assert(storedAfterPostSurvey.post_survey.a_truthful_peer_count === "0", "truthful peer count stable code was not saved");
  assert(storedAfterPostSurvey.post_survey.a_peer_behavior_change === 4, "behavior change manipulation check was not saved");
  const invalidAge = makeResponses(config.demographicsItems);
  invalidAge.age = 8;
  const invalid = await request(server, "POST", `/api/session/${id}/demographics`, { responses: invalidAge }, 400);
  assert(invalid.message === "请检查以下信息：", "invalid age summary mismatch");
  assert(invalid.field_errors?.age === "年龄需填写为 18–100 岁之间的整数。", "invalid age field error mismatch");
  assert(!JSON.stringify(invalid).includes("Invalid responses"), "invalid age response must not include Invalid responses");
  for (const age of [18, 100]) {
    const probe = await createReadySession(server, config, "hidden", `age-valid-s1-${age}-${Date.now()}`);
    await runDiceTask(server, probe.id, probe.current, "hidden");
    await request(server, "POST", `/api/session/${probe.id}/post-survey`, { responses: makeResponses(config.postSurveyItems) });
    const demo = makeResponses(config.demographicsItems);
    demo.age = age;
    await request(server, "POST", `/api/session/${probe.id}/demographics`, { responses: demo });
  }
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
  assert(completed.session.completion?.completion_code === "SMOKE-STUDY1-COMPLETE", "completion code missing");
  const csv = await request(server, "GET", "/api/admin/export/participants.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  assert(csv.includes("debrief_viewed_at"), "participants CSV missing debrief_viewed_at");
  for (const column of ["condition", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "composition_version"]) {
    assert(csv.split("\n")[0].includes(column), `participants CSV missing ${column}`);
  }
  const diceCsv = await request(server, "GET", "/api/admin/export/study1_dice_rounds.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  for (const column of ["condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names", "composition_version", "n_peers_misreporting", "misreporting_peer_names", "schedule_version", "stimulus_version", "stimulus_seed", "peer_display_order_json", "peer_records_json"]) {
    assert(diceCsv.split("\n")[0].includes(column), `Study 1 dice CSV missing ${column}`);
  }
  return completed.session;
}

function testBlockAndConcurrency() {
  const root = path.join(os.tmpdir(), `group-deception-study1-block-${process.pid}-${Date.now()}`);
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
        const conditions = ${JSON.stringify(CONDITIONS)};
        for (let i = 0; i < 7; i += 1) await req(server, "block-s1-" + i);
        const stateAfterSeven = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const firstSeven = stateAfterSeven.allocations.filter((item) => item.study === "study1" && item.participant_id.startsWith("block-s1-"));
        const countsAfterSeven = firstSeven.reduce((acc, item) => { acc[item.condition] = (acc[item.condition] || 0) + 1; return acc; }, {});
        assert(conditions.every((condition) => countsAfterSeven[condition] === 1), "7-person block counts mismatch " + JSON.stringify(countsAfterSeven));
        for (let i = 7; i < 14; i += 1) await req(server, "block-s1-" + i);
        const state = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const allocations = state.allocations.filter((item) => item.study === "study1" && item.participant_id.startsWith("block-s1-"));
        const counts = allocations.reduce((acc, item) => { acc[item.condition] = (acc[item.condition] || 0) + 1; return acc; }, {});
        assert(conditions.every((condition) => counts[condition] === 2), "14-person block counts mismatch " + JSON.stringify(counts));
        const [a, b] = await Promise.all([req(server, "same-s1"), req(server, "same-s1")]);
        assert(a.session.id === b.session.id, "same participant got different session ids");
        const sessions = (await store.listSessions()).filter((session) => session.participant_id === "same-s1");
        const state2 = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const sameAllocations = state2.allocations.filter((item) => item.participant_id === "same-s1");
        assert(sessions.length === 1, "same participant duplicate sessions");
        assert(sameAllocations.length === 1, "same participant duplicate allocations");
        console.log("Study 1 concurrent same participant: session_id=" + a.session.id + " sessions=" + sessions.length + " allocations=" + sameAllocations.length);
        console.log("Study 1 7-person block counts: " + JSON.stringify(countsAfterSeven));
        console.log("Study 1 14-person block counts: " + JSON.stringify(counts));
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
  const root = path.join(os.tmpdir(), `group-deception-study1-controlled-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "true";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s1-entry-a-" + Date.now();
    process.env.ENTRY_CODE_HONEST = "s1-entry-b-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST = "s1-entry-c-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_ESCALATING = "s1-entry-d-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_1 = "s1-entry-e-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_2 = "s1-entry-f-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_3 = "s1-entry-g-" + Date.now();
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
      dishonest: process.env.ENTRY_CODE_DISHONEST,
      dishonest_escalating: process.env.ENTRY_CODE_DISHONEST_ESCALATING,
      dishonest_fixed_1: process.env.ENTRY_CODE_DISHONEST_FIXED_1,
      dishonest_fixed_2: process.env.ENTRY_CODE_DISHONEST_FIXED_2,
      dishonest_fixed_3: process.env.ENTRY_CODE_DISHONEST_FIXED_3
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
      const forbiddenKeys = new Set([
        "condition",
        "condition_analysis_label",
        "condition_family",
        "fixed_dishonest_count",
        "fixed_dishonest_peer_names",
        "peer_behavior_assignments",
        "composition_version",
        "assignment_source",
        "entry_link_id",
        "schedule_version",
        "peer_onset_rounds",
        "n_peers_misreporting",
        "misreporting_peer_names"
      ]);
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        for (const [key, child] of Object.entries(node)) {
          assert(!forbiddenKeys.has(key), "public response leaked key " + key);
          visit(child);
        }
      };
      visit(value);
      const text = JSON.stringify(value);
      for (const forbidden of [process.env.ENTRY_CODE_HIDDEN, process.env.ENTRY_CODE_HONEST, process.env.ENTRY_CODE_DISHONEST, process.env.ENTRY_CODE_DISHONEST_ESCALATING, process.env.ENTRY_CODE_DISHONEST_FIXED_1, process.env.ENTRY_CODE_DISHONEST_FIXED_2, process.env.ENTRY_CODE_DISHONEST_FIXED_3]) {
        assert(!text.includes(forbidden), "public response leaked entry secret");
      }
    }
    (async () => {
      const server = app.listen(0);
      try {
        assertPublicClean(await req(server, undefined, 200, "/api/config"));
        await req(server, { participant_id: "missing-entry-s1" }, 400);
        await req(server, { participant_id: "bad-entry-s1", entry: "wrong-entry" }, 400);
        const before = await store.listSessions();
        assert(before.length === 0, "missing/invalid entry created sessions");
        for (const condition of ${JSON.stringify(CONDITIONS)}) {
          const created = await req(server, { participant_id: "controlled-s1-" + condition, entry: entries[condition] });
          assertPublicClean(created.session);
          const raw = await store.readSession(created.session.id);
          assert(raw.condition === condition, "controlled condition mismatch");
          assert(raw.assignment_source === "controlled_link", "assignment_source mismatch");
          assert(["A","B","C","D","E","F","G"].includes(raw.entry_link_id), "entry_link_id missing");
          assert(raw.randomization_block === null && raw.randomization_position === null, "controlled link must not have block position");
          assert(JSON.stringify(raw).includes(entries[condition]) === false, "raw entry code leaked to session");
        }
        const same1 = await req(server, { participant_id: "same-controlled-s1", entry: entries.hidden });
        const same2 = await req(server, { participant_id: "same-controlled-s1", entry: entries.hidden });
        assert(same1.session.id === same2.session.id, "same entry did not resume same session");
        await req(server, { participant_id: "same-controlled-s1", entry: entries.honest }, 409);
        const sessions = await store.listSessions();
        assert(sessions.filter((session) => session.participant_id === "same-controlled-s1").length === 1, "different entry created duplicate session");
        const statePath = path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json");
        assert(!fs.existsSync(statePath), "controlled link created randomization state");
        console.log("Study 1 controlled_link assignment checks passed");
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
      ENTRY_CODE_HIDDEN: "s1-entry-a-test",
      ENTRY_CODE_HONEST: "s1-entry-b-test",
      ENTRY_CODE_DISHONEST: "s1-entry-c-test",
      ENTRY_CODE_DISHONEST_ESCALATING: "s1-entry-d-test",
      ENTRY_CODE_DISHONEST_FIXED_1: "s1-entry-e-test",
      ENTRY_CODE_DISHONEST_FIXED_2: "s1-entry-f-test",
      ENTRY_CODE_DISHONEST_FIXED_3: "s1-entry-g-test"
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
      DATA_DIR: path.join(os.tmpdir(), `study1-invalid-allowlist-${process.pid}-${Date.now()}`),
      ASSIGNMENT_MODE: "block",
      PARTICIPANT_ID_POLICY: "allowlist",
      PARTICIPANT_ID_ALLOWLIST_FILE: "missing.json"
    })
  });
  assert(invalidMode.status !== 0, "allowlist with block assignment should fail startup");

  const missingFile = spawnSync(process.execPath, ["-e", `
    process.env.NODE_ENV = "development";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s1-allow-a";
    process.env.ENTRY_CODE_HONEST = "s1-allow-b";
    process.env.ENTRY_CODE_DISHONEST = "s1-allow-c";
    process.env.ENTRY_CODE_DISHONEST_ESCALATING = "s1-allow-d";
    process.env.ENTRY_CODE_DISHONEST_FIXED_1 = "s1-allow-e";
    process.env.ENTRY_CODE_DISHONEST_FIXED_2 = "s1-allow-f";
    process.env.ENTRY_CODE_DISHONEST_FIXED_3 = "s1-allow-g";
    process.env.PARTICIPANT_ID_POLICY = "allowlist";
    process.env.PARTICIPANT_ID_ALLOWLIST_FILE = "missing.json";
    require(${JSON.stringify(path.join(__dirname, "index.js"))});
  `], {
    encoding: "utf8",
    env: makeBaseTestEnv({
      DATA_DIR: path.join(os.tmpdir(), `study1-missing-allowlist-${process.pid}-${Date.now()}`),
      ASSIGNMENT_MODE: "controlled_link",
      PARTICIPANT_ID_POLICY: "allowlist",
      ENTRY_CODE_HIDDEN: "s1-allow-a",
      ENTRY_CODE_HONEST: "s1-allow-b",
      ENTRY_CODE_DISHONEST: "s1-allow-c",
      ENTRY_CODE_DISHONEST_ESCALATING: "s1-allow-d",
      ENTRY_CODE_DISHONEST_FIXED_1: "s1-allow-e",
      ENTRY_CODE_DISHONEST_FIXED_2: "s1-allow-f",
      ENTRY_CODE_DISHONEST_FIXED_3: "s1-allow-g",
      PARTICIPANT_ID_ALLOWLIST_FILE: "missing.json"
    })
  });
  assert(missingFile.status !== 0, "allowlist with missing file should fail startup");

  const root = path.join(os.tmpdir(), `group-deception-study1-allowlist-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const allowlistPath = path.join(root, "allowlist.json");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(allowlistPath, JSON.stringify([
    { participant_id: "GD-S1-K7M4Q2", entry_link_id: "A" },
    { participant_id: "GD-S1-P8N6R1", entry_link_id: "B" },
    { participant_id: "GD-S1-E1A2B3", entry_link_id: "E" },
    { participant_id: "GD-S1-F1C2D3", entry_link_id: "F" },
    { participant_id: "GD-S1-G1E2F3", entry_link_id: "G" }
  ]), "utf8");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "true";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s1-allow-a-" + Date.now();
    process.env.ENTRY_CODE_HONEST = "s1-allow-b-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST = "s1-allow-c-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_ESCALATING = "s1-allow-d-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_1 = "s1-allow-e-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_2 = "s1-allow-f-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST_FIXED_3 = "s1-allow-g-" + Date.now();
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
        const notListed = await req(server, { participant_id: "GD-S1-Z9Y8X7", entry: process.env.ENTRY_CODE_HIDDEN }, 403);
        const wrongEntry = await req(server, { participant_id: "GD-S1-K7M4Q2", entry: process.env.ENTRY_CODE_HONEST }, 403);
        assert(missing.error && badFormat.error && notListed.error && wrongEntry.error, "allowlist errors missing messages");
        const created = await req(server, { participant_id: "GD-S1-K7M4Q2", entry: process.env.ENTRY_CODE_HIDDEN });
        const resumed = await req(server, { participant_id: "GD-S1-K7M4Q2", entry: process.env.ENTRY_CODE_HIDDEN });
        assert(created.session.id === resumed.session.id, "allowlisted participant did not resume same session");
        const sessions = (await store.listSessions()).filter((session) => session.participant_id === "GD-S1-K7M4Q2");
        assert(sessions.length === 1, "allowlist created duplicate sessions");
        const raw = await store.readSession(created.session.id);
        assert(raw.assignment_source === "controlled_link" && raw.entry_link_id === "A", "allowlist entry assignment mismatch");
        for (const [participant_id, entry, expectedCondition, expectedEntry] of [
          ["GD-S1-E1A2B3", process.env.ENTRY_CODE_DISHONEST_FIXED_1, "dishonest_fixed_1", "E"],
          ["GD-S1-F1C2D3", process.env.ENTRY_CODE_DISHONEST_FIXED_2, "dishonest_fixed_2", "F"],
          ["GD-S1-G1E2F3", process.env.ENTRY_CODE_DISHONEST_FIXED_3, "dishonest_fixed_3", "G"]
        ]) {
          const result = await req(server, { participant_id, entry });
          const fixedRaw = await store.readSession(result.session.id);
          assert(fixedRaw.condition === expectedCondition && fixedRaw.entry_link_id === expectedEntry, "fixed allowlist entry assignment mismatch");
        }
        console.log("Study 1 participant allowlist checks passed");
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
      ENTRY_CODE_HIDDEN: "s1-allow-a-test",
      ENTRY_CODE_HONEST: "s1-allow-b-test",
      ENTRY_CODE_DISHONEST: "s1-allow-c-test",
      ENTRY_CODE_DISHONEST_ESCALATING: "s1-allow-d-test",
      ENTRY_CODE_DISHONEST_FIXED_1: "s1-allow-e-test",
      ENTRY_CODE_DISHONEST_FIXED_2: "s1-allow-f-test",
      ENTRY_CODE_DISHONEST_FIXED_3: "s1-allow-g-test",
      PARTICIPANT_ID_ALLOWLIST_FILE: allowlistPath
    })
  });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "participant allowlist child failed");
}

function testBlockModeRejectsEntry() {
  const root = path.join(os.tmpdir(), `group-deception-study1-block-entry-${process.pid}-${Date.now()}`);
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
      const payload = JSON.stringify({ participant_id: "block-entry-s1", entry: "unused-entry" });
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
        console.log("Study 1 block mode rejects entry checks passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: dataDir, DEBUG_LINKS: "false" }) });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "block entry child failed");
}

function testLegacySessionExportCompatibility() {
  const legacy = {
    id: "legacy-session",
    participant_id: "legacy-participant",
    study: "study1",
    condition: "honest",
    status: "task_in_progress",
    created_at: "2026-01-01T00:00:00.000Z",
    dice_rounds: [{
      round_index: 1,
      true_die_value: 3,
      reported_value: 3,
      peer_records: [],
      n_peers_misreporting: 0,
      misreporting_peer_names: []
    }]
  };
  const participantCsv = exporters.participantsCsv([legacy]);
  const diceCsv = exporters.study1DiceRoundsCsv([legacy]);
  assert(participantCsv.includes("condition_family"), "legacy participants export missing new header");
  assert(diceCsv.includes("fixed_dishonest_peer_names"), "legacy dice export missing new header");
  assert(!Object.prototype.hasOwnProperty.call(legacy, "condition_family"), "legacy export mutated source session");
  assert(!Object.prototype.hasOwnProperty.call(legacy.dice_rounds[0], "composition_version"), "legacy export mutated source round");
}

function staticChecks() {
  const root = path.join(__dirname, "..");
  const appJs = fs.readFileSync(path.join(root, "public/js/app.js"), "utf8");
  const diceJs = fs.readFileSync(path.join(root, "public/js/study1-dice.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const adminHtml = fs.readFileSync(path.join(root, "public/admin.html"), "utf8");
  const styleCss = fs.readFileSync(path.join(root, "public/css/style.css"), "utf8");
  const surveyJs = fs.readFileSync(path.join(root, "public/js/survey.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const measureConfig = fs.readFileSync(path.join(root, "config/measures.js"), "utf8");
  const studyConfig = fs.readFileSync(path.join(root, "config/study1-dice.js"), "utf8");
  const allText = [appJs, diceJs, indexHtml, adminHtml, styleCss, surveyJs, serverJs, measureConfig, studyConfig].join("\n");
  assert(!appJs.includes("params.get(\"condition\")"), "frontend must not read URL condition");
  assert(!appJs.includes("params.get(\"study\")"), "frontend must not read URL study");
  assert(appJs.includes('params.get("entry")') && appJs.includes("entry: state.entryCode"), "frontend must send entry without interpreting condition");
  assert((appJs.match(/debrief-viewed/g) || []).length === 1, "frontend should call debrief-viewed only once");
  assert(appJs.includes("正在确认事后说明…"), "debrief pending copy missing");
  assert(appJs.includes("复制参与编号") && appJs.includes("已复制"), "copy participant id UI missing");
  assert(appJs.includes("参与信息") && appJs.includes("研究联系邮箱") && appJs.includes("123456@163.com"), "participant info card missing");
  assert(appJs.includes("感谢你完成本次任务！") && appJs.includes("你的任务与问卷记录仅用于研究。你可凭参与编号联系研究团队，了解更多安排、撤回本次参与或申请删除本次记录。"), "debrief final copy missing");
  assert(!appJs.includes("研究数据管理规范") && !appJs.includes("预先安排") && !appJs.includes("信息环境"), "debrief old research-detail copy must be removed");
  assert(appJs.includes("感谢你的参与。"), "completion thank-you copy missing");
  assert((appJs.match(/感谢你的参与。/g) || []).length === 1, "completion thank-you copy must appear exactly once");
  assert(appJs.includes("participant-id-copy-source") && appJs.includes("123456@163.com"), "completion participant id/contact fallback missing");
  assert(!appJs.includes("response.json()"), "participant frontend must not call response.json() directly");
  assert(appJs.includes("parseJsonResponse") && appJs.includes("Non-JSON API response") && appJs.includes("bodyPreview: text.slice(0, 200)"), "frontend JSON response guard missing");
  assert(appJs.includes("toParticipantMessage") && appJs.includes("SAFE_SERVER_MESSAGES") && appJs.includes("SAVE_ERROR_MESSAGE"), "frontend participant-safe error mapping missing");
  assert(!appJs.includes("new Error(data.message || data.error"), "frontend must not surface arbitrary backend messages");
  assert(!indexHtml.includes("Group Deception v2") && !indexHtml.includes("GROUP DECEPTION V2"), "internal version label must be removed");
  assert(indexHtml.includes("<li>你的个人报告不会向其他成员展示。</li>"), "final consent bullet 1 missing");
  assert(indexHtml.includes("<li>完成全部流程后，你将获得基础参与报酬；此外，任务报酬将根据页面所示规则另行计算。最终被试费由基础参与报酬和任务报酬两部分构成。</li>"), "final consent bullet 2 missing");
  assert(indexHtml.includes("<li>你可以随时停止参与。</li>"), "final consent bullet 3 missing");
  assert(!indexHtml.includes("部分群体互动内容由系统生成") && !indexHtml.includes("其他成员也无法查看或更改你的个人报告内容") && !indexHtml.includes("任务结束后，我们将说明本研究的完整安排及数据处理方式"), "old consent copy must be removed");
  assert(appJs.includes("开始前，请回答几个关于日常 AI 使用经验的问题：") && appJs.includes("请根据你的真实情况选择"), "baseline title/subtitle copy missing");
  assert(!measureConfig.includes("频率是。") && !measureConfig.includes("具体任务。") && !measureConfig.includes("完成任务。") && !measureConfig.includes("代为执行。"), "baseline prompts should not end with full stop");
  assert(!appJs.includes("本轮共同骰子结果："), "chat must not reveal common die value");
  assert(appJs.includes("骰子结果已出，请大家在各自的个人面板中完成本轮报告。"), "replacement die chat copy missing");
  assert(diceJs.includes("请选择让群聊 AI 提交的本轮数字："), "private dice card final punctuation missing");
  assert(!allText.includes("默认不会自动选择真实点数") && !allText.includes("确认并提交") && !allText.includes("返回修改") && !allText.includes("已按您的选择完成提交") && !allText.includes("群聊 AI 只显示中性执行确认") && !allText.includes("个人任务阶段：其他成员无法查看你的最终提交"), "removed Study 1 confirmation/default copy returned");
  assert(allText.includes("任务要求成员报告本轮共同看到的骰子结果。"), "Study 1 rule text missing");
  assert(allText.includes("每轮任务报酬 = 你提交的数字 × ¥1。"), "Study 1 reward rule missing");
  assert(allText.includes("四位同事的本轮提交已显示完毕。现在请在下方私密面板完成你的个人提交。"), "Study 1 peer-record-end AI summary missing");
  assert(surveyJs.includes("showFieldErrors"), "survey field error renderer missing");
  assert(surveyJs.includes("has-field-error"), "survey field error clearing missing");
  assert(!surveyJs.includes(".replace("), "F2 frontend replace logic must be removed");
  assert(serverJs.includes("contact_email: publicContactEmail()"), "config contact email missing");
  assert(!serverJs.includes("debug_links_enabled"), "server source should not expose debug_links_enabled");
  assert(serverJs.includes('ASSIGNMENT_MODE') && serverJs.includes('controlled_link') && serverJs.includes('ENTRY_CODE_HIDDEN') && serverJs.includes('ENTRY_CODE_DISHONEST_ESCALATING') && serverJs.includes('ENTRY_CODE_DISHONEST_FIXED_1') && serverJs.includes('ENTRY_CODE_DISHONEST_FIXED_2') && serverJs.includes('ENTRY_CODE_DISHONEST_FIXED_3'), "seven-condition controlled_link assignment source missing");
  for (const option of [
    '<option value="hidden">Hidden</option>',
    '<option value="honest">0 Dishonest</option>',
    '<option value="dishonest_fixed_1">1 Dishonest</option>',
    '<option value="dishonest_fixed_2">2 Dishonest</option>',
    '<option value="dishonest_fixed_3">3 Dishonest</option>',
    '<option value="dishonest">4 Dishonest</option>',
    '<option value="dishonest_escalating">Legacy Escalating</option>'
  ]) {
    assert(adminHtml.includes(option), `admin condition option missing: ${option}`);
  }
  assert(measureConfig.includes("a_truthful_peer_count") && measureConfig.includes("a_peer_behavior_change"), "H2 manipulation checks missing");
  assert(surveyJs.includes("item.midLabel"), "H2 midpoint scale label support missing");
  assert(!serverJs.includes("dishonest_escalating_") && !serverJs.includes('"D1"') && !serverJs.includes('"D2"') && !serverJs.includes('"D3"'), "unexpected extra H2 condition found");
  assert(!/[?]\/(?:h2|p|span)>|寮€|鐠囬攱/.test(allText), "obvious mojibake or broken HTML marker found");
  for (const file of listFiles(root, ".js")) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", env: makeBaseTestEnv({ DATA_DIR: path.join(os.tmpdir(), `study1-check-${process.pid}`) }) });
    assert(check.status === 0, `node --check failed for ${file}: ${check.stderr}`);
  }
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
  testStudy1DeterministicSeeds();
  testBlockAndConcurrency();
  testControlledLinkAssignment();
  testParticipantAllowlistPolicy();
  testBlockModeRejectsEntry();
  testLegacySessionExportCompatibility();
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    const health = await request(server, "GET", "/health");
    assert(health.study === "study1", "health study mismatch");
    assert(health.study_version === "study1-v1.1.0", "health study_version mismatch");
    assert(health.protocol_version === "peer-reporting-v2", "health protocol_version mismatch");
    assertPublicConfig(config);
    await testMissingSessionHandling(server);
    await testApiNeverReturnsHtml(server);
    for (const condition of CONDITIONS) {
      const ready = await createReadySession(server, config, condition, `flow-s1-${condition}-${Date.now()}`);
      await assertStudy1StimuliPersisted(ready.id, condition);
      await runDiceTask(server, ready.id, ready.current, condition);
    }
    const adminSummary = await request(server, "GET", "/api/admin/summary?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
    assert(JSON.stringify(Object.keys(adminSummary.summary.study1)) === JSON.stringify(CONDITIONS), "admin summary condition set mismatch");
    assert(adminSummary.summary.study1.dishonest.condition_analysis_label === "dishonest_static", "admin summary static analysis label mismatch");
    for (const condition of CONDITIONS) {
      const row = adminSummary.summary.study1[condition];
      assert(row && typeof row.sessions === "number" && typeof row.started === "number" && typeof row.completed === "number", `admin summary metrics missing for ${condition}`);
    }
    const escalatingSummary = await request(server, "GET", "/api/admin/summary?include_test=true&condition=dishonest_escalating", undefined, 200, { "x-admin-token": "dev-admin-token" });
    assert(escalatingSummary.summary.study1.dishonest_escalating.sessions >= 1, "admin escalating condition filter mismatch");
    for (const condition of ["dishonest_fixed_1", "dishonest_fixed_2", "dishonest_fixed_3"]) {
      const filtered = await request(server, "GET", `/api/admin/summary?include_test=true&condition=${condition}`, undefined, 200, { "x-admin-token": "dev-admin-token" });
      assert(filtered.summary.study1[condition].sessions >= 1, `admin ${condition} filter mismatch`);
    }
    const allDiceCsv = await request(server, "GET", "/api/admin/export/study1_dice_rounds.csv?include_test=true&condition=dishonest_escalating", undefined, 200, { "x-admin-token": "dev-admin-token" });
    assert(allDiceCsv.includes("dishonest_escalating"), "dice CSV missing escalating condition");
    assert(allDiceCsv.includes("h2-escalation-v1"), "dice CSV missing escalation schedule version");
    const primary = await createReadySession(server, config, "dishonest", `complete-s1-${Date.now()}`);
    await runDiceTask(server, primary.id, primary.current, "dishonest");
    const completed = await completeAfterTask(server, config, primary.id);
    const resumed = await request(server, "POST", "/api/session", { participant_id: completed.participant_id });
    assert(resumed.session.id === primary.id, "completed participant received a new session");
    assert(resumed.session.status === "completed", "completed participant did not resume completed status");
    console.log(`Study 1 smoke test completed for ${primary.id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

