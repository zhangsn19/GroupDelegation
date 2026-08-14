const { execFileSync } = require("child_process");
const study1 = require("../config/study1-dice");
const {
  PROTOCOL_VERSION: HUMAN_AI_PROTOCOL_VERSION,
  IDENTITY_MANIPULATION_VERSION,
  CONDITION_MAP_VERSION,
  PEER_IDENTITIES,
  activeCells,
} = require("../config/human-ai-protocol");
const normPilot = require("../config/ai-norm-pilot");

const SCHEMA_VERSION = "prolific-export-v2";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows, columns) {
  return `\uFEFF${columns.join(",")}\n${rows.map((row) => columns.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`;
}

function flatten(prefix, values = {}) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [`${prefix}_${key}`, value]));
}

function qualityFlags(session) {
  const flags = [];
  const scope = sessionScope(session);
  const prolificScope = scope === "formal" || scope === "preview";
  if (prolificScope && (!session.record_key || !session.prolific_pid || !session.prolific_study_id || !session.prolific_session_id)) flags.push("missing_required_fields");
  if ((session.dice_rounds || []).length !== 10) flags.push("incomplete_rounds");
  if (!(session.comprehension_attempts || []).some((attempt) => attempt.passed)) flags.push("comprehension_failed");
  if ((session.dice_rounds || []).some((round) => !Number.isFinite(round.decision_time_ms) || round.decision_time_ms < 0)) flags.push("invalid_decision_time");
  if ((session.dice_rounds || []).some((round) => Number(round.page_hidden_duration_ms || 0) > 300000)) flags.push("excessive_page_hidden_time");
  if (session.status === "completed" && (!session.post_survey || !session.demographics)) flags.push("incomplete_survey_data");
  if (prolificScope && session.assignment_mode === "prolific_taskflow" && !session.is_preview && !session.completion_redirect_initiated_at) flags.push("completion_not_confirmed");
  const abnormalTypes = new Set((session.abnormal_events || []).map((event) => event.type));
  if (abnormalTypes.has("variant_resume_conflict")) flags.push("recovery_conflict");
  if (abnormalTypes.has("identity_conflict")) flags.push("identity_conflict");
  return flags;
}

function isDataComplete(session) {
  return session.status === "completed" &&
    (session.dice_rounds || []).length === 10 &&
    Boolean(session.post_survey) &&
    Boolean(session.demographics);
}

function participants(sessions, env) {
  return sessions.map((session) => {
    const flags = qualityFlags(session);
    return {
      session_id: session.id,
      participant_id: session.participant_id || session.prolific_pid || "",
      record_key: session.record_key,
      prolific_pid: session.prolific_pid,
      prolific_study_id: session.prolific_study_id,
      prolific_session_id: session.prolific_session_id,
      primary_prolific_session_id: session.primary_prolific_session_id || session.prolific_session_id,
      current_prolific_session_id: session.current_prolific_session_id || session.prolific_session_id,
      prolific_session_aliases: session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean),
      prolific_session_aliases_json: session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean),
      resume_count: Number(session.resume_count || 0),
      last_resumed_at: session.last_resumed_at || "",
      is_preview: session.is_preview ? 1 : 0,
      taskflow_variant_id: session.taskflow_variant_id,
      condition: session.condition,
      norm_type: session.norm_type || "",
      norm_valence: session.norm_valence || "",
      peer_identity: session.peer_identity || (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION ? "" : "human_legacy"),
      identity_manipulation_version: session.identity_manipulation_version || "",
      condition_map_version: session.condition_map_version || "",
      is_qa: session.is_qa ? 1 : 0,
      is_team_review: session.is_team_review ? 1 : 0,
      assignment_mode: session.assignment_mode,
      locale: session.locale,
      status: session.status,
      consented_at: session.stage_timestamps?.consented,
      started_at: session.started_at,
      completed_at: session.completed_at,
      total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : "",
      rounds_completed: (session.dice_rounds || []).length,
      data_complete: isDataComplete(session) ? 1 : 0,
      comprehension_pass: (session.comprehension_attempts || []).some((attempt) => attempt.passed) ? 1 : 0,
      quality_flags: flags.join("|"),
      completion_ready_at: session.completion_ready_at,
      completion_redirect_initiated_at: session.completion_redirect_initiated_at,
      bonus_amount: session.dice_rounds?.at(-1)?.cumulative_reward ?? "",
      bonus_currency: env.BONUS_CURRENCY || "",
      study_version: session.study_version,
      protocol_version: session.protocol_version
      ,study1_source_commit: session.study1_source_commit || ""
      ,stimulus_version: session.stimulus_version || ""
      ,posttest_schema_version: session.posttest_schema_version || ""
      ,git_commit: session.git_commit || ""
      ,scope: sessionScope(session)
    };
  });
}

