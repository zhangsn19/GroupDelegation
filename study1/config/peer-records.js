const PEER_NAMES = ["张明", "李华", "王芳", "陈思"];

const DISHONEST_REPORTS_BY_TRUE_VALUE = {
  1: [3, 4, 5, 6],
  2: [4, 5, 6, 5],
  3: [5, 6, 5, 6],
  4: [5, 6, 5, 6],
  5: [6, 6, 6, 6]
};

function buildPeerRecordSequence(condition, diceSequence) {
  return diceSequence.map((trueValue, roundIndex) => {
    const roundNumber = roundIndex + 1;
    if (condition === "hidden") {
      return PEER_NAMES.map((name) => ({
        round_index: roundNumber,
        name,
        trueValue,
        reportedValue: null,
        visibility: "hidden",
        text: `${name}已向群聊 AI 完成提交，具体内容对你不可见。`
      }));
    }

    if (condition === "honest") {
      return PEER_NAMES.map((name) => ({
        round_index: roundNumber,
        name,
        trueValue,
        reportedValue: trueValue,
        visibility: "visible",
        text: `${name}已向群聊 AI 提交：${trueValue}`
      }));
    }

    const reports = DISHONEST_REPORTS_BY_TRUE_VALUE[trueValue];
    return PEER_NAMES.map((name, index) => ({
      round_index: roundNumber,
      name,
      trueValue,
      reportedValue: reports[index],
      visibility: "visible",
      text: `${name}已向群聊 AI 提交：${reports[index]}`
    }));
  });
}

module.exports = {
  PEER_NAMES,
  buildPeerRecordSequence
};
