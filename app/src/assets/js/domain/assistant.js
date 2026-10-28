import { calculateDashboardIndicators } from "./dashboard.js?v=1.5.9";
import { topLevelFinancialRows } from "./cost-centers.js?v=1.3.1";
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
  if (costCenter && new RegExp(`(^| )${costCenter.replaceAll(" ", "[ -]*")}( |$)`).test(question)) return 120 + costCenter.length;
  if (costCenter && costCenter.startsWith("cc ") && new RegExp(`(^| )${costCenter.replaceAll(" ", "")}( |$)`).test(question)) return 120 + costCenter.length;
  if (name.length > 3 && question.includes(name)) return 100;
  if (client.length > 3 && question.includes(client)) return 90;
  const tokens = new Set(question.split(" "));
  const meaningful = name.split(" ").filter((word) => word.length >= 3 && !commonWords.has(word));
  const matches = meaningful.filter((word) => tokens.has(word)).length;
  return matches ? 10 + matches * 5 : 0;
}

export function isCreateProjectRequest(query) {
  const question = words(query);
  if (/\bcomo\b/.test(question)) return false;
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
  if (/\b(recuperar|recupero|restablecer|olvide|olvido)\b/.test(question) && /\b(contrasena|clave|acceso)\b/.test(question)) {
    return { kind: "guide", topic: "access" };
  }
  if (/\bcomo\b/.test(question) && /\b(creo|crear|registro|registrar)\b/.test(question) && /\b(proyecto|centro de costo)\b/.test(question)) {
    return { kind: "guide", topic: "create" };
  }
  if (/\b(como (funciona|se calcula|se registra|sumo|agrego|interpreto)|explica|explicame|que (es|significa)|diferencia|formula|formulas|porcentajes)\b/.test(question)
    && /\b(seguimiento|avance|ejecucion|recaudo|facturacion|porcentajes)\b/.test(question)) {
    return { kind: "guide", topic: "progress" };
  }
  return null;
}

const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthAliases = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function findAssistantPeriod(query, periods = []) {
  const question = words(query);
  const tokens = question.split(" ");
  const month = monthNames.findIndex((name, index) => tokens.includes(name) || tokens.includes(monthAliases[index])
    || (index === 8 && (tokens.includes("setiembre") || tokens.includes("set")))) + 1;
  if (!month) return null;
  const year = Number(tokens.find((token) => /^(20|21)\d{2}$/.test(token))) || null;
  const candidates = periods.filter((period) => Number(period.month) === month && (!year || Number(period.year) === year))
    .sort((a, b) => b.year - a.year);
  const selected = candidates[0] ?? null;
  const latestYear = Math.max(0, ...periods.map((period) => Number(period.year) || 0));
  return { month, year: year ?? selected?.year ?? (latestYear || null), periodId: selected?.id ?? null };
}

function portfolioRequest(question) {
  if (!/\b(proyectos|centros)\b/.test(question)) return null;
  if (/\b(sin avance|sin ejecucion|sin seguimiento)\b/.test(question)) return "withoutExecution";
  if (/\b(sin contrato)\b/.test(question)) return "withoutContract";
  if (/\b(cartera|por cobrar|pendientes de pago)\b/.test(question)) return "receivable";
  const status = ["activos", "finalizados", "suspendidos", "planeados", "cancelados"].find((item) => question.includes(item));
  if (status) return `status:${status.slice(0, -1)}`;
  return /\b(que proyectos hay|lista de proyectos|muestra los proyectos)\b/.test(question) ? "all" : null;
}

