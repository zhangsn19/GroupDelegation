const fs = require("fs");
const path = require("path");
const http = require("http");
const os = require("os");
const { spawnSync } = require("child_process");

process.env.DEBUG_LINKS = "true";
process.env.COMPLETION_CODE = "SMOKE-STUDY1-COMPLETE";
process.env.COMPLETION_REDIRECT_URL = "https://example.com/study1-complete";
if (!process.env.DATA_DIR) {
  const smokeRoot = path.join(os.tmpdir(), `group-deception-study1-smoke-${process.pid}`);
  fs.rmSync(smokeRoot, { recursive: true, force: true });
  process.env.DATA_DIR = path.join(smokeRoot, "sessions");
} else {
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
}

const app = require("./index");
const store = require("./store");

const EXPECTED_POST_ITEMS = [
  ["a_specific_peer_records_seen", "在每轮作出自己的提交前，我看到了其他成员本轮向群聊 AI 提交的具体内容。", "likert"],
  ["a_condition_memory", "根据刚才看到的信息，其他成员此前的提交情况最接近哪一种？", "select"],
  ["a_private_submission_understood", "我理解其他成员无法看到我在各轮向群聊 AI 提交的骰子点数。", "likert"],
  ["a_independent_reward_understood", "我理解其他成员的提交不会改变我的个人奖励。", "likert"],
  ["a_ai_executes_understood", "我理解在本任务中，群聊 AI 只负责按我的选择完成每轮提交，不替我决定应提交什么骰子点数。", "likert"],
  ["b_peer_true_reporting_common", "在这个群聊中，其他成员通常会如实提交自己看到的骰子点数。", "likert"],
  ["b_peer_reward_reporting_common", "在这个群聊中，其他成员通常会为了增加个人奖励而提交高于真实骰子点数的数字。", "likert"],
  ["b_peer_behavior_predictable", "我刚才看到的信息，足以让我判断这个群聊中其他成员通常会如何提交骰子点数。", "likert"],
  ["c_true_reporting_acceptable", "在这个群聊中，其他成员认为如实提交骰子点数是应该的。", "likert"],
  ["c_reward_reporting_acceptable", "在这个群聊中，其他成员认为为了增加个人奖励而提交高于真实骰子点数的数字是可以接受的。", "likert"],
  ["d_guilt", "回顾刚才的骰子任务和我在各轮作出的提交，我感到内疚。", "likert"],
  ["d_moral_discomfort", "回顾刚才的骰子任务和我在各轮作出的提交，我感到道德上的不安。", "likert"],
  ["e_reflects_my_decision", "我在骰子任务中作出的点数提交反映了我自己的决定。", "likert"],
  ["e_personal_responsibility", "我应当为我在骰子任务中作出的点数提交承担责任。", "likert"],
  ["e_ai_followed_choice", "群聊 AI 按照我在各轮作出的选择完成了提交。", "likert"],
  ["e_ai_influenced_decision", "群聊 AI 影响了我在骰子任务中决定提交什么点数。", "likert"],
  ["e_ai_decided_outcome", "我认为我在骰子任务中作出的点数提交主要由群聊 AI 决定。", "likert"],
  ["f_decision_considerations", "请简要说明：在决定各轮提交什么骰子点数时，你主要考虑了哪些因素？", "text"],
  ["f_design_influences", "任务中是否有任何信息或设计影响了你在各轮中决定提交什么骰子点数？例如其他成员的提交情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有，也请说明。", "text"]
];

const EXPECTED_A2_OPTIONS = [
  "我没有看到其他成员的具体提交内容",
  "其他成员大多如实提交了骰子点数",
  "其他成员大多提交了高于真实骰子点数的数字",
  "其他成员的提交情况混合且不一致",
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

async function createReadySession(server, condition, prolificId) {
  const created = await request(server, "POST", "/api/session", {
    study: "study1",
    condition,
    prolific_id: prolificId
  });
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
      ai_role: "executes",
      reward_direction: "increase"
    }
  });
  const started = await request(server, "POST", `/api/session/${id}/dice/start`);
  return { id, current: started.current };
}

