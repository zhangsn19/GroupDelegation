const {
  PROTOCOL_VERSION: HUMAN_AI_PROTOCOL_VERSION,
  activeCells
} = require("../config/human-ai-protocol");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows, columns) {
  return `\uFEFF${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")).join("\n")}\n`;
}

function flattenResponses(prefix, responses = {}) {
  return Object.fromEntries(Object.entries(responses || {}).map(([key, value]) => [`${prefix}_${key}`, value]));
}

function sessionScope(session = {}) {
  if (["formal", "preview", "qa", "team_review"].includes(session.scope)) return session.scope;
  if (session.is_qa) return "qa";
  if (session.is_team_review) return "team_review";
  if (session.assignment_mode === "prolific_taskflow") return session.is_preview ? "preview" : "formal";
  return "historical";
}

function identityFields(session) {
  return {
    peer_identity: session.peer_identity || "",
    condition: session.condition || "",
    variant_id: session.variant_id || session.taskflow_variant_id || "",
    taskflow_variant_id: session.taskflow_variant_id || session.variant_id || "",
    scope: sessionScope(session),
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    identity_manipulation_version: session.identity_manipulation_version || "",
    condition_map_version: session.condition_map_version || ""
  };
}

function participantIdentity(session) {
  return session.participant_id || session.prolific_pid || session.prolific_id || "";
}

function participantsCsv(sessions) {
  const rows = sessions.map((session) => ({
    session_id: session.id || "",
    participant_id: participantIdentity(session),
    study: session.study || "study2",
    ...identityFields(session),
    assignment_source: session.assignment_source || "",
    entry_link_id: session.entry_link_id || "",
    condition_assigned_at: session.condition_assigned_at || "",
    randomization_block: session.randomization_block ?? "",
    randomization_position: session.randomization_position ?? "",
    is_preview: session.is_preview ? 1 : 0,
    is_qa: session.is_qa ? 1 : 0,
    is_team_review: session.is_team_review ? 1 : 0,
    is_test_session: session.is_test_session ? 1 : 0,
    status: session.status || "",
    completed: session.status === "completed" ? 1 : 0,
    created_at: session.created_at || "",
    started_at: session.started_at || "",
    completed_at: session.completed_at || "",
    debrief_viewed_at: session.debrief_viewed_at || "",
    completion_status: session.completion_status || "",
    completion_redirect_initiated_at: session.completion_redirect_initiated_at || "",
    stimulus_version: session.stimulus_version || "",
    stimulus_seed: session.stimulus_seed || "",
    peer_profile_id: session.study2_peer_profile_id || "",
    peer_display_order_json: session.study2_peer_display_order || [],
    actual_income_cents: session.actual_income_cents ?? "",
    actual_income: session.actual_income ?? "",
    reported_income_cents: session.income_report?.reported_income_cents ?? "",
    reported_income: session.income_report?.reported_income ?? "",
    deduction_cents: session.income_report?.deduction_cents ?? "",
    deduction: session.income_report?.deduction ?? "",
    retained_reward_cents: session.income_report?.retained_reward_cents ?? "",
    retained_reward: session.income_report?.retained_reward ?? "",
    underreport_amount_cents: session.income_report?.underreport_amount_cents ?? "",
    underreport_amount: session.income_report?.underreport_amount ?? "",
    underreport_rate: session.income_report?.underreport_rate ?? "",
    effort_total_correct: session.effort_summary?.total_correct ?? "",
    effort_total_duration_ms: session.effort_summary?.total_duration_ms ?? "",
    effort_rounds_completed: (session.effort_rounds || []).length,
    git_commit: session.git_commit || "",
    ...flattenResponses("baseline", session.baseline),
    ...flattenResponses("post", session.post_survey),
    ...flattenResponses("experience", session.experience),
    ...flattenResponses("demo", session.demographics)
  }));
  const dynamic = [...new Set(rows.flatMap(Object.keys))];
  const preferred = [
    "session_id", "participant_id", "study", "peer_identity", "condition", "variant_id", "taskflow_variant_id", "scope",
    "study_version", "protocol_version", "identity_manipulation_version", "condition_map_version", "status", "completed",
    "assignment_source", "entry_link_id", "condition_assigned_at", "randomization_block", "randomization_position",
    "is_preview", "is_qa", "is_team_review", "is_test_session", "created_at", "started_at", "completed_at",
    "debrief_viewed_at", "completion_status", "completion_redirect_initiated_at", "stimulus_version", "stimulus_seed",
    "peer_profile_id", "peer_display_order_json", "actual_income_cents", "actual_income", "reported_income_cents",
    "reported_income", "deduction_cents", "deduction", "retained_reward_cents", "retained_reward", "underreport_amount_cents",
    "underreport_amount", "underreport_rate", "effort_total_correct", "effort_total_duration_ms", "effort_rounds_completed", "git_commit"
  ];
  return toCsv(rows, [...preferred, ...dynamic.filter((key) => !preferred.includes(key))]);
}

