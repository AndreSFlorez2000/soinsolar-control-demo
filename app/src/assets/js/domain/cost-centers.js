function amount(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

// Cada movimiento pertenece a un solo proyecto. El centro principal suma los
// movimientos de sus descendientes, pero cuenta su propio contrato una vez.
export function consolidateCostCenters(projects = []) {
  const byId = new Map(projects.map((project) => [project.projectId, project]));
  const children = new Map();
  for (const project of projects) {
    if (!byId.has(project.parentProjectId)) continue;
    const siblings = children.get(project.parentProjectId) ?? [];
    siblings.push(project.projectId);
    children.set(project.parentProjectId, siblings);
  }

  const cache = new Map();
  function rollup(id, path = new Set()) {
    if (cache.has(id)) return cache.get(id);
    if (path.has(id)) throw new Error("La estructura de centros de costo contiene un ciclo.");
    const project = byId.get(id);
    const nextPath = new Set(path).add(id);
    const descendants = (children.get(id) ?? []).map((childId) => rollup(childId, nextPath));
    const contractValue = amount(project.contractValue) || descendants.reduce((sum, row) => sum + row.contractValue, 0);
    const invoiced = amount(project.totalInvoiced) + descendants.reduce((sum, row) => sum + row.totalInvoiced, 0);
    const paid = amount(project.totalPaid) + descendants.reduce((sum, row) => sum + row.totalPaid, 0);
    const costs = amount(project.totalCostsExpenses) + descendants.reduce((sum, row) => sum + row.totalCostsExpenses, 0);
    // Si el centro tiene contrato propio, su porcentaje manual ya cubre ese
    // contrato. Sumar la ejecución de los hijos duplicaría el avance.
    const executed = amount(project.contractValue) > 0
      ? project.executedValue ?? null
      : descendants.some((row) => row.contractValue > 0 && row.executedValue === null)
        ? null
        : descendants.length
          ? descendants.reduce((sum, row) => sum + amount(row.executedValue), 0)
          : null;
    const result = Object.freeze({
      ...project,
      contractValue,
      totalInvoiced: invoiced,
      totalPaid: paid,
      totalCostsExpenses: costs,
      executedValue: executed,
      executedProgressPercentage: contractValue > 0 && executed !== null
        ? executed / contractValue * 100 : null,
      financialProgressPercentage: contractValue > 0 ? invoiced / contractValue * 100 : 0,
      contractualBalance: Math.max(contractValue - invoiced, 0),
      paymentPending: Math.max(invoiced - paid, 0),
      profitability: contractValue - costs,
      profitabilityPercentage: contractValue > 0 ? (contractValue - costs) / contractValue * 100 : 0
    });
    cache.set(id, result);
    return result;
  }

  return projects.map((project) => rollup(project.projectId));
}

export function topLevelFinancialRows(projects = []) {
  const ids = new Set(projects.map((project) => project.projectId).filter(Boolean));
  return projects.filter((project) => !project.parentProjectId || !ids.has(project.parentProjectId));
}
