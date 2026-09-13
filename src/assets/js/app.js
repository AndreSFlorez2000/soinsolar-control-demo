import { dashboard as demoDashboard } from "./data/mock-data.js";
import { formatCop, paymentPending, safePercent } from "./domain/financial.js";
import { createApplicationDataGateway } from "./services/application-data.js";
import { isDemoMode, signIn, signOut } from "./services/supabase.js";

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const dashboardView = document.querySelector("#dashboardView");
const detailView = document.querySelector("#detailView");
const projectsView = document.querySelector("#projectsView");
const costsView = document.querySelector("#costsView");
const placeholderView = document.querySelector("#placeholderView");
const title = document.querySelector("#pageTitle");
const breadcrumb = document.querySelector("#breadcrumb");
const projectDialog = document.querySelector("#projectDialog");
const costDialog = document.querySelector("#costDialog");

const viewLabels = {
  dashboard: "Resumen general",
  projects: "Proyectos",
  monthly: "Seguimiento mensual",
  finance: "Facturación y pagos",
  costs: "Costos y gastos",
  reports: "Reportes",
  admin: "Administración",
  detail: "Detalle del proyecto"
};

const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

let gateway = null;
let selectedProjectId = null;
let currentProjects = [];
let currentPeriods = [];
let currentCosts = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function formatPercent(value) {
  return `${Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
}

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function setMessage(element, message = "", isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.originalText) {
    button.textContent = button.dataset.originalText;
  }
  button.disabled = busy;
}

async function ensureGateway() {
  if (!gateway) gateway = await createApplicationDataGateway();
  return gateway;
}

async function loadReferenceData() {
  const data = await ensureGateway();
  [currentProjects, currentPeriods] = await Promise.all([data.listProjects(), data.listPeriods()]);
  populateProjectOptions();
  populatePeriodOptions();
}

async function openApp() {
  const loginMessage = document.querySelector("#loginMessage");
  try {
    await ensureGateway();
    await loadReferenceData();
    loginView.hidden = true;
    appView.hidden = false;
    renderDashboard();
    await showView("dashboard");
  } catch (error) {
    setMessage(loginMessage, error.message || "No fue posible cargar la aplicación.", true);
  }
}

function closeApp() {
  appView.hidden = true;
  loginView.hidden = false;
  gateway = null;
  selectedProjectId = null;
  document.querySelector("#loginForm").reset();
}

async function showView(view) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view || (view === "detail" && button.dataset.view === "projects"));
  });

  const visible = { dashboard: dashboardView, detail: detailView, projects: projectsView, costs: costsView };
  [dashboardView, detailView, projectsView, costsView, placeholderView].forEach((element) => { element.hidden = true; });
  (visible[view] ?? placeholderView).hidden = false;
  title.textContent = viewLabels[view] ?? "Control Solar Demo";
  breadcrumb.textContent = view === "detail" ? "PROYECTOS / DETALLE" : (viewLabels[view] ?? view).toUpperCase();
  if (!placeholderView.hidden) document.querySelector("#placeholderTitle").textContent = `${viewLabels[view]} preparado`;
  history.replaceState({}, "", `#${view}`);

  if (view === "projects") await loadProjects();
  if (view === "costs") await loadCosts();
}

function renderDashboard() {
  const totals = currentProjects.reduce((result, project) => ({
    contractValue: result.contractValue + project.contractValue,
    invoiced: result.invoiced + project.totalInvoiced,
    paid: result.paid + project.totalPaid,
    costs: result.costs + project.totalCostsExpenses
  }), { contractValue: 0, invoiced: 0, paid: 0, costs: 0 });

  document.querySelector("#contractValue").textContent = formatCop(totals.contractValue);
  document.querySelector("#invoicedValue").textContent = formatCop(totals.invoiced);
  document.querySelector("#paidValue").textContent = formatCop(totals.paid);
  document.querySelector("#costValue").textContent = formatCop(totals.costs);
  document.querySelector("#receivableValue").textContent = `${formatCop(paymentPending(totals.invoiced, totals.paid))} por cobrar`;
  document.querySelector("#costRatio").textContent = `${safePercent(totals.costs, totals.contractValue).toFixed(1).replace(".", ",")} % del contrato`;

  document.querySelector("#projectRows").innerHTML = currentProjects.slice(0, 5).map((project) => `
    <tr>
      <td>${escapeHtml(project.costCenter)}</td><td><strong>${escapeHtml(project.projectName)}</strong></td><td>${escapeHtml(project.municipality)}</td>
      <td>${formatPercent(project.financialProgressPercentage)}</td><td>${formatCop(project.contractualBalance)}</td>
      <td><button class="open-project" data-action="open-project" data-project-id="${project.projectId}">Abrir</button></td>
    </tr>`).join("");
  renderChart();
}

