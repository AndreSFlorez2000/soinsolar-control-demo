import { buildMonthlySeries } from "./domain/dashboard.js?v=1.5.9";
import { topLevelFinancialRows } from "./domain/cost-centers.js?v=1.3.1";

const HELP = Object.freeze({
  contract: "Suma de los contratos vigentes de los centros principales. Cada contrato se calcula como valor inicial + adiciones − deducciones.",
  execution: "Promedio simple de los porcentajes físicos registrados por proyecto. Solo el administrador digita el avance; facturas y pagos no lo modifican.",
  collection: "Suma de pagos no anulados. El porcentaje corresponde a pagos ÷ valor contractual × 100. También cuenta un pago registrado que todavía no esté confirmado por el banco.",
  invoiced: "Suma de facturas no anuladas. Su porcentaje es facturado ÷ valor contractual × 100; facturar no equivale a recaudar.",
  costs: "Suma de costos y gastos registrados. Su porcentaje es costos y gastos ÷ valor contractual × 100.",
  balance: "Parte del contrato aún sin facturar: máximo entre contrato vigente − facturado y cero.",
  portfolio: "Facturas aún sin pago registrado: máximo entre facturado − pagado y cero.",
  equivalent: "Suma, por centro principal con avance registrado, de contrato × porcentaje de ejecución ÷ 100. Es una referencia monetaria de la obra, no una factura ni un pago.",
  profit: "Estimación del contrato menos los costos y gastos registrados. No representa efectivo disponible ni utilidad contable definitiva.",
  count: "Número de proyectos registrados, incluidos los centros dependientes. No equivale al número de contratos principales.",
  executionChart: "Compara el avance físico que el administrador registró en cada proyecto. Los proyectos sin avance registrado quedan fuera del gráfico.",
  cashFlowChart: "Compara las facturas y los pagos no anulados de cada mes. Un pago no cambia el avance físico del proyecto.",
  collectionChart: "Suma de pagos no anulados por mes. La altura o posición muestra el valor recaudado en cada periodo.",
  costsChart: "Suma de costos y gastos registrados por periodo mensual.",
  contractChart: "Distribución del valor contractual vigente entre los centros principales. Cada proyecto se cuenta una sola vez.",
  portfolioChart: "Cartera por centro principal: máximo entre facturado − pagado y cero.",
  billedChart: "Facturación por centro principal: suma de las facturas no anuladas.",
  projects: "Tabla con contrato, avance físico registrado, equivalente monetario, facturación y recaudo por proyecto.",
  status: "Cuenta proyectos según su estado registrado: planeado, activo, suspendido, finalizado o cancelado.",
  alerts: "Avisos sobre facturas pendientes de pago, periodos abiertos y seguimientos aún sin validar."
});

