import { calculateDashboardIndicators } from "./dashboard.js?v=1.5.9";
import { assertDate, assertMoney, assertText, projectInputToRecord, PROJECT_STATUSES } from "../data/models.js?v=1.5.0";

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

export function isCreateProjectRequest(query) {
  const question = words(query);
  return /\b(crear|crea|agregar|agrega|registrar|registra|nuevo|nueva)\b/.test(question)
    && /\b(proyecto|centro de costo)\b/.test(question);
}

export function resolveAssistantQuickQuestion(query) {
  const question = words(query);
  if (/^(que (puedes|sabes) hacer( por mi)?|en que (me )?puedes ayudar|como (me )?puedes ayudar|cuales son tus funciones|ayuda|opciones)$/.test(question)) {
    return { kind: "capabilities" };
  }
  if (/^(quien (es|fue) (tu|el) (creador|desarrollador)|quien te (creo|hizo|programo|desarrollo)|quien creo (este|el) asistente)$/.test(question)) {
    return { kind: "creator" };
  }
  return null;
}

export function detectAssistantIntents(query) {
  const question = words(query);
  if (/\b(resumen|general|completo|todo|como va|situacion)\b/.test(question)) return ["full"];
  if (/\b(cuantos proyectos|numero de proyectos|cantidad de proyectos)\b/.test(question)) return ["projectCount"];
  if (/\b(ultimo|ultima|reciente)\b/.test(question)) {
    if (/\b(pago|pagos|recaudo|cobro)\b/.test(question)) return ["latestPayment"];
    if (/\b(factura|facturas|facturacion)\b/.test(question)) return ["latestInvoice"];
    if (/\b(costo|costos|gasto|gastos)\b/.test(question)) return ["latestCost"];
  }
  const intents = [];
  const add = (name, pattern) => { if (pattern.test(question)) intents.push(name); };
  add("executedEquivalent", /\b(equivalente|ejecutado en pesos|ejecucion en pesos|avanzado monetariamente|valor ejecutado)\b/);
  add("execution", /\b(avance de ejecucion|avance fisico|avance del proyecto|progreso fisico|porcentaje ejecutado|porcentaje de ejecucion|ejecucion del proyecto|cuanto se ha ejecutado)\b/);
  add("billing", /\b(facturad[oa]|facturacion|facturas|facturo|facturar)\b/);
  add("collection", /\b(recaud[oa]|recaudo financiero|avance financiero|cobrad[oa]|pagad[oa]|pagos|recogid[oa]|recogio)\b/);
  add("receivable", /\b(cartera|por cobrar|pendiente de pago|deben|adeudan)\b/);
  add("balance", /\b(saldo contractual|sin facturar|resta del contrato)\b/);
  add("costs", /\b(costos|gastos|gastado)\b/);
  add("profitability", /\b(rentabilidad|utilidad)\b/);
  add("contract", /\b(contrato|contractual|contratado)\b/);
  add("status", /\b(estado|estatus|situacion actual)\b/);
  add("activity", /\b(ultim[oa]|movimientos|actividad|historial)\b/);
  return intents.length ? [...new Set(intents)] : ["full"];
}

export function resolveAssistantQuestion(query, projects = []) {
  const question = words(query);
  if (!question) return { kind: "help" };
  const quick = resolveAssistantQuickQuestion(query);
  if (quick) return quick;
  const intents = detectAssistantIntents(query);
  const matches = projects.map((project) => ({ project, score: scoreProject(question, project) }))
    .filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (matches.length) {
    const best = matches[0].score;
    const choices = matches.filter((item) => item.score === best).map((item) => item.project);
    return choices.length === 1 ? { kind: "project", project: choices[0], intents } : { kind: "choose", projects: choices.slice(0, 8), intents };
  }
  if (/\b(resumen|general|global|total|totales|todos|cuantos)\b/.test(question)) return { kind: "overview", intents };
  return { kind: "help" };
}

