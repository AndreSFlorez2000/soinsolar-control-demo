import { buildMonthlySeries, calculateDashboardIndicators } from "./domain/dashboard.js?v=1.4.1";
import { calculateProjectIndicators } from "./domain/project-analytics.js?v=1.4.1";
import { buildManagementReport } from "./domain/reports.js?v=1.4.1";
import { canEditExecution } from "./domain/execution.js?v=1.3.0";
import { formatCop, paymentPending, safePercent } from "./domain/financial.js?v=1.1.0";
import { createApplicationDataGateway } from "./services/application-data.js?v=1.4.1";
import { getCurrentSession, isDemoMode, registerAccount, signIn, signOut } from "./services/supabase.js?v=1.4.0";

const loginView = document.querySelector("#loginView");
const pendingView = document.querySelector("#pendingView");
const appView = document.querySelector("#appView");
const dashboardView = document.querySelector("#dashboardView");
const detailView = document.querySelector("#detailView");
const projectsView = document.querySelector("#projectsView");
const monthlyView = document.querySelector("#monthlyView");
const financeView = document.querySelector("#financeView");
const costsView = document.querySelector("#costsView");
const reportsView = document.querySelector("#reportsView");
const historyView = document.querySelector("#historyView");
const adminView = document.querySelector("#adminView");
const title = document.querySelector("#pageTitle");
const breadcrumb = document.querySelector("#breadcrumb");
const projectDialog = document.querySelector("#projectDialog");
const costDialog = document.querySelector("#costDialog");
const periodDialog = document.querySelector("#periodDialog");
const monthlyDialog = document.querySelector("#monthlyDialog");
const reportProgressDialog = document.querySelector("#reportProgressDialog");
const contractDialog = document.querySelector("#contractDialog");
const invoiceDialog = document.querySelector("#invoiceDialog");
const paymentDialog = document.querySelector("#paymentDialog");
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
  costs_expenses: "Costos y gastos",
  profiles: "Usuarios"
};
const actionLabels = { INSERT: "Creación", UPDATE: "Modificación", DELETE: "Eliminación" };
const fieldLabels = {
  cost_center: "centro de costo", name: "nombre", status: "estado",
  contract_value: "valor contractual",
  executed_cumulative_percentage: "avance de ejecución",
  invoiced_value: "valor facturado", paid_value: "valor pagado",
  validation_status: "estado de validación", amount: "valor",
  movement_type: "tipo de movimiento", category: "categoría",
  observations: "observaciones", closed_at: "fecha de cierre",
  full_name: "nombre", role: "rol", active: "estado de acceso",
  contract_number: "número de contrato", initial_value: "valor inicial",
  additions_value: "adiciones", deductions_value: "deducciones",
  invoice_number: "número de factura", payment_reference: "referencia de pago"
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
let allMonthlyRows = [];
let currentAudit = [];
let currentInvoices = [];
let currentPayments = [];
let balancePayments = [];
let currentProfiles = [];
let currentUserProfile = null;
let currentReport = buildManagementReport([]);
let reportProgressProjectId = null;
let reportProgressPeriodId = null;
let selectedProjectMonthly = [];
let selectedProjectHistory = [];
let dashboardChart = null;
let projectChart = null;

const functionalViews = new Set(["dashboard", "projects", "monthly", "finance", "costs", "reports", "history", "admin"]);

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
  return `${Number(value ?? 0).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
}

function formatExecutionPercent(value) {
  return value === null ? "Sin registrar" : formatPercent(value);
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

async function uploadSelectedSupport(projectId, category, fileInput) {
  const file = fileInput?.files?.[0];
  if (!file) return null;
  return (await ensureGateway()).uploadSupport({ projectId, category, file });
}

async function openSupport(path) {
  try {
    const url = await (await ensureGateway()).getSupportUrl(path);
    if (!url) {
      window.alert("En la demostración el soporte se simula, pero no se publica ni se descarga.");
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.click();
  } catch (error) {
    window.alert(error.message || "No fue posible abrir el soporte.");
  }
}

function supportAction(path) {
  if (!path) return "<span class=\"support-missing\">Sin soporte</span>";
  return `<button class="table-action support-action" type="button" data-action="open-support" data-support-path="${escapeHtml(path)}">Ver soporte</button>`;
}

async function ensureGateway() {
  if (!gateway) gateway = await createApplicationDataGateway();
  return gateway;
}

async function loadReferenceData() {
  const data = await ensureGateway();
  currentUserProfile = await data.getCurrentProfile();
  if (!currentUserProfile?.active) {
    const error = new Error("La cuenta aún no tiene permisos.");
    error.code = "APP_ACCESS_PENDING";
    throw error;
  }
  [currentProjects, currentPeriods, allMonthlyRows] = await Promise.all([
    data.listProjects(),
    data.listPeriods(),
    data.listMonthlyTracking({})
  ]);
  currentMonthly = allMonthlyRows;
  const name = currentUserProfile.fullName || "Usuario autorizado";
  document.querySelector("#currentUserName").textContent = name;
  document.querySelector("#currentUserRole").textContent = currentUserProfile.role === "administrador" ? "Administrador" : "Gerencia";
  document.querySelector("#currentUserAvatar").textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  const openPeriod = currentPeriods.find((period) => period.status === "abierto");
  document.querySelector("#sidebarPeriodLabel").textContent = openPeriod
    ? `${monthNames[openPeriod.month - 1]} ${openPeriod.year}` : "Sin periodo abierto";
  document.querySelector("#sidebarPeriodStatus").textContent = `${currentPeriods.length} periodo(s) registrado(s)`;
  populateProjectOptions();
  populatePeriodOptions();
  const mayEdit = canEditExecution(currentUserProfile);
  document.querySelector("#newMonthlyButton").disabled = !mayEdit;
  document.querySelector("#newMonthlyButton").title = mayEdit ? "" : "Solo el administrador puede registrar el avance de ejecución.";
  document.querySelector("#monthlyExecutionPercentage").disabled = !mayEdit;
  document.querySelector("#reportProgressValue").disabled = !mayEdit;
}

window.SOINSOLAR_APP_API = Object.freeze({
  gateway: ensureGateway,
  projects: () => [...currentProjects],
  periods: () => [...currentPeriods],
  monthly: () => [...allMonthlyRows],
  visibleMonthly: () => [...currentMonthly],
  reloadReferenceData: loadReferenceData
});

function routeFromHash() {
  const hash = location.hash.replace(/^#/, "");
  if (hash.startsWith("detail/")) {
    const projectId = decodeURIComponent(hash.slice("detail/".length));
    return projectId ? { view: "detail", projectId } : { view: "dashboard" };
  }
  return { view: functionalViews.has(hash) ? hash : "dashboard" };
}

function updateSystemStatus() {
  const badge = document.querySelector("#systemModeBadge");
  badge.textContent = isDemoMode() ? "Demo local" : "Datos conectados";
  badge.classList.toggle("connected", !isDemoMode());
  document.querySelector("#lastSyncLabel").textContent = `Actualizado ${new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date())}`;
}

async function openApp() {
  const loginMessage = document.querySelector("#loginMessage");
  try {
    await ensureGateway();
    await loadReferenceData();
    loginView.hidden = true;
    pendingView.hidden = true;
    appView.hidden = false;
    updateSystemStatus();
    const route = routeFromHash();
    if (route.view === "detail" && currentProjects.some((project) => project.projectId === route.projectId)) {
      await openProjectDetail(route.projectId);
    } else {
      await showView(route.view === "detail" ? "dashboard" : route.view);
    }
  } catch (error) {
    if (error.code === "APP_ACCESS_PENDING") showPending();
    else setMessage(loginMessage, error.message || "No fue posible cargar la aplicación.", true);
  }
}

function closeApp() {
  appView.hidden = true;
  pendingView.hidden = true;
  loginView.hidden = false;
  gateway = null;
  currentUserProfile = null;
  currentProjects = [];
  currentPeriods = [];
  currentMonthly = [];
  allMonthlyRows = [];
  currentProfiles = [];
  selectedProjectId = null;
  selectedProjectMonthly = [];
  selectedProjectHistory = [];
  if (projectChart) {
    projectChart.destroy();
    projectChart = null;
  }
  document.querySelector("#loginForm").reset();
  document.querySelector("#registrationForm").reset();
  document.querySelector("#loginForm").hidden = false;
  document.querySelector("#registrationForm").hidden = true;
  document.querySelector("#backToLogin").hidden = true;
  document.querySelector("#showRegistration").hidden = isDemoMode();
}

function showPending() {
  closeApp();
  loginView.hidden = true;
  pendingView.hidden = false;
  setMessage(document.querySelector("#pendingMessage"));
}

async function showView(requestedView) {
  const view = requestedView === "detail" && selectedProjectId
    ? "detail"
    : functionalViews.has(requestedView) ? requestedView : "dashboard";

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view || (view === "detail" && button.dataset.view === "projects"));
  });

  const visible = {
    dashboard: dashboardView, detail: detailView, projects: projectsView,
    monthly: monthlyView, finance: financeView, costs: costsView,
    reports: reportsView, history: historyView, admin: adminView
  };
  Object.values(visible).forEach((element) => { element.hidden = true; });
  visible[view].hidden = false;
  title.textContent = viewLabels[view];
  breadcrumb.textContent = view === "detail" ? "PROYECTOS / DETALLE" : viewLabels[view].toUpperCase();
  history.replaceState({}, "", view === "detail" ? `#detail/${encodeURIComponent(selectedProjectId)}` : `#${view}`);

  if (view === "dashboard") renderDashboard();
  if (view === "projects") await loadProjects();
  if (view === "monthly") await loadMonthlyModule();
  if (view === "finance") await loadFinance();
  if (view === "costs") await loadCosts();
  if (view === "reports") await loadReports();
  if (view === "history") await loadHistory();
  if (view === "admin") await loadProfiles();
}

