import { dashboard as demoDashboard } from "./data/mock-data.js?v=0.6.0";
import { formatCop, paymentPending, safePercent } from "./domain/financial.js?v=0.6.0";
import { createApplicationDataGateway } from "./services/application-data.js?v=0.6.0";
import { isDemoMode, signIn, signOut } from "./services/supabase.js?v=0.6.0";

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const dashboardView = document.querySelector("#dashboardView");
const detailView = document.querySelector("#detailView");
const projectsView = document.querySelector("#projectsView");
const monthlyView = document.querySelector("#monthlyView");
const costsView = document.querySelector("#costsView");
const historyView = document.querySelector("#historyView");
const placeholderView = document.querySelector("#placeholderView");
const title = document.querySelector("#pageTitle");
const breadcrumb = document.querySelector("#breadcrumb");
const projectDialog = document.querySelector("#projectDialog");
const costDialog = document.querySelector("#costDialog");
const periodDialog = document.querySelector("#periodDialog");
const monthlyDialog = document.querySelector("#monthlyDialog");
const historyDialog = document.querySelector("#historyDialog");

const viewLabels = {
  dashboard: "Resumen general",
  projects: "Proyectos",
  monthly: "Seguimiento mensual",
  finance: "Facturación y pagos",
  costs: "Costos y gastos",
  history: "Historial y trazabilidad",
  reports: "Reportes",
  admin: "Administración",
  detail: "Detalle del proyecto"
};


const tableLabels = {
  projects: "Proyectos",
  periods: "Periodos",
  monthly_tracking: "Seguimiento mensual",
  contracts: "Contratos",
  invoices: "Facturación",
  payments: "Pagos",
  costs_expenses: "Costos y gastos"
};
const actionLabels = { INSERT: "Creación", UPDATE: "Modificación", DELETE: "Eliminación" };
const fieldLabels = {
  cost_center: "centro de costo", name: "nombre", status: "estado",
  contract_value: "valor contractual", recognized_value: "valor reconocido",
  invoiced_value: "valor facturado", paid_value: "valor pagado",
  validation_status: "estado de validación", amount: "valor",
  movement_type: "tipo de movimiento", category: "categoría",
  observations: "observaciones", closed_at: "fecha de cierre"
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
let currentMonthly = [];
let currentAudit = [];

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

function formatDateTime(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CO", {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota"
  }).format(new Date(value));
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

  const visible = {
    dashboard: dashboardView, detail: detailView, projects: projectsView,
    monthly: monthlyView, costs: costsView, history: historyView
  };
  [dashboardView, detailView, projectsView, monthlyView, costsView, historyView, placeholderView]
    .forEach((element) => { element.hidden = true; });
  (visible[view] ?? placeholderView).hidden = false;
  title.textContent = viewLabels[view] ?? "Control Solar Demo";
  breadcrumb.textContent = view === "detail" ? "PROYECTOS / DETALLE" : (viewLabels[view] ?? view).toUpperCase();
  if (!placeholderView.hidden) document.querySelector("#placeholderTitle").textContent = `${viewLabels[view]} preparado`;
  history.replaceState({}, "", `#${view}`);

  if (view === "projects") await loadProjects();
  if (view === "monthly") await loadMonthlyModule();
  if (view === "costs") await loadCosts();
  if (view === "history") await loadHistory();
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