export const PROJECT_DRAFT_FIELDS = Object.freeze([
  { key: "costCenter", label: "Centro de costo", prompt: "Escribe el centro de costo (por ejemplo, CC-205).", required: true },
  { key: "name", label: "Nombre del proyecto", prompt: "¿Cómo se llama el proyecto?", required: true },
  { key: "municipality", label: "Municipio", prompt: "¿En qué municipio se realiza?", required: true },
  { key: "serviceType", label: "Tipo de servicio", prompt: "¿Qué tipo de servicio es? (por ejemplo, construcción EPC).", required: true },
  { key: "clientName", label: "Cliente", prompt: "¿Quién es el cliente? Puedes escribir «omitir».", required: false },
  { key: "parentProjectId", label: "Centro principal", prompt: "Si es un centro asociado, escribe el código del centro principal. Si es independiente, «omitir».", required: false },
  { key: "powerKwp", label: "Potencia (kWp)", prompt: "¿Cuál es su potencia en kWp? Escribe un número o «omitir».", required: false },
  { key: "status", label: "Estado", prompt: "¿Estado inicial? planeado, activo, suspendido, finalizado o cancelado. «Omitir» deja planeado.", required: false },
  { key: "startDate", label: "Fecha de inicio", prompt: "Fecha de inicio en AAAA-MM-DD, o «omitir».", required: false },
  { key: "endDate", label: "Fecha de finalización", prompt: "Fecha de finalización en AAAA-MM-DD, o «omitir».", required: false },
  { key: "notes", label: "Notas", prompt: "Notas adicionales, o «omitir».", required: false }
]);

export function parseProjectDraftField(key, rawValue, projects = []) {
  const field = PROJECT_DRAFT_FIELDS.find((item) => item.key === key);
  if (!field) throw new Error("Ese campo no pertenece al proyecto.");
  const value = String(rawValue ?? "").trim();
  if (!value || /^omitir$/i.test(value)) {
    if (field.required) throw new Error(`Necesito el campo «${field.label}» para crear el proyecto.`);
    return key === "status" ? "planeado" : null;
  }
  if (key === "costCenter") {
    const center = assertText(value, "centro de costo", { min: 2, max: 50 });
    if (projects.some((item) => words(item.costCenter) === words(center))) throw new Error("Ya existe un proyecto con ese centro de costo.");
    return center;
  }
  if (key === "name") return assertText(value, "nombre", { min: 3, max: 180 });
  if (key === "municipality") return assertText(value, "municipio", { min: 2, max: 120 });
  if (key === "serviceType") return assertText(value, "tipo de servicio", { min: 2, max: 120 });
  if (key === "clientName") return assertText(value, "cliente", { min: 2, max: 180 });
  if (key === "notes") return assertText(value, "notas", { min: 1, max: 500 });
  if (key === "status") {
    const normalized = words(value);
    if (!PROJECT_STATUSES.includes(normalized)) throw new Error(`El estado debe ser: ${PROJECT_STATUSES.join(", ")}.`);
    return normalized;
  }
  if (key === "startDate" || key === "endDate") return assertDate(value, field.label.toLowerCase());
  if (key === "powerKwp") {
    const number = value.replace(/\s/g, "").replace(",", ".");
    return assertMoney(number, "potencia");
  }
  if (key === "parentProjectId") {
    const parent = projects.find((item) => words(item.costCenter) === words(value));
    if (!parent) throw new Error("No encontré ese centro principal. Escribe su código exacto u «omitir».");
    return parent.projectId;
  }
  return value;
}

export function prepareProjectDraft(values, projects = []) {
  const input = {};
  for (const field of PROJECT_DRAFT_FIELDS) {
    const value = values[field.key];
    if (field.key === "parentProjectId") {
      if (value && !projects.some((project) => project.projectId === value)) throw new Error("El centro principal ya no existe. Corrige el borrador.");
      input[field.key] = value || null;
    } else {
      input[field.key] = parseProjectDraftField(field.key, value ?? "", projects);
    }
  }
  if (input.parentProjectId && words(projects.find((item) => item.projectId === input.parentProjectId)?.costCenter) === words(input.costCenter)) {
    throw new Error("Un proyecto no puede ser su propio centro principal.");
  }
  projectInputToRecord(input, null);
  return input;
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
