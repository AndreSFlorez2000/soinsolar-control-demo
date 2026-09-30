export function invoicePendingAmount(invoice, payments = []) {
  const paid = payments
    .filter((payment) => payment.invoiceId === invoice.id && payment.status !== "anulado")
    .reduce((total, payment) => total + Number(payment.amount), 0);
  return Math.max(Number(invoice.amount) - paid, 0);
}

export function payableInvoicesForProject(invoices = [], payments = [], projectId = "") {
  if (!projectId) return [];
  return invoices.filter((invoice) =>
    invoice.projectId === projectId &&
    invoice.status !== "anulada" &&
    invoicePendingAmount(invoice, payments) > 0
  );
}

export function isSampleProject(project) {
  return project?.costCenter === "PRUEBA-SOLAR-001";
}
