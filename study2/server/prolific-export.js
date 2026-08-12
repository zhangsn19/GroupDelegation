const { execFileSync } = require("child_process");
const study2 = require("../config/study2-income");
const {
  STUDY_VERSION: HUMAN_AI_STUDY_VERSION,
  PROTOCOL_VERSION: HUMAN_AI_PROTOCOL_VERSION,
  IDENTITY_MANIPULATION_VERSION,
  CONDITION_MAP_VERSION,
  activeCells
} = require("../config/human-ai-protocol");
const detailed = require("./export");

const SCHEMA_VERSION = "study2-human-ai-export-v1";
const BUNDLE_FILES = Object.freeze([
  "participants.csv",
  "study2_rounds.csv",
  "study2_effort_rounds.csv",
  "study2_income_reports.csv",
  "surveys.csv",
  "bonus_payments.csv",
  "raw_sessions.ndjson",
  "cell_summary.csv",
  "export_metadata.json"
]);

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows, columns) {
  return `\uFEFF${columns.join(",")}\n${rows.map((row) => columns.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`;
}

function flatten(prefix, values = {}) {
  return Object.fromEntries(Object.entries(values || {}).map(([key, value]) => [`${prefix}_${key}`, value]));
}

function sessionScope(session) {
  return detailed.sessionScope(session);
}

function expectedRequiredPostItems(session) {
  return (study2.postSurveyItems || []).filter((item) => item.required !== false && !(session.condition === "hidden" && item.id === "peer_reports_considered"));
}

function missingRequiredItems(items, values = {}) {
  return items.filter((item) => values[item.id] === undefined || values[item.id] === null || values[item.id] === "");
}

function surveyComplete(session) {
  const baselineMissing = missingRequiredItems(study2.baselineItems || [], session.baseline || {});
  const postMissing = missingRequiredItems(expectedRequiredPostItems(session), session.post_survey || {});
  const experienceMissing = missingRequiredItems(study2.experienceItems || [], session.experience || {});
  const demographicsMissing = missingRequiredItems(study2.demographicsItems || [], session.demographics || {});
  return baselineMissing.length === 0 && postMissing.length === 0 && experienceMissing.length === 0 && demographicsMissing.length === 0;
}

function qualityFlags(session) {
  const flags = [];
  const scope = sessionScope(session);
  if (scope === "formal" && (!session.record_key || !session.prolific_pid || !session.prolific_study_id || !session.prolific_session_id)) flags.push("missing_required_fields");
  if ((session.effort_rounds || []).length !== 4 || !session.income_report) flags.push("incomplete_rounds");
  if (!(session.comprehension_attempts || []).some((attempt) => attempt.passed)) flags.push("comprehension_failed");
  if (session.income_report && (!Number.isFinite(session.income_report.decision_time_ms) || session.income_report.decision_time_ms < 0)) flags.push("invalid_decision_time");
  if (Number(session.income_report?.page_hidden_duration_ms || 0) > 300000) flags.push("excessive_page_hidden_time");
  if (session.status === "completed" && !surveyComplete(session)) flags.push("incomplete_survey_data");
  if (scope === "formal" && session.status === "completed" && !session.completion_redirect_initiated_at) flags.push("completion_not_confirmed");
  const abnormalTypes = new Set((session.abnormal_events || []).map((event) => event.type));
  if (abnormalTypes.has("variant_resume_conflict")) flags.push("recovery_conflict");
  if (abnormalTypes.has("identity_conflict")) flags.push("identity_conflict");
  if (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION && !["human", "ai"].includes(session.peer_identity)) flags.push("missing_peer_identity");
  return flags;
}

function isDataComplete(session) {
  return session.status === "completed" &&
    (session.effort_rounds || []).length === 4 &&
    Boolean(session.income_report) &&
    (session.comprehension_attempts || []).some((attempt) => attempt.passed) &&
    surveyComplete(session);
}

function aliasValues(session) {
  return session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean);
}

