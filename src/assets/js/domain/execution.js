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

// A monthly entry adds to that month's work. Corrections set an absolute total
// and carry the difference into every later recorded month.
export function planExecutionChange(rows, { year, month, value, mode = "add" }) {
  const selected = [...rows]
    .filter((row) => row.executedCumulativePercentage !== null && row.executedCumulativePercentage !== undefined)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  const position = (row) => row.year * 12 + row.month;
  const target = Number(year) * 12 + Number(month);
  if (!Number.isInteger(target) || !Number.isInteger(Number(month)) || Number(month) < 1 || Number(month) > 12) {
    throw new RangeError("Selecciona un periodo válido.");
  }
  const previous = selected.filter((row) => position(row) < target).at(-1)?.executedCumulativePercentage ?? 0;
  const current = selected.find((row) => position(row) === target)?.executedCumulativePercentage ?? previous;
  const latest = selected.at(-1)?.executedCumulativePercentage ?? 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8 || amount < 0 || amount > 100) {
    throw new RangeError("El avance debe estar entre 0 y 100, con hasta dos decimales.");
  }
  if (mode !== "add" && mode !== "set") throw new RangeError("Operación de avance no válida.");
  if (mode === "add" && amount <= 0) throw new RangeError("Digita un avance mensual mayor que cero para sumar.");
  const next = mode === "add" ? Math.round((Number(current) + amount) * 100) / 100 : amount;
  const delta = Math.round((next - Number(current)) * 100) / 100;
  const projectTotal = Math.round((Number(latest) + delta) * 100) / 100;
  if (next < Number(previous)) throw new RangeError(`El avance general no puede ser menor al periodo anterior (${previous}%).`);
  if (projectTotal > 100 || next > 100) throw new RangeError("La ejecución total del proyecto no puede superar el 100%.");
  if (delta && selected.some((row) => position(row) > target && row.periodStatus === "cerrado")) {
    throw new RangeError("Reabre los periodos posteriores para ajustar su avance acumulado.");
  }
  return { previous: Number(previous), current: Number(current), next, delta,
    monthlyTotal: Math.round((next - Number(previous)) * 100) / 100, projectTotal };
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
