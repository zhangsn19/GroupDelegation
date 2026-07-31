const { execFileSync } = require("child_process");

const SCHEMA_VERSION = "prolific-export-v1";

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
  if (!session.record_key || !session.prolific_pid || !session.prolific_study_id || !session.prolific_session_id) flags.push("missing_required_fields");
  if ((session.effort_rounds || []).length !== 4 || !session.income_report) flags.push("incomplete_rounds");
  if (!(session.comprehension_attempts || []).some((attempt) => attempt.passed)) flags.push("comprehension_failed");
  if (!Number.isFinite(session.income_report?.decision_time_ms) || session.income_report.decision_time_ms < 0) flags.push("invalid_decision_time");
  if (Number(session.income_report?.page_hidden_duration_ms || 0) > 300000) flags.push("excessive_page_hidden_time");
  if (!session.completion_redirect_initiated_at) flags.push("completion_not_confirmed");
  const abnormalTypes = new Set((session.abnormal_events || []).map((event) => event.type));
  if (abnormalTypes.has("variant_resume_conflict")) flags.push("recovery_conflict");
  if (abnormalTypes.has("identity_conflict")) flags.push("identity_conflict");
  return flags;
}

function isDataComplete(session) {
  return session.status === "completed" &&
    (session.effort_rounds || []).length === 4 &&
    Boolean(session.income_report) &&
    Boolean(session.post_survey) &&
    Boolean(session.demographics);
}

function participants(sessions, env) {
  return sessions.map((session) => ({
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_study_id: session.prolific_study_id,
    prolific_session_id: session.prolific_session_id,
    primary_prolific_session_id: session.primary_prolific_session_id || session.prolific_session_id,
    current_prolific_session_id: session.current_prolific_session_id || session.prolific_session_id,
    prolific_session_aliases_json: session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean),
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || "",
    is_preview: session.is_preview ? 1 : 0,
    taskflow_variant_id: session.taskflow_variant_id,
    condition: session.condition,
    assignment_mode: session.assignment_mode,
    locale: session.locale,
    status: session.status,
    consented_at: session.stage_timestamps?.consented,
    started_at: session.started_at,
    completed_at: session.completed_at,
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : "",
    rounds_completed: (session.effort_rounds || []).length,
    data_complete: isDataComplete(session) ? 1 : 0,
    comprehension_pass: (session.comprehension_attempts || []).some((attempt) => attempt.passed) ? 1 : 0,
    quality_flags: qualityFlags(session).join("|"),
    completion_ready_at: session.completion_ready_at,
    completion_redirect_initiated_at: session.completion_redirect_initiated_at,
    bonus_amount: session.income_report?.retained_reward ?? "",
    bonus_currency: env.BONUS_CURRENCY || "",
    study_version: session.study_version,
    protocol_version: session.protocol_version
  }));
}

function rounds(sessions) {
  return sessions.filter((session) => session.income_report).map((session) => {
    const peers = session.study2_peer_income_records || session.peer_income_records || [];
    const misreporting = peers.filter((record) => Number(record.reported_income_cents) < Number(record.actual_income_cents));
    return {
      record_key: session.record_key,
      prolific_pid: session.prolific_pid,
      prolific_session_id: session.prolific_session_id,
      condition: session.condition,
      round_index: 1,
      effort_score: session.effort_summary?.total_correct,
      actual_income: session.actual_income,
      reported_income: session.income_report.reported_income,
      deduction: session.income_report.deduction,
      retained_income: session.income_report.retained_reward,
      peer_actual_income_json: peers.map((record) => ({ name: record.name, actual_income: record.actual_income })),
      peer_reported_income_json: peers.map((record) => ({ name: record.name, reported_income: record.reported_income })),
      n_peers_misreporting: session.condition === "hidden" ? "" : misreporting.length,
      decision_time_ms: session.income_report.decision_time_ms,
      page_hidden_duration_ms: session.income_report.page_hidden_duration_ms,
      decision_started_at_client: session.income_report.decision_started_at_client,
      decision_submitted_at_client: session.income_report.decision_submitted_at_client,
      server_received_at: session.income_report.server_received_at,
      saved_at: session.income_report.saved_at || session.income_report.submitted_at
    };
  });
}

