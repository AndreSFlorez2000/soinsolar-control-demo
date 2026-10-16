import {
  buildAssistantOverview, buildAssistantProjectAnswer, descendantProjectIds, resolveAssistantQuestion
} from "./domain/assistant.js?v=1.6.0";
import { formatCop } from "./domain/financial.js?v=1.1.0";

const form = document.querySelector("#assistantForm");
const input = document.querySelector("#assistantQuestion");
const send = document.querySelector("#assistantSend");
const messages = document.querySelector("#assistantMessages");
let generation = 0;
let busy = false;

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

function renderOverview(target, answer) {
  const data = answer.indicators;
  target.append(node("h4", "", "Resumen general de proyectos"));
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

function projectChoice(target, project) {
  const button = node("button", "assistant-choice", `${project.costCenter} · ${project.projectName}`);
  button.type = "button";
  button.dataset.assistantQuery = project.costCenter;
  target.append(button);
}

function welcome() {
  messages.replaceChildren();
  const item = bubble("assistant");
  item.append(node("h4", "", "Hola, soy el asistente de SOINSOLAR"));
  paragraph(item, "Pregunta por un centro de costo o proyecto. También puedes escribir «resumen general» para ver las cifras globales.");
}

async function ask(question) {
  const value = String(question ?? "").trim();
  if (!value || busy || document.querySelector("#appView").hidden) return;
  busy = true;
  send.disabled = true;
  input.value = "";
  const requestGeneration = generation;
  bubble("user").textContent = value;
  const reply = bubble("assistant");
  reply.textContent = "Consultando datos…";
  try {
    const gateway = await window.SOINSOLAR_APP_API.gateway();
    const profile = await gateway.getCurrentProfile();
    if (!profile?.active) throw new Error("Tu cuenta aún no tiene acceso a los proyectos.");
    const projects = await gateway.listProjects();
    const result = resolveAssistantQuestion(value, projects);
    let answer = result;
    if (result.kind === "project") {
      const ids = descendantProjectIds(result.project, projects);
      const [contracts, monthly, movements] = await Promise.all([
        gateway.listContracts(result.project.projectId),
        gateway.listMonthlyTracking({ projectId: result.project.projectId }),
        Promise.all(ids.map(async (projectId) => {
          const [invoices, payments, costs] = await Promise.all([
            gateway.listInvoices({ projectId }), gateway.listPayments({ projectId }), gateway.listCostsExpenses({ projectId })
          ]);
          return { invoices, payments, costs };
        }))
      ]);
      answer = buildAssistantProjectAnswer(result.project, {
        contracts, monthly, scopeProjectCount: ids.length,
        invoices: movements.flatMap((item) => item.invoices),
        payments: movements.flatMap((item) => item.payments),
        costs: movements.flatMap((item) => item.costs)
      });
    } else if (result.kind === "overview") answer = buildAssistantOverview(projects);
    if (requestGeneration !== generation || document.querySelector("#appView").hidden) return;
    reply.replaceChildren();
    if (answer.kind === "project") renderProject(reply, answer);
    else if (answer.kind === "overview") renderOverview(reply, answer);
    else if (answer.kind === "choose") {
      paragraph(reply, "Encontré varios proyectos. Selecciona el centro de costo que quieres consultar:");
      answer.projects.forEach((project) => projectChoice(reply, project));
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
    if (requestGeneration === generation) {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});

document.querySelector("#assistantView").addEventListener("click", (event) => {
  const button = event.target.closest("[data-assistant-prompt], [data-assistant-query]");
  if (button) ask(button.dataset.assistantPrompt ?? button.dataset.assistantQuery);
});

window.addEventListener("soinsolar:logout", () => {
  generation += 1;
  busy = false;
  send.disabled = false;
  input.value = "";
  welcome();
});

welcome();
