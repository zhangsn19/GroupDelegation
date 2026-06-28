const PEER_INCOME_TEMPLATE = [
  { name: "张明", actualIncomeCents: 110, honestReportedCents: 110, dishonestReportedCents: 55 },
  { name: "李华", actualIncomeCents: 95, honestReportedCents: 95, dishonestReportedCents: 50 },
  { name: "王芳", actualIncomeCents: 125, honestReportedCents: 125, dishonestReportedCents: 60 },
  { name: "陈思", actualIncomeCents: 105, honestReportedCents: 105, dishonestReportedCents: 45 }
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
