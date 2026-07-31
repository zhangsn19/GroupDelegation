const crypto = require("crypto");

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

function parseVariantMap(raw, allowedConditions) {
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
    const descriptor = typeof value === "string" ? { condition: value } : value;
    const condition = String(descriptor?.condition || "").trim();
    const variantId = String(descriptor?.variant_id || descriptor?.id || "").trim();
    if (!allowedConditions.includes(condition) || !ID_PATTERN.test(variantId)) {
      throw configError("Each Prolific variant must have a valid variant_id and condition");
    }
    map.set(token, { condition, variant_id: variantId });
  }
  return map;
}

function createProlificSupport({
  assignmentMode,
  isProduction,
  allowedConditions,
  expectedVariantCount,
  env = process.env,
}) {
  const active = assignmentMode === "prolific_taskflow";
  const expectedStudyId = String(env.PROLIFIC_EXPECTED_STUDY_ID || "").trim();
  const completionUrl = String(env.PROLIFIC_COMPLETION_URL || "").trim();
  const recordSecret = String(env.SERVER_RECORD_SECRET || "").trim();
  const bonusCurrency = String(env.BONUS_CURRENCY || "").trim();
  const bonusDisplayLabel = String(env.BONUS_DISPLAY_LABEL || "").trim();
  const previewMode = String(env.PROLIFIC_PREVIEW_MODE || "").toLowerCase() === "true";
  let variants = new Map();

  if (active) {
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
    if (recordSecret.length < 32) {
      throw configError("SERVER_RECORD_SECRET must contain at least 32 characters");
    }
    if (!env.STUDY_CONTACT_EMAIL) {
      throw configError("STUDY_CONTACT_EMAIL is required in prolific_taskflow mode");
    }
    variants = parseVariantMap(env.PROLIFIC_VARIANT_MAP_JSON, allowedConditions);
    if (variants.size !== expectedVariantCount) {
      throw configError(`PROLIFIC_VARIANT_MAP_JSON must contain ${expectedVariantCount} variants`);
    }
    const mappedConditions = [...variants.values()].map((item) => item.condition);
    if (
      new Set(mappedConditions).size !== expectedVariantCount ||
      allowedConditions.some((condition) => !mappedConditions.includes(condition))
    ) {
      throw configError("Prolific variants must map one-to-one to all study conditions");
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
    const prolificPid = validateId(body.PROLIFIC_PID ?? body.prolific_pid, "PROLIFIC_PID");
    const studyId = validateId(body.STUDY_ID ?? body.prolific_study_id, "STUDY_ID");
    const sessionId = validateId(body.SESSION_ID ?? body.prolific_session_id, "SESSION_ID");
    const previewRequested = body.preview === true || String(body.preview || "").toLowerCase() === "true";
    if (previewRequested && !previewMode) {
      throw requestError(403, "preview_mode_disabled", "Prolific Preview is not enabled for this study.");
    }
    const variant = String(body.variant || "").trim();
    if (studyId !== expectedStudyId) {
      throw requestError(403, "invalid_study_id", "This study link is not valid.");
    }
    const descriptor = variants.get(variant);
    if (!descriptor) {
      throw requestError(403, "invalid_variant", "This Taskflow assignment is not valid.");
    }
    return {
      prolific_pid: prolificPid,
      prolific_study_id: studyId,
      prolific_session_id: sessionId,
      taskflow_variant_id: descriptor.variant_id,
      variant_token_hash: crypto.createHash("sha256").update(variant).digest("hex"),
      condition: descriptor.condition,
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
        sameSubmission.variant_token_hash !== identity.variant_token_hash
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
        sameParticipant.variant_token_hash !== identity.variant_token_hash
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
