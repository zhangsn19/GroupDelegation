const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawnSync } = require("child_process");

process.env.DEBUG_LINKS = "true";
process.env.DATA_DIR = path.join(__dirname, "..", "data", "test-sessions");
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

const app = require("./index");
const store = require("./store");

const EXPECTED_POST_ITEMS = [
  ["a_specific_peer_records_seen", "在我作出自己的最终提交前，我看到了其他成员此前向群聊 AI 提交的具体内容。", "likert"],
  ["a_condition_memory", "根据刚才看到的信息，其他成员此前的提交情况最接近哪一种？", "select"],
  ["a_private_submission_understood", "我理解其他成员无法看到我最终向群聊 AI 提交的骰子点数。", "likert"],
  ["a_independent_reward_understood", "我理解其他成员的提交不会改变我的个人奖励。", "likert"],
  ["a_ai_executes_understood", "我理解在本任务中，群聊 AI 只负责执行提交，不替成员决定应提交什么骰子点数。", "likert"],
  ["b_peer_true_reporting_common", "在这个群聊中，其他成员通常会如实提交自己看到的骰子点数。", "likert"],
  ["b_peer_reward_reporting_common", "在这个群聊中，其他成员通常会为了增加个人奖励而提交高于真实骰子点数的数字。", "likert"],
  ["b_peer_behavior_predictable", "我刚才看到的信息，足以让我判断这个群聊中其他成员通常会如何提交骰子点数。", "likert"],
  ["c_true_reporting_acceptable", "在这个群聊中，其他成员认为如实提交骰子点数是应该的。", "likert"],
  ["c_reward_reporting_acceptable", "在这个群聊中，其他成员认为为了增加个人奖励而提交高于真实骰子点数的数字是可以接受的。", "likert"],
  ["d_guilt", "回顾刚才的骰子任务和我的最终提交，我感到内疚。", "likert"],
  ["d_moral_discomfort", "回顾刚才的骰子任务和我的最终提交，我感到道德上的不安。", "likert"],
  ["e_reflects_my_decision", "我最终提交的骰子点数反映了我自己的决定。", "likert"],
  ["e_personal_responsibility", "我应当为自己最终提交的骰子点数承担责任。", "likert"],
  ["e_ai_followed_choice", "群聊 AI 按照我的选择完成了提交。", "likert"],
  ["e_ai_influenced_decision", "群聊 AI 影响了我最终决定提交什么点数。", "likert"],
  ["e_ai_decided_outcome", "我认为最终提交的骰子点数主要由群聊 AI 决定。", "likert"],
  ["f_decision_considerations", "请简要说明：在决定最终提交什么骰子点数时，你主要考虑了哪些因素？", "text"],
  ["f_design_influences", "任务中是否有任何信息或设计影响了你的决定？例如其他成员的提交情况、群聊 AI 的角色、奖励规则或其他因素。请说明；若没有，也请说明。", "text"]
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
  }
  assert(cursor.completed === true, "Dice task should complete after 10 rounds");
}

function makePostResponses(config) {
  const post = {};
  for (const item of config.study1.postSurveyItems) {
    if (item.type === "text") post[item.id] = "smoke test response";
    else if (item.type === "select") post[item.id] = item.options[0];
    else post[item.id] = 4;
  }
  return post;
}

function assertPostSurvey(config) {
  assert(config.study1.postSurveyItems.length === EXPECTED_POST_ITEMS.length, "Study 1 post-survey item count changed");
  EXPECTED_POST_ITEMS.forEach(([id, prompt, type], index) => {
    const item = config.study1.postSurveyItems[index];
    assert(item.id === id, `Post-survey id mismatch at ${index}`);
    assert(item.prompt === prompt, `Post-survey prompt mismatch for ${id}`);
    assert(item.type === type, `Post-survey type mismatch for ${id}`);
    if (type === "likert") {
      assert(item.minLabel && item.maxLabel, `Likert labels missing for ${id}`);
      if (id === "d_guilt" || id === "d_moral_discomfort") {
        assert(item.minLabel === "完全没有" && item.maxLabel === "非常强烈", `D scale labels wrong for ${id}`);
      }
    }
  });
  const a2 = config.study1.postSurveyItems.find((item) => item.id === "a_condition_memory");
  assert(JSON.stringify(a2.options) === JSON.stringify(EXPECTED_A2_OPTIONS), "A2 options mismatch");
}

function assertConfigDoesNotExposeScripts(config) {
  assert(!config.study1.fixedDiceSequence, "Config must not expose fixed dice sequence");
  assert(!config.study1.pilotDiceSequences, "Config must not expose old dice sequences");
  assert(!config.study1.peer_records_sequence, "Config must not expose peer script");
  assert(!config.study1.rewardPerPoint, "Config should not expose reward implementation details");
}

function testDebugFalseIgnoresUrl() {
  const dataDir = path.join(__dirname, "..", "data", "test-sessions-debug-false");
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
          if (body.session.condition_label === "同伴提交更高数字") process.exit(3);
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

async function main() {
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    assert(config.debug_links_enabled === true, "Smoke test expects DEBUG_LINKS=true");
    assertConfigDoesNotExposeScripts(config);
    assertPostSurvey(config);

    for (const condition of ["hidden", "honest", "dishonest"]) {
      const ready = await createReadySession(server, condition, `smoke_${condition}_${Date.now()}`);
      assertPeerRecords(condition, ready.current);
      const first = await request(server, "GET", `/api/session/${ready.id}/dice/current`);
      const second = await request(server, "GET", `/api/session/${ready.id}/dice/current`);
      assert(first.current.selection_started_at === second.current.selection_started_at, "Refresh must not reset decision start");
      assert(JSON.stringify(first.current.peer_records) === JSON.stringify(second.current.peer_records), "Refresh must not regenerate peer script");
      if (condition === "dishonest") {
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
        await runAllRounds(server, ready.id, firstSubmit.current, condition);
      } else {
        await runAllRounds(server, ready.id, ready.current, condition);
      }
    }

    const prolificId = `smoke_complete_${Date.now()}`;
    const ready = await createReadySession(server, "hidden", prolificId);
    await runAllRounds(server, ready.id, ready.current, "hidden");
    await request(server, "POST", `/api/session/${ready.id}/post-survey`, { responses: makePostResponses(config) });
    await request(server, "POST", `/api/session/${ready.id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    });
    const completed = await request(server, "POST", `/api/session/${ready.id}/complete`);
    assert(completed.session.status === "completed", "Session did not complete");
    const resumed = await request(server, "POST", "/api/session", {
      study: "study1",
      condition: "dishonest",
      prolific_id: prolificId
    });
    assert(resumed.session.id === ready.id, "Completed Prolific ID should not receive a new session");
    assert(resumed.session.status === "completed", "Completed Prolific ID should resume completed status");

    testDebugFalseIgnoresUrl();
    console.log(`Study 1 smoke test completed for ${ready.id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
