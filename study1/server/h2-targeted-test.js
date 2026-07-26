const assert = require("assert");
const crypto = require("crypto");
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
const {
  COMPOSITION_VERSION,
  fixedDishonestCountForCondition,
  conditionFamilyForCondition
} = require("../config/fixed-gradient");
const app = require("./index");

const EXPECTED_CONDITIONS = [
  "hidden",
  "honest",
  "dishonest",
  "dishonest_escalating",
  "dishonest_fixed_1",
  "dishonest_fixed_2",
  "dishonest_fixed_3"
];
const EXPECTED_FIXED_COUNTS = {
  honest: 0,
  dishonest_fixed_1: 1,
  dishonest_fixed_2: 2,
  dishonest_fixed_3: 3,
  dishonest: 4
};
const LEGACY_STIMULUS_HASHES = {
  hidden: "a699da5b8ff73cfa1748d949cbe4ad95309a22e06f8f569270b56c7c1baeaf57",
  honest: "0bb6f97b0189cf53804b7c0e5b2818f415b3c9b2f079e4bed1c81848fc1f5418",
  dishonest: "2a0b35943ba9f0e07afcd573bb21109a911ad6ca766c2ab6fca897509637fe86",
  dishonest_escalating: "0cea23e7c2411735262b1483b9ee66bf3f8c645ed15a3a22a3243f33c59cac28"
};

function actualMisreporters(round) {
  return round.peer_records
    .filter((record) => record.underlying_reported_value > round.true_die_value)
    .map((record) => record.name);
}

function assertLegalMisreport(record, trueValue) {
  assert(record.reportedValue > trueValue, `${record.name} must report above the true value`);
  assert(record.reportedValue <= 6, `${record.name} report must not exceed 6`);
}

function legacyProjection(stimuli) {
  return {
    diceSequence: stimuli.diceSequence,
    peerDisplayOrder: stimuli.peerDisplayOrder,
    peerRecordsByRound: stimuli.peerRecordsByRound.map((round) => ({
      round_index: round.round_index,
      true_die_value: round.true_die_value,
      peer_display_order: round.peer_display_order,
      peer_records: round.peer_records,
      n_peers_misreporting: round.n_peers_misreporting,
      misreporting_peer_names: round.misreporting_peer_names,
      schedule_version: round.schedule_version
    }))
  };
}

function projectionHash(stimuli) {
  return crypto.createHash("sha256")
    .update(JSON.stringify(legacyProjection(stimuli)))
    .digest("hex");
}

assert.deepStrictEqual(CONDITIONS, EXPECTED_CONDITIONS);
assert.strictEqual(SCHEDULE_VERSION, "h2-escalation-v1");
assert.deepStrictEqual(PEER_ONSET_ROUNDS, {
  li_hua: 1,
  wang_fang: 3,
  chen_si: 5,
  zhang_ming: 8
});

for (const [condition, expectedHash] of Object.entries(LEGACY_STIMULUS_HASHES)) {
  const stimuli = app._internal.createStudy1Stimuli(condition, "legacy-regression-seed-v1");
  assert.strictEqual(projectionHash(stimuli), expectedHash, `${condition} legacy behavior changed`);
}

const compositionSignatures = {
  dishonest_fixed_1: new Set(),
  dishonest_fixed_2: new Set(),
  dishonest_fixed_3: new Set()
};

for (let seedIndex = 0; seedIndex < 40; seedIndex += 1) {
  const seed = `h2-targeted-seed-${seedIndex}`;
  for (const condition of EXPECTED_CONDITIONS) {
    const stimuli = app._internal.createStudy1Stimuli(condition, seed);
    const repeated = app._internal.createStudy1Stimuli(condition, seed);
    assert.deepStrictEqual(stimuli, repeated, "same seed must reproduce the same persisted stimuli");
    assert.strictEqual(stimuli.peerRecordsByRound.length, 10);
    assert.strictEqual(stimuli.peerDisplayOrder.length, 4);

    const expectedFixedCount = fixedDishonestCountForCondition(condition);
    assert.strictEqual(stimuli.fixedDishonestCount, expectedFixedCount);
    assert.strictEqual(stimuli.conditionFamily, conditionFamilyForCondition(condition));
    assert.strictEqual(
      stimuli.compositionVersion,
      expectedFixedCount === null ? null : COMPOSITION_VERSION
    );

    if (expectedFixedCount === null) {
      assert.strictEqual(stimuli.fixedDishonestPeerNames, null);
      assert.strictEqual(stimuli.peerBehaviorAssignments, null);
    } else {
      assert.strictEqual(stimuli.fixedDishonestPeerNames.length, expectedFixedCount);
      assert.strictEqual(new Set(stimuli.fixedDishonestPeerNames).size, expectedFixedCount);
      for (const name of stimuli.fixedDishonestPeerNames) {
        assert(stimuli.peerDisplayOrder.includes(name), `unknown fixed peer ${name}`);
      }
      const expectedAssignments = Object.fromEntries(
        stimuli.peerDisplayOrder.map((name) => [
          name,
          stimuli.fixedDishonestPeerNames.includes(name) ? "dishonest" : "honest"
        ])
      );
      assert.deepStrictEqual(stimuli.peerBehaviorAssignments, expectedAssignments);
      if (compositionSignatures[condition]) {
        compositionSignatures[condition].add([...stimuli.fixedDishonestPeerNames].sort().join("|"));
      }
    }

    const observedCounts = [];
    const firstMisreportRound = new Map();
    for (const round of stimuli.peerRecordsByRound) {
      assert.deepStrictEqual(round.peer_display_order, stimuli.peerDisplayOrder);
      assert.strictEqual(round.schedule_version, SCHEDULE_VERSION);
      assert.strictEqual(round.condition_family, stimuli.conditionFamily);
      assert.strictEqual(round.fixed_dishonest_count, stimuli.fixedDishonestCount);
      assert.deepStrictEqual(round.fixed_dishonest_peer_names, stimuli.fixedDishonestPeerNames);
      assert.strictEqual(round.composition_version, stimuli.compositionVersion);
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

    if (Object.prototype.hasOwnProperty.call(EXPECTED_FIXED_COUNTS, condition)) {
      assert.deepStrictEqual(observedCounts, Array(10).fill(EXPECTED_FIXED_COUNTS[condition]));
      const fixedNames = [...stimuli.fixedDishonestPeerNames].sort();
      for (const round of stimuli.peerRecordsByRound) {
        assert.deepStrictEqual([...actualMisreporters(round)].sort(), fixedNames);
      }
    }
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

for (const [condition, signatures] of Object.entries(compositionSignatures)) {
  assert(signatures.size > 1, `${condition} did not vary peer composition across sessions`);
}

console.log("H2 targeted tests passed: seven conditions, A-D regression hashes, fixed gradients, escalation schedule, legal reports, and deterministic persistence.");
