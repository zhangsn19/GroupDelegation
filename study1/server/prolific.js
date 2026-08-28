const crypto = require("crypto");
const {
  PROTOCOL_VERSION: HUMAN_AI_PROTOCOL_VERSION,
  isPeerIdentity,
  isActiveHumanAiCondition,
  activeCells,
} = require("../config/human-ai-protocol");
const normSupplement = require("../config/norm-supplement-protocol");

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

function parseVariantMap(raw, allowedConditions, options = {}) {
  const protocolVersion = options.protocolVersion || HUMAN_AI_PROTOCOL_VERSION;
  const requiredCells = options.expectedCells || activeCells();
  let parsed;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw configError("PROLIFIC_VARIANT_MAP_JSON must be valid JSON");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw configError("PROLIFIC_VARIANT_MAP_JSON must be an object");
  }
  const entries = Object.entries(parsed);
  if (!entries.length) throw configError("PROLIFIC_VARIANT_MAP_JSON must not be empty");
  const map = new Map();
  for (const [token, value] of entries) {
    if (!/^[A-Za-z0-9_-]{43,256}$/.test(token)) {
      throw configError("Each Prolific variant token must be opaque and at least 32 bytes");
    }
    const isLegacyString = typeof value === "string";
    const isLegacy = isLegacyString || !Object.prototype.hasOwnProperty.call(value || {}, "peer_identity");
    const descriptor = isLegacyString ? { condition: value, variant_id: `legacy_${value}` } : value;
    const condition = String(descriptor?.condition || "").trim();
    const variantId = String(descriptor?.variant_id || descriptor?.id || "").trim();
    if (!allowedConditions.includes(condition) || !ID_PATTERN.test(variantId)) {
      throw configError("Each Prolific variant must have a valid variant_id and condition");
    }
    const peerIdentity = String(descriptor?.peer_identity || "").trim();
    const isAllowedObjectCell = requiredCells.some((cell) => (
      cell.peer_identity === peerIdentity && (cell.condition || cell.source_condition) === condition
    ));
    if (!isLegacy && (!isPeerIdentity(peerIdentity) || !isAllowedObjectCell)) {
      throw configError("Variant objects require a valid peer_identity and active condition");
    }
    const analysisCondition = String(descriptor?.analysis_condition || normSupplement.analysisConditionFor(condition) || "").trim() || null;
    map.set(token, {
      condition,
      source_condition: condition,
      analysis_condition: analysisCondition,
      variant_id: variantId,
      peer_identity: isLegacy ? null : peerIdentity,
      protocol_version: isLegacy ? null : protocolVersion,
      mapping_format: isLegacy ? "legacy_string" : "cell_object",
    });
  }
  return map;
}

