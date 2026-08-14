const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { VERSION, STUDIES, CONDITIONS, STATUS_ORDER, MEMBERS } = require("../config/common");
const study1 = require("../config/study1-dice");
const {
  ESCALATING_CONDITION,
  SCHEDULE_VERSION,
  PEER_ONSET_ROUNDS,
  isEscalatingPeerMisreporting
} = require("../config/h2-escalation");
const {
  fixedDishonestCountForCondition,
  conditionFamilyForCondition,
  compositionVersionForCondition,
  conditionAnalysisLabelForCondition
} = require("../config/fixed-gradient");
const exporters = require("./export");
const prolificExport = require("./prolific-export");
const { createProlificSupport } = require("./prolific");
const {
  PEER_IDENTITIES,
  PROTOCOL_VERSION: HUMAN_AI_PROTOCOL_VERSION,
  IDENTITY_MANIPULATION_VERSION,
  CONDITION_MAP_VERSION,
  ACTIVE_HUMAN_AI_CONDITIONS,
  isPeerIdentity,
  isSupportedCondition,
  activeCells,
} = require("../config/human-ai-protocol");
const normPilot = require("../config/ai-norm-pilot");

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

const internalStore = require("./store");
const recruitmentStore = process.env.RECRUITMENT_DATA_DIR
  ? internalStore.createStore(process.env.RECRUITMENT_DATA_DIR)
  : internalStore;
const NORM_RUNTIME = String(process.env.PROTOCOL_VERSION || "") === normPilot.PROTOCOL_VERSION;
const formalStore = NORM_RUNTIME
  ? internalStore.createStore(process.env.FORMAL_DATA_DIR || "./data/norm/formal/sessions")
  : recruitmentStore;
const previewStore = NORM_RUNTIME
  ? internalStore.createStore(process.env.PREVIEW_DATA_DIR || "./data/norm/preview/sessions")
  : recruitmentStore;
const qaStore = NORM_RUNTIME
  ? internalStore.createStore(process.env.QA_DATA_DIR || "./data/norm/qa/sessions")
  : internalStore;
const teamReviewStore = NORM_RUNTIME
  ? internalStore.createStore(process.env.TEAM_REVIEW_DATA_DIR || "./data/norm/team-review/sessions")
  : internalStore;
const writableStores = [...new Set([formalStore, previewStore, qaStore, teamReviewStore])];
function storeForScope(scope) {
  return ({ formal: formalStore, preview: previewStore, qa: qaStore, team_review: teamReviewStore })[scope] || internalStore;
}
function isRecruitmentSession(session = {}) {
  return session.assignment_mode === "prolific_taskflow" || session.is_preview === true || session.scope === "formal" || session.scope === "preview";
}
async function locateCurrentStore(id) {
  for (const candidate of writableStores) {
    try {
      await candidate.readSession(id);
      return candidate;
    } catch (error) {
      if (error.statusCode !== 410) throw error;
    }
  }
  await writableStores[0].readSession(id);
  throw new Error("Unreachable session lookup state");
}
const store = {
  DATA_DIR: NORM_RUNTIME ? formalStore.DATA_DIR : internalStore.DATA_DIR,
  async ensureDataDir() {
    await Promise.all(writableStores.map((candidate) => candidate.ensureDataDir()));
  },
  async listSessions() {
    return (await Promise.all(writableStores.map((candidate) => candidate.listSessions()))).flat();
  },
  async readSession(id) {
    const selected = await locateCurrentStore(id);
    return selected.readSession(id);
  },
  async updateSession(id, updater) {
    const selected = await locateCurrentStore(id);
    return selected.updateSession(id, updater);
  },
  async writeSession(session) {
    if (NORM_RUNTIME) return storeForScope(prolificExport.sessionScope(session)).writeSession(session);
    return (isRecruitmentSession(session) ? recruitmentStore : internalStore).writeSession(session);
  },
  async appendAuditEvent(event) {
    return (NORM_RUNTIME ? formalStore : recruitmentStore).appendAuditEvent(event);
  },
};
const { createReadOnlyLegacyStore } = require("./legacy-store");
const legacyStore = createReadOnlyLegacyStore(process.env.LEGACY_STUDY1_DATA_DIR || "");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const DEBUG_LINKS = String(process.env.DEBUG_LINKS).toLowerCase() === "true";
const ALLOW_QA_PREVIEW = String(process.env.ALLOW_QA_PREVIEW || "").toLowerCase() === "true";
const ALLOW_TEAM_REVIEW = String(process.env.ALLOW_TEAM_REVIEW || "").toLowerCase() === "true";
const ALLOW_PREVIEW = String(process.env.ALLOW_PREVIEW || process.env.PROLIFIC_PREVIEW_MODE || "").toLowerCase() === "true";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const REQUIRE_PARTICIPANT_ID = IS_PRODUCTION || String(process.env.REQUIRE_PARTICIPANT_ID).toLowerCase() === "true";
const STUDY_VERSION = process.env.STUDY_VERSION || "study1-v1.1.0";
const ASSIGNMENT_MODE = String(process.env.ASSIGNMENT_MODE || "block").trim() || "block";
const PROTOCOL_VERSION = process.env.PROTOCOL_VERSION || (ASSIGNMENT_MODE === "review_only" ? HUMAN_AI_PROTOCOL_VERSION : "peer-reporting-v2");
const IS_NORM_PILOT = PROTOCOL_VERSION === normPilot.PROTOCOL_VERSION;
const FORMAL_RECRUITMENT_ENABLED = String(process.env.FORMAL_RECRUITMENT_ENABLED || "false").toLowerCase() === "true";
const TEST_CONDITION = String(process.env.TEST_CONDITION || "").trim();
const ENTRY_CODES = {
  A: { condition: "hidden", value: String(process.env.ENTRY_CODE_HIDDEN || "").trim() },
  B: { condition: "honest", value: String(process.env.ENTRY_CODE_HONEST || "").trim() },
  C: { condition: "dishonest", value: String(process.env.ENTRY_CODE_DISHONEST || "").trim() },
  D: { condition: ESCALATING_CONDITION, value: String(process.env.ENTRY_CODE_DISHONEST_ESCALATING || "").trim() },
  E: { condition: "dishonest_fixed_1", value: String(process.env.ENTRY_CODE_DISHONEST_FIXED_1 || "").trim() },
  F: { condition: "dishonest_fixed_2", value: String(process.env.ENTRY_CODE_DISHONEST_FIXED_2 || "").trim() },
  G: { condition: "dishonest_fixed_3", value: String(process.env.ENTRY_CODE_DISHONEST_FIXED_3 || "").trim() }
};
const PARTICIPANT_ID_POLICY = String(process.env.PARTICIPANT_ID_POLICY || "open").trim().toLowerCase() || "open";
const PARTICIPANT_ID_ALLOWLIST_FILE = String(process.env.PARTICIPANT_ID_ALLOWLIST_FILE || "").trim();
const PARTICIPANT_ID_PATTERN = /^GD-S1-[A-Z0-9]{6}$/;
const STUDY_CONTACT_EMAIL = String(process.env.STUDY_CONTACT_EMAIL || (IS_PRODUCTION ? "" : "123456@163.com")).trim();
const COMPLETION_CODE = process.env.COMPLETION_CODE || "";
const COMPLETION_REDIRECT_URL = process.env.COMPLETION_REDIRECT_URL || "";
const STIMULUS_VERSION = IS_NORM_PILOT ? normPilot.STIMULUS_VERSION : "randomized-stimuli-v1";
const STUDY1_DICE_MULTISET = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "16kb" }));
app.get(["/", "/index.html"], (req, res, next) => {
  if (ASSIGNMENT_MODE === "review_only") {
    try {
      prolificSupport.validateRequest(req.query);
      return res.sendFile(path.join(__dirname, "..", "public", "en", "index.html"));
    } catch (error) {
      return res.status(403).type("text/plain").send("Study access requires a valid study link.");
    }
  }
  if (ASSIGNMENT_MODE !== "prolific_taskflow") return next();
  res.sendFile(path.join(__dirname, "..", "public", "en", "index.html"));
});
app.get(["/en", "/en/", "/en/index.html"], (req, res, next) => {
  if (ASSIGNMENT_MODE === "review_only" && !req.query.qa_session && !req.query.review_session) {
    return res.status(403).type("text/plain").send("Study access requires a valid study link.");
  }
  next();
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
  if (!["block", "controlled_link", "prolific_taskflow", "review_only"].includes(ASSIGNMENT_MODE)) {
    throw new Error("ASSIGNMENT_MODE must be block, controlled_link, prolific_taskflow, or review_only");
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
  if (IS_NORM_PILOT) throw new Error("AI Norm Pilot does not support controlled_link assignment");
  const values = Object.values(ENTRY_CODES).map((item) => item.value);
  if (values.some((value) => !value)) {
    throw new Error("controlled_link assignment requires all seven Study 1 entry codes");
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
  assignmentMode: IS_NORM_PILOT && !FORMAL_RECRUITMENT_ENABLED ? "review_only" : ASSIGNMENT_MODE,
  isProduction: IS_PRODUCTION,
  allowedConditions: IS_NORM_PILOT ? normPilot.CONDITIONS : CONDITIONS,
  expectedVariantCount: IS_NORM_PILOT ? 4 : 7
});

function publicContactEmail() {
  return STUDY_CONTACT_EMAIL || "123456@163.com";
}

function publicCompletion(session = {}) {
  if (["qa_preview", "team_review"].includes(session.assignment_mode)) {
    return { completion_code: null, completion_redirect_url: null };
  }
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
    completion_status: session.completion_status || null,
    completion_ready_at: session.completion_ready_at || null,
    completion_redirect_initiated_at: session.completion_redirect_initiated_at || null,
    assignment_mode: session.assignment_mode || ASSIGNMENT_MODE,
    locale: session.locale || "zh-CN"
  };
  if (session.status === "completed" || session.completion_status === "completed") {
    payload.completion = publicCompletion(session);
  }
  if (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION) {
    payload.peer_identity = session.peer_identity;
    payload.identity_manipulation_version = session.identity_manipulation_version;
    payload.condition_map_version = session.condition_map_version;
    payload.peer_members = peerMembersForIdentity(session.peer_identity);
    payload.post_survey_items = postSurveyItemsForSession(session);
    payload.demographics_items = demographicsItemsForSession(session);
    payload.rule_blocks = study1.humanAiRuleBlocksFor(session.peer_identity, session.condition);
    payload.comprehension_questions = publicComprehensionQuestions(study1.humanAiComprehensionQuestions);
  } else if (session.protocol_version === normPilot.PROTOCOL_VERSION) {
    payload.peer_identity = normPilot.PEER_IDENTITY;
    payload.peer_members = peerMembersForIdentity(normPilot.PEER_IDENTITY);
    payload.post_survey_items = postSurveyItemsForSession(session);
    payload.demographics_items = demographicsItemsForSession(session);
    payload.rule_blocks = normPilot.RULE_BLOCKS;
    payload.comprehension_questions = publicComprehensionQuestions(normPilot.COMPREHENSION_QUESTIONS);
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

function postSurveyItemsForSession(session) {
  if (session?.protocol_version === normPilot.PROTOCOL_VERSION) return normPilot.posttestItemsFor(session.norm_type);
  if (session?.protocol_version !== HUMAN_AI_PROTOCOL_VERSION) return study1.postSurveyItems;
  if (session.condition !== "hidden") return study1.humanAiPostSurveyItems;
  return study1.humanAiPostSurveyItems.filter((item) => item.id !== "peer_reports_considered");
}

function demographicsItemsForSession(session) {
  if (session?.protocol_version === normPilot.PROTOCOL_VERSION) return study1.demographicsItems;
  return session?.protocol_version === HUMAN_AI_PROTOCOL_VERSION
    ? study1.humanAiDemographicsItems
    : study1.demographicsItems;
}

function comprehensionQuestionsForSession(session) {
  if (session?.protocol_version === normPilot.PROTOCOL_VERSION) return normPilot.COMPREHENSION_QUESTIONS;
  return session?.protocol_version === HUMAN_AI_PROTOCOL_VERSION
    ? study1.humanAiComprehensionQuestions
    : study1.comprehensionQuestions;
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
      const event = {
        at: resumedAt,
        prolific_session_id: identity.prolific_session_id,
        previous_status: draft.status
      };
      draft.resume_events.push(event);
      addEvent(draft, "prolific_session_resumed", event);
    }
    return draft;
  });
}

