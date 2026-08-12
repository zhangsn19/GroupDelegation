const crypto = require("crypto");
const {
  activeCells,
  isActiveCondition,
  isActiveVariantId,
  isPeerIdentity,
  PROTOCOL_VERSION,
} = require("../config/human-ai-protocol");

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function configError(message) {
  const error = new Error(message);
  error.code = "PROLIFIC_CONFIG_ERROR";
  return error;
}

function requestError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function parseVariantMap(raw) {
  let parsed;
  try { parsed = JSON.parse(raw || "{}"); } catch { throw configError("PROLIFIC_VARIANT_MAP_JSON must be valid JSON"); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw configError("PROLIFIC_VARIANT_MAP_JSON must be an object");
  const entries = Object.entries(parsed);
  if (!entries.length) throw configError("PROLIFIC_VARIANT_MAP_JSON must not be empty");
  const map = new Map();
  for (const [token, value] of entries) {
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) throw configError("Each Prolific variant token must be opaque and at least 32 bytes");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw configError("Each Prolific variant must be an object descriptor");
    const descriptor = {
      peer_identity: String(value.peer_identity || "").trim(),
      condition: String(value.condition || "").trim(),
      variant_id: String(value.variant_id || value.id || "").trim(),
    };
    if (!isPeerIdentity(descriptor.peer_identity) || !isActiveCondition(descriptor.condition) || !isActiveVariantId(descriptor.variant_id)) {
      throw configError("Each Prolific variant must contain a valid Study2 Human-AI descriptor");
    }
    if (descriptor.variant_id !== `${descriptor.peer_identity}_${descriptor.condition}`) throw configError("Prolific variant_id must match its peer identity and condition");
    map.set(token, descriptor);
  }
  return map;
}