function assertPeerRecords(condition, current) {
  assert(current.true_die_value !== 6, "Common dice sequence must not contain 6");
  assert(current.peer_records.length === 4, "Each round must show four peer records");
  for (const record of current.peer_records) {
    assert(record.trueValue === current.true_die_value, "Peer true value must equal participant common dice value");
    if (condition === "hidden") {
      assert(record.visibility === "hidden", "Hidden peer records must be marked hidden");
      assert(record.reportedValue === null, "Hidden peer reported values must not be visible");
    } else if (condition === "honest") {
      assert(record.reportedValue === current.true_die_value, "Honest peer reports must equal common dice value");
    } else if (condition === "dishonest") {
      assert(record.reportedValue > current.true_die_value, "Dishonest peer reports must be greater than common dice value");
    }
  }
}

async function runAllRounds(server, id, current, condition) {
  let cursor = current;
  const starts = [];
  for (let round = cursor.round_index; round <= 10; round += 1) {
    assert(cursor.round_index === round, `Expected round ${round}`);
    assertPeerRecords(condition, cursor);
    assert(cursor.selection_started_at === null, "Round selection start should be null before presentation is complete");
    const presented = await request(server, "POST", `/api/session/${id}/dice/presented`);
    assert(presented.current.selection_started_at, "Presented round should receive server selection start");
    const repeated = await request(server, "POST", `/api/session/${id}/dice/presented`);
    assert(repeated.current.selection_started_at === presented.current.selection_started_at, "Repeated presented call must not reset selection start");
    cursor = presented.current;
    starts.push(cursor.selection_started_at);
    const reported = Math.min(6, cursor.true_die_value + 1);
    const result = await request(server, "POST", `/api/session/${id}/dice/round`, {
      round_index: round,
      reported_value: reported,
      selection_started_at: "2000-01-01T00:00:00.000Z",
      decision_duration_ms: 0
    });
    assert(result.round.selection_started_at === starts[starts.length - 1], "Server must use stored selection_started_at");
    assert(result.round.decision_duration_ms >= 0, "Server must compute decision duration");
    cursor = result.current;
    if (!cursor.completed) assert(cursor.selection_started_at === null, "Next round selection start should remain null after prior result");
  }
  assert(cursor.completed === true, "Dice task should complete after 10 rounds");
}

function makePostResponses(config) {
  const post = {};
  for (const item of config.study1.postSurveyItems) {
    if (item.type === "text") post[item.id] = "";
    else if (item.type === "select") post[item.id] = item.options[0];
    else post[item.id] = 4;
  }
  return post;
}

function assertPostSurvey(config) {
  assert(config.study1.postSurveyItems.length === EXPECTED_POST_ITEMS.length, "Study 1 post-survey item count changed");
  const sections = [...new Set(config.study1.postSurveyItems.map((item) => item.section))].join("");
  assert(sections === "ABCDEF", "Study 1 post-survey section order must be A-B-C-D-E-F");
  EXPECTED_POST_ITEMS.forEach(([id, prompt, type], index) => {
    const item = config.study1.postSurveyItems[index];
    assert(item.id === id, `Post-survey id mismatch at ${index}`);
    assert(item.prompt === prompt, `Post-survey prompt mismatch for ${id}`);
    assert(item.type === type, `Post-survey type mismatch for ${id}`);
    if (type === "likert") {
      assert(item.minLabel && item.maxLabel, `Likert labels missing for ${id}`);
      if (id === "d_guilt" || id === "d_moral_discomfort") {
        assert(item.minLabel === "完全没有" && item.maxLabel === "非常强烈", `D scale labels wrong for ${id}`);
      } else {
        assert(item.minLabel === "非常不同意" && item.maxLabel === "非常同意", `Likert labels wrong for ${id}`);
      }
    }
  });
  const a2 = config.study1.postSurveyItems.find((item) => item.id === "a_condition_memory");
  assert(JSON.stringify(a2.options) === JSON.stringify(EXPECTED_A2_OPTIONS), "A2 options mismatch");
  const f1 = config.study1.postSurveyItems.find((item) => item.id === "f_decision_considerations");
  const f2 = config.study1.postSurveyItems.find((item) => item.id === "f_design_influences");
  assert(f1.required === false && f2.required === false, "F1/F2 must be optional");
}

