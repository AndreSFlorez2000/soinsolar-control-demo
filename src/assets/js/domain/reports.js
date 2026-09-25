import { topLevelFinancialRows } from "./cost-centers.js?v=1.3.1";

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
    const executionProgress = project.executedProgressPercentage === null || project.executedProgressPercentage === undefined
      ? null : Number(project.executedProgressPercentage ?? 0);
    const profitability = contractValue - costsExpenses;
    return Object.freeze({
      projectId: String(project.projectId ?? ""),
      parentProjectId: project.parentProjectId || null,
      costCenter: String(project.costCenter ?? ""),
      parentCostCenter: String(project.parentCostCenter ?? ""),
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
      executionProgress,
      profitability,
      profitabilityPercentage: percentage(profitability, contractValue),
      collectionRate: percentage(paid, invoiced),
      costRate: percentage(costsExpenses, contractValue),
      billingCostDifference: invoiced - costsExpenses
    });
  });

  const totalRows = topLevelFinancialRows(rows);
  const totals = totalRows.reduce((result, row) => {
    result.contractValue += row.contractValue;
    result.invoiced += row.invoiced;
    result.paid += row.paid;
    result.costsExpenses += row.costsExpenses;
    result.contractualBalance += row.contractualBalance;
    result.paymentPending += row.paymentPending;
    result.billingCostDifference += row.billingCostDifference;
    result.profitability += row.profitability;
    return result;
  }, {
    projectCount: rows.length,
    contractValue: 0,
    invoiced: 0,
    paid: 0,
    costsExpenses: 0,
    contractualBalance: 0,
    paymentPending: 0,
    billingCostDifference: 0,
    profitability: 0
  });

  totals.financialProgress = percentage(totals.invoiced, totals.contractValue);
  const recorded = rows.filter((row) => row.executionProgress !== null && Number.isFinite(row.executionProgress));
  totals.executionProgress = recorded.length
    ? recorded.reduce((sum, row) => sum + row.executionProgress, 0) / recorded.length : null;
  totals.profitabilityPercentage = percentage(totals.profitability, totals.contractValue);
  totals.collectionRate = percentage(totals.paid, totals.invoiced);
  totals.costRate = percentage(totals.costsExpenses, totals.contractValue);

  return Object.freeze({
    totals: Object.freeze({ ...totals }),
    rows: Object.freeze(rows)
  });
}
