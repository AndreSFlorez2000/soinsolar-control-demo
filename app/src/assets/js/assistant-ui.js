import {
  buildAssistantOverview, buildAssistantProjectAnswer, descendantProjectIds, isCreateProjectRequest,
  parseProjectDraftField, prepareProjectDraft, PROJECT_DRAFT_FIELDS,
  resolveAssistantQuestion, resolveAssistantQuickQuestion
} from "./domain/assistant.js?v=1.7.3";
import { formatCop } from "./domain/financial.js?v=1.1.0";

const form = document.querySelector("#assistantForm");
const input = document.querySelector("#assistantQuestion");
const send = document.querySelector("#assistantSend");
const messages = document.querySelector("#assistantMessages");
const loading = document.querySelector("#assistantLoading");
const loadingText = document.querySelector("#assistantLoadingText");
let generation = 0;
let busy = false;
let draft = null;

function setBusy(value, label = "Consultando datos…") {
  busy = value;
  send.disabled = value;
  input.disabled = value;
  form.setAttribute("aria-busy", String(value));
  loading.hidden = !value;
  loadingText.textContent = label;
  document.querySelectorAll("#assistantView [data-assistant-prompt], #assistantView [data-assistant-query], #assistantView [data-assistant-action]")
    .forEach((button) => { button.disabled = value; });
  if (!value && !document.querySelector("#appView").hidden) input.focus();
}

function node(tag, className = "", value = "") {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (value !== "") item.textContent = value;
  return item;
}