function renderChart() {
  const canvas = document.querySelector("#monthlyChart");
  const fallback = document.querySelector("#chartFallback");
  if (!window.Chart) {
    canvas.hidden = true;
    fallback.style.display = "flex";
    fallback.innerHTML = demoDashboard.months.map((month, index) => `
      <div class="month"><span style="height:${demoDashboard.monthlyInvoiced[index] / 18}%;background:#337fbc"></span><span style="height:${demoDashboard.monthlyPaid[index] / 18}%;background:#2f8f59"></span><span style="height:${demoDashboard.monthlyCosts[index] / 18}%;background:#edaf25"></span><label>${month}</label></div>`).join("");
    return;
  }
  if (canvas.dataset.ready === "true") return;
  new window.Chart(canvas, {
    type: "bar",
    data: { labels: demoDashboard.months, datasets: [
      { label: "Facturación", data: demoDashboard.monthlyInvoiced, backgroundColor: "#337fbc", borderRadius: 4 },
      { label: "Pagos", data: demoDashboard.monthlyPaid, backgroundColor: "#2f8f59", borderRadius: 4 },
      { label: "Costos", data: demoDashboard.monthlyCosts, backgroundColor: "#edaf25", borderRadius: 4 }
    ] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (value) => `$${value} M` }, grid: { color: "#edf2f6" } } } }
  });
  canvas.dataset.ready = "true";
}

function projectFilters() {
  return {
    name: document.querySelector("#projectFilterName").value,
    costCenter: document.querySelector("#projectFilterCenter").value,
    municipality: document.querySelector("#projectFilterMunicipality").value,
    status: document.querySelector("#projectFilterStatus").value
  };
}

async function loadProjects(filters = projectFilters()) {
  const message = document.querySelector("#projectModuleMessage");
  setMessage(message, "Consultando proyectos…");
  try {
    const rows = await (await ensureGateway()).listProjects(filters);
    document.querySelector("#projectResultCount").textContent = rows.length;
    document.querySelector("#projectsManagementRows").innerHTML = rows.map((project) => `
      <tr><td><strong>${escapeHtml(project.costCenter)}</strong></td><td><span class="project-name-cell"><strong>${escapeHtml(project.projectName)}</strong><small>${escapeHtml(project.contractNumber || "Sin contrato registrado")}</small></span></td><td>${escapeHtml(project.municipality)}</td><td>${escapeHtml(project.serviceType)}</td><td><span class="status-badge ${escapeHtml(project.status)}">${escapeHtml(project.status)}</span></td><td>${formatPercent(project.financialProgressPercentage)}</td><td><span class="table-actions"><button class="table-action" data-action="open-project" data-project-id="${project.projectId}">Abrir</button><button class="table-action" data-action="edit-project" data-project-id="${project.projectId}">Editar</button><button class="table-action danger" data-action="delete-project" data-project-id="${project.projectId}">Eliminar</button></span></td></tr>`).join("");
    document.querySelector("#projectsEmpty").hidden = rows.length > 0;
    setMessage(message, rows.length ? "Consulta actualizada." : "");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar los proyectos.", true);
  }
}

function readProjectForm() {
  return {
    costCenter: document.querySelector("#projectCostCenter").value,
    name: document.querySelector("#projectName").value,
    clientName: document.querySelector("#projectClient").value,
    municipality: document.querySelector("#projectMunicipality").value,
    serviceType: document.querySelector("#projectServiceType").value,
    powerKwp: document.querySelector("#projectPower").value === "" ? null : document.querySelector("#projectPower").value,
    status: document.querySelector("#projectStatus").value,
    startDate: document.querySelector("#projectStartDate").value || null,
    endDate: document.querySelector("#projectEndDate").value || null,
    notes: document.querySelector("#projectNotes").value
  };
}