function masked(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length < 9) return `${text.slice(0, 2)}…${text.slice(-2)}`;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function participants(sessions, env) {
  return sessions.map((session) => ({
    session_id: session.id || "",
    participant_id: session.participant_id || session.prolific_pid || session.prolific_id || "",
    masked_participant_id: masked(session.participant_id || session.prolific_pid || session.prolific_id),
    masked_session_id: masked(session.id),
    record_key: session.record_key || "",
    prolific_pid: session.prolific_pid || "",
    prolific_study_id: session.prolific_study_id || "",
    prolific_session_id: session.prolific_session_id || "",
    primary_prolific_session_id: session.primary_prolific_session_id || session.prolific_session_id || "",
    current_prolific_session_id: session.current_prolific_session_id || session.prolific_session_id || "",
    prolific_session_aliases: aliasValues(session),
    prolific_session_aliases_json: aliasValues(session),
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || "",
    recovery_or_alias: Number(session.resume_count || 0) > 0 || aliasValues(session).length > 1 ? 1 : 0,
    peer_identity: session.peer_identity || "",
    condition: session.condition || "",
    variant_id: session.variant_id || session.taskflow_variant_id || "",
    taskflow_variant_id: session.taskflow_variant_id || session.variant_id || "",
    scope: sessionScope(session),
    is_preview: session.is_preview ? 1 : 0,
    is_qa: session.is_qa ? 1 : 0,
    is_team_review: session.is_team_review ? 1 : 0,
    assignment_mode: session.assignment_mode || "",
    locale: session.locale || "",
    status: session.status || "",
    completed: session.status === "completed" ? 1 : 0,
    consented_at: session.stage_timestamps?.consented || "",
    started_at: session.started_at || "",
    completed_at: session.completed_at || "",
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : "",
    rounds_completed: (session.effort_rounds || []).length,
    data_complete: isDataComplete(session) ? 1 : 0,
    comprehension_pass: (session.comprehension_attempts || []).some((attempt) => attempt.passed) ? 1 : 0,
    quality_flags: qualityFlags(session).join("|"),
    completion_status: session.completion_status || "",
    completion_ready_at: session.completion_ready_at || "",
    completion_redirect_initiated_at: session.completion_redirect_initiated_at || "",
    bonus_amount: session.income_report?.retained_reward ?? "",
    bonus_currency: env.BONUS_CURRENCY || "",
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    identity_manipulation_version: session.identity_manipulation_version || "",
    condition_map_version: session.condition_map_version || "",
    git_commit: session.git_commit || env.GIT_COMMIT || "",
    release_id: env.RELEASE_ID || ""
  }));
}

function rounds(sessions) {
  return sessions.filter((session) => session.income_report).map((session) => {
    const peers = session.study2_peer_income_records || session.peer_income_records || [];
    const misreporting = peers.filter((record) => Number(record.reported_income_cents) < Number(record.actual_income_cents));
    return {
      session_id: session.id || "",
      participant_id: session.participant_id || session.prolific_pid || session.prolific_id || "",
      record_key: session.record_key || "",
      prolific_pid: session.prolific_pid || "",
      prolific_session_id: session.prolific_session_id || "",
      peer_identity: session.peer_identity || "",
      condition: session.condition || "",
      variant_id: session.variant_id || session.taskflow_variant_id || "",
      scope: sessionScope(session),
      protocol_version: session.protocol_version || "",
      round_index: 1,
      effort_score: session.effort_summary?.total_correct ?? "",
      actual_income: session.actual_income ?? "",
      reported_income: session.income_report.reported_income ?? "",
      deduction: session.income_report.deduction ?? "",
      retained_income: session.income_report.retained_reward ?? "",
      peer_actual_income_json: peers.map((record) => ({ member_id: record.member_id, actual_income: record.actual_income })),
      peer_reported_income_json: peers.map((record) => ({ member_id: record.member_id, reported_income: record.reported_income })),
      n_peers_misreporting: session.condition === "hidden" ? "" : misreporting.length,
      decision_time_ms: session.income_report.decision_time_ms ?? "",
      page_hidden_duration_ms: session.income_report.page_hidden_duration_ms ?? "",
      decision_started_at_client: session.income_report.decision_started_at_client || "",
      decision_submitted_at_client: session.income_report.decision_submitted_at_client || "",
      server_received_at: session.income_report.server_received_at || "",
      saved_at: session.income_report.saved_at || session.income_report.submitted_at || ""
    };
  });
}