function percent(value) {
  return value === null || value === undefined ? "Sin registrar"
    : `${Number(value).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
}

function date(value) {
  if (!value) return "Sin fecha";
  const stamp = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(stamp.getTime()) ? "Sin fecha"
    : new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", dateStyle: "medium" }).format(stamp);
}

function month(row) {
  if (!row) return "Sin seguimiento registrado";
  const stamp = new Date(Date.UTC(row.year, row.month - 1, 1));
  return new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", month: "long", year: "numeric" }).format(stamp);
}

function bubble(role) {
  const item = node("article", `assistant-message assistant-message-${role}`);
  messages.append(item);
  messages.scrollTop = messages.scrollHeight;
  return item;
}

function paragraph(parent, value, className = "") {
  parent.append(node("p", className, value));
}

function metric(parent, label, value) {
  const item = node("div", "assistant-metric");
  item.append(node("span", "", label), node("strong", "", value));
  parent.append(item);
}

function detail(parent, label, value) {
  const item = node("div", "assistant-detail");
  item.append(node("dt", "", label), node("dd", "", value));
  parent.append(item);
}

function section(parent, title) {
  const block = node("section", "assistant-answer-section");
  block.append(node("h5", "", title));
  parent.append(block);
  return block;
}

function button(parent, title, action, className = "assistant-choice") {
  const control = node("button", className, title);
  control.type = "button";
  control.dataset.assistantAction = action;
  parent.append(control);
  return control;
}

function renderProject(target, answer) {
  const { project, contract } = answer;
  target.append(node("h4", "", `${project.projectName} (${project.costCenter})`));
  paragraph(target, `Estado: ${project.status || "Sin registrar"} · ${project.municipality || "Municipio sin registrar"}${project.clientName ? ` · Cliente: ${project.clientName}` : ""}`, "assistant-subtitle");

  const grid = node("div", "assistant-metrics");
  metric(grid, "Contrato vigente", formatCop(project.contractValue));
  metric(grid, "Avance de ejecución", percent(answer.execution));
  metric(grid, "Equivalente monetario de ejecución", answer.executedEquivalent === null ? "Sin registrar" : formatCop(answer.executedEquivalent));
  metric(grid, "Facturado", formatCop(project.totalInvoiced));
  metric(grid, "Facturación del contrato", percent(answer.billingPercentage));
  metric(grid, "Recaudado", formatCop(project.totalPaid));
  metric(grid, "Recaudo Financiero", percent(answer.collectionPercentage));
  metric(grid, "Cartera por cobrar", formatCop(project.paymentPending));
  target.append(grid);
  paragraph(target, "El avance de ejecución es un dato físico registrado manualmente. Su equivalente en pesos es una referencia sobre el contrato; no representa facturación, pagos ni costos.", "assistant-caveat");

  const finance = section(target, "Más detalles financieros");
  const financeList = node("dl", "assistant-details");
  detail(financeList, "Saldo del contrato sin facturar", formatCop(project.contractualBalance));
  detail(financeList, "Costos y gastos", formatCop(project.totalCostsExpenses));
  detail(financeList, "Contrato menos costos y gastos", formatCop(project.profitability));
  detail(financeList, "Cobrado de lo facturado", percent(answer.collectedOnInvoices));
  finance.append(financeList);

  const contractSection = section(target, "Contrato y ejecución");
  const contractList = node("dl", "assistant-details");
  detail(contractList, "Número de contrato", contract?.contractNumber ?? project.contractNumber ?? "Sin contrato propio registrado");
  if (contract) {
    detail(contractList, "Vigencia", `${date(contract.startDate)} a ${contract.endDate ? date(contract.endDate) : "sin fecha final"}`);
    detail(contractList, "Estado del contrato", contract.status);
  }
  detail(contractList, "Último mes con avance registrado", month(answer.lastTracking));
  if (answer.lastTracking?.executionIssue) detail(contractList, "Novedad de ejecución", answer.lastTracking.executionIssue);
  contractSection.append(contractList);

  const activity = section(target, "Movimientos recientes");
  const activityList = node("dl", "assistant-details");
  const invoice = answer.latestInvoice;
  detail(activityList, `Facturas activas (${answer.invoiceCount})`, invoice
    ? `Última: ${invoice.invoiceNumber} · ${formatCop(invoice.amount)} · ${date(invoice.issueDate)}` : "Sin facturas activas");
  const payment = answer.latestPayment;
  detail(activityList, `Pagos activos (${answer.paymentCount})`, payment
    ? `Último: ${payment.paymentReference} · ${formatCop(payment.amount)} · ${date(payment.paymentDate)}` : "Sin pagos registrados");
  const cost = answer.latestCost;
  detail(activityList, `Costos y gastos (${answer.costCount})`, cost
    ? `Último: ${cost.category} · ${formatCop(cost.amount)} · ${date(cost.movementDate)}` : "Sin movimientos registrados");
  activity.append(activityList);
  if (answer.scopeProjectCount > 1) paragraph(target,
    `Las cifras monetarias y los movimientos incluyen ${answer.scopeProjectCount} centros relacionados. El avance de ejecución corresponde al centro consultado.`, "assistant-footnote");
}

function renderProjectFocus(target, answer, intents) {
  const { project } = answer;
  target.append(node("h4", "", `${project.projectName} (${project.costCenter})`));
  const grid = node("div", "assistant-metrics");
  for (const intent of intents) {
    if (intent === "contract") {
      metric(grid, "Valor del contrato", formatCop(project.contractValue));
      if (answer.contract?.contractNumber || project.contractNumber) metric(grid, "Número de contrato", answer.contract?.contractNumber ?? project.contractNumber);
    }
    if (intent === "execution") metric(grid, "Avance de ejecución", percent(answer.execution));
    if (intent === "executedEquivalent") metric(grid, "Equivalente monetario de ejecución", answer.executedEquivalent === null ? "Sin registrar" : formatCop(answer.executedEquivalent));
    if (intent === "billing") {
      metric(grid, "Facturado", formatCop(project.totalInvoiced));
      metric(grid, "Facturación del contrato", percent(answer.billingPercentage));
    }
    if (intent === "collection") {
      metric(grid, "Recaudado", formatCop(project.totalPaid));
      metric(grid, "Recaudo Financiero", percent(answer.collectionPercentage));
    }
    if (intent === "receivable") metric(grid, "Cartera por cobrar", formatCop(project.paymentPending));
    if (intent === "balance") metric(grid, "Saldo del contrato sin facturar", formatCop(project.contractualBalance));
    if (intent === "costs") metric(grid, "Costos y gastos", formatCop(project.totalCostsExpenses));
    if (intent === "profitability") metric(grid, "Contrato menos costos y gastos", formatCop(project.profitability));
    if (intent === "status") metric(grid, "Estado del proyecto", project.status || "Sin registrar");
  }
  if (grid.childElementCount) target.append(grid);
  if (intents.includes("executedEquivalent")) paragraph(target,
    "Es una referencia: contrato × avance físico digitado. No es facturación ni recaudo.", "assistant-caveat");
  if (intents.includes("execution")) paragraph(target,
    "El avance de ejecución se registra manualmente y no cambia con los pagos.", "assistant-footnote");
  if (intents.includes("activity")) {
    const activity = section(target, "Movimientos recientes");
    const list = node("dl", "assistant-details");
    detail(list, `Facturas activas (${answer.invoiceCount})`, answer.latestInvoice
      ? `Última: ${answer.latestInvoice.invoiceNumber} · ${formatCop(answer.latestInvoice.amount)} · ${date(answer.latestInvoice.issueDate)}` : "Sin facturas activas");
    detail(list, `Pagos activos (${answer.paymentCount})`, answer.latestPayment
      ? `Último: ${answer.latestPayment.paymentReference} · ${formatCop(answer.latestPayment.amount)} · ${date(answer.latestPayment.paymentDate)}` : "Sin pagos registrados");
    detail(list, `Costos y gastos (${answer.costCount})`, answer.latestCost
      ? `Último: ${answer.latestCost.category} · ${formatCop(answer.latestCost.amount)} · ${date(answer.latestCost.movementDate)}` : "Sin movimientos registrados");
    activity.append(list);
  }
  if (intents.some((intent) => ["latestPayment", "latestInvoice", "latestCost"].includes(intent))) {
    const list = node("dl", "assistant-details");
    if (intents.includes("latestPayment")) detail(list, "Último pago", answer.latestPayment
      ? `${answer.latestPayment.paymentReference} · ${formatCop(answer.latestPayment.amount)} · ${date(answer.latestPayment.paymentDate)}` : "Sin pagos registrados");
    if (intents.includes("latestInvoice")) detail(list, "Última factura", answer.latestInvoice
      ? `${answer.latestInvoice.invoiceNumber} · ${formatCop(answer.latestInvoice.amount)} · ${date(answer.latestInvoice.issueDate)}` : "Sin facturas activas");
    if (intents.includes("latestCost")) detail(list, "Último costo o gasto", answer.latestCost
      ? `${answer.latestCost.category} · ${formatCop(answer.latestCost.amount)} · ${date(answer.latestCost.movementDate)}` : "Sin movimientos registrados");
    target.append(list);
  }
  if (answer.scopeProjectCount > 1 && intents.some((intent) =>
    ["contract", "executedEquivalent", "billing", "collection", "receivable", "balance", "costs", "profitability", "activity", "latestPayment", "latestInvoice", "latestCost"].includes(intent))) {
    paragraph(target, `Las cifras monetarias incluyen ${answer.scopeProjectCount} centros relacionados. El avance físico corresponde a este centro.`, "assistant-footnote");
  }
}

function renderOverview(target, answer, intents = ["full"]) {
  const data = answer.indicators;
  target.append(node("h4", "", "Resumen general de proyectos"));
  if (intents.length && !intents.includes("full")) {
    const grid = node("div", "assistant-metrics");
    const mapping = {
      projectCount: ["Proyectos registrados", String(data.projectCount)],
      contract: ["Contratos vigentes", formatCop(data.contractValue)],
      executedEquivalent: ["Equivalente monetario de ejecución", formatCop(data.executedEquivalent)],
      execution: ["Avance de ejecución promedio", percent(data.executionProgress)],
      billing: ["Facturado", formatCop(data.invoiced)],
      collection: ["Pagado / recaudado", formatCop(data.paid)],
      receivable: ["Cartera pendiente", formatCop(data.paymentPending)],
      costs: ["Costos y gastos", formatCop(data.costsExpenses)]
    };
    if (intents.every((intent) => mapping[intent])) {
      for (const intent of intents) {
        metric(grid, ...mapping[intent]);
        if (intent === "collection") metric(grid, "Recaudo Financiero", percent(data.collectionProgress));
      }
      target.append(grid);
      return;
    }
  }
  paragraph(target, `${data.projectCount} proyectos registrados · ${data.activeProjects} activos. Las cifras monetarias evitan sumar dos veces los centros asociados.`, "assistant-subtitle");
  const grid = node("div", "assistant-metrics");
  metric(grid, "Contratos vigentes", formatCop(data.contractValue));
  metric(grid, "Facturado", formatCop(data.invoiced));
  metric(grid, "Pagado / recaudado", formatCop(data.paid));
  metric(grid, "Recaudo Financiero", percent(data.collectionProgress));
  metric(grid, "Cartera pendiente", formatCop(data.paymentPending));
  metric(grid, "Costos y gastos", formatCop(data.costsExpenses));
  metric(grid, "Avance de ejecución promedio", percent(data.executionProgress));
  metric(grid, "Equivalente monetario de ejecución", formatCop(data.executedEquivalent));
  target.append(grid);
  paragraph(target, "El avance de ejecución se registra manualmente por proyecto. El equivalente monetario no modifica la facturación ni el recaudo.", "assistant-caveat");
}

function projectChoice(target, project, question = "") {
  const button = node("button", "assistant-choice", `${project.costCenter} · ${project.projectName}`);
  button.type = "button";
  button.dataset.assistantQuery = `${question} ${project.costCenter}`.trim();
  target.append(button);
}

function draftField() {
  return PROJECT_DRAFT_FIELDS[draft.step];
}

function renderDraftStep(target) {
  const field = draftField();
  paragraph(target, `Paso ${draft.step + 1} de ${PROJECT_DRAFT_FIELDS.length} · ${field.label}`, "assistant-subtitle");
  paragraph(target, field.prompt);
  if (!field.required) {
    button(target, "Omitir este dato", "skip");
    button(target, "Terminar datos opcionales y revisar", "skip-optionals");
  }
  button(target, "Cancelar creación", "cancel");
}

function renderDraftReview(target, projects) {
  let input;
  try {
    input = prepareProjectDraft(draft.values, projects);
  } catch (error) {
    draft.mode = "choose-edit";
    paragraph(target, error.message);
    renderDraftEdit(target);
    return;
  }
  target.append(node("h4", "", "Revisa el proyecto antes de guardarlo"));
  const list = node("dl", "assistant-details");
  for (const field of PROJECT_DRAFT_FIELDS) {
    const value = field.key === "parentProjectId"
      ? projects.find((item) => item.projectId === input.parentProjectId)?.costCenter
      : input[field.key];
    detail(list, field.label, value === null || value === undefined || value === "" ? "Sin registrar" : String(value));
  }
  target.append(list);
  paragraph(target, "Al guardar se creará la ficha del proyecto. El contrato y sus valores se registran después en esa ficha.", "assistant-caveat");
  button(target, "Guardar proyecto", "save", "assistant-choice assistant-choice-primary");
  button(target, "Editar datos", "edit");
  button(target, "Cancelar creación", "cancel");
}

function renderDraftEdit(target) {
  paragraph(target, "Selecciona el dato que quieres corregir:");
  for (const field of PROJECT_DRAFT_FIELDS) button(target, field.label, `edit:${field.key}`);
  button(target, "Volver a revisión", "review");
}

async function processDraft(value, projects, profile, gateway, reply, requestGeneration) {
  if (!profile?.active || !["administrador", "gerencia"].includes(profile.role)) {
    draft = null;
    paragraph(reply, "Tu cuenta no tiene permiso para crear proyectos. Un administrador debe habilitar tu acceso.");
    return;
  }
  if (/^cancelar( creacion)?$/i.test(value)) {
    draft = null;
    paragraph(reply, "Creación cancelada. No se guardó ningún proyecto.");
    return;
  }
  if (!draft) {
    draft = { step: 0, values: {}, mode: "collecting", editKey: null };
    paragraph(reply, "Vamos a crear un proyecto. Te pediré los datos, podrás corregirlos y revisarás todo antes de guardarlo.");
    renderDraftStep(reply);
    return;
  }
  if (draft.mode === "review") {
    if (/^(guardar|confirmar|si guardar|guardar proyecto)$/i.test(value)) {
      let input;
      try {
        input = prepareProjectDraft(draft.values, projects);
      } catch (error) {
        draft.mode = "choose-edit";
        paragraph(reply, error.message);
        renderDraftEdit(reply);
        return;
      }
      const refreshedProfile = await gateway.getCurrentProfile();
      if (!refreshedProfile?.active || !["administrador", "gerencia"].includes(refreshedProfile.role)) throw new Error("Tu cuenta ya no tiene permiso para crear proyectos.");
      const latestProjects = await gateway.listProjects();
      try {
        prepareProjectDraft(input, latestProjects);
      } catch (error) {
        draft.mode = "choose-edit";
        paragraph(reply, error.message);
        renderDraftEdit(reply);
        return;
      }
      if (requestGeneration !== generation || document.querySelector("#appView").hidden) return;
      const created = await gateway.createProject(input);
      draft = null;
      if (requestGeneration !== generation) return;
      try {
        await window.SOINSOLAR_APP_API.reloadReferenceData();
      } catch {
        paragraph(reply, "El proyecto se guardó. Actualiza la aplicación para verlo en los demás módulos.", "assistant-footnote");
      }
      reply.append(node("h4", "", "Proyecto guardado"));
      paragraph(reply, `${created.costCenter} · ${created.name} se creó correctamente. Ya puedes registrar el contrato y después el seguimiento mensual.`);
      const open = button(reply, "Abrir ficha del proyecto", "open", "assistant-choice assistant-choice-primary");
      open.dataset.projectId = created.id;
      open.dataset.action = "open-project";
      return;
    }
    if (/^revisar$/i.test(value)) {
      renderDraftReview(reply, projects);
      return;
    }
    if (/^editar( datos)?$/i.test(value)) {
      draft.mode = "choose-edit";
      renderDraftEdit(reply);
      return;
    }
    paragraph(reply, "El borrador aún no se ha guardado. Selecciona «Guardar proyecto», «Editar datos» o «Cancelar creación».");
    renderDraftReview(reply, projects);
    return;
  }
  if (draft.mode === "choose-edit") {
    paragraph(reply, "Elige uno de los campos de la lista para modificarlo.");
    renderDraftEdit(reply);
    return;
  }
  if (draft.mode === "edit") {
    try {
      draft.values[draft.editKey] = parseProjectDraftField(draft.editKey, value, projects);
      draft.mode = "review";
      draft.editKey = null;
      renderDraftReview(reply, projects);
    } catch (error) {
      paragraph(reply, error.message);
      paragraph(reply, `Intenta de nuevo: ${PROJECT_DRAFT_FIELDS.find((field) => field.key === draft.editKey).prompt}`);
    }
    return;
  }
  if (/^omitir opcionales$/i.test(value) && !draftField().required) {
    for (let index = draft.step; index < PROJECT_DRAFT_FIELDS.length; index++) {
      const field = PROJECT_DRAFT_FIELDS[index];
      draft.values[field.key] = parseProjectDraftField(field.key, "omitir", projects);
    }
    draft.mode = "review";
    renderDraftReview(reply, projects);
    return;
  }
  const field = draftField();
  try {
    draft.values[field.key] = parseProjectDraftField(field.key, value, projects);
    draft.step += 1;
    if (draft.step < PROJECT_DRAFT_FIELDS.length) renderDraftStep(reply);
    else {
      draft.mode = "review";
      renderDraftReview(reply, projects);
    }
  } catch (error) {
    paragraph(reply, error.message);
    renderDraftStep(reply);
  }
}

function welcome() {
  messages.replaceChildren();
  const item = bubble("assistant");
  item.append(node("h4", "", "Hola, soy el asistente de SOINSOLAR"));
  paragraph(item, "Pregunta por un dato puntual de un proyecto o escribe «resumen general». Si tienes permiso, escribe «crear proyecto» y te guiaré hasta guardarlo.");
}

function renderQuickAnswer(target, answer) {
  if (answer.kind === "creator") {
    target.append(node("h4", "", "¿Quién es mi creador?"));
    paragraph(target, "Soy el asistente de SOINSOLAR Control, creado por Juan Andrés Flórez Ospina, ingeniero de sistemas.");
    return;
  }
  target.append(node("h4", "", "¿Qué puedo hacer por ti?"));
  paragraph(target, "Puedo consultar por nombre o centro de costo el contrato, el avance de ejecución, el valor equivalente ejecutado, la facturación, el recaudo, la cartera, los costos y los movimientos recientes.");
  paragraph(target, "También puedo mostrar un resumen general y guiarte paso a paso para crear un proyecto, revisar sus datos y guardarlo si tu cuenta tiene permiso.");
  paragraph(target, "Prueba con «¿Cuánto recaudó CC-102?», «¿Cuál es el avance de ejecución de CC-102?» o «Crear proyecto».", "assistant-caveat");
}

async function ask(question) {
  const value = String(question ?? "").trim();
  if (!value || busy || document.querySelector("#appView").hidden) return;
  input.value = "";
  setBusy(true, draft?.mode === "review" && /^(guardar|confirmar)/i.test(value)
    ? "Guardando proyecto…" : "Preparando respuesta…");
  const requestGeneration = generation;
  bubble("user").textContent = value;
  const reply = bubble("assistant");
  reply.textContent = "Consultando datos…";
  try {
    const app = window.SOINSOLAR_APP_API;
    const profile = app.profile();
    if (!profile?.active) throw new Error("Tu cuenta aún no tiene acceso a los proyectos.");
    const quick = resolveAssistantQuickQuestion(value);
    if (quick) {
      reply.replaceChildren();
      renderQuickAnswer(reply, quick);
      if (draft) paragraph(reply, "Tu borrador sigue abierto. Puedes continuar con el dato solicitado o escribir «cancelar».", "assistant-footnote");
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    const projects = app.projects();
    if (requestGeneration !== generation || document.querySelector("#appView").hidden) return;
    if (draft || isCreateProjectRequest(value)) {
      reply.replaceChildren();
      const gateway = await app.gateway();
      await processDraft(value, projects, profile, gateway, reply, requestGeneration);
      messages.scrollTop = messages.scrollHeight;
      return;
    }
    const result = resolveAssistantQuestion(value, projects);
    let answer = result;
    if (result.kind === "project") {
      const full = result.intents.includes("full");
      const withActivity = full || result.intents.some((intent) =>
        ["activity", "latestPayment", "latestInvoice", "latestCost"].includes(intent));
      const ids = descendantProjectIds(result.project, projects);
      let contracts = [];
      let monthly = [];
      let movements = [];
      if (full || result.intents.includes("contract") || withActivity) {
        const gateway = await app.gateway();
        const needsInvoices = full || result.intents.includes("activity") || result.intents.includes("latestInvoice");
        const needsPayments = full || result.intents.includes("activity") || result.intents.includes("latestPayment");
        const needsCosts = full || result.intents.includes("activity") || result.intents.includes("latestCost");
        [contracts, monthly, movements] = await Promise.all([
          full || result.intents.includes("contract") ? gateway.listContracts(result.project.projectId) : [],
          full ? gateway.listMonthlyTracking({ projectId: result.project.projectId }) : [],
          withActivity ? Promise.all(ids.map(async (projectId) => {
            const [invoices, payments, costs] = await Promise.all([
              needsInvoices ? gateway.listInvoices({ projectId }) : [],
              needsPayments ? gateway.listPayments({ projectId }) : [],
              needsCosts ? gateway.listCostsExpenses({ projectId }) : []
            ]);
            return { invoices, payments, costs };
          })) : []
        ]);
      }
      answer = buildAssistantProjectAnswer(result.project, {
        contracts, monthly, scopeProjectCount: ids.length,
        invoices: movements.flatMap((item) => item.invoices),
        payments: movements.flatMap((item) => item.payments),
        costs: movements.flatMap((item) => item.costs)
      });
    } else if (result.kind === "overview") answer = buildAssistantOverview(projects);
    if (requestGeneration !== generation || document.querySelector("#appView").hidden) return;
    reply.replaceChildren();
    if (answer.kind === "project") {
      if (result.intents.includes("full")) renderProject(reply, answer);
      else renderProjectFocus(reply, answer, result.intents);
    }
    else if (answer.kind === "overview") renderOverview(reply, answer, result.intents);
    else if (answer.kind === "choose") {
      paragraph(reply, "Encontré varios proyectos. Selecciona el centro de costo que quieres consultar:");
      answer.projects.forEach((project) => projectChoice(reply, project, value));
    } else {
      paragraph(reply, "No encontré un centro de costo o proyecto concreto en esa pregunta. Prueba con su nombre, código o «resumen general».");
      projects.slice(0, 3).forEach((project) => projectChoice(reply, project));
    }
    messages.scrollTop = messages.scrollHeight;
  } catch (error) {
    if (requestGeneration === generation && !document.querySelector("#appView").hidden) {
      reply.textContent = error.message || "No se pudieron consultar los datos. Vuelve a intentarlo.";
    }
  } finally {
    if (requestGeneration === generation) setBusy(false);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

document.querySelector("#assistantView").addEventListener("click", (event) => {
  if (busy) return;
  const action = event.target.closest("[data-assistant-action]");
  if (action) {
    const value = action.dataset.assistantAction;
    if (value === "open") return;
    if (!draft) return;
    if (value === "cancel") return ask("cancelar");
    if (value === "skip") return ask("omitir");
    if (value === "skip-optionals") return ask("omitir opcionales");
    if (value === "save") return ask("guardar proyecto");
    if (value === "edit") return ask("editar datos");
    if (value === "review") {
      draft.mode = "review";
      return ask("revisar");
    }
    if (value.startsWith("edit:")) {
      draft.editKey = value.slice(5);
      draft.mode = "edit";
      const reply = bubble("assistant");
      paragraph(reply, PROJECT_DRAFT_FIELDS.find((field) => field.key === draft.editKey).prompt);
      input.focus();
      return;
    }
  }
  const button = event.target.closest("[data-assistant-prompt], [data-assistant-query]");
  if (button) ask(button.dataset.assistantPrompt ?? button.dataset.assistantQuery);
});

window.addEventListener("soinsolar:logout", () => {
  generation += 1;
  draft = null;
  setBusy(false);
  input.value = "";
  welcome();
});

welcome();
