const fs = require("fs");
const path = require("path");
const http = require("http");

process.env.DEBUG_LINKS = "true";
process.env.DATA_DIR = path.join(__dirname, "..", "data", "test-sessions");
fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });

const app = require("./index");
const store = require("./store");

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
  }

  await request(server, "POST", `/api/session/${id}/income-viewed`);
  const records = await request(server, "GET", `/api/session/${id}/peer-records`);
  await request(server, "POST", `/api/session/${id}/peer-records-viewed`, {
    displayed_at: records.displayed_at,
    duration_ms: 1000
  });
  return { id, records };
}

function makePostResponses(config) {
  const responses = {};
  for (const item of config.study2.postSurveyItems) {
    if (item.type === "text") responses[item.id] = "smoke response";
    else if (item.type === "select") responses[item.id] = item.options[0];
    else responses[item.id] = 4;
  }
  return responses;
}

async function main() {
  const server = app.listen(0);
  try {
    const config = await request(server, "GET", "/api/config");
    assert(config.debug_links_enabled === true, "Smoke test requires DEBUG_LINKS=true");

    const prolificId = `smoke_s2_${Date.now()}`;
    const { id, records } = await advanceToPeerRecordsViewed(server, "dishonest", prolificId);
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
      selection_started_at: new Date().toISOString()
    });
    assert(reported.income_report.actual_income_cents === 273, "Actual income cents not saved");
    assert(reported.income_report.reported_income_cents === 273, "Exact actual report should be accepted");
    assert(reported.income_report.deduction_cents === 137, "Deduction cents should be rounded from deductionRate");
    assert(reported.income_report.retained_reward_cents === 136, "Retained reward cents mismatch");

    await request(server, "POST", `/api/session/${id}/income-report`, {
      reported_income_cents: 200
    }, 409);

    await request(server, "POST", `/api/session/${id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    }, 409);

    await request(server, "POST", `/api/session/${id}/post-survey`, { responses: makePostResponses(config) });
    await request(server, "POST", `/api/session/${id}/experience`, {
      responses: { income_reporting_familiarity: 4, income_reporting_experience: 4 }
    });
    await request(server, "POST", `/api/session/${id}/demographics`, {
      responses: { age: 30, gender: "不愿回答", education: "本科" }
    });
    const completed = await request(server, "POST", `/api/session/${id}/complete`);
    assert(completed.session.status === "completed", "Session did not complete");

    const resumed = await request(server, "POST", "/api/session", {
      condition: "honest",
      prolific_id: prolificId
    });
    assert(resumed.session.id === id, "Completed Prolific ID should not receive a new session");
    assert(resumed.session.status === "completed", "Completed Prolific ID should resume completion status");

    const honest = await advanceToPeerRecordsViewed(server, "honest", `smoke_s2_honest_${Date.now()}`);
    honest.records.records.forEach((record) => {
      assert(record.actual_income_cents === record.reported_income_cents, "Honest peer record must report actual income");
    });

    const hidden = await advanceToPeerRecordsViewed(server, "hidden", `smoke_s2_hidden_${Date.now()}`);
    hidden.records.records.forEach((record) => {
      assert(record.visibility === "hidden", "Hidden condition should not expose peer values");
      assert(record.actual_income_cents === null && record.reported_income_cents === null, "Hidden peer cents should be null");
    });

    const serverSource = fs.readFileSync(path.join(__dirname, "index.js"), "utf8");
    assert(serverSource.includes('String(process.env.DEBUG_LINKS).toLowerCase() === "true"'), "DEBUG_LINKS must be explicit true only");

    const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");
    assert(!readme.includes("localhost:3000"), "README still references localhost:3000");
    assert(!readme.includes("Study 1"), "README still references Study 1");

    console.log(`Study 2 smoke test completed for ${id}`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
