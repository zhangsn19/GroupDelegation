const { CONDITIONS } = require("../config/common");
const {
  fixedDishonestCountForCondition,
  conditionFamilyForCondition,
  conditionAnalysisLabelForCondition
} = require("../config/fixed-gradient");

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
    participant_id: session.participant_id || session.prolific_id || "",
    prolific_id: session.prolific_id || "",
    study: session.study,
    condition: session.condition,
    condition_analysis_label: session.condition_analysis_label || conditionAnalysisLabelForCondition(session.condition),
    condition_family: session.condition_family ?? "",
    fixed_dishonest_count: session.fixed_dishonest_count ?? "",
    fixed_dishonest_peer_names_json: Array.isArray(session.fixed_dishonest_peer_names)
      ? JSON.stringify(session.fixed_dishonest_peer_names)
      : "",
    composition_version: session.composition_version || "",
    schedule_version: session.schedule_version || "",
    peer_onset_rounds_json: session.peer_onset_rounds ? JSON.stringify(session.peer_onset_rounds) : "",
    assignment_source: session.assignment_source || "block",
    entry_link_id: session.entry_link_id || "",
    condition_assigned_at: session.condition_assigned_at || "",
    randomization_block: session.randomization_block ?? "",
    randomization_position: session.randomization_position ?? "",
    is_test_session: session.is_test_session ? 1 : 0,
    study_version: session.study_version || "",
    protocol_version: session.protocol_version || "",
    condition_map_version: session.condition_map_version || "",
    posttest_schema_version: session.posttest_schema_version || "",
    source_task_protocol: session.source_task_protocol || "",
    source_task_commit: session.source_task_commit || "",
    source_condition: session.source_condition || session.condition || "",
    analysis_condition: session.analysis_condition || "",
    peer_identity: session.peer_identity || "",
    scope: session.scope || "",
    git_commit: session.git_commit || "",
    release_id: session.release_id || "",
    debug_mode: session.debug_mode ? 1 : 0,
    status: session.status,
    completed: session.status === "completed" ? 1 : 0,
    created_at: session.created_at,
    completed_at: session.completed_at || "",
    debrief_viewed_at: session.debrief_viewed_at || "",
    completion_status: session.completion_status || "",
    total_duration_ms: session.completed_at ? new Date(session.completed_at) - new Date(session.created_at) : "",
    ...flattenResponses("baseline", session.baseline),
    ...flattenResponses("post", session.post_survey),
    ...flattenResponses("demo", session.demographics),
    ...study1Metrics(session)
  }));

  const dynamicKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const preferred = ["session_id", "participant_id", "study", "study_version", "protocol_version", "condition_map_version", "posttest_schema_version", "source_task_protocol", "source_task_commit", "condition", "source_condition", "analysis_condition", "peer_identity", "scope", "git_commit", "release_id", "condition_analysis_label", "condition_family", "fixed_dishonest_count", "fixed_dishonest_peer_names_json", "composition_version", "schedule_version", "peer_onset_rounds_json", "assignment_source", "entry_link_id", "condition_assigned_at", "randomization_block", "randomization_position", "is_test_session", "created_at", "completed_at", "debrief_viewed_at", "completion_status"];
  const keys = [...preferred, ...dynamicKeys.filter((key) => !preferred.includes(key))];
  return toCsv(rows, keys.map((key) => ({ key })));
}

function study1DiceRoundsCsv(sessions) {
  const rows = [];
  for (const session of sessions) {
    for (const round of session.dice_rounds || []) {
      const peerRecords = round.peer_records || session.peer_records_sequence?.[Number(round.round_index) - 1] || [];
      rows.push({
        session_id: session.id,
        participant_id: session.participant_id || session.prolific_id || "",
        study: session.study,
        condition: session.condition,
        condition_analysis_label: session.condition_analysis_label || conditionAnalysisLabelForCondition(session.condition),
        condition_family: round.condition_family ?? session.condition_family ?? "",
        fixed_dishonest_count: round.fixed_dishonest_count ?? session.fixed_dishonest_count ?? "",
        round: round.round_index,
        true_dice: round.true_die_value,
        submitted_dice: round.reported_value,
        misreport_amount: round.misreport_magnitude,
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
        n_peers_misreporting: round.n_peers_misreporting,
        misreporting_peer_names: Array.isArray(round.misreporting_peer_names) ? round.misreporting_peer_names.join("|") : "",
        fixed_dishonest_peer_names: Array.isArray(round.fixed_dishonest_peer_names)
          ? round.fixed_dishonest_peer_names.join("|")
          : (Array.isArray(session.fixed_dishonest_peer_names) ? session.fixed_dishonest_peer_names.join("|") : ""),
        composition_version: round.composition_version || session.composition_version || "",
        schedule_version: round.schedule_version || session.schedule_version || "",
        stimulus_version: session.stimulus_version || "",
        stimulus_seed: session.stimulus_seed || "",
        peer_display_order_json: JSON.stringify(round.peer_display_order || session.study1_peer_display_order || []),
        peer_records_json: JSON.stringify(peerRecords)
      });
    }
  }
  return toCsv(rows, [
    { key: "session_id" },
    { key: "participant_id" },
    { key: "study" },
    { key: "condition" },
    { key: "condition_analysis_label" },
    { key: "condition_family" },
    { key: "fixed_dishonest_count" },
    { key: "round" },
    { key: "true_dice" },
    { key: "submitted_dice" },
    { key: "misreport_amount" },
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
    { key: "n_peers_misreporting" },
    { key: "misreporting_peer_names" },
    { key: "fixed_dishonest_peer_names" },
    { key: "composition_version" },
    { key: "schedule_version" },
    { key: "stimulus_version" },
    { key: "stimulus_seed" },
    { key: "peer_display_order_json" },
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
        condition_analysis_label: conditionAnalysisLabelForCondition(condition),
        condition_family: conditionFamilyForCondition(condition),
        fixed_dishonest_count: fixedDishonestCountForCondition(condition),
        sessions: matching.length,
        started: matching.filter((session) => session.status && session.status !== "created").length,
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
