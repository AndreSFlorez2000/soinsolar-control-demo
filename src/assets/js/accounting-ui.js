import { AUXILIARY_COLUMNS, auxiliaryCsv, normalizeAuxiliaryRows, parseAuxiliaryCsv } from "./domain/accounting-auxiliary.js?v=1.14.0";
import { centerKey, projectAccountingCenters, scopeAccountingCenters } from "./domain/accounting-projects.js?v=1.16.0";

const $ = (selector) => document.querySelector(selector);
const cop = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const number = (value) => new Intl.NumberFormat("es-CO").format(Number(value ?? 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let batches = [], centers = [], projectCenters = [], parties = [], visible = [], page = 0, count = 0, loading = false, displayedCenter = "";

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

function renderCenters() {
  const select = $("#accountingCenter");
  const previous = select.value;
  select.innerHTML = `<option value="">Todos los centros (${number(projectCenters.length)})</option>`
    + projectCenters.map((row) => `<option value="${escapeHtml(row.costCenter)}">${escapeHtml(row.costCenter || "Sin CC")} · ${escapeHtml(row.project?.projectName || "Ficha pendiente")}</option>`).join("");
  select.value = projectCenters.some((row) => row.costCenter === previous) ? previous : "";
  $("#accountingCenterList").innerHTML = scopeAccountingCenters(projectCenters, select.value).map((row) => `<button type="button" class="accounting-center-chip ${row.costCenter === select.value ? "selected" : ""}" data-center="${escapeHtml(row.costCenter)}"><strong>${escapeHtml(row.costCenter || "Sin CC")}</strong><span>${escapeHtml(row.project?.projectName || "Ficha pendiente")} · ${number(row.sourceRows)} filas</span></button>`).join("");
}

function renderPartyOptions() {
  // Las sugerencias globales no deben exponer terceros de otros centros cuando hay un proyecto seleccionado.
  $("#accountingPartyOptions").innerHTML = $("#accountingCenter").value ? ""
    : parties.map((party) => `<option value="${escapeHtml(party.third_party_name)}"></option>`).join("");
}

function renderAccountingCosts() {
  const selectedCode = $("#accountingCenter").value;
  const rows = scopeAccountingCenters(projectCenters, selectedCode);
  const sum = (key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  $("#accountingRowCount").textContent = number(sum("sourceRows"));
  $("#accountingCenterCount").textContent = number(rows.filter((row) => row.sourceRows > 0).length);
  $("#accountingCenterHelp").textContent = selectedCode
    ? `Mostrando solo ${selectedCode}${rows[0]?.project ? ` · ${rows[0].project.projectName}` : ""}. Los demás centros no se incluyen en estos totales.`
    : "Vista general por centro de costo. Selecciona uno para ver sus movimientos y registros adicionales.";
  $("#accountingShowAll").hidden = !selectedCode;
  $("#accountingExpenses").textContent = cop(sum("expenses"));
  $("#accountingSalesCosts").textContent = cop(sum("salesCosts"));
  $("#accountingProductionCosts").textContent = cop(sum("productionCosts"));
  $("#accountingCostLines").textContent = number(sum("classifiedLines"));
  const fromFile = rows.filter((row) => row.sourceRows > 0);
  $("#accountingLinkedCount").textContent = number(fromFile.filter((row) => row.project).length);
  $("#accountingPendingCount").textContent = number(fromFile.filter((row) => !row.project).length);
  $("#accountingCostRows").innerHTML = rows.map((row) => `
    <tr class="${row.costCenter === $("#accountingCenter").value ? "accounting-selected-row" : ""}">
      <td><strong>${escapeHtml(row.costCenter || "Sin CC")}</strong>${row.codes.length > 1 ? `<small class="accounting-muted">También: ${escapeHtml(row.codes.filter((code) => code !== row.costCenter).join(", "))}</small>` : ""}</td>
      <td><strong>${escapeHtml(row.project?.projectName || (row.ambiguous ? "Revisar código duplicado" : "Ficha pendiente"))}</strong><small class="accounting-muted">${row.project ? "Proyecto vinculado por CC" : "Se vinculará al cargar su ficha"}</small></td>
      <td>${number(row.classifiedLines)}</td><td class="text-end">${cop(row.expenses)}</td>
      <td class="text-end">${cop(row.salesCosts)}</td><td class="text-end">${cop(row.productionCosts)}</td>
      <td class="text-end">${cop(row.manualCosts + row.manualExpenses)}<small class="accounting-muted">${number(row.manualLines)} registro(s)</small></td>
      <td><button type="button" class="table-action" data-accounting-cost-center="${escapeHtml(row.costCenter)}">Ver movimientos</button>${row.project ? `<a class="table-action accounting-project-link" href="#detail/${encodeURIComponent(row.project.projectId)}">Abrir ficha</a>` : ""}</td>
    </tr>`).join("");
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
    ? "Este centro ya tiene ficha de proyecto, pero no tiene filas en el archivo seleccionado. Consulta sus registros adicionales más abajo."
    : selected && !selected.project
      ? "Los movimientos de este centro están guardados. Su nombre y contrato aparecerán cuando se cargue la ficha del proyecto con el mismo código."
      : "Los movimientos contables y los registros adicionales se presentan por separado para poder conciliarlos.";
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
  const [centerRows, costRows, partyRows, manualRows] = await Promise.all([
    batch ? gateway.listAccountingCenters(batch.id) : [],
    batch ? gateway.listAccountingCostCenters(batch.id) : [],
    batch ? gateway.listAccountingParties(batch.id) : [],
    gateway.listCostsExpenses({})
  ]);
  centers = centerRows; parties = partyRows;
  projectCenters = projectAccountingCenters(centers, costRows, window.SOINSOLAR_APP_API.projects(), manualRows);
  const activeProject = window.SOINSOLAR_APP_API.projects().find((item) => item.projectId === window.SOINSOLAR_APP_API.selectedProjectId());
  const activeCenter = projectCenters.find((row) => activeProject && row.key === centerKey(activeProject.costCenter));
  const preferredCenter = activeCenter?.costCenter ?? $("#accountingCenter").value;
  $("#accountingExportButton").disabled = !batch || batch.status !== "complete";
  renderCenters();
  if (projectCenters.some((row) => row.costCenter === preferredCenter)) {
    if ($("#accountingCenter").value !== preferredCenter) $("#accountingParty").value = "";
    $("#accountingCenter").value = preferredCenter;
    renderCenters();
  }
  renderPartyOptions();
  displayedCenter = $("#accountingCenter").value;
  renderAccountingCosts();
  page = 0;
  await loadPage();
  if (batch?.status === "importing") message("Esta importación quedó incompleta. Selecciona el mismo archivo para continuar.", true);
}

async function refresh(preferredId) {
  const api = window.SOINSOLAR_APP_API;
  if (!api?.profile()?.active) return;
  const gateway = await api.gateway();
  $("#accountingImportButton").hidden = gateway.mode !== "supabase" || api.profile().role !== "administrador";
  if (gateway.mode !== "supabase") { $("#accountingExportButton").disabled = true; message("El auxiliar contable se consulta desde la aplicación conectada."); return; }
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

function openRaw(rowNumber) {
  const row = visible.find((item) => item.row_number === Number(rowNumber));
  if (!row) return;
  $("#accountingDetailTitle").textContent = `Fila ${row.row_number} · ${row.cost_center || "Sin CC"}`;
  $("#accountingDetail").innerHTML = row.raw_cells.map((value, index) => `<div class="accounting-field"><span>${index + 1}. ${escapeHtml(AUXILIARY_COLUMNS[index])}</span><strong>${escapeHtml(value) || "(vacío)"}</strong></div>`).join("");
  $("#accountingDetailDialog").showModal();
}

function selectCenter(code, scroll = false) {
  if (displayedCenter !== code) $("#accountingParty").value = "";
  $("#accountingCenter").value = code;
  displayedCenter = code;
  renderCenters(); renderPartyOptions();
  renderAccountingCosts();
  const row = projectCenters.find((item) => item.costCenter === code);
  document.dispatchEvent(new CustomEvent("soinsolar:accounting-center-selected", {
    detail: { centerCode: code, projectId: row?.project?.projectId ?? null }
  }));
  page = 0;
  loadPage().catch((error) => message(error.message, true));
  if (scroll) $("#accountingFilters").scrollIntoView({ behavior: "smooth", block: "start" });
}

function wire() {
  document.addEventListener("soinsolar:costs-open", () => refresh().catch((error) => message(error.message, true)));
  $("#accountingImportButton").addEventListener("click", () => $("#accountingFile").click());
  $("#accountingFile").addEventListener("change", importFile);
  $("#accountingExportButton").addEventListener("click", exportOriginal);
  $("#accountingBatch").addEventListener("change", () => loadBatch().catch((error) => message(error.message, true)));
  $("#accountingCenter").addEventListener("change", (event) => selectCenter(event.target.value));
  $("#accountingFilters").addEventListener("submit", (event) => { event.preventDefault(); page = 0; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingShowAll").addEventListener("click", () => selectCenter(""));
  $("#accountingClear").addEventListener("click", () => {
    for (const id of ["accountingAccount", "accountingParty", "accountingSearch", "accountingFrom", "accountingTo"]) $("#" + id).value = "";
    const projectId = window.SOINSOLAR_APP_API.selectedProjectId();
    const active = window.SOINSOLAR_APP_API.projects().find((row) => row.projectId === projectId);
    const projectCenter = projectCenters.find((row) => active && row.key === centerKey(active.costCenter));
    selectCenter(projectCenter?.costCenter ?? "");
  });
  $("#accountingCostRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-accounting-cost-center]");
    if (!button) return;
    $("#accountingAccount").value = ""; // The CC detail includes all source accounts.
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
    renderCenters(); renderPartyOptions(); renderAccountingCosts(); page = 0;
    loadPage().catch((error) => message(error.message, true));
  });
  document.addEventListener("soinsolar:costs-manual-updated", () => loadBatch().catch((error) => message(error.message, true)));
  $("#accountingRows").addEventListener("click", (event) => { if (event.target.dataset.rawRow) openRaw(event.target.dataset.rawRow); });
  $("#accountingPrevious").addEventListener("click", () => { page--; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingNext").addEventListener("click", () => { page++; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingCloseDetail").addEventListener("click", () => $("#accountingDetailDialog").close());
  window.addEventListener("soinsolar:logout", () => {
    batches = []; centers = []; projectCenters = []; parties = []; visible = []; page = 0; count = 0; displayedCenter = "";
    $("#accountingBatch").replaceChildren(); $("#accountingCenter").value = "";
    $("#accountingCostRows").replaceChildren(); $("#accountingRows").replaceChildren();
    $("#accountingCenterList").replaceChildren(); message();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
