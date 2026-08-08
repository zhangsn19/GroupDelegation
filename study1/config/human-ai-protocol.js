const PEER_IDENTITIES = Object.freeze(["human", "ai"]);

const SUPPORTED_CONDITIONS = Object.freeze([
  "hidden",
  "honest",
  "dishonest_fixed_1",
  "dishonest_fixed_2",
  "dishonest_fixed_3",
  "dishonest",
  "dishonest_escalating"
]);

const ACTIVE_HUMAN_AI_CONDITIONS = Object.freeze([
  "hidden",
  "honest",
  "dishonest_fixed_1",
  "dishonest_fixed_2",
  "dishonest_fixed_3",
  "dishonest"
]);

const PROTOCOL_VERSION = "study1-human-ai-v1";
const IDENTITY_MANIPULATION_VERSION = "identity-v1";
const CONDITION_MAP_VERSION = "human-ai-2x7-v1";

function isPeerIdentity(value) {
  return PEER_IDENTITIES.includes(value);
}

function isSupportedCondition(value) {
  return SUPPORTED_CONDITIONS.includes(value);
}

function isActiveHumanAiCondition(value) {
  return ACTIVE_HUMAN_AI_CONDITIONS.includes(value);
}

function activeCells() {
  return PEER_IDENTITIES.flatMap((peerIdentity) =>
    ACTIVE_HUMAN_AI_CONDITIONS.map((condition) => ({ peer_identity: peerIdentity, condition }))
  );
}

function supportedCells() {
  return PEER_IDENTITIES.flatMap((peerIdentity) =>
    SUPPORTED_CONDITIONS.map((condition) => ({ peer_identity: peerIdentity, condition }))
  );
}

module.exports = {
  PEER_IDENTITIES,
  SUPPORTED_CONDITIONS,
  ACTIVE_HUMAN_AI_CONDITIONS,
  PROTOCOL_VERSION,
  IDENTITY_MANIPULATION_VERSION,
  CONDITION_MAP_VERSION,
  isPeerIdentity,
  isSupportedCondition,
  isActiveHumanAiCondition,
  activeCells,
  supportedCells
};
