const COMPOSITION_VERSION = "fixed-gradient-v1";

const FIXED_DISHONEST_COUNTS = Object.freeze({
  honest: 0,
  dishonest_fixed_1: 1,
  dishonest_fixed_2: 2,
  dishonest_fixed_3: 3,
  dishonest: 4
});

function fixedDishonestCountForCondition(condition) {
  return Object.prototype.hasOwnProperty.call(FIXED_DISHONEST_COUNTS, condition)
    ? FIXED_DISHONEST_COUNTS[condition]
    : null;
}

function conditionFamilyForCondition(condition) {
  if (condition === "hidden") return "hidden";
  if (condition === "dishonest_escalating") return "escalating";
  if (fixedDishonestCountForCondition(condition) !== null) return "fixed_gradient";
  return null;
}

function compositionVersionForCondition(condition) {
  return fixedDishonestCountForCondition(condition) === null ? null : COMPOSITION_VERSION;
}

function conditionAnalysisLabelForCondition(condition) {
  if (condition === "dishonest") return "dishonest_static";
  return condition;
}

module.exports = {
  COMPOSITION_VERSION,
  FIXED_DISHONEST_COUNTS,
  fixedDishonestCountForCondition,
  conditionFamilyForCondition,
  compositionVersionForCondition,
  conditionAnalysisLabelForCondition
};
