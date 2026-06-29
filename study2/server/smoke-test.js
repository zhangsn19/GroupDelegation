const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.DEBUG_LINKS = "true";
process.env.COMPLETION_CODE = "SMOKE-STUDY2-COMPLETE";
process.env.COMPLETION_REDIRECT_URL = "https://example.com/study2-complete";
if (!process.env.DATA_DIR) {
  const smokeRoot = path.join(os.tmpdir(), `group-deception-study2-smoke-${process.pid}`);
  fs.rmSync(smokeRoot, { recursive: true, force: true });
  process.env.DATA_DIR = path.join(smokeRoot, "sessions");
} else {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

const app = require("./index");
const store = require("./store");

const EXPECTED_POST_ITEMS = [
  ["a_specific_peer_records_seen", "在我作出自己的最终申报前，我看到了其他成员此前向群聊 AI 提交的具体申报内容。", "likert"],
  ["a_condition_memory", "根据刚才看到的信息，其他成员此前的申报情况最接近哪一种？", "select"],
  ["a_private_submission_understood", "我理解其他成员无法看到我最终向群聊 AI 提交的收入申报。", "likert"],
  ["a_independent_reward_understood", "我理解其他成员的申报不会改变我的个人奖励。", "likert"],
  ["a_ai_executes_understood", "我理解在本任务中，群聊 AI 只负责执行申报，不替成员决定应申报多少收入。", "likert"],
  ["b_peer_truthful_reporting_common", "在这个群聊中，其他成员通常会如实申报自己实际获得的收入。", "likert"],
  ["b_peer_underreporting_common", "在这个群聊中，其他成员通常会为了增加个人奖励而申报低于实际获得的收入。", "likert"],
  ["b_peer_behavior_predictable", "我刚才看到的信息，足以让我判断这个群聊中其他成员通常会如何申报收入。", "likert"],
  ["c_truthful_reporting_acceptable", "在这个群聊中，其他成员认为如实申报实际收入是应该的。", "likert"],
  ["c_underreporting_acceptable", "在这个群聊中，其他成员认为为了增加个人奖励而申报低于实际获得的收入是可以接受的。", "likert"],
  ["d_guilt", "回顾刚才的收入申报任务和我的最终提交，我感到内疚。", "likert"],
  ["d_moral_discomfort", "回顾刚才的收入申报任务和我的最终提交，我感到道德上的不安。", "likert"],
  ["e_reflects_my_decision", "我最终申报的收入反映了我自己的决定。", "likert"],
  ["e_personal_responsibility", "我应当为自己最终申报的收入承担责任。", "likert"],
  ["e_ai_followed_choice", "群聊 AI 按照我的选择完成了收入申报。", "likert"],
  ["e_ai_influenced_decision", "群聊 AI 影响了我最终决定申报多少收入。", "likert"],
  ["e_ai_decided_outcome", "我认为最终申报的收入主要由群聊 AI 决定。", "likert"],
  ["f_decision_considerations", "请简要说明：在决定最终申报多少收入时，你主要考虑了哪些因素？", "text"],
  ["f_design_influences", "任务中是否有任何信息或设计影响了你的决定？例如其他成员的申报情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有，也请说明。", "text"]
];

const EXPECTED_A2_OPTIONS = [
  "我没有看到其他成员的具体申报内容",
  "其他成员大多如实申报了实际收入",
  "其他成员大多申报了低于实际收入的金额",
  "其他成员的申报情况混合且不一致",
  "我不记得"
];

function request(server, method, requestPath, body, expectedStatus = 200) {
  const payload = body ? JSON.stringify(body) : null;
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      method,
      hostname: "127.0.0.1",
      port: address.port,
      path: requestPath,
      headers: payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function advanceToPeerRecordsViewed(server, condition, prolificId) {
  const created = await request(server, "POST", "/api/session", { condition, prolific_id: prolificId });
  assert(!created.session.completion, "Unfinished session must not expose completion details");
  const id = created.session.id;
  await request(server, "POST", `/api/session/${id}/consent`);
  await request(server, "POST", `/api/session/${id}/baseline`, {
    responses: {
      ai_use_frequency: 4,
      ai_execution_experience: 3,
      ai_execution_trust: 5,
      ai_execution_willingness: 5
    }
  });
  await request(server, "POST", `/api/session/${id}/rules-viewed`);
  await request(server, "POST", `/api/session/${id}/comprehension`, {
    answers: {
      private_submission: "no",
      independent_rewards: "no_change",
      ai_role: "executes"
    }
  });

  let effort = await request(server, "POST", `/api/session/${id}/effort/start`);
  for (let round = 1; round <= 4; round += 1) {
    assert(effort.current.started_at, "Effort round should start when /effort/start is requested");
    assert(effort.current.deadline_at, "Effort round should receive deadline when /effort/start is requested");
    await wait(round === 1 ? 20 : 1);
    const answers = {};
    effort.current.numbers.forEach((number, index) => {
      answers[String(index)] = number % 2 === 0 ? "even" : "odd";
    });
    effort = await request(server, "POST", `/api/session/${id}/effort/round`, {
      round_index: round,
      answers,
      duration_ms: 0,
      started_at: "2000-01-01T00:00:00.000Z"
    });
    if (round === 1) assert(effort.round.duration_ms > 0, "Server must ignore spoofed duration_ms");
    assert(Number.isInteger(effort.round.income_cents), "Effort income must be saved in integer cents");
    if (round < 4) {
      assert(effort.current.started_at === null, "Next effort round must not be pre-started by /effort/round");
      assert(effort.current.deadline_at === null, "Next effort round deadline must stay null before /effort/start");
      effort = await request(server, "POST", `/api/session/${id}/effort/start`);
    }
  }

  await request(server, "POST", `/api/session/${id}/income-viewed`);
  const records = await request(server, "GET", `/api/session/${id}/peer-records`);
  await request(server, "POST", `/api/session/${id}/peer-records-viewed`, {
    displayed_at: "2000-01-01T00:00:00.000Z",
    duration_ms: 999999
  });
  return { id, records };
}

function makePostResponses(config) {
  const responses = {};
  for (const item of config.study2.postSurveyItems) {
    if (item.type === "text") responses[item.id] = "";
    else if (item.type === "select") responses[item.id] = item.options[0];
    else responses[item.id] = 4;
  }
  return responses;
}

function assertPostSurvey(config) {
  const items = config.study2.postSurveyItems;
  assert(items.length === EXPECTED_POST_ITEMS.length, "Study 2 post-survey item count changed");
  const sections = [...new Set(items.map((item) => item.section))].join("");
  assert(sections === "ABCDEF", "Study 2 post-survey section order must be A-B-C-D-E-F");
  EXPECTED_POST_ITEMS.forEach(([id, prompt, type], index) => {
    const item = items[index];
    assert(item.id === id, `Post-survey id mismatch at ${index}`);
    assert(item.prompt === prompt, `Post-survey prompt mismatch for ${id}`);
    assert(item.type === type, `Post-survey type mismatch for ${id}`);
    if (type === "likert") {
      if (id === "d_guilt" || id === "d_moral_discomfort") {
        assert(item.minLabel === "完全没有" && item.maxLabel === "非常强烈", `D scale labels wrong for ${id}`);
      } else {
        assert(item.minLabel === "非常不同意" && item.maxLabel === "非常同意", `Likert labels wrong for ${id}`);
      }
    }
  });
  const a2 = items.find((item) => item.id === "a_condition_memory");
  assert(JSON.stringify(a2.options) === JSON.stringify(EXPECTED_A2_OPTIONS), "A2 options mismatch");
  const f1 = items.find((item) => item.id === "f_decision_considerations");
  const f2 = items.find((item) => item.id === "f_design_influences");
  assert(f1.required === false && f2.required === false, "F1/F2 must be optional");
}

function assertRulesAndStaticSource(config) {
  assert(!config.completion, "Config must not expose completion details");
  const ruleText = config.study2.ruleBlocks.map((block) => block.body).join("\n");
  assert(ruleText.includes("申报收入 × 0.5"), "Rules must disclose 0.5 deduction formula");
  assert(ruleText.includes("任务保留奖励 = 实际收入 − 模拟扣除金额"), "Rules must disclose retained reward formula");
  const uiSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "study2-income.js"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
  assert(uiSource.includes("模拟扣除"), "Income report page must show simulated deduction");
  assert(uiSource.includes("任务保留奖励"), "Income report page must show retained reward");
  assert(!uiSource.includes("低报金额"), "Confirmation page must not show underreport amount label");
  assert(!uiSource.includes("低报比例"), "Confirmation page must not show underreport rate label");
  assert(appSource.includes("state.effortCurrent?.completed"), "Final effort result continue must route to actual income instead of starting another round");
  assert(!appSource.includes("进入 Study 2 收入申报任务"), "Study 2 landing button text must not be overwritten at runtime");
}

async function assertTimeoutScoring(server) {
  const created = await request(server, "POST", "/api/session", { condition: "honest", prolific_id: `timeout_${Date.now()}` });
  assert(!created.session.completion, "Unfinished timeout session must not expose completion details");
  const id = created.session.id;
  await request(server, "POST", `/api/session/${id}/consent`);
  await request(server, "POST", `/api/session/${id}/baseline`, {
    responses: {
      ai_use_frequency: 4,
      ai_execution_experience: 3,
      ai_execution_trust: 5,
      ai_execution_willingness: 5
    }
  });
  await request(server, "POST", `/api/session/${id}/rules-viewed`);
  await request(server, "POST", `/api/session/${id}/comprehension`, {
    answers: {
      private_submission: "no",
      independent_rewards: "no_change",
      ai_role: "executes"
    }
  });
  const effort = await request(server, "POST", `/api/session/${id}/effort/start`);
  await store.updateSession(id, (draft) => {
    draft.effort_materials[0].deadline_at = new Date(Date.now() - 1000).toISOString();
    return draft;
  });
  const answers = {};
  effort.current.numbers.forEach((number, index) => {
    answers[String(index)] = number % 2 === 0 ? "even" : "odd";
  });
  const timedOut = await request(server, "POST", `/api/session/${id}/effort/round`, {
    round_index: 1,
    answers
  });
  assert(timedOut.round.timed_out === true, "Expired effort request must be marked timed_out");
  assert(timedOut.round.correct_count === 0, "Expired effort request must score zero correct answers");
  assert(timedOut.round.income_cents === 0, "Expired effort request must score zero income");
}

function testConcurrentParticipantCreationAndBlockRandomization() {
  const dataRoot = path.join(os.tmpdir(), `group-deception-study2-concurrency-${process.pid}-${Date.now()}`);
  const dataDir = path.join(dataRoot, "sessions");
  fs.rmSync(dataRoot, { recursive: true, force: true });
  const code = `
    process.env.DEBUG_LINKS = "false";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    process.env.NODE_ENV = "development";
    const fs = require("fs");
    const path = require("path");
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const store = require(${JSON.stringify(path.join(__dirname, "store.js"))});
    function request(server, body) {
      const payload = JSON.stringify(body);
      return new Promise((resolve, reject) => {
        const req = http.request({
          method: "POST",
          hostname: "127.0.0.1",
          port: server.address().port,
          path: "/api/session",
          headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
        }, (res) => {
          let raw = "";
          res.on("data", (chunk) => { raw += chunk; });
          res.on("end", () => res.statusCode === 200 ? resolve(JSON.parse(raw)) : reject(new Error(raw)));
        });
        req.on("error", reject);
        req.write(payload);
        req.end();
      });
    }
    function assert(condition, message) {
      if (!condition) throw new Error(message);
    }
    function readState() {
      return JSON.parse(fs.readFileSync(path.join(path.dirname(process.env.DATA_DIR), "randomization-state.json"), "utf8"));
    }
    (async () => {
      const server = app.listen(0);
      try {
        for (let index = 0; index < 12; index += 1) {
          await request(server, { participant_id: "block_s2_" + index, condition: "dishonest" });
        }
        const stateAfterBlock = readState();
        const blockAllocations = stateAfterBlock.allocations.filter((item) => item.study === "study2" && item.participant_id.startsWith("block_s2_"));
        const counts = blockAllocations.reduce((acc, item) => {
          acc[item.condition] = (acc[item.condition] || 0) + 1;
          return acc;
        }, {});
        assert(counts.hidden === 4 && counts.honest === 4 && counts.dishonest === 4, "12 participant block counts mismatch: " + JSON.stringify(counts));

        const participantId = "concurrent_s2_same";
        const [first, second] = await Promise.all([
          request(server, { participant_id: participantId }),
          request(server, { participant_id: participantId })
        ]);
        assert(first.session.id === second.session.id, "Concurrent same participant returned different session IDs");
        const matchingSessions = (await store.listSessions()).filter((session) => session.study === "study2" && session.participant_id === participantId);
        assert(matchingSessions.length === 1, "Concurrent same participant created duplicate sessions: " + matchingSessions.length);
        const stateAfterConcurrent = readState();
        const matchingAllocations = stateAfterConcurrent.allocations.filter((item) => item.study === "study2" && item.participant_id === participantId);
        assert(matchingAllocations.length === 1, "Concurrent same participant created duplicate allocations: " + matchingAllocations.length);
        console.log("Study 2 block randomization counts: hidden=" + counts.hidden + " honest=" + counts.honest + " dishonest=" + counts.dishonest);
        console.log("Study 2 concurrent same participant: session_id=" + first.session.id + " sessions=" + matchingSessions.length + " allocations=" + matchingAllocations.length);
      } finally {
        server.close();
      }
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  assert(result.status === 0, `Concurrent participant/block child test failed: ${result.status} ${result.stderr}`);
}

async function main() {
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    assert(config.debug_links_enabled === true, "Smoke test requires DEBUG_LINKS=true");
    assertPostSurvey(config);
    assertRulesAndStaticSource(config);
    await assertTimeoutScoring(server);
    testConcurrentParticipantCreationAndBlockRandomization();

    const prolificId = `smoke_s2_${Date.now()}`;
    const { id, records } = await advanceToPeerRecordsViewed(server, "dishonest", prolificId);
    const viewedSession = await store.readSession(id);
    assert(viewedSession.income_report_selection_started_at, "Server must save income_report_selection_started_at after peer records viewed");
    assert(viewedSession.peer_records_view.displayed_at !== "2000-01-01T00:00:00.000Z", "Server must ignore spoofed displayed_at");
    assert(viewedSession.peer_records_view.duration_ms === null, "Server must not save browser-provided peer record duration");
    const expectedDishonest = [
      ["张明", 110, 55],
      ["李华", 95, 50],
      ["王芳", 125, 60],
      ["陈思", 105, 45]
    ];
    expectedDishonest.forEach(([name, actual, reported], index) => {
      const record = records.records[index];
      assert(record.name === name, "Peer template name/order changed");
      assert(record.actual_income_cents === actual, "Peer actual cents changed");
      assert(record.reported_income_cents === reported, "Peer dishonest reported cents changed");
      assert(record.reported_income_cents < record.actual_income_cents, "Dishonest peer record must underreport");
    });

    await store.updateSession(id, (draft) => {
      draft.actual_income_cents = 273;
      draft.actual_income = 2.73;
      draft.effort_summary.total_income_cents = 273;
      draft.effort_summary.total_income = 2.73;
      return draft;
    });

    await request(server, "POST", `/api/session/${id}/income-report`, {
      reported_income_cents: 274,
      selection_started_at: new Date().toISOString()
    }, 409);

    const reported = await request(server, "POST", `/api/session/${id}/income-report`, {
      reported_income_cents: 273,
      selection_started_at: "2000-01-01T00:00:00.000Z"
    });
    assert(reported.income_report.actual_income_cents === 273, "Actual income cents not saved");
    assert(reported.income_report.reported_income_cents === 273, "Exact actual report should be accepted");
    assert(reported.income_report.deduction_cents === 137, "Deduction cents should be rounded from deductionRate");
    assert(reported.income_report.retained_reward_cents === 136, "Retained reward cents mismatch");
    assert(reported.income_report.selection_started_at === viewedSession.income_report_selection_started_at, "Income report must ignore spoofed browser selection_started_at");

    await request(server, "POST", `/api/session/${id}/income-report`, {
      reported_income_cents: 200
    }, 409);

    await request(server, "POST", `/api/session/${id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    }, 409);

    const invalidPost = makePostResponses(config);
    invalidPost.a_specific_peer_records_seen = "";
    await request(server, "POST", `/api/session/${id}/post-survey`, { responses: invalidPost }, 400);
    await request(server, "POST", `/api/session/${id}/post-survey`, { responses: makePostResponses(config) });
    await request(server, "POST", `/api/session/${id}/experience`, {
      responses: { income_reporting_familiarity: 4, income_reporting_experience: 4 }
    });
    await request(server, "POST", `/api/session/${id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    });
    const completed = await request(server, "POST", `/api/session/${id}/complete`);
    assert(completed.session.status === "completed", "Session did not complete");
    assert(completed.session.completion?.completion_code === "SMOKE-STUDY2-COMPLETE", "Completed session should expose completion code");
    assert(completed.session.completion?.completion_redirect_url === "https://example.com/study2-complete", "Completed session should expose completion redirect");

    const resumed = await request(server, "POST", "/api/session", {
      condition: "honest",
      prolific_id: prolificId
    });
    assert(resumed.session.id === id, "Completed Prolific ID should not receive a new session");
    assert(resumed.session.status === "completed", "Completed Prolific ID should resume completion status");
    assert(resumed.session.completion?.completion_code === "SMOKE-STUDY2-COMPLETE", "Resumed completed session should expose completion code");

    const honest = await advanceToPeerRecordsViewed(server, "honest", `smoke_s2_honest_${Date.now()}`);
    honest.records.records.forEach((record) => {
      assert(record.actual_income_cents === record.reported_income_cents, "Honest peer record must report actual income");
    });

    const hidden = await advanceToPeerRecordsViewed(server, "hidden", `smoke_s2_hidden_${Date.now()}`);
    hidden.records.records.forEach((record) => {
      assert(record.visibility === "hidden", "Hidden condition should not expose peer values");
      assert(record.actual_income_cents === null && record.reported_income_cents === null, "Hidden peer cents should be null");
    });

    await store.updateSession(hidden.id, (draft) => {
      draft.actual_income_cents = 0;
      draft.actual_income = 0;
      return draft;
    });
    const zeroPublic = await request(server, "GET", `/api/session/${hidden.id}`);
    assert(zeroPublic.session.actual_income_cents === 0, "Public session must return actual_income_cents 0 instead of null");
    assert(zeroPublic.session.actual_income === 0, "Public session must return actual_income 0 instead of null");

    const serverSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    assert(serverSource.includes('String(process.env.DEBUG_LINKS).toLowerCase() === "true"'), "DEBUG_LINKS must be explicit true only");

    console.log(`Study 2 smoke test completed for ${id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