function surveyRows(sessions) {
  return sessions.map((session) => {
    const post = { ...(session.post_survey || {}) };
    if (session.condition === "hidden" && post.peer_reports_considered === undefined) post.peer_reports_considered = "";
    return {
      session_id: session.id || "",
      participant_id: session.participant_id || session.prolific_pid || session.prolific_id || "",
      record_key: session.record_key || "",
      prolific_pid: session.prolific_pid || "",
      prolific_session_id: session.prolific_session_id || "",
      peer_identity: session.peer_identity || "",
      condition: session.condition || "",
      variant_id: session.variant_id || session.taskflow_variant_id || "",
      scope: sessionScope(session),
      protocol_version: session.protocol_version || "",
      ...flatten("pre", session.baseline),
      ...flatten("post", post),
      ...flatten("experience", session.experience),
      ...flatten("demo", session.demographics)
    };
  });
}

function surveyColumns(sessions) {
  const stable = [
    "session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id", "peer_identity", "condition", "variant_id", "scope", "protocol_version",
    ...(study2.baselineItems || []).map((item) => `pre_${item.id}`),
    ...(study2.postSurveyItems || []).map((item) => `post_${item.id}`),
    ...(study2.experienceItems || []).map((item) => `experience_${item.id}`),
    ...(study2.demographicsItems || []).map((item) => `demo_${item.id}`)
  ];
  const historical = [...new Set(sessions.flatMap((session) => [
    ...Object.keys(session.baseline || {}).map((key) => `pre_${key}`),
    ...Object.keys(session.post_survey || {}).map((key) => `post_${key}`),
    ...Object.keys(session.experience || {}).map((key) => `experience_${key}`),
    ...Object.keys(session.demographics || {}).map((key) => `demo_${key}`)
  ]))];
  return [...stable, ...historical.filter((key) => !stable.includes(key))];
}