function normalizeSearch(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

function closeGlobalSearch() {
  const input = document.querySelector("#globalSearchInput");
  const results = document.querySelector("#globalSearchResults");
  results.hidden = true;
  input.setAttribute("aria-expanded", "false");
}

function resetGlobalSearch() {
  const input = document.querySelector("#globalSearchInput");
  input.value = "";
  document.querySelector("#clearGlobalSearch").hidden = true;
  document.querySelector("#globalSearchResults").innerHTML = "";
  closeGlobalSearch();
}

function renderGlobalSearch() {
  const input = document.querySelector("#globalSearchInput");
  const clearButton = document.querySelector("#clearGlobalSearch");
  const results = document.querySelector("#globalSearchResults");
  const term = normalizeSearch(input.value);
  clearButton.hidden = !term;

  if (!term) {
    results.innerHTML = "";
    closeGlobalSearch();
    return;
  }

  const matches = currentProjects.filter((project) => normalizeSearch([
    project.costCenter, project.projectName, project.municipality,
    project.serviceType, project.contractNumber, project.status
  ].join(" ")).includes(term)).slice(0, 8);

  results.hidden = false;
  input.setAttribute("aria-expanded", "true");
  results.innerHTML = matches.length ? matches.map((project) => `
    <button class="global-search-result" type="button" data-action="open-global-project" data-project-id="${project.projectId}">
      <span><strong>${escapeHtml(project.projectName)}</strong><small>${escapeHtml(project.costCenter)} · ${escapeHtml(project.municipality)}</small></span>
      <span class="status-badge ${escapeHtml(project.status)}">${escapeHtml(capitalize(project.status))}</span>
    </button>`).join("") : `<div class="global-search-empty">No se encontraron proyectos para “${escapeHtml(input.value.trim())}”.</div>`;
}

function selectedOptionText(selector) {
  const element = document.querySelector(selector);
  if (!element?.value) return "";
  return element.selectedOptions?.[0]?.textContent?.trim() ?? "";
}

function renderActiveFilters(selector, entries) {
  const container = document.querySelector(selector);
  const active = entries.filter(([, value]) => String(value ?? "").trim());
  container.hidden = active.length === 0;
  container.innerHTML = active.length
    ? `<span class="active-filter-label">Filtros activos:</span>${active.map(([label, value]) =>
        `<span class="active-filter-chip"><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)}</span>`
      ).join("")}`
    : "";
}

function projectFilters() {
  return {
    name: document.querySelector("#projectFilterName").value,
    costCenter: document.querySelector("#projectFilterCenter").value,
    municipality: document.querySelector("#projectFilterMunicipality").value,
    status: document.querySelector("#projectFilterStatus").value
  };
}

function renderProjectOverview() {
  const counts = currentProjects.reduce((summary, project) => {
    summary.total += 1;
    if (project.status === "activo") summary.active += 1;
    if (project.status === "planeado") summary.planned += 1;
    if (project.status === "finalizado") summary.finished += 1;
    return summary;
  }, { total: 0, active: 0, planned: 0, finished: 0 });

  document.querySelector("#projectTotalCount").textContent = counts.total;
  document.querySelector("#projectActiveCount").textContent = counts.active;
  document.querySelector("#projectPlannedCount").textContent = counts.planned;
  document.querySelector("#projectFinishedCount").textContent = counts.finished;
}

