// El Excel registra importes por mes, pero no fechas de emisión ni cobros.
// Una fecha filtra los meses que se cruzan con el rango indicado, sin inventar
// una fecha de factura para cada movimiento histórico.
export function importedBillingRows(monthlyRows, filters = {}) {
  return monthlyRows.filter((row) => {
    if (!row.importedBilledValue) return false;
    if (filters.projectId && filters.projectId !== row.projectId) return false;
    if (filters.periodId && filters.periodId !== row.periodId) return false;
    const first = `${row.year}-${String(row.month).padStart(2, "0")}-01`;
    const last = `${row.year}-${String(row.month).padStart(2, "0")}-${new Date(Date.UTC(row.year, row.month, 0)).getUTCDate()}`;
    return (!filters.dateFrom || last >= filters.dateFrom)
      && (!filters.dateTo || first <= filters.dateTo);
  }).sort((a, b) => b.year - a.year || b.month - a.month ||
    String(a.costCenter).localeCompare(String(b.costCenter), "es", { numeric: true }));
}

export function recognizedInvoices(invoices, projects) {
  const cutoffs = new Map(projects.map((project) => [project.id, project.importedAsOf]));
  return invoices.filter((invoice) => invoice.status !== "anulada"
    && (!cutoffs.get(invoice.projectId) || invoice.issueDate > cutoffs.get(invoice.projectId)));
}