function openNewProject() {
  document.querySelector("#projectForm").reset();
  document.querySelector("#projectId").value = "";
  document.querySelector("#projectDialogTitle").textContent = "Nuevo proyecto";
  setMessage(document.querySelector("#projectFormMessage"));
  projectDialog.showModal();
}

async function openEditProject(projectId) {
  const project = await (await ensureGateway()).getProject(projectId);
  document.querySelector("#projectId").value = project.id;
  document.querySelector("#projectCostCenter").value = project.costCenter;
  document.querySelector("#projectName").value = project.name;
  document.querySelector("#projectClient").value = project.clientName || "";
  document.querySelector("#projectMunicipality").value = project.municipality;
  document.querySelector("#projectServiceType").value = project.serviceType;
  document.querySelector("#projectPower").value = project.powerKwp ?? "";
  document.querySelector("#projectStatus").value = project.status;
  document.querySelector("#projectStartDate").value = project.startDate || "";
  document.querySelector("#projectEndDate").value = project.endDate || "";
  document.querySelector("#projectNotes").value = project.notes || "";
  document.querySelector("#projectDialogTitle").textContent = "Editar proyecto";
  setMessage(document.querySelector("#projectFormMessage"));
  projectDialog.showModal();
}

async function saveProject(event) {
  event.preventDefault();
  const id = document.querySelector("#projectId").value;
  const button = document.querySelector("#saveProjectButton");
  const message = document.querySelector("#projectFormMessage");
  setBusy(button, true, "Guardando…");
  setMessage(message);
  try {
    const data = await ensureGateway();
    if (id) await data.updateProject(id, readProjectForm());
    else await data.createProject(readProjectForm());
    projectDialog.close();
    await loadReferenceData();
    renderDashboard();
    await loadProjects();
    setMessage(document.querySelector("#projectModuleMessage"), id ? "Proyecto actualizado correctamente." : "Proyecto creado correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible guardar el proyecto.", true);
  } finally {
    setBusy(button, false);
  }
}

async function deleteProject(projectId) {
  const project = currentProjects.find((item) => item.projectId === projectId);
  if (!window.confirm(`¿Eliminar el proyecto ${project?.projectName ?? "seleccionado"}? Esta acción solo procede si no tiene movimientos relacionados.`)) return;
  const message = document.querySelector("#projectModuleMessage");
  try {
    await (await ensureGateway()).removeProject(projectId);
    await loadReferenceData();
    renderDashboard();
    await loadProjects();
    setMessage(message, "Proyecto eliminado correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible eliminar el proyecto.", true);
  }
}

async function openProjectDetail(projectId) {
  selectedProjectId = projectId;
  const project = await (await ensureGateway()).getProjectSummary(projectId);
  document.querySelector("#detailCostCenter").textContent = project.costCenter;
  document.querySelector("#detailProjectName").textContent = project.projectName;
  document.querySelector("#detailProjectStatus").textContent = capitalize(project.status);
  document.querySelector("#detailServiceType").textContent = project.serviceType;
  document.querySelector("#detailMunicipality").textContent = project.municipality;
  document.querySelector("#detailContractValue").textContent = formatCop(project.contractValue);
  document.querySelector("#detailFinancialProgress").textContent = formatPercent(project.financialProgressPercentage);
  document.querySelector("#detailPaymentPending").textContent = formatCop(project.paymentPending);
  document.querySelector("#detailInvoiced").textContent = formatCop(project.totalInvoiced);
  document.querySelector("#detailPaid").textContent = formatCop(project.totalPaid);
  document.querySelector("#detailCosts").textContent = formatCop(project.totalCostsExpenses);
  document.querySelector("#detailContractBalance").textContent = formatCop(project.contractualBalance);
  document.querySelector("#detailProgressLabel").textContent = formatPercent(project.financialProgressPercentage);
  document.querySelector("#detailProgressBar").style.width = `${Math.min(100, Math.max(0, project.financialProgressPercentage))}%`;
  await showView("detail");
}

function populateProjectOptions() {
  const options = currentProjects.map((project) => `<option value="${project.projectId}">${escapeHtml(project.costCenter)} · ${escapeHtml(project.projectName)}</option>`).join("");
  const filter = document.querySelector("#costFilterProject");
  const form = document.querySelector("#costProject");
  const selectedFilter = filter.value;
  filter.innerHTML = `<option value="">Todos</option>${options}`;
  form.innerHTML = `<option value="">Selecciona un proyecto</option>${options}`;
  filter.value = currentProjects.some((item) => item.projectId === selectedFilter) ? selectedFilter : "";
}

