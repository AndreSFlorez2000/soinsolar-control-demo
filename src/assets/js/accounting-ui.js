import { AUXILIARY_COLUMNS, auxiliaryCsv, normalizeAuxiliaryRows, parseAuxiliaryCsv } from "./domain/accounting-auxiliary.js?v=1.14.0";
import { accountingCenterForProject, centerKey, projectAccountingCenters, scopeAccountingCenters } from "./domain/accounting-projects.js?v=1.16.1";
import { filterUnifiedCosts, unifyCostMovements } from "./domain/unified-costs.js?v=1.17.0";
import { createXlsx } from "./domain/xlsx-export.js?v=1.5.8";

const $ = (selector) => document.querySelector(selector);
const cop = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const number = (value) => new Intl.NumberFormat("es-CO").format(Number(value ?? 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let batches = [], centers = [], projectCenters = [], unified = { rows: [], matchedCount: 0, possibleCount: 0 }, visible = [];
let page = 0, unifiedPage = 0, count = 0, loading = false, displayedCenter = "";

function message(value = "", error = false) {
  const node = $("#accountingMessage");
  node.textContent = value;
  node.classList.toggle("error", error);
}

function selectedBatch() { return batches.find((batch) => batch.id === $("#accountingBatch").value); }
function filters() {
  const dateFrom = $("#accountingFrom").value, dateTo = $("#accountingTo").value;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("La fecha inicial es posterior a la final.");
  const selected = projectCenters.find((row) => row.costCenter === $("#accountingCenter").value);
  return {
    costCenter: $("#accountingCenter").value,
    costCenters: selected?.codes.filter((code) => centers.some((row) => row.cost_center === code)) ?? [],
    account: $("#accountingAccount").value.trim(), party: $("#accountingParty").value.trim(),
    search: $("#accountingSearch").value.trim(), dateFrom, dateTo
  };
}

function renderCenters(preferred = $("#accountingCenter").value) {
  const select = $("#accountingCenter");
  select.innerHTML = `<option value="">Todos los centros (${number(projectCenters.length)})</option>`
    + projectCenters.map((row) => `<option value="${escapeHtml(row.costCenter)}">${escapeHtml(row.costCenter || "Sin CC")} · ${escapeHtml(row.project?.projectName || "Ficha pendiente")}</option>`).join("");
  select.value = projectCenters.some((row) => row.costCenter === preferred) ? preferred : "";
  $("#accountingCenterList").innerHTML = scopeAccountingCenters(projectCenters, select.value).map((row) => `<button type="button" class="accounting-center-chip ${row.costCenter === select.value ? "selected" : ""}" data-center="${escapeHtml(row.costCenter)}"><strong>${escapeHtml(row.costCenter || "Sin CC")}</strong><span>${escapeHtml(row.project?.projectName || "Ficha pendiente")} · ${number(row.classifiedLines + row.manualLines)} movimientos</span></button>`).join("");
}

function renderPartyOptions() {
  const selected = centerKey($("#accountingCenter").value);
  const names = new Set(unified.rows.filter((row) => !selected || centerKey(row.costCenter) === selected)
    .map((row) => row.supplierName).filter(Boolean));
  $("#accountingPartyOptions").innerHTML = [...names].sort((a, b) => a.localeCompare(b, "es"))
    .map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderAccountingCosts() {
  const selectedCode = $("#accountingCenter").value;
  const rows = scopeAccountingCenters(projectCenters, selectedCode);
  const movements = filteredMovements();
  const totals = new Map();
  for (const item of movements) {
    const key = centerKey(item.costCenter);
    if (!totals.has(key)) totals.set(key, { count: 0, expenses: 0, costs: 0 });
    const total = totals.get(key);
    total.count++;
    total[item.type === "gasto" ? "expenses" : "costs"] += Math.round(item.amount * 100);
  }
  const sum = (key) => [...totals.values()].reduce((total, row) => total + row[key], 0);
  $("#accountingRowCount").textContent = number(movements.length);
  $("#accountingCenterCount").textContent = number(rows.length);
  $("#costScopeBadge").textContent = selectedCode ? rows[0]?.project ? "Proyecto activo" : "Centro contable" : "Vista general";
  $("#costScopeDescription").textContent = selectedCode
    ? `${selectedCode}${rows[0]?.project ? ` · ${rows[0].project.projectName}` : " · Sin ficha de proyecto"}. Se muestran únicamente los movimientos de este centro.`
    : `Se muestran los ${number(projectCenters.length)} centros de costo disponibles (del archivo seleccionado y de las fichas registradas). Elige uno en los filtros para trabajar sobre él.`;
  $("#accountingCenterHelp").textContent = selectedCode
    ? "Estos totales, la tabla y la lista siguen los filtros del centro seleccionado."
    : "Estos totales, la tabla y la lista siguen los filtros aplicados. Selecciona un centro para trabajar sobre él.";
  $("#accountingShowAll").hidden = !selectedCode;
  const expenses = sum("expenses") / 100;
  const costs = sum("costs") / 100;
  $("#accountingExpenses").textContent = cop(expenses);
  $("#accountingSalesCosts").textContent = cop(costs);
  $("#accountingProductionCosts").textContent = cop(expenses + costs);
  $("#accountingCostLines").textContent = number(movements.length);
  $("#accountingLinkedCount").textContent = number(rows.filter((row) => row.project).length);
  $("#accountingPendingCount").textContent = number(rows.filter((row) => !row.project && row.sourceRows > 0).length);
  $("#accountingCostRows").innerHTML = rows.map((row) => {
    const total = totals.get(row.key) ?? { count: 0, expenses: 0, costs: 0 };
    return `
    <tr class="${row.costCenter === $("#accountingCenter").value ? "accounting-selected-row" : ""}">
      <td><strong>${escapeHtml(row.costCenter || "Sin CC")}</strong>${row.codes.length > 1 ? `<small class="accounting-muted">También: ${escapeHtml(row.codes.filter((code) => code !== row.costCenter).join(", "))}</small>` : ""}</td>
      <td><strong>${escapeHtml(row.project?.projectName || (row.ambiguous ? "Revisar código duplicado" : "Ficha pendiente"))}</strong><small class="accounting-muted">${row.project ? "Proyecto vinculado por CC" : "Se vinculará al cargar su ficha"}</small></td>
      <td>${number(total.count)}</td><td class="text-end">${cop(total.expenses / 100)}</td>
      <td class="text-end">${cop(total.costs / 100)}</td>
      <td class="text-end">${cop((total.expenses + total.costs) / 100)}</td>
      <td><button type="button" class="table-action" data-accounting-cost-center="${escapeHtml(row.costCenter)}">Ver movimientos</button>${row.project ? `<a class="table-action accounting-project-link" href="#detail/${encodeURIComponent(row.project.projectId)}">Abrir ficha</a>` : ""}</td>
    </tr>`;
  }).join("");
}

function unifiedFilters() {
  const chosen = filters(); // También valida el rango de fechas.
  return { ...chosen, type: $("#accountingType").value,
    month: $("#accountingMonth").value, category: $("#accountingCategory").value.trim() };
}

function filteredMovements() {
  return filterUnifiedCosts(unified.rows, unifiedFilters());
}

function renderUnifiedMovements() {
  const rows = filteredMovements();
  const pages = Math.max(1, Math.ceil(rows.length / 100));
  unifiedPage = Math.min(unifiedPage, pages - 1);
  const shown = rows.slice(unifiedPage * 100, (unifiedPage + 1) * 100);
  $("#unifiedCostCount").textContent = `${number(rows.length)} movimiento(s)`;
  $("#unifiedCostRows").innerHTML = shown.map((row) => `
    <tr>
      <td>${escapeHtml(row.movementDate)}</td>
      <td><strong>${escapeHtml(row.costCenter || "Sin CC")}</strong><small class="accounting-muted">${escapeHtml(row.projectName || "Ficha pendiente")}</small></td>
      <td><span class="type-badge ${row.type}">${escapeHtml(row.type)}</span></td>
      <td>${escapeHtml(row.category || "—")}${row.accountCode ? `<small class="accounting-muted">${escapeHtml(row.accountCode)}</small>` : ""}</td>
      <td>${escapeHtml(row.description || "—")}${row.verification.includes("revisar") ? `<span class="cost-review-pill">${escapeHtml(row.verification)}</span>` : ""}</td>
      <td>${escapeHtml(row.supplierName || "—")}<small class="accounting-muted">${escapeHtml(row.documentReference || "Sin documento")}</small></td>
      <td class="text-end"><strong>${cop(row.amount)}</strong></td>
      <td>${row.source === "accounting" ? `<button class="table-action" type="button" data-unified-import="${escapeHtml(row.importId)}" data-unified-row="${row.rowNumber}">Ver original</button>` : ""}${row.supportPath ? `<button class="table-action support-action" type="button" data-action="open-support" data-support-path="${escapeHtml(row.supportPath)}">Ver soporte</button>` : ""}</td>
    </tr>`).join("");
  $("#unifiedCostEmpty").hidden = rows.length > 0;
  $("#unifiedCostPageStatus").textContent = rows.length
    ? `Movimientos ${number(unifiedPage * 100 + 1)}–${number(Math.min((unifiedPage + 1) * 100, rows.length))} de ${number(rows.length)}` : "0 movimientos";
  $("#unifiedCostPrevious").disabled = unifiedPage === 0;
  $("#unifiedCostNext").disabled = unifiedPage >= pages - 1;
}

function renderVerification(batch) {
  const note = $("#costVerification");
  const status = batch?.status === "complete"
    ? `Archivo verificado: ${number(batch.expected_rows)} filas; débitos y créditos conciliados. `
    : batch ? "Archivo incompleto: termina su carga antes de consultar sus costos. "
      : "Los movimientos registrados se consultan por centro de costo. ";
  const matches = unified.matchedCount ? `${number(unified.matchedCount)} documento(s) coincidentes se muestran una sola vez. ` : "";
  const pending = unified.possibleCount
    ? `${number(unified.possibleCount)} posible(s) coincidencia(s) sin documento idéntico requieren revisión; se conservan visibles para no perder registros.` : "";
  note.textContent = status + matches + pending;
  note.classList.toggle("needs-review", Boolean(unified.possibleCount || batch?.status === "importing"));
}

function exportUnifiedWorkbook() {
  try {
    const rows = filteredMovements();
    if (!rows.length) { message("No hay movimientos para exportar con estos filtros.", true); return; }
    const workbook = [{
      name: "Costos y gastos", headers: ["Fecha", "Centro de costo", "Proyecto", "Tipo", "Categoría / cuenta",
        "Descripción", "Proveedor", "Documento", "Subcuenta", "Valor COP", "Verificación"],
      types: ["text", "text", "text", "text", "text", "text", "text", "text", "text", "money", "text"],
      rows: rows.map((row) => [row.movementDate, row.costCenter, row.projectName, row.type, row.category,
        row.description, row.supplierName, row.documentReference, row.accountCode, row.amount, row.verification]),
      freezeColumns: 2, columnWidths: [16, 19, 32, 13, 28, 42, 28, 21, 17, 20, 30]
    }];
    const url = URL.createObjectURL(createXlsx(workbook));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `costos-gastos-${new Date().toISOString().slice(0, 10)}.xlsx`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { message(error.message || "No se pudo exportar la consulta.", true); }
}

function renderRows() {
  $("#accountingRows").innerHTML = visible.map((row) => `
    <tr><td>${row.row_number}</td><td>${escapeHtml(row.movement_date)}</td><td><strong>${escapeHtml(row.cost_center || "—")}</strong></td>
      <td><strong>${escapeHtml(row.account_code)}</strong><small class="accounting-muted">${escapeHtml(row.account_name)}</small></td>
      <td>${escapeHtml(row.third_party_name || row.third_party_id || "—")}</td><td>${escapeHtml(row.document_type)} ${escapeHtml(row.document_number)}</td>
      <td class="accounting-detail-text" title="${escapeHtml(row.detail)}">${escapeHtml(row.detail || "—")}</td>
      <td class="text-end">${cop(row.debit)}</td><td class="text-end">${cop(row.credit)}</td>
      <td><button class="table-action" type="button" data-raw-row="${row.row_number}">58 campos</button></td></tr>`).join("");
  $("#accountingEmpty").hidden = count > 0;
  const selected = projectCenters.find((row) => row.costCenter === $("#accountingCenter").value);
  $("#accountingReconciliation").textContent = selected && !selected.sourceRows
    ? "Este centro ya tiene ficha de proyecto, pero no tiene filas en el archivo seleccionado. Sus otros movimientos se ven en la lista principal."
    : selected && !selected.project
      ? "Los movimientos de este centro están guardados. Su nombre y contrato aparecerán cuando se cargue la ficha del proyecto con el mismo código."
      : "Estas son las filas originales del auxiliar; la lista principal reúne los costos y gastos del centro.";
  $("#accountingPageStatus").textContent = count ? `Filas ${number(page * 100 + 1)}–${number(Math.min((page + 1) * 100, count))} de ${number(count)} (orden original)` : "0 filas";
  $("#accountingPrevious").disabled = page === 0;
  $("#accountingNext").disabled = (page + 1) * 100 >= count;
}

async function loadPage() {
  const batch = selectedBatch();
  if (!batch) { visible = []; count = 0; renderRows(); return; }
  const gateway = await window.SOINSOLAR_APP_API.gateway();
  const result = await gateway.listAccountingEntries(batch.id, filters(), page);
  visible = result.rows; count = result.count;
  renderRows();
}

async function loadBatch() {
  const batch = selectedBatch();
  const gateway = await window.SOINSOLAR_APP_API.gateway();
  const [centerRows, costRows, costEntries, manualRows] = await Promise.all([
    batch ? gateway.listAccountingCenters(batch.id) : [],
    batch ? gateway.listAccountingCostCenters(batch.id) : [],
    batch?.status === "complete" ? gateway.listAccountingCostEntries(batch.id) : [],
    gateway.listCostsExpenses({})
  ]);
  centers = centerRows;
  unified = unifyCostMovements(costEntries, manualRows, window.SOINSOLAR_APP_API.projects());
  projectCenters = projectAccountingCenters(centers, costRows, window.SOINSOLAR_APP_API.projects(), unified.unmatchedManual);
  const activeProject = window.SOINSOLAR_APP_API.projects().find((item) => item.projectId === window.SOINSOLAR_APP_API.selectedProjectId());
  const preferredCenter = accountingCenterForProject(projectCenters, activeProject);
  $("#accountingExportButton").disabled = !batch || batch.status !== "complete";
  if (displayedCenter !== preferredCenter) $("#accountingParty").value = "";
  renderCenters(preferredCenter);
  renderPartyOptions();
  displayedCenter = $("#accountingCenter").value;
  renderAccountingCosts();
  renderVerification(batch);
  unifiedPage = 0;
  renderUnifiedMovements();
  page = 0;
  await loadPage();
  if (batch?.status === "importing") message("Esta importación quedó incompleta. Selecciona el mismo archivo para continuar.", true);
}

async function refresh(preferredId) {
  const api = window.SOINSOLAR_APP_API;
  if (!api?.profile()?.active) return;
  const gateway = await api.gateway();
  $(".accounting-section").hidden = gateway.mode !== "supabase";
  $(".manual-cost-section").hidden = gateway.mode === "supabase";
  $("#accountingImportButton").hidden = gateway.mode !== "supabase" || api.profile().role !== "administrador";
  if (gateway.mode !== "supabase") { $("#accountingExportButton").disabled = true; message(""); return; }
  batches = await gateway.listAccountingImports();
  const selector = $("#accountingBatch");
  const previous = preferredId ?? selector.value;
  selector.innerHTML = batches.map((batch) => `<option value="${batch.id}">${escapeHtml(batch.report_period)} · ${escapeHtml(batch.original_file_name)}${batch.status !== "complete" ? " (pendiente)" : ""}</option>`).join("");
  if (batches.some((batch) => batch.id === previous)) selector.value = previous;
  if (!batches.length) message("No hay archivos importados. El administrador puede cargar el auxiliar original completo.");
  else message();
  await loadBatch();
}

async function parseFile(file, bytes) {
  if (/\.csv$/i.test(file.name)) return normalizeAuxiliaryRows(parseAuxiliaryCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona el auxiliar original en CSV o Excel.");
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel.");
  const workbook = window.XLSX.read(bytes, { type: "array" });
  if (workbook.SheetNames.length !== 1) throw new Error("El auxiliar debe tener una sola hoja. No se omitirá ninguna hoja del archivo.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: true });
  return normalizeAuxiliaryRows(rows);
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file || loading) return;
  loading = true;
  $("#accountingImportButton").disabled = true;
  try {
    if (window.SOINSOLAR_APP_API.profile()?.role !== "administrador") throw new Error("Solo un administrador puede importar auxiliares.");
    message("Leyendo todas las filas del archivo…");
    const bytes = await file.arrayBuffer();
    const parsed = await parseFile(file, bytes);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    message(`Archivo validado: ${number(parsed.entries.length)} filas. Guardando…`);
    const result = await (await window.SOINSOLAR_APP_API.gateway()).importAccountingAuxiliary({
      fileName: file.name, format: file.name.split(".").pop().toLowerCase(), sha256,
      ...parsed,
      onProgress: (done, total) => message(`Guardando ${number(done)} de ${number(total)} filas…`)
    });
    await refresh(result.batch.id);
    window.dispatchEvent(new Event("soinsolar:accounting-updated"));
    message(result.alreadyImported ? "Este archivo ya estaba importado; sus filas se conservan sin duplicar." : `${number(parsed.entries.length)} filas importadas y comprobadas. Débitos y créditos conciliados.`);
  } catch (error) { message(error.message || "No se pudo importar el auxiliar.", true); }
  finally { loading = false; $("#accountingImportButton").disabled = false; event.target.value = ""; }
}

async function exportOriginal() {
  const batch = selectedBatch();
  if (!batch || loading) return;
  try {
    const selectedCode = $("#accountingCenter").value;
    message(selectedCode ? `Preparando filas de ${selectedCode}…` : "Preparando todas las filas originales…");
    const rows = [];
    const gateway = await window.SOINSOLAR_APP_API.gateway();
    let expected = Number(batch.expected_rows);
    if (selectedCode) {
      const chosen = filters();
      for (let pageIndex = 0; ; pageIndex++) {
        const result = await gateway.listAccountingEntries(batch.id, chosen, pageIndex);
        expected = result.count;
        rows.push(...result.rows.map((item) => item.raw_cells));
        message(`Descargando ${number(rows.length)} de ${number(expected)} filas de ${selectedCode}…`);
        if (rows.length >= expected) break;
      }
    } else {
      for await (const chunk of gateway.accountingRawPages(batch.id)) {
        rows.push(...chunk.map((item) => item.raw_cells));
        message(`Descargando ${number(rows.length)} de ${number(expected)} filas…`);
      }
    }
    if (rows.length !== expected) throw new Error(`La descarga tiene ${rows.length} de ${expected} filas. Intenta nuevamente.`);
    const blob = new Blob(["\uFEFF", auxiliaryCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `auxiliar-contable-${selectedCode || batch.id}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(`${number(rows.length)} filas descargadas con sus 58 campos.`);
  } catch (error) { message(error.message || "No se pudo descargar el archivo.", true); }
}

function showOriginalRow(row) {
  if (!row) return;
  $("#accountingDetailTitle").textContent = `Fila ${row.row_number} · ${row.cost_center || "Sin CC"}`;
  $("#accountingDetail").innerHTML = row.raw_cells.map((value, index) => `<div class="accounting-field"><span>${index + 1}. ${escapeHtml(AUXILIARY_COLUMNS[index])}</span><strong>${escapeHtml(value) || "(vacío)"}</strong></div>`).join("");
  $("#accountingDetailDialog").showModal();
}

function openRaw(rowNumber) {
  showOriginalRow(visible.find((item) => item.row_number === Number(rowNumber)));
}

async function openUnifiedOriginal(importId, rowNumber) {
  showOriginalRow(await (await window.SOINSOLAR_APP_API.gateway()).getAccountingEntry(importId, Number(rowNumber)));
}

function selectCenter(code, scroll = false) {
  if (displayedCenter !== code) $("#accountingParty").value = "";
  $("#accountingCenter").value = code;
  displayedCenter = code;
  renderCenters(); renderPartyOptions();
  renderAccountingCosts();
  unifiedPage = 0; renderUnifiedMovements();
  const row = projectCenters.find((item) => item.costCenter === code);
  document.dispatchEvent(new CustomEvent("soinsolar:accounting-center-selected", {
    detail: { centerCode: code, projectId: row?.project?.projectId ?? null }
  }));
  page = 0;
  loadPage().catch((error) => message(error.message, true));
  if (scroll) $("#accountingFilters").scrollIntoView({ behavior: "smooth", block: "start" });
}

function wire() {
  window.SOINSOLAR_UNIFIED_COSTS = Object.freeze({ export: exportUnifiedWorkbook });
  document.addEventListener("soinsolar:costs-open", () => refresh().catch((error) => message(error.message, true)));
  $("#accountingImportButton").addEventListener("click", () => $("#accountingFile").click());
  $("#accountingFile").addEventListener("change", importFile);
  $("#accountingExportButton").addEventListener("click", exportOriginal);
  $("#accountingBatch").addEventListener("change", () => loadBatch().catch((error) => message(error.message, true)));
  $("#accountingCenter").addEventListener("change", (event) => selectCenter(event.target.value));
  $("#accountingFilters").addEventListener("submit", (event) => {
    event.preventDefault(); page = 0; unifiedPage = 0;
    try { renderAccountingCosts(); renderUnifiedMovements(); loadPage().catch((error) => message(error.message, true)); }
    catch (error) { message(error.message, true); }
  });
  const clearDetailedFilters = () => {
    for (const id of ["accountingAccount", "accountingParty", "accountingSearch", "accountingCategory",
      "accountingType", "accountingMonth", "accountingFrom", "accountingTo"]) $("#" + id).value = "";
  };
  $("#accountingShowAll").addEventListener("click", () => {
    clearDetailedFilters();
    $("#costFilters").reset();
    selectCenter("");
  });
  $("#accountingClear").addEventListener("click", () => {
    clearDetailedFilters();
    const projectId = window.SOINSOLAR_APP_API.selectedProjectId();
    const active = window.SOINSOLAR_APP_API.projects().find((row) => row.projectId === projectId);
    const projectCenter = projectCenters.find((row) => active && row.key === centerKey(active.costCenter));
    selectCenter(projectCenter?.costCenter ?? "");
  });
  $("#accountingCostRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-accounting-cost-center]");
    if (!button) return;
    clearDetailedFilters();
    selectCenter(button.dataset.accountingCostCenter, true);
  });
  $("#accountingCenterList").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-center]");
    if (!chip) return;
    selectCenter(chip.dataset.center);
  });
  document.addEventListener("soinsolar:manual-cost-filter-applied", (event) => {
    const active = window.SOINSOLAR_APP_API.projects().find((row) => row.projectId === event.detail?.projectId);
    const target = projectCenters.find((row) => active && row.key === centerKey(active.costCenter));
    if ($("#accountingCenter").value !== (target?.costCenter ?? "")) $("#accountingParty").value = "";
    $("#accountingCenter").value = target?.costCenter ?? "";
    displayedCenter = $("#accountingCenter").value;
    renderCenters(); renderPartyOptions(); renderAccountingCosts(); unifiedPage = 0; renderUnifiedMovements(); page = 0;
    loadPage().catch((error) => message(error.message, true));
  });
  document.addEventListener("soinsolar:costs-manual-updated", () => loadBatch().catch((error) => message(error.message, true)));
  $("#accountingRows").addEventListener("click", (event) => { if (event.target.dataset.rawRow) openRaw(event.target.dataset.rawRow); });
  $("#unifiedCostRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-unified-import]");
    if (button) openUnifiedOriginal(button.dataset.unifiedImport, button.dataset.unifiedRow)
      .catch((error) => message(error.message, true));
  });
  $("#unifiedCostPrevious").addEventListener("click", () => { unifiedPage--; renderUnifiedMovements(); });
  $("#unifiedCostNext").addEventListener("click", () => { unifiedPage++; renderUnifiedMovements(); });
  $("#accountingPrevious").addEventListener("click", () => { page--; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingNext").addEventListener("click", () => { page++; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingCloseDetail").addEventListener("click", () => $("#accountingDetailDialog").close());
  window.addEventListener("soinsolar:logout", () => {
    batches = []; centers = []; projectCenters = []; unified = { rows: [], matchedCount: 0, possibleCount: 0 };
    visible = []; page = 0; unifiedPage = 0; count = 0; displayedCenter = "";
    $("#accountingBatch").replaceChildren(); $("#accountingCenter").value = "";
    $("#accountingCostRows").replaceChildren(); $("#accountingRows").replaceChildren(); $("#unifiedCostRows").replaceChildren();
    $("#accountingCenterList").replaceChildren(); message();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