function createProlificSupport({ assignmentMode, isProduction, env = process.env }) {
  const formalEnabled = String(env.FORMAL_RECRUITMENT_ENABLED || "").toLowerCase() === "true";
  const previewMode = String(env.PROLIFIC_PREVIEW_MODE || "").toLowerCase() === "true";
  const active = assignmentMode === "prolific_taskflow" || assignmentMode === "review_only";
  const expectedStudyId = String(env.PROLIFIC_EXPECTED_STUDY_ID || "").trim();
  const completionUrl = String(env.PROLIFIC_COMPLETION_URL || "").trim();
  const recordSecret = String(env.SERVER_RECORD_SECRET || "").trim();
  const bonusCurrency = String(env.BONUS_CURRENCY || "").trim();
  const bonusDisplayLabel = String(env.BONUS_DISPLAY_LABEL || "").trim();
  let variants = new Map();

  if (active) {
    variants = parseVariantMap(env.PROLIFIC_VARIANT_MAP_JSON);
    const expectedCells = new Set(activeCells().map((cell) => `${cell.peer_identity}|${cell.condition}|${cell.variant_id}`));
    const mappedCells = [...variants.values()].map((item) => `${item.peer_identity}|${item.condition}|${item.variant_id}`);
    if (variants.size !== expectedCells.size || new Set(mappedCells).size !== expectedCells.size || mappedCells.some((item) => !expectedCells.has(item))) {
      throw configError("PROLIFIC_VARIANT_MAP_JSON must map exactly once to all six active Study2 Human-AI cells");
    }
    if (recordSecret.length < 32) throw configError("SERVER_RECORD_SECRET must contain at least 32 characters");
    if (formalEnabled) {
      if (assignmentMode !== "prolific_taskflow") throw configError("Formal recruitment requires ASSIGNMENT_MODE=prolific_taskflow");
      if (!expectedStudyId || !ID_PATTERN.test(expectedStudyId)) throw configError("PROLIFIC_EXPECTED_STUDY_ID is required when Formal recruitment is enabled");
      try {
        const url = new URL(completionUrl);
        if (url.protocol !== "https:" || !/(^|\.)prolific\.com$/i.test(url.hostname)) throw new Error("invalid");
      } catch { throw configError("PROLIFIC_COMPLETION_URL must be an HTTPS Prolific URL when Formal recruitment is enabled"); }
      if (!env.STUDY_CONTACT_EMAIL) throw configError("STUDY_CONTACT_EMAIL is required when Formal recruitment is enabled");
    }
  } else if (formalEnabled) {
    throw configError("Formal recruitment cannot be enabled outside prolific_taskflow mode");
  } else if (isProduction && assignmentMode === "block") {
    // Legacy/development mode remains available, but cannot become Formal.
  }

  function validateId(value, field) {
    const normalized = String(value || "").trim();
    if (!ID_PATTERN.test(normalized)) throw requestError(400, "invalid_prolific_parameters", `${field} is missing or invalid.`);
    return normalized;
  }

  function validateRequest(body = {}) {
    if (!active) throw requestError(404, "prolific_mode_disabled", "This Prolific entry is not enabled.");
    const previewRequested = body.preview === true || String(body.preview || "").toLowerCase() === "true";
    if (previewRequested && !previewMode) throw requestError(403, "preview_mode_disabled", "Researcher Preview is not enabled for this study.");
    if (!previewRequested && !formalEnabled) throw requestError(403, "formal_mode_disabled", "Formal recruitment is not enabled for this study.");
    const variant = String(body.variant || "").trim();
    const descriptor = variants.get(variant);
    if (!descriptor) throw requestError(403, "invalid_variant", "This Taskflow assignment is not valid.");

    const generated = crypto.randomUUID().replace(/-/g, "");
    const optionalId = (value, fallback, field) => {
      const normalized = String(value || "").trim();
      return normalized ? validateId(normalized, field) : fallback;
    };
    const prolificPid = previewRequested
      ? optionalId(body.PROLIFIC_PID ?? body.prolific_pid, `preview_${generated.slice(0, 20)}`, "PROLIFIC_PID")
      : validateId(body.PROLIFIC_PID ?? body.prolific_pid, "PROLIFIC_PID");
    const studyId = previewRequested
      ? optionalId(body.STUDY_ID ?? body.prolific_study_id, "preview_study", "STUDY_ID")
      : validateId(body.STUDY_ID ?? body.prolific_study_id, "STUDY_ID");
    const sessionId = previewRequested
      ? optionalId(body.SESSION_ID ?? body.prolific_session_id, `preview_session_${generated.slice(0, 20)}`, "SESSION_ID")
      : validateId(body.SESSION_ID ?? body.prolific_session_id, "SESSION_ID");
    if (!previewRequested && studyId !== expectedStudyId) throw requestError(403, "invalid_study_id", "This study link is not valid.");

    const scope = previewRequested ? "preview" : "formal";
    return {
      prolific_pid: prolificPid,
      prolific_study_id: studyId,
      prolific_session_id: sessionId,
      taskflow_variant_id: descriptor.variant_id,
      variant_id: descriptor.variant_id,
      variant_token_hash: crypto.createHash("sha256").update(variant).digest("hex"),
      peer_identity: descriptor.peer_identity,
      condition: descriptor.condition,
      protocol_version: PROTOCOL_VERSION,
      assignment_mode: "prolific_taskflow",
      locale: "en",
      scope,
      is_preview: previewRequested,
      preview_source: previewRequested ? (body.PROLIFIC_PID || body.prolific_pid ? "prolific_preview" : "researcher_preview") : null,
      record_key: crypto.createHmac("sha256", recordSecret).update(`${scope}|${studyId}|${previewRequested ? sessionId : prolificPid}`).digest("hex"),
    };
  }

  function assertSameVariant(session, identity) {
    return session.taskflow_variant_id === identity.taskflow_variant_id &&
      session.variant_token_hash === identity.variant_token_hash &&
      session.peer_identity === identity.peer_identity &&
      session.condition === identity.condition &&
      session.protocol_version === identity.protocol_version;
  }

  function findExisting(sessions, identity) {
    const aliases = (session) => [...new Set([session.prolific_session_id, session.primary_prolific_session_id, session.current_prolific_session_id, ...(Array.isArray(session.prolific_session_aliases) ? session.prolific_session_aliases : [])].filter(Boolean))];
    const sameSubmission = sessions.find((session) => aliases(session).includes(identity.prolific_session_id));
    if (sameSubmission) {
      if (sameSubmission.prolific_pid !== identity.prolific_pid || sameSubmission.prolific_study_id !== identity.prolific_study_id || Boolean(sameSubmission.is_preview) !== Boolean(identity.is_preview)) {
        const error = requestError(409, "identity_conflict", "This Prolific submission is already linked to a different identity."); error.audit_type = "identity_conflict"; error.session_id = sameSubmission.id; throw error;
      }
      if (!assertSameVariant(sameSubmission, identity)) {
        const error = requestError(409, "variant_conflict", "This Prolific submission was assigned through a different Taskflow variant."); error.audit_type = "variant_resume_conflict"; error.session_id = sameSubmission.id; throw error;
      }
      return { session: sameSubmission, action: "resume_same_submission" };
    }
    if (identity.is_preview) return null;
    const sameParticipant = sessions.find((session) => session.scope === "formal" && session.prolific_pid === identity.prolific_pid && session.prolific_study_id === identity.prolific_study_id);
    if (!sameParticipant) return null;
    if (!assertSameVariant(sameParticipant, identity)) {
      const error = requestError(409, "variant_conflict", "Your saved study record belongs to a different Taskflow assignment. Please return to Prolific or contact the research team."); error.audit_type = "variant_resume_conflict"; error.session_id = sameParticipant.id; throw error;
    }
    if (sameParticipant.status !== "completed" && sameParticipant.completion_status !== "completed") return { session: sameParticipant, action: "resume_new_submission" };
    const error = requestError(409, "duplicate_participation", "You have already taken part in this study. Please return to Prolific."); error.audit_type = "completed_duplicate_attempt"; error.session_id = sameParticipant.id; throw error;
  }

  return { active, assignmentMode, formalEnabled, completionUrl, bonusCurrency, bonusDisplayLabel, previewMode, variants, validateRequest, findExisting };
}

module.exports = { createProlificSupport, parseVariantMap };