function periodLabel(period) {
  return `${monthNames[period.month - 1]} ${period.year}${period.status === "cerrado" ? " · Cerrado" : ""}`;
}

function populatePeriodOptions() {
  const options = currentPeriods.map((period) => `<option value="${period.id}" ${period.status === "cerrado" ? "disabled" : ""}>${escapeHtml(periodLabel(period))}</option>`).join("");
  const allOptions = currentPeriods.map((period) => `<option value="${period.id}">${escapeHtml(periodLabel(period))}</option>`).join("");
  const filter = document.querySelector("#costFilterPeriod");
  const form = document.querySelector("#costPeriod");
  const selectedFilter = filter.value;
  filter.innerHTML = `<option value="">Todos</option>${allOptions}`;
  form.innerHTML = `<option value="">Selecciona un periodo abierto</option>${options}`;
  filter.value = currentPeriods.some((item) => item.id === selectedFilter) ? selectedFilter : "";
  const activePeriod = currentPeriods.find((period) => period.status === "abierto") ?? currentPeriods[0];
  const activeSelect = document.querySelector("#activePeriodSelect");
  activeSelect.innerHTML = currentPeriods.map((period) => `<option value="${period.id}">${escapeHtml(periodLabel(period))}</option>`).join("");
  if (activePeriod) activeSelect.value = activePeriod.id;
  if (activePeriod) document.querySelector(".period-card strong").textContent = periodLabel(activePeriod).replace(" · Cerrado", "");
}

function costFilters() {
  const dateFrom = document.querySelector("#costFilterFrom").value;
  const dateTo = document.querySelector("#costFilterTo").value;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  return {
    projectId: document.querySelector("#costFilterProject").value,
    periodId: document.querySelector("#costFilterPeriod").value,
    type: document.querySelector("#costFilterType").value,
    category: document.querySelector("#costFilterCategory").value,
    dateFrom,
    dateTo
  };
}

async function loadCosts(filters) {
  const message = document.querySelector("#costModuleMessage");
  setMessage(message, "Consultando movimientos…");
  try {
    currentCosts = await (await ensureGateway()).listCostsExpenses(filters ?? costFilters());
    renderCosts();
    setMessage(message, currentCosts.length ? "Consulta actualizada." : "");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar los costos y gastos.", true);
  }
}

function renderCosts() {
  const totalCosts = currentCosts.filter((item) => item.type === "costo").reduce((sum, item) => sum + item.amount, 0);
  const totalExpenses = currentCosts.filter((item) => item.type === "gasto").reduce((sum, item) => sum + item.amount, 0);
  document.querySelector("#costMovementCount").textContent = currentCosts.length;
  document.querySelector("#costTotalCosts").textContent = formatCop(totalCosts);
  document.querySelector("#costTotalExpenses").textContent = formatCop(totalExpenses);
  document.querySelector("#costGrandTotal").textContent = formatCop(totalCosts + totalExpenses);
  document.querySelector("#costRows").innerHTML = currentCosts.map((movement) => `
    <tr><td>${escapeHtml(formatDate(movement.movementDate))}</td><td><span class="project-name-cell"><strong>${escapeHtml(movement.project?.name || "Proyecto")}</strong><small>${escapeHtml(movement.project?.costCenter || "")}</small></span></td><td><span class="type-badge ${movement.type}">${escapeHtml(movement.type)}</span></td><td>${escapeHtml(movement.category)}</td><td>${escapeHtml(movement.description)}</td><td><span class="reference-cell"><strong>${escapeHtml(movement.supplierName || "Sin proveedor")}</strong><small>${escapeHtml(movement.documentReference || "Sin referencia")}</small></span></td><td class="text-end"><strong>${formatCop(movement.amount)}</strong></td></tr>`).join("");
  document.querySelector("#costsEmpty").hidden = currentCosts.length > 0;
}