// Only business fields exposed by the application are searchable. This keeps a
// question from turning into arbitrary SQL or an accidental privileged read.
export function detectAssistantDataRequest(query) {
  const question = words(query);
  if (/\b(usuarios|cuentas|perfiles)\b/.test(question)) return { entity: "profiles" };
  if (/\b(auditoria|historial de cambios|cambios realizados|quien (creo|modifico|registro))\b/.test(question)) return { entity: "audit" };
  if (/\b(periodos|meses abiertos|meses cerrados|estado del periodo|periodo abierto|periodo cerrado)\b/.test(question)) return { entity: "periods" };
  if (/\b(factura|facturas)\b/.test(question) &&
    /\b(que|cuales|lista|listar|muestra|dame|ver|detalle|detalles|numero|numeros|fecha|fechas|estado|estados|cuanto|cuantas|valor|ultima|primera|anuladas|emitidas|registradas|soporte)\b/.test(question)) return { entity: "invoices" };
  if (/\b(pago|pagos|abono|abonos)\b/.test(question) &&
    /\b(que|cuales|lista|listar|muestra|dame|ver|detalle|detalles|referencia|referencias|fecha|fechas|estado|estados|cuantos|ultimo|anulados|factura|soporte)\b/.test(question)) return { entity: "payments" };
  if (/\b(costo|costos|gasto|gastos|movimientos)\b/.test(question) &&
    /\b(que|cuales|lista|listar|muestra|dame|ver|detalle|detalles|proveedor|proveedores|categoria|categorias|descripcion|fecha|fechas|cuantos|ultimo|referencia|soporte)\b/.test(question)) return { entity: "costs" };
  if (/\b(observaciones|novedad|novedades|incidencia|incidencias|validacion|validado|rechazado|seguimientos|mes a mes)\b/.test(question)) return { entity: "tracking" };
  if (/\b(contrato|contractual|adiciones|deducciones)\b/.test(question) &&
    /\b(numero|numeros|inicial|adiciones|deducciones|estado|fecha|inicio|fin|termina|vence|vigencia|detalles|historial)\b/.test(question)) return { entity: "contracts" };
  const fields = [
    ["clientName", /\b(cliente|contratante)\b/],
    ["municipality", /\b(municipio|ciudad|ubicacion|donde)\b/],
    ["serviceType", /\b(tipo de servicio|servicio|modalidad)\b/],
    ["powerKwp", /\b(potencia|kwp|kilovatios)\b/],
    ["startDate", /\b(fecha de inicio|cuando (inicio|empezo)|inicio del proyecto)\b/],
    ["endDate", /\b(fecha de fin|fecha de finalizacion|cuando termina|fin del proyecto)\b/],
    ["notes", /\b(notas|anotaciones|comentarios del proyecto)\b/],
    ["parentProjectId", /\b(centro principal|centro asociado|centro padre|proyecto principal)\b/]
  ];
  const selected = fields.filter(([, pattern]) => pattern.test(question)).map(([field]) => field);
  return selected.length ? { entity: "projectField", field: selected[0], fields: selected } : null;
}

export function findAssistantProjectFilter(query, projects = []) {
  const question = words(query);
  if (!/\b(proyectos|centros)\b/.test(question)) return null;
  // Match complete values from the records; never interpret a partial word as a filter.
  const keys = ["municipality", "clientName", "serviceType"];
  for (const key of keys) {
    const value = projects.map((item) => item[key]).filter(Boolean).find((item) =>
      words(item).length >= 3 && (` ${question} `).includes(` ${words(item)} `));
    if (value) return { key, value };
  }
  return null;
}

export function detectAssistantIntents(query) {
  const question = words(query);
  if (/\b(resumen|completo|todo|como va|situacion)\b/.test(question)) return ["full"];
  if (/\b(cuantos proyectos|numero de proyectos|cantidad de proyectos)\b/.test(question)) return ["projectCount"];
  if (/\b(ultimo|ultima|reciente)\b/.test(question)) {
    if (/\b(pago|pagos|recaudo|cobro)\b/.test(question)) return ["latestPayment"];
    if (/\b(factura|facturas|facturacion)\b/.test(question)) return ["latestInvoice"];
    if (/\b(costo|costos|gasto|gastos)\b/.test(question)) return ["latestCost"];
  }
  const intents = [];
  const add = (name, pattern) => { if (pattern.test(question)) intents.push(name); };
  add("remainingExecution", /\b(cuanto falta (para terminar|por ejecutar|de ejecucion)|resta por ejecutar|ejecucion pendiente)\b/);
  add("executedEquivalent", /\b(equivalente|ejecutado en pesos|ejecucion en pesos|avanzado monetariamente|valor ejecutado)\b/);
  add("execution", /\b(avance de ejecucion|avance fisico|avance del proyecto|progreso fisico|porcentaje ejecutado|porcentaje de ejecucion|ejecucion del proyecto|cuanto se ha ejecutado)\b/);
  add("billing", /\b(facturad[oa]|facturacion|facturas|facturo|facturar)\b/);
  add("collection", /\b(recaud[oa]|recaudad[oa]s?|recaudo financiero|avance financiero|cobrad[oa]|pagad[oa]|pagos|recogid[oa]|recogio)\b/);
  add("receivable", /\b(cartera|por cobrar|pendiente de pago|deben|adeudan)\b/);
  add("balance", /\b(saldo contractual|sin facturar|resta del contrato)\b/);
  add("costs", /\b(costos|gastos|gastado)\b/);
  add("profitability", /\b(rentabilidad|utilidad)\b/);
  add("contract", /\b(contrato|contractual|contratado)\b/);
  add("status", /\b(estado|estatus|situacion actual)\b/);
  add("activity", /\b(ultim[oa]|movimientos|actividad|historial)\b/);
  return intents.length ? [...new Set(intents)] : ["full"];
}