const INDICATORS = Object.freeze({
  invoiced: "Total facturado", costs: "Costos y gastos", balance: "Saldo contractual",
  portfolio: "Cartera pendiente", equivalent: "Valor equivalente ejecutado",
  profit: "Rentabilidad estimada", count: "Proyectos registrados"
});
const WIDGETS = Object.freeze({
  execution: { name: "Ejecución por proyecto", info: "executionChart", types: ["bar"], projectBased: true },
  cashFlow: { name: "Facturación y recaudo por mes", info: "cashFlowChart", types: ["line", "bar"], monthly: true },
  collectionMonthly: { name: "Recaudo por mes", info: "collectionChart", types: ["line", "bar"], monthly: true },
  costsMonthly: { name: "Costos por mes", info: "costsChart", types: ["line", "bar"], monthly: true },
  contractProject: { name: "Contrato por proyecto", info: "contractChart", types: ["bar", "pie"], projectBased: true },
  portfolioProject: { name: "Cartera por proyecto", info: "portfolioChart", types: ["bar", "pie"], projectBased: true },
  billedProject: { name: "Facturación por proyecto", info: "billedChart", types: ["bar", "pie"], projectBased: true }
});
const SECTIONS = Object.freeze({ projects: "Tabla por proyecto", status: "Estados y alertas" });
const COLORS = Object.freeze({ navy: "#0b2d52", blue: "#337fbc", green: "#2f8f59", gold: "#edaf25" });
const PIE_COLORS = ["#0b2d52", "#337fbc", "#2f8f59", "#68abd2", "#173d66", "#54aa79", "#8ab8d8", "#54728f"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MAX_CHARTS = 8;
const DEFAULT_WIDGETS = [{ metric: "execution", type: "bar", projectId: "" }, { metric: "cashFlow", type: "line", projectId: "" }];
const emptyLayout = () => ({ indicators: [], widgets: DEFAULT_WIDGETS.map((item) => ({ ...item })), sections: [] });
const positive = (value) => Math.max(0, Number(value) || 0);

export function cleanDashboardLayout(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyLayout();
  const indicators = [...new Set((Array.isArray(input.indicators) ? input.indicators : [])
    .filter((key) => Object.hasOwn(INDICATORS, key)))];
  const sections = [...new Set((Array.isArray(input.sections) ? input.sections : [])
    .filter((key) => Object.hasOwn(SECTIONS, key)))];
  const seen = new Set();
  const widgets = (Array.isArray(input.widgets) ? input.widgets : []).flatMap((item) => {
    if (!item || typeof item !== "object" || !Object.hasOwn(WIDGETS, item.metric)) return [];
    if (!WIDGETS[item.metric].types.includes(item.type)) return [];
    const projectId = WIDGETS[item.metric].monthly && typeof item.projectId === "string" && item.projectId.length <= 80
      ? item.projectId : "";
    const unique = [item.metric, item.type, projectId].join(":");
    if (seen.has(unique) || seen.size >= MAX_CHARTS) return [];
    seen.add(unique);
    return [{ metric: item.metric, type: item.type, projectId }];
  });
  return { indicators, widgets, sections };
}

export function buildDashboardChartModel(metric, projects = [], monthly = [], projectId = "") {
  if (!Object.hasOwn(WIDGETS, metric)) return { labels: [], datasets: [], projectIds: [], empty: true };
  if (WIDGETS[metric].monthly) {
    const rows = projectId ? monthly.filter((row) => row.projectId === projectId) : monthly;
    const series = buildMonthlySeries(rows, 6);
    const labels = series.map((row) => `${MONTHS[row.month - 1]} ${row.year}`);
    const datasets = metric === "cashFlow"
      ? [{ label: "Facturado", data: series.map((r) => positive(r.invoiced)), color: COLORS.navy },
        { label: "Recaudado", data: series.map((r) => positive(r.paid)), color: COLORS.green }]
      : metric === "collectionMonthly"
        ? [{ label: "Recaudado", data: series.map((r) => positive(r.paid)), color: COLORS.green }]
        : [{ label: "Costos y gastos", data: series.map((r) => positive(r.costsExpenses)), color: COLORS.gold }];
    return { labels, fullLabels: labels, datasets, projectIds: [], empty: !labels.length, monthly: true };
  }
  const all = metric === "execution" ? projects.filter((p) =>
    p.executedProgressPercentage !== null && p.executedProgressPercentage !== undefined
      && Number.isFinite(Number(p.executedProgressPercentage))) : topLevelFinancialRows(projects);
  const rows = metric === "execution" ? all : all.filter((p) =>
    positive(metric === "contractProject" ? p.contractValue
      : metric === "portfolioProject" ? p.paymentPending ?? positive(p.totalInvoiced) - positive(p.totalPaid)
        : p.totalInvoiced) > 0);
  const values = rows.map((p) => metric === "execution" ? Math.max(0, Math.min(100, Number(p.executedProgressPercentage)))
    : metric === "contractProject" ? positive(p.contractValue)
      : metric === "portfolioProject" ? positive(p.paymentPending ?? positive(p.totalInvoiced) - positive(p.totalPaid))
        : positive(p.totalInvoiced));
  const labels = rows.map((p) => String(p.costCenter || p.projectName || "Proyecto"));
  return {
    labels, fullLabels: rows.map((p) => `${p.costCenter || "Sin centro"} · ${p.projectName || "Proyecto"}`),
    datasets: [{ label: metric === "execution" ? "Avance de ejecución" : metric === "contractProject" ? "Contrato"
      : metric === "portfolioProject" ? "Cartera" : "Facturado", data: values,
      color: metric === "execution" ? COLORS.blue : metric === "contractProject" ? COLORS.navy : metric === "portfolioProject" ? COLORS.green : COLORS.navy }],
    projectIds: rows.map((p) => p.projectId), empty: !rows.length, monthly: false, percentage: metric === "execution"
  };
}

export function createDashboardUI(root, { onProjectOpen, formatCop }) {
  const builder = root.querySelector("#dashboardBuilder");
  const grid = root.querySelector("#dashboardWidgetGrid");
  const extras = root.querySelector("#dashboardExtraIndicators");
  const sections = root.querySelector("#dashboardExtraSections");
  const popup = root.querySelector("#dashboardInfoPopup");
  const message = root.querySelector("#dashboardLayoutMessage");
  const metricSelect = root.querySelector("#dashboardMetricSelect");
  const typeSelect = root.querySelector("#dashboardTypeSelect");
  const projectSelect = root.querySelector("#dashboardProjectSelect");
  const openButton = root.querySelector("#dashboardAddButton");
  const organizeButton = root.querySelector("#dashboardOrganizeButton");
  let kind = "chart", ownerId = null, layout = emptyLayout(), projects = [], monthly = [];
  let charts = [], storage = null, activeInfoButton = null;
  try { storage = window.localStorage; } catch { /* Session-only customization. */ }
  if (!storage) root.querySelector("#dashboardLayoutHint").textContent = "La vista actual se conservará durante esta sesión.";

  function closeInfo() {
    if (activeInfoButton) activeInfoButton.setAttribute("aria-expanded", "false");
    activeInfoButton = null;
    popup.hidden = true;
  }
  function closeBuilder() { builder.hidden = true; openButton.setAttribute("aria-expanded", "false"); }
  function persist() {
    if (!ownerId || !storage) return;
    try { storage.setItem(`soinsolar.dashboard.v1:${ownerId}`, JSON.stringify(layout)); }
    catch { root.querySelector("#dashboardLayoutHint").textContent = "La vista actual se conservará durante esta sesión."; }
  }
  function updateOptions() {
    const source = kind === "chart" ? WIDGETS : kind === "indicator" ? INDICATORS : SECTIONS;
    const previous = metricSelect.value;
    metricSelect.replaceChildren(...Object.entries(source).map(([key, value]) =>
      new Option(typeof value === "string" ? value : value.name, key)));
    if (Object.hasOwn(source, previous)) metricSelect.value = previous;
    const definition = WIDGETS[metricSelect.value];
    root.querySelector("#dashboardTypeField").hidden = kind !== "chart";
    root.querySelector("#dashboardProjectField").hidden = kind !== "chart" || !definition?.monthly;
    typeSelect.replaceChildren(...(kind === "chart" ? definition.types.map((value) =>
      new Option(({ line: "Línea", bar: "Barras", pie: "Torta" })[value], value)) : []));
    const selectedProject = projectSelect.value;
    projectSelect.replaceChildren(new Option("Todos los proyectos", ""), ...projects.map((project) =>
      new Option(`${project.costCenter} · ${project.projectName}`, project.projectId)));
    if (projects.some((p) => p.projectId === selectedProject)) projectSelect.value = selectedProject;
  }
  function layoutMessage(text) { message.textContent = text; }
  function renderStatic() {
    const cards = new Map([...extras.querySelectorAll("[data-dashboard-indicator]")].map((node) => [node.dataset.dashboardIndicator, node]));
    layout.indicators.forEach((key) => extras.append(cards.get(key)));
    cards.forEach((card, key) => { card.hidden = !layout.indicators.includes(key); });
    extras.hidden = layout.indicators.length === 0;
    for (const section of sections.querySelectorAll("[data-dashboard-section]")) {
      section.hidden = !layout.sections.includes(section.dataset.dashboardSection);
    }
    sections.hidden = layout.sections.length === 0;
  }
  function renderCharts() {
    charts.forEach((chart) => chart.destroy());
    charts = [];
    closeInfo();
    grid.replaceChildren();
    if (!layout.widgets.length) {
      const empty = document.createElement("p");
      empty.className = "dashboard-widget-empty panel";
      empty.textContent = "Añade un gráfico para comparar proyectos o revisar movimientos por mes.";
      grid.append(empty);
      return;
    }
    layout.widgets.forEach((item, position) => {
      const definition = WIDGETS[item.metric];
      const project = projects.find((p) => p.projectId === item.projectId);
      const model = buildDashboardChartModel(item.metric, projects, monthly, project?.projectId || "");
      const article = document.createElement("article");
      article.className = "panel dashboard-widget";
      article.dataset.dashboardWidget = String(position);
      const header = document.createElement("div");
      header.className = "dashboard-widget-header";
      const heading = document.createElement("div");
      const name = document.createElement("h4");
      name.textContent = definition.name;
      const context = document.createElement("small");
      context.textContent = project ? `Proyecto: ${project.costCenter} · ${project.projectName}`
        : definition.monthly ? "Últimos periodos con movimientos" : "Proyectos con registros";
      heading.append(name, context);
      const tools = document.createElement("div");
      tools.className = "dashboard-widget-tools";
      tools.innerHTML = `<div class="dashboard-widget-actions"><button type="button" data-dashboard-move="-1" aria-label="Mover gráfico antes">←</button><button type="button" data-dashboard-move="1" aria-label="Mover gráfico después">→</button><button type="button" data-dashboard-remove="widget" aria-label="Quitar gráfico">×</button></div><button class="dashboard-info-button" type="button" data-dashboard-info="${definition.info}" aria-label="Qué muestra ${definition.name}" aria-expanded="false">i</button>`;
      header.append(heading, tools);
      const frame = document.createElement("div");
      frame.className = "dashboard-chart-frame";
      const detail = document.createElement("p");
      detail.className = "dashboard-widget-detail";
      detail.setAttribute("aria-live", "polite");
      article.append(header, frame, detail);
      grid.append(article);
      if (model.empty) {
        const empty = document.createElement("div");
        empty.className = "dashboard-widget-empty";
        empty.textContent = item.metric === "execution" ? "Todavía no hay avance de ejecución registrado."
          : "No hay valores registrados para este gráfico.";
        frame.append(empty);
      } else if (window.Chart) {
        const height = model.monthly || item.type === "pie" ? 245 : Math.min(560, Math.max(245, model.labels.length * 32 + 70));
        frame.style.height = `${height}px`;
        const canvas = document.createElement("canvas");
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `${definition.name}: ${model.fullLabels.map((label, i) => `${label} ${model.datasets.map((set) => `${set.label} ${model.percentage ? set.data[i] + " %" : formatCop(set.data[i])}`).join(", ")}`).join("; ")}`);
        frame.append(canvas);
        const type = item.type === "pie" ? "doughnut" : item.type;
        const datasetColors = item.type === "pie" ? model.labels.map((_, i) => PIE_COLORS[i % PIE_COLORS.length]) : null;
        const datasets = model.datasets.map((set) => ({
          label: set.label, data: set.data, backgroundColor: datasetColors || set.color,
          borderColor: set.color, borderWidth: type === "line" ? 2 : 0,
          fill: false, tension: .3, pointRadius: 4, borderRadius: type === "bar" ? 5 : 0
        }));
        try {
          charts.push(new window.Chart(canvas, {
            type, data: { labels: model.labels, datasets },
            options: {
              responsive: true, maintainAspectRatio: false, animation: { duration: 360 },
              indexAxis: model.monthly || type === "doughnut" ? "x" : "y",
              interaction: { mode: "index", intersect: false },
              onClick: (_event, elements) => {
                if (!elements.length) return;
                const index = elements[0].index;
                const values = model.datasets.map((set) =>
                  `${set.label}: ${model.percentage ? set.data[index] + " %" : formatCop(set.data[index])}`).join(" · ");
                detail.textContent = `${model.fullLabels[index]} · ${values}`;
                if (model.projectIds[index]) {
                  let button = detail.querySelector("button");
                  if (!button) { button = document.createElement("button"); button.type = "button"; button.className = "link-button"; detail.append(" ", button); }
                  button.textContent = "Abrir proyecto";
                  button.dataset.dashboardOpenProject = model.projectIds[index];
                }
              },
              plugins: {
                legend: { display: type === "doughnut" || datasets.length > 1, position: "bottom" },
                tooltip: { callbacks: {
                  title: (items) => model.fullLabels[items[0]?.dataIndex] || "",
                  label: (ctx) => {
                    const value = type === "doughnut" ? ctx.parsed : model.monthly ? ctx.parsed.y : ctx.parsed.x;
                    return `${ctx.dataset.label || "Valor"}: ${model.percentage ? value + " %" : formatCop(value)}`;
                  }
                } }
              },
              ...(type === "doughnut" ? { cutout: "60%" } : {
                scales: {
                  x: { beginAtZero: !model.monthly, grid: { display: false },
                    ticks: model.monthly ? {} : { callback: (v) => model.percentage ? `${v} %` : `${Math.round(v / 1000000)} M` } },
                  y: { beginAtZero: model.monthly, grid: { color: "#edf2f6" },
                    ticks: model.monthly ? { callback: (v) => `${Math.round(v / 1000000)} M` }
                      : { callback: (v) => String(model.labels[v] ?? "").slice(0, 18) } }
                }
              })
            }
          }));
        } catch {
          canvas.remove();
          frame.style.height = "";
          renderFallback(frame, model);
        }
      } else renderFallback(frame, model);
    });
  }
  function renderFallback(frame, model) {
    const fallback = document.createElement("div");
    fallback.className = "dashboard-chart-fallback";
    model.labels.forEach((label, i) => {
      const row = document.createElement("div");
      const name = document.createElement("span");
      const value = document.createElement("strong");
      name.textContent = model.fullLabels[i];
      value.textContent = model.datasets.map((set) =>
        `${set.label}: ${model.percentage ? set.data[i] + " %" : formatCop(set.data[i])}`).join(" · ");
      row.append(name, value);
      fallback.append(row);
    });
    frame.append(fallback);
  }
  function render() { renderStatic(); renderCharts(); updateOptions(); }

  root.addEventListener("click", (event) => {
    const info = event.target.closest("[data-dashboard-info]");
    if (info) {
      const active = activeInfoButton === info && !popup.hidden;
      closeInfo();
      if (!active) {
        activeInfoButton = info;
        info.setAttribute("aria-expanded", "true");
        popup.textContent = HELP[info.dataset.dashboardInfo] || "";
        info.closest(".kpi-card, .dashboard-widget, .dashboard-section-card")?.append(popup);
        popup.hidden = false;
      }
      return;
    }
    if (!event.target.closest("#dashboardInfoPopup")) closeInfo();
    if (event.target.closest("#dashboardAddButton")) {
      builder.hidden = !builder.hidden;
      openButton.setAttribute("aria-expanded", String(!builder.hidden));
      if (!builder.hidden) metricSelect.focus();
      return;
    }
    if (event.target.closest("#dashboardBuilderClose")) { closeBuilder(); openButton.focus(); return; }
    if (event.target.closest("#dashboardOrganizeButton")) {
      const editing = root.classList.toggle("dashboard-editing");
      organizeButton.textContent = editing ? "Listo" : "Organizar";
      organizeButton.setAttribute("aria-pressed", String(editing));
      return;
    }
    const kindButton = event.target.closest("[data-dashboard-kind]");
    if (kindButton) {
      kind = kindButton.dataset.dashboardKind;
      root.querySelectorAll("[data-dashboard-kind]").forEach((button) =>
        button.setAttribute("aria-pressed", String(button === kindButton)));
      updateOptions();
      return;
    }
    if (event.target.closest("#dashboardConfirmAdd")) {
      const key = metricSelect.value;
      if (kind === "indicator" && !layout.indicators.includes(key)) layout.indicators.push(key);
      else if (kind === "section" && !layout.sections.includes(key)) layout.sections.push(key);
      else if (kind === "chart") {
        const choice = { metric: key, type: typeSelect.value,
          projectId: WIDGETS[key].monthly ? projectSelect.value : "" };
        if (layout.widgets.length >= MAX_CHARTS) { layoutMessage("Puedes tener hasta ocho gráficos. Quita uno para añadir otro."); return; }
        if (layout.widgets.some((w) => w.metric === choice.metric && w.type === choice.type && w.projectId === choice.projectId)) {
          layoutMessage("Ese gráfico ya está en tu tablero."); return;
        }
        layout.widgets.push(choice);
      } else { layoutMessage("Ese elemento ya está en tu tablero."); return; }
      persist(); closeBuilder(); render(); layoutMessage("Elemento añadido al tablero.");
      return;
    }
    const remove = event.target.closest("[data-dashboard-remove]");
    if (remove) {
      if (remove.dataset.dashboardRemove === "widget") {
        const index = Number(remove.closest("[data-dashboard-widget]")?.dataset.dashboardWidget);
        if (Number.isInteger(index)) layout.widgets.splice(index, 1);
      } else {
        const list = remove.dataset.dashboardRemove === "indicator" ? layout.indicators : layout.sections;
        const index = list.indexOf(remove.dataset.dashboardKey);
        if (index >= 0) list.splice(index, 1);
      }
      persist(); render(); layoutMessage("Elemento quitado del tablero.");
      return;
    }
    const move = event.target.closest("[data-dashboard-move]");
    if (move) {
      const position = Number(move.closest("[data-dashboard-widget]")?.dataset.dashboardWidget);
      const target = position + Number(move.dataset.dashboardMove);
      if (Number.isInteger(position) && target >= 0 && target < layout.widgets.length) {
        [layout.widgets[position], layout.widgets[target]] = [layout.widgets[target], layout.widgets[position]];
        persist(); render();
      }
      return;
    }
    const projectButton = event.target.closest("[data-dashboard-open-project]");
    if (projectButton) onProjectOpen(projectButton.dataset.dashboardOpenProject);
  });
  root.querySelector("#dashboardMetricSelect").addEventListener("change", updateOptions);
  document.addEventListener("click", (event) => {
    if (activeInfoButton && !root.contains(event.target)) closeInfo();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { closeInfo(); if (!builder.hidden) closeBuilder(); }
  });
  updateOptions();

  return {
    setOwner(id) {
      if (ownerId === id) return;
      ownerId = id || null;
      layout = emptyLayout();
      if (ownerId && storage) {
        try {
          const stored = storage.getItem(`soinsolar.dashboard.v1:${ownerId}`);
          if (stored) layout = cleanDashboardLayout(JSON.parse(stored));
        } catch { /* Use the default layout if preferences cannot be read. */ }
      }
      closeInfo(); closeBuilder();
      layoutMessage("");
    },
    render(data) { projects = data.projects; monthly = data.monthly; render(); },
    close() {
      charts.forEach((chart) => chart.destroy());
      charts = [];
      ownerId = null; projects = []; monthly = [];
      closeInfo(); closeBuilder();
    }
  };
}
