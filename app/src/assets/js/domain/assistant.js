import { calculateDashboardIndicators } from "./dashboard.js?v=1.5.9";

function words(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

const commonWords = new Set([
  "avance", "centro", "costo", "contrato", "cuanto", "cuantos", "ejecucion",
  "estado", "facturado", "financiero", "gastos", "general", "monetariamente",
  "pagado", "pago", "proyecto", "proyectos", "recaudo", "resumen", "solar",
  "tiene", "valor", "como", "cual", "esta", "estan", "para", "de", "del",
  "el", "en", "la", "las", "los", "por", "que", "son", "un", "una", "y"
]);

function scoreProject(question, project) {
  const name = words(project.projectName);
  const client = words(project.clientName);
  const costCenter = words(project.costCenter);
  if (costCenter && new RegExp(`(^| )${costCenter.replaceAll(" ", "[ -]*")}( |$)`).test(question)) return 120;
  if (costCenter && costCenter.startsWith("cc ") && new RegExp(`(^| )${costCenter.replaceAll(" ", "")}( |$)`).test(question)) return 120;
  if (name.length > 3 && question.includes(name)) return 100;
  if (client.length > 3 && question.includes(client)) return 90;
  const tokens = new Set(question.split(" "));
  const meaningful = name.split(" ").filter((word) => word.length >= 3 && !commonWords.has(word));
  const matches = meaningful.filter((word) => tokens.has(word)).length;
  return matches ? 10 + matches * 5 : 0;
}

export function resolveAssistantQuestion(query, projects = []) {
  const question = words(query);
  if (!question) return { kind: "help" };
  const matches = projects.map((project) => ({ project, score: scoreProject(question, project) }))
    .filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (matches.length) {
    const best = matches[0].score;
    const choices = matches.filter((item) => item.score === best).map((item) => item.project);
    return choices.length === 1 ? { kind: "project", project: choices[0] } : { kind: "choose", projects: choices.slice(0, 8) };
  }
  if (/\b(resumen|general|global|totales|todos|cuantos)\b/.test(question)) return { kind: "overview" };
  return { kind: "help" };
}

export function descendantProjectIds(project, projects = []) {
  const ids = new Set([project.projectId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of projects) {
      if (ids.has(row.parentProjectId) && !ids.has(row.projectId)) {
        ids.add(row.projectId);
        changed = true;
      }
    }
  }
  return [...ids];
}

function latest(rows, field) {
  return [...rows].sort((a, b) => String(b[field] ?? "").localeCompare(String(a[field] ?? "")))[0] ?? null;
}

export function buildAssistantProjectAnswer(project, {
  contracts = [], monthly = [], invoices = [], payments = [], costs = [], scopeProjectCount = 1
} = {}) {
  const contract = contracts.find((item) => item.id === project.contractId) ?? contracts[0] ?? null;
  const validInvoices = invoices.filter((item) => item.status !== "anulada");
  const validPayments = payments.filter((item) => item.status !== "anulado");
  const tracked = monthly.filter((item) => item.trackingId && item.executedCumulativePercentage !== null);
  const lastTracking = [...tracked].sort((a, b) => b.year - a.year || b.month - a.month)[0] ?? null;
  const contractValue = Number(project.contractValue ?? 0);
  const execution = project.executedProgressPercentage;
  return {
    kind: "project",
    project,
    contract,
    scopeProjectCount,
    execution,
    executedEquivalent: execution === null || execution === undefined || contractValue <= 0
      ? null : contractValue * Number(execution) / 100,
    billingPercentage: contractValue > 0 ? Number(project.totalInvoiced ?? 0) / contractValue * 100 : null,
    collectionPercentage: contractValue > 0 ? Number(project.totalPaid ?? 0) / contractValue * 100 : null,
    collectedOnInvoices: Number(project.totalInvoiced ?? 0) > 0
      ? Number(project.totalPaid ?? 0) / Number(project.totalInvoiced) * 100 : null,
    lastTracking,
    invoiceCount: validInvoices.length,
    paymentCount: validPayments.length,
    costCount: costs.length,
    latestInvoice: latest(validInvoices, "issueDate"),
    latestPayment: latest(validPayments, "paymentDate"),
    latestCost: latest(costs, "movementDate")
  };
}

export function buildAssistantOverview(projects = []) {
  return { kind: "overview", indicators: calculateDashboardIndicators(projects) };
}
