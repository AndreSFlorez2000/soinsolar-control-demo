import { centerKey } from "./accounting-projects.js?v=1.16.1";

const textKey = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]/g, "");
const money = (value) => Math.round(Number(value ?? 0) * 100) / 100;
const comparable = (row) => [centerKey(row.costCenter), row.movementDate, row.type,
  Math.round(row.amount * 100)].join("|");

export function unifyCostMovements(accountingEntries = [], manualEntries = [], projects = []) {
  const byCenter = new Map();
  for (const project of projects) {
    const key = centerKey(project.costCenter);
    if (key && !byCenter.has(key)) byCenter.set(key, project);
  }
  const imported = accountingEntries.filter((entry) => /^[567]/.test(String(entry.account_code ?? "")))
    .map((entry) => {
      const project = byCenter.get(centerKey(entry.cost_center)) ?? null;
      return {
        id: `${entry.import_id}:${entry.row_number}`, source: "accounting", importId: entry.import_id,
        rowNumber: entry.row_number, costCenter: String(entry.cost_center ?? ""),
        projectName: project?.projectName ?? "", movementDate: entry.movement_date,
        type: String(entry.account_code).startsWith("5") ? "gasto" : "costo",
        category: entry.account_name, accountCode: entry.account_code,
        description: entry.detail, supplierName: entry.third_party_name || entry.third_party_id || "",
        supplierId: entry.third_party_id || "",
        documentReference: entry.document_number, amount: money(Number(entry.debit) - Number(entry.credit)),
        supportPath: null, verification: "", manualMatch: null
      };
    });
  const written = manualEntries.map((entry) => ({
    id: entry.id, source: "manual", costCenter: entry.project?.costCenter ?? "",
    projectName: entry.project?.name ?? "", movementDate: entry.movementDate,
    type: entry.type, category: entry.category, accountCode: "",
    description: entry.description, supplierName: entry.supplierName ?? "", supplierId: "",
    documentReference: entry.documentReference ?? "", amount: money(entry.amount),
    supportPath: entry.supportPath ?? null, verification: ""
  }));

  const candidates = new Map();
  for (const entry of imported) {
    const key = comparable(entry);
    candidates.set(key, [...(candidates.get(key) ?? []), entry]);
  }
  const manualReferences = new Map();
  for (const entry of written) {
    const ref = textKey(entry.documentReference);
    if (!ref) continue;
    const key = `${comparable(entry)}|${ref}`;
    manualReferences.set(key, (manualReferences.get(key) ?? 0) + 1);
  }
  const unmatchedManual = [], possible = [], matchedIds = new Set();
  let matchedCount = 0;
  for (let i = 0; i < written.length; i++) {
    const entry = written[i];
    const same = candidates.get(comparable(entry)) ?? [];
    const ref = textKey(entry.documentReference);
    const exact = ref ? same.filter((candidate) => textKey(candidate.documentReference) === ref
      && textKey(candidate.supplierName) && textKey(entry.supplierName)
      && textKey(candidate.supplierName) === textKey(entry.supplierName)) : [];
    if (exact.length === 1 && manualReferences.get(`${comparable(entry)}|${ref}`) === 1 && !exact[0].manualMatch) {
      exact[0].manualMatch = manualEntries[i].id;
      exact[0].supportPath = entry.supportPath;
      exact[0].verification = "Coincidencia comprobada";
      matchedIds.add(entry.id);
      matchedCount++;
    } else {
      if (same.length) { entry.verification = "Posible coincidencia · revisar"; possible.push(entry); }
      unmatchedManual.push(manualEntries[i]);
    }
  }
  const rows = [...imported, ...written.filter((entry) => !matchedIds.has(entry.id))]
    .sort((a, b) => String(b.movementDate).localeCompare(String(a.movementDate)) || a.id.localeCompare(b.id));
  return { rows, unmatchedManual, matchedCount, possibleCount: possible.length,
    accountingCount: imported.length, manualCount: manualEntries.length };
}

export function filterUnifiedCosts(rows, filters = {}) {
  const code = centerKey(filters.costCenter);
  const term = String(filters.search ?? "").trim().toLocaleLowerCase("es");
  const supplier = String(filters.party ?? "").trim().toLocaleLowerCase("es");
  const category = String(filters.category ?? "").trim().toLocaleLowerCase("es");
  return rows.filter((row) => {
    if (code && centerKey(row.costCenter) !== code) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (filters.month && !String(row.movementDate).startsWith(filters.month)) return false;
    if (filters.dateFrom && row.movementDate < filters.dateFrom) return false;
    if (filters.dateTo && row.movementDate > filters.dateTo) return false;
    if (filters.account && !String(row.accountCode).startsWith(filters.account)) return false;
    if (supplier && ![row.supplierName, row.supplierId].some((value) => String(value ?? "").toLocaleLowerCase("es").includes(supplier))) return false;
    if (category && !String(row.category).toLocaleLowerCase("es").includes(category)) return false;
    if (term && ![row.description, row.documentReference, row.supplierName, row.supplierId, row.category,
      row.accountCode, row.costCenter, row.projectName].some((value) => String(value ?? "").toLocaleLowerCase("es").includes(term))) return false;
    return true;
  });
}
