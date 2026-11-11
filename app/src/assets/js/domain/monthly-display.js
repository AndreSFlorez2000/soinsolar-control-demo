// Los porcentajes 0 % rellenados en la plantilla no constituyen un movimiento.
// Un avance 0 % registrado o AK 0 % sí es un dato explícito y permanece visible.
export function hasMonthlyActivity(row) {
  return Boolean(row.trackingId
    || row.importedExecutionPercentage != null
    || row.executedCumulativePercentage != null
    || String(row.executionIssue ?? "").trim()
    || String(row.observations ?? "").trim()
    || [row.invoicedValue, row.importedBilledValue, row.paidValue, row.costsExpensesValue]
      .some((value) => Number(value) !== 0 && Number.isFinite(Number(value))));
}

export function monthlyDisplayRows(rows, { includeQuiet = false, selectedPeriod = false } = {}) {
  return includeQuiet || selectedPeriod ? [...rows] : rows.filter(hasMonthlyActivity);
}

export function monthlyDisplayCounts(rows) {
  const activity = rows.filter(hasMonthlyActivity).length;
  return { activity, quiet: rows.length - activity, total: rows.length };
}