async function loadProjects(filters = projectFilters()) {
  const message = document.querySelector("#projectModuleMessage");
  renderProjectOverview();
  renderActiveFilters("#projectActiveFilters", [
    ["Proyecto o cliente:", filters.name],
    ["Centro de costo:", filters.costCenter],
    ["Municipio:", filters.municipality],
    ["Estado:", filters.status ? capitalize(filters.status) : ""]
  ]);
  setMessage(message, "Consultando proyectos…");
  try {
    const rows = await (await ensureGateway()).listProjects(filters);
    document.querySelector("#projectResultCount").textContent = rows.length;
    document.querySelector("#projectsManagementRows").innerHTML = rows.map((project) => `
      <tr><td><strong>${escapeHtml(project.costCenter)}</strong></td><td><span class="project-name-cell"><strong>${escapeHtml(project.projectName)}</strong><small>${escapeHtml(project.contractNumber || "Sin contrato registrado")}</small></span></td><td>${escapeHtml(project.municipality)}</td><td>${escapeHtml(project.serviceType)}</td><td><span class="status-badge ${escapeHtml(project.status)}">${escapeHtml(capitalize(project.status))}</span></td><td>${formatPercent(project.financialProgressPercentage)}</td><td><span class="table-actions"><button class="table-action" type="button" data-action="open-project" data-project-id="${project.projectId}">Abrir</button><button class="table-action" type="button" data-action="edit-project" data-project-id="${project.projectId}">Editar</button><button class="table-action danger" type="button" data-action="delete-project" data-project-id="${project.projectId}">Eliminar</button></span></td></tr>`).join("");
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
  const data = await ensureGateway();
  const [project, projectRecord] = await Promise.all([
    data.getProjectSummary(projectId),
    data.getProject(projectId)
  ]);

  document.querySelector("#detailCostCenter").textContent = project.costCenter;
  document.querySelector("#detailProjectName").textContent = project.projectName;
  const status = document.querySelector("#detailProjectStatus");
  status.textContent = capitalize(project.status);
  status.className = `status-badge ${project.status}`;
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

  document.querySelector("#detailClient").textContent = projectRecord.clientName || "Sin registrar";
  document.querySelector("#detailContractNumber").textContent = project.contractNumber || "Sin registrar";
  document.querySelector("#detailPower").textContent = projectRecord.powerKwp === null ? "Sin registrar" : `${projectRecord.powerKwp.toLocaleString("es-CO")} kWp`;
  document.querySelector("#detailStartDate").textContent = formatDate(projectRecord.startDate);
  document.querySelector("#detailEndDate").textContent = formatDate(projectRecord.endDate);
  document.querySelector("#detailNotes").textContent = projectRecord.notes || "Sin observaciones";

  await showView("detail");
}

function setSelectOptions(select, firstOption, options, selectedValue = "") {
  select.innerHTML = `${firstOption}${options}`;
  if ([...select.options].some((option) => option.value === selectedValue && !option.disabled)) select.value = selectedValue;
}

function populateProjectOptions() {
  const options = currentProjects.map((project) => `<option value="${project.projectId}">${escapeHtml(project.costCenter)} · ${escapeHtml(project.projectName)}</option>`).join("");
  const contractOptions = currentProjects.filter((project) => project.contractId).map((project) => `<option value="${project.projectId}">${escapeHtml(project.costCenter)} · ${escapeHtml(project.projectName)}</option>`).join("");
  ["costFilterProject", "monthlyFilterProject", "historyFilterProject"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    setSelectOptions(select, '<option value="">Todos</option>', options, select.value);
  });
  setSelectOptions(document.querySelector("#costProject"), '<option value="">Selecciona un proyecto</option>', options);
  setSelectOptions(document.querySelector("#monthlyProject"), '<option value="">Selecciona un proyecto con contrato</option>', contractOptions);
}

function periodLabel(period) {
  return `${monthNames[period.month - 1]} ${period.year}${period.status === "cerrado" ? " · Cerrado" : ""}`;
}

