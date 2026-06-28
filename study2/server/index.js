const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VERSION, CONDITIONS, STATUS_ORDER, MEMBERS } = require("../config/common");
const study2 = require("../config/study2-income");
const { buildIncomePeerRecords } = require("../config/peer-records");
const store = require("./store");
const exporters = require("./export");

const app = express();

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (process.env[key] === undefined) process.env[key] = rest.join("=").trim();
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 3001);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";
const DEBUG_LINKS = String(process.env.DEBUG_LINKS).toLowerCase() === "true";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function now() {
  return new Date().toISOString();
}

function statusIndex(status) {
  return STATUS_ORDER.indexOf(status);
}

function addEvent(session, type, data = {}) {
  session.event_log.push({ type, at: now(), ...data });
}

function transition(session, targetStatus) {
  const current = statusIndex(session.status);
  const target = statusIndex(targetStatus);
  if (target < 0) throw new Error(`Unknown status: ${targetStatus}`);
  if (target < current) throw new Error(`Cannot move backward from ${session.status} to ${targetStatus}`);
  if (target > current + 1) throw new Error(`Cannot jump from ${session.status} to ${targetStatus}`);
  if (session.status !== targetStatus) {
    session.status = targetStatus;
    session.stage_timestamps[targetStatus] = now();
    addEvent(session, "status_changed", { status: targetStatus });
  }
}

function publicSession(session) {
  return {
    id: session.id,
    study: "study2",
    condition_label: session.condition_label,
    debug_mode: session.debug_mode,
    status: session.status,
    effort_round_count: session.effort_rounds?.length || 0,
    actual_income: session.actual_income || null,
    actual_income_cents: session.actual_income_cents || null,
    completed_at: session.completed_at || null
  };
}