function effortRoundsRows(sessions) {
  return sessions.flatMap((session) => (session.effort_rounds || []).map((round) => ({
    session_id: session.id || "",
    participant_id: participantIdentity(session),
    ...identityFields(session),
    round: round.round_index,
    round_index: round.round_index,
    numbers_json: round.numbers || [],
    answers_json: round.answers || {},
    correct_count: round.correct_count ?? "",
    duration_ms: round.duration_ms ?? "",
    timed_out: round.timed_out ? 1 : 0,
    base_income_cents: round.base_income_cents ?? "",
    base_income: round.base_income ?? "",
    speed_bonus_cents: round.speed_bonus_cents ?? "",
    speed_bonus: round.speed_bonus ?? "",
    round_actual_income_cents: round.round_actual_income_cents ?? round.income_cents ?? "",
    round_actual_income: round.round_actual_income ?? round.income ?? "",
    income_cents: round.income_cents ?? "",
    income: round.income ?? "",
    started_at: round.started_at || "",
    deadline_at: round.deadline_at || "",
    submitted_at: round.submitted_at || ""
  })));
}

const EFFORT_COLUMNS = [
  "session_id", "participant_id", "peer_identity", "condition", "variant_id", "taskflow_variant_id", "scope",
  "study_version", "protocol_version", "identity_manipulation_version", "condition_map_version", "round", "round_index",
  "started_at", "deadline_at", "submitted_at", "timed_out", "correct_count", "base_income", "speed_bonus",
  "round_actual_income", "base_income_cents", "speed_bonus_cents", "round_actual_income_cents", "income_cents",
  "numbers_json", "answers_json", "duration_ms", "income"
];

function effortRoundsCsv(sessions) {
  return toCsv(effortRoundsRows(sessions), EFFORT_COLUMNS);
}

function peerRecords(session) {
  return session.study2_peer_income_records || session.peer_income_records || [];
}

