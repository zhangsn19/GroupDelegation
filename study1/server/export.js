const { CONDITIONS } = require("../config/common");

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => csvEscape(column.label || column.key)).join(",");
  const body = rows.map((row) => columns.map((column) => csvEscape(resolveValue(row, column.key))).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

function resolveValue(row, key) {
  return key.split(".").reduce((value, part) => (value ? value[part] : undefined), row);
}

function study1Metrics(session) {
  const rounds = session.dice_rounds || [];
  const upward = rounds.filter((round) => round.upward_misreport);
  const totalReported = rounds.reduce((sum, round) => sum + Number(round.reported_value || 0), 0);
  const totalTrue = rounds.reduce((sum, round) => sum + Number(round.true_die_value || 0), 0);
  const totalMagnitude = rounds.reduce((sum, round) => sum + Math.max(0, Number(round.misreport_magnitude || 0)), 0);
  return {
    study1_round_count: rounds.length,
    study1_avg_upward_misreport: rounds.length ? (totalMagnitude / rounds.length).toFixed(3) : "",
    study1_any_upward_misreport: upward.length > 0 ? 1 : 0,
    study1_upward_misreport_count: upward.length,
    study1_total_reported_minus_true: rounds.length ? totalReported - totalTrue : "",
    study1_max_report_count: rounds.filter((round) => Number(round.reported_value) === 6).length,
    study1_cumulative_reward: rounds.length ? rounds[rounds.length - 1].cumulative_reward : ""
  };
}

function flattenResponses(prefix, responses = {}) {
  return Object.fromEntries(Object.entries(responses).map(([key, value]) => [`${prefix}_${key}`, value]));
}

function participantsCsv(sessions) {
  const rows = sessions.map((session) => ({
    session_id: session.id,
    prolific_id: session.prolific_id || "",
    study: session.study,
    condition: session.condition,
    debug_mode: session.debug_mode ? 1 : 0,
    status: session.status,
    completed: session.status === "completed" ? 1 : 0,
    created_at: session.created_at,
    completed_at: session.completed_at || "",
    total_duration_ms: session.completed_at ? new Date(session.completed_at) - new Date(session.created_at) : "",
    ...flattenResponses("baseline", session.baseline),
    ...flattenResponses("post", session.post_survey),
    ...flattenResponses("demo", session.demographics),
    ...study1Metrics(session)
  }));

  const dynamicKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return toCsv(rows, dynamicKeys.map((key) => ({ key })));
}

function study1DiceRoundsCsv(sessions) {
  const rows = [];
  for (const session of sessions) {
    for (const round of session.dice_rounds || []) {
      const peerRecords = round.peer_records || session.peer_records_sequence?.[Number(round.round_index) - 1] || [];
      rows.push({
        session_id: session.id,
        study: session.study,
        condition: session.condition,
        round_index: round.round_index,
        true_die_value: round.true_die_value,
        reported_value: round.reported_value,
        upward_misreport: round.upward_misreport ? 1 : 0,
        misreport_magnitude: round.misreport_magnitude,
        personal_reward: round.personal_reward,
        cumulative_reward: round.cumulative_reward,
        selection_started_at: round.selection_started_at,
        submitted_at: round.submitted_at,
        decision_duration_ms: round.decision_duration_ms,
        submission_source: round.submission_source,
        peer_records_json: JSON.stringify(peerRecords)
      });
    }
  }
  return toCsv(rows, [
    { key: "session_id" },
    { key: "study" },
    { key: "condition" },
    { key: "round_index" },
    { key: "true_die_value" },
    { key: "reported_value" },
    { key: "upward_misreport" },
    { key: "misreport_magnitude" },
    { key: "personal_reward" },
    { key: "cumulative_reward" },
    { key: "selection_started_at" },
    { key: "submitted_at" },
    { key: "decision_duration_ms" },
    { key: "submission_source" },
    { key: "peer_records_json" }
  ]);
}

function emptyCsv(columns) {
  return toCsv([], columns.map((key) => ({ key })));
}

function summary(sessions) {
  const counts = {};
  for (const study of ["study1", "study2"]) {
    counts[study] = {};
    for (const condition of CONDITIONS) {
      const matching = sessions.filter((session) => session.study === study && session.condition === condition);
      counts[study][condition] = {
        sessions: matching.length,
        completed: matching.filter((session) => session.status === "completed").length
      };
    }
  }
  return counts;
}

module.exports = {
  participantsCsv,
  study1DiceRoundsCsv,
  emptyCsv,
  summary
};