function centsToMoney(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function formatMoney(cents) {
  return centsToMoney(cents).toFixed(2);
}

function moneyToCents(value) {
  if (typeof value === "number") return Math.round(value * 100);
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error("Invalid money amount");
  const [yuan, fraction = ""] = text.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

function validateCondition(condition) {
  if (!CONDITIONS.includes(condition)) {
    const error = new Error("Invalid condition");
    error.statusCode = 400;
    throw error;
  }
}

async function assignCondition() {
  const sessions = await store.listSessions();
  const counts = Object.fromEntries(CONDITIONS.map((condition) => [condition, 0]));
  for (const session of sessions) {
    if (CONDITIONS.includes(session.condition)) counts[session.condition] += session.status === "completed" ? 1.25 : 1;
  }
  const min = Math.min(...Object.values(counts));
  return CONDITIONS.find((condition) => counts[condition] === min);
}

function makeEffortMaterials() {
  return Array.from({ length: study2.effortTask.rounds }, (_, roundIndex) => ({
    round_index: roundIndex + 1,
    numbers: Array.from({ length: study2.effortTask.numbersPerRound }, () => crypto.randomInt(10, 100)),
    started_at: null,
    submitted_at: null,
    deadline_at: null,
    answers: null,
    correct_count: null,
    duration_ms: null,
    timed_out: false,
    income_cents: null,
    income: null
  }));
}

function calculateRoundIncomeCents(correctCount, durationMs) {
  const base = correctCount * study2.effortTask.incomePerCorrectCents;
  const timeLimitMs = study2.effortTask.timeLimitSeconds * 1000;
  const remainingRatio = Math.max(0, Math.min(1, (timeLimitMs - durationMs) / timeLimitMs));
  const speedBonus = correctCount > 0 ? Math.round(remainingRatio * study2.effortTask.speedBonusMaxCents) : 0;
  return base + speedBonus;
}

function prepareCurrentEffortRound(session) {
  const index = session.effort_rounds.length;
  const material = session.effort_materials[index];
  if (!material) return null;
  if (!material.started_at) {
    const startedAt = new Date();
    material.started_at = startedAt.toISOString();
    material.deadline_at = new Date(startedAt.getTime() + study2.effortTask.timeLimitSeconds * 1000).toISOString();
  }
  return material;
}

async function createSession({ prolificId, requestedCondition }) {
  const normalizedProlific = String(prolificId || "").trim();
  const existing = (await store.listSessions()).find((session) => (
    normalizedProlific &&
    session.prolific_id === normalizedProlific
  ));
  if (existing) return existing;

  let condition;
  if (DEBUG_LINKS && requestedCondition) {
    validateCondition(requestedCondition);
    condition = requestedCondition;
  } else {
    condition = await assignCondition();
  }

  const id = `s2_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const createdAt = now();
  const session = {
    id,
    version: VERSION,
    study: "study2",
    condition,
    condition_label: {
      hidden: "同伴具体行为隐藏",
      honest: "同伴如实申报",
      dishonest: "同伴自利低报"
    }[condition],
    debug_mode: Boolean(DEBUG_LINKS && requestedCondition),
    prolific_id: normalizedProlific,
    status: "created",
    created_at: createdAt,
    assigned_at: createdAt,
    completed_at: null,
    stage_timestamps: { created: createdAt },
    event_log: [],
    baseline: {},
    comprehension_attempts: [],
    effort_materials: makeEffortMaterials(),
    effort_rounds: [],
    effort_summary: null,
    actual_income_cents: null,
    actual_income: null,
    income_viewed_at: null,
    peer_income_records: buildIncomePeerRecords(condition),
    peer_records_view: null,
    income_report: null,
    post_survey: {},
    experience: {},
    demographics: {},
    abnormal_events: []
  };
  addEvent(session, "session_created", { condition, debug_mode: session.debug_mode });
  return store.writeSession(session);
}

function requireAdmin(req, res, next) {
  const token = req.query.token || req.get("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: "Admin token required" });
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get("/api/config", (req, res) => {
  res.json({
    version: VERSION,
    debug_links_enabled: DEBUG_LINKS,
    members: MEMBERS,
    study2
  });
});

app.post("/api/session", asyncHandler(async (req, res) => {
  const session = await createSession({
    prolificId: req.body.prolific_id,
    requestedCondition: req.body.condition
  });
  res.json({ session: publicSession(session) });
}));

app.get("/api/session/:id", asyncHandler(async (req, res) => {
  const session = await store.readSession(req.params.id);
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/consent", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    transition(draft, "consented");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/baseline", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  for (const item of study2.baselineItems) {
    const value = Number(responses[item.id]);
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      return res.status(400).json({ error: `Invalid baseline response: ${item.id}` });
    }
  }
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "consented") throw new Error("Baseline requires consented status");
    draft.baseline = responses;
    addEvent(draft, "baseline_completed");
    transition(draft, "baseline_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/rules-viewed", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "baseline_completed") throw new Error("Rules require baseline_completed status");
    draft.rules_viewed_at = now();
    transition(draft, "rules_viewed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/comprehension", asyncHandler(async (req, res) => {
  const answers = req.body.answers || {};
  const wrong = study2.comprehensionQuestions
    .filter((question) => answers[question.id] !== question.correctValue)
    .map((question) => ({ id: question.id, review: question.review }));
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "rules_viewed") throw new Error("Comprehension requires rules_viewed status");
    const attempt = {
      attempt_index: draft.comprehension_attempts.length + 1,
      answers,
      passed: wrong.length === 0,
      wrong_items: wrong.map((item) => item.id),
      completed_at: now()
    };
    draft.comprehension_attempts.push(attempt);
    addEvent(draft, "comprehension_attempt", { attempt_index: attempt.attempt_index, passed: attempt.passed, wrong_items: attempt.wrong_items });
    if (attempt.passed) transition(draft, "comprehension_passed");
    return draft;
  });
  res.json({ session: publicSession(session), passed: wrong.length === 0, wrong_items: wrong });
}));

app.post("/api/session/:id/effort/start", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (!["comprehension_passed", "effort_in_progress"].includes(draft.status)) throw new Error("Effort task requires comprehension_passed status");
    if (draft.status === "comprehension_passed") transition(draft, "effort_in_progress");
    prepareCurrentEffortRound(draft);
    return draft;
  });
  res.json({ session: publicSession(session), current: currentEffortPayload(session) });
}));

function currentEffortPayload(session) {
  const index = session.effort_rounds.length;
  if (index >= session.effort_materials.length) return { completed: true };
  return {
    completed: false,
    round_index: index + 1,
    total_rounds: session.effort_materials.length,
    numbers: session.effort_materials[index].numbers,
    time_limit_seconds: study2.effortTask.timeLimitSeconds,
    started_at: session.effort_materials[index].started_at,
    deadline_at: session.effort_materials[index].deadline_at
  };
}

app.post("/api/session/:id/effort/round", asyncHandler(async (req, res) => {
  const roundIndex = Number(req.body.round_index);
  const answers = req.body.answers || {};
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "effort_in_progress") throw new Error("Effort round requires effort_in_progress status");
    const expectedRound = draft.effort_rounds.length + 1;
    if (roundIndex !== expectedRound) throw new Error(`Expected effort round ${expectedRound}, received ${roundIndex}`);
    const material = draft.effort_materials[expectedRound - 1];
    if (!material.started_at || !material.deadline_at) throw new Error("Effort round was not started by server");
    const submittedAt = now();
    const rawDurationMs = Math.max(0, new Date(submittedAt) - new Date(material.started_at));
    const durationMs = Math.min(rawDurationMs, study2.effortTask.timeLimitSeconds * 1000);
    const timedOut = new Date(submittedAt) > new Date(material.deadline_at);
    let correctCount = 0;
    material.numbers.forEach((number, index) => {
      const correct = number % 2 === 0 ? "even" : "odd";
      if (answers[String(index)] === correct) correctCount += 1;
    });
    const incomeCents = calculateRoundIncomeCents(correctCount, durationMs);
    const round = {
      round_index: expectedRound,
      numbers: material.numbers,
      answers,
      correct_count: correctCount,
      duration_ms: durationMs,
      timed_out: timedOut,
      income_cents: incomeCents,
      income: centsToMoney(incomeCents),
      started_at: material.started_at,
      deadline_at: material.deadline_at,
      submitted_at: submittedAt
    };
    material.answers = answers;
    material.correct_count = correctCount;
    material.duration_ms = durationMs;
    material.timed_out = timedOut;
    material.income_cents = incomeCents;
    material.income = centsToMoney(incomeCents);
    material.submitted_at = submittedAt;
    draft.effort_rounds.push(round);
    addEvent(draft, "effort_round_submitted", { round_index: expectedRound, correct_count: correctCount, income_cents: incomeCents, income: centsToMoney(incomeCents), timed_out: timedOut });
    if (draft.effort_rounds.length === draft.effort_materials.length) {
      const totalIncomeCents = draft.effort_rounds.reduce((sum, item) => sum + item.income_cents, 0);
      draft.actual_income_cents = totalIncomeCents;
      draft.actual_income = centsToMoney(totalIncomeCents);
      draft.effort_summary = {
        total_correct: draft.effort_rounds.reduce((sum, item) => sum + item.correct_count, 0),
        total_duration_ms: draft.effort_rounds.reduce((sum, item) => sum + item.duration_ms, 0),
        total_income_cents: totalIncomeCents,
        total_income: draft.actual_income
      };
      transition(draft, "effort_completed");
    } else {
      prepareCurrentEffortRound(draft);
    }
    draft._lastRound = round;
    return draft;
  });
  const lastRound = session._lastRound;
  delete session._lastRound;
  await store.writeSession(session);
  res.json({ session: publicSession(session), round: lastRound, current: currentEffortPayload(session) });
}));

app.post("/api/session/:id/income-viewed", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "effort_completed") throw new Error("Income view requires effort_completed status");
    draft.income_viewed_at = now();
    transition(draft, "income_viewed");
    return draft;
  });
  res.json({ session: publicSession(session), actual_income: session.actual_income, actual_income_cents: session.actual_income_cents });
}));

app.get("/api/session/:id/peer-records", asyncHandler(async (req, res) => {
  const session = await store.readSession(req.params.id);
  if (statusIndex(session.status) < statusIndex("income_viewed")) return res.status(409).json({ error: "Peer records require income_viewed status" });
  res.json({ displayed_at: now(), records: session.peer_income_records });
}));

app.post("/api/session/:id/peer-records-viewed", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "income_viewed") throw new Error("Peer records require income_viewed status");
    draft.peer_records_view = {
      displayed_at: req.body.displayed_at || now(),
      continued_at: now(),
      duration_ms: Number(req.body.duration_ms || 0)
    };
    addEvent(draft, "peer_records_viewed", { duration_ms: draft.peer_records_view.duration_ms });
    transition(draft, "peer_records_viewed");
    return draft;
  });
  res.json({ session: publicSession(session), actual_income: session.actual_income, actual_income_cents: session.actual_income_cents });
}));

app.post("/api/session/:id/income-report", asyncHandler(async (req, res) => {
  const reportedCents = req.body.reported_income_cents !== undefined
    ? Number(req.body.reported_income_cents)
    : moneyToCents(req.body.reported_income);
  const startedAt = req.body.selection_started_at || now();
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "peer_records_viewed") throw new Error("Income report requires peer_records_viewed status");
    if (draft.income_report) throw new Error("Income report already submitted");
    if (!Number.isInteger(reportedCents) || reportedCents < 0 || reportedCents > draft.actual_income_cents) throw new Error("Reported income out of range");
    const underreportAmountCents = draft.actual_income_cents - reportedCents;
    const underreportRate = draft.actual_income_cents > 0 ? Number((underreportAmountCents / draft.actual_income_cents).toFixed(4)) : 0;
    const deductionCents = Math.round(study2.effortTask.deductionRate * reportedCents);
    const retainedRewardCents = draft.actual_income_cents - deductionCents;
    const submittedAt = now();
    draft.income_report = {
      actual_income_cents: draft.actual_income_cents,
      actual_income: centsToMoney(draft.actual_income_cents),
      reported_income_cents: reportedCents,
      reported_income: centsToMoney(reportedCents),
      underreport_amount_cents: underreportAmountCents,
      underreport_amount: centsToMoney(underreportAmountCents),
      underreport_rate: underreportRate,
      deduction_rate: study2.effortTask.deductionRate,
      deduction_cents: deductionCents,
      deduction: centsToMoney(deductionCents),
      retained_reward_cents: retainedRewardCents,
      retained_reward: centsToMoney(retainedRewardCents),
      decision_duration_ms: Math.max(0, new Date(submittedAt) - new Date(startedAt)),
      selection_started_at: startedAt,
      submitted_at: submittedAt,
      submission_source: "group_ai_private_panel"
    };
    addEvent(draft, "income_report_submitted", draft.income_report);
    transition(draft, "income_report_completed");
    return draft;
  });
  res.json({
    session: publicSession(session),
    confirmation: "群聊 AI：已按您的选择完成收入申报。",
    income_report: session.income_report
  });
}));

app.post("/api/session/:id/post-survey", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study2.postSurveyItems, responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "income_report_completed") throw new Error("Post-survey requires income_report_completed status");
    draft.post_survey = responses;
    addEvent(draft, "post_survey_completed");
    transition(draft, "post_survey_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/experience", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study2.experienceItems, responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "post_survey_completed") throw new Error("Experience requires post_survey_completed status");
    draft.experience = responses;
    addEvent(draft, "experience_completed");
    transition(draft, "experience_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/demographics", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study2.demographicsItems, responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "experience_completed") throw new Error("Demographics requires experience_completed status");
    draft.demographics = responses;
    addEvent(draft, "demographics_completed");
    transition(draft, "demographics_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

function validateItems(items, responses) {
  const missing = [];
  const invalid = [];
  for (const item of items) {
    const value = responses[item.id];
    if (value === undefined || value === "") {
      missing.push(item.id);
      continue;
    }
    if (item.type === "likert") {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 7) invalid.push(item.id);
    } else if (item.type === "select") {
      if (!item.options.includes(value)) invalid.push(item.id);
    } else if (item.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || (item.min !== undefined && numeric < item.min) || (item.max !== undefined && numeric > item.max)) invalid.push(item.id);
    } else if (item.type === "text") {
      if (typeof value !== "string") invalid.push(item.id);
    }
  }
  if (missing.length || invalid.length) return { error: "Invalid responses", missing, invalid };
  return { ok: true };
}

app.post("/api/session/:id/complete", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "demographics_completed") throw new Error("Completion requires demographics_completed status");
    draft.completed_at = now();
    addEvent(draft, "completed");
    transition(draft, "completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.get("/api/admin/summary", requireAdmin, asyncHandler(async (req, res) => {
  const sessions = await store.listSessions();
  res.json({ version: VERSION, summary: exporters.summary(sessions), data_dir: store.DATA_DIR });
}));

app.get("/api/admin/export/json", requireAdmin, asyncHandler(async (req, res) => {
  res.json({ version: VERSION, sessions: await store.listSessions() });
}));

app.get("/api/admin/export/participants.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.participantsCsv(await store.listSessions()));
}));

app.get("/api/admin/export/study2_effort_rounds.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.effortRoundsCsv(await store.listSessions()));
}));

app.get("/api/admin/export/study2_income_reports.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.incomeReportsCsv(await store.listSessions()));
}));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, req, res, next) => {
  res.status(error.statusCode || 409).json({ error: error.message || "Server error" });
});

if (require.main === module) {
  store.ensureDataDir().then(() => {
    app.listen(PORT, () => {
      console.log(`group-deception-study2 listening on http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