async function refreshApplication() {
  const button = document.querySelector("#refreshAppButton");
  setBusy(button, true, "Actualizando…");
  try {
    const route = routeFromHash();
    await loadReferenceData();
    if (route.view === "detail" && currentProjects.some((project) => project.projectId === route.projectId)) {
      await openProjectDetail(route.projectId);
    } else {
      await showView(route.view === "detail" ? "dashboard" : route.view);
    }
    updateSystemStatus();
  } catch (error) {
    if (error.code === "APP_ACCESS_PENDING") showPending();
    else window.alert(error.message || "No fue posible actualizar la información.");
  } finally {
    setBusy(button, false);
  }
}

function renderDashboard() {
  const indicators = calculateDashboardIndicators(currentProjects);

  document.querySelector("#contractValue").textContent = formatCop(indicators.contractValue);
  document.querySelector("#invoicedValue").textContent = formatCop(indicators.invoiced);
  document.querySelector("#paidValue").textContent = formatCop(indicators.paid);
  document.querySelector("#costValue").textContent = formatCop(indicators.costsExpenses);
  document.querySelector("#activeProjectKpi").textContent = `${indicators.activeProjects} proyecto(s) activo(s)`;
  document.querySelector("#invoicedRatioText").textContent = `${formatPercent(indicators.financialProgress)} del valor contractual`;
  document.querySelector("#receivableValue").textContent = `${formatCop(indicators.paymentPending)} por cobrar`;
  document.querySelector("#costRatio").textContent = `${formatPercent(indicators.costRatio)} del contrato`;
  document.querySelector("#contractualBalanceValue").textContent = formatCop(indicators.contractualBalance);
  document.querySelector("#paymentPendingValue").textContent = formatCop(indicators.paymentPending);
  document.querySelector("#globalProgressValue").textContent = formatPercent(indicators.financialProgress);
  document.querySelector("#globalExecutionValue").textContent = formatExecutionPercent(indicators.executionProgress);
  document.querySelector("#projectCountValue").textContent = indicators.projectCount;

  renderProjectStatusStats(indicators);
  renderDashboardAlerts(indicators);

  document.querySelector("#projectRows").innerHTML = [...currentProjects]
    .sort((left, right) => right.financialProgressPercentage - left.financialProgressPercentage)
    .slice(0, 5)
    .map((project) => `
      <tr>
        <td>${escapeHtml(project.costCenter)}</td><td><strong>${escapeHtml(project.projectName)}</strong></td><td>${escapeHtml(project.municipality)}</td>
        <td>${formatExecutionPercent(project.executedProgressPercentage)}</td><td>${formatPercent(project.financialProgressPercentage)}</td><td>${formatCop(project.contractualBalance)}</td>
        <td><button class="open-project" type="button" data-action="open-project" data-project-id="${project.projectId}">Abrir</button></td>
      </tr>`).join("");
  renderChart();
}


function renderProjectStatusStats(indicators) {
  const order = [
    ["activo", "Activos"], ["planeado", "Planeados"], ["suspendido", "Suspendidos"],
    ["finalizado", "Finalizados"], ["cancelado", "Cancelados"]
  ];
  const total = Math.max(indicators.projectCount, 1);
  document.querySelector("#projectStatusStats").innerHTML = order.map(([status, label]) => {
    const count = indicators.statusCounts[status];
    const percentage = (count / total) * 100;
    return `<div class="status-stat"><div><span>${label}</span><strong>${count}</strong></div><div class="status-stat-track"><span class="${status}" style="width:${percentage}%"></span></div></div>`;
  }).join("");
}

function renderDashboardAlerts(indicators) {
  const openPeriod = currentPeriods.find((period) => period.status === "abierto");
  const pendingValidation = currentMonthly.filter((row) => row.validationStatus && row.validationStatus !== "validado").length;
  const alerts = [];

  if (indicators.paymentPending > 0) {
    alerts.push(["red", "Pagos pendientes", `${formatCop(indicators.paymentPending)} facturados sin pago registrado`]);
  }
  if (openPeriod) {
    alerts.push(["gold", `${periodLabel(openPeriod)} está abierto`, "Los movimientos del periodo todavía pueden actualizarse"]);
  }
  if (pendingValidation > 0) {
    alerts.push(["blue", `${pendingValidation} seguimiento(s) por validar`, "Revisar antes de cerrar el periodo"]);
  }

  document.querySelector("#dashboardAlerts").innerHTML = alerts.length
    ? alerts.slice(0, 3).map(([color, titleText, detail]) =>
        `<div class="alert-row"><span class="alert-dot ${color}"></span><div><strong>${escapeHtml(titleText)}</strong><small>${escapeHtml(detail)}</small></div></div>`
      ).join("")
    : '<div class="dashboard-ok">No hay alertas generales con la información disponible.</div>';
}

function renderChart() {
  const canvas = document.querySelector("#monthlyChart");
  const fallback = document.querySelector("#chartFallback");
  const series = buildMonthlySeries(currentMonthly, 6);
  document.querySelector("#monthlySeriesDescription").textContent = series.length
    ? `Últimos ${series.length} periodo(s) con movimientos`
    : "Sin periodos con movimientos";

  if (dashboardChart) {
    dashboardChart.destroy();
    dashboardChart = null;
  }

  if (!series.length) {
    canvas.hidden = true;
    fallback.style.display = "grid";
    fallback.innerHTML = '<div class="chart-empty">No existen movimientos mensuales para representar.</div>';
    return;
  }

  const labels = series.map((row) => `${monthNames[row.month - 1].slice(0, 3)} ${row.year}`);
  const invoiced = series.map((row) => row.invoiced / 1000000);
  const paid = series.map((row) => row.paid / 1000000);
  const costs = series.map((row) => row.costsExpenses / 1000000);

  if (!window.Chart) {
    canvas.hidden = true;
    fallback.style.display = "flex";
    const maximum = Math.max(...invoiced, ...paid, ...costs, 1);
    fallback.innerHTML = labels.map((label, index) => `
      <div class="month">
        <span style="height:${Math.max(3, invoiced[index] / maximum * 100)}%;background:#337fbc"></span>
        <span style="height:${Math.max(3, paid[index] / maximum * 100)}%;background:#2f8f59"></span>
        <span style="height:${Math.max(3, costs[index] / maximum * 100)}%;background:#edaf25"></span>
        <label>${escapeHtml(label)}</label>
      </div>`).join("");
    return;
  }

  fallback.style.display = "none";
  fallback.innerHTML = "";
  canvas.hidden = false;
  dashboardChart = new window.Chart(canvas, {
    type: "bar",
    data: { labels, datasets: [
      { label: "Facturación", data: invoiced, backgroundColor: "#337fbc", borderRadius: 4 },
      { label: "Pagos", data: paid, backgroundColor: "#2f8f59", borderRadius: 4 },
      { label: "Costos y gastos", data: costs, backgroundColor: "#edaf25", borderRadius: 4 }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (value) => `$${value} M` }, grid: { color: "#edf2f6" } }
      }
    }
  });
}



