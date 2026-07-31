const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VERSION, CONDITIONS, STATUS_ORDER, MEMBERS } = require("../config/common");
const study2 = require("../config/study2-income");
const exporters = require("./export");
const prolificExport = require("./prolific-export");
const { createProlificSupport } = require("./prolific");

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

const store = require("./store");
const app = express();

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
const PARTICIPANT_ID_POLICY = String(process.env.PARTICIPANT_ID_POLICY || "open").trim().toLowerCase() || "open";
const PARTICIPANT_ID_ALLOWLIST_FILE = String(process.env.PARTICIPANT_ID_ALLOWLIST_FILE || "").trim();
const PARTICIPANT_ID_PATTERN = /^GD-S2-[A-Z0-9]{6}$/;
const STUDY_CONTACT_EMAIL = String(process.env.STUDY_CONTACT_EMAIL || (IS_PRODUCTION ? "" : "123456@163.com")).trim();
const COMPLETION_CODE = process.env.COMPLETION_CODE || "";
const COMPLETION_REDIRECT_URL = process.env.COMPLETION_REDIRECT_URL || "";
const STIMULUS_VERSION = "randomized-stimuli-v1";
const STUDY2_MAX_TOTAL_INCOME_CENTS = 2960;
const STUDY2_PEER_PROFILE_OFFSETS = {
  P1: [-250, -100, 100, 250],
  P2: [-200, -150, 150, 200],
  P3: [-240, -60, 60, 240],
  P4: [-180, -120, 120, 180],
  P5: [-220, -80, 80, 220],
  P6: [-160, -140, 140, 160]
};

app.use(express.json({ limit: "1mb" }));
app.get(["/", "/index.html"], (req, res, next) => {
  if (ASSIGNMENT_MODE !== "prolific_taskflow") return next();
  res.sendFile(path.join(__dirname, "..", "public", "en", "index.html"));
});
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

let participantAllowlist = null;

function loadParticipantAllowlist(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  } catch (error) {
    throw new Error("PARTICIPANT_ID_ALLOWLIST_FILE must point to a readable JSON file");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("PARTICIPANT_ID_ALLOWLIST_FILE must contain a JSON array");
  }
  const map = new Map();
  for (const item of parsed) {
    const participantId = String(item?.participant_id || "").trim();
    const entryLinkId = String(item?.entry_link_id || "").trim();
    if (!PARTICIPANT_ID_PATTERN.test(participantId) || !Object.prototype.hasOwnProperty.call(ENTRY_CODES, entryLinkId)) {
      throw new Error("PARTICIPANT_ID_ALLOWLIST_FILE contains an invalid participant_id or entry_link_id");
    }
    if (map.has(participantId)) {
      throw new Error("PARTICIPANT_ID_ALLOWLIST_FILE contains duplicate participant_id values");
    }
    map.set(participantId, entryLinkId);
  }
  return map;
}

