const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.NODE_ENV = "development";
process.env.DEBUG_LINKS = "true";
process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
process.env.COMPLETION_CODE = "SMOKE-STUDY1-COMPLETE";
process.env.COMPLETION_REDIRECT_URL = "https://example.com/study1-complete";

if (!process.env.DATA_DIR) {
  const root = path.join(os.tmpdir(), `group-deception-study1-smoke-${process.pid}-${Date.now()}`);
  fs.rmSync(root, { recursive: true, force: true });
  process.env.DATA_DIR = path.join(root, "sessions");
} else {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

const app = require("./index");
const store = require("./store");
const study1 = require("../config/study1-dice");

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
  return Object.fromEntries(study1.comprehensionQuestions.map((item) => [item.id, item.correctValue]));
}

function assertPublicSession(session) {
  for (const key of ["study", "condition", "condition_label", "condition_name", "is_test_session", "debug_mode", "debug_links_enabled", "randomization_block", "randomization_position", "assignment_source", "entry_link_id"]) {
    assert(!Object.prototype.hasOwnProperty.call(session, key), `public session exposed ${key}`);
  }
  assert(session.study_version === "study1-v1.1.0", "public session study_version mismatch");
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
  assert(Array.isArray(config.ruleBlocks), "config ruleBlocks missing");
  assert(Array.isArray(config.comprehensionQuestions), "config comprehensionQuestions missing");
  assert(!JSON.stringify(config.comprehensionQuestions).includes("correctValue"), "config exposed comprehension correctValue");
  const f2 = config.postSurveyItems.find((item) => item.id === "f_design_influences");
  assert(f2.prompt.includes("请说明；若没有或不想补充，也可留空。"), "F2 final text mismatch");
}

async function testMissingSessionHandling(server) {
  const missing = await request(server, "GET", "/api/session/legal-missing-study1", undefined, 410);
  const text = JSON.stringify(missing);
  assert(missing.error === "当前参与记录无法恢复。请联系研究团队获取新的参与链接后重新开始。", "missing session message mismatch");
  for (const leak of ["ENOENT", "/tmp", "sessions", "data\\\\", "no such file", ".json"]) {
    assert(!text.includes(leak), `missing session leaked ${leak}`);
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
  for (const record of current.peer_records) {
    assert(record.trueValue === current.true_die_value, "peer true value must equal participant common die");
    if (condition === "hidden") {
      assert(record.visibility === "hidden", "hidden peer record visibility mismatch");
      assert(record.reportedValue === null, "hidden peer reported value must be null");
    }
    if (condition === "honest") assert(record.reportedValue === current.true_die_value, "honest peer report must equal true die");
    if (condition === "dishonest") assert(record.reportedValue > current.true_die_value, "dishonest peer report must be greater than true die");
  }
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
    cursor = submitted.current;
  }
  assert(cursor.completed === true, "dice task should complete after 10 rounds");
}