export function resolveAssistantQuestion(query, projects = [], { projectId = null, periods = [] } = {}) {
  const question = words(query);
  if (!question) return { kind: "help" };
  const quick = resolveAssistantQuickQuestion(query);
  if (quick) return quick;
  const intents = detectAssistantIntents(query);
  const explicitCenter = projects.find((project) => {
    const center = words(project.costCenter);
    return center && ((` ${question} `).includes(` ${center} `)
      || (center.startsWith("cc ") && (` ${question} `).includes(` ${center.replaceAll(" ", "")} `)));
  });
  const explicitTarget = Boolean(explicitCenter || projects.some((project) => {
    const name = words(project.projectName);
    return name.length > 3 && (` ${question} `).includes(` ${name} `);
  }));
  if (/\bcc\s*\d+\b/.test(question) && !explicitCenter) return { kind: "help" };
  const portfolio = portfolioRequest(question);
  if (portfolio && portfolio !== "all" && !explicitTarget) return { kind: "portfolio", filter: portfolio };
  const projectFilter = explicitTarget ? null : findAssistantProjectFilter(query, projects);
  if (projectFilter) return { kind: "projectList", filter: projectFilter };
  if (portfolio && !explicitTarget) return { kind: "portfolio", filter: portfolio };
  const period = findAssistantPeriod(query, periods);
  const dataRequest = detectAssistantDataRequest(query);
  const unsupportedQuestion = !dataRequest && intents.length === 1 && intents[0] === "full" &&
    /\b(que|cual|cuanto|donde|quien|cuando|como|por que)\b/.test(question) &&
    !/\b(resumen|general|completo|todo|como va|situacion|que paso)\b/.test(question);
  const matches = projects.map((project) => ({ project, score: scoreProject(question, project) }))
    .filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
  if (matches.length) {
    const best = matches[0].score;
    const choices = matches.filter((item) => item.score === best).map((item) => item.project);
    return choices.length === 1
      ? unsupportedQuestion ? { kind: "unsupported", project: choices[0] }
        : dataRequest ? { kind: "data", project: choices[0], period, request: dataRequest, question: query }
        : { kind: period ? "period" : "project", project: choices[0], period, intents }
      : { kind: "choose", projects: choices.slice(0, 8), intents };
  }
  const unknownCenter = /\bcc\s*\d+\b/.test(question) ||
    (!/\b(factura|facturas|pago|pagos|contrato|referencia)\b/.test(question) && question.split(" ")
      .some((token) => /^\d{3,4}$/.test(token) && !/^(20|21)\d{2}$/.test(token)));
  if (unknownCenter) return { kind: "help" };
  const explicitGlobal = /\b(general|global|todos los proyectos|todas las obras|toda la empresa)\b/.test(question);
  if (dataRequest && (explicitGlobal || dataRequest.entity === "profiles" || dataRequest.entity === "periods")) {
    return { kind: "data", project: null, period, request: dataRequest, question: query };
  }
  if (period && explicitGlobal && !dataRequest) return { kind: "periodOverview", period };
  if (/\b(resumen|general|global|total|totales|todos|cuantos)\b/.test(question) && !dataRequest && !period) return { kind: "overview", intents };
  if (projectId && !unknownCenter) {
    const project = projects.find((item) => item.projectId === projectId);
    if (project) return unsupportedQuestion ? { kind: "unsupported", project }
      : dataRequest ? { kind: "data", project, period, request: dataRequest, question: query }
      : { kind: period ? "period" : "project", project, period, intents };
  }
  if (dataRequest && dataRequest.entity !== "projectField") {
    return { kind: "data", project: null, period, request: dataRequest, question: query };
  }
  if (period && intents.length && !dataRequest) return { kind: "periodOverview", period };
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
    remainingExecution: execution === null || execution === undefined ? null : Math.max(0, 100 - Number(execution)),
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

export function buildAssistantPeriodAnswer(project, period, monthly = [], projectIds = [project.projectId]) {
  const scope = new Set(projectIds);
  const inScope = monthly.filter((row) => scope.has(row.projectId));
  const inPeriod = inScope.filter((row) => row.year === period.year && row.month === period.month);
  const own = inPeriod.find((row) => row.projectId === project.projectId);
  const through = inScope.filter((row) => row.year < period.year || (row.year === period.year && row.month <= period.month));
  const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const contractValue = Number(project.contractValue ?? 0);
  const monthlyExecution = own?.executedIncrementalPercentage ?? null;
  const accumulatedExecution = own?.executedCumulativePercentage ?? null;
  const paidTotal = sum(through, "paidValue");
  return {
    kind: "period", project, period, hasData: inPeriod.length > 0,
    monthlyExecution, accumulatedExecution,
    monthlyEquivalent: monthlyExecution === null || contractValue <= 0 ? null : contractValue * monthlyExecution / 100,
    accumulatedEquivalent: accumulatedExecution === null || contractValue <= 0 ? null : contractValue * accumulatedExecution / 100,
    invoicedMonth: sum(inPeriod, "invoicedValue"), invoicedTotal: sum(through, "invoicedValue"),
    paidMonth: sum(inPeriod, "paidValue"), paidTotal,
    collectionPercentage: contractValue > 0 ? paidTotal / contractValue * 100 : null,
    scopeProjectCount: scope.size
  };
}

export function buildAssistantPortfolioList(projects = [], filter = "receivable") {
  const financial = topLevelFinancialRows(projects);
  const rows = filter === "all" ? projects
    : filter === "receivable" ? financial.filter((project) => Number(project.paymentPending) > 0)
    : filter === "withoutContract" ? financial.filter((project) => Number(project.contractValue) <= 0)
    : filter === "withoutExecution" ? projects.filter((project) => project.executedProgressPercentage === null || project.executedProgressPercentage === undefined)
    : filter.startsWith("status:") ? projects.filter((project) => project.status === filter.slice(7)) : [];
  rows.sort((a, b) => filter === "receivable"
    ? Number(b.paymentPending) - Number(a.paymentPending)
    : String(a.costCenter).localeCompare(String(b.costCenter), "es", { numeric: true }));
  return { kind: "portfolio", filter, total: rows.length, projects: rows.slice(0, 20) };
}

export function buildAssistantOverview(projects = []) {
  return { kind: "overview", indicators: calculateDashboardIndicators(projects) };
}

export function buildAssistantProjectList(projects = [], filter) {
  const matches = projects.filter((project) => words(project[filter.key]) === words(filter.value));
  return { kind: "projectList", filter, total: matches.length, projects: matches.slice(0, 20) };
}

export function buildAssistantPeriodOverview(period, monthly = []) {
  const rows = monthly.filter((row) => row.year === period.year && row.month === period.month);
  const tracked = rows.filter((row) => row.trackingId && row.executedCumulativePercentage !== null);
  const sum = (field) => rows.reduce((total, row) => total + Number(row[field] ?? 0), 0);
  return { kind: "periodOverview", period, projectCount: rows.length,
    trackedCount: tracked.length,
    averageExecution: tracked.length ? tracked.reduce((total, row) => total + Number(row.executedCumulativePercentage), 0) / tracked.length : null,
    invoiced: sum("invoicedValue"), paid: sum("paidValue"), costs: sum("costsExpensesValue") };
}

export function buildAssistantDataAnswer({ request, project, period, question }, {
  projectDetails = null, projects = [], contracts = [], monthly = [], invoices = [], payments = [], costs = [],
  audit = [], profiles = [], periods = []
} = {}) {
  const entity = request.entity;
  if (entity === "projectField") {
    const fields = request.fields ?? [request.field];
    const valueFor = (details) => Object.fromEntries(fields.map((field) => {
      const value = details?.[field] ?? null;
      const parent = projects.find((item) => item.projectId === value);
      return [field, parent?.costCenter ?? value];
    }));
    if (project) {
      const values = valueFor(projectDetails ?? project);
      return { kind: "data", entity, project, field: request.field, value: values[request.field], values };
    }
    const details = Array.isArray(projectDetails) ? projectDetails : projects;
    const rows = details.map((item) => ({
      project: projects.find((summary) => summary.projectId === item.id || summary.projectId === item.projectId) ?? item,
      values: valueFor(item)
    }));
    return { kind: "data", entity, project: null, rows: rows.slice(0, 20), total: rows.length, limited: rows.length > 20 };
  }
  let rows = { contracts, tracking: monthly, invoices, payments, costs, audit, profiles, periods }[entity] ?? [];
  if (project && entity !== "profiles" && entity !== "periods") {
    const scope = new Set(descendantProjectIds(project, projects));
    rows = rows.filter((row) => entity === "tracking" ? row.projectId === project.projectId
      : entity === "audit" ? scope.has(row.projectId) : scope.has(row.projectId));
  }
  if (period && entity !== "profiles" && entity !== "audit" && entity !== "contracts") {
    rows = rows.filter((row) => entity === "periods" ? row.id === period.periodId
      : entity === "tracking" ? row.year === period.year && row.month === period.month
        : row.periodId === period.periodId);
  }
  const normalized = words(question);
  const referenceKey = { contracts: "contractNumber", invoices: "invoiceNumber", payments: "paymentReference", costs: "documentReference" }[entity];
  if (referenceKey) {
    const referenced = rows.filter((row) => {
      const reference = words(row[referenceKey]);
      return reference.length >= 3 && (` ${normalized} `).includes(` ${reference} `);
    });
    if (referenced.length) rows = referenced;
  }
  if (/\b(anuladas|anulados)\b/.test(normalized)) rows = rows.filter((row) => /^anulad/.test(row.status));
  if (entity === "profiles" && /\b(pendientes|inactivos|inactivas|sin activar|activas|activos)\b/.test(normalized)) {
    const active = /\b(activas|activos)\b/.test(normalized);
    rows = rows.filter((row) => row.active === active);
  }
  if (entity === "audit") {
    if (/\b(quien creo|creacion)\b/.test(normalized)) rows = rows.filter((row) => row.tableName === "projects" && row.action === "INSERT");
    else if (/\b(quien modifico|actualizo)\b/.test(normalized)) rows = rows.filter((row) => row.action === "UPDATE");
  }
  if (entity === "tracking") {
    if (/\b(observaciones)\b/.test(normalized)) rows = rows.filter((row) => row.observations);
    if (/\b(novedad|novedades|incidencia|incidencias)\b/.test(normalized)) rows = rows.filter((row) => row.executionIssue);
    if (/\b(rechazados?|validados?|pendientes?)\b/.test(normalized)) {
      const status = /\brechazados?\b/.test(normalized) ? "rechazado"
        : /\bvalidados?\b/.test(normalized) ? "validado" : "pendiente";
      rows = rows.filter((row) => row.validationStatus === status);
    }
  }
  if (entity === "invoices" && /\b(emitidas|registradas)\b/.test(normalized)) {
    rows = rows.filter((row) => row.status === (/\bemitidas\b/.test(normalized) ? "emitida" : "registrada"));
  }
  if (/\b(abiertos|abierto|cerrados|cerrado)\b/.test(normalized) && entity === "periods") {
    const status = /\b(abiertos|abierto)\b/.test(normalized) ? "abierto" : "cerrado";
    rows = rows.filter((row) => row.status === status);
  }
  if (entity === "costs") {
    const value = rows.map((row) => row.category).find((item) => item && (` ${normalized} `).includes(` ${words(item)} `))
      ?? rows.map((row) => row.supplierName).find((item) => item && (` ${normalized} `).includes(` ${words(item)} `));
    if (value) rows = rows.filter((row) => words(row.category) === words(value) || words(row.supplierName) === words(value));
  }
  const dateKey = { contracts: "startDate", invoices: "issueDate", payments: "paymentDate", costs: "movementDate",
    tracking: "year", audit: "changedAt", profiles: "createdAt", periods: "year" }[entity];
  rows = [...rows].sort((a, b) => String(b[dateKey] ?? "").localeCompare(String(a[dateKey] ?? "")) ||
    Number(b.month ?? 0) - Number(a.month ?? 0));
  if (entity === "audit") {
    const names = new Map(profiles.map((profile) => [profile.id, profile.fullName]));
    rows = rows.map((row) => ({ ...row, actorName: names.get(row.changedBy) ?? null }));
  }
  const activeRows = rows.filter((row) => !/^anulad/.test(row.status ?? ""));
  return { kind: "data", entity, project, period, total: rows.length, rows: rows.slice(0, 20),
    activeTotal: activeRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
    limited: rows.length > 20 };
}
