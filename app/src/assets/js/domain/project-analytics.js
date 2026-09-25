function amount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function validPeriodKey(row) {
  const year = Number(row?.year);
  const month = Number(row?.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return year * 100 + month;
}

export function calculateProjectIndicators(project = {}, monthlyRows = []) {
  const contractValue = amount(project.contractValue);
  const invoiced = amount(project.totalInvoiced);
  const paid = amount(project.totalPaid);
  const costsExpenses = amount(project.totalCostsExpenses);
  const activePeriods = new Set();
  let pendingValidations = 0;

  for (const row of monthlyRows) {
    const hasMovement = [
      row.invoicedValue, row.paidValue, row.costsExpensesValue
    ].some((value) => amount(value) > 0) || row.executedCumulativePercentage !== null && row.executedCumulativePercentage !== undefined;
    const key = validPeriodKey(row);
    if (hasMovement && key !== null) activePeriods.add(key);

    const status = String(row.validationStatus ?? "").toLocaleLowerCase("es").trim();
    if (status && status !== "validado") pendingValidations += 1;
  }

  return Object.freeze({
    paymentCompliance: invoiced > 0 ? (paid / invoiced) * 100 : 0,
    costExecution: contractValue > 0 ? (costsExpenses / contractValue) * 100 : 0,
    activeMonths: activePeriods.size,
    pendingValidations
  });
}