function mergeDecisionTiming(target, payload = {}) {
  target.decision_timing ||= { segments: [] };
  const timing = target.decision_timing;
  timing.segments = Array.isArray(timing.segments) ? timing.segments : [];
  const segmentId = String(payload.decision_segment_id || `legacy-${Date.now()}`).trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(segmentId)) throw new Error("Invalid decision timing segment");
  const activeMs = Math.max(0, Math.min(86400000, Math.round(Number(payload.decision_segment_active_ms ?? payload.decision_time_ms ?? 0))));
  const hiddenMs = Math.max(0, Math.min(activeMs, Math.round(Number(payload.decision_segment_hidden_ms ?? payload.page_hidden_duration_ms ?? 0))));
  let segment = timing.segments.find((item) => item.segment_id === segmentId);
  if (!segment) {
    segment = { segment_id: segmentId, active_duration_ms: 0, page_hidden_duration_ms: 0 };
    timing.segments.push(segment);
  }
  segment.active_duration_ms = Math.max(segment.active_duration_ms, activeMs);
  segment.page_hidden_duration_ms = Math.max(segment.page_hidden_duration_ms, hiddenMs);
  segment.updated_at = now();
  timing.accumulated_active_ms = timing.segments.reduce((sum, item) => sum + item.active_duration_ms, 0);
  timing.accumulated_hidden_ms = timing.segments.reduce((sum, item) => sum + item.page_hidden_duration_ms, 0);
  return timing;
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
  const allowed = IS_NORM_PILOT ? normPilot.CONDITIONS : CONDITIONS;
  if (!allowed.includes(condition)) {
    const error = new Error("Invalid condition");
    error.statusCode = 400;
    throw error;
  }
}

