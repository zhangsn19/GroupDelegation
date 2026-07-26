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
  if ((session.dice_rounds || []).length !== 10) flags.push("incomplete_rounds");
  if (!(session.comprehension_attempts || []).some((attempt) => attempt.passed)) flags.push("comprehension_failed");
  if ((session.dice_rounds || []).some((round) => !Number.isFinite(round.decision_time_ms) || round.decision_time_ms < 0)) flags.push("invalid_decision_time");
  if ((session.dice_rounds || []).some((round) => Number(round.page_hidden_duration_ms || 0) > 300000)) flags.push("excessive_page_hidden_time");
  if (!session.completion_redirect_initiated_at) flags.push("completion_not_confirmed");
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
      record_key: session.record_key,
      prolific_pid: session.prolific_pid,
      prolific_study_id: session.prolific_study_id,
      prolific_session_id: session.prolific_session_id,
      taskflow_variant_id: session.taskflow_variant_id,
      condition: session.condition,
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
    };
  });
}

function rounds(sessions) {
  return sessions.flatMap((session) => (session.dice_rounds || []).map((round) => ({
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    condition: session.condition,
    round_index: round.round_index,
    true_die_value: round.true_die_value,
    reported_die_value: round.reported_value,
    misreport_amount: round.misreport_magnitude,
    is_misreport: round.upward_misreport ? 1 : 0,
    peer_display_order_json: round.peer_display_order,
    peer_records_json: round.peer_records,
    n_peers_misreporting: round.n_peers_misreporting,
    misreporting_peer_names_json: round.misreporting_peer_names,
    decision_time_ms: round.decision_time_ms,
    page_hidden_duration_ms: round.page_hidden_duration_ms,
    decision_started_at_client: round.decision_started_at_client,
    decision_submitted_at_client: round.decision_submitted_at_client,
    server_received_at: round.server_received_at,
    saved_at: round.saved_at || round.submitted_at
  })));
}

function surveys(sessions) {
  return sessions.map((session) => ({
    record_key: session.record_key,
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    ...flatten("pre", session.baseline),
    ...flatten("post", session.post_survey),
    ...flatten("demo", session.demographics)
  }));
}

function bonuses(sessions, env) {
  return sessions.map((session) => ({
    prolific_pid: session.prolific_pid,
    prolific_session_id: session.prolific_session_id,
    bonus_amount: session.dice_rounds?.at(-1)?.cumulative_reward ?? "",
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
    "participants.csv": csv(participantRows, columns(participantRows, ["record_key", "prolific_pid", "prolific_study_id", "prolific_session_id", "taskflow_variant_id", "condition", "assignment_mode", "locale", "status", "consented_at", "started_at", "completed_at", "total_duration_ms", "rounds_completed", "data_complete", "comprehension_pass", "quality_flags", "completion_ready_at", "completion_redirect_initiated_at", "bonus_amount", "bonus_currency", "study_version", "protocol_version"])),
    "study1_rounds.csv": csv(roundRows, ["record_key", "prolific_pid", "prolific_session_id", "condition", "round_index", "true_die_value", "reported_die_value", "misreport_amount", "is_misreport", "peer_display_order_json", "peer_records_json", "n_peers_misreporting", "misreporting_peer_names_json", "decision_time_ms", "page_hidden_duration_ms", "decision_started_at_client", "decision_submitted_at_client", "server_received_at", "saved_at"]),
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
    condition: session.condition,
    status: session.status,
    started_at: session.started_at,
    completed_at: session.completed_at,
    total_duration_ms: session.completed_at && session.started_at ? new Date(session.completed_at) - new Date(session.started_at) : null,
    rounds_completed: (session.dice_rounds || []).length,
    mean_decision_time_ms: session.dice_rounds?.length ? Math.round(session.dice_rounds.reduce((sum, round) => sum + Number(round.decision_time_ms || 0), 0) / session.dice_rounds.length) : null,
    completion_redirect_initiated: Boolean(session.completion_redirect_initiated_at),
    quality_flags: qualityFlags(session)
  }));
}

module.exports = { SCHEMA_VERSION, buildFiles, zip, adminRows, qualityFlags, isDataComplete };