function populatePeriodOptions() {
  const openOptions = currentPeriods.map((period) => `<option value="${period.id}" ${period.status === "cerrado" ? "disabled" : ""}>${escapeHtml(periodLabel(period))}</option>`).join("");
  const allOptions = currentPeriods.map((period) => `<option value="${period.id}">${escapeHtml(periodLabel(period))}</option>`).join("");
  ["costFilterPeriod", "monthlyFilterPeriod"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    setSelectOptions(select, '<option value="">Todos</option>', allOptions, select.value);
  });
  setSelectOptions(document.querySelector("#costPeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);
  setSelectOptions(document.querySelector("#monthlyPeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);

  const activePeriod = currentPeriods.find((period) => period.status === "abierto") ?? currentPeriods[0];
  const activeSelect = document.querySelector("#activePeriodSelect");
  setSelectOptions(activeSelect, "", allOptions, activePeriod?.id ?? "");
  if (activePeriod) {
    document.querySelector(".period-card strong").textContent = periodLabel(activePeriod).replace(" · Cerrado", "");
    document.querySelector(".period-card span").innerHTML = activePeriod.status === "abierto"
      ? "<i></i> Habilitado para registros"
      : "<i></i> No hay periodo abierto";
  }
}

function monthlyFilters() {
  return {
    projectId: document.querySelector("#monthlyFilterProject").value,
    periodId: document.querySelector("#monthlyFilterPeriod").value,
    validationStatus: document.querySelector("#monthlyFilterStatus").value
  };
}

function renderPeriods() {
  const hasOpen = currentPeriods.some((period) => period.status === "abierto");
  document.querySelector("#periodCount").textContent = currentPeriods.length;
  document.querySelector("#openPeriodCount").textContent = currentPeriods.filter((period) => period.status === "abierto").length;
  document.querySelector("#periodRows").innerHTML = currentPeriods.map((period) => {
    const action = period.status === "abierto"
      ? `<button class="table-action" data-action="close-period" data-period-id="${period.id}">Cerrar periodo</button>`
      : `<button class="table-action" data-action="reopen-period" data-period-id="${period.id}" ${!hasOpen ? "" : 'disabled title="Cierra el periodo actual antes de reabrir este"'}>Reabrir</button>`;
    return `<tr><td><strong>${escapeHtml(periodLabel(period).replace(" · Cerrado", ""))}</strong></td><td><span class="period-badge ${period.status}">${capitalize(period.status)}</span></td><td>${period.closedAt ? escapeHtml(formatDateTime(period.closedAt)) : "—"}</td><td>${action}</td></tr>`;
  }).join("");
}

function renderMonthly() {
  document.querySelector("#monthlyRows").innerHTML = currentMonthly.map((tracking) => {
    const locked = tracking.periodStatus === "cerrado";
    const canValidate = !locked && tracking.validationStatus !== "validado";
    const actions = tracking.trackingId
      ? `<button class="table-action" data-action="edit-monthly" data-tracking-id="${tracking.trackingId}" ${locked ? "disabled" : ""}>Editar</button>${canValidate ? `<button class="table-action success" data-action="validate-monthly" data-tracking-id="${tracking.trackingId}">Validar</button>` : ""}`
      : `<button class="table-action" data-action="new-monthly-preset" data-project-id="${tracking.projectId}" data-period-id="${tracking.periodId}" ${locked ? "disabled" : ""}>Completar</button>`;
    return `<tr>
      <td>${escapeHtml(`${monthNames[tracking.month - 1]} ${tracking.year}`)}<br><small>${capitalize(tracking.periodStatus)}</small></td>
      <td><span class="project-name-cell"><strong>${escapeHtml(tracking.projectName)}</strong><small>${escapeHtml(tracking.costCenter)}</small></span></td>
      <td><strong>${formatCop(tracking.invoicedValue)}</strong></td>
      <td>${formatPercent(tracking.monthlyProgressPercentage)}</td>
      <td>${formatPercent(tracking.cumulativeProgressPercentage)}</td>
      <td>${formatCop(tracking.costsExpensesValue)}</td>
      <td><span class="validation-badge ${escapeHtml(tracking.validationStatus || "borrador")}">${escapeHtml(tracking.validationStatus || "sin registro")}</span></td>
      <td><span class="table-actions">${actions}</span></td>
    </tr>`;
  }).join("");
  document.querySelector("#monthlyEmpty").hidden = currentMonthly.length > 0;
}

async function loadMonthlyModule(filters) {
  const message = document.querySelector("#monthlyModuleMessage");
  setMessage(message, "Consultando seguimiento mensual…");
  try {
    const appliedFilters = filters ?? monthlyFilters();
    renderActiveFilters("#monthlyActiveFilters", [
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#monthlyFilterProject") : ""],
      ["Periodo:", appliedFilters.periodId ? selectedOptionText("#monthlyFilterPeriod") : ""],
      ["Validación:", appliedFilters.validationStatus ? selectedOptionText("#monthlyFilterStatus") : ""]
    ]);
    const data = await ensureGateway();
    const filtered = Object.values(appliedFilters).some(Boolean);
    const [allRows, shownRows] = await Promise.all([
      data.listMonthlyTracking({}),
      filtered ? data.listMonthlyTracking(appliedFilters) : data.listMonthlyTracking({})
    ]);
    currentMonthly = shownRows;
    document.querySelector("#monthlyCount").textContent = allRows.length;
    document.querySelector("#monthlyPendingCount").textContent = allRows.filter((row) => row.validationStatus !== "validado").length;
    renderPeriods();
    renderMonthly();
    setMessage(message, shownRows.length ? "Consulta actualizada." : "");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar el seguimiento mensual.", true);
  }
}

function openNewPeriod() {
  document.querySelector("#periodForm").reset();
  const newest = currentPeriods[0];
  const nextDate = newest ? new Date(Date.UTC(newest.year, newest.month, 1)) : new Date();
  document.querySelector("#periodYear").value = nextDate.getUTCFullYear();
  document.querySelector("#periodMonth").value = nextDate.getUTCMonth() + 1;
  setMessage(document.querySelector("#periodFormMessage"));
  periodDialog.showModal();
}

async function savePeriod(event) {
  event.preventDefault();
  const button = document.querySelector("#savePeriodButton");
  const message = document.querySelector("#periodFormMessage");
  setBusy(button, true, "Creando…");
  setMessage(message);
  try {
    await (await ensureGateway()).createPeriod({
      year: document.querySelector("#periodYear").value,
      month: document.querySelector("#periodMonth").value
    });
    periodDialog.close();
    await loadReferenceData();
    await loadMonthlyModule();
    setMessage(document.querySelector("#periodModuleMessage"), "Periodo creado y habilitado para registros.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible crear el periodo.", true);
  } finally {
    setBusy(button, false);
  }
}

async function closePeriod(periodId) {
  const period = currentPeriods.find((item) => item.id === periodId);
  if (!window.confirm(`¿Cerrar ${period ? periodLabel(period) : "el periodo"}? Después del cierre no se admitirán cambios financieros.`)) return;
  const message = document.querySelector("#periodModuleMessage");
  try {
    await (await ensureGateway()).closePeriod(periodId);
    await loadReferenceData();
    await loadMonthlyModule();
    setMessage(message, "Periodo cerrado. Sus registros quedaron protegidos.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible cerrar el periodo.", true);
  }
}

async function reopenPeriod(periodId) {
  const period = currentPeriods.find((item) => item.id === periodId);
  if (!window.confirm(`¿Reabrir ${period ? periodLabel(period).replace(" · Cerrado", "") : "el periodo"}? La acción quedará registrada en el historial.`)) return;
  const message = document.querySelector("#periodModuleMessage");
  try {
    await (await ensureGateway()).reopenPeriod(periodId);
    await loadReferenceData();
    await loadMonthlyModule();
    setMessage(message, "Periodo reabierto y habilitado para ajustes.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible reabrir el periodo.", true);
  }
}

function openNewMonthly(projectId = "", periodId = "") {
  document.querySelector("#monthlyForm").reset();
  document.querySelector("#monthlyTrackingId").value = "";
  document.querySelector("#monthlyDialogTitle").textContent = "Registrar seguimiento";
  populateProjectOptions();
  populatePeriodOptions();
  const activePeriod = currentPeriods.find((period) => period.status === "abierto");
  if (activePeriod) document.querySelector("#monthlyPeriod").value = activePeriod.id;
  if (projectId) document.querySelector("#monthlyProject").value = projectId;
  if (periodId) document.querySelector("#monthlyPeriod").value = periodId;
  setMessage(document.querySelector("#monthlyFormMessage"));
  monthlyDialog.showModal();
}

function openEditMonthly(trackingId) {
  const tracking = currentMonthly.find((item) => item.trackingId === trackingId);
  if (!tracking) return;
  document.querySelector("#monthlyForm").reset();
  populateProjectOptions();
  populatePeriodOptions();
  document.querySelector("#monthlyTrackingId").value = tracking.trackingId;
  document.querySelector("#monthlyProject").value = tracking.projectId;
  document.querySelector("#monthlyPeriod").value = tracking.periodId;
  document.querySelector("#monthlyValidationStatus").value = tracking.validationStatus === "validado" ? "pendiente" : tracking.validationStatus;
  document.querySelector("#monthlyRecognizedValue").value = tracking.recognizedValue;
  document.querySelector("#monthlyObservations").value = tracking.observations || "";
  document.querySelector("#monthlyDialogTitle").textContent = "Editar seguimiento";
  setMessage(document.querySelector("#monthlyFormMessage"));
  monthlyDialog.showModal();
}

function readMonthlyForm() {
  const projectId = document.querySelector("#monthlyProject").value;
  const project = currentProjects.find((item) => item.projectId === projectId);
  return {
    projectId,
    contractId: project?.contractId ?? "",
    periodId: document.querySelector("#monthlyPeriod").value,
    recognizedValue: document.querySelector("#monthlyRecognizedValue").value,
    validationStatus: document.querySelector("#monthlyValidationStatus").value,
    observations: document.querySelector("#monthlyObservations").value
  };
}

async function saveMonthly(event) {
  event.preventDefault();
  const button = document.querySelector("#saveMonthlyButton");
  const message = document.querySelector("#monthlyFormMessage");
  const trackingId = document.querySelector("#monthlyTrackingId").value;
  setBusy(button, true, "Guardando…");
  setMessage(message);
  try {
    await (await ensureGateway()).saveMonthlyTracking({ ...readMonthlyForm(), trackingId: trackingId || null });
    monthlyDialog.close();
    await loadMonthlyModule();
    setMessage(document.querySelector("#monthlyModuleMessage"), trackingId ? "Seguimiento actualizado." : "Seguimiento mensual registrado.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible guardar el seguimiento.", true);
  } finally {
    setBusy(button, false);
  }
}

async function validateMonthly(trackingId) {
  if (!window.confirm("¿Validar este seguimiento mensual? La aprobación quedará registrada en el historial.")) return;
  const message = document.querySelector("#monthlyModuleMessage");
  try {
    await (await ensureGateway()).validateMonthlyTracking(trackingId);
    await loadMonthlyModule();
    setMessage(message, "Seguimiento mensual validado correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible validar el seguimiento.", true);
  }
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
    const appliedFilters = filters ?? costFilters();
    renderActiveFilters("#costActiveFilters", [
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#costFilterProject") : ""],
      ["Periodo:", appliedFilters.periodId ? selectedOptionText("#costFilterPeriod") : ""],
      ["Tipo:", appliedFilters.type ? capitalize(appliedFilters.type) : ""],
      ["Categoría:", appliedFilters.category],
      ["Desde:", appliedFilters.dateFrom ? formatDate(appliedFilters.dateFrom) : ""],
      ["Hasta:", appliedFilters.dateTo ? formatDate(appliedFilters.dateTo) : ""]
    ]);
    currentCosts = await (await ensureGateway()).listCostsExpenses(appliedFilters);
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

function historyFilters() {
  const dateFrom = document.querySelector("#historyFilterFrom").value;
  const dateTo = document.querySelector("#historyFilterTo").value;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  return {
    projectId: document.querySelector("#historyFilterProject").value,
    tableName: document.querySelector("#historyFilterTable").value,
    action: document.querySelector("#historyFilterAction").value,
    dateFrom, dateTo
  };
}

function projectNameForEvent(event) {
  const project = currentProjects.find((item) => item.projectId === event.projectId);
  return project ? `${project.costCenter} · ${project.projectName}` : "Evento general";
}

function changedFields(event) {
  if (event.action !== "UPDATE") return [];
  const ignored = new Set(["id", "created_at", "updated_at", "updated_by", "created_by"]);
  const keys = new Set([...Object.keys(event.oldData ?? {}), ...Object.keys(event.newData ?? {})]);
  return [...keys].filter((key) => !ignored.has(key) && JSON.stringify(event.oldData?.[key]) !== JSON.stringify(event.newData?.[key]));
}

function auditSummary(event) {
  const moduleName = (tableLabels[event.tableName] ?? event.tableName).toLocaleLowerCase("es");
  if (event.action === "INSERT") return `Se creó un registro en ${moduleName}.`;
  if (event.action === "DELETE") return `Se eliminó un registro de ${moduleName}.`;
  const fields = changedFields(event).map((field) => fieldLabels[field] ?? field.replaceAll("_", " "));
  return fields.length ? `Se modificó: ${fields.slice(0, 3).join(", ")}${fields.length > 3 ? ` y ${fields.length - 3} campo(s) más` : ""}.` : `Se actualizó un registro de ${moduleName}.`;
}

function renderHistory() {
  document.querySelector("#historyCount").textContent = currentAudit.length;
  document.querySelector("#historyRows").innerHTML = currentAudit.map((event) => `
    <tr><td>${escapeHtml(formatDateTime(event.changedAt))}</td><td>${escapeHtml(projectNameForEvent(event))}</td><td>${escapeHtml(tableLabels[event.tableName] ?? event.tableName)}</td><td><span class="history-action ${event.action.toLocaleLowerCase()}">${escapeHtml(actionLabels[event.action] ?? event.action)}</span></td><td>${escapeHtml(auditSummary(event))}</td><td><button class="table-action" data-action="view-history" data-history-id="${escapeHtml(event.id)}">Ver cambio</button></td></tr>`).join("");
  document.querySelector("#historyEmpty").hidden = currentAudit.length > 0;
}

async function loadHistory(filters) {
  const message = document.querySelector("#historyModuleMessage");
  setMessage(message, "Consultando historial…");
  try {
    const appliedFilters = filters ?? historyFilters();
    renderActiveFilters("#historyActiveFilters", [
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#historyFilterProject") : ""],
      ["Módulo:", appliedFilters.tableName ? selectedOptionText("#historyFilterTable") : ""],
      ["Acción:", appliedFilters.action ? selectedOptionText("#historyFilterAction") : ""],
      ["Desde:", appliedFilters.dateFrom ? formatDate(appliedFilters.dateFrom) : ""],
      ["Hasta:", appliedFilters.dateTo ? formatDate(appliedFilters.dateTo) : ""]
    ]);
    currentAudit = await (await ensureGateway()).listAudit(appliedFilters);
    renderHistory();
    setMessage(message, currentAudit.length ? "Consulta actualizada." : "");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar el historial.", true);
  }
}

function openHistoryDetail(historyId) {
  const event = currentAudit.find((item) => item.id === historyId);
  if (!event) return;
  const before = event.oldData ? JSON.stringify(event.oldData, null, 2) : "No aplica";
  const after = event.newData ? JSON.stringify(event.newData, null, 2) : "No aplica";
  document.querySelector("#historyDetail").innerHTML = `
    <div class="history-detail-summary">
      <div><span>Fecha y hora</span><strong>${escapeHtml(formatDateTime(event.changedAt))}</strong></div>
      <div><span>Módulo</span><strong>${escapeHtml(tableLabels[event.tableName] ?? event.tableName)}</strong></div>
      <div><span>Acción</span><strong>${escapeHtml(actionLabels[event.action] ?? event.action)}</strong></div>
    </div>
    <p>${escapeHtml(auditSummary(event))}</p>
    <div class="history-json-grid">
      <section><h4>Antes</h4><pre>${escapeHtml(before)}</pre></section>
      <section><h4>Después</h4><pre>${escapeHtml(after)}</pre></section>
    </div>`;
  historyDialog.showModal();
}

function exportHistory() {
  const headers = ["Fecha y hora", "Proyecto", "Módulo", "Acción", "Descripción", "ID de registro"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = currentAudit.map((event) => [
    event.changedAt, projectNameForEvent(event), tableLabels[event.tableName] ?? event.tableName,
    actionLabels[event.action] ?? event.action, auditSummary(event), event.recordId
  ].map(quote).join(","));
  const blob = new Blob(["\uFEFF", [headers.map(quote).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `historial-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
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

const globalSearchInput = document.querySelector("#globalSearchInput");
globalSearchInput.addEventListener("input", renderGlobalSearch);
globalSearchInput.addEventListener("focus", renderGlobalSearch);
globalSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    resetGlobalSearch();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    document.querySelector("#globalSearchResults [data-action='open-global-project']")?.click();
  }
});
document.querySelector("#clearGlobalSearch").addEventListener("click", () => {
  resetGlobalSearch();
  globalSearchInput.focus();
});

document.querySelector("#demoAccess").hidden = !isDemoMode();
document.querySelector("#demoAccess").addEventListener("click", openApp);
document.querySelector("#logoutButton").addEventListener("click", async () => { await signOut(); closeApp(); });
document.querySelector("#newProjectButton").addEventListener("click", openNewProject);
document.querySelector("#projectForm").addEventListener("submit", saveProject);
document.querySelector("#newPeriodButton").addEventListener("click", openNewPeriod);
document.querySelector("#periodForm").addEventListener("submit", savePeriod);
document.querySelector("#newMonthlyButton").addEventListener("click", () => openNewMonthly());
document.querySelector("#monthlyForm").addEventListener("submit", saveMonthly);
document.querySelector("#newCostButton").addEventListener("click", openNewCost);
document.querySelector("#costForm").addEventListener("submit", saveCost);
document.querySelector("#exportCostsButton").addEventListener("click", exportCosts);
document.querySelector("#exportHistoryButton").addEventListener("click", exportHistory);
document.querySelector("#detailEditProject").addEventListener("click", () => selectedProjectId && openEditProject(selectedProjectId));
document.querySelector("#projectFilters").addEventListener("submit", (event) => { event.preventDefault(); loadProjects(); });
document.querySelector("#clearProjectFilters").addEventListener("click", () => { document.querySelector("#projectFilters").reset(); loadProjects(); });
document.querySelector("#monthlyFilters").addEventListener("submit", (event) => { event.preventDefault(); loadMonthlyModule(); });
document.querySelector("#clearMonthlyFilters").addEventListener("click", () => { document.querySelector("#monthlyFilters").reset(); loadMonthlyModule({}); });
document.querySelector("#costFilters").addEventListener("submit", (event) => { event.preventDefault(); loadCosts(); });
document.querySelector("#clearCostFilters").addEventListener("click", () => { document.querySelector("#costFilters").reset(); loadCosts({}); });
document.querySelector("#historyFilters").addEventListener("submit", (event) => { event.preventDefault(); loadHistory(); });
document.querySelector("#clearHistoryFilters").addEventListener("click", () => { document.querySelector("#historyFilters").reset(); loadHistory({}); });
document.querySelector("#activePeriodSelect").addEventListener("change", (event) => {
  document.querySelector("#monthlyFilterPeriod").value = event.target.value;
  showView("monthly");
});

document.addEventListener("click", async (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) document.querySelector(`#${closeButton.dataset.closeDialog}`).close();

  const projectTab = event.target.closest("[data-project-tab]");
  if (projectTab && selectedProjectId) {
    const targetView = projectTab.dataset.projectTab;
    const filter = document.querySelector(targetView === "costs" ? "#costFilterProject" : targetView === "monthly" ? "#monthlyFilterProject" : "#historyFilterProject");
    if (filter) filter.value = selectedProjectId;
    await showView(targetView);
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action?.dataset.action === "open-global-project") {
    const projectId = action.dataset.projectId;
    resetGlobalSearch();
    await openProjectDetail(projectId);
    return;
  }
  if (!event.target.closest(".global-search")) closeGlobalSearch();
  if (action?.dataset.action === "open-project") await openProjectDetail(action.dataset.projectId);
  if (action?.dataset.action === "edit-project") await openEditProject(action.dataset.projectId);
  if (action?.dataset.action === "delete-project") await deleteProject(action.dataset.projectId);
  if (action?.dataset.action === "close-period") await closePeriod(action.dataset.periodId);
  if (action?.dataset.action === "reopen-period") await reopenPeriod(action.dataset.periodId);
  if (action?.dataset.action === "edit-monthly") openEditMonthly(action.dataset.trackingId);
  if (action?.dataset.action === "new-monthly-preset") openNewMonthly(action.dataset.projectId, action.dataset.periodId);
  if (action?.dataset.action === "validate-monthly") await validateMonthly(action.dataset.trackingId);
  if (action?.dataset.action === "view-history") openHistoryDetail(action.dataset.historyId);

  const target = event.target.closest("[data-view]");
  if (target) await showView(target.dataset.view);
});

if (new URLSearchParams(location.search).get("demo") === "1" || (isDemoMode() && location.hash === "#dashboard")) openApp();