async function assignCondition(study) {
  const allowed = IS_NORM_PILOT ? normPilot.CONDITIONS : CONDITIONS;
  const sessions = (await store.listSessions()).filter((session) => session.study === study && allowed.includes(session.condition));
  const counts = Object.fromEntries(allowed.map((condition) => [condition, 0]));
  for (const session of sessions) {
    counts[session.condition] += session.status === "completed" ? 1.25 : 1;
  }
  const min = Math.min(...Object.values(counts));
  return allowed.find((condition) => counts[condition] === min);
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

const STABLE_MEMBER_IDS = ["member_1", "member_2", "member_3", "member_4"];

function peerMembersForIdentity(peerIdentity) {
  if (!PEER_IDENTITIES.includes(peerIdentity)) return MEMBERS;
  const label = peerIdentity === "ai" ? "AI Member" : "Human Member";
  const identityIcon = peerIdentity === "ai" ? "🤖" : "👤";
  const role = peerIdentity === "ai" ? "AI group member" : "Human group member";
  return [
    { id: "participant", name: "You", role: "Participant", avatar: "You" },
    ...STABLE_MEMBER_IDS.map((id, index) => ({ id, name: `${label} ${index + 1}`, role, avatar: identityIcon })),
  ];
}

function study1HiddenText(name) {
  return `${name}\u5df2\u5411\u7fa4\u804a AI \u5b8c\u6210\u63d0\u4ea4\uff0c\u5177\u4f53\u5185\u5bb9\u5bf9\u4f60\u4e0d\u53ef\u89c1\u3002`;
}

function study1VisibleText(name, value) {
  return `${name}\u5df2\u5411\u7fa4\u804a AI \u63d0\u4ea4\uff1a${value}`;
}

function randomDishonestReport(trueValue, random) {
  const min = trueValue + 1;
  const optionCount = 7 - min;
  return min + Math.floor(random() * optionCount);
}

function createStudy1Stimuli(condition, seed) {
  const diceSequence = seededShuffle(STUDY1_DICE_MULTISET, createSeededRandom(seed, "study1-dice"));
  const peerDisplayOrder = seededShuffle(peerNames(), createSeededRandom(seed, "study1-peer-order"));
  const assignmentRandom = createSeededRandom(seed, "study1-dishonest-assignment");
  const fixedDishonestCount = fixedDishonestCountForCondition(condition);
  const fixedDishonestPeerNames = fixedDishonestCount === null
    ? null
    : seededShuffle(peerNames(), createSeededRandom(seed, "study1-fixed-gradient-peers"))
      .slice(0, fixedDishonestCount);
  const fixedDishonestPeerSet = new Set(fixedDishonestPeerNames || []);
  const peerBehaviorAssignments = fixedDishonestPeerNames === null
    ? null
    : Object.fromEntries(peerNames().map((name) => [
      name,
      fixedDishonestPeerSet.has(name) ? "dishonest" : "honest"
    ]));
  const conditionFamily = conditionFamilyForCondition(condition);
  const compositionVersion = compositionVersionForCondition(condition);
  const peerRecordsByRound = diceSequence.map((trueValue, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const dishonestReports = peerDisplayOrder.map(() => randomDishonestReport(trueValue, assignmentRandom));
    const peerRecords = peerDisplayOrder.map((name, index) => {
      const shouldMisreport = fixedDishonestPeerSet.has(name) || (
        condition === ESCALATING_CONDITION &&
        isEscalatingPeerMisreporting(name, roundNumber)
      );
      const underlyingValue = shouldMisreport ? dishonestReports[index] : trueValue;
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
      const reportedValue = shouldMisreport ? dishonestReports[index] : trueValue;
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
    const misreportingPeerNames = condition === "hidden"
      ? null
      : peerRecords
        .filter((record) => record.underlying_reported_value > trueValue)
        .map((record) => record.name);
    return {
      round_index: roundNumber,
      true_die_value: trueValue,
      peer_display_order: peerDisplayOrder,
      peer_records: peerRecords,
      n_peers_misreporting: condition === "hidden" ? null : misreportingPeerNames.length,
      misreporting_peer_names: misreportingPeerNames,
      condition_family: conditionFamily,
      fixed_dishonest_count: fixedDishonestCount,
      fixed_dishonest_peer_names: fixedDishonestPeerNames,
      composition_version: compositionVersion,
      schedule_version: SCHEDULE_VERSION
    };
  });
  return {
    diceSequence,
    peerDisplayOrder,
    peerRecordsByRound,
    conditionFamily,
    fixedDishonestCount,
    fixedDishonestPeerNames,
    peerBehaviorAssignments,
    compositionVersion
  };
}

function createNormPilotStimuli(condition, seed) {
  const factor = normPilot.descriptor(condition);
  if (!factor) throw new Error("Invalid AI Norm Pilot condition");
  const diceSequence = seededShuffle(STUDY1_DICE_MULTISET, createSeededRandom(seed, "study1-dice"));
  const message = normPilot.STIMULI[condition];
  const peerMessagesByRound = diceSequence.map((trueValue, index) => ({
    round_index: index + 1,
    true_die_value: trueValue,
    norm_type: factor.norm_type,
    norm_valence: factor.norm_valence,
    norm_stimulus_id: factor.stimulus_id,
    norm_stimulus_version: normPilot.STIMULUS_VERSION,
    norm_message_text: message,
    peer_messages: STABLE_MEMBER_IDS.map((peerId, peerIndex) => ({
      peer_id: peerId,
      peer_name: `AI Member ${peerIndex + 1}`,
      message,
      stimulus_id: factor.stimulus_id,
      norm_type: factor.norm_type,
      norm_valence: factor.norm_valence,
    })),
  }));
  return { diceSequence, peerMessagesByRound };
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

function sessionNormMessagesByRound(session) {
  return session.study1_norm_messages_by_round || [];
}

function publicStudy1PeerRecords(session, peerRecords = []) {
  const publicRecords = session.condition !== "hidden"
    ? peerRecords
    : peerRecords.map((record) => ({
      member_id: record.member_id,
      name: record.name,
      visibility: "hidden",
      text: record.text
    }));
  if (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION) {
    const prefix = session.peer_identity === "ai" ? "AI Member" : "Human Member";
    return publicRecords.map((record) => {
      const memberNumber = Math.max(1, STABLE_MEMBER_IDS.indexOf(record.member_id) + 1);
      const name = `${prefix} ${memberNumber}`;
      return {
        ...record,
        name,
        text: record.visibility === "hidden"
          ? `${name} completed a report in the Submission System. The report value is not visible to you.`
          : `${name} submitted ${record.reportedValue} in the Submission System.`,
      };
    });
  }
  if (session.locale !== "en") return publicRecords;
  const englishNames = { "张明": "Alex", "李华": "Jordan", "王芳": "Taylor", "陈思": "Morgan" };
  return publicRecords.map((record) => {
    const name = englishNames[record.name] || record.name;
    return {
      ...record,
      name,
      text: record.visibility === "hidden"
        ? `${name} completed a submission to the group-chat AI. The specific content is not visible to you.`
        : `${name} submitted ${record.reportedValue} to the group-chat AI.`
    };
  });
}

function publicDiceRound(session, round) {
  if (!round) return round;
  if (session.protocol_version === normPilot.PROTOCOL_VERSION) return { ...round };
  const {
    n_peers_misreporting,
    misreporting_peer_names,
    condition_family,
    fixed_dishonest_count,
    fixed_dishonest_peer_names,
    composition_version,
    schedule_version,
    ...publicRound
  } = round;
  return {
    ...publicRound,
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
      sequence: shuffle([...(IS_NORM_PILOT ? normPilot.CONDITIONS : CONDITIONS)])
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

async function createSession({ study, participantId, requestedCondition, entry, lockHeld = false, prolificIdentity = null, qaIdentity = null }) {
  validateStudy(study);
  const normalizedParticipant = prolificIdentity?.prolific_pid || qaIdentity?.participant_id || parseParticipantId(participantId);
  if (!normalizedParticipant && REQUIRE_PARTICIPANT_ID) {
    const error = new Error("参与编号缺失。请返回招募平台后通过原始研究链接进入。");
    error.statusCode = 400;
    throw error;
  }
  if (normalizedParticipant && !lockHeld) {
    return withRandomizationLock(async () => {
      return createSession({
        study,
        participantId: normalizedParticipant,
        requestedCondition,
        entry,
        lockHeld: true,
        prolificIdentity
        , qaIdentity
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
    if (ASSIGNMENT_MODE !== "prolific_taskflow" && !(ASSIGNMENT_MODE === "review_only" && prolificIdentity.is_preview)) {
      fail(404, "Prolific Taskflow entry is not enabled.");
    }
  } else if (qaIdentity) {
    // QA assignment is authenticated at the route and never uses recruitment randomization.
  } else if (ASSIGNMENT_MODE === "controlled_link") {
    entryAssignment = resolveEntryAssignment(entry);
  } else if (hasEntry) {
    fail(400, "当前研究未启用指定入口分组。");
  }
  if (!prolificIdentity && !qaIdentity) validateParticipantIdPolicy(normalizedParticipant, entryAssignment);
  const existing = prolificIdentity ? null : (await store.listSessions()).find((session) => (
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
  if (prolificIdentity) {
    condition = prolificIdentity.condition;
    assignmentSource = "prolific_taskflow";
    allocation = {
      assigned_at: now(),
      randomization_block: null,
      randomization_position: null
    };
  } else if (qaIdentity) {
    condition = qaIdentity.condition;
    assignmentSource = qaIdentity.scope || (qaIdentity.team_review ? "team_review" : "qa_preview");
    allocation = { assigned_at: now(), randomization_block: null, randomization_position: null };
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
  const sessionProtocol = prolificIdentity?.protocol_version || qaIdentity?.protocol_version || PROTOCOL_VERSION;
  const isNormSession = sessionProtocol === normPilot.PROTOCOL_VERSION;
  const normStimuli = isNormSession ? createNormPilotStimuli(condition, stimulusSeed) : null;
  const study1Stimuli = study === "study1" && !isNormSession ? createStudy1Stimuli(condition, stimulusSeed) : {
    diceSequence: [],
    peerDisplayOrder: [],
    peerRecordsByRound: [],
    conditionFamily: null,
    fixedDishonestCount: null,
    fixedDishonestPeerNames: null,
    peerBehaviorAssignments: null,
    compositionVersion: null
  };
  const diceSequence = isNormSession ? normStimuli.diceSequence : study1Stimuli.diceSequence;
  const isHumanAiSession = (prolificIdentity?.protocol_version || qaIdentity?.protocol_version) === HUMAN_AI_PROTOCOL_VERSION;
  const persistedPeerRecordsByRound = isHumanAiSession
    ? study1Stimuli.peerRecordsByRound.map((round) => ({
      ...round,
      peer_records: round.peer_records.map((record) => ({
        ...record,
        member_id: STABLE_MEMBER_IDS[peerNames().indexOf(record.name)],
      })),
    }))
    : study1Stimuli.peerRecordsByRound;
  const session = {
    id,
    version: VERSION,
    study_version: STUDY_VERSION,
    protocol_version: sessionProtocol,
    study1_source_commit: isNormSession ? normPilot.STUDY1_SOURCE_COMMIT : null,
    peer_identity: isNormSession ? normPilot.PEER_IDENTITY : (prolificIdentity?.peer_identity || qaIdentity?.peer_identity || null),
    norm_type: isNormSession ? normPilot.descriptor(condition).norm_type : null,
    norm_valence: isNormSession ? normPilot.descriptor(condition).norm_valence : null,
    identity_manipulation_version: (prolificIdentity?.protocol_version || qaIdentity?.protocol_version) === HUMAN_AI_PROTOCOL_VERSION ? IDENTITY_MANIPULATION_VERSION : null,
    condition_map_version: isNormSession ? normPilot.CONDITION_MAP_VERSION : ((prolificIdentity?.protocol_version || qaIdentity?.protocol_version) === HUMAN_AI_PROTOCOL_VERSION ? CONDITION_MAP_VERSION : null),
    posttest_schema_version: isNormSession ? normPilot.POSTTEST_SCHEMA_VERSION : null,
    git_commit: process.env.GIT_COMMIT || "",
    is_qa: Boolean(qaIdentity && (qaIdentity.scope === "qa" || (!qaIdentity.scope && !qaIdentity.team_review))),
    is_team_review: Boolean(qaIdentity?.team_review || qaIdentity?.scope === "team_review"),
    stimulus_version: isNormSession ? normPilot.STIMULUS_VERSION : STIMULUS_VERSION,
    stimulus_seed: stimulusSeed,
    study,
    condition,
    condition_analysis_label: isNormSession ? condition : conditionAnalysisLabelForCondition(condition),
    ...(!isNormSession ? {
      condition_family: study1Stimuli.conditionFamily,
      fixed_dishonest_count: study1Stimuli.fixedDishonestCount,
      fixed_dishonest_peer_names: study1Stimuli.fixedDishonestPeerNames,
      peer_behavior_assignments: study1Stimuli.peerBehaviorAssignments,
      composition_version: study1Stimuli.compositionVersion,
    } : {}),
    condition_assigned_at: allocation.assigned_at,
    assignment_source: assignmentSource,
    entry_link_id: entryLinkId,
    randomization_block: allocation.randomization_block,
    randomization_position: allocation.randomization_position,
    is_test_session: Boolean(qaIdentity) || !IS_PRODUCTION || DEBUG_LINKS,
    condition_label: isNormSession ? condition : ({
      hidden: "同伴具体提交隐藏",
      honest: "同伴如实提交",
      dishonest: "同伴提交更高数字",
      dishonest_escalating: "同伴虚报人数逐步增加",
      dishonest_fixed_1: "固定 1 名同伴提交更高数字",
      dishonest_fixed_2: "固定 2 名同伴提交更高数字",
      dishonest_fixed_3: "固定 3 名同伴提交更高数字"
    }[condition]),
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
    is_preview: Boolean(prolificIdentity?.is_preview || qaIdentity?.scope === "preview"),
    scope: prolificIdentity ? (prolificIdentity.is_preview ? "preview" : "formal") : (qaIdentity?.scope || (qaIdentity?.team_review ? "team_review" : (qaIdentity ? "qa" : null))),
    preview_source: prolificIdentity?.preview_source || null,
    taskflow_variant_id: prolificIdentity?.taskflow_variant_id || null,
    variant_token_hash: prolificIdentity?.variant_token_hash || null,
    record_key: prolificIdentity?.record_key || null,
    assignment_mode: prolificIdentity ? "prolific_taskflow" : (qaIdentity?.scope === "preview" ? "preview" : (qaIdentity?.team_review || qaIdentity?.scope === "team_review" ? "team_review" : (qaIdentity ? "qa_preview" : ASSIGNMENT_MODE))),
    locale: prolificIdentity || qaIdentity ? "en" : "zh-CN",
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
    ...(!isNormSession ? { schedule_version: SCHEDULE_VERSION, peer_onset_rounds: { ...PEER_ONSET_ROUNDS } } : {}),
    study1_die_sequence: diceSequence,
    ...(isNormSession ? {
      study1_norm_messages_by_round: normStimuli.peerMessagesByRound,
    } : {
      study1_peer_display_order: study1Stimuli.peerDisplayOrder,
      study1_peer_records_by_round: persistedPeerRecordsByRound,
      peer_records_sequence: persistedPeerRecordsByRound.map((round) => round.peer_records),
    }),
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
  const recordsByRound = session.protocol_version === normPilot.PROTOCOL_VERSION
    ? sessionNormMessagesByRound(session)
    : sessionPeerRecordsByRound(session);
  if (index >= diceSequence.length) return { completed: true };
  const roundIndex = index + 1;
  const state = session.dice_round_state?.[String(roundIndex)];
  const roundStimulus = recordsByRound[index] || {};
  const payload = {
    completed: false,
    round_index: roundIndex,
    total_rounds: diceSequence.length,
    true_die_value: diceSequence[index],
    selection_started_at: state?.selection_started_at || null,
    decision_timing_accumulated_ms: state?.decision_timing?.accumulated_active_ms || 0,
    page_hidden_duration_accumulated_ms: state?.decision_timing?.accumulated_hidden_ms || 0,
    decision_timing_segment_count: state?.decision_timing?.segments?.length || 0
  };
  if (session.protocol_version === normPilot.PROTOCOL_VERSION) {
    payload.peer_messages = roundStimulus.peer_messages || [];
    payload.norm_stimulus_id = roundStimulus.norm_stimulus_id;
    payload.norm_stimulus_version = roundStimulus.norm_stimulus_version;
    payload.norm_message_text = roundStimulus.norm_message_text;
    payload.norm_type = roundStimulus.norm_type;
    payload.norm_valence = roundStimulus.norm_valence;
  } else {
    payload.peer_records = publicStudy1PeerRecords(session, roundStimulus.peer_records || []);
  }
  return payload;
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
      const allowedValues = item.options.map((option) => (
        typeof option === "object" ? option.value : option
      ));
      if (!allowedValues.includes(value)) invalid.push(item.id);
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

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function filterSessions(sessions, query = {}) {
  const scope = query.scope || "all";
  const dataset = query.dataset || "all";
  const explicitSyntheticScope = scope === "qa" || scope === "team_review" || dataset === "internal";
  const includeTest = explicitSyntheticScope || String(query.include_test || query.includeTest || "").toLowerCase() === "true";
  const condition = query.condition || "all";
  const peerIdentity = query.peer_identity || "all";
  const protocolVersion = query.protocol_version || "all";
  const status = query.status || "all";
  const resumedOnly = String(query.resumed_only || "").toLowerCase() === "true";
  const aliasesOnly = String(query.aliases_only || "").toLowerCase() === "true";
  const recoveryFlag = query.recovery_flag || "all";
  const start = query.start_date ? new Date(`${query.start_date}T00:00:00.000Z`) : null;
  const end = query.end_date ? new Date(`${query.end_date}T23:59:59.999Z`) : null;
  return sessions.filter((session) => {
    const sessionScope = prolificExport.sessionScope(session);
    if (!includeTest && session.is_test_session) return false;
    if (dataset === "recruitment" && !["formal", "preview"].includes(sessionScope)) return false;
    if (dataset === "internal" && !["qa", "team_review"].includes(sessionScope)) return false;
    if (condition !== "all" && condition && session.condition !== condition) return false;
    if (peerIdentity !== "all" && peerIdentity && (session.peer_identity || "human_legacy") !== peerIdentity) return false;
    if (protocolVersion !== "all" && protocolVersion && (session.protocol_version || "legacy") !== protocolVersion) return false;
    if (scope !== "all" && scope && sessionScope !== scope) return false;
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

app.get("/qa-preview", (req, res) => {
  if (!ALLOW_QA_PREVIEW) return res.status(404).send("QA Preview is not enabled.");
  return res.sendFile(path.join(__dirname, "..", "public", "qa-preview.html"));
});

app.get("/review", (req, res) => {
  if (!ALLOW_TEAM_REVIEW) return res.status(404).send("Team Review is not enabled.");
  return res.sendFile(path.join(__dirname, "..", "public", "review.html"));
});

app.get("/preview", (req, res) => {
  if (!ALLOW_PREVIEW) return res.status(404).send("Preview is not enabled.");
  return res.sendFile(path.join(__dirname, "..", "public", "preview.html"));
});

for (const scope of ["formal", "preview", "qa", "team-review"]) {
  app.get(`/admin/${scope}`, (req, res) => res.sendFile(path.join(__dirname, "..", "public", "admin-scope.html")));
}
app.get("/admin", (req, res) => res.redirect(302, "/admin/formal"));

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
    conditions,
    active_matrix: activeCells().map((cell) => {
      const matching = sessions.filter((session) => session.protocol_version === HUMAN_AI_PROTOCOL_VERSION && session.peer_identity === cell.peer_identity && session.condition === cell.condition);
      return {
        ...cell,
        arrived: matching.length,
        started: matching.filter((session) => session.started_at).length,
        completed: matching.filter((session) => session.status === "completed").length,
        data_complete: matching.filter(prolificExport.isDataComplete).length,
        quality_flagged: matching.filter((session) => prolificExport.qualityFlags(session).length > 0).length,
      };
    })
  };
}

app.use("/api/admin", (req, res, next) => {
  if (IS_NORM_PILOT && !req.path.startsWith("/scope/") && req.path !== "/qa/session") {
    return res.status(404).json({ error: "Use a scope-locked AI Norm Pilot Admin endpoint." });
  }
  next();
});

app.post("/api/admin/qa/session", asyncHandler(async (req, res) => {
  if (!ALLOW_QA_PREVIEW) return res.status(404).json({ error: "QA Preview is not enabled." });
  const peerIdentity = String(req.body.peer_identity || "").trim();
  const condition = String(req.body.condition || "").trim();
  if (IS_NORM_PILOT ? !normPilot.isCondition(condition) : (!isPeerIdentity(peerIdentity) || !isSupportedCondition(condition))) {
    return res.status(400).json({ error: "Invalid QA cell." });
  }
  const participantId = `qa_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const session = await createSession({
    study: "study1",
    participantId,
    requestedCondition: condition,
    entry: null,
    qaIdentity: { participant_id: participantId, peer_identity: IS_NORM_PILOT ? "ai" : peerIdentity, condition, protocol_version: IS_NORM_PILOT ? normPilot.PROTOCOL_VERSION : HUMAN_AI_PROTOCOL_VERSION, ...(IS_NORM_PILOT ? { scope: "qa" } : {}) },
  });
  res.json({ session: publicSession(session) });
}));

app.post("/api/review/session", asyncHandler(async (req, res) => {
  if (!ALLOW_TEAM_REVIEW) return res.status(404).json({ error: "Team Review is not enabled." });
  const peerIdentity = String(req.body.peer_identity || "").trim();
  const condition = String(req.body.condition || "").trim();
  if (IS_NORM_PILOT ? !normPilot.isCondition(condition) : (!isPeerIdentity(peerIdentity) || !ACTIVE_HUMAN_AI_CONDITIONS.includes(condition))) return res.status(400).json({ error: "Invalid active review cell." });
  const participantId = `review_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const session = await createSession({ study: "study1", participantId, requestedCondition: condition, entry: null, qaIdentity: { participant_id: participantId, peer_identity: IS_NORM_PILOT ? "ai" : peerIdentity, condition, protocol_version: IS_NORM_PILOT ? normPilot.PROTOCOL_VERSION : HUMAN_AI_PROTOCOL_VERSION, team_review: true, scope: "team_review" } });
  res.json({ session: publicSession(session) });
}));

app.post("/api/preview/session", asyncHandler(async (req, res) => {
  if (!IS_NORM_PILOT || !ALLOW_PREVIEW) return res.status(404).json({ error: "Preview is not enabled." });
  const condition = String(req.body.condition || "").trim();
  if (!normPilot.isCondition(condition)) return res.status(400).json({ error: "Invalid Preview cell." });
  const participantId = `preview_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const session = await createSession({
    study: "study1", participantId, requestedCondition: condition, entry: null,
    qaIdentity: { participant_id: participantId, peer_identity: "ai", condition, protocol_version: normPilot.PROTOCOL_VERSION, scope: "preview" },
  });
  res.json({ session: publicSession(session) });
}));

app.get("/api/config", (req, res) => {
  if (IS_NORM_PILOT) return res.json({
    contact_email: publicContactEmail(),
    members: peerMembersForIdentity("ai"),
    baselineItems: study1.baselineItems,
    postSurveyItems: [],
    demographicsItems: study1.demographicsItems,
    ruleBlocks: normPilot.RULE_BLOCKS,
    comprehensionQuestions: publicComprehensionQuestions(normPilot.COMPREHENSION_QUESTIONS),
  });
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
    protocol_version: PROTOCOL_VERSION,
    formal_recruitment_enabled: IS_NORM_PILOT ? FORMAL_RECRUITMENT_ENABLED : undefined
  });
});

app.post("/api/session", asyncHandler(async (req, res) => {
  if (IS_NORM_PILOT) return res.status(404).json({ error: "Direct participant entry is disabled for this protocol." });
  if (ASSIGNMENT_MODE === "review_only") return res.status(404).json({ error: "Formal participant entry is not configured for this review deployment." });
  const session = await createSession({
    study: "study1",
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
      study: "study1",
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
    if (draft.status !== "created") return draft;
    draft.started_at ||= now();
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
  const existingSession = await store.readSession(req.params.id);
  const questions = comprehensionQuestionsForSession(existingSession);
  const missing = questions.filter((question) => !answers[question.id]);
  if (missing.length) return res.status(400).json({ error: "All comprehension questions must be answered" });
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "rules_viewed") throw new Error("Comprehension requires rules_viewed status");
    const wrong = comprehensionQuestionsForSession(draft)
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

app.get("/api/qa/session/:id", asyncHandler(async (req, res) => {
  if (!ALLOW_QA_PREVIEW) return res.status(404).json({ error: "QA Preview is not enabled." });
  const session = await store.readSession(req.params.id);
  if (!session.is_qa) return res.status(404).json({ error: "QA session not found." });
  res.json({ session: publicSession(session) });
}));

app.get("/api/review/session/:id", asyncHandler(async (req, res) => {
  if (!ALLOW_TEAM_REVIEW) return res.status(404).json({ error: "Team Review is not enabled." });
  const session = await store.readSession(req.params.id);
  if (!session.is_team_review) return res.status(404).json({ error: "Review session not found." });
  res.json({ session: publicSession(session) });
}));

app.get("/api/preview/session/:id", asyncHandler(async (req, res) => {
  if (!ALLOW_PREVIEW) return res.status(404).json({ error: "Preview is not enabled." });
  const session = await previewStore.readSession(req.params.id);
  if (prolificExport.sessionScope(session) !== "preview") return res.status(404).json({ error: "Preview session not found." });
  res.json({ session: publicSession(session) });
}));

app.post("/api/session/:id/decision-timing", asyncHandler(async (req, res) => {
  const roundIndex = Number(req.body.round_index);
  await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "task_in_progress" || roundIndex !== draft.dice_rounds.length + 1) throw new Error("Decision timing does not match the current round");
    mergeDecisionTiming(prepareCurrentDiceRound(draft), req.body);
    return draft;
  });
  res.status(204).end();
}));

app.post("/api/session/:id/dice/round", asyncHandler(async (req, res) => {
  const reported = Number(req.body.reported_value);
  const roundIndex = Number(req.body.round_index);
  const serverReceivedAt = now();
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
    const recordsByRound = draft.protocol_version === normPilot.PROTOCOL_VERSION
      ? sessionNormMessagesByRound(draft)
      : sessionPeerRecordsByRound(draft);
    const trueValue = diceSequence[expectedRound - 1];
    const roundState = draft.dice_round_state?.[String(expectedRound)];
    if (!roundState?.selection_started_at) throw new Error("Dice round was not presented by server");
    const priorReward = draft.dice_rounds.reduce((sum, round) => sum + Number(round.personal_reward), 0);
    const personalReward = Number((reported * study1.rewardPerPoint).toFixed(2));
    const submittedAt = now();
    const startedAt = roundState.selection_started_at;
    const decisionTiming = mergeDecisionTiming(roundState, req.body);
    const stimulusRound = recordsByRound[expectedRound - 1] || {};
    const round = {
      round_index: expectedRound,
      true_die_value: trueValue,
      ...(draft.protocol_version === normPilot.PROTOCOL_VERSION ? {
        norm_type: draft.norm_type,
        norm_valence: draft.norm_valence,
        norm_stimulus_id: stimulusRound.norm_stimulus_id,
        norm_stimulus_version: stimulusRound.norm_stimulus_version,
        norm_message_text: stimulusRound.norm_message_text,
        peer_messages: stimulusRound.peer_messages,
      } : {
        peer_display_order: stimulusRound.peer_display_order || [],
        peer_records: stimulusRound.peer_records || [],
        n_peers_misreporting: stimulusRound.n_peers_misreporting ?? null,
        misreporting_peer_names: stimulusRound.misreporting_peer_names ?? null,
        condition_family: stimulusRound.condition_family ?? draft.condition_family ?? null,
        fixed_dishonest_count: stimulusRound.fixed_dishonest_count ?? draft.fixed_dishonest_count ?? null,
        fixed_dishonest_peer_names: stimulusRound.fixed_dishonest_peer_names ?? draft.fixed_dishonest_peer_names ?? null,
        composition_version: stimulusRound.composition_version ?? draft.composition_version ?? null,
        schedule_version: stimulusRound.schedule_version || draft.schedule_version || SCHEDULE_VERSION,
      }),
      reported_value: reported,
      upward_misreport: reported > trueValue,
      misreport_magnitude: draft.protocol_version === normPilot.PROTOCOL_VERSION ? Math.max(reported - trueValue, 0) : reported - trueValue,
      is_misreport: reported > trueValue,
      misreport_amount: Math.max(reported - trueValue, 0),
      personal_reward: personalReward,
      reward: personalReward,
      cumulative_reward: Number((priorReward + personalReward).toFixed(2)),
      selection_started_at: startedAt,
      submitted_at: submittedAt,
      decision_duration_ms: Math.max(0, new Date(submittedAt) - new Date(startedAt)),
      decision_started_at_client: String(req.body.decision_started_at_client || "") || null,
      decision_submitted_at_client: String(req.body.decision_submitted_at_client || "") || null,
      decision_time_ms: decisionTiming.accumulated_active_ms,
      page_hidden_duration_ms: decisionTiming.accumulated_hidden_ms,
      timer_resumed_after_reload: decisionTiming.segments.length > 1 || Boolean(req.body.timer_resumed_after_reload),
      decision_timing_segments: decisionTiming.segments,
      server_received_at: serverReceivedAt,
      saved_at: submittedAt,
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
  const existingSession = await store.readSession(req.params.id);
  const validation = validateItems(postSurveyItemsForSession(existingSession), responses);
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
  const existingSession = await store.readSession(req.params.id);
  const validation = validateItems(demographicsItemsForSession(existingSession), responses);
  if (validation.error) return res.status(400).json(validation);
  const session = await store.updateSession(req.params.id, (draft) => {
    if (draft.status !== "post_survey_completed") throw new Error("Demographics requires post_survey_completed status");
    const storedDemographics = { ...responses };
    if (draft.protocol_version === HUMAN_AI_PROTOCOL_VERSION) {
      draft.post_survey.open_decision_factors = storedDemographics.open_decision_factors;
      delete storedDemographics.open_decision_factors;
    }
    draft.demographics = storedDemographics;
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

app.get("/api/admin/summary", asyncHandler(async (req, res) => {
  let sessions = filterSessions(await store.listSessions(), req.query);
  if (ASSIGNMENT_MODE === "prolific_taskflow") sessions = sessions.filter((session) => !session.is_preview);
  res.json({ version: VERSION, summary: exporters.summary(sessions), data_dir: store.DATA_DIR });
}));

app.get("/api/admin/export/json", asyncHandler(async (req, res) => {
  res.json({ version: VERSION, sessions: filterSessions(await store.listSessions(), req.query) });
}));

app.get("/api/admin/session/:id", asyncHandler(async (req, res) => {
  const session = await store.readSession(req.params.id);
  res.json({
    metadata: prolificExport.adminRows([session])[0],
    rounds: session.dice_rounds || [],
    survey: { baseline: session.baseline || {}, post_survey: session.post_survey || {}, demographics: session.demographics || {} },
    quality_flags: prolificExport.qualityFlags(session),
    completion: { status: session.status, completed_at: session.completed_at || null, completion_ready_at: session.completion_ready_at || null, redirect_initiated_at: session.completion_redirect_initiated_at || null },
  });
}));

async function adminSessionsForQuery(query = {}) {
  const scope = String(query.scope || "").trim();
  const dataset = String(query.dataset || "").trim();
  if (dataset === "recruitment" || ["formal", "preview"].includes(scope)) return recruitmentStore.listSessions();
  if (dataset === "internal" || ["qa", "team_review"].includes(scope)) return internalStore.listSessions();
  return store.listSessions();
}

app.get("/api/admin/records", asyncHandler(async (req, res) => {
  const sessions = filterSessions(await adminSessionsForQuery(req.query), req.query);
  res.json({ participants: prolificExport.adminRows(sessions) });
}));

app.get("/api/admin/datasets", asyncHandler(async (req, res) => {
  const recruitmentSessions = await recruitmentStore.listSessions();
  const internalSessions = await internalStore.listSessions();
  const historical = await legacyStore.listSessions();
  const byScope = (sessions, scope) => sessions.filter((session) => prolificExport.sessionScope(session) === scope);
  const formal = byScope(recruitmentSessions, "formal");
  const preview = byScope(recruitmentSessions, "preview");
  const qa = byScope(internalSessions, "qa");
  const teamReview = byScope(internalSessions, "team_review");
  const internal = [...qa, ...teamReview];
  res.json({
    recruitment: {
      formal: formal.length,
      preview: preview.length,
      formal_completed: formal.filter((session) => session.status === "completed").length,
      formal_incomplete: formal.filter((session) => session.status !== "completed").length,
      formal_matrix: prolificAdminSummary(formal).active_matrix,
      preview_matrix: prolificAdminSummary(preview).active_matrix,
    },
    internal: {
      qa: qa.length,
      team_review: teamReview.length,
      total: internal.length,
      all_matrix: prolificAdminSummary(internal).active_matrix,
      qa_matrix: prolificAdminSummary(qa).active_matrix,
      team_review_matrix: prolificAdminSummary(teamReview).active_matrix,
    },
    historical: { count: historical.length, read_only: true, data_dir: legacyStore.DATA_DIR },
    storage: {
      recruitment_data_dir: recruitmentStore.DATA_DIR,
      internal_data_dir: internalStore.DATA_DIR,
      historical_data_dir: legacyStore.DATA_DIR,
    },
  });
}));

app.get("/api/admin/integrity", asyncHandler(async (req, res) => {
  const recruitmentSessions = await recruitmentStore.listSessions();
  const internalSessions = await internalStore.listSessions();
  const sessions = [...recruitmentSessions, ...internalSessions];
  const sessionsFor = (scope) => {
    const source = ["formal", "preview"].includes(scope) ? recruitmentSessions : internalSessions;
    return source.filter((session) => prolificExport.sessionScope(session) === scope);
  };
  const idsFor = (scope) => new Set(sessionsFor(scope).map((session) => session.record_key || session.id));
  const overlapCount = (left, right) => [...left].filter((id) => right.has(id)).length;
  const scopeNames = ["formal", "preview", "qa", "team_review"];
  const scopeSessions = Object.fromEntries(scopeNames.map((scope) => [scope, sessionsFor(scope)]));
  const [formal, preview, qa, teamReview] = scopeNames.map(idsFor);
  const check = (id, label, overlap) => ({ id, label, status: overlap === 0 ? "PASS" : "WARNING", detail: overlap === 0 ? "No overlapping records." : `${overlap} overlapping record(s).` });
  const predicateCheck = (id, label, matching, total) => ({ id, label, status: matching === total ? "PASS" : "WARNING", detail: `${matching} of ${total} record(s) satisfy the requirement.` });
  const countCheck = (id, label, bundleCount, scopeCount) => ({ id, label, status: bundleCount === scopeCount ? "PASS" : "WARNING", detail: `Bundle selector: ${bundleCount}; scope: ${scopeCount}.` });
  const resolvedDirectories = [recruitmentStore.DATA_DIR, internalStore.DATA_DIR, legacyStore.DATA_DIR].map((item) => path.resolve(item));
  const directoriesSeparate = new Set(resolvedDirectories).size === resolvedDirectories.length;
  const recruitmentContamination = recruitmentSessions.filter((session) => !["formal", "preview"].includes(prolificExport.sessionScope(session))).length;
  const internalContamination = internalSessions.filter((session) => !["qa", "team_review"].includes(prolificExport.sessionScope(session))).length;
  const formalContamination = {
    qa: scopeSessions.formal.filter((session) => session.is_qa === true).length,
    team_review: scopeSessions.formal.filter((session) => session.is_team_review === true).length,
    preview: scopeSessions.formal.filter((session) => session.is_preview === true).length,
  };
  const keyScopes = new Map();
  for (const scope of scopeNames) for (const session of scopeSessions[scope]) {
    const key = session.record_key || session.id;
    if (!keyScopes.has(key)) keyScopes.set(key, new Set());
    keyScopes.get(key).add(scope);
  }
  const crossScopeDuplicates = [...keyScopes.values()].filter((scopes) => scopes.size > 1).length;
  res.json({
    checks: [
      check("formal_qa_overlap", "Formal / QA overlap", overlapCount(formal, qa)),
      check("formal_team_review_overlap", "Formal / Team Review overlap", overlapCount(formal, teamReview)),
      check("formal_preview_separation", "Formal / Preview separation", overlapCount(formal, preview)),
      predicateCheck("qa_identity", "QA records satisfy is_qa=true", scopeSessions.qa.filter((session) => session.is_qa === true).length, scopeSessions.qa.length),
      predicateCheck("team_review_identity", "Team Review records satisfy is_team_review=true", scopeSessions.team_review.filter((session) => session.is_team_review === true).length, scopeSessions.team_review.length),
      { id: "formal_contamination", label: "Formal contains no QA / Team Review / Preview", status: Object.values(formalContamination).every((count) => count === 0) ? "PASS" : "WARNING", detail: `QA: ${formalContamination.qa}; Team Review: ${formalContamination.team_review}; Preview: ${formalContamination.preview}.` },
      predicateCheck("preview_identity", "Preview records satisfy is_preview=true", scopeSessions.preview.filter((session) => session.is_preview === true).length, scopeSessions.preview.length),
      { id: "cross_scope_duplicates", label: "No duplicate record key across scopes", status: crossScopeDuplicates === 0 ? "PASS" : "WARNING", detail: `${crossScopeDuplicates} record key(s) occur in multiple scopes.` },
      { id: "historical_read_only", label: "Historical source read-only", status: "PASS", detail: "Historical access uses the read-only legacy store." },
      { id: "data_directories_separate", label: "Recruitment / Internal / Historical directories separate", status: directoriesSeparate ? "PASS" : "WARNING", detail: directoriesSeparate ? "All three physical data directories are distinct." : "Two or more physical data directories resolve to the same path." },
      { id: "recruitment_store_scope", label: "Recruitment store contains only Formal / Preview", status: recruitmentContamination === 0 ? "PASS" : "WARNING", detail: `${recruitmentContamination} out-of-scope record(s).` },
      { id: "internal_store_scope", label: "Internal store contains only QA / Team Review", status: internalContamination === 0 ? "PASS" : "WARNING", detail: `${internalContamination} out-of-scope record(s).` },
      countCheck("formal_bundle_count", "Formal bundle count equals Formal scope", sessions.filter((session) => prolificExport.sessionScope(session) === "formal").length, scopeSessions.formal.length),
      countCheck("preview_bundle_count", "Preview bundle count equals Preview scope", sessions.filter((session) => prolificExport.sessionScope(session) === "preview").length, scopeSessions.preview.length),
      countCheck("qa_bundle_count", "QA bundle count equals QA scope", sessions.filter((session) => prolificExport.sessionScope(session) === "qa" && session.is_qa === true).length, scopeSessions.qa.length),
      countCheck("team_review_bundle_count", "Team Review bundle count equals Team Review scope", sessions.filter((session) => prolificExport.sessionScope(session) === "team_review" && session.is_team_review === true).length, scopeSessions.team_review.length),
    ],
    recruitment_data_dir: recruitmentStore.DATA_DIR,
    internal_data_dir: internalStore.DATA_DIR,
    historical_data_dir: legacyStore.DATA_DIR,
  });
}));

app.get("/api/admin/legacy/summary", asyncHandler(async (req, res) => {
  const sessions = filterSessions(await legacyStore.listSessions(), { ...req.query, scope: "all" });
  res.json({ read_only: true, record_count: sessions.length, data_dir: legacyStore.DATA_DIR, summary: exporters.summary(sessions) });
}));

app.get("/api/admin/legacy/records", asyncHandler(async (req, res) => {
  const sessions = filterSessions(await legacyStore.listSessions(), { ...req.query, scope: "all" });
  res.json({ read_only: true, participants: prolificExport.adminRows(sessions) });
}));

app.get("/api/admin/legacy/session/:id", asyncHandler(async (req, res) => {
  const session = await legacyStore.readSession(req.params.id);
  res.json({
    read_only: true,
    metadata: prolificExport.adminRows([session])[0],
    rounds: session.dice_rounds || [],
    survey: { baseline: session.baseline || {}, post_survey: session.post_survey || {}, demographics: session.demographics || {} },
    quality_flags: prolificExport.qualityFlags(session),
    completion: { status: session.status, completed_at: session.completed_at || null }
  });
}));

app.get("/api/admin/prolific-summary", asyncHandler(async (req, res) => {
  const filteredSessions = filterSessions(await store.listSessions(), req.query);
  const allSessions = filteredSessions.filter((session) => session.assignment_mode === "prolific_taskflow");
  const recordKind = req.query.record_kind || "all";
  const sessions = recordKind === "preview" ? [] : allSessions.filter((session) => !session.is_preview);
  const previewSessions = recordKind === "formal" ? [] : allSessions.filter((session) => session.is_preview);
  const formal = prolificAdminSummary(sessions);
  const preview = prolificAdminSummary(previewSessions);
  res.json({ preview_mode_enabled: prolificSupport.previewMode, active_matrix: prolificAdminSummary(filteredSessions).active_matrix, formal, preview, conditions: formal.conditions, preview_conditions: preview.conditions, participants: prolificExport.adminRows(sessions), preview_participants: prolificExport.adminRows(previewSessions) });
}));

app.get("/api/admin/export/prolific-bundle.zip", asyncHandler(async (req, res) => {
  const sessions = (await store.listSessions()).filter((session) => prolificExport.sessionScope(session) === "formal");
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions, process.env, { protocolVersion: HUMAN_AI_PROTOCOL_VERSION }));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-human-ai-formal-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/prolific-preview-bundle.zip", asyncHandler(async (req, res) => {
  const sessions = (await store.listSessions()).filter((session) => prolificExport.sessionScope(session) === "preview");
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions, process.env, { protocolVersion: HUMAN_AI_PROTOCOL_VERSION }));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-human-ai-preview-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/qa-bundle.zip", asyncHandler(async (req, res) => {
  const sessions = (await store.listSessions()).filter((session) => prolificExport.sessionScope(session) === "qa" && session.is_qa === true);
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions, process.env, { protocolVersion: HUMAN_AI_PROTOCOL_VERSION }));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-human-ai-qa-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/team-review-bundle.zip", asyncHandler(async (req, res) => {
  const sessions = (await store.listSessions()).filter((session) => prolificExport.sessionScope(session) === "team_review" && session.is_team_review === true);
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions, process.env, { protocolVersion: HUMAN_AI_PROTOCOL_VERSION }));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-human-ai-team-review-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/legacy-study1-bundle.zip", asyncHandler(async (req, res) => {
  const sessions = await legacyStore.listSessions();
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions));
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-historical-readonly-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
}));

app.get("/api/admin/export/participants.csv", asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.participantsCsv(filterSessions(await store.listSessions(), req.query)));
}));

app.get("/api/admin/export/study1_dice_rounds.csv", asyncHandler(async (req, res) => {
  res.type("text/csv").send(exporters.study1DiceRoundsCsv(filterSessions(await store.listSessions(), req.query)));
}));

function normAdminAuth(req, res, next) {
  if (!IS_NORM_PILOT) return next();
  const expected = String(process.env.ADMIN_TOKEN || "");
  const supplied = String(req.get("x-admin-token") || "");
  if (!expected || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: "Admin authentication required." });
  }
  next();
}

function normalizedScope(value) {
  return value === "team-review" ? "team_review" : value;
}

app.use("/api/admin/scope", normAdminAuth);

app.get("/api/admin/scope/:scope/summary", asyncHandler(async (req, res) => {
  const scope = normalizedScope(req.params.scope);
  if (!IS_NORM_PILOT || !["formal", "preview", "qa", "team_review"].includes(scope)) return res.status(404).json({ error: "Scope not found." });
  const sessions = await storeForScope(scope).listSessions();
  const matrix = normPilot.cells().map((cell) => {
    const matching = sessions.filter((session) => session.condition === cell.condition);
    return { ...cell, arrived: matching.length, started: matching.filter((session) => session.started_at).length, completed: matching.filter((session) => session.status === "completed").length, data_complete: matching.filter(prolificExport.isDataComplete).length };
  });
  res.json({ scope, protocol_version: normPilot.PROTOCOL_VERSION, matrix, participants: prolificExport.adminRows(sessions) });
}));

app.get("/api/admin/scope/:scope/session/:id", asyncHandler(async (req, res) => {
  const scope = normalizedScope(req.params.scope);
  if (!IS_NORM_PILOT || !["formal", "preview", "qa", "team_review"].includes(scope)) return res.status(404).json({ error: "Scope not found." });
  const session = await storeForScope(scope).readSession(req.params.id);
  if (prolificExport.sessionScope(session) !== scope) return res.status(404).json({ error: "Session not found in this scope." });
  res.json({ metadata: prolificExport.adminRows([session])[0], rounds: session.dice_rounds || [], survey: { baseline: session.baseline || {}, post_survey: session.post_survey || {}, demographics: session.demographics || {} } });
}));

app.get("/api/admin/scope/:scope/export.zip", asyncHandler(async (req, res) => {
  const scope = normalizedScope(req.params.scope);
  if (!IS_NORM_PILOT || !["formal", "preview", "qa", "team_review"].includes(scope)) return res.status(404).json({ error: "Scope not found." });
  const sessions = await storeForScope(scope).listSessions();
  const archive = prolificExport.zip(prolificExport.buildFiles(sessions, process.env, { protocolVersion: normPilot.PROTOCOL_VERSION, exportScope: scope }));
  const slug = scope.replace("_", "-");
  res.set("content-type", "application/zip");
  res.set("content-disposition", `attachment; filename="study1-ai-norm-pilot-${slug}-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(archive);
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
  const status = error.statusCode || 409;
  res.status(status).json({ error: error.message || "Server error" });
});

async function validateRuntime() {
  if (!IS_PRODUCTION) {
    await store.ensureDataDir();
    return;
  }
  if (IS_NORM_PILOT) {
    const keys = ["FORMAL_DATA_DIR", "PREVIEW_DATA_DIR", "QA_DATA_DIR", "TEAM_REVIEW_DATA_DIR"];
    for (const key of keys) {
      if (!process.env[key] || !path.isAbsolute(process.env[key])) throw new Error(`${key} must be an absolute path in production`);
    }
    const resolved = keys.map((key) => path.resolve(process.env[key]));
    if (new Set(resolved).size !== 4) throw new Error("All four AI Norm Pilot data directories must be physically separate");
    if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.length < 32) throw new Error("ADMIN_TOKEN must contain at least 32 characters");
    if (!process.env.SERVER_RECORD_SECRET || process.env.SERVER_RECORD_SECRET.length < 32) throw new Error("SERVER_RECORD_SECRET must contain at least 32 characters");
    if (FORMAL_RECRUITMENT_ENABLED && (process.env.PROLIFIC_EXPECTED_STUDY_ID === "__PENDING__" || process.env.PROLIFIC_COMPLETION_URL === "__PENDING__")) throw new Error("Formal recruitment cannot open with pending Prolific values");
    await store.ensureDataDir();
    return;
  }
  if (!process.env.DATA_DIR) throw new Error("DATA_DIR must be set in production");
  if (!process.env.RECRUITMENT_DATA_DIR) throw new Error("RECRUITMENT_DATA_DIR must be set in production");
  if (!process.env.LEGACY_STUDY1_DATA_DIR) throw new Error("LEGACY_STUDY1_DATA_DIR must be set in production");
  if (!STUDY_CONTACT_EMAIL) throw new Error("STUDY_CONTACT_EMAIL must be set in production");
  if (!path.isAbsolute(process.env.DATA_DIR)) throw new Error("DATA_DIR must be an absolute path in production");
  if (!path.isAbsolute(process.env.RECRUITMENT_DATA_DIR)) throw new Error("RECRUITMENT_DATA_DIR must be an absolute path in production");
  if (!path.isAbsolute(process.env.LEGACY_STUDY1_DATA_DIR)) throw new Error("LEGACY_STUDY1_DATA_DIR must be an absolute path in production");
  const runtimeDirectories = [process.env.DATA_DIR, process.env.RECRUITMENT_DATA_DIR, process.env.LEGACY_STUDY1_DATA_DIR].map((item) => path.resolve(item));
  if (new Set(runtimeDirectories).size !== runtimeDirectories.length) throw new Error("Recruitment, Internal, and Historical Study1 data directories must remain separate");
  await fs.promises.access(process.env.LEGACY_STUDY1_DATA_DIR, fs.constants.R_OK);
  await store.ensureDataDir();
  for (const writableStore of [internalStore, recruitmentStore]) {
    const parent = path.dirname(writableStore.DATA_DIR);
    await fs.promises.mkdir(parent, { recursive: true });
    const probe = path.join(parent, `.write-test-${process.pid}-${Date.now()}`);
    await fs.promises.writeFile(probe, "ok", "utf8");
    await fs.promises.unlink(probe);
  }
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
  createStudy1Stimuli,
  publicStudy1PeerRecords,
  peerMembersForIdentity,
  postSurveyItemsForSession,
  comprehensionQuestionsForSession,
  filterSessions,
  createNormPilotStimuli,
  normPilot,
  storeForScope,
};

module.exports = app;
