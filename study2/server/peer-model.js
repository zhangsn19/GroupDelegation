const crypto = require("crypto");

const MEMBER_IDS = Object.freeze(["member_1", "member_2", "member_3", "member_4"]);
const MAX_TOTAL_INCOME_CENTS = 2960;
const PROFILE_OFFSETS = Object.freeze({
  P1: [-250, -100, 100, 250],
  P2: [-200, -150, 150, 200],
  P3: [-240, -60, 60, 240],
  P4: [-180, -120, 120, 180],
  P5: [-220, -80, 80, 220],
  P6: [-160, -140, 140, 160]
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seededRandom(seed, namespace) {
  let counter = 0;
  return () => {
    const digest = crypto.createHash("sha256").update(`${seed}|${namespace}|${counter++}`).digest();
    return digest.readUInt32BE(0) / 0x100000000;
  };
}

function seededShuffle(values, random) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function memberPresentation(peerIdentity, memberId) {
  const index = MEMBER_IDS.indexOf(memberId) + 1;
  const human = peerIdentity === "human";
  return {
    name: `${human ? "Human" : "AI"} Member ${index}`,
    role: human ? "Human group member" : "AI group member",
    avatar: human ? "👤" : "🤖"
  };
}

function createPeerIncomeRecords(session) {
  const profileId = session.study2_peer_profile_id || "P1";
  const offsets = PROFILE_OFFSETS[profileId] || PROFILE_OFFSETS.P1;
  const baseCents = clamp(Number(session.actual_income_cents || 0), 500, 2710);
  const shuffledActuals = seededShuffle(
    offsets.map((offset) => clamp(baseCents + offset, 250, MAX_TOTAL_INCOME_CENTS)),
    seededRandom(session.stimulus_seed || session.id, "study2-peer-income-name-mapping")
  );
  const order = session.study2_peer_display_order || MEMBER_IDS;
  const byId = new Map(MEMBER_IDS.map((memberId, index) => {
    const actual = shuffledActuals[index];
    const reported = session.condition === "dishonest" ? Math.max(0, Math.round(actual * 0.5)) : actual;
    const presentation = memberPresentation(session.peer_identity, memberId);
    return [memberId, {
      member_id: memberId,
      name: presentation.name,
      peer_name: presentation.name,
      role: presentation.role,
      avatar: presentation.avatar,
      actual_income_cents: actual,
      actual_income: Number((actual / 100).toFixed(2)),
      actualIncome: Number((actual / 100).toFixed(2)),
      reported_income_cents: reported,
      reported_income: Number((reported / 100).toFixed(2)),
      reportedIncome: Number((reported / 100).toFixed(2)),
      visibility: session.condition === "hidden" ? "hidden" : "visible"
    }];
  }));
  return order.map((memberId, index) => ({ ...byId.get(memberId), display_position: index + 1 }));
}

module.exports = { MEMBER_IDS, PROFILE_OFFSETS, MAX_TOTAL_INCOME_CENTS, createPeerIncomeRecords };