function bonuses(sessions, env) {
  return sessions.map((session) => ({
    session_id: session.id || "",
    participant_id: session.participant_id || session.prolific_pid || session.prolific_id || "",
    prolific_pid: session.prolific_pid || "",
    prolific_session_id: session.prolific_session_id || "",
    peer_identity: session.peer_identity || "",
    condition: session.condition || "",
    scope: sessionScope(session),
    bonus_amount: session.income_report?.retained_reward ?? "",
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

function cellSummary(sessions) {
  return activeCells().map((cell) => {
    const matching = sessions.filter((session) => session.protocol_version === HUMAN_AI_PROTOCOL_VERSION && session.peer_identity === cell.peer_identity && session.condition === cell.condition);
    return {
      ...cell,
      started: matching.filter((session) => session.started_at).length,
      completed: matching.filter((session) => session.status === "completed").length,
      data_complete: matching.filter(isDataComplete).length,
      incomplete: matching.filter((session) => session.status !== "completed").length,
      quality_flagged: matching.filter((session) => qualityFlags(session).length > 0).length
    };
  });
}

function buildFiles(sessions, env = process.env, options = {}) {
  const participantRows = participants(sessions, env);
  const roundRows = rounds(sessions);
  const surveyData = surveyRows(sessions);
  const bonusRows = bonuses(sessions, env);
  const effortRows = detailed.effortRoundsRows(sessions);
  const incomeRows = detailed.incomeReportRows(sessions);
  const cells = cellSummary(sessions);
  const columns = (rows, preferred) => [...preferred, ...new Set(rows.flatMap(Object.keys).filter((key) => !preferred.includes(key)))];
  const scopeValues = [...new Set(sessions.map(sessionScope))];
  const scope = options.scope || (scopeValues.length === 1 ? scopeValues[0] : scopeValues.length ? "mixed" : "unknown");
  const metadata = {
    exported_at_utc: new Date().toISOString(),
    git_commit: gitCommit(env),
    release_id: env.RELEASE_ID || "",
    study_version: sessions[0]?.study_version || env.STUDY_VERSION || HUMAN_AI_STUDY_VERSION,
    protocol_version: sessions[0]?.protocol_version || env.PROTOCOL_VERSION || HUMAN_AI_PROTOCOL_VERSION,
    identity_manipulation_version: sessions[0]?.identity_manipulation_version || IDENTITY_MANIPULATION_VERSION,
    condition_map_version: sessions[0]?.condition_map_version || CONDITION_MAP_VERSION,
    schema_version: SCHEMA_VERSION,
    locale: sessions[0]?.locale || env.LOCALE || "en",
    scope,
    record_count: sessions.length,
    effort_round_count: effortRows.length,
    income_report_count: incomeRows.length,
    active_cell_count: activeCells().length,
    timing_notes: {
      decision_time_ms: "Accumulated elapsed decision time; it includes page-hidden time for compatibility with historical Study2 records.",
      page_hidden_duration_ms: "Accumulated time while the page was hidden, reported separately; do not subtract twice."
    },
    expected_hidden_blank: "post_peer_reports_considered"
  };
  const files = {
    "participants.csv": csv(participantRows, columns(participantRows, ["session_id", "participant_id", "masked_participant_id", "masked_session_id", "record_key", "prolific_pid", "prolific_study_id", "prolific_session_id", "primary_prolific_session_id", "current_prolific_session_id", "prolific_session_aliases", "prolific_session_aliases_json", "resume_count", "last_resumed_at", "recovery_or_alias", "peer_identity", "condition", "variant_id", "taskflow_variant_id", "scope", "is_preview", "is_qa", "is_team_review", "assignment_mode", "locale", "status", "completed", "consented_at", "started_at", "completed_at", "total_duration_ms", "rounds_completed", "data_complete", "comprehension_pass", "quality_flags", "completion_status", "completion_ready_at", "completion_redirect_initiated_at", "bonus_amount", "bonus_currency", "study_version", "protocol_version", "identity_manipulation_version", "condition_map_version", "git_commit", "release_id"])),
    "study2_rounds.csv": csv(roundRows, ["session_id", "participant_id", "record_key", "prolific_pid", "prolific_session_id", "peer_identity", "condition", "variant_id", "scope", "protocol_version", "round_index", "effort_score", "actual_income", "reported_income", "deduction", "retained_income", "peer_actual_income_json", "peer_reported_income_json", "n_peers_misreporting", "decision_time_ms", "page_hidden_duration_ms", "decision_started_at_client", "decision_submitted_at_client", "server_received_at", "saved_at"]),
    "study2_effort_rounds.csv": detailed.effortRoundsCsv(sessions),
    "study2_income_reports.csv": detailed.incomeReportsCsv(sessions),
    "surveys.csv": csv(surveyData, surveyColumns(sessions)),
    "bonus_payments.csv": csv(bonusRows, ["session_id", "participant_id", "prolific_pid", "prolific_session_id", "peer_identity", "condition", "scope", "bonus_amount", "bonus_currency", "bonus_eligible", "bonus_reason"]),
    "raw_sessions.ndjson": sessions.length ? `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n` : "",
    "cell_summary.csv": csv(cells, ["peer_identity", "condition", "variant_id", "started", "completed", "data_complete", "incomplete", "quality_flagged"]),
    "export_metadata.json": `${JSON.stringify(metadata, null, 2)}\n`
  };
  if (Object.keys(files).join("|") !== BUNDLE_FILES.join("|")) throw new Error("Study2 export bundle file contract changed unexpectedly");
  return files;
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
    record_id: session.id || "",
    prolific_pid: masked(session.prolific_pid || session.participant_id || session.prolific_id),
    session_id: masked(session.id),
    primary_session_id: masked(session.primary_prolific_session_id || session.prolific_session_id),
    current_session_id: masked(session.current_prolific_session_id || session.prolific_session_id),
    session_alias_count: aliasValues(session).length,
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || null,
    is_preview: Boolean(session.is_preview),
    is_qa: Boolean(session.is_qa),
    is_team_review: Boolean(session.is_team_review),
    peer_identity: session.peer_identity || (session.protocol_version === HUMAN_AI_PROTOCOL_VERSION ? "" : "historical"),
    condition: session.condition || "",
    variant_id: session.variant_id || session.taskflow_variant_id || "",
    scope: sessionScope(session),
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    identity_manipulation_version: session.identity_manipulation_version || "",
    condition_map_version: session.condition_map_version || "",
    status: session.status || "",
    started_at: session.started_at || null,
    completed_at: session.completed_at || null,
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : null,
    rounds_completed: (session.effort_rounds || []).length,
    data_complete: isDataComplete(session),
    decision_time_ms: session.income_report?.decision_time_ms ?? null,
    page_hidden_duration_ms: session.income_report?.page_hidden_duration_ms ?? null,
    completion_redirect_initiated: Boolean(session.completion_redirect_initiated_at),
    quality_flags: qualityFlags(session)
  }));
}

module.exports = {
  SCHEMA_VERSION,
  BUNDLE_FILES,
  buildFiles,
  zip,
  adminRows,
  qualityFlags,
  isDataComplete,
  sessionScope,
  surveyComplete
};
