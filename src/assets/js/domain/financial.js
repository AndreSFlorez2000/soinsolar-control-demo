export function safePercent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

export function financialAdvance(invoiced, contractValue) {
  return safePercent(invoiced, contractValue);
}

export function contractualBalance(contractValue, invoiced) {
  return Math.max(0, contractValue - invoiced);
}

export function paymentPending(invoiced, paid) {
  return Math.max(0, invoiced - paid);
}

export function formatCop(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}
