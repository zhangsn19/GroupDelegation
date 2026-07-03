const PEER_INCOME_TEMPLATE = [
  { name: "张明", actualIncomeCents: 1100, honestReportedCents: 1100, dishonestReportedCents: 550 },
  { name: "李华", actualIncomeCents: 950, honestReportedCents: 950, dishonestReportedCents: 500 },
  { name: "王芳", actualIncomeCents: 1250, honestReportedCents: 1250, dishonestReportedCents: 600 },
  { name: "陈思", actualIncomeCents: 1050, honestReportedCents: 1050, dishonestReportedCents: 450 }
];

function moneyFromCents(cents) {
  return (Number(cents) / 100).toFixed(2);
}

function buildIncomePeerRecords(condition) {
  if (condition === "hidden") {
    return PEER_INCOME_TEMPLATE.map((record) => ({
      name: record.name,
      actual_income_cents: null,
      actualIncome: null,
      reported_income_cents: null,
      reportedIncome: null,
      visibility: "hidden",
      text: "已完成此前收入申报。当前信息设置下，实际收入和申报内容不可见。"
    }));
  }

  return PEER_INCOME_TEMPLATE.map((record) => {
    const reportedCents = condition === "honest" ? record.honestReportedCents : record.dishonestReportedCents;
    return {
      name: record.name,
      actual_income_cents: record.actualIncomeCents,
      actualIncome: Number(moneyFromCents(record.actualIncomeCents)),
      reported_income_cents: reportedCents,
      reportedIncome: Number(moneyFromCents(reportedCents)),
      visibility: "visible",
      text: `实际收入 ¥${moneyFromCents(record.actualIncomeCents)}；已申报收入 ¥${moneyFromCents(reportedCents)}。`
    };
  });
}

module.exports = {
  PEER_INCOME_TEMPLATE,
  buildIncomePeerRecords,
  moneyFromCents
};
