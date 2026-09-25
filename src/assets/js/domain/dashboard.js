import { topLevelFinancialRows } from "./cost-centers.js?v=1.3.1";

function amount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function calculateDashboardIndicators(projects = []) {
  const indicators = {
    projectCount: 0,
    activeProjects: 0,
    contractValue: 0,
    invoiced: 0,
    paid: 0,
    costsExpenses: 0,
    contractualBalance: 0,
    paymentPending: 0,
    financialProgress: 0,
    executionProgress: 0,
    profitability: 0,
    profitabilityPercentage: 0,
    costRatio: 0,
    statusCounts: {
      planeado: 0,
      activo: 0,
      suspendido: 0,
      finalizado: 0,
      cancelado: 0
    }
  };

  for (const project of projects) {
    indicators.projectCount += 1;
    const status = String(project.status ?? "").toLocaleLowerCase("es");
    if (Object.hasOwn(indicators.statusCounts, status)) indicators.statusCounts[status] += 1;
    if (status === "activo") indicators.activeProjects += 1;
  }

  for (const project of topLevelFinancialRows(projects)) {
    indicators.contractValue += amount(project.contractValue);
    indicators.invoiced += amount(project.totalInvoiced);
    indicators.paid += amount(project.totalPaid);
    indicators.costsExpenses += amount(project.totalCostsExpenses);
    indicators.contractualBalance += amount(project.contractualBalance);
    indicators.paymentPending += amount(project.paymentPending);
  }

  indicators.financialProgress = indicators.contractValue > 0
    ? (indicators.invoiced / indicators.contractValue) * 100
    : 0;
  const recorded = projects
    .map((project) => project.executedProgressPercentage)
    .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)));
  indicators.executionProgress = recorded.length
    ? recorded.reduce((sum, value) => sum + Number(value), 0) / recorded.length : null;
  indicators.profitability = indicators.contractValue - indicators.costsExpenses;
  indicators.profitabilityPercentage = indicators.contractValue > 0
    ? (indicators.profitability / indicators.contractValue) * 100
    : 0;
  indicators.costRatio = indicators.contractValue > 0
    ? (indicators.costsExpenses / indicators.contractValue) * 100
    : 0;

  return Object.freeze({
    ...indicators,
    statusCounts: Object.freeze({ ...indicators.statusCounts })
  });
}

export function buildMonthlySeries(rows = [], limit = 6) {
  const grouped = new Map();

  for (const row of rows) {
    const year = Number(row.year);
    const month = Number(row.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    const key = year * 100 + month;
    const current = grouped.get(key) ?? {
      key, year, month, invoiced: 0, paid: 0, costsExpenses: 0
    };
    current.invoiced += amount(row.invoicedValue);
    current.paid += amount(row.paidValue);
    current.costsExpenses += amount(row.costsExpensesValue);
    grouped.set(key, current);
  }

  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 6;
  return Object.freeze(
    [...grouped.values()]
      .sort((left, right) => left.key - right.key)
      .slice(-safeLimit)
      .map((row) => Object.freeze({ ...row }))
  );
}
