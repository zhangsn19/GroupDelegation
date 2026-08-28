"use strict";

const STUDY_VERSION = "group-deception-norm-supplement-v1";
const PROTOCOL_VERSION = STUDY_VERSION;
const SOURCE_TASK_PROTOCOL = "study1-human-ai-v1";
const SOURCE_TASK_COMMIT = "53f2a95b48d66251b1c221f6af9612bc1d1d709d";
const CONDITION_MAP_VERSION = "norm-supplement-ai-3cell-v1";
const POSTTEST_SCHEMA_VERSION = "norm-supplement-posttest-v1";
const PEER_IDENTITY = "ai";

const SOURCE_TO_ANALYSIS = Object.freeze({
  honest: "descriptive_honest",
  dishonest: "descriptive_pro_misreport",
  hidden: "invisible",
});

const ACTIVE_CELLS = Object.freeze(Object.entries(SOURCE_TO_ANALYSIS).map(
  ([sourceCondition, analysisCondition]) => Object.freeze({
    peer_identity: PEER_IDENTITY,
    condition: sourceCondition,
    source_condition: sourceCondition,
    analysis_condition: analysisCondition,
  }),
));

function isNormSupplementProtocol(value) {
  return value === PROTOCOL_VERSION;
}

function usesHumanAiTaskPresentation(value) {
  return value === SOURCE_TASK_PROTOCOL || value === PROTOCOL_VERSION;
}

function isSourceCondition(value) {
  return Object.prototype.hasOwnProperty.call(SOURCE_TO_ANALYSIS, value);
}

function analysisConditionFor(value) {
  return isSourceCondition(value) ? SOURCE_TO_ANALYSIS[value] : null;
}

function isActiveCell(peerIdentity, sourceCondition) {
  return peerIdentity === PEER_IDENTITY && isSourceCondition(sourceCondition);
}

function activeCells() {
  return ACTIVE_CELLS.map((cell) => ({ ...cell }));
}

module.exports = {
  STUDY_VERSION,
  PROTOCOL_VERSION,
  SOURCE_TASK_PROTOCOL,
  SOURCE_TASK_COMMIT,
  CONDITION_MAP_VERSION,
  POSTTEST_SCHEMA_VERSION,
  PEER_IDENTITY,
  SOURCE_TO_ANALYSIS,
  ACTIVE_CELLS,
  isNormSupplementProtocol,
  usesHumanAiTaskPresentation,
  isSourceCondition,
  analysisConditionFor,
  isActiveCell,
  activeCells,
};
