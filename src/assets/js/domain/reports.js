function amount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function buildManagementReport(projects = []) {
  const rows = projects.map((project) => {
    const contractValue = amount(project.contractValue);
    const invoiced = amount(project.totalInvoiced);
    const paid = amount(project.totalPaid);
    const costsExpenses = amount(project.totalCostsExpenses);
    return Object.freeze({
      projectId: String(project.projectId ?? ""),
      costCenter: String(project.costCenter ?? ""),
      projectName: String(project.projectName ?? ""),
      municipality: String(project.municipality ?? ""),
      status: String(project.status ?? ""),
      contractValue,
      invoiced,
      paid,
      costsExpenses,
      contractualBalance: Math.max(contractValue - invoiced, 0),
      paymentPending: Math.max(invoiced - paid, 0),
      financialProgress: percentage(invoiced, contractValue),
      collectionRate: percentage(paid, invoiced),
      costRate: percentage(costsExpenses, contractValue),
      billingCostDifference: invoiced - costsExpenses
    });
  });

  const totals = rows.reduce((result, row) => {
    result.contractValue += row.contractValue;
    result.invoiced += row.invoiced;
    result.paid += row.paid;
    result.costsExpenses += row.costsExpenses;
    result.contractualBalance += row.contractualBalance;
    result.paymentPending += row.paymentPending;
    result.billingCostDifference += row.billingCostDifference;
    return result;
  }, {
    projectCount: rows.length,
    contractValue: 0,
    invoiced: 0,
    paid: 0,
    costsExpenses: 0,
    contractualBalance: 0,
    paymentPending: 0,
    billingCostDifference: 0
  });

  totals.financialProgress = percentage(totals.invoiced, totals.contractValue);
  totals.collectionRate = percentage(totals.paid, totals.invoiced);
  totals.costRate = percentage(totals.costsExpenses, totals.contractValue);

  return Object.freeze({
    totals: Object.freeze({ ...totals }),
    rows: Object.freeze(rows)
  });
}