async function completeAfterTask(server, config, id) {
  await request(server, "POST", `/api/session/${id}/post-survey`, { responses: makeResponses(config.postSurveyItems) });
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
        for (let i = 0; i < 12; i += 1) await req(server, "block-s1-" + i);
        const state = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const allocations = state.allocations.filter((item) => item.study === "study1" && item.participant_id.startsWith("block-s1-"));
        const counts = allocations.reduce((acc, item) => { acc[item.condition] = (acc[item.condition] || 0) + 1; return acc; }, {});
        assert(counts.hidden === 4 && counts.honest === 4 && counts.dishonest === 4, "block counts mismatch " + JSON.stringify(counts));
        const [a, b] = await Promise.all([req(server, "same-s1"), req(server, "same-s1")]);
        assert(a.session.id === b.session.id, "same participant got different session ids");
        const sessions = (await store.listSessions()).filter((session) => session.participant_id === "same-s1");
        const state2 = JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
        const sameAllocations = state2.allocations.filter((item) => item.participant_id === "same-s1");
        assert(sessions.length === 1, "same participant duplicate sessions");
        assert(sameAllocations.length === 1, "same participant duplicate allocations");
        console.log("Study 1 concurrent same participant: session_id=" + a.session.id + " sessions=" + sessions.length + " allocations=" + sameAllocations.length);
        console.log("Study 1 block randomization counts: hidden=" + counts.hidden + " honest=" + counts.honest + " dishonest=" + counts.dishonest);
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
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
        await req(server, { participant_id: "missing-entry-s1" }, 400);
        await req(server, { participant_id: "bad-entry-s1", entry: "wrong-entry" }, 400);
        const before = await store.listSessions();
        assert(before.length === 0, "missing/invalid entry created sessions");
        for (const condition of ["hidden","honest","dishonest"]) {
          const created = await req(server, { participant_id: "controlled-s1-" + condition, entry: entries[condition] });
          assertPublicClean(created.session);
          const raw = await store.readSession(created.session.id);
          assert(raw.condition === condition, "controlled condition mismatch");
          assert(raw.assignment_source === "controlled_link", "assignment_source mismatch");
          assert(["A","B","C"].includes(raw.entry_link_id), "entry_link_id missing");
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
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
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
  `], { encoding: "utf8" });
  assert(invalidMode.status !== 0, "allowlist with block assignment should fail startup");

  const missingFile = spawnSync(process.execPath, ["-e", `
    process.env.NODE_ENV = "development";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s1-allow-a";
    process.env.ENTRY_CODE_HONEST = "s1-allow-b";
    process.env.ENTRY_CODE_DISHONEST = "s1-allow-c";
    process.env.PARTICIPANT_ID_POLICY = "allowlist";
    process.env.PARTICIPANT_ID_ALLOWLIST_FILE = "missing.json";
    require(${JSON.stringify(path.join(__dirname, "index.js"))});
  `], { encoding: "utf8" });
  assert(missingFile.status !== 0, "allowlist with missing file should fail startup");

  const root = path.join(os.tmpdir(), `group-deception-study1-allowlist-${process.pid}-${Date.now()}`);
  const dataDir = path.join(root, "sessions");
  const allowlistPath = path.join(root, "allowlist.json");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(allowlistPath, JSON.stringify([
    { participant_id: "GD-S1-K7M4Q2", entry_link_id: "A" },
    { participant_id: "GD-S1-P8N6R1", entry_link_id: "B" }
  ]), "utf8");
  const code = `
    process.env.NODE_ENV = "development";
    process.env.DEBUG_LINKS = "true";
    process.env.ASSIGNMENT_MODE = "controlled_link";
    process.env.ENTRY_CODE_HIDDEN = "s1-allow-a-" + Date.now();
    process.env.ENTRY_CODE_HONEST = "s1-allow-b-" + Date.now();
    process.env.ENTRY_CODE_DISHONEST = "s1-allow-c-" + Date.now();
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
        console.log("Study 1 participant allowlist checks passed");
      } finally {
        server.close();
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
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
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "block entry child failed");
}

function staticChecks() {
  const root = path.join(__dirname, "..");
  const appJs = fs.readFileSync(path.join(root, "public/js/app.js"), "utf8");
  const diceJs = fs.readFileSync(path.join(root, "public/js/study1-dice.js"), "utf8");
  const indexHtml = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const styleCss = fs.readFileSync(path.join(root, "public/css/style.css"), "utf8");
  const surveyJs = fs.readFileSync(path.join(root, "public/js/survey.js"), "utf8");
  const serverJs = fs.readFileSync(path.join(root, "server/index.js"), "utf8");
  const measureConfig = fs.readFileSync(path.join(root, "config/measures.js"), "utf8");
  const studyConfig = fs.readFileSync(path.join(root, "config/study1-dice.js"), "utf8");
  const allText = [appJs, diceJs, indexHtml, styleCss, surveyJs, serverJs, measureConfig, studyConfig].join("\n");
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
  assert(serverJs.includes('ASSIGNMENT_MODE') && serverJs.includes('controlled_link') && serverJs.includes('ENTRY_CODE_HIDDEN'), "controlled_link assignment source missing");
  assert(!/[?]\/(?:h2|p|span)>|寮€|鐠囬攱/.test(allText), "obvious mojibake or broken HTML marker found");
  for (const file of listFiles(root, ".js")) {
    if (file.includes(`${path.sep}node_modules${path.sep}`)) continue;
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
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
  staticChecks();
  testBlockAndConcurrency();
  testControlledLinkAssignment();
  testParticipantAllowlistPolicy();
  testBlockModeRejectsEntry();
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    const health = await request(server, "GET", "/health");
    assert(health.study === "study1", "health study mismatch");
    assert(health.study_version === "study1-v1.1.0", "health study_version mismatch");
    assert(health.protocol_version === "peer-reporting-v2", "health protocol_version mismatch");
    assertPublicConfig(config);
    await testMissingSessionHandling(server);
    for (const condition of ["hidden", "honest", "dishonest"]) {
      const ready = await createReadySession(server, config, condition, `flow-s1-${condition}-${Date.now()}`);
      await runDiceTask(server, ready.id, ready.current, condition);
    }
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

