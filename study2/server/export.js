function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows, columns) {
  return [
    columns.map((column) => csvEscape(column)).join(","),
    ...rows.map((row) => columns.map((column) => csvEscape(row[column])).join(","))
  ].join("\n") + "\n";
}

function flattenResponses(prefix, responses = {}) {
  return Object.fromEntries(Object.entries(responses).map(([key, value]) => [`${prefix}_${key}`, value]));
}

function participantsCsv(sessions) {
  const rows = sessions.map((session) => ({
    session_id: session.id,
    participant_id: session.participant_id || session.prolific_id || "",
    study: session.study || "study2",
    prolific_id: session.prolific_id || "",
    condition: session.condition,
    condition_assigned_at: session.condition_assigned_at || "",
    randomization_block: session.randomization_block ?? "",
    randomization_position: session.randomization_position ?? "",
    is_test_session: session.is_test_session ? 1 : 0,
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    debug_mode: session.debug_mode ? 1 : 0,
    status: session.status,
    completed: session.status === "completed" ? 1 : 0,
    created_at: session.created_at,
    completed_at: session.completed_at || "",
    completion_status: session.completion_status || "",
    actual_income: session.actual_income,
    actual_income_cents: session.actual_income_cents,
    reported_income_cents: session.income_report?.reported_income_cents,
    reported_income: session.income_report?.reported_income,
    deduction_cents: session.income_report?.deduction_cents,
    deduction: session.income_report?.deduction,
    retained_reward_cents: session.income_report?.retained_reward_cents,
    retained_reward: session.income_report?.retained_reward,
    underreport_amount_cents: session.income_report?.underreport_amount_cents,
    underreport_amount: session.income_report?.underreport_amount,
    underreport_rate: session.income_report?.underreport_rate,
    effort_total_correct: session.effort_summary?.total_correct,
    effort_total_duration_ms: session.effort_summary?.total_duration_ms,
    ...flattenResponses("baseline", session.baseline),
    ...flattenResponses("post", session.post_survey),
    ...flattenResponses("experience", session.experience),
    ...flattenResponses("demo", session.demographics)
  }));
  const dynamic = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const preferred = ["session_id", "participant_id", "study", "condition", "condition_assigned_at", "randomization_block", "randomization_position", "is_test_session", "study_version", "protocol_version", "created_at", "completed_at", "completion_status"];
  const columns = [...preferred, ...dynamic.filter((key) => !preferred.includes(key))];
  return toCsv(rows, columns);
}

function effortRoundsCsv(sessions) {
  const rows = [];
  for (const session of sessions) {
    for (const round of session.effort_rounds || []) {
      rows.push({
        session_id: session.id,
        participant_id: session.participant_id || session.prolific_id || "",
        condition: session.condition,
        round: round.round_index,
        round_index: round.round_index,
        numbers_json: JSON.stringify(round.numbers),
        answers_json: JSON.stringify(round.answers || {}),
        correct_count: round.correct_count,
        duration_ms: round.duration_ms,
        timed_out: round.timed_out ? 1 : 0,
        income_cents: round.income_cents,
        income: round.income,
        started_at: round.started_at,
        deadline_at: round.deadline_at,
        submitted_at: round.submitted_at
      });
    }
  }
  return toCsv(rows, ["session_id", "participant_id", "condition", "round", "round_index", "started_at", "deadline_at", "submitted_at", "timed_out", "correct_count", "income_cents", "numbers_json", "answers_json", "duration_ms", "income"]);
}

function incomeReportsCsv(sessions) {
  const rows = sessions
    .filter((session) => session.income_report)
    .map((session) => ({
      session_id: session.id,
      participant_id: session.participant_id || session.prolific_id || "",
      condition: session.condition,
      actual_income_cents: session.actual_income_cents,
      actual_income: session.actual_income,
      reported_income_cents: session.income_report.reported_income_cents,
      reported_income: session.income_report.reported_income,
      deduction_cents: session.income_report.deduction_cents,
      deduction: session.income_report.deduction,
      retained_reward_cents: session.income_report.retained_reward_cents,
      retained_reward: session.income_report.retained_reward,
      underreport_amount_cents: session.income_report.underreport_amount_cents,
      underreport_amount: session.income_report.underreport_amount,
      underreport_rate: session.income_report.underreport_rate,
      income_report_selection_started_at: session.income_report.selection_started_at || session.income_report_selection_started_at,
      decision_duration_ms: session.income_report.decision_duration_ms,
      submitted_at: session.income_report.submitted_at,
      peer_records_json: JSON.stringify(session.peer_income_records || [])
    }));
  return toCsv(rows, ["session_id", "participant_id", "condition", "actual_income_cents", "reported_income_cents", "underreport_amount_cents", "underreport_rate", "income_report_selection_started_at", "decision_duration_ms", "actual_income", "reported_income", "deduction_cents", "deduction", "retained_reward_cents", "retained_reward", "underreport_amount", "submitted_at", "peer_records_json"]);
}

function summary(sessions) {
  const conditions = ["hidden", "honest", "dishonest"];
  return Object.fromEntries(conditions.map((condition) => {
    const matching = sessions.filter((session) => session.condition === condition);
    return [condition, {
      sessions: matching.length,
      completed: matching.filter((session) => session.status === "completed").length
    }];
  }));
}

module.exports = {
  participantsCsv,
  effortRoundsCsv,
  incomeReportsCsv,
  summary
};