function assertConfigDoesNotExposeScripts(config) {
  assert(!config.completion, "Config must not expose completion details");
  assert(!config.study1.fixedDiceSequence, "Config must not expose fixed dice sequence");
  assert(!config.study1.pilotDiceSequences, "Config must not expose old dice sequences");
  assert(!config.study1.peer_records_sequence, "Config must not expose peer script");
  assert(!config.study1.rewardPerPoint, "Config should not expose reward implementation details");
}

function assertTaskRules(config) {
  const rewardRule = config.study1.ruleBlocks.find((block) => block.title === "个人奖励");
  assert(rewardRule, "Personal reward rule block missing");
  assert(rewardRule.body.includes("× ¥0.10"), "Personal reward rule must disclose × ¥0.10");
  const rewardQuestion = config.study1.comprehensionQuestions.find((item) => item.id === "reward_direction");
  assert(rewardQuestion, "reward_direction comprehension question missing");
  assert(rewardQuestion.correctValue === "increase", "reward_direction correct value must be increase");
}

function assertStudy1StaticSource() {
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "js", "app.js"), "utf8");
  assert(!appSource.includes("window.confirm"), "Study 1 must not use window.confirm");
  assert(appSource.includes("/dice/presented"), "Study 1 frontend must call /dice/presented");
  assert(!appSource.includes("chat.messagesEl.appendChild(task)"), "Private/result task cards must not be appended to chat.messagesEl");
}

function testDebugFalseIgnoresUrl() {
  const dataDir = path.join(os.tmpdir(), "group-deception-study1-smoke-debug-false");
  fs.rmSync(dataDir, { recursive: true, force: true });
  const code = `
    process.env.DEBUG_LINKS = "false";
    process.env.DATA_DIR = ${JSON.stringify(dataDir)};
    const http = require("http");
    const app = require(${JSON.stringify(path.join(__dirname, "index.js"))});
    const server = app.listen(0, () => {
      const payload = JSON.stringify({ study: "study1", condition: "dishonest", prolific_id: "debug_false_case" });
      const req = http.request({ method: "POST", hostname: "127.0.0.1", port: server.address().port, path: "/api/session", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } }, (res) => {
        let raw = "";
        res.on("data", (chunk) => raw += chunk);
        res.on("end", () => {
          const body = JSON.parse(raw);
          if (body.session.debug_mode) process.exit(2);
          server.close(() => process.exit(0));
        });
      });
      req.on("error", () => process.exit(4));
      req.write(payload);
      req.end();
    });
  `;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  assert(result.status === 0, `DEBUG_LINKS=false child test failed: ${result.status} ${result.stderr}`);
}