function surveys(sessions) {
  return sessions.map((session) => ({
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    ...flatten("pre", session.baseline),
    ...flatten("post", session.post_survey),
    ...flatten("experience", session.experience),
    ...flatten("demo", session.demographics)
  }));
}

function bonuses(sessions, env) {
  return sessions.map((session) => ({
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    bonus_amount: session.income_report?.retained_reward ?? "",
    bonus_currency: env.BONUS_CURRENCY || "",
    bonus_eligible: isDataComplete(session) ? 1 : 0,
    bonus_reason: isDataComplete(session) ? (env.BONUS_DISPLAY_LABEL || "Task bonus") : "Manual review required"
  }));
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return process.env.GIT_COMMIT || "";
  }
}

function buildFiles(sessions, env = process.env) {
  const participantRows = participants(sessions, env);
  const roundRows = rounds(sessions);
  const surveyRows = surveys(sessions);
  const bonusRows = bonuses(sessions, env);
  const columns = (rows, preferred) => [...preferred, ...new Set(rows.flatMap(Object.keys).filter((key) => !preferred.includes(key)))];
  const metadata = {
    exported_at_utc: new Date().toISOString(),
    git_commit: gitCommit(),
    release_id: env.RELEASE_ID || "",
    study_version: sessions[0]?.study_version || "",
    protocol_version: sessions[0]?.protocol_version || "",
    schema_version: SCHEMA_VERSION,
    condition_map_version: env.CONDITION_MAP_VERSION || "",
    locale: "en",
    record_count: sessions.length,
    round_count: roundRows.length
  };
  return {
    "participants.csv": csv(participantRows, columns(participantRows, ["record_key", "prolific_pid", "prolific_study_id", "prolific_session_id", "primary_prolific_session_id", "current_prolific_session_id", "prolific_session_aliases_json", "resume_count", "last_resumed_at", "is_preview", "taskflow_variant_id", "condition", "assignment_mode", "locale", "status", "consented_at", "started_at", "completed_at", "total_duration_ms", "rounds_completed", "data_complete", "comprehension_pass", "quality_flags", "completion_ready_at", "completion_redirect_initiated_at", "bonus_amount", "bonus_currency", "study_version", "protocol_version"])),
    "study2_rounds.csv": csv(roundRows, ["record_key", "prolific_pid", "prolific_session_id", "condition", "round_index", "effort_score", "actual_income", "reported_income", "deduction", "retained_income", "peer_actual_income_json", "peer_reported_income_json", "n_peers_misreporting", "decision_time_ms", "page_hidden_duration_ms", "decision_started_at_client", "decision_submitted_at_client", "server_received_at", "saved_at"]),
    "surveys.csv": csv(surveyRows, columns(surveyRows, ["record_key", "prolific_pid", "prolific_session_id"])),
    "bonus_payments.csv": csv(bonusRows, ["prolific_pid", "prolific_session_id", "bonus_amount", "bonus_currency", "bonus_eligible", "bonus_reason"]),
    "raw_sessions.ndjson": `${sessions.map((session) => JSON.stringify(session)).join("\n")}\n`,
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
    prolific_pid: session.prolific_pid ? `${session.prolific_pid.slice(0, 4)}…${session.prolific_pid.slice(-4)}` : "",
    session_id: session.id ? session.id.slice(-8) : "",
    primary_session_id: (session.primary_prolific_session_id || session.prolific_session_id || "").slice(-8),
    current_session_id: (session.current_prolific_session_id || session.prolific_session_id || "").slice(-8),
    session_alias_count: (session.prolific_session_aliases || [session.prolific_session_id].filter(Boolean)).length,
    resume_count: Number(session.resume_count || 0),
    last_resumed_at: session.last_resumed_at || null,
    is_preview: Boolean(session.is_preview),
    condition: session.condition,
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at,
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : null,
    rounds_completed: (session.effort_rounds || []).length,
    mean_decision_time_ms: session.income_report?.decision_time_ms ?? null,
    completion_redirect_initiated: Boolean(session.completion_redirect_initiated_at),
    quality_flags: qualityFlags(session)
  }));
}

module.exports = { SCHEMA_VERSION, buildFiles, zip, adminRows, qualityFlags, isDataComplete };