function openNewCost() {
  document.querySelector("#costForm").reset();
  populateProjectOptions();
  populatePeriodOptions();
  const activePeriod = currentPeriods.find((period) => period.status === "abierto");
  if (activePeriod) {
    document.querySelector("#costPeriod").value = activePeriod.id;
    const current = new Date().toISOString().slice(0, 10);
    const prefix = `${activePeriod.year}-${String(activePeriod.month).padStart(2, "0")}`;
    document.querySelector("#costDate").value = current.startsWith(prefix) ? current : `${prefix}-01`;
  }
  setMessage(document.querySelector("#costFormMessage"));
  costDialog.showModal();
}

function readCostForm() {
  return {
    projectId: document.querySelector("#costProject").value,
    periodId: document.querySelector("#costPeriod").value,
    type: document.querySelector("#costType").value,
    category: document.querySelector("#costCategory").value,
    description: document.querySelector("#costDescription").value,
    supplierName: document.querySelector("#costSupplier").value,
    documentReference: document.querySelector("#costDocumentReference").value,
    movementDate: document.querySelector("#costDate").value,
    amount: document.querySelector("#costAmount").value,
    supportPath: document.querySelector("#costSupportPath").value
  };
}

async function saveCost(event) {
  event.preventDefault();
  const button = document.querySelector("#saveCostButton");
  const message = document.querySelector("#costFormMessage");
  setBusy(button, true, "Guardando…");
  setMessage(message);
  try {
    await (await ensureGateway()).createCostExpense(readCostForm());
    costDialog.close();
    await loadReferenceData();
    renderDashboard();
    await loadCosts();
    setMessage(document.querySelector("#costModuleMessage"), "Movimiento registrado correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible registrar el movimiento.", true);
  } finally {
    setBusy(button, false);
  }
}

function exportCosts() {
  const headers = ["Fecha", "Centro de costo", "Proyecto", "Tipo", "Categoría", "Descripción", "Proveedor", "Referencia", "Valor COP"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = currentCosts.map((item) => [item.movementDate, item.project?.costCenter, item.project?.name, item.type, item.category, item.description, item.supplierName, item.documentReference, item.amount].map(quote).join(","));
  const blob = new Blob(["\uFEFF", [headers.map(quote).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `costos-gastos-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const message = document.querySelector("#loginMessage");
  if (!email || !password) return setMessage(message, "Completa el correo y la contraseña.", true);
  try {
    setMessage(message, "Validando acceso…");
    await signIn(email, password);
    setMessage(message);
    await openApp();
  } catch (error) {
    setMessage(message, error.message || "No fue posible iniciar sesión.", true);
  }
});

document.querySelector("#demoAccess").hidden = !isDemoMode();
document.querySelector("#demoAccess").addEventListener("click", openApp);
document.querySelector("#logoutButton").addEventListener("click", async () => { await signOut(); closeApp(); });
document.querySelector("#newProjectButton").addEventListener("click", openNewProject);
document.querySelector("#projectForm").addEventListener("submit", saveProject);
document.querySelector("#newCostButton").addEventListener("click", openNewCost);
document.querySelector("#costForm").addEventListener("submit", saveCost);
document.querySelector("#exportCostsButton").addEventListener("click", exportCosts);
document.querySelector("#detailEditProject").addEventListener("click", () => selectedProjectId && openEditProject(selectedProjectId));
document.querySelector("#projectFilters").addEventListener("submit", (event) => { event.preventDefault(); loadProjects(); });
document.querySelector("#clearProjectFilters").addEventListener("click", () => { document.querySelector("#projectFilters").reset(); loadProjects(); });
document.querySelector("#costFilters").addEventListener("submit", (event) => { event.preventDefault(); loadCosts(); });
document.querySelector("#clearCostFilters").addEventListener("click", () => { document.querySelector("#costFilters").reset(); loadCosts({}); });

document.addEventListener("click", async (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) document.querySelector(`#${closeButton.dataset.closeDialog}`).close();
  const action = event.target.closest("[data-action]");
  if (action?.dataset.action === "open-project") await openProjectDetail(action.dataset.projectId);
  if (action?.dataset.action === "edit-project") await openEditProject(action.dataset.projectId);
  if (action?.dataset.action === "delete-project") await deleteProject(action.dataset.projectId);
  const target = event.target.closest("[data-view]");
  if (target) await showView(target.dataset.view);
});

if (new URLSearchParams(location.search).get("demo") === "1" || (isDemoMode() && location.hash === "#dashboard")) openApp();