function validateAssignmentConfig() {
  if (!["block", "controlled_link", "prolific_taskflow"].includes(ASSIGNMENT_MODE)) {
    throw new Error("ASSIGNMENT_MODE must be block, controlled_link, or prolific_taskflow");
  }
  if (!["open", "allowlist"].includes(PARTICIPANT_ID_POLICY)) {
    throw new Error("PARTICIPANT_ID_POLICY must be open or allowlist");
  }
  if (PARTICIPANT_ID_POLICY === "allowlist") {
    if (ASSIGNMENT_MODE !== "controlled_link") {
      throw new Error("PARTICIPANT_ID_POLICY=allowlist requires ASSIGNMENT_MODE=controlled_link");
    }
    if (!PARTICIPANT_ID_ALLOWLIST_FILE) {
      throw new Error("PARTICIPANT_ID_ALLOWLIST_FILE is required when PARTICIPANT_ID_POLICY=allowlist");
    }
    participantAllowlist = loadParticipantAllowlist(PARTICIPANT_ID_ALLOWLIST_FILE);
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

function validateParticipantIdPolicy(participantId, entryAssignment) {
  if (PARTICIPANT_ID_POLICY !== "allowlist") return;
  if (!participantId) fail(400, "\u53c2\u4e0e\u7f16\u53f7\u7f3a\u5931\u3002\u8bf7\u8fd4\u56de\u62db\u52df\u5e73\u53f0\u540e\u901a\u8fc7\u539f\u59cb\u7814\u7a76\u94fe\u63a5\u8fdb\u5165\u3002");
  if (!PARTICIPANT_ID_PATTERN.test(participantId)) fail(400, "\u53c2\u4e0e\u7f16\u53f7\u683c\u5f0f\u65e0\u6548\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002");
  const allowedEntryLinkId = participantAllowlist?.get(participantId);
  if (!allowedEntryLinkId) fail(403, "\u8be5\u53c2\u4e0e\u7f16\u53f7\u4e0d\u662f\u6709\u6548\u7684\u7814\u7a76\u53c2\u4e0e\u7f16\u53f7\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002");
  if (allowedEntryLinkId !== entryAssignment.entry_link_id) fail(403, "\u8be5\u53c2\u4e0e\u7f16\u53f7\u4e0e\u5f53\u524d\u7814\u7a76\u5165\u53e3\u4e0d\u5339\u914d\u3002\u8bf7\u4f7f\u7528\u7814\u7a76\u56e2\u961f\u53d1\u653e\u7684\u539f\u59cb\u94fe\u63a5\u3002");
}

validateAssignmentConfig();

const prolificSupport = createProlificSupport({
  assignmentMode: ASSIGNMENT_MODE,
  isProduction: IS_PRODUCTION,
  allowedConditions: CONDITIONS,
  expectedVariantCount: 3
});

function publicContactEmail() {
  return STUDY_CONTACT_EMAIL || "123456@163.com";
}

function publicCompletion(session = {}) {
  if (session.assignment_mode === "prolific_taskflow") {
    return {
      completion_code: null,
      completion_redirect_url: prolificSupport.completionUrl || null
    };
  }
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

function normalizeProlificTracking(session) {
  if (session.assignment_mode !== "prolific_taskflow") return session;
  const primary = session.primary_prolific_session_id || session.prolific_session_id;
  const current = session.current_prolific_session_id || session.prolific_session_id || primary;
  session.primary_prolific_session_id = primary;
  session.current_prolific_session_id = current;
  session.prolific_session_aliases = [...new Set([
    primary,
    current,
    ...(Array.isArray(session.prolific_session_aliases) ? session.prolific_session_aliases : [])
  ].filter(Boolean))];
  session.resume_count = Number(session.resume_count || 0);
  session.resume_events = Array.isArray(session.resume_events) ? session.resume_events : [];
  session.is_preview = Boolean(session.is_preview);
  session.preview_source = session.is_preview ? (session.preview_source || "prolific_preview") : null;
  return session;
}

async function resumeProlificSession(match, identity) {
  return store.updateSession(match.session.id, (draft) => {
    normalizeProlificTracking(draft);
    if (match.action === "resume_new_submission") {
      const resumedAt = now();
      if (!draft.prolific_session_aliases.includes(identity.prolific_session_id)) {
        draft.prolific_session_aliases.push(identity.prolific_session_id);
      }
      draft.current_prolific_session_id = identity.prolific_session_id;
      draft.resume_count += 1;
      draft.last_resumed_at = resumedAt;
      const event = { at: resumedAt, prolific_session_id: identity.prolific_session_id, previous_status: draft.status };
      draft.resume_events.push(event);
      addEvent(draft, "prolific_session_resumed", event);
    }
    return draft;
  });
}

function mergeDecisionTiming(target, payload = {}) {
  target.segments = Array.isArray(target.segments) ? target.segments : [];
  const segmentId = String(payload.decision_segment_id || `legacy-${Date.now()}`).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(segmentId)) throw new Error("Invalid decision timing segment");
  const activeMs = Math.max(0, Math.min(86400000, Math.round(Number(payload.decision_segment_active_ms ?? payload.decision_time_ms ?? 0))));
  const hiddenMs = Math.max(0, Math.min(activeMs, Math.round(Number(payload.decision_segment_hidden_ms ?? payload.page_hidden_duration_ms ?? 0))));
  let segment = target.segments.find((item) => item.segment_id === segmentId);
  if (!segment) {
    segment = { segment_id: segmentId, active_duration_ms: 0, page_hidden_duration_ms: 0 };
    target.segments.push(segment);
  }
  segment.active_duration_ms = Math.max(segment.active_duration_ms, activeMs);
  segment.page_hidden_duration_ms = Math.max(segment.page_hidden_duration_ms, hiddenMs);
  segment.updated_at = now();
  target.accumulated_active_ms = target.segments.reduce((sum, item) => sum + item.active_duration_ms, 0);
  target.accumulated_hidden_ms = target.segments.reduce((sum, item) => sum + item.page_hidden_duration_ms, 0);
  return target;
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
    completion_status: session.completion_status || null,
    completion_ready_at: session.completion_ready_at || null,
    completion_redirect_initiated_at: session.completion_redirect_initiated_at || null,
    assignment_mode: session.assignment_mode || ASSIGNMENT_MODE,
    locale: session.locale || "zh-CN",
    income_report_selection_started_at: session.income_report_selection_started_at || null,
    decision_timing_accumulated_ms: session.income_report_decision_timing?.accumulated_active_ms || 0,
    page_hidden_duration_accumulated_ms: session.income_report_decision_timing?.accumulated_hidden_ms || 0,
    decision_timing_segment_count: session.income_report_decision_timing?.segments?.length || 0
  };
  if (session.status === "completed" || session.completion_status === "completed") {
    payload.completion = publicCompletion(session);
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

function parseReportedIncomeCents(body) {
  const message = "\u8bf7\u8f93\u5165\u4e0d\u5c0f\u4e8e 0 \u7684\u91d1\u989d\uff0c\u6700\u591a\u4fdd\u7559\u4e24\u4f4d\u5c0f\u6570\u3002";
  if (body.reported_income !== undefined) {
    const text = String(body.reported_income ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) fail(400, message);
    const [yuan, fraction = ""] = text.split(".");
    const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents < 0) fail(400, message);
    return cents;
  }
  if (body.reported_income_cents !== undefined) {
    const cents = Number(body.reported_income_cents);
    if (!Number.isInteger(cents) || cents < 0) fail(400, message);
    return cents;
  }
  fail(400, message);
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

function createStimulusSeed() {
  return crypto.randomBytes(16).toString("hex");
}

function createSeededRandom(seed, namespace = "") {
  let counter = 0;
  return () => {
    const hash = crypto
      .createHash("sha256")
      .update(`${seed}:${namespace}:${counter}`)
      .digest();
    counter += 1;
    return hash.readUInt32BE(0) / 0x100000000;
  };
}

function seededShuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function peerNames() {
  return MEMBERS.filter((member) => !["participant", "group_ai"].includes(member.id)).map((member) => member.name);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createStudy2StimulusPlan(seed) {
  const profileIds = Object.keys(STUDY2_PEER_PROFILE_OFFSETS);
  const profileIndex = Math.floor(createSeededRandom(seed, "study2-profile")() * profileIds.length);
  return {
    peerDisplayOrder: seededShuffle(peerNames(), createSeededRandom(seed, "study2-peer-display-order")),
    peerProfileId: profileIds[profileIndex]
  };
}

function study2HiddenText() {
  return "\u5df2\u5b8c\u6210\u6b64\u524d\u6536\u5165\u7533\u62a5\u3002\u5f53\u524d\u4fe1\u606f\u8bbe\u7f6e\u4e0b\uff0c\u5b9e\u9645\u6536\u5165\u548c\u7533\u62a5\u5185\u5bb9\u4e0d\u53ef\u89c1\u3002";
}

function study2VisibleText(actualIncomeCents, reportedIncomeCents) {
  return `\u5b9e\u9645\u6536\u5165 \u00a5${formatMoney(actualIncomeCents)}\uff1b\u5df2\u7533\u62a5\u6536\u5165 \u00a5${formatMoney(reportedIncomeCents)}\u3002`;
}

function buildStudy2PeerIncomeRecords(session) {
  const profileId = session.study2_peer_profile_id || "P1";
  const offsets = STUDY2_PEER_PROFILE_OFFSETS[profileId] || STUDY2_PEER_PROFILE_OFFSETS.P1;
  const baseCents = clamp(Number(session.actual_income_cents || 0), 500, 2710);
  const shuffledActuals = seededShuffle(
    offsets.map((offset) => clamp(baseCents + offset, 250, STUDY2_MAX_TOTAL_INCOME_CENTS)),
    createSeededRandom(session.stimulus_seed || session.id, "study2-peer-income-name-mapping")
  );
  const names = peerNames();
  const displayOrder = session.study2_peer_display_order || names;
  const byName = new Map(names.map((name, index) => {
    const actualIncomeCents = shuffledActuals[index];
    const reportedIncomeCents = session.condition === "dishonest"
      ? Math.max(0, Math.round(actualIncomeCents * 0.5))
      : actualIncomeCents;
    return [name, {
      peer_name: name,
      name,
      actual_income_cents: actualIncomeCents,
      actual_income: centsToMoney(actualIncomeCents),
      actualIncome: centsToMoney(actualIncomeCents),
      reported_income_cents: reportedIncomeCents,
      reported_income: centsToMoney(reportedIncomeCents),
      reportedIncome: centsToMoney(reportedIncomeCents),
      visibility: session.condition === "hidden" ? "hidden" : "visible"
    }];
  }));
  return displayOrder.map((name, index) => {
    const record = byName.get(name);
    return {
      ...record,
      display_position: index + 1,
      text: session.condition === "hidden"
        ? study2HiddenText()
        : study2VisibleText(record.actual_income_cents, record.reported_income_cents)
    };
  });
}

function ensureStudy2PeerIncomeRecords(session) {
  if (Array.isArray(session.study2_peer_income_records) && session.study2_peer_income_records.length) {
    session.peer_income_records = session.study2_peer_income_records;
    return;
  }
  if (Array.isArray(session.peer_income_records) && session.peer_income_records.length) {
    session.study2_peer_income_records = session.peer_income_records;
    return;
  }
  if (session.actual_income_cents === null || session.actual_income_cents === undefined) return;
  const records = buildStudy2PeerIncomeRecords(session);
  session.study2_peer_profile_base_cents = clamp(Number(session.actual_income_cents || 0), 500, 2710);
  session.study2_peer_income_records = records;
  session.peer_income_records = records;
}

function publicPeerIncomeRecords(session) {
  const records = session.study2_peer_income_records || session.peer_income_records || [];
  const publicRecords = session.condition !== "hidden"
    ? records
    : records.map((record) => ({
      name: record.name || record.peer_name,
      peer_name: record.peer_name || record.name,
      actual_income_cents: null,
      actualIncome: null,
      reported_income_cents: null,
      reportedIncome: null,
      visibility: "hidden",
      display_position: record.display_position,
      text: study2HiddenText()
    }));
  if (session.locale !== "en") return publicRecords;
  const englishNames = { "张明": "Alex", "李华": "Jordan", "王芳": "Taylor", "陈思": "Morgan" };
  return publicRecords.map((record) => {
    const name = englishNames[record.name || record.peer_name] || record.name || record.peer_name;
    return {
      ...record,
      name,
      peer_name: name,
      text: record.visibility === "hidden"
        ? "A previous income report was completed. The actual income and reported amount are not visible under the current information setting."
        : `Actual income ¥${formatMoney(record.actual_income_cents)}; reported income ¥${formatMoney(record.reported_income_cents)}.`
    };
  });
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

function makeEffortMaterials(seed) {
  const random = createSeededRandom(seed, "study2-effort-materials");
  return Array.from({ length: study2.effortTask.rounds }, (_, roundIndex) => ({
    round_index: roundIndex + 1,
    numbers: Array.from({ length: study2.effortTask.numbersPerRound }, () => 10 + Math.floor(random() * 90)),
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

async function createSession({ participantId, requestedCondition, entry, lockHeld = false, prolificIdentity = null }) {
  const normalizedParticipant = prolificIdentity?.prolific_pid || parseParticipantId(participantId);
  if (!normalizedParticipant && REQUIRE_PARTICIPANT_ID) {
    const error = new Error("参与编号缺失。请返回招募平台后通过原始研究链接进入。");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedParticipant && !lockHeld) {
    return withRandomizationLock(async () => {
      return createSession({
        participantId: normalizedParticipant,
        requestedCondition,
        entry,
        lockHeld: true,
        prolificIdentity
      });
    });
  }
  if (prolificIdentity) {
    const existingProlific = prolificSupport.findExisting(await store.listSessions(), prolificIdentity);
    if (existingProlific) return resumeProlificSession(existingProlific, prolificIdentity);
  }
  let entryAssignment = null;
  const hasEntry = String(entry || "").trim() !== "";
  if (prolificIdentity) {
    if (ASSIGNMENT_MODE !== "prolific_taskflow") fail(404, "Prolific Taskflow entry is not enabled.");
  } else if (ASSIGNMENT_MODE === "controlled_link") {
    entryAssignment = resolveEntryAssignment(entry);
  } else if (hasEntry) {
    fail(400, "当前研究未启用指定入口分组。");
  }
  if (!prolificIdentity) validateParticipantIdPolicy(normalizedParticipant, entryAssignment);
  const existing = prolificIdentity ? null : (await store.listSessions()).find((session) => (
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
  if (prolificIdentity) {
    condition = prolificIdentity.condition;
    assignmentSource = "prolific_taskflow";
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  } else if (ASSIGNMENT_MODE === "controlled_link") {
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
  const stimulusSeed = createStimulusSeed();
  const study2StimulusPlan = createStudy2StimulusPlan(stimulusSeed);
  const session = {
    id,
    version: VERSION,
    study_version: STUDY_VERSION,
    protocol_version: PROTOCOL_VERSION,
    stimulus_version: STIMULUS_VERSION,
    stimulus_seed: stimulusSeed,
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
    prolific_pid: prolificIdentity?.prolific_pid || null,
    prolific_study_id: prolificIdentity?.prolific_study_id || null,
    prolific_session_id: prolificIdentity?.prolific_session_id || null,
    primary_prolific_session_id: prolificIdentity?.prolific_session_id || null,
    current_prolific_session_id: prolificIdentity?.prolific_session_id || null,
    prolific_session_aliases: prolificIdentity ? [prolificIdentity.prolific_session_id] : [],
    resume_count: 0,
    last_resumed_at: null,
    resume_events: [],
    is_preview: Boolean(prolificIdentity?.is_preview),
    preview_source: prolificIdentity?.preview_source || null,
    taskflow_variant_id: prolificIdentity?.taskflow_variant_id || null,
    variant_token_hash: prolificIdentity?.variant_token_hash || null,
    record_key: prolificIdentity?.record_key || null,
    assignment_mode: prolificIdentity ? "prolific_taskflow" : ASSIGNMENT_MODE,
    locale: prolificIdentity ? "en" : "zh-CN",
    status: "created",
    created_at: createdAt,
    assigned_at: createdAt,
    started_at: null,
    completed_at: null,
    completion_ready_at: null,
    completion_redirect_initiated_at: null,
    completion_status: null,
    stage_timestamps: { created: createdAt },
    event_log: [],
    baseline: {},
    comprehension_attempts: [],
    study2_peer_display_order: study2StimulusPlan.peerDisplayOrder,
    study2_peer_profile_id: study2StimulusPlan.peerProfileId,
    study2_peer_profile_base_cents: null,
    study2_peer_income_records: [],
    effort_materials: makeEffortMaterials(stimulusSeed),
    effort_rounds: [],
    effort_summary: null,
    actual_income_cents: null,
    actual_income: null,
    income_viewed_at: null,
    peer_income_records: [],
    peer_records_view: null,
    income_report_selection_started_at: null,
    income_report_decision_timing: { segments: [], accumulated_active_ms: 0, accumulated_hidden_ms: 0 },
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
  const status = query.status || "all";
  const resumedOnly = String(query.resumed_only || "").toLowerCase() === "true";
  const aliasesOnly = String(query.aliases_only || "").toLowerCase() === "true";
  const recoveryFlag = query.recovery_flag || "all";
  const start = query.start_date ? new Date(`${query.start_date}T00:00:00.000Z`) : null;
  const end = query.end_date ? new Date(`${query.end_date}T23:59:59.999Z`) : null;
  return sessions.filter((session) => {
    if (!includeTest && session.is_test_session) return false;
    if (condition !== "all" && condition && session.condition !== condition) return false;
    if (status === "completed" && session.status !== "completed") return false;
    if (status === "incomplete" && session.status === "completed") return false;
    if (resumedOnly && Number(session.resume_count || 0) < 1) return false;
    if (aliasesOnly && (session.prolific_session_aliases || []).length <= 1) return false;
    if (recoveryFlag !== "all" && !prolificExport.qualityFlags(session).includes(recoveryFlag)) return false;
    const created = session.created_at ? new Date(session.created_at) : null;
    if (start && created && created < start) return false;
    if (end && created && created > end) return false;
    return true;
  });
}

function prolificAdminSummary(sessions) {
  const conditions = Object.fromEntries(CONDITIONS.map((condition) => {
    const matching = sessions.filter((session) => session.condition === condition);
    return [condition, {
      arrived: matching.length,
      started: matching.filter((session) => session.started_at).length,
      incomplete: matching.filter((session) => session.status !== "completed").length,
      completed: matching.filter((session) => session.status === "completed").length,
      data_complete: matching.filter(prolificExport.isDataComplete).length,
      quality_flags: matching.filter((session) => prolificExport.qualityFlags(session).length > 0).length
    }];
  }));
  return {
    arrived: sessions.length,
    started: sessions.filter((session) => session.started_at).length,
    incomplete: sessions.filter((session) => session.status !== "completed").length,
    completed: sessions.filter((session) => session.status === "completed").length,
    data_complete: sessions.filter(prolificExport.isDataComplete).length,
    quality_flags: sessions.filter((session) => prolificExport.qualityFlags(session).length > 0).length,
    conditions
  };
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

app.post("/api/prolific/session", asyncHandler(async (req, res) => {
  const prolificIdentity = prolificSupport.validateRequest(req.body);
  try {
    const session = await createSession({
      participantId: prolificIdentity.prolific_pid,
      requestedCondition: null,
      entry: null,
      prolificIdentity
    });
    res.json({ session: publicSession(session) });
  } catch (error) {
    if (["identity_conflict", "variant_conflict", "duplicate_participation"].includes(error.code)) {
      if (error.session_id) {
        await store.updateSession(error.session_id, (draft) => {
          draft.abnormal_events = Array.isArray(draft.abnormal_events) ? draft.abnormal_events : [];
          const event = { type: error.audit_type || error.code, at: now() };
          draft.abnormal_events.push(event);
          addEvent(draft, event.type);
          return draft;
        });
      }
      await store.appendAuditEvent({
        type: error.audit_type || error.code,
        at: now(),
        record_key: prolificIdentity.record_key,
        prolific_pid_hash: crypto.createHash("sha256").update(prolificIdentity.prolific_pid).digest("hex"),
        taskflow_variant_id: prolificIdentity.taskflow_variant_id
      });
    }
    throw error;
  }
}));

app.get("/api/session/:id", asyncHandler(async (req, res) => {
  const session = await store.readSession(req.params.id);
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/consent", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    draft.started_at ||= now();
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
    const existingRound = (draft.effort_rounds || []).find((round) => Number(round.round_index) === roundIndex);
    if (existingRound) {
      draft._lastRound = existingRound;
      draft._duplicateRound = true;
      return draft;
    }
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
      ensureStudy2PeerIncomeRecords(draft);
      transition(draft, "effort_completed");
    }
    draft._lastRound = round;
    return draft;
  });
  const lastRound = session._lastRound;
  const duplicate = Boolean(session._duplicateRound);
  delete session._lastRound;
  delete session._duplicateRound;
  await store.writeSession(session);
  res.json({ session: publicSession(session), duplicate, round: lastRound, current: currentEffortPayload(session) });
}));

app.post("/api/session/:id/income-viewed", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "effort_completed") throw new Error("Income view requires effort_completed status");
    ensureStudy2PeerIncomeRecords(draft);
    draft.income_viewed_at = now();
    transition(draft, "income_viewed");
    return draft;
  });
  res.json({ session: publicSession(session), actual_income: session.actual_income, actual_income_cents: session.actual_income_cents });
}));

app.get("/api/session/:id/peer-records", asyncHandler(async (req, res) => {
  const session = await store.readSession(req.params.id);
  if (statusIndex(session.status) < statusIndex("income_viewed")) return res.status(409).json({ error: "Peer records require income_viewed status" });
  res.json({ displayed_at: now(), records: publicPeerIncomeRecords(session) });
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

app.post("/api/session/:id/decision-timing", asyncHandler(async (req, res) => {
  await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "peer_records_viewed" || draft.income_report) throw new Error("Decision timing requires an active income report");
    draft.income_report_decision_timing ||= { segments: [] };
    mergeDecisionTiming(draft.income_report_decision_timing, req.body);
    return draft;
  });
  res.status(204).end();
}));

app.post("/api/session/:id/income-report", asyncHandler(async (req, res) => {
  const reportedCents = parseReportedIncomeCents(req.body || {});
  const serverReceivedAt = now();
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "peer_records_viewed") throw new Error("Income report requires peer_records_viewed status");
    if (draft.income_report) throw new Error("Income report already submitted");
    const startedAt = draft.income_report_selection_started_at;
    if (!startedAt) throw new Error("Income report selection was not started by server");
    const underreportAmountCents = draft.actual_income_cents - reportedCents;
    const underreportRate = draft.actual_income_cents > 0 ? Number((underreportAmountCents / draft.actual_income_cents).toFixed(4)) : 0;
    const deductionCents = Math.round(study2.effortTask.deductionRate * reportedCents);
    const retainedRewardCents = draft.actual_income_cents - deductionCents;
    const submittedAt = now();
    draft.income_report_decision_timing ||= { segments: [] };
    const decisionTiming = mergeDecisionTiming(draft.income_report_decision_timing, req.body);
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
      decision_started_at_client: String(req.body.decision_started_at_client || "") || null,
      decision_submitted_at_client: String(req.body.decision_submitted_at_client || "") || null,
      decision_time_ms: decisionTiming.accumulated_active_ms,
      page_hidden_duration_ms: decisionTiming.accumulated_hidden_ms,
      timer_resumed_after_reload: decisionTiming.segments.length > 1 || Boolean(req.body.timer_resumed_after_reload),
      decision_timing_segments: decisionTiming.segments,
      server_received_at: serverReceivedAt,
      saved_at: submittedAt,
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
  const completed = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "demographics_completed") throw new Error("Completion requires demographics_completed status");
    if (!draft.debrief_viewed_at) throw new Error("请先阅读并确认事后说明。");
    draft.completed_at = now();
    draft.completion_status = "completed";
    addEvent(draft, "completed");
    transition(draft, "completed");
    return draft;
  });
  const session = await store.updateSession(completed.id, (draft) => {
    draft.completion_ready_at ||= now();
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/completion-redirect-initiated", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "completed" || draft.completion_status !== "completed") {
      fail(409, "Completion redirect is not ready.");
    }
    if (!draft.completion_redirect_initiated_at) {
      draft.completion_redirect_initiated_at = now();
      addEvent(draft, "completion_redirect_initiated");
    }
    return draft;
  });
  res.json({ session: publicSession(session) });
}));

app.get("/api/admin/summary", requireAdmin, asyncHandler(async (req, res) => {
  let sessions = filterSessions(await store.listSessions(), req.query);
  if (ASSIGNMENT_MODE === "prolific_taskflow") sessions = sessions.filter((session) => !session.is_preview);
  res.json({ version: VERSION, summary: exporters.summary(sessions), data_dir: store.DATA_DIR });
}));

app.get("/api/admin/export/json", requireAdmin, asyncHandler(async (req, res) => {
  res.json({ version: VERSION, sessions: filterSessions(await store.listSessions(), req.query) });
}));

app.get("/api/admin/prolific-summary", requireAdmin, asyncHandler(async (req, res) => {
  const allSessions = filterSessions(await store.listSessions(), req.query).filter((session) => session.assignment_mode === "prolific_taskflow");
  const recordKind = req.query.record_kind || "all";
  const sessions = recordKind === "preview" ? [] : allSessions.filter((session) => !session.is_preview);
  const previewSessions = recordKind === "formal" ? [] : allSessions.filter((session) => session.is_preview);
  const formal = prolificAdminSummary(sessions);
  const preview = prolificAdminSummary(previewSessions);
  res.json({ preview_mode_enabled: prolificSupport.previewMode, formal, preview, conditions: formal.conditions, preview_conditions: preview.conditions, participants: prolificExport.adminRows(sessions), preview_participants: prolificExport.adminRows(previewSessions) });
}));

app.get("/api/admin/export/prolific-bundle.zip", requireAdmin, asyncHandler(async (req, res) => {
  const sessions = filterSessions(await store.listSessions(), req.query).filter((session) => session.assignment_mode === "prolific_taskflow" && !session.is_preview);
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study2-prolific-export-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/prolific-preview-bundle.zip", requireAdmin, asyncHandler(async (req, res) => {
  const sessions = filterSessions(await store.listSessions(), req.query).filter((session) => session.assignment_mode === "prolific_taskflow" && session.is_preview);
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study2-prolific-preview-export-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
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

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.use((req, res, next) => {
  if (req.method !== "GET") return res.status(404).json({ error: "Endpoint not found" });
  next();
});

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

app._internal = {
  createStudy2StimulusPlan,
  buildStudy2PeerIncomeRecords
};

module.exports = app;
