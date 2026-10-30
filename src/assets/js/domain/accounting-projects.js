// El auxiliar conserva el código exactamente como llegó. Esta clave se usa
// solo para encontrar la ficha del proyecto, incluso si el Excel omite ceros.
export function centerKey(value) {
  const code = String(value ?? "").trim().toUpperCase().replace(/^CC\s*[-:#]\s*(?=\d)/, "");
  if (!code) return "";
  return /^\d+$/.test(code) ? String(BigInt(code)) : code;
}

export function projectAccountingCenters(centers = [], classes = [], projects = [], manual = []) {
  const byKey = new Map();
  const projectsByKey = new Map();
  for (const project of projects) {
    const key = centerKey(project.costCenter);
    if (!key) continue;
    const matches = projectsByKey.get(key) ?? [];
    matches.push(project);
    projectsByKey.set(key, matches);
  }
  function ensure(code) {
    const key = centerKey(code);
    if (!byKey.has(key)) byKey.set(key, {
      key, codes: [], sourceRows: 0, classifiedLines: 0,
      expenses: 0, salesCosts: 0, productionCosts: 0,
      manualCosts: 0, manualExpenses: 0, manualLines: 0
    });
    const row = byKey.get(key);
    if (!row.codes.includes(code)) row.codes.push(code);
    return row;
  }
  for (const center of centers) ensure(center.cost_center).sourceRows += Number(center.row_count ?? 0);
  for (const item of classes) {
    const row = ensure(item.cost_center);
    row.classifiedLines += Number(item.cost_expense_lines ?? 0);
    row.expenses += Number(item.expenses ?? 0);
    row.salesCosts += Number(item.sales_costs ?? 0);
    row.productionCosts += Number(item.production_costs ?? 0);
  }
  for (const project of projects) ensure(project.costCenter);
  for (const item of manual) {
    const code = item.project?.costCenter;
    if (!code) continue;
    const row = ensure(code);
    row.manualLines++;
    if (item.type === "gasto") row.manualExpenses += Number(item.amount ?? 0);
    else if (item.type === "costo") row.manualCosts += Number(item.amount ?? 0);
  }
  return [...byKey.values()].map((row) => {
    const matches = projectsByKey.get(row.key) ?? [];
    return {
      ...row,
      costCenter: row.codes.find((code) => centers.some((item) => item.cost_center === code)) ?? row.codes[0],
      project: matches.length === 1 ? matches[0] : null,
      ambiguous: matches.length > 1
    };
  }).sort((a, b) => a.costCenter.localeCompare(b.costCenter, "es", { numeric: true }));
}

export function scopeAccountingCenters(rows = [], code = "") {
  return code ? rows.filter((row) => row.costCenter === code) : rows;
}

export function accountingCenterForProject(rows = [], project = null) {
  if (!project) return "";
  const key = centerKey(project.costCenter);
  return rows.find((row) => row.key === key)?.costCenter ?? "";
}