function exportDashboard() {
  const indicators = calculateDashboardIndicators(currentProjects);
  const rows = [
    ["Indicador", "Valor"],
    ["Proyectos registrados", indicators.projectCount],
    ["Proyectos activos", indicators.activeProjects],
    ["Valor contractual vigente", indicators.contractValue],
    ["Total facturado", indicators.invoiced],
    ["Total pagado", indicators.paid],
    ["Costos y gastos", indicators.costsExpenses],
    ["Saldo contractual", indicators.contractualBalance],
    ["Pago pendiente", indicators.paymentPending],
    ["Promedio de avance de proyectos (%)", indicators.executionProgress ?? ""],
    ["Avance financiero global (%)", indicators.financialProgress],
    ["Relación costos / contrato (%)", indicators.costRatio]
  ];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const blob = new Blob(["\uFEFF", rows.map((row) => row.map(quote).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `indicadores-generales-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
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
    project.serviceType, project.contractNumber, project.clientName, project.status
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

function renderActiveFilters(selector, entries, formId) {
  const container = document.querySelector(selector);
  const active = entries.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  container.hidden = active.length === 0;
  container.innerHTML = active.length
    ? `<span class="active-filter-label">Filtros activos:</span>${active.map(([label, value, targetId]) =>
        `<button class="active-filter-chip" type="button" data-filter-target="${escapeHtml(targetId)}" data-filter-form="${escapeHtml(formId)}" aria-label="Quitar filtro ${escapeHtml(label)}"><strong>${escapeHtml(label)}</strong> ${escapeHtml(value)} <span aria-hidden="true">×</span></button>`
      ).join("")}`
    : "";
}

function projectFilters() {
  const progressMinText = document.querySelector("#projectFilterProgressMin").value;
  const progressMaxText = document.querySelector("#projectFilterProgressMax").value;
  const progressMin = progressMinText === "" ? null : Number(progressMinText);
  const progressMax = progressMaxText === "" ? null : Number(progressMaxText);

  if (progressMin !== null && (!Number.isFinite(progressMin) || progressMin < 0 || progressMin > 100)) {
    throw new Error("El avance mínimo debe estar entre 0 y 100.");
  }
  if (progressMax !== null && (!Number.isFinite(progressMax) || progressMax < 0 || progressMax > 100)) {
    throw new Error("El avance máximo debe estar entre 0 y 100.");
  }
  if (progressMin !== null && progressMax !== null && progressMin > progressMax) {
    throw new Error("El avance mínimo no puede ser mayor que el avance máximo.");
  }

  return {
    name: document.querySelector("#projectFilterName").value,
    costCenter: document.querySelector("#projectFilterCenter").value,
    municipality: document.querySelector("#projectFilterMunicipality").value,
    status: document.querySelector("#projectFilterStatus").value,
    serviceType: document.querySelector("#projectFilterService").value,
    progressMin,
    progressMax
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

async function loadProjects(filters) {
  const message = document.querySelector("#projectModuleMessage");
  renderProjectOverview();
  setMessage(message, "Consultando proyectos…");
  try {
    const appliedFilters = filters ?? projectFilters();
    renderActiveFilters("#projectActiveFilters", [
      ["Proyecto o cliente:", appliedFilters.name, "projectFilterName"],
      ["Centro de costo:", appliedFilters.costCenter, "projectFilterCenter"],
      ["Municipio:", appliedFilters.municipality, "projectFilterMunicipality"],
      ["Estado:", appliedFilters.status ? capitalize(appliedFilters.status) : "", "projectFilterStatus"],
      ["Tipo de servicio:", appliedFilters.serviceType, "projectFilterService"],
      ["Avance financiero mínimo:", appliedFilters.progressMin === null ? "" : formatPercent(appliedFilters.progressMin), "projectFilterProgressMin"],
      ["Avance financiero máximo:", appliedFilters.progressMax === null ? "" : formatPercent(appliedFilters.progressMax), "projectFilterProgressMax"]
    ], "projectFilters");

    const rows = await (await ensureGateway()).listProjects(appliedFilters);
    document.querySelector("#projectResultCount").textContent = rows.length;
    document.querySelector("#projectsManagementRows").innerHTML = rows.map((project) => `
      <tr><td><strong>${escapeHtml(project.costCenter)}</strong></td><td><span class="project-name-cell"><strong>${escapeHtml(project.projectName)}</strong><small>${escapeHtml(project.contractNumber || "Sin contrato registrado")}</small></span></td><td>${escapeHtml(project.municipality)}</td><td>${escapeHtml(project.serviceType)}</td><td><span class="status-badge ${escapeHtml(project.status)}">${escapeHtml(capitalize(project.status))}</span></td><td>${formatExecutionPercent(project.executedProgressPercentage)}</td><td>${formatPercent(project.financialProgressPercentage)}</td><td><span class="table-actions"><button class="table-action" type="button" data-action="open-project" data-project-id="${project.projectId}">Abrir</button><button class="table-action" type="button" data-action="edit-project" data-project-id="${project.projectId}">Editar</button><button class="table-action danger" type="button" data-action="delete-project" data-project-id="${project.projectId}">Eliminar</button></span></td></tr>`).join("");
    document.querySelector("#projectsEmpty").hidden = rows.length > 0;
    setMessage(message, rows.length ? "Consulta actualizada." : "");
  } catch (error) {
    document.querySelector("#projectResultCount").textContent = "0";
    document.querySelector("#projectsManagementRows").innerHTML = "";
    document.querySelector("#projectsEmpty").hidden = false;
    setMessage(message, error.message || "No fue posible consultar los proyectos.", true);
  }
}

function populateParentProjectOptions(selected = "", excludedProjectId = "") {
  const options = currentProjects
    .filter((project) => project.projectId !== excludedProjectId)
    .sort((a, b) => a.costCenter.localeCompare(b.costCenter, "es"))
    .map((project) => "<option value=\"" + project.projectId + "\">" + escapeHtml(project.costCenter) + " · " + escapeHtml(project.projectName) + "</option>")
    .join("");
  setSelectOptions(document.querySelector("#projectParentProject"), '<option value="">Sin centro principal</option>', options, selected);
}

function readProjectForm() {
  return {
    costCenter: document.querySelector("#projectCostCenter").value,
    parentProjectId: document.querySelector("#projectParentProject").value || null,
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
  populateParentProjectOptions();
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
  populateParentProjectOptions(project.parentProjectId || "", project.id);
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

function renderProjectHistory() {
  const events = [...selectedProjectHistory]
    .sort((left, right) => new Date(right.changedAt) - new Date(left.changedAt))
    .slice(0, 5);
  document.querySelector("#projectHistoryRows").innerHTML = events.map((event) => `
    <tr>
      <td>${escapeHtml(formatDateTime(event.changedAt))}</td>
      <td>${escapeHtml(tableLabels[event.tableName] ?? event.tableName)}</td>
      <td><span class="history-action ${event.action.toLocaleLowerCase()}">${escapeHtml(actionLabels[event.action] ?? event.action)}</span></td>
      <td>${escapeHtml(auditSummary(event))}</td>
    </tr>`).join("");
  document.querySelector("#projectHistoryEmpty").hidden = events.length > 0;
}

function renderProjectChart() {
  const canvas = document.querySelector("#projectMonthlyChart");
  const fallback = document.querySelector("#projectChartFallback");
  const series = buildMonthlySeries(selectedProjectMonthly, 12);
  document.querySelector("#projectMonthlyDescription").textContent = series.length
    ? `Últimos ${series.length} periodo(s) con movimientos, valores en millones de pesos`
    : "Sin periodos con movimientos";

  if (projectChart) {
    projectChart.destroy();
    projectChart = null;
  }

  if (!series.length) {
    canvas.hidden = true;
    fallback.style.display = "grid";
    fallback.innerHTML = '<div class="chart-empty">No existen movimientos mensuales para representar.</div>';
    return;
  }

  const labels = series.map((row) => `${monthNames[row.month - 1].slice(0, 3)} ${row.year}`);
  const invoiced = series.map((row) => row.invoiced / 1000000);
  const paid = series.map((row) => row.paid / 1000000);
  const costs = series.map((row) => row.costsExpenses / 1000000);

  if (!window.Chart) {
    canvas.hidden = true;
    fallback.style.display = "flex";
    const maximum = Math.max(...invoiced, ...paid, ...costs, 1);
    fallback.innerHTML = labels.map((label, index) => `
      <div class="month">
        <span style="height:${Math.max(3, invoiced[index] / maximum * 100)}%;background:#337fbc"></span>
        <span style="height:${Math.max(3, paid[index] / maximum * 100)}%;background:#2f8f59"></span>
        <span style="height:${Math.max(3, costs[index] / maximum * 100)}%;background:#edaf25"></span>
        <label>${escapeHtml(label)}</label>
      </div>`).join("");
    return;
  }

  fallback.style.display = "none";
  fallback.innerHTML = "";
  canvas.hidden = false;
  projectChart = new window.Chart(canvas, {
    type: "line",
    data: { labels, datasets: [
      { label: "Facturación", data: invoiced, borderColor: "#337fbc", backgroundColor: "#337fbc", tension: .28 },
      { label: "Pagos", data: paid, borderColor: "#2f8f59", backgroundColor: "#2f8f59", tension: .28 },
      { label: "Costos y gastos", data: costs, borderColor: "#edaf25", backgroundColor: "#edaf25", tension: .28 }
    ] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 7 } } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { callback: (value) => `$${value} M` }, grid: { color: "#edf2f6" } }
      }
    }
  });
}

function renderProjectAnalytics(project) {
  const indicators = calculateProjectIndicators(project, selectedProjectMonthly);
  document.querySelector("#projectPaymentCompliance").textContent = formatPercent(indicators.paymentCompliance);
  document.querySelector("#projectCostExecution").textContent = formatPercent(indicators.costExecution);
  document.querySelector("#projectActiveMonths").textContent = indicators.activeMonths;
  document.querySelector("#projectPendingValidations").textContent = indicators.pendingValidations;
  renderProjectChart();
  renderProjectHistory();
}

async function openProjectDetail(projectId) {
  selectedProjectId = projectId;
  const data = await ensureGateway();
  const [project, projectRecord, monthlyRows, auditRows] = await Promise.all([
    data.getProjectSummary(projectId),
    data.getProject(projectId),
    data.listMonthlyTracking({ projectId }),
    data.listAudit({ projectId })
  ]);
  selectedProjectMonthly = monthlyRows;
  selectedProjectHistory = auditRows;

  document.querySelector("#detailCostCenter").textContent = project.costCenter;
  document.querySelector("#detailProjectName").textContent = project.projectName;
  const status = document.querySelector("#detailProjectStatus");
  status.textContent = capitalize(project.status);
  status.className = `status-badge ${project.status}`;
  document.querySelector("#detailServiceType").textContent = project.serviceType;
  document.querySelector("#detailMunicipality").textContent = project.municipality;
  document.querySelector("#detailContractValue").textContent = formatCop(project.contractValue);
  document.querySelector("#detailProjectProgress").textContent = formatExecutionPercent(project.executedProgressPercentage);
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

  renderProjectAnalytics(project);
  await showView("detail");
}

function updateContractCurrentValue() {
  const initial = Number(document.querySelector("#contractInitialValue").value || 0);
  const additions = Number(document.querySelector("#contractAdditionsValue").value || 0);
  const deductions = Number(document.querySelector("#contractDeductionsValue").value || 0);
  document.querySelector("#contractCurrentValue").value = formatCop(Math.max(initial + additions - deductions, 0));
}

async function openContractDialog() {
  if (!selectedProjectId) return;
  const data = await ensureGateway();
  const [project, contracts] = await Promise.all([
    data.getProject(selectedProjectId),
    data.listContracts(selectedProjectId)
  ]);
  const contract = contracts[0] ?? null;
  document.querySelector("#contractForm").reset();
  document.querySelector("#contractId").value = contract?.id ?? "";
  document.querySelector("#contractProjectId").value = selectedProjectId;
  document.querySelector("#contractProjectLabel").value = `${project.costCenter} · ${project.name}`;
  document.querySelector("#contractDialogTitle").textContent = contract ? "Actualizar contrato" : "Registrar contrato";
  document.querySelector("#contractNumber").value = contract?.contractNumber ?? "";
  document.querySelector("#contractStatus").value = contract?.status ?? "vigente";
  document.querySelector("#contractInitialValue").value = contract?.initialValue ?? "";
  document.querySelector("#contractAdditionsValue").value = contract?.additionsValue ?? 0;
  document.querySelector("#contractDeductionsValue").value = contract?.deductionsValue ?? 0;
  document.querySelector("#contractStartDate").value = contract?.startDate ?? project.startDate ?? "";
  document.querySelector("#contractEndDate").value = contract?.endDate ?? project.endDate ?? "";
  setMessage(document.querySelector("#contractFormMessage"));
  updateContractCurrentValue();
  contractDialog.showModal();
}

async function saveContract(event) {
  event.preventDefault();
  const button = document.querySelector("#saveContractButton");
  const message = document.querySelector("#contractFormMessage");
  const contractId = document.querySelector("#contractId").value;
  const input = {
    projectId: document.querySelector("#contractProjectId").value,
    contractNumber: document.querySelector("#contractNumber").value,
    status: document.querySelector("#contractStatus").value,
    initialValue: document.querySelector("#contractInitialValue").value,
    additionsValue: document.querySelector("#contractAdditionsValue").value || 0,
    deductionsValue: document.querySelector("#contractDeductionsValue").value || 0,
    startDate: document.querySelector("#contractStartDate").value,
    endDate: document.querySelector("#contractEndDate").value
  };
  try {
    setBusy(button, true, "Guardando…");
    const data = await ensureGateway();
    if (contractId) await data.updateContract(contractId, input);
    else await data.createContract(input);
    contractDialog.close();
    await loadReferenceData();
    await openProjectDetail(input.projectId);
  } catch (error) {
    setMessage(message, error.message || "No fue posible guardar el contrato.", true);
  } finally {
    setBusy(button, false);
  }
}

function setSelectOptions(select, firstOption, options, selectedValue = "") {
  select.innerHTML = `${firstOption}${options}`;
  if ([...select.options].some((option) => option.value === selectedValue && !option.disabled)) select.value = selectedValue;
}

function populateProjectOptions() {
  const options = currentProjects.map((project) => `<option value="${project.projectId}">${escapeHtml(project.costCenter)} · ${escapeHtml(project.projectName)}</option>`).join("");
  const contractOptions = currentProjects.filter((project) => project.contractId).map((project) => `<option value="${project.projectId}">${escapeHtml(project.costCenter)} · ${escapeHtml(project.projectName)}</option>`).join("");
  ["costFilterProject", "monthlyFilterProject", "financeFilterProject", "reportFilterProject", "historyFilterProject"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    setSelectOptions(select, '<option value="">Todos</option>', options, select.value);
  });
  setSelectOptions(document.querySelector("#costProject"), '<option value="">Selecciona un proyecto</option>', options);
  setSelectOptions(document.querySelector("#monthlyProject"), '<option value="">Selecciona un proyecto</option>', options);
  setSelectOptions(document.querySelector("#invoiceProject"), '<option value="">Selecciona un proyecto con contrato</option>', contractOptions);
}

function periodLabel(period) {
  return `${monthNames[period.month - 1]} ${period.year}${period.status === "cerrado" ? " · Cerrado" : ""}`;
}

function populatePeriodOptions() {
  const openOptions = currentPeriods.map((period) => `<option value="${period.id}" ${period.status === "cerrado" ? "disabled" : ""}>${escapeHtml(periodLabel(period))}</option>`).join("");
  const allOptions = currentPeriods.map((period) => `<option value="${period.id}">${escapeHtml(periodLabel(period))}</option>`).join("");
  ["costFilterPeriod", "monthlyFilterPeriod", "financeFilterPeriod"].forEach((id) => {
    const select = document.querySelector(`#${id}`);
    setSelectOptions(select, '<option value="">Todos</option>', allOptions, select.value);
  });
  setSelectOptions(document.querySelector("#costPeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);
  setSelectOptions(document.querySelector("#monthlyPeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);
  setSelectOptions(document.querySelector("#invoicePeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);
  setSelectOptions(document.querySelector("#paymentPeriod"), '<option value="">Selecciona un periodo abierto</option>', openOptions);

  const activePeriod = currentPeriods.find((period) => period.status === "abierto") ?? currentPeriods[0];
  const activeSelect = document.querySelector("#activePeriodSelect");
  setSelectOptions(activeSelect, '<option value="" disabled>Sin periodos registrados</option>', allOptions, activePeriod?.id ?? "");
  activeSelect.disabled = currentPeriods.length === 0;
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
    const mayEdit = canEditExecution(currentUserProfile);
    const actions = tracking.trackingId
      ? `${mayEdit ? `<button class="table-action" data-action="edit-monthly" data-tracking-id="${tracking.trackingId}" ${locked ? "disabled" : ""}>Editar</button>` : ""}${canValidate ? `<button class="table-action success" data-action="validate-monthly" data-tracking-id="${tracking.trackingId}">Validar</button>` : ""}`
      : mayEdit ? `<button class="table-action" data-action="new-monthly-preset" data-project-id="${tracking.projectId}" data-period-id="${tracking.periodId}" ${locked ? "disabled" : ""}>Completar</button>` : "Solo administrador";
    return `<tr>
      <td>${escapeHtml(`${monthNames[tracking.month - 1]} ${tracking.year}`)}<br><small>${capitalize(tracking.periodStatus)}</small></td>
      <td><span class="project-name-cell"><strong>${escapeHtml(tracking.projectName)}</strong><small>${escapeHtml(tracking.costCenter)}</small></span></td>
      <td><strong>${formatCop(tracking.invoicedValue)}</strong><br><small>${formatPercent(tracking.monthlyBillingPercentage)} del contrato</small></td>
      <td>${tracking.monthlyProgressPercentage === null ? "—" : formatPercent(tracking.monthlyProgressPercentage)}</td>
      <td>${tracking.cumulativeProgressPercentage === null ? "—" : formatPercent(tracking.cumulativeProgressPercentage)}</td>
      <td>${formatPercent(tracking.cumulativeBillingPercentage)}</td>
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
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#monthlyFilterProject") : "", "monthlyFilterProject"],
      ["Periodo:", appliedFilters.periodId ? selectedOptionText("#monthlyFilterPeriod") : "", "monthlyFilterPeriod"],
      ["Validación:", appliedFilters.validationStatus ? selectedOptionText("#monthlyFilterStatus") : "", "monthlyFilterStatus"]
    ], "monthlyFilters");
    const data = await ensureGateway();
    const filtered = Object.values(appliedFilters).some(Boolean);
    const [allRows, shownRows] = await Promise.all([
      data.listMonthlyTracking({}),
      filtered ? data.listMonthlyTracking(appliedFilters) : data.listMonthlyTracking({})
    ]);
    allMonthlyRows = allRows;
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
  if (!canEditExecution(currentUserProfile)) return;
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
  if (!canEditExecution(currentUserProfile)) return;
  const tracking = currentMonthly.find((item) => item.trackingId === trackingId);
  if (!tracking) return;
  document.querySelector("#monthlyForm").reset();
  populateProjectOptions();
  populatePeriodOptions();
  document.querySelector("#monthlyTrackingId").value = tracking.trackingId;
  document.querySelector("#monthlyProject").value = tracking.projectId;
  document.querySelector("#monthlyPeriod").value = tracking.periodId;
  document.querySelector("#monthlyValidationStatus").value = tracking.validationStatus === "validado" ? "pendiente" : tracking.validationStatus;
  document.querySelector("#monthlyExecutionPercentage").value = tracking.executedCumulativePercentage;
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
    executedCumulativePercentage: document.querySelector("#monthlyExecutionPercentage").value,
    validationStatus: document.querySelector("#monthlyValidationStatus").value,
    observations: document.querySelector("#monthlyObservations").value
  };
}

async function saveMonthly(event) {
  event.preventDefault();
  if (!canEditExecution(currentUserProfile)) return setMessage(document.querySelector("#monthlyFormMessage"), "Solo un administrador puede registrar el avance de ejecución.", true);
  const button = document.querySelector("#saveMonthlyButton");
  const message = document.querySelector("#monthlyFormMessage");
  const trackingId = document.querySelector("#monthlyTrackingId").value;
  setBusy(button, true, "Guardando…");
  setMessage(message);
  try {
    await (await ensureGateway()).saveMonthlyTracking({ ...readMonthlyForm(), trackingId: trackingId || null });
    monthlyDialog.close();
    await loadReferenceData();
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
    await loadReferenceData();
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
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#costFilterProject") : "", "costFilterProject"],
      ["Periodo:", appliedFilters.periodId ? selectedOptionText("#costFilterPeriod") : "", "costFilterPeriod"],
      ["Tipo:", appliedFilters.type ? capitalize(appliedFilters.type) : "", "costFilterType"],
      ["Categoría:", appliedFilters.category, "costFilterCategory"],
      ["Desde:", appliedFilters.dateFrom ? formatDate(appliedFilters.dateFrom) : "", "costFilterFrom"],
      ["Hasta:", appliedFilters.dateTo ? formatDate(appliedFilters.dateTo) : "", "costFilterTo"]
    ], "costFilters");
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
    <tr><td>${escapeHtml(formatDate(movement.movementDate))}</td><td><span class="project-name-cell"><strong>${escapeHtml(movement.project?.name || "Proyecto")}</strong><small>${escapeHtml(movement.project?.costCenter || "")}</small></span></td><td><span class="type-badge ${movement.type}">${escapeHtml(movement.type)}</span></td><td>${escapeHtml(movement.category)}</td><td>${escapeHtml(movement.description)}</td><td><span class="reference-cell"><strong>${escapeHtml(movement.supplierName || "Sin proveedor")}</strong><small>${escapeHtml(movement.documentReference || "Sin referencia")}</small>${supportAction(movement.supportPath)}</span></td><td class="text-end"><strong>${formatCop(movement.amount)}</strong></td></tr>`).join("");
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
    supportPath: null
  };
}

async function saveCost(event) {
  event.preventDefault();
  const button = document.querySelector("#saveCostButton");
  const message = document.querySelector("#costFormMessage");
  setBusy(button, true, "Guardando…");
  setMessage(message);
  try {
    const input = readCostForm();
    input.supportPath = await uploadSelectedSupport(input.projectId, "costos-gastos", document.querySelector("#costSupportFile"));
    await (await ensureGateway()).createCostExpense(input);
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

function financeFilters() {
  const dateFrom = document.querySelector("#financeFilterFrom").value;
  const dateTo = document.querySelector("#financeFilterTo").value;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("La fecha inicial no puede ser posterior a la fecha final.");
  return {
    projectId: document.querySelector("#financeFilterProject").value,
    periodId: document.querySelector("#financeFilterPeriod").value,
    dateFrom,
    dateTo
  };
}

function invoicePaidAmount(invoiceId, rows = balancePayments) {
  return rows
    .filter((payment) => payment.invoiceId === invoiceId && payment.status !== "anulado")
    .reduce((sum, payment) => sum + payment.amount, 0);
}

function invoicePendingAmount(invoice, rows = balancePayments) {
  return Math.max(invoice.amount - invoicePaidAmount(invoice.id, rows), 0);
}

function populatePaymentInvoiceOptions(selectedInvoiceId = "") {
  const options = currentInvoices
    .filter((invoice) => invoice.status !== "anulada" && invoicePendingAmount(invoice) > 0)
    .map((invoice) => `<option value="${invoice.id}">${escapeHtml(invoice.invoiceNumber)} · ${escapeHtml(invoice.project?.name || "Proyecto")} · saldo ${escapeHtml(formatCop(invoicePendingAmount(invoice)))}</option>`)
    .join("");
  setSelectOptions(document.querySelector("#paymentInvoice"), '<option value="">Selecciona una factura con saldo</option>', options, selectedInvoiceId);
  updatePaymentAvailable();
}

function updatePaymentAvailable() {
  const invoice = currentInvoices.find((item) => item.id === document.querySelector("#paymentInvoice").value);
  document.querySelector("#paymentAvailable").value = invoice ? formatCop(invoicePendingAmount(invoice)) : formatCop(0);
  if (invoice) document.querySelector("#paymentAmount").max = String(invoicePendingAmount(invoice));
  else document.querySelector("#paymentAmount").removeAttribute("max");
}

async function loadFinance(filters) {
  const message = document.querySelector("#financeModuleMessage");
  setMessage(message, "Consultando facturación y pagos…");
  try {
    const applied = filters ?? financeFilters();
    renderActiveFilters("#financeActiveFilters", [
      ["Proyecto:", applied.projectId ? selectedOptionText("#financeFilterProject") : "", "financeFilterProject"],
      ["Periodo:", applied.periodId ? selectedOptionText("#financeFilterPeriod") : "", "financeFilterPeriod"],
      ["Desde:", applied.dateFrom ? formatDate(applied.dateFrom) : "", "financeFilterFrom"],
      ["Hasta:", applied.dateTo ? formatDate(applied.dateTo) : "", "financeFilterTo"]
    ], "financeFilters");
    const data = await ensureGateway();
    [currentInvoices, currentPayments, balancePayments] = await Promise.all([
      data.listInvoices(applied),
      data.listPayments(applied),
      data.listPayments({ projectId: applied.projectId, periodId: applied.periodId })
    ]);
    renderFinance();
    populatePaymentInvoiceOptions();
    setMessage(message, currentInvoices.length || currentPayments.length ? "Consulta actualizada." : "");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar facturas y pagos.", true);
  }
}

function renderFinance() {
  const activeInvoices = currentInvoices.filter((invoice) => invoice.status !== "anulada");
  const activePayments = currentPayments.filter((payment) => payment.status !== "anulado");
  const invoiced = activeInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const paid = activePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const pendingInvoices = activeInvoices.filter((invoice) => invoicePendingAmount(invoice) > 0);

  document.querySelector("#financeInvoicedTotal").textContent = formatCop(invoiced);
  document.querySelector("#financePaidTotal").textContent = formatCop(paid);
  document.querySelector("#financePendingTotal").textContent = formatCop(pendingInvoices.reduce((sum, invoice) => sum + invoicePendingAmount(invoice), 0));
  document.querySelector("#financePendingInvoices").textContent = pendingInvoices.length;

  document.querySelector("#invoiceRows").innerHTML = currentInvoices.map((invoice) => {
    const pending = invoice.status === "anulada" ? 0 : invoicePendingAmount(invoice);
    const canPay = invoice.status !== "anulada" && pending > 0;
    return `<tr>
      <td><span class="reference-cell"><strong>${escapeHtml(invoice.invoiceNumber)}</strong>${supportAction(invoice.supportPath)}</span></td>
      <td>${escapeHtml(formatDate(invoice.issueDate))}</td>
      <td><span class="project-name-cell"><strong>${escapeHtml(invoice.project?.name || "Proyecto")}</strong><small>${escapeHtml(invoice.project?.costCenter || "")}</small></span></td>
      <td>${escapeHtml(invoice.period ? `${monthNames[invoice.period.month - 1]} ${invoice.period.year}` : "Sin periodo")}</td>
      <td><span class="finance-status ${escapeHtml(invoice.status)}">${escapeHtml(invoice.status)}</span></td>
      <td><strong>${formatCop(invoice.amount)}</strong></td>
      <td>${formatCop(pending)}</td>
      <td><button class="table-action success" data-action="register-payment" data-invoice-id="${invoice.id}" ${canPay ? "" : "disabled"}>Registrar pago</button></td>
    </tr>`;
  }).join("");
  document.querySelector("#paymentRows").innerHTML = currentPayments.map((payment) => `<tr>
    <td><span class="reference-cell"><strong>${escapeHtml(payment.paymentReference)}</strong>${supportAction(payment.supportPath)}</span></td>
    <td>${escapeHtml(formatDate(payment.paymentDate))}</td>
    <td>${escapeHtml(payment.invoiceNumber || "Factura")}</td>
    <td><span class="project-name-cell"><strong>${escapeHtml(payment.project?.name || "Proyecto")}</strong><small>${escapeHtml(payment.project?.costCenter || "")}</small></span></td>
    <td>${escapeHtml(payment.period ? `${monthNames[payment.period.month - 1]} ${payment.period.year}` : "Sin periodo")}</td>
    <td><span class="finance-status ${escapeHtml(payment.status)}">${escapeHtml(payment.status)}</span></td>
    <td><strong>${formatCop(payment.amount)}</strong></td>
  </tr>`).join("");
  document.querySelector("#invoiceEmpty").hidden = currentInvoices.length > 0;
  document.querySelector("#paymentEmpty").hidden = currentPayments.length > 0;
}

function setDefaultOpenPeriod(periodSelect, dateInput) {
  const period = currentPeriods.find((item) => item.status === "abierto");
  if (!period) return;
  periodSelect.value = period.id;
  const prefix = `${period.year}-${String(period.month).padStart(2, "0")}`;
  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = today.startsWith(prefix) ? today : `${prefix}-01`;
}

function openNewInvoice(projectId = "") {
  document.querySelector("#invoiceForm").reset();
  populateProjectOptions();
  populatePeriodOptions();
  if (projectId && currentProjects.some((project) => project.projectId === projectId && project.contractId)) {
    document.querySelector("#invoiceProject").value = projectId;
  }
  setDefaultOpenPeriod(document.querySelector("#invoicePeriod"), document.querySelector("#invoiceDate"));
  setMessage(document.querySelector("#invoiceFormMessage"));
  invoiceDialog.showModal();
}

function openNewPayment(invoiceId = "") {
  document.querySelector("#paymentForm").reset();
  populatePeriodOptions();
  populatePaymentInvoiceOptions(invoiceId);
  setDefaultOpenPeriod(document.querySelector("#paymentPeriod"), document.querySelector("#paymentDate"));
  setMessage(document.querySelector("#paymentFormMessage"));
  paymentDialog.showModal();
}

async function saveInvoice(event) {
  event.preventDefault();
  const button = document.querySelector("#saveInvoiceButton");
  const message = document.querySelector("#invoiceFormMessage");
  const project = currentProjects.find((item) => item.projectId === document.querySelector("#invoiceProject").value);
  if (!project?.contractId) return setMessage(message, "Selecciona un proyecto con contrato vigente.", true);
  try {
    setBusy(button, true, "Guardando…");
    const supportPath = await uploadSelectedSupport(project.projectId, "facturas", document.querySelector("#invoiceSupportFile"));
    await (await ensureGateway()).createInvoice({
      projectId: project.projectId,
      contractId: project.contractId,
      periodId: document.querySelector("#invoicePeriod").value,
      invoiceNumber: document.querySelector("#invoiceNumber").value,
      issueDate: document.querySelector("#invoiceDate").value,
      amount: document.querySelector("#invoiceAmount").value,
      status: document.querySelector("#invoiceStatus").value,
      supportPath
    });
    invoiceDialog.close();
    await loadReferenceData();
    await loadFinance();
    setMessage(document.querySelector("#financeModuleMessage"), "Factura registrada correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible registrar la factura.", true);
  } finally {
    setBusy(button, false);
  }
}

async function savePayment(event) {
  event.preventDefault();
  const button = document.querySelector("#savePaymentButton");
  const message = document.querySelector("#paymentFormMessage");
  const invoice = currentInvoices.find((item) => item.id === document.querySelector("#paymentInvoice").value);
  if (!invoice) return setMessage(message, "Selecciona una factura con saldo.", true);
  try {
    setBusy(button, true, "Guardando…");
    const supportPath = await uploadSelectedSupport(invoice.projectId, "pagos", document.querySelector("#paymentSupportFile"));
    await (await ensureGateway()).createPayment({
      invoiceId: invoice.id,
      projectId: invoice.projectId,
      contractId: invoice.contractId,
      periodId: document.querySelector("#paymentPeriod").value,
      paymentReference: document.querySelector("#paymentReference").value,
      paymentDate: document.querySelector("#paymentDate").value,
      amount: document.querySelector("#paymentAmount").value,
      status: document.querySelector("#paymentStatus").value,
      supportPath
    });
    paymentDialog.close();
    await loadReferenceData();
    await loadFinance();
    setMessage(document.querySelector("#financeModuleMessage"), "Pago registrado correctamente.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible registrar el pago.", true);
  } finally {
    setBusy(button, false);
  }
}

function reportFilters() {
  return {
    projectId: document.querySelector("#reportFilterProject").value,
    status: document.querySelector("#reportFilterStatus").value,
    municipality: normalizeSearch(document.querySelector("#reportFilterMunicipality").value)
  };
}

async function loadReports() {
  const filters = reportFilters();
  renderActiveFilters("#reportActiveFilters", [
    ["Proyecto:", filters.projectId ? selectedOptionText("#reportFilterProject") : "", "reportFilterProject"],
    ["Estado:", filters.status ? selectedOptionText("#reportFilterStatus") : "", "reportFilterStatus"],
    ["Municipio:", document.querySelector("#reportFilterMunicipality").value, "reportFilterMunicipality"]
  ], "reportFilters");
  const rows = currentProjects.filter((project) =>
    (!filters.projectId || project.projectId === filters.projectId)
    && (!filters.status || project.status === filters.status)
    && (!filters.municipality || normalizeSearch(project.municipality).includes(filters.municipality))
  );
  currentReport = buildManagementReport(rows);
  renderReports();
}

function renderReports() {
  const totals = currentReport.totals;
  document.querySelector("#reportContractValue").textContent = formatCop(totals.contractValue);
  document.querySelector("#reportInvoiced").textContent = formatCop(totals.invoiced);
  document.querySelector("#reportPaid").textContent = formatCop(totals.paid);
  document.querySelector("#reportCosts").textContent = formatCop(totals.costsExpenses);
  document.querySelector("#reportBalance").textContent = formatCop(totals.contractualBalance);
  document.querySelector("#reportPending").textContent = formatCop(totals.paymentPending);
  document.querySelector("#reportProfitability").textContent = formatCop(totals.profitability);
  document.querySelector("#reportExecution").textContent = formatExecutionPercent(totals.executionProgress);
  document.querySelector("#reportResultCount").textContent = `${totals.projectCount} proyecto(s) · promedio avance físico ${formatExecutionPercent(totals.executionProgress)} · avance financiero ${formatPercent(totals.financialProgress)}`;
  document.querySelector("#reportRows").innerHTML = currentReport.rows.map((row) => `<tr>
    <td>${escapeHtml(row.costCenter)}</td><td>${escapeHtml(row.parentCostCenter || "—")}</td><td><strong>${escapeHtml(row.projectName)}</strong><br><small>${escapeHtml(row.municipality)}</small></td>
    <td>${formatCop(row.contractValue)}</td><td>${formatExecutionPercent(row.executionProgress)}</td><td>${formatCop(row.invoiced)}</td><td>${formatCop(row.paid)}</td>
    <td>${formatCop(row.costsExpenses)}</td><td>${formatCop(row.profitability)}</td><td>${formatCop(row.contractualBalance)}</td><td>${formatCop(row.paymentPending)}</td>
    <td><strong>${formatPercent(row.financialProgress)}</strong></td>
    <td>${canEditExecution(currentUserProfile)
      ? `<button class="table-action" type="button" data-action="edit-report-progress" data-project-id="${escapeHtml(row.projectId)}" aria-label="Actualizar avance de ejecución de ${escapeHtml(row.projectName)}">Editar avance</button>`
      : "Solo administrador"}</td>
  </tr>`).join("");
  document.querySelector("#reportEmpty").hidden = currentReport.rows.length > 0;
}

function reportTracking(projectId, periodId) {
  return allMonthlyRows.find((row) => row.projectId === projectId && row.periodId === periodId && row.trackingId);
}

function openReportProgressEditor(projectId) {
  const message = document.querySelector("#reportModuleMessage");
  setMessage(message);
  if (!canEditExecution(currentUserProfile)) return setMessage(message, "Solo un administrador puede registrar el avance de ejecución.", true);
  const project = currentProjects.find((item) => item.projectId === projectId);
  const period = currentPeriods.find((item) => item.status === "abierto");
  if (!project) return setMessage(message, "No se encontró el proyecto seleccionado.", true);
  if (!period) return setMessage(message, "Abre un periodo en Seguimiento mensual para actualizar el avance de ejecución.", true);

  const existing = reportTracking(projectId, period.id);
  const latest = allMonthlyRows
    .filter((row) => row.projectId === projectId && row.trackingId && row.executedCumulativePercentage !== null)
    .filter((row) => row.year < period.year || (row.year === period.year && row.month <= period.month))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  reportProgressProjectId = projectId;
  reportProgressPeriodId = period.id;
  document.querySelector("#reportProgressForm").reset();
  document.querySelector("#reportProgressContext").textContent = `${project.projectName} · ${periodLabel(period)}`;
  document.querySelector("#reportProgressValue").value = existing?.executedCumulativePercentage ?? latest?.executedCumulativePercentage ?? "";
  document.querySelector("#reportFinancialValue").value = formatPercent(project.financialProgressPercentage);
  const detail = "Registra el estado del trabajo realizado. El porcentaje no depende del contrato, las facturas ni los pagos; no modifica ninguna cifra financiera.";
  document.querySelector("#reportProgressNote").textContent = existing?.validationStatus === "validado"
    ? `${detail} Al guardar, el seguimiento volverá a estar pendiente de validación.`
    : detail;
  setMessage(document.querySelector("#reportProgressMessage"));
  reportProgressDialog.showModal();
  document.querySelector("#reportProgressValue").focus();
}

async function saveReportProgress(event) {
  event.preventDefault();
  if (!canEditExecution(currentUserProfile)) return setMessage(document.querySelector("#reportProgressMessage"), "Solo un administrador puede registrar el avance de ejecución.", true);
  const button = document.querySelector("#saveReportProgressButton");
  const message = document.querySelector("#reportProgressMessage");
  const input = document.querySelector("#reportProgressValue");
  if (!input.checkValidity()) {
    setMessage(message, "Digita el avance de ejecución entre 0 y 100, con hasta dos decimales.", true);
    input.focus();
    return;
  }
  const project = currentProjects.find((item) => item.projectId === reportProgressProjectId);
  const existing = reportTracking(reportProgressProjectId, reportProgressPeriodId);
  setBusy(button, true, "Guardando…");
  setMessage(message);
  let saved = false;
  try {
    await (await ensureGateway()).saveMonthlyTracking({
      projectId: project.projectId,
      contractId: project.contractId,
      periodId: reportProgressPeriodId,
      executedCumulativePercentage: input.value,
      validationStatus: existing?.validationStatus === "borrador" ? "borrador" : "pendiente",
      observations: existing?.observations ?? ""
    });
    saved = true;
    await loadReferenceData();
    await loadReports();
    updateSystemStatus();
    reportProgressDialog.close();
    setMessage(document.querySelector("#reportModuleMessage"), "Avance de ejecución actualizado. El avance financiero continúa calculado desde la facturación.");
  } catch (error) {
    if (saved) {
      reportProgressDialog.close();
      setMessage(document.querySelector("#reportModuleMessage"), "El avance se guardó, pero el reporte no se pudo actualizar. Pulsa Actualizar para ver el resultado.", true);
    } else {
      setMessage(message, error.message || "No fue posible actualizar el avance de ejecución.", true);
    }
  } finally {
    setBusy(button, false);
  }
}

function exportManagementReport() {
  const headers = ["Centro de costo", "Centro principal", "Proyecto", "Municipio", "Estado", "Contrato vigente", "Avance de ejecución %", "Facturado", "Avance financiero %", "Pagado", "Costos y gastos", "Rentabilidad", "Rentabilidad %", "Saldo contractual", "Cartera", "Cobro %", "Costos/contrato %", "Diferencia facturación-costos"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = currentReport.rows.map((row) => [
    row.costCenter, row.parentCostCenter, row.projectName, row.municipality, row.status, row.contractValue,
    row.executionProgress, row.invoiced, row.financialProgress, row.paid, row.costsExpenses,
    row.profitability, row.profitabilityPercentage, row.contractualBalance, row.paymentPending,
    row.collectionRate, row.costRate, row.billingCostDifference
  ].map(quote).join(","));
  const blob = new Blob(["\uFEFF", [headers.map(quote).join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `reporte-gerencial-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function loadProfiles() {
  const message = document.querySelector("#adminModuleMessage");
  setMessage(message, "Consultando usuarios…");
  try {
    const data = await ensureGateway();
    [currentUserProfile, currentProfiles] = await Promise.all([
      data.getCurrentProfile(),
      data.listProfiles()
    ]);
    renderProfiles();
    setMessage(message, currentUserProfile.role === "administrador"
      ? "Administración habilitada."
      : "Consulta de perfil disponible; los cambios requieren rol administrador.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible consultar los usuarios.", true);
  }
}

function renderProfiles() {
  const canAdmin = currentUserProfile?.role === "administrador";
  document.querySelector("#profileTotalCount").textContent = currentProfiles.length;
  document.querySelector("#profileActiveCount").textContent = currentProfiles.filter((profile) => profile.active).length;
  document.querySelector("#profileAdminCount").textContent = currentProfiles.filter((profile) => profile.role === "administrador").length;
  document.querySelector("#profileManagementCount").textContent = currentProfiles.filter((profile) => profile.role === "gerencia").length;
  document.querySelector("#profileRows").innerHTML = currentProfiles.map((profile) => {
    const ownProfile = profile.id === currentUserProfile?.id;
    return `<tr>
      <td><strong>${escapeHtml(profile.fullName)}</strong>${ownProfile ? "<br><small>Sesión actual</small>" : ""}</td>
      <td><select class="form-select form-select-sm" data-profile-role="${profile.id}" ${canAdmin && !ownProfile ? "" : "disabled"}><option value="administrador" ${profile.role === "administrador" ? "selected" : ""}>Administrador</option><option value="gerencia" ${profile.role === "gerencia" ? "selected" : ""}>Gerencia</option></select></td>
      <td><label class="profile-active-control"><input type="checkbox" data-profile-active="${profile.id}" ${profile.active ? "checked" : ""} ${canAdmin && !ownProfile ? "" : "disabled"} /> ${profile.active ? "Activo" : "Inactivo"}</label></td>
      <td>${escapeHtml(formatDateTime(profile.updatedAt || profile.createdAt))}</td>
      <td><button class="table-action" data-action="save-profile" data-profile-id="${profile.id}" ${canAdmin ? "" : "disabled"}>Guardar</button></td>
    </tr>`;
  }).join("");
  document.querySelector("#profileEmpty").hidden = currentProfiles.length > 0;
}

async function saveProfile(profileId) {
  const profile = currentProfiles.find((item) => item.id === profileId);
  if (!profile) return;
  const role = document.querySelector(`[data-profile-role="${profileId}"]`).value;
  const activeControl = document.querySelector(`[data-profile-active="${profileId}"]`);
  try {
    await (await ensureGateway()).updateProfile(profileId, {
      fullName: profile.fullName,
      role,
      active: activeControl.checked
    });
    await loadProfiles();
    setMessage(document.querySelector("#adminModuleMessage"), "Usuario actualizado correctamente.");
  } catch (error) {
    setMessage(document.querySelector("#adminModuleMessage"), error.message || "No fue posible actualizar el usuario.", true);
  }
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
  if (event.tableName === "monthly_tracking") ignored.add("recognized_value");
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
      ["Proyecto:", appliedFilters.projectId ? selectedOptionText("#historyFilterProject") : "", "historyFilterProject"],
      ["Módulo:", appliedFilters.tableName ? selectedOptionText("#historyFilterTable") : "", "historyFilterTable"],
      ["Acción:", appliedFilters.action ? selectedOptionText("#historyFilterAction") : "", "historyFilterAction"],
      ["Desde:", appliedFilters.dateFrom ? formatDate(appliedFilters.dateFrom) : "", "historyFilterFrom"],
      ["Hasta:", appliedFilters.dateTo ? formatDate(appliedFilters.dateTo) : "", "historyFilterTo"]
    ], "historyFilters");
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
    ${event.tableName === "monthly_tracking"
      ? '<p class="dialog-note">El campo técnico histórico recognized_value no representa avance físico y no participa en los cálculos financieros.</p>' : ""}
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

const registrationForm = document.querySelector("#registrationForm");
document.querySelector("#showRegistration").hidden = isDemoMode();
document.querySelector("#showRegistration").addEventListener("click", () => {
  document.querySelector("#loginForm").hidden = true;
  document.querySelector("#showRegistration").hidden = true;
  registrationForm.hidden = false;
  document.querySelector("#backToLogin").hidden = false;
  setMessage(document.querySelector("#registrationMessage"));
});
document.querySelector("#backToLogin").addEventListener("click", () => {
  registrationForm.hidden = true;
  document.querySelector("#backToLogin").hidden = true;
  document.querySelector("#loginForm").hidden = false;
  document.querySelector("#showRegistration").hidden = isDemoMode();
});
registrationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#registrationMessage");
  const password = document.querySelector("#registrationPassword").value;
  if (password !== document.querySelector("#registrationConfirm").value) {
    setMessage(message, "Las contraseñas no coinciden.", true);
    return;
  }
  const button = document.querySelector("#registrationSubmit");
  setBusy(button, true, "Solicitando…");
  try {
    const { session } = await registerAccount({
      fullName: document.querySelector("#registrationName").value,
      email: document.querySelector("#registrationEmail").value,
      password
    });
    registrationForm.reset();
    if (session) await openApp();
    else setMessage(message, "Revisa tu correo para confirmar la cuenta. Después podrás solicitar la aprobación del administrador.");
  } catch (error) {
    setMessage(message, error.message || "No fue posible registrar la cuenta.", true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#checkAccessButton").addEventListener("click", async () => {
  const button = document.querySelector("#checkAccessButton");
  setBusy(button, true, "Comprobando…");
  try {
    await openApp();
    if (!pendingView.hidden) setMessage(document.querySelector("#pendingMessage"), "La aprobación continúa pendiente.");
  } finally {
    setBusy(button, false);
  }
});
document.querySelector("#pendingLogoutButton").addEventListener("click", async () => {
  await signOut();
  closeApp();
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
document.querySelector("#refreshAppButton").addEventListener("click", refreshApplication);
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
document.querySelector("#exportDashboardButton").addEventListener("click", exportDashboard);
document.querySelector("#detailEditProject").addEventListener("click", () => selectedProjectId && openEditProject(selectedProjectId));
document.querySelector("#detailContractButton").addEventListener("click", openContractDialog);
document.querySelector("#contractForm").addEventListener("submit", saveContract);
["contractInitialValue", "contractAdditionsValue", "contractDeductionsValue"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", updateContractCurrentValue));
document.querySelector("#newInvoiceButton").addEventListener("click", () => openNewInvoice());
document.querySelector("#invoiceForm").addEventListener("submit", saveInvoice);
document.querySelector("#newPaymentButton").addEventListener("click", () => openNewPayment());
document.querySelector("#paymentForm").addEventListener("submit", savePayment);
document.querySelector("#paymentInvoice").addEventListener("change", updatePaymentAvailable);
document.querySelector("#exportReportButton").addEventListener("click", exportManagementReport);
document.querySelector("#reportProgressForm").addEventListener("submit", saveReportProgress);
document.querySelector("#reloadProfilesButton").addEventListener("click", loadProfiles);
document.querySelector("#projectFilters").addEventListener("submit", (event) => { event.preventDefault(); loadProjects(); });
document.querySelector("#clearProjectFilters").addEventListener("click", () => { document.querySelector("#projectFilters").reset(); loadProjects(); });
document.querySelector("#monthlyFilters").addEventListener("submit", (event) => { event.preventDefault(); loadMonthlyModule(); });
document.querySelector("#clearMonthlyFilters").addEventListener("click", () => { document.querySelector("#monthlyFilters").reset(); loadMonthlyModule({}); });
document.querySelector("#financeFilters").addEventListener("submit", (event) => { event.preventDefault(); loadFinance(); });
document.querySelector("#clearFinanceFilters").addEventListener("click", () => { document.querySelector("#financeFilters").reset(); loadFinance({}); });
document.querySelector("#costFilters").addEventListener("submit", (event) => { event.preventDefault(); loadCosts(); });
document.querySelector("#clearCostFilters").addEventListener("click", () => { document.querySelector("#costFilters").reset(); loadCosts({}); });
document.querySelector("#reportFilters").addEventListener("submit", (event) => { event.preventDefault(); loadReports(); });
document.querySelector("#clearReportFilters").addEventListener("click", () => { document.querySelector("#reportFilters").reset(); loadReports(); });
document.querySelector("#historyFilters").addEventListener("submit", (event) => { event.preventDefault(); loadHistory(); });
document.querySelector("#clearHistoryFilters").addEventListener("click", () => { document.querySelector("#historyFilters").reset(); loadHistory({}); });
document.querySelector("#activePeriodSelect").addEventListener("change", (event) => {
  document.querySelector("#monthlyFilterPeriod").value = event.target.value;
  showView("monthly");
});

document.addEventListener("click", async (event) => {
  const filterRemoval = event.target.closest("[data-filter-target]");
  if (filterRemoval) {
    const field = document.querySelector(`#${filterRemoval.dataset.filterTarget}`);
    const form = document.querySelector(`#${filterRemoval.dataset.filterForm}`);
    if (field && form) {
      field.value = "";
      form.requestSubmit();
    }
    return;
  }

  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) document.querySelector(`#${closeButton.dataset.closeDialog}`).close();

  const projectTab = event.target.closest("[data-project-tab]");
  if (projectTab && selectedProjectId) {
    const targetView = projectTab.dataset.projectTab;
    const filterIds = {
      costs: "#costFilterProject",
      monthly: "#monthlyFilterProject",
      finance: "#financeFilterProject",
      history: "#historyFilterProject"
    };
    const filter = document.querySelector(filterIds[targetView]);
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
  if (action?.dataset.action === "register-payment") openNewPayment(action.dataset.invoiceId);
  if (action?.dataset.action === "save-profile") await saveProfile(action.dataset.profileId);
  if (action?.dataset.action === "edit-project") await openEditProject(action.dataset.projectId);
  if (action?.dataset.action === "delete-project") await deleteProject(action.dataset.projectId);
  if (action?.dataset.action === "close-period") await closePeriod(action.dataset.periodId);
  if (action?.dataset.action === "reopen-period") await reopenPeriod(action.dataset.periodId);
  if (action?.dataset.action === "edit-monthly") openEditMonthly(action.dataset.trackingId);
  if (action?.dataset.action === "edit-report-progress") openReportProgressEditor(action.dataset.projectId);
  if (action?.dataset.action === "new-monthly-preset") openNewMonthly(action.dataset.projectId, action.dataset.periodId);
  if (action?.dataset.action === "validate-monthly") await validateMonthly(action.dataset.trackingId);
  if (action?.dataset.action === "open-support") await openSupport(action.dataset.supportPath);
  if (action?.dataset.action === "view-history") openHistoryDetail(action.dataset.historyId);

  const target = event.target.closest("[data-view]");
  if (target) await showView(target.dataset.view);
});

window.addEventListener("hashchange", async () => {
  if (appView.hidden) return;
  const route = routeFromHash();
  if (route.view === "detail" && currentProjects.some((project) => project.projectId === route.projectId)) {
    await openProjectDetail(route.projectId);
  } else {
    await showView(route.view === "detail" ? "dashboard" : route.view);
  }
});

if (!isDemoMode() && new URLSearchParams(location.search).get("recovery") !== "1") {
  getCurrentSession().then((session) => {
    if (session) openApp();
  }).catch(() => setMessage(document.querySelector("#loginMessage"), "La sesión expiró. Inicia sesión nuevamente.", true));
}
