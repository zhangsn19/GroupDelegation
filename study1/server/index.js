const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VERSION, STUDIES, CONDITIONS, STATUS_ORDER, MEMBERS } = require("../config/common");
const study1 = require("../config/study1-dice");
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
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REQUIRE_PARTICIPANT_ID = IS_PRODUCTION || String(process.env.REQUIRE_PARTICIPANT_ID).toLowerCase() === "true";
const STUDY_VERSION = process.env.STUDY_VERSION || "study1-v1.1.0";
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
const PARTICIPANT_ID_PATTERN = /^GD-S1-[A-Z0-9]{6}$/;
const STUDY_CONTACT_EMAIL = String(process.env.STUDY_CONTACT_EMAIL || (IS_PRODUCTION ? "" : "123456@163.com")).trim();
const COMPLETION_CODE = process.env.COMPLETION_CODE || "";
const COMPLETION_REDIRECT_URL = process.env.COMPLETION_REDIRECT_URL || "";
const STIMULUS_VERSION = "randomized-stimuli-v1";
const STUDY1_DICE_MULTISET = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const STUDY1_DISHONEST_REPORTS = {
  1: [3, 4, 5, 6],
  2: [4, 5, 5, 6],
  3: [5, 5, 6, 6],
  4: [5, 5, 6, 6],
  5: [6, 6, 6, 6]
};

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
  if (!["block", "controlled_link"].includes(ASSIGNMENT_MODE)) {
    throw new Error("ASSIGNMENT_MODE must be block or controlled_link");
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

function publicContactEmail() {
  return STUDY_CONTACT_EMAIL || "123456@163.com";
}

function publicCompletion() {
  return {
    completion_code: COMPLETION_CODE || null,
    completion_redirect_url: COMPLETION_REDIRECT_URL || null
  };
}

function publicSession(session) {
  const payload = {
    id: session.id,
    participant_id: session.participant_id || session.prolific_id || "",
    study_version: session.study_version || STUDY_VERSION,
    protocol_version: session.protocol_version || PROTOCOL_VERSION,
    status: session.status,
    dice_round_count: session.dice_rounds?.length || 0,
    dice_total_rounds: session.dice_sequence?.length || 0,
    completed_at: session.completed_at || null,
    completion_status: session.completion_status || null
  };
  if (session.status === "completed" || session.completion_status === "completed") {
    payload.completion = publicCompletion();
  }
  return payload;
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

function publicComprehensionQuestions(questions) {
  return questions.map(({ id, prompt, options }) => ({ id, prompt, options }));
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

function study1HiddenText(name) {
  return `${name}\u5df2\u5411\u7fa4\u804a AI \u5b8c\u6210\u63d0\u4ea4\uff0c\u5177\u4f53\u5185\u5bb9\u5bf9\u4f60\u4e0d\u53ef\u89c1\u3002`;
}

function study1VisibleText(name, value) {
  return `${name}\u5df2\u5411\u7fa4\u804a AI \u63d0\u4ea4\uff1a${value}`;
}

function createStudy1Stimuli(condition, seed) {
  const diceSequence = seededShuffle(STUDY1_DICE_MULTISET, createSeededRandom(seed, "study1-dice"));
  const peerDisplayOrder = seededShuffle(peerNames(), createSeededRandom(seed, "study1-peer-order"));
  const assignmentRandom = createSeededRandom(seed, "study1-dishonest-assignment");
  const peerRecordsByRound = diceSequence.map((trueValue, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const dishonestReports = seededShuffle(STUDY1_DISHONEST_REPORTS[trueValue], assignmentRandom);
    const peerRecords = peerDisplayOrder.map((name, index) => {
      const underlyingValue = condition === "dishonest" ? dishonestReports[index] : trueValue;
      if (condition === "hidden") {
        return {
          round_index: roundNumber,
          name,
          trueValue,
          reportedValue: null,
          underlying_reported_value: underlyingValue,
          visibility: "hidden",
          text: study1HiddenText(name)
        };
      }
      const reportedValue = condition === "honest" ? trueValue : dishonestReports[index];
      return {
        round_index: roundNumber,
        name,
        trueValue,
        reportedValue,
        underlying_reported_value: reportedValue,
        visibility: "visible",
        text: study1VisibleText(name, reportedValue)
      };
    });
    return {
      round_index: roundNumber,
      true_die_value: trueValue,
      peer_display_order: peerDisplayOrder,
      peer_records: peerRecords
    };
  });
  return { diceSequence, peerDisplayOrder, peerRecordsByRound };
}

function sessionDiceSequence(session) {
  return session.study1_die_sequence || session.dice_sequence || [];
}

function sessionPeerRecordsByRound(session) {
  if (session.study1_peer_records_by_round) return session.study1_peer_records_by_round;
  return (session.peer_records_sequence || []).map((peerRecords, index) => ({
    round_index: index + 1,
    true_die_value: sessionDiceSequence(session)[index],
    peer_display_order: peerRecords.map((record) => record.name),
    peer_records: peerRecords
  }));
}

function publicStudy1PeerRecords(session, peerRecords = []) {
  if (session.condition !== "hidden") return peerRecords;
  return peerRecords.map(({ underlying_reported_value, ...record }) => ({
    ...record,
    reportedValue: null,
    visibility: "hidden"
  }));
}

function publicDiceRound(session, round) {
  if (!round) return round;
  return {
    ...round,
    peer_records: publicStudy1PeerRecords(session, round.peer_records)
  };
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

async function createSession({ study, participantId, requestedCondition, entry, lockHeld = false }) {
  validateStudy(study);
  const normalizedParticipant = parseParticipantId(participantId);
  if (!normalizedParticipant && REQUIRE_PARTICIPANT_ID) {
    const error = new Error("参与编号缺失。请返回招募平台后通过原始研究链接进入。");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedParticipant && !lockHeld) {
    return withRandomizationLock(async () => {
      return createSession({ study, participantId: normalizedParticipant, requestedCondition, entry, lockHeld: true });
    });
  }
  let entryAssignment = null;
  const hasEntry = String(entry || "").trim() !== "";
  if (ASSIGNMENT_MODE === "controlled_link") {
    entryAssignment = resolveEntryAssignment(entry);
  } else if (hasEntry) {
    fail(400, "当前研究未启用指定入口分组。");
  }
  validateParticipantIdPolicy(normalizedParticipant, entryAssignment);
  const existing = (await store.listSessions()).find((session) => (
    normalizedParticipant &&
    (session.participant_id === normalizedParticipant || session.prolific_id === normalizedParticipant) &&
    session.study === study
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
      const result = allocateBlockCondition(state, { participantId: normalizedParticipant, study });
      allocation = result.allocation;
      if (result.changed) await writeRandomizationState(state);
    } else {
      allocation = await assignBlockCondition({ participantId: normalizedParticipant, study });
    }
    condition = allocation.condition;
  } else {
    condition = await assignCondition(study);
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  }

  const id = `s_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
  const createdAt = now();
  const stimulusSeed = createStimulusSeed();
  const study1Stimuli = study === "study1" ? createStudy1Stimuli(condition, stimulusSeed) : {
    diceSequence: [],
    peerDisplayOrder: [],
    peerRecordsByRound: []
  };
  const diceSequence = study1Stimuli.diceSequence;
  const session = {
    id,
    version: VERSION,
    study_version: STUDY_VERSION,
    protocol_version: PROTOCOL_VERSION,
    stimulus_version: STIMULUS_VERSION,
    stimulus_seed: stimulusSeed,
    study,
    condition,
    condition_assigned_at: allocation.assigned_at,
    assignment_source: assignmentSource,
    entry_link_id: entryLinkId,
    randomization_block: allocation.randomization_block,
    randomization_position: allocation.randomization_position,
    is_test_session: !IS_PRODUCTION || DEBUG_LINKS,
    condition_label: {
      hidden: "同伴具体提交隐藏",
      honest: "同伴如实提交",
      dishonest: "同伴提交更高数字"
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
    study1_die_sequence: diceSequence,
    study1_peer_display_order: study1Stimuli.peerDisplayOrder,
    study1_peer_records_by_round: study1Stimuli.peerRecordsByRound,
    peer_records_sequence: study1Stimuli.peerRecordsByRound.map((round) => round.peer_records),
    dice_sequence: diceSequence,
    dice_round_state: {},
    dice_rounds: [],
    post_survey: {},
    demographics: {},
    abnormal_events: []
  };
  addEvent(session, "session_created", { study, condition, debug_mode: session.debug_mode, assignment_source: assignmentSource, entry_link_id: entryLinkId });
  return store.writeSession(session);
}

function prepareCurrentDiceRound(session) {
  const index = session.dice_rounds.length;
  const diceSequence = sessionDiceSequence(session);
  if (index >= diceSequence.length) return null;
  const roundIndex = index + 1;
  session.dice_round_state ||= {};
  const key = String(roundIndex);
  if (!session.dice_round_state[key]) {
    session.dice_round_state[key] = {
      round_index: roundIndex,
      selection_started_at: null
    };
    addEvent(session, "dice_round_prepared", { round_index: roundIndex });
  }
  return session.dice_round_state[key];
}

function markCurrentDiceRoundPresented(session) {
  const state = prepareCurrentDiceRound(session);
  if (!state) return null;
  if (!state.selection_started_at) {
    state.selection_started_at = now();
    addEvent(session, "dice_round_presented", { round_index: state.round_index });
  }
  return state;
}

function currentDicePayload(session) {
  const index = session.dice_rounds.length;
  const diceSequence = sessionDiceSequence(session);
  const recordsByRound = sessionPeerRecordsByRound(session);
  if (index >= diceSequence.length) return { completed: true };
  const roundIndex = index + 1;
  const state = session.dice_round_state?.[String(roundIndex)];
  const roundStimulus = recordsByRound[index] || {};
  return {
    completed: false,
    round_index: roundIndex,
    total_rounds: diceSequence.length,
    true_die_value: diceSequence[index],
    peer_records: publicStudy1PeerRecords(session, roundStimulus.peer_records || []),
    selection_started_at: state?.selection_started_at || null
  };
}

function validateItems(items, responses) {
  const missing = [];
  const invalid = [];
  for (const item of items) {
    const value = responses[item.id];
    if (value === undefined || value === "" || value === null) {
      if (item.required !== false) missing.push(item.id);
      continue;
    }
    if (item.type === "likert" || !item.type) {
      const numeric = Number(value);
      const max = item.scalePoints || 7;
      if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) invalid.push(item.id);
    } else if (item.type === "select") {
      if (!item.options.includes(value)) invalid.push(item.id);
    } else if (item.type === "number") {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || (item.min !== undefined && numeric < item.min) || (item.max !== undefined && numeric > item.max)) invalid.push(item.id);
    } else if (item.type === "text") {
      if (typeof value !== "string" || !value.trim()) invalid.push(item.id);
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
    baselineItems: study1.baselineItems,
    postSurveyItems: study1.postSurveyItems,
    demographicsItems: study1.demographicsItems,
    ruleBlocks: study1.ruleBlocks,
    comprehensionQuestions: publicComprehensionQuestions(study1.comprehensionQuestions)
  });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    study: "study1",
    study_version: STUDY_VERSION,
    protocol_version: PROTOCOL_VERSION
  });
});

app.post("/api/session", asyncHandler(async (req, res) => {
  const session = await createSession({
    study: "study1",
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

app.post("/api/session/:id/dice/presented", asyncHandler(async (req, res) => {
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "task_in_progress") throw new Error("Dice round requires task_in_progress status");
    markCurrentDiceRoundPresented(draft);
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
    const diceSequence = sessionDiceSequence(draft);
    const recordsByRound = sessionPeerRecordsByRound(draft);
    const trueValue = diceSequence[expectedRound - 1];
    const roundState = draft.dice_round_state?.[String(expectedRound)];
    if (!roundState?.selection_started_at) throw new Error("Dice round was not presented by server");
    const priorReward = draft.dice_rounds.reduce((sum, round) => sum + Number(round.personal_reward), 0);
    const personalReward = Number((reported * study1.rewardPerPoint).toFixed(2));
    const submittedAt = now();
    const startedAt = roundState.selection_started_at;
    const round = {
      round_index: expectedRound,
      true_die_value: trueValue,
      peer_display_order: recordsByRound[expectedRound - 1]?.peer_display_order || [],
      peer_records: recordsByRound[expectedRound - 1]?.peer_records || [],
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
    if (draft.dice_rounds.length === diceSequence.length) {
      transition(draft, "task_completed");
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
    duplicate,    round: publicDiceRound(session, lastRound),
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

app.get("/api/admin/export/study1_dice_rounds.csv", requireAdmin, asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.study1DiceRoundsCsv(filterSessions(await store.listSessions(), req.query)));
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
      console.log(`group-deception-v2 listening on http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

app._internal = {
  createStudy1Stimuli
};

module.exports = app;
