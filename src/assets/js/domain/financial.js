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

export function expectedMonthlyValue(contractValue, monthlyAdvancePercent) {
  if (!Number.isFinite(monthlyAdvancePercent) || monthlyAdvancePercent < 0 || monthlyAdvancePercent > 100) {
    throw new RangeError("El avance mensual debe estar entre 0 y 100.");
  }
  return contractValue * (monthlyAdvancePercent / 100);
}

export function formatCop(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value);
}


