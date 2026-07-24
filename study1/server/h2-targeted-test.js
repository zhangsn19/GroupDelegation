const assert = require("assert");
const os = require("os");
const path = require("path");

process.env.NODE_ENV = "development";
process.env.DEBUG_LINKS = "false";
process.env.ASSIGNMENT_MODE = "block";
process.env.PARTICIPANT_ID_POLICY = "open";
process.env.REQUIRE_PARTICIPANT_ID = "false";
process.env.DATA_DIR = path.join(os.tmpdir(), `group-deception-study1-h2-targeted-${process.pid}`);

const { CONDITIONS } = require("../config/common");
const {
  SCHEDULE_VERSION,
  PEER_ONSET_ROUNDS,
  EXPECTED_MISREPORTING_COUNTS,
  peerIdForName
} = require("../config/h2-escalation");
const app = require("./index");

const EXPECTED_CONDITIONS = ["hidden", "honest", "dishonest", "dishonest_escalating"];

function actualMisreporters(round) {
  return round.peer_records
    .filter((record) => record.underlying_reported_value > round.true_die_value)
    .map((record) => record.name);
}

function assertLegalMisreport(record, trueValue) {
  assert(record.reportedValue > trueValue, `${record.name} must report above the true value`);
  assert(record.reportedValue <= 6, `${record.name} report must not exceed 6`);
}

assert.deepStrictEqual(CONDITIONS, EXPECTED_CONDITIONS);
assert.strictEqual(SCHEDULE_VERSION, "h2-escalation-v1");
assert.deepStrictEqual(PEER_ONSET_ROUNDS, {
  li_hua: 1,
  wang_fang: 3,
  chen_si: 5,
  zhang_ming: 8
});

for (let seedIndex = 0; seedIndex < 20; seedIndex += 1) {
  const seed = `h2-targeted-seed-${seedIndex}`;
  for (const condition of EXPECTED_CONDITIONS) {
    const stimuli = app._internal.createStudy1Stimuli(condition, seed);
    const repeated = app._internal.createStudy1Stimuli(condition, seed);
    assert.deepStrictEqual(stimuli, repeated, "same seed must reproduce the same persisted stimuli");
    assert.strictEqual(stimuli.peerRecordsByRound.length, 10);
    assert.strictEqual(stimuli.peerDisplayOrder.length, 4);

    const observedCounts = [];
    const firstMisreportRound = new Map();
    for (const round of stimuli.peerRecordsByRound) {
      assert.deepStrictEqual(round.peer_display_order, stimuli.peerDisplayOrder);
      assert.strictEqual(round.schedule_version, SCHEDULE_VERSION);
      const names = actualMisreporters(round);

      if (condition === "hidden") {
        assert.strictEqual(round.n_peers_misreporting, null);
        assert.strictEqual(round.misreporting_peer_names, null);
        round.peer_records.forEach((record) => {
          assert.strictEqual(record.reportedValue, null);
          assert.strictEqual(record.underlying_reported_value, round.true_die_value);
        });
        continue;
      }

      assert.strictEqual(round.n_peers_misreporting, names.length);
      assert.deepStrictEqual(round.misreporting_peer_names, names);
      observedCounts.push(names.length);

      for (const record of round.peer_records) {
        const isMisreporting = names.includes(record.name);
        if (isMisreporting) {
          assertLegalMisreport(record, round.true_die_value);
          if (!firstMisreportRound.has(record.name)) firstMisreportRound.set(record.name, round.round_index);
        } else {
          assert.strictEqual(record.reportedValue, round.true_die_value);
        }
      }
    }

    if (condition === "honest") assert.deepStrictEqual(observedCounts, Array(10).fill(0));
    if (condition === "dishonest") assert.deepStrictEqual(observedCounts, Array(10).fill(4));
    if (condition === "dishonest_escalating") {
      assert.deepStrictEqual(observedCounts, [...EXPECTED_MISREPORTING_COUNTS]);
      for (const [name, firstRound] of firstMisreportRound) {
        assert.strictEqual(firstRound, PEER_ONSET_ROUNDS[peerIdForName(name)]);
      }
      for (const name of stimuli.peerDisplayOrder) {
        const onset = PEER_ONSET_ROUNDS[peerIdForName(name)];
        for (const round of stimuli.peerRecordsByRound) {
          const isMisreporting = actualMisreporters(round).includes(name);
          assert.strictEqual(isMisreporting, round.round_index >= onset, `${name} changed back after onset`);
        }
      }
    }
  }
}

console.log("H2 targeted tests passed: four conditions, escalation schedule, monotonic onsets, legal reports, and deterministic persistence.");