function incomeReportRows(sessions) {
  return sessions.filter((session) => session.income_report).map((session) => {
    const records = peerRecords(session);
    return {
      session_id: session.id || "",
      participant_id: participantIdentity(session),
      ...identityFields(session),
      actual_income_cents: session.actual_income_cents ?? session.income_report.actual_income_cents ?? "",
      actual_income: session.actual_income ?? session.income_report.actual_income ?? "",
      reported_income_cents: session.income_report.reported_income_cents ?? "",
      reported_income: session.income_report.reported_income ?? "",
      underreported: Number(session.income_report.underreport_amount_cents || 0) > 0 ? 1 : 0,
      underreport_amount_cents: session.income_report.underreport_amount_cents ?? "",
      underreport_amount: session.income_report.underreport_amount ?? "",
      underreport_rate: session.income_report.underreport_rate ?? "",
      deduction_cents: session.income_report.deduction_cents ?? "",
      deduction: session.income_report.deduction ?? "",
      retained_reward_cents: session.income_report.retained_reward_cents ?? "",
      retained_reward: session.income_report.retained_reward ?? "",
      income_report_selection_started_at: session.income_report.selection_started_at || session.income_report_selection_started_at || "",
      decision_duration_ms: session.income_report.decision_duration_ms ?? "",
      decision_time_ms: session.income_report.decision_time_ms ?? "",
      page_hidden_duration_ms: session.income_report.page_hidden_duration_ms ?? "",
      timer_resumed_after_reload: session.income_report.timer_resumed_after_reload ? 1 : 0,
      decision_timing_segments_json: session.income_report.decision_timing_segments || [],
      decision_started_at_client: session.income_report.decision_started_at_client || "",
      decision_submitted_at_client: session.income_report.decision_submitted_at_client || "",
      server_received_at: session.income_report.server_received_at || "",
      submitted_at: session.income_report.submitted_at || "",
      saved_at: session.income_report.saved_at || session.income_report.submitted_at || "",
      stimulus_version: session.stimulus_version || "",
      stimulus_seed: session.stimulus_seed || "",
      peer_profile_id: session.study2_peer_profile_id || "",
      stable_member_ids_json: records.map((record) => record.member_id).filter(Boolean),
      peer_display_order_json: session.study2_peer_display_order || records.map((record) => record.member_id).filter(Boolean),
      peer_actual_income_records_json: records.map((record) => ({
        member_id: record.member_id || "",
        actual_income_cents: record.actual_income_cents,
        actual_income: record.actual_income,
        display_position: record.display_position
      })),
      peer_reported_income_records_json: records.map((record) => ({
        member_id: record.member_id || "",
        reported_income_cents: record.reported_income_cents,
        reported_income: record.reported_income,
        display_position: record.display_position
      })),
      peer_records_json: records
    };
  });
}

const INCOME_COLUMNS = [
  "session_id", "participant_id", "peer_identity", "condition", "variant_id", "taskflow_variant_id", "scope",
  "study_version", "protocol_version", "identity_manipulation_version", "condition_map_version", "actual_income_cents",
  "reported_income_cents", "underreported", "underreport_amount_cents", "underreport_rate", "deduction_cents",
  "retained_reward_cents", "income_report_selection_started_at", "decision_duration_ms", "decision_time_ms",
  "page_hidden_duration_ms", "timer_resumed_after_reload", "decision_timing_segments_json", "decision_started_at_client",
  "decision_submitted_at_client", "server_received_at", "submitted_at", "saved_at", "actual_income", "reported_income",
  "deduction", "retained_reward", "underreport_amount", "stimulus_version", "stimulus_seed", "peer_profile_id",
  "stable_member_ids_json", "peer_display_order_json", "peer_actual_income_records_json", "peer_reported_income_records_json",
  "peer_records_json"
];

function incomeReportsCsv(sessions) {
  return toCsv(incomeReportRows(sessions), INCOME_COLUMNS);
}

function summary(sessions) {
  const legacy = Object.fromEntries(["hidden", "honest", "dishonest"].map((condition) => {
    const matching = sessions.filter((session) => session.condition === condition);
    return [condition, { sessions: matching.length, started: matching.filter((session) => session.started_at).length, completed: matching.filter((session) => session.status === "completed").length }];
  }));
  return {
    ...legacy,
    active_matrix: activeCells().map((cell) => {
      const matching = sessions.filter((session) => session.protocol_version === HUMAN_AI_PROTOCOL_VERSION && session.peer_identity === cell.peer_identity && session.condition === cell.condition);
      return { ...cell, sessions: matching.length, started: matching.filter((session) => session.started_at).length, completed: matching.filter((session) => session.status === "completed").length };
    })
  };
}

module.exports = {
  csvEscape,
  toCsv,
  sessionScope,
  identityFields,
  participantsCsv,
  effortRoundsRows,
  effortRoundsCsv,
  incomeReportRows,
  incomeReportsCsv,
  summary
};
