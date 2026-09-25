export function canEditExecution(profile) {
  return profile?.role === "administrador" && profile.active === true;
}

export function normalizeProgressPercent(value, field = "avance ejecutado") {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new RangeError(`${field} debe estar entre 0 y 100.`);
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function incrementalExecutionPercent(cumulativePercent, previousCumulativePercent = 0) {
  const current = normalizeProgressPercent(cumulativePercent, "avance de ejecución");
  const previous = normalizeProgressPercent(previousCumulativePercent, "avance de ejecución anterior");
  if (current < previous) {
    throw new RangeError("El avance de ejecución no puede disminuir frente al periodo anterior.");
  }
  return Math.round((current - previous + Number.EPSILON) * 100) / 100;
}

export function profitabilityValue(contractValue, costsExpenses) {
  const contract = Number(contractValue ?? 0);
  const costs = Number(costsExpenses ?? 0);
  if (!Number.isFinite(contract) || !Number.isFinite(costs)) return 0;
  return Math.round((contract - costs + Number.EPSILON) * 100) / 100;
}

export function profitabilityPercent(contractValue, costsExpenses) {
  const contract = Number(contractValue ?? 0);
  if (!Number.isFinite(contract) || contract <= 0) return 0;
  return (profitabilityValue(contract, costsExpenses) / contract) * 100;
}
