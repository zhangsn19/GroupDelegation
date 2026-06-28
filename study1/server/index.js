const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VERSION, STUDIES, CONDITIONS, STATUS_ORDER, MEMBERS } = require("../config/common");
const study1 = require("../config/study1-dice");
const study2 = require("../config/study2-income");
const { buildPeerRecordSequence } = require("../config/peer-records");
const store = require("./store");
const exporters = require("./export");

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

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "dev-admin-token";
const DEBUG_LINKS = String(process.env.DEBUG_LINKS).toLowerCase() === "true";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function now() {
  return new Date().toISOString();
}

function publicSession(session) {
  return {
    id: session.id,
    prolific_id: session.prolific_id,
    study: session.study,
    condition_label: session.condition_label,
    debug_mode: session.debug_mode,
    status: session.status,
    dice_round_count: session.dice_rounds?.length || 0,
    dice_total_rounds: session.dice_sequence?.length || 0,
    completed_at: session.completed_at || null
  };
}

function publicStudy1Config() {
  return {
    id: study1.id,
    title: study1.title,
    taskName: study1.taskName,
    baselineItems: study1.baselineItems,
    postSurveyItems: study1.postSurveyItems,
    demographicsItems: study1.demographicsItems,
    ruleBlocks: study1.ruleBlocks,
    comprehensionQuestions: study1.comprehensionQuestions,
    pilotNotice: study1.pilotNotice
  };
}

function addEvent(session, type, data = {}) {
  session.event_log.push({ type, at: now(), ...data });
}

function statusIndex(status) {
  return STATUS_ORDER.indexOf(status);
}

function transition(session, targetStatus) {
  const current = statusIndex(session.status);
  const target = statusIndex(targetStatus);
  if (target < 0) throw new Error(`Unknown status: ${targetStatus}`);
  if (current >= 0 && target < current) throw new Error(`Cannot move backward from ${session.status} to ${targetStatus}`);
  if (current >= 0 && target > current + 1 && session.status !== targetStatus) {
    throw new Error(`Cannot jump from ${session.status} to ${targetStatus}`);
  }
  if (session.status !== targetStatus) {
    session.status = targetStatus;
    session.stage_timestamps[targetStatus] = now();
    addEvent(session, "status_changed", { status: targetStatus });
  }
}

function validateStudy(study) {
  if (!STUDIES.includes(study)) {
    const error = new Error("Invalid study");
    error.statusCode = 400;
    throw error;
  }
}

function validateCondition(condition) {
  if (!CONDITIONS.includes(condition)) {
    const error = new Error("Invalid condition");
    error.statusCode = 400;
    throw error;
  }
}

async function assignCondition(study) {
  const sessions = (await store.listSessions()).filter((session) => session.study === study && CONDITIONS.includes(session.condition));
  const counts = Object.fromEntries(CONDITIONS.map((condition) => [condition, 0]));
  for (const session of sessions) {
    counts[session.condition] += session.status === "completed" ? 1.25 : 1;
  }
  const min = Math.min(...Object.values(counts));
  return CONDITIONS.find((condition) => counts[condition] === min);
}

