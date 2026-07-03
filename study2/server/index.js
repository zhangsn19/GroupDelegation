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
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REQUIRE_PARTICIPANT_ID = IS_PRODUCTION || String(process.env.REQUIRE_PARTICIPANT_ID).toLowerCase() === "true";
const STUDY_VERSION = process.env.STUDY_VERSION || "study2-v1.1.0";
const PROTOCOL_VERSION = process.env.PROTOCOL_VERSION || "peer-reporting-v2";
const TEST_CONDITION = String(process.env.TEST_CONDITION || "").trim();
const ASSIGNMENT_MODE = String(process.env.ASSIGNMENT_MODE || "block").trim() || "block";
const ENTRY_CODES = {
  A: { condition: "hidden", value: String(process.env.ENTRY_CODE_HIDDEN || "").trim() },
  B: { condition: "honest", value: String(process.env.ENTRY_CODE_HONEST || "").trim() },
  C: { condition: "dishonest", value: String(process.env.ENTRY_CODE_DISHONEST || "").trim() }
};
const STUDY_CONTACT_EMAIL = String(process.env.STUDY_CONTACT_EMAIL || (IS_PRODUCTION ? "" : "123456@163.com")).trim();
const COMPLETION_CODE = process.env.COMPLETION_CODE || "";
const COMPLETION_REDIRECT_URL = process.env.COMPLETION_REDIRECT_URL || "";

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function now() {
  return new Date().toISOString();
}

function parseParticipantId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 128) {
    const error = new Error("Participant ID too long");
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function validateAssignmentConfig() {
  if (!["block", "controlled_link"].includes(ASSIGNMENT_MODE)) {
    throw new Error("ASSIGNMENT_MODE must be block or controlled_link");
  }
  if (ASSIGNMENT_MODE !== "controlled_link") return;
  const values = Object.values(ENTRY_CODES).map((item) => item.value);
  if (values.some((value) => !value)) {
    throw new Error("controlled_link assignment requires ENTRY_CODE_HIDDEN, ENTRY_CODE_HONEST, and ENTRY_CODE_DISHONEST");
  }
  if (new Set(values).size !== values.length) {
    throw new Error("controlled_link assignment entry codes must be distinct");
  }
}

function resolveEntryAssignment(entry) {
  const code = String(entry || "").trim();
  if (!code) fail(400, "缺少研究入口信息，请通过原始研究链接进入。");
  const match = Object.entries(ENTRY_CODES).find(([, item]) => item.value === code);
  if (!match) fail(400, "研究入口无效，请检查链接后重试。");
  const [entryLinkId, item] = match;
  return { condition: item.condition, entry_link_id: entryLinkId };
}

validateAssignmentConfig();

function publicContactEmail() {
  return STUDY_CONTACT_EMAIL || "123456@163.com";
}

function publicCompletion() {
  return {
    completion_code: COMPLETION_CODE || null,
    completion_redirect_url: COMPLETION_REDIRECT_URL || null
  };
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
  const payload = {
    id: session.id,
    participant_id: session.participant_id || session.prolific_id || "",
    study_version: session.study_version || STUDY_VERSION,
    protocol_version: session.protocol_version || PROTOCOL_VERSION,
    status: session.status,
    effort_round_count: session.effort_rounds?.length || 0,
    effort_rounds: (session.effort_rounds || []).map((round) => ({
      round_index: round.round_index,
      correct_count: round.correct_count,
      base_income_cents: round.base_income_cents ?? null,
      base_income: round.base_income ?? null,
      speed_bonus_cents: round.speed_bonus_cents ?? null,
      speed_bonus: round.speed_bonus ?? null,
      round_actual_income_cents: round.round_actual_income_cents ?? round.income_cents ?? null,
      round_actual_income: round.round_actual_income ?? round.income ?? null
    })),
    actual_income: session.actual_income ?? null,
    actual_income_cents: session.actual_income_cents ?? null,
    completed_at: session.completed_at || null,
    completion_status: session.completion_status || null
  };
  if (session.status === "completed" || session.completion_status === "completed") {
    payload.completion = publicCompletion();
  }
  return payload;
}

function publicComprehensionQuestions(questions) {
  return questions.map(({ id, prompt, options }) => ({ id, prompt, options }));
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

function randomizationDir() {
  return path.dirname(store.DATA_DIR);
}

function randomizationStatePath() {
  return path.join(randomizationDir(), "randomization-state.json");
}

function randomizationLockPath() {
  return path.join(randomizationDir(), "randomization-state.lock");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRandomizationLock(fn) {
  await fs.promises.mkdir(randomizationDir(), { recursive: true });
  const lockPath = randomizationLockPath();
  const started = Date.now();
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, at: now() }));
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > 15000) fs.rmSync(lockPath, { recursive: true, force: true });
      } catch (_) {
        // Retry when another process removes the stale lock.
      }
      if (Date.now() - started > 30000) throw new Error("Randomization lock timeout");
      await sleep(50);
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lockPath, { recursive: true, force: true });
  }
}