function rounds(sessions) {
  return sessions.flatMap((session) => (session.dice_rounds || []).map((round) => session.protocol_version === normPilot.PROTOCOL_VERSION ? ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_pid || "",
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    condition: session.condition,
    norm_type: session.norm_type,
    norm_valence: session.norm_valence,
    peer_identity: session.peer_identity,
    protocol_version: session.protocol_version,
    round_index: round.round_index,
    true_die_value: round.true_die_value,
    reported_die_value: round.reported_value,
    is_misreport: round.is_misreport ? 1 : 0,
    misreport_amount: round.misreport_amount,
    reward: round.reward,
    cumulative_reward: round.cumulative_reward,
    decision_time_ms: round.decision_time_ms,
    page_hidden_duration_ms: round.page_hidden_duration_ms,
    decision_started_at_client: round.decision_started_at_client,
    decision_submitted_at_client: round.decision_submitted_at_client,
    server_received_at: round.server_received_at,
    saved_at: round.saved_at || round.submitted_at,
    norm_stimulus_id: round.norm_stimulus_id,
    norm_stimulus_version: round.norm_stimulus_version,
    norm_message_text: round.norm_message_text,
    peer_messages_json: round.peer_messages,
  }) : ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_pid || "",
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    primary_prolific_session_id: session.primary_prolific_session_id || session.prolific_session_id,
    current_prolific_session_id: session.current_prolific_session_id || session.prolific_session_id,
    prolific_session_aliases_json: session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean),
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || "",
    is_preview: session.is_preview ? 1 : 0,
    condition: session.condition,
    peer_identity: session.peer_identity || "",
    protocol_version: session.protocol_version || "",
    round_index: round.round_index,
    true_die_value: round.true_die_value,
    reported_die_value: round.reported_value,
    misreport_amount: round.misreport_magnitude,
    is_misreport: round.upward_misreport ? 1 : 0,
    peer_display_order_json: round.peer_display_order,
    peer_records_json: round.peer_records,
    n_peers_misreporting: round.n_peers_misreporting,
    misreporting_peer_names_json: round.misreporting_peer_names,
    misreporting_peer_ids_json: (round.peer_records || [])
      .filter((record) => Number(record.underlying_reported_value) > Number(round.true_die_value))
      .map((record) => record.member_id)
      .filter(Boolean),
    decision_time_ms: round.decision_time_ms,
    page_hidden_duration_ms: round.page_hidden_duration_ms,
    decision_started_at_client: round.decision_started_at_client,
    decision_submitted_at_client: round.decision_submitted_at_client,
    server_received_at: round.server_received_at,
    saved_at: round.saved_at || round.submitted_at
  })));
}

function surveys(sessions, normMode = false) {
  return sessions.map((session) => normMode ? ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_pid || "",
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    ...Object.fromEntries(normPilot.POSTTEST_ITEMS.map((item) => [item.id, session.post_survey?.[item.id] ?? ""])),
  }) : ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_pid || "",
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    ...flatten("pre", session.baseline),
    ...flatten("post", session.post_survey),
    ...flatten("demo", session.demographics)
  }));
}

function surveyColumns(normMode = false) {
  if (normMode) return [
    "session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id",
    ...normPilot.POSTTEST_ITEMS.map((item) => item.id),
  ];
  return [
    "session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id",
    ...study1.baselineItems.map((item) => `pre_${item.id}`),
    ...new Set([...study1.postSurveyItems, ...(study1.humanAiPostSurveyItems || []), { id: "open_decision_factors" }].map((item) => `post_${item.id}`)),
    ...study1.demographicsItems.map((item) => `demo_${item.id}`)
  ];
}

function bonuses(sessions, env) {
  return sessions.map((session) => ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_pid || "",
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    bonus_amount: session.dice_rounds?.at(-1)?.cumulative_reward ?? "",
    bonus_currency: env.BONUS_CURRENCY || "",
    bonus_eligible: isDataComplete(session) ? 1 : 0,
    bonus_reason: isDataComplete(session) ? (env.BONUS_DISPLAY_LABEL || "Task bonus") : "Manual review required"
  }));
}

