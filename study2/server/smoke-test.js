const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.NODE_ENV = "development";
process.env.DEBUG_LINKS = "true";
process.env.STUDY_CONTACT_EMAIL = "123456@163.com";
process.env.COMPLETION_CODE = "SMOKE-STUDY2-COMPLETE";
process.env.COMPLETION_REDIRECT_URL = "https://example.com/study2-complete";

if (!process.env.DATA_DIR) {
  const root = path.join(os.tmpdir(), `group-deception-study2-smoke-${process.pid}-${Date.now()}`);
  fs.rmSync(root, { recursive: true, force: true });
  process.env.DATA_DIR = path.join(root, "sessions");
} else {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

const app = require("./index");
const store = require("./store");
const study2 = require("../config/study2-income");

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
    const submitted = await request(server, "POST", `/api/session/${id}/effort/round`, {
      round_index: round,
      answers,
      duration_ms: 0,
      started_at: "2000-01-01T00:00:00.000Z"
    });
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
  return { id, records, actualIncomeCents: stored.actual_income_cents };
}

async function completeAfterIncomeReport(server, config, id, actualIncomeCents) {
  await request(server, "POST", `/api/session/${id}/income-report`, { reported_income_cents: actualIncomeCents + 1 }, 409);
  await request(server, "POST", `/api/session/${id}/income-report`, { reported_income_cents: actualIncomeCents - 1 }, 409);
  const report = await request(server, "POST", `/api/session/${id}/income-report`, { reported_income_cents: actualIncomeCents });
  assert(report.income_report.reported_income_cents === actualIncomeCents, "income report did not save reported cents");
  assert(report.income_report.deduction_cents === Math.round(actualIncomeCents * 0.5), "deduction formula mismatch");
  assert(report.income_report.retained_reward_cents === actualIncomeCents - report.income_report.deduction_cents, "retained reward formula mismatch");
  assert(report.income_report.selection_started_at, "income report selection start missing");
  await request(server, "POST", `/api/session/${id}/income-report`, { reported_income_cents: actualIncomeCents }, 409);
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
  const effortCsv = await request(server, "GET", "/api/admin/export/study2_effort_rounds.csv?include_test=true", undefined, 200, { "x-admin-token": "dev-admin-token" });
  for (const column of ["participant_id", "round_index", "correct_count", "base_income", "speed_bonus", "round_actual_income"]) {
    assert(effortCsv.split("\n")[0].includes(column), `effort CSV missing ${column}`);
  }
  return completed.session;
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
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
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
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "controlled_link child failed");
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
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, result.stderr || "block entry child failed");
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
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    assert(check.status === 0, `node --check failed for ${file}: ${check.stderr}`);
  }
  assert(incomeJs.includes("function renderIncomeReport"), "renderIncomeReport must be defined");
  assert(incomeJs.includes("renderIncomeReport,"), "renderIncomeReport must be exported");
  assert(!incomeJs.includes("仅你与群聊 AI 可见。"), "old income report privacy copy must be removed");
  assert(incomeJs.includes("你的个人收入申报不会向其他成员展示。"), "new income report privacy copy missing");
  assert(incomeJs.includes("模拟扣除金额由申报收入计算；任务保留奖励 = 实际收入 − 模拟扣除金额。"), "income report final hint missing");
  assert(incomeJs.includes("基础收入") && incomeJs.includes("速度奖励") && incomeJs.includes("本轮实际收入"), "effort result income breakdown missing");
  assert(incomeJs.includes("努力任务已完成") && incomeJs.includes("你的实际收入由 4 轮任务的本轮实际收入累计得出。") && incomeJs.includes("查看同事此前的收入申报"), "actual income summary page missing");
  assert(incomeJs.includes('step="10"') && incomeJs.includes('step="0.10"'), "income report step must be ¥0.10");
  assert(!incomeJs.includes("申报收入将按固定规则计算需支付部分") && !incomeJs.includes("较低的申报收入对应较高的个人保留奖励"), "old income report hint must be removed");
  const actualSection = incomeJs.slice(incomeJs.indexOf("function renderActualIncome"), incomeJs.indexOf("function renderIncomeReport"));
  const reportSection = incomeJs.slice(incomeJs.indexOf("function renderIncomeReport"), incomeJs.indexOf("function renderIncomeConfirmation"));
  assert(!actualSection.includes("submit-income-report"), "actual income page must not submit income report");
  assert(actualSection.includes('data-action="income-viewed"'), "actual income page must continue to peer records");
  assert(reportSection.includes("submit-income-report"), "income report page must contain submit-income-report");
  for (const label of ["实际收入", "当前申报收入", "模拟扣除金额", "任务保留奖励"]) assert(reportSection.includes(label), `income report page missing ${label}`);
  assert(appJs.includes("peer-records-viewed") && appJs.includes("renderIncomeReport"), "income report must be rendered after peer records viewed");
  assert(!appJs.includes("params.get(\"condition\")"), "frontend must not read URL condition");
  assert(appJs.includes('params.get("entry")') && appJs.includes("entry: state.entryCode"), "frontend must send entry without interpreting condition");
  assert(appJs.includes("INCOME_REPORT_STEP_CENTS = 10") && appJs.includes("Math.round(value / INCOME_REPORT_STEP_CENTS)"), "frontend income report step clamp missing");
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
  staticChecks();
  testBlockAndConcurrency();
  testControlledLinkAssignment();
  testBlockModeRejectsEntry();
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    const health = await request(server, "GET", "/health");
    assert(health.study === "study2", "health study mismatch");
    assert(health.study_version === "study2-v1.1.0", "health study_version mismatch");
    assert(health.protocol_version === "peer-reporting-v2", "health protocol_version mismatch");
    assertPublicConfig(config);
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