function shuffle(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = crypto.randomInt(index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

async function readRandomizationState() {
  try {
    return JSON.parse(await fs.promises.readFile(randomizationStatePath(), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { next_block: 1, current_block: null, allocations: [] };
  }
}

async function writeRandomizationState(state) {
  await fs.promises.mkdir(randomizationDir(), { recursive: true });
  const file = randomizationStatePath();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  await fs.promises.rename(tmp, file);
}

function allocateBlockCondition(state, { participantId, study }) {
  const existing = state.allocations.find((item) => item.participant_id === participantId && item.study === study);
  if (existing) return { allocation: existing, changed: false };
  if (!state.current_block || state.current_block.position >= state.current_block.sequence.length) {
    state.current_block = {
      block: state.next_block,
      position: 0,
      sequence: shuffle(["hidden", "hidden", "honest", "honest", "dishonest", "dishonest"])
    };
    state.next_block += 1;
  }
  const position = state.current_block.position + 1;
  const allocation = {
    participant_id: participantId,
    study,
    condition: state.current_block.sequence[state.current_block.position],
    randomization_block: state.current_block.block,
    randomization_position: position,
    assigned_at: now()
  };
  state.current_block.position += 1;
  state.allocations.push(allocation);
  return { allocation, changed: true };
}

async function assignBlockCondition({ participantId, study }) {
  return withRandomizationLock(async () => {
    const state = await readRandomizationState();
    const { allocation, changed } = allocateBlockCondition(state, { participantId, study });
    if (changed) await writeRandomizationState(state);
    return allocation;
  });
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
    base_income_cents: null,
    base_income: null,
    speed_bonus_cents: null,
    speed_bonus: null,
    round_actual_income_cents: null,
    round_actual_income: null,
    income_cents: null,
    income: null
  }));
}

function calculateRoundIncome(correctCount, durationMs) {
  const baseIncomeCents = correctCount * study2.effortTask.incomePerCorrectCents;
  const timeLimitMs = study2.effortTask.timeLimitSeconds * 1000;
  const remainingRatio = Math.max(0, Math.min(1, (timeLimitMs - durationMs) / timeLimitMs));
  const stepCents = Math.max(1, study2.effortTask.reportStepCents || 1);
  const speedBonusCents = correctCount > 0
    ? Math.round((remainingRatio * study2.effortTask.speedBonusMaxCents) / stepCents) * stepCents
    : 0;
  const roundActualIncomeCents = baseIncomeCents + speedBonusCents;
  return { baseIncomeCents, speedBonusCents, roundActualIncomeCents };
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

async function createSession({ participantId, requestedCondition, entry, lockHeld = false }) {
  const normalizedParticipant = parseParticipantId(participantId);
  if (!normalizedParticipant && REQUIRE_PARTICIPANT_ID) {
    const error = new Error("参与编号缺失。请返回招募平台后通过原始研究链接进入。");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedParticipant && !lockHeld) {
    return withRandomizationLock(async () => {
      return createSession({ participantId: normalizedParticipant, requestedCondition, entry, lockHeld: true });
    });
  }
  let entryAssignment = null;
  const hasEntry = String(entry || "").trim() !== "";
  if (ASSIGNMENT_MODE === "controlled_link") {
    entryAssignment = resolveEntryAssignment(entry);
  } else if (hasEntry) {
    fail(400, "当前研究未启用指定入口分组。");
  }
  const existing = (await store.listSessions()).find((session) => (
    normalizedParticipant &&
    (session.participant_id === normalizedParticipant || session.prolific_id === normalizedParticipant)
  ));
  if (existing) {
    if (ASSIGNMENT_MODE === "controlled_link") {
      if (existing.assignment_source !== "controlled_link" || existing.condition !== entryAssignment.condition) {
        fail(409, "该参与编号已通过另一研究入口进入。请返回原始链接继续完成任务。");
      }
    } else if (existing.assignment_source === "controlled_link") {
      fail(409, "该参与编号已通过另一研究入口进入。请返回原始链接继续完成任务。");
    }
    return existing;
  }

  let condition;
  let allocation = null;
  let assignmentSource = "block";
  let entryLinkId = null;
  const requestedDebugCondition = DEBUG_LINKS && !IS_PRODUCTION ? String(process.env.TEST_CONDITION || "").trim() : "";
  const debugOverride = ASSIGNMENT_MODE === "block" && Boolean(requestedDebugCondition);
  if (ASSIGNMENT_MODE === "controlled_link") {
    condition = entryAssignment.condition;
    assignmentSource = "controlled_link";
    entryLinkId = entryAssignment.entry_link_id;
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  } else if (debugOverride) {
    validateCondition(requestedDebugCondition);
    condition = requestedDebugCondition;
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  } else if (normalizedParticipant) {
    if (lockHeld) {
      const state = await readRandomizationState();
      const result = allocateBlockCondition(state, { participantId: normalizedParticipant, study: "study2" });
      allocation = result.allocation;
      if (result.changed) await writeRandomizationState(state);
    } else {
      allocation = await assignBlockCondition({ participantId: normalizedParticipant, study: "study2" });
    }
    condition = allocation.condition;
  } else {
    condition = await assignCondition();
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  }

  const id = `s2_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const createdAt = now();
  const session = {
    id,
    version: VERSION,
    study_version: STUDY_VERSION,
    protocol_version: PROTOCOL_VERSION,
    study: "study2",
    condition,
    condition_assigned_at: allocation.assigned_at,
    assignment_source: assignmentSource,
    entry_link_id: entryLinkId,
    randomization_block: allocation.randomization_block,
    randomization_position: allocation.randomization_position,
    is_test_session: !IS_PRODUCTION || DEBUG_LINKS,
    condition_label: {
      hidden: "同伴具体行为隐藏",
      honest: "同伴如实申报",
      dishonest: "同伴自利低报"
    }[condition],
    debug_mode: Boolean(debugOverride),
    participant_id: normalizedParticipant,
    prolific_id: normalizedParticipant,
    status: "created",
    created_at: createdAt,
    assigned_at: createdAt,
    completed_at: null,
    completion_status: null,
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
    income_report_selection_started_at: null,
    income_report: null,
    post_survey: {},
    experience: {},
    demographics: {},
    abnormal_events: []
  };
  addEvent(session, "session_created", { condition, debug_mode: session.debug_mode, assignment_source: assignmentSource, entry_link_id: entryLinkId });
  return store.writeSession(session);
}

function requireAdmin(req, res, next) {
  const token = req.get("x-admin-token");
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: "Admin token required" });
  next();
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function filterSessions(sessions, query = {}) {
  const includeTest = String(query.include_test || query.includeTest || "").toLowerCase() === "true";
  const condition = query.condition || "all";
  const start = query.start_date ? new Date(`${query.start_date}T00:00:00.000Z`) : null;
  const end = query.end_date ? new Date(`${query.end_date}T23:59:59.999Z`) : null;
  return sessions.filter((session) => {
    if (!includeTest && session.is_test_session) return false;
    if (condition !== "all" && condition && session.condition !== condition) return false;
    const created = session.created_at ? new Date(session.created_at) : null;
    if (start && created && created < start) return false;
    if (end && created && created > end) return false;
    return true;
  });
}

app.get("/api/config", (req, res) => {
  res.json({
    contact_email: publicContactEmail(),
    members: MEMBERS,
    baselineItems: study2.baselineItems,
    postSurveyItems: study2.postSurveyItems,
    demographicsItems: study2.demographicsItems,
    experienceItems: study2.experienceItems,
    ruleBlocks: study2.ruleBlocks,
    comprehensionQuestions: publicComprehensionQuestions(study2.comprehensionQuestions)
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    study: "study2",
    study_version: STUDY_VERSION,
    protocol_version: PROTOCOL_VERSION
  });
});

app.post("/api/session", asyncHandler(async (req, res) => {
  const session = await createSession({
    participantId: req.body.participant_id || req.body.participantId || req.body.PROLIFIC_PID || req.body.pid || req.body.prolific_id,
    entry: req.body.entry,
    requestedCondition: null
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
  const validation = validateItems(study2.baselineItems, responses);
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
    if (!timedOut) {
      material.numbers.forEach((number, index) => {
        const correct = number % 2 === 0 ? "even" : "odd";
        if (answers[String(index)] === correct) correctCount += 1;
      });
    }
    const incomeParts = timedOut
      ? { baseIncomeCents: 0, speedBonusCents: 0, roundActualIncomeCents: 0 }
      : calculateRoundIncome(correctCount, durationMs);
    const round = {
      round_index: expectedRound,
      numbers: material.numbers,
      answers,
      correct_count: correctCount,
      duration_ms: durationMs,
      timed_out: timedOut,
      base_income_cents: incomeParts.baseIncomeCents,
      base_income: centsToMoney(incomeParts.baseIncomeCents),
      speed_bonus_cents: incomeParts.speedBonusCents,
      speed_bonus: centsToMoney(incomeParts.speedBonusCents),
      round_actual_income_cents: incomeParts.roundActualIncomeCents,
      round_actual_income: centsToMoney(incomeParts.roundActualIncomeCents),
      income_cents: incomeParts.roundActualIncomeCents,
      income: centsToMoney(incomeParts.roundActualIncomeCents),
      started_at: material.started_at,
      deadline_at: material.deadline_at,
      submitted_at: submittedAt
    };
    material.answers = answers;
    material.correct_count = correctCount;
    material.duration_ms = durationMs;
    material.timed_out = timedOut;
    material.base_income_cents = round.base_income_cents;
    material.base_income = round.base_income;
    material.speed_bonus_cents = round.speed_bonus_cents;
    material.speed_bonus = round.speed_bonus;
    material.round_actual_income_cents = round.round_actual_income_cents;
    material.round_actual_income = round.round_actual_income;
    material.income_cents = round.round_actual_income_cents;
    material.income = round.round_actual_income;
    material.submitted_at = submittedAt;
    draft.effort_rounds.push(round);
    addEvent(draft, "effort_round_submitted", {
      round_index: expectedRound,
      correct_count: correctCount,
      base_income_cents: round.base_income_cents,
      base_income: round.base_income,
      speed_bonus_cents: round.speed_bonus_cents,
      speed_bonus: round.speed_bonus,
      round_actual_income_cents: round.round_actual_income_cents,
      round_actual_income: round.round_actual_income,
      income_cents: round.round_actual_income_cents,
      income: round.round_actual_income,
      timed_out: timedOut
    });
    if (draft.effort_rounds.length === draft.effort_materials.length) {
      const totalIncomeCents = draft.effort_rounds.reduce((sum, item) => sum + (item.round_actual_income_cents ?? item.income_cents), 0);
      draft.actual_income_cents = totalIncomeCents;
      draft.actual_income = centsToMoney(totalIncomeCents);
      draft.effort_summary = {
        total_correct: draft.effort_rounds.reduce((sum, item) => sum + item.correct_count, 0),
        total_duration_ms: draft.effort_rounds.reduce((sum, item) => sum + item.duration_ms, 0),
        total_income_cents: totalIncomeCents,
        total_income: draft.actual_income
      };
      transition(draft, "effort_completed");
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
    const continuedAt = now();
    draft.peer_records_view = {
      displayed_at: continuedAt,
      continued_at: continuedAt,
      duration_ms: null
    };
    if (!draft.income_report_selection_started_at) {
      draft.income_report_selection_started_at = continuedAt;
    }
    addEvent(draft, "peer_records_viewed");
    transition(draft, "peer_records_viewed");
    return draft;
  });
  res.json({ session: publicSession(session), actual_income: session.actual_income, actual_income_cents: session.actual_income_cents });
}));

app.post("/api/session/:id/income-report", asyncHandler(async (req, res) => {
  const reportedCents = req.body.reported_income_cents !== undefined
    ? Number(req.body.reported_income_cents)
    : moneyToCents(req.body.reported_income);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "peer_records_viewed") throw new Error("Income report requires peer_records_viewed status");
    if (draft.income_report) throw new Error("Income report already submitted");
    if (!Number.isInteger(reportedCents) || reportedCents < 0 || reportedCents > draft.actual_income_cents) throw new Error("Reported income out of range");
    if (reportedCents % study2.effortTask.reportStepCents !== 0) throw new Error("Reported income out of range");
    const startedAt = draft.income_report_selection_started_at;
    if (!startedAt) throw new Error("Income report selection was not started by server");
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
    session: publicSession(session),    income_report: session.income_report
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
    if (value === undefined || value === "" || value === null) {
      if (item.required !== false) missing.push(item.id);
      continue;
    }
    if (item.type === "likert") {
      const numeric = Number(value);
      const max = item.scalePoints || 7;
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) invalid.push(item.id);
    } else if (item.type === "select") {
      if (!item.options.includes(value)) invalid.push(item.id);
    } else if (item.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || (item.min !== undefined && numeric < item.min) || (item.max !== undefined && numeric > item.max)) invalid.push(item.id);
    } else if (item.type === "text") {
      if (typeof value !== "string") invalid.push(item.id);
    }
  }
  if (missing.length || invalid.length) {
    {
      const field_errors = {};
      if (invalid.includes("age") || missing.includes("age")) field_errors.age = "年龄需填写为 18–100 岁之间的整数。";
      return { message: "请检查以下信息：", error: "请检查以下信息：", missing, invalid, field_errors };
    }
    const field_errors = {};
    if (invalid.includes("age")) field_errors.age = "年龄需填写为 18–100 岁之间的整数。";
    const detail = field_errors.age ? `请检查以下信息：\n${field_errors.age}` : "请检查以下信息：";
    return { error: detail, missing, invalid, field_errors };
  }
  return { ok: true };
}

app.post("/api/session/:id/debrief-viewed", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "demographics_completed") throw new Error("Debrief requires demographics_completed status");
    if (!draft.debrief_viewed_at) {
      draft.debrief_viewed_at = now();
      addEvent(draft, "debrief_viewed");
    }
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/complete", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "demographics_completed") throw new Error("Completion requires demographics_completed status");
    if (!draft.debrief_viewed_at) throw new Error("请先阅读并确认事后说明。");
    draft.completed_at = now();
    draft.completion_status = "completed";
    addEvent(draft, "completed");
    transition(draft, "completed");
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.get("/api/admin/summary", requireAdmin, asyncHandler(async (req, res) => {
  const sessions = filterSessions(await store.listSessions(), req.query);
  res.json({ version: VERSION, summary: exporters.summary(sessions), data_dir: store.DATA_DIR });
}));

app.get("/api/admin/export/json", requireAdmin, asyncHandler(async (req, res) => {
  res.json({ version: VERSION, sessions: filterSessions(await store.listSessions(), req.query) });
}));

app.get("/api/admin/export/participants.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.participantsCsv(filterSessions(await store.listSessions(), req.query)));
}));

app.get("/api/admin/export/study2_effort_rounds.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.effortRoundsCsv(filterSessions(await store.listSessions(), req.query)));
}));

app.get("/api/admin/export/study2_income_reports.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.incomeReportsCsv(filterSessions(await store.listSessions(), req.query)));
}));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((error, req, res, next) => {
  res.status(error.statusCode || 409).json({ error: error.message || "Server error" });
});

async function validateRuntime() {
  if (!IS_PRODUCTION) {
    await store.ensureDataDir();
    return;
  }
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN === "dev-admin-token") {
    throw new Error("ADMIN_TOKEN must be set to a non-development value in production");
  }
  if (!process.env.DATA_DIR) throw new Error("DATA_DIR must be set in production");
  if (!STUDY_CONTACT_EMAIL) throw new Error("STUDY_CONTACT_EMAIL must be set in production");
  if (!path.isAbsolute(process.env.DATA_DIR)) throw new Error("DATA_DIR must be an absolute path in production");
  await store.ensureDataDir();
  const parent = path.dirname(store.DATA_DIR);
  await fs.promises.mkdir(parent, { recursive: true });
  const probe = path.join(parent, `.write-test-${process.pid}-${Date.now()}`);
  await fs.promises.writeFile(probe, "ok", "utf8");
  await fs.promises.unlink(probe);
}

if (require.main === module) {
  validateRuntime().then(() => {
    app.listen(PORT, () => {
      console.log(`group-deception-study2 listening on http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = app;