function gitCommit(env) {
  if (env.GIT_COMMIT) return env.GIT_COMMIT;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function buildFiles(sessions, env = process.env, options = {}) {
  const normMode = options.protocolVersion === normPilot.PROTOCOL_VERSION || sessions.some((session) => session.protocol_version === normPilot.PROTOCOL_VERSION);
  const participantRows = participants(sessions, env);
  const roundRows = rounds(sessions);
  const surveyRows = surveys(sessions, normMode);
  const bonusRows = bonuses(sessions, env);
  const hasHumanAi = options.protocolVersion === HUMAN_AI_PROTOCOL_VERSION ||
    env.PROTOCOL_VERSION === HUMAN_AI_PROTOCOL_VERSION ||
    sessions.some((session) => session.protocol_version === HUMAN_AI_PROTOCOL_VERSION);
  const cellDefinitions = normMode ? normPilot.cells() : activeCells();
  const cellRows = (hasHumanAi || normMode) ? cellDefinitions.map((cell) => {
    const matching = sessions.filter((session) => session.protocol_version === (normMode ? normPilot.PROTOCOL_VERSION : HUMAN_AI_PROTOCOL_VERSION) && session.condition === cell.condition && (normMode || session.peer_identity === cell.peer_identity));
    return {
      ...cell,
      arrived: matching.length,
      started: matching.filter((session) => session.started_at).length,
      completed: matching.filter((session) => session.status === "completed").length,
      data_complete: matching.filter(isDataComplete).length,
      quality_flagged: matching.filter((session) => qualityFlags(session).length > 0).length,
    };
  }) : [];
  const columns = (rows, preferred) => [...preferred, ...new Set(rows.flatMap(Object.keys).filter((key) => !preferred.includes(key)))];
  const metadata = {
    exported_at_utc: new Date().toISOString(),
    git_commit: gitCommit(env),
    release_id: env.RELEASE_ID || "",
    study_version: sessions[0]?.study_version || env.STUDY_VERSION || "",
    protocol_version: sessions[0]?.protocol_version || options.protocolVersion || env.PROTOCOL_VERSION || "",
    schema_version: SCHEMA_VERSION,
    study1_source_commit: normMode ? normPilot.STUDY1_SOURCE_COMMIT : "",
    identity_manipulation_version: hasHumanAi ? IDENTITY_MANIPULATION_VERSION : "",
    condition_map_version: normMode ? normPilot.CONDITION_MAP_VERSION : (hasHumanAi ? CONDITION_MAP_VERSION : (env.CONDITION_MAP_VERSION || "")),
    stimulus_version: normMode ? normPilot.STIMULUS_VERSION : "",
    posttest_schema_version: normMode ? normPilot.POSTTEST_SCHEMA_VERSION : "",
    export_scope: options.exportScope || "",
    condition_map: normMode ? normPilot.CONDITION_MAP : undefined,
    stimuli: normMode ? normPilot.CONDITIONS.map((condition) => ({ condition, stimulus_id: normPilot.CONDITION_MAP[condition].stimulus_id, text: normPilot.STIMULI[condition] })) : undefined,
    supported_cell_count: normMode ? 4 : (hasHumanAi ? 14 : undefined),
    active_cell_count: normMode ? 4 : (hasHumanAi ? 12 : undefined),
    peer_identity_levels: normMode ? ["ai"] : (hasHumanAi ? PEER_IDENTITIES : undefined),
    legacy_conditions_supported: hasHumanAi ? ["dishonest_escalating"] : undefined,
    locale: "en",
    record_count: sessions.length,
    round_count: roundRows.length
  };
  return {
    "participants.csv": csv(participantRows, columns(participantRows, ["session_id", "participant_id", "record_key", "prolific_pid", "prolific_study_id", "prolific_session_id", "primary_prolific_session_id", "current_prolific_session_id", "prolific_session_aliases", "prolific_session_aliases_json", "resume_count", "last_resumed_at", "is_preview", "is_qa", "is_team_review", "taskflow_variant_id", "peer_identity", "condition", "norm_type", "norm_valence", "assignment_mode", "scope", "locale", "status", "consented_at", "started_at", "completed_at", "total_duration_ms", "rounds_completed", "data_complete", "comprehension_pass", "quality_flags", "completion_ready_at", "completion_redirect_initiated_at", "bonus_amount", "bonus_currency", "study_version", "protocol_version", "study1_source_commit", "identity_manipulation_version", "condition_map_version", "stimulus_version", "posttest_schema_version", "git_commit"])),
    "study1_rounds.csv": csv(roundRows, normMode ? ["session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id", "peer_identity", "protocol_version", "condition", "norm_type", "norm_valence", "round_index", "true_die_value", "reported_die_value", "is_misreport", "misreport_amount", "reward", "cumulative_reward", "decision_time_ms", "page_hidden_duration_ms", "decision_started_at_client", "decision_submitted_at_client", "server_received_at", "saved_at", "norm_stimulus_id", "norm_stimulus_version", "norm_message_text", "peer_messages_json"] : ["session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id", "peer_identity", "protocol_version", "condition", "round_index", "true_die_value", "reported_die_value", "misreport_amount", "is_misreport", "peer_display_order_json", "peer_records_json", "n_peers_misreporting", "misreporting_peer_names_json", "misreporting_peer_ids_json", "decision_time_ms", "page_hidden_duration_ms", "decision_started_at_client", "decision_submitted_at_client", "server_received_at", "saved_at"]),
    "surveys.csv": csv(surveyRows, surveyColumns(normMode)),
    "bonus_payments.csv": csv(bonusRows, ["session_id", "participant_id", "prolific_pid", "prolific_session_id", "bonus_amount", "bonus_currency", "bonus_eligible", "bonus_reason"]),
    "raw_sessions.ndjson": `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n`,
    ...((hasHumanAi || normMode) ? { "cell_summary.csv": csv(cellRows, normMode ? ["condition", "norm_type", "norm_valence", "stimulus_id", "arrived", "started", "completed", "data_complete", "quality_flagged"] : ["peer_identity", "condition", "arrived", "started", "completed", "data_complete", "quality_flagged"]) } : {}),
    "export_metadata.json": `${JSON.stringify(metadata, null, 2)}\n`
  };
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(value, "utf8");
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    local.push(header, nameBuffer, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(nameBuffer.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, nameBuffer);
    offset += header.length + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

function adminRows(sessions) {
  return sessions.map((session) => ({
    record_id: session.id,
    prolific_pid: session.prolific_pid ? `${session.prolific_pid.slice(0, 4)}…${session.prolific_pid.slice(-4)}` : "",
    session_id: session.id ? session.id.slice(-8) : "",
    primary_session_id: (session.primary_prolific_session_id || session.prolific_session_id || "").slice(-8),
    current_session_id: (session.current_prolific_session_id || session.prolific_session_id || "").slice(-8),
    session_alias_count: (session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean)).length,
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || null,
    is_preview: Boolean(session.is_preview),
    condition: session.condition,
    norm_type: session.norm_type || null,
    norm_valence: session.norm_valence || null,
    peer_identity: session.peer_identity || (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION ? "" : "human_legacy"),
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    study1_source_commit: session.study1_source_commit || null,
    condition_map_version: session.condition_map_version || null,
    stimulus_version: session.stimulus_version || null,
    posttest_schema_version: session.posttest_schema_version || null,
    git_commit: session.git_commit || null,
    scope: sessionScope(session),
    assignment_source: session.assignment_source || "",
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at,
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : null,
    rounds_completed: (session.dice_rounds || []).length,
    data_complete: isDataComplete(session),
    mean_decision_time_ms: session.dice_rounds?.length ? Math.round(session.dice_rounds.reduce((sum, round) => sum + Number(round.decision_time_ms || 0), 0) / session.dice_rounds.length) : null,
    completion_redirect_initiated: Boolean(session.completion_redirect_initiated_at),
    quality_flags: qualityFlags(session)
  }));
}

function sessionScope(session) {
  if (["formal", "preview", "qa", "team_review"].includes(session.scope)) return session.scope;
  if (session.is_qa) return "qa";
  if (session.is_team_review) return "team_review";
  if (session.assignment_mode === "prolific_taskflow") return session.is_preview ? "preview" : "formal";
  return "legacy";
}

module.exports = { SCHEMA_VERSION, buildFiles, zip, adminRows, qualityFlags, isDataComplete, sessionScope };
