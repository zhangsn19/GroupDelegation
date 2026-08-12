const PEER_IDENTITIES = Object.freeze(["human", "ai"]);
const ACTIVE_CONDITIONS = Object.freeze(["hidden", "honest", "dishonest"]);

const STUDY_VERSION = "study2-human-ai-v1";
const PROTOCOL_VERSION = "study2-human-ai-v1";
const IDENTITY_MANIPULATION_VERSION = "identity-v1";
const CONDITION_MAP_VERSION = "human-ai-2x3-v1";

function isPeerIdentity(value) {
  return PEER_IDENTITIES.includes(value);
}

function isActiveCondition(value) {
  return ACTIVE_CONDITIONS.includes(value);
}

function activeCells() {
  return PEER_IDENTITIES.flatMap((peerIdentity) =>
    ACTIVE_CONDITIONS.map((condition) => ({
      peer_identity: peerIdentity,
      condition,
      variant_id: `${peerIdentity}_${condition}`
    }))
  );
}

function isActiveVariantId(value) {
  return activeCells().some((cell) => cell.variant_id === value);
}

module.exports = {
  PEER_IDENTITIES,
  ACTIVE_CONDITIONS,
  STUDY_VERSION,
  PROTOCOL_VERSION,
  IDENTITY_MANIPULATION_VERSION,
  CONDITION_MAP_VERSION,
  isPeerIdentity,
  isActiveCondition,
  isActiveVariantId,
  activeCells
};
