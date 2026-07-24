const ESCALATING_CONDITION = "dishonest_escalating";
const SCHEDULE_VERSION = "h2-escalation-v1";

const PEER_ONSET_ROUNDS = Object.freeze({
  li_hua: 1,
  wang_fang: 3,
  chen_si: 5,
  zhang_ming: 8
});

const PEER_ID_BY_NAME = Object.freeze({
  李华: "li_hua",
  王芳: "wang_fang",
  陈思: "chen_si",
  张明: "zhang_ming"
});

const EXPECTED_MISREPORTING_COUNTS = Object.freeze([1, 1, 2, 2, 3, 3, 3, 4, 4, 4]);

function peerIdForName(name) {
  return PEER_ID_BY_NAME[name] || null;
}

function isEscalatingPeerMisreporting(name, roundNumber) {
  const peerId = peerIdForName(name);
  const onsetRound = peerId ? PEER_ONSET_ROUNDS[peerId] : null;
  return Number.isInteger(onsetRound) && roundNumber >= onsetRound;
}

module.exports = {
  ESCALATING_CONDITION,
  SCHEDULE_VERSION,
  PEER_ONSET_ROUNDS,
  PEER_ID_BY_NAME,
  EXPECTED_MISREPORTING_COUNTS,
  peerIdForName,
  isEscalatingPeerMisreporting
};