function testConcurrentParticipantCreationAndBlockRandomization() {
  const dataRoot = path.join(os.tmpdir(), `group-deception-study1-concurrency-${process.pid}-${Date.now()}`);
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
          await request(server, { study: "study1", participant_id: "block_s1_" + index, condition: "dishonest" });
        }
        const stateAfterBlock = readState();
        const blockAllocations = stateAfterBlock.allocations.filter((item) => item.study === "study1" && item.participant_id.startsWith("block_s1_"));
        const counts = blockAllocations.reduce((acc, item) => {
          acc[item.condition] = (acc[item.condition] || 0) + 1;
          return acc;
        }, {});
        assert(counts.hidden === 4 && counts.honest === 4 && counts.dishonest === 4, "12 participant block counts mismatch: " + JSON.stringify(counts));

        const participantId = "concurrent_s1_same";
        const [first, second] = await Promise.all([
          request(server, { study: "study1", participant_id: participantId }),
          request(server, { study: "study1", participant_id: participantId })
        ]);
        assert(first.session.id === second.session.id, "Concurrent same participant returned different session IDs");
        const matchingSessions = (await store.listSessions()).filter((session) => session.study === "study1" && session.participant_id === participantId);
        assert(matchingSessions.length === 1, "Concurrent same participant created duplicate sessions: " + matchingSessions.length);
        const stateAfterConcurrent = readState();
        const matchingAllocations = stateAfterConcurrent.allocations.filter((item) => item.study === "study1" && item.participant_id === participantId);
        assert(matchingAllocations.length === 1, "Concurrent same participant created duplicate allocations: " + matchingAllocations.length);
        console.log("Study 1 block randomization counts: hidden=" + counts.hidden + " honest=" + counts.honest + " dishonest=" + counts.dishonest);
        console.log("Study 1 concurrent same participant: session_id=" + first.session.id + " sessions=" + matchingSessions.length + " allocations=" + matchingAllocations.length);
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
    assert(config.debug_links_enabled === true, "Smoke test expects DEBUG_LINKS=true");
    assertConfigDoesNotExposeScripts(config);
    assertPostSurvey(config);
    assertTaskRules(config);
    assertStudy1StaticSource();

    for (const condition of ["hidden", "honest", "dishonest"]) {
      const ready = await createReadySession(server, condition, `smoke_${condition}_${Date.now()}`);
      assertPeerRecords(condition, ready.current);
      const first = await request(server, "GET", `/api/session/${ready.id}/dice/current`);
      const second = await request(server, "GET", `/api/session/${ready.id}/dice/current`);
      assert(first.current.selection_started_at === second.current.selection_started_at, "Refresh must not reset decision start");
      assert(first.current.selection_started_at === null, "Refresh before presentation must keep decision start null");
      assert(JSON.stringify(first.current.peer_records) === JSON.stringify(second.current.peer_records), "Refresh must not regenerate peer script");
      if (condition === "dishonest") {
        const presented = await request(server, "POST", `/api/session/${ready.id}/dice/presented`);
        const firstSubmit = await request(server, "POST", `/api/session/${ready.id}/dice/round`, {
          round_index: 1,
          reported_value: 6
        });
        const duplicate = await request(server, "POST", `/api/session/${ready.id}/dice/round`, {
          round_index: 1,
          reported_value: 5
        });
        assert(duplicate.duplicate === true, "Repeated round submission should be marked duplicate");
        const stored = await store.readSession(ready.id);
        assert(stored.dice_rounds.length === 1, "Repeated round submission must not create a second record");
        assert(stored.dice_rounds[0].selection_started_at === presented.current.selection_started_at, "Server presentation time should be saved on submitted round");
        await runAllRounds(server, ready.id, firstSubmit.current, condition);
      } else {
        await runAllRounds(server, ready.id, ready.current, condition);
      }
    }

    const prolificId = `smoke_complete_${Date.now()}`;
    const ready = await createReadySession(server, "hidden", prolificId);
    await runAllRounds(server, ready.id, ready.current, "hidden");
    const invalidPost = makePostResponses(config);
    invalidPost.a_specific_peer_records_seen = "";
    await request(server, "POST", `/api/session/${ready.id}/post-survey`, { responses: invalidPost }, 400);
    await request(server, "POST", `/api/session/${ready.id}/post-survey`, { responses: makePostResponses(config) });
    await request(server, "POST", `/api/session/${ready.id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    });
    const completed = await request(server, "POST", `/api/session/${ready.id}/complete`);
    assert(completed.session.status === "completed", "Session did not complete");
    assert(completed.session.completion?.completion_code === "SMOKE-STUDY1-COMPLETE", "Completed session should expose completion code");
    assert(completed.session.completion?.completion_redirect_url === "https://example.com/study1-complete", "Completed session should expose completion redirect");
    const resumed = await request(server, "POST", "/api/session", {
      study: "study1",
      condition: "dishonest",
      prolific_id: prolificId
    });
    assert(resumed.session.id === ready.id, "Completed Prolific ID should not receive a new session");
    assert(resumed.session.status === "completed", "Completed Prolific ID should resume completed status");
    assert(resumed.session.completion?.completion_code === "SMOKE-STUDY1-COMPLETE", "Resumed completed session should expose completion code");

    testDebugFalseIgnoresUrl();
    testConcurrentParticipantCreationAndBlockRandomization();
    console.log(`Study 1 smoke test completed for ${ready.id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