async function createSession({ study, prolificId, requestedCondition }) {
  validateStudy(study);
  const normalizedProlific = String(prolificId || "").trim();
  const existing = (await store.listSessions()).find((session) => (
    normalizedProlific &&
    session.prolific_id === normalizedProlific &&
    session.study === study
  ));
  if (existing) return existing;

  let condition;
  if (DEBUG_LINKS && requestedCondition) {
    validateCondition(requestedCondition);
    condition = requestedCondition;
  } else {
    condition = await assignCondition(study);
  }

  const id = `s_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const createdAt = now();
  const diceSequence = study === "study1" ? [...study1.fixedDiceSequence] : [];
  const session = {
    id,
    version: VERSION,
    study,
    condition,
    condition_label: {
      hidden: "同伴具体提交隐藏",
      honest: "同伴如实提交",
      dishonest: "同伴提交更高数字"
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
    peer_records_sequence: study === "study1" ? buildPeerRecordSequence(condition, diceSequence) : [],
    dice_sequence: diceSequence,
    dice_round_state: {},
    dice_rounds: [],
    post_survey: {},
    demographics: {},
    abnormal_events: []
  };
  addEvent(session, "session_created", { study, condition, debug_mode: session.debug_mode });
  return store.writeSession(session);
}

function prepareCurrentDiceRound(session) {
  const index = session.dice_rounds.length;
  if (index >= session.dice_sequence.length) return null;
  const roundIndex = index + 1;
  session.dice_round_state ||= {};
  const key = String(roundIndex);
  if (!session.dice_round_state[key]) {
    session.dice_round_state[key] = {
      round_index: roundIndex,
      selection_started_at: now()
    };
    addEvent(session, "dice_round_presented", { round_index: roundIndex });
  }
  return session.dice_round_state[key];
}

function currentDicePayload(session) {
  const index = session.dice_rounds.length;
  if (index >= session.dice_sequence.length) return { completed: true };
  const roundIndex = index + 1;
  const state = session.dice_round_state?.[String(roundIndex)];
  return {
    completed: false,
    round_index: roundIndex,
    total_rounds: session.dice_sequence.length,
    true_die_value: session.dice_sequence[index],
    peer_records: session.peer_records_sequence?.[index] || [],
    selection_started_at: state?.selection_started_at || null
  };
}

function validateItems(items, responses) {
  const missing = [];
  const invalid = [];
  for (const item of items) {
    const value = responses[item.id];
    if (value === undefined || value === "") {
      missing.push(item.id);
      continue;
    }
    if (item.type === "likert" || !item.type) {
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > 7) invalid.push(item.id);
    } else if (item.type === "select") {
      if (!item.options.includes(value)) invalid.push(item.id);
    } else if (item.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || (item.min !== undefined && numeric < item.min) || (item.max !== undefined && numeric > item.max)) invalid.push(item.id);
    } else if (item.type === "text") {
      if (typeof value !== "string" || !value.trim()) invalid.push(item.id);
    }
  }
  if (missing.length || invalid.length) return { error: "Invalid responses", missing, invalid };
  return { ok: true };
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
    study1: publicStudy1Config(),
    study2: { id: "study2", title: study2.title || "Study 2", message: "Study 2 is maintained separately." }
  });
});

app.post("/api/session", asyncHandler(async (req, res) => {
  const session = await createSession({
    study: req.body.study || "study1",
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
    if (draft.status !== "created") return draft;
    transition(draft, "consented");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/baseline", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study1.baselineItems, responses);
  if (validation.error) return res.status(400).json(validation);
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
  const missing = study1.comprehensionQuestions.filter((question) => !answers[question.id]);
  if (missing.length) return res.status(400).json({ error: "All comprehension questions must be answered" });
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "rules_viewed") throw new Error("Comprehension requires rules_viewed status");
    const wrong = study1.comprehensionQuestions
      .filter((question) => answers[question.id] !== question.correctValue)
      .map((question) => ({ id: question.id, review: question.review }));
    const attempt = {
      attempt_index: draft.comprehension_attempts.length + 1,
      answers,
      passed: wrong.length === 0,
      wrong_items: wrong.map((item) => item.id),
      completed_at: now()
    };
    draft.comprehension_attempts.push(attempt);
    addEvent(draft, "comprehension_attempt", {
      attempt_index: attempt.attempt_index,
      passed: attempt.passed,
      wrong_items: attempt.wrong_items
    });
    if (attempt.passed) transition(draft, "comprehension_passed");
    draft._wrongFeedback = wrong;
    return draft;
  });
  const wrongFeedback = session._wrongFeedback || [];
  delete session._wrongFeedback;
  await store.writeSession(session);
  res.json({
    session: publicSession(session),
    passed: wrongFeedback.length === 0,
    wrong_items: wrongFeedback
  });
}));

app.post("/api/session/:id/dice/start", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (!["comprehension_passed", "task_in_progress"].includes(draft.status)) {
      throw new Error("Dice task requires comprehension_passed status");
    }
    if (draft.status === "comprehension_passed") transition(draft, "task_in_progress");
    prepareCurrentDiceRound(draft);
    return draft;
  });
  res.json({ session: publicSession(session), current: currentDicePayload(session) });
}));

app.get("/api/session/:id/dice/current", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (!["task_in_progress", "task_completed"].includes(draft.status)) {
      throw new Error("Dice task has not started");
    }
    if (draft.status === "task_in_progress") prepareCurrentDiceRound(draft);
    return draft;
  });
  res.json({ session: publicSession(session), current: currentDicePayload(session) });
}));

app.post("/api/session/:id/dice/round", asyncHandler(async (req, res) => {
  const reported = Number(req.body.reported_value);
  const roundIndex = Number(req.body.round_index);
  if (!Number.isInteger(reported) || reported < 1 || reported > 6) {
    return res.status(400).json({ error: "Reported value must be an integer from 1 to 6" });
  }
  const session = await store.updateSession(req.params.id, (draft) => {
    const submittedRound = (draft.dice_rounds || []).find((round) => Number(round.round_index) === roundIndex);
    if (submittedRound) {
      draft._lastRound = submittedRound;
      draft._duplicateRound = true;
      return draft;
    }
    if (draft.status !== "task_in_progress") throw new Error("Dice round requires task_in_progress status");
    const expectedRound = draft.dice_rounds.length + 1;
    if (roundIndex !== expectedRound) throw new Error(`Expected round ${expectedRound}, received ${roundIndex}`);
    const trueValue = draft.dice_sequence[expectedRound - 1];
    const roundState = draft.dice_round_state?.[String(expectedRound)];
    if (!roundState?.selection_started_at) throw new Error("Dice round was not presented by server");
    const priorReward = draft.dice_rounds.reduce((sum, round) => sum + Number(round.personal_reward), 0);
    const personalReward = Number((reported * study1.rewardPerPoint).toFixed(2));
    const submittedAt = now();
    const startedAt = roundState.selection_started_at;
    const round = {
      round_index: expectedRound,
      true_die_value: trueValue,
      peer_records: draft.peer_records_sequence?.[expectedRound - 1] || [],
      reported_value: reported,
      upward_misreport: reported > trueValue,
      misreport_magnitude: reported - trueValue,
      personal_reward: personalReward,
      cumulative_reward: Number((priorReward + personalReward).toFixed(2)),
      selection_started_at: startedAt,
      submitted_at: submittedAt,
      decision_duration_ms: Math.max(0, new Date(submittedAt) - new Date(startedAt)),
      submission_source: "group_ai_private_panel"
    };
    draft.dice_rounds.push(round);
    addEvent(draft, "dice_round_submitted", { round_index: expectedRound });
    if (draft.dice_rounds.length === draft.dice_sequence.length) {
      transition(draft, "task_completed");
    } else {
      prepareCurrentDiceRound(draft);
    }
    draft._lastRound = round;
    return draft;
  });
  const lastRound = session._lastRound;
  const duplicate = Boolean(session._duplicateRound);
  delete session._lastRound;
  delete session._duplicateRound;
  await store.writeSession(session);
  res.json({
    session: publicSession(session),
    duplicate,
    confirmation: "群聊 AI：已按您的选择完成提交。",
    round: lastRound,
    current: currentDicePayload(session)
  });
}));

app.post("/api/session/:id/post-survey", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study1.postSurveyItems, responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "task_completed") throw new Error("Post-survey requires task_completed status");
    draft.post_survey = responses;
    addEvent(draft, "post_survey_completed");
    transition(draft, "post_survey_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/demographics", asyncHandler(async (req, res) => {
  const responses = req.body.responses || {};
  const validation = validateItems(study1.demographicsItems, responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "post_survey_completed") throw new Error("Demographics requires post_survey_completed status");
    draft.demographics = responses;
    addEvent(draft, "demographics_completed");
    transition(draft, "demographics_completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

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

app.get("/api/admin/export/study1_dice_rounds.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.study1DiceRoundsCsv(await store.listSessions()));
}));

app.get("/api/admin/export/study2_effort_rounds.csv", requireAdmin, (req, res) => {
  res.type("text/csv").send(exporters.emptyCsv(["session_id", "condition", "round_index", "correct_count", "duration_ms", "income"]));
});

app.get("/api/admin/export/study2_income_reports.csv", requireAdmin, (req, res) => {
  res.type("text/csv").send(exporters.emptyCsv(["session_id", "condition", "actual_income", "reported_income", "underreport_amount", "underreport_ratio", "decision_duration_ms"]));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, req, res, next) => {
  const status = error.statusCode || 409;
  res.status(status).json({ error: error.message || "Server error" });
});

if (require.main === module) {
  store.ensureDataDir().then(() => {
    app.listen(PORT, () => {
      console.log(`group-deception-v2 listening on http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