function createProlificSupport({
  assignmentMode,
  isProduction,
  allowedConditions,
  expectedVariantCount,
  protocolVersion = HUMAN_AI_PROTOCOL_VERSION,
  expectedCells = activeCells(),
  formalRecruitmentEnabled,
  env = process.env,
}) {
  const formalActive = assignmentMode === "prolific_taskflow" && formalRecruitmentEnabled !== false;
  const expectedStudyId = String(env.PROLIFIC_EXPECTED_STUDY_ID || "").trim();
  const completionUrl = String(env.PROLIFIC_COMPLETION_URL || "").trim();
  const recordSecret = String(env.SERVER_RECORD_SECRET || "").trim();
  const bonusCurrency = String(env.BONUS_CURRENCY || "").trim();
  const bonusDisplayLabel = String(env.BONUS_DISPLAY_LABEL || "").trim();
  const previewMode = String(env.PROLIFIC_PREVIEW_MODE || "").toLowerCase() === "true";
  const previewOnly = !formalActive && previewMode && ["review_only", "prolific_taskflow"].includes(assignmentMode);
  const active = formalActive || previewOnly;
  let variants = new Map();

  if (active) {
    if (formalActive) {
      if (!expectedStudyId || !ID_PATTERN.test(expectedStudyId)) {
        throw configError("PROLIFIC_EXPECTED_STUDY_ID is required");
      }
      try {
        const url = new URL(completionUrl);
        if (url.protocol !== "https:" || !/prolific\.com$/i.test(url.hostname)) {
          throw new Error("invalid");
        }
      } catch {
        throw configError("PROLIFIC_COMPLETION_URL must be an HTTPS Prolific URL");
      }
    }
    if (recordSecret.length < 32) {
      throw configError("SERVER_RECORD_SECRET must contain at least 32 characters");
    }
    if (!env.STUDY_CONTACT_EMAIL) {
      throw configError("STUDY_CONTACT_EMAIL is required in prolific_taskflow mode");
    }
    variants = parseVariantMap(env.PROLIFIC_VARIANT_MAP_JSON, allowedConditions, { protocolVersion, expectedCells });
    const descriptors = [...variants.values()];
    const legacy = descriptors.every((item) => item.mapping_format === "legacy_string");
    const cellObjects = descriptors.every((item) => item.mapping_format === "cell_object");
    if (!legacy && !cellObjects) throw configError("Prolific variant mappings must not mix legacy strings and cell objects");
    if (legacy) {
      if (variants.size !== expectedVariantCount) throw configError(`Legacy PROLIFIC_VARIANT_MAP_JSON must contain ${expectedVariantCount} variants`);
      const mappedConditions = descriptors.map((item) => item.condition);
      if (new Set(mappedConditions).size !== expectedVariantCount || allowedConditions.some((condition) => !mappedConditions.includes(condition))) {
        throw configError("Legacy Prolific variants must map one-to-one to all study conditions");
      }
    } else {
      const expectedCellKeys = new Set(expectedCells.map((cell) => `${cell.peer_identity}|${cell.condition || cell.source_condition}`));
      const mappedCells = descriptors.map((item) => `${item.peer_identity}|${item.condition}`);
      if (variants.size !== expectedCellKeys.size || new Set(mappedCells).size !== expectedCellKeys.size || mappedCells.some((cell) => !expectedCellKeys.has(cell))) {
        throw configError(`Prolific variants must map one-to-one to all ${expectedCellKeys.size} active cells`);
      }
    }
  } else if (isProduction && assignmentMode !== "controlled_link") {
    // Existing block mode remains available for development only.
  }

  function validateId(value, field) {
    const normalized = String(value || "").trim();
    if (!ID_PATTERN.test(normalized)) {
      throw requestError(400, "invalid_prolific_parameters", `${field} is missing or invalid.`);
    }
    return normalized;
  }

  function validateRequest(body = {}) {
    if (!active) {
      throw requestError(404, "prolific_mode_disabled", "This Prolific entry is not enabled.");
    }
    const previewRequested = body.preview === true || String(body.preview || "").toLowerCase() === "true";
    if (previewRequested && !previewMode) {
      throw requestError(403, "preview_mode_disabled", "Prolific Preview is not enabled for this study.");
    }
    if (previewOnly && !previewRequested) {
      throw requestError(403, "formal_mode_disabled", "Formal recruitment is not enabled for this study.");
    }
    const variant = String(body.variant || "").trim();
    const descriptor = variants.get(variant);
    if (!descriptor) {
      throw requestError(403, "invalid_variant", "This Taskflow assignment is not valid.");
    }
    const generated = crypto.randomUUID().replace(/-/g, "");
    const optionalId = (value, fallback, field) => {
      const normalized = String(value || "").trim();
      return normalized ? validateId(normalized, field) : fallback;
    };
    const prolificPid = previewOnly
      ? optionalId(body.PROLIFIC_PID ?? body.prolific_pid, `preview_${generated.slice(0, 20)}`, "PROLIFIC_PID")
      : validateId(body.PROLIFIC_PID ?? body.prolific_pid, "PROLIFIC_PID");
    const studyId = previewOnly
      ? optionalId(body.STUDY_ID ?? body.prolific_study_id, "preview_study", "STUDY_ID")
      : validateId(body.STUDY_ID ?? body.prolific_study_id, "STUDY_ID");
    const sessionId = previewOnly
      ? optionalId(body.SESSION_ID ?? body.prolific_session_id, `preview_session_${generated.slice(0, 20)}`, "SESSION_ID")
      : validateId(body.SESSION_ID ?? body.prolific_session_id, "SESSION_ID");
    if (formalActive && studyId !== expectedStudyId) {
      throw requestError(403, "invalid_study_id", "This study link is not valid.");
    }
    return {
      prolific_pid: prolificPid,
      prolific_study_id: studyId,
      prolific_session_id: sessionId,
      taskflow_variant_id: descriptor.variant_id,
      variant_token_hash: crypto.createHash("sha256").update(variant).digest("hex"),
      condition: descriptor.condition,
      source_condition: descriptor.source_condition,
      analysis_condition: descriptor.analysis_condition,
      peer_identity: descriptor.peer_identity,
      protocol_version: descriptor.protocol_version,
      mapping_format: descriptor.mapping_format,
      assignment_mode: "prolific_taskflow",
      locale: "en",
      is_preview: previewRequested,
      preview_source: previewRequested ? "prolific_preview" : null,
      record_key: crypto
        .createHmac("sha256", recordSecret)
        .update(`${previewRequested ? "preview" : "formal"}|${studyId}|${previewRequested ? sessionId : prolificPid}`)
        .digest("hex"),
    };
  }

  function findExisting(sessions, identity) {
    const aliases = (session) => [...new Set([
      session.prolific_session_id,
      session.primary_prolific_session_id,
      session.current_prolific_session_id,
      ...(Array.isArray(session.prolific_session_aliases) ? session.prolific_session_aliases : []),
    ].filter(Boolean))];
    const sameSubmission = sessions.find((session) => aliases(session).includes(identity.prolific_session_id));
    if (sameSubmission) {
      if (
        sameSubmission.prolific_pid !== identity.prolific_pid ||
        sameSubmission.prolific_study_id !== identity.prolific_study_id
      ) {
        const error = requestError(
          409,
          "identity_conflict",
          "This Prolific submission is already linked to a different identity.",
        );
        error.audit_type = "identity_conflict";
        throw error;
      }
      if (Boolean(sameSubmission.is_preview) !== Boolean(identity.is_preview)) {
        const error = requestError(409, "identity_conflict", "This Prolific submission is already linked to a different identity.");
        error.audit_type = "identity_conflict";
        throw error;
      }
      if (
        sameSubmission.taskflow_variant_id !== identity.taskflow_variant_id ||
        sameSubmission.variant_token_hash !== identity.variant_token_hash ||
        (sameSubmission.peer_identity || null) !== (identity.peer_identity || null) ||
        (identity.protocol_version
          ? sameSubmission.protocol_version !== identity.protocol_version
          : [HUMAN_AI_PROTOCOL_VERSION, normSupplement.PROTOCOL_VERSION].includes(sameSubmission.protocol_version))
      ) {
        const error = requestError(
          409,
          "variant_conflict",
          "This Prolific submission was assigned through a different Taskflow variant.",
        );
        error.session_id = sameSubmission.id;
        error.audit_type = "variant_resume_conflict";
        throw error;
      }
      return { session: sameSubmission, action: "resume_same_submission" };
    }
    if (identity.is_preview) return null;
    const sameParticipant = sessions.find(
      (session) =>
        !session.is_preview &&
        session.prolific_pid === identity.prolific_pid &&
        session.prolific_study_id === identity.prolific_study_id,
    );
    if (sameParticipant) {
      if (
        sameParticipant.taskflow_variant_id !== identity.taskflow_variant_id ||
        sameParticipant.variant_token_hash !== identity.variant_token_hash ||
        (sameParticipant.peer_identity || null) !== (identity.peer_identity || null) ||
        (identity.protocol_version
          ? sameParticipant.protocol_version !== identity.protocol_version
          : [HUMAN_AI_PROTOCOL_VERSION, normSupplement.PROTOCOL_VERSION].includes(sameParticipant.protocol_version))
      ) {
        const error = requestError(409, "variant_conflict", "Your saved study record belongs to a different Taskflow assignment. Please return to Prolific or contact the research team.");
        error.session_id = sameParticipant.id;
        error.audit_type = "variant_resume_conflict";
        throw error;
      }
      if (sameParticipant.status !== "completed" && sameParticipant.completion_status !== "completed") {
        return { session: sameParticipant, action: "resume_new_submission" };
      }
      const error = requestError(
        409,
        "duplicate_participation",
        "You have already taken part in this study. Please return to Prolific.",
      );
      error.session_id = sameParticipant.id;
      error.audit_type = "completed_duplicate_attempt";
      throw error;
    }
    return null;
  }

  return {
    active,
    assignmentMode,
    completionUrl,
    bonusCurrency,
    bonusDisplayLabel,
    previewMode,
    validateRequest,
    findExisting,
  };
}

module.exports = { createProlificSupport };
