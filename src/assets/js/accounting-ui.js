import { AUXILIARY_COLUMNS, auxiliaryCsv, normalizeAuxiliaryRows, parseAuxiliaryCsv } from "./domain/accounting-auxiliary.js?v=1.14.0";

const $ = (selector) => document.querySelector(selector);
const cop = (value) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2 }).format(Number(value ?? 0));
const number = (value) => new Intl.NumberFormat("es-CO").format(Number(value ?? 0));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let batches = [], centers = [], visible = [], page = 0, count = 0, loading = false;

function message(value = "", error = false) {
  const node = $("#accountingMessage");
  node.textContent = value;
  node.classList.toggle("error", error);
}

function selectedBatch() { return batches.find((batch) => batch.id === $("#accountingBatch").value); }
function filters() {
  const dateFrom = $("#accountingFrom").value, dateTo = $("#accountingTo").value;
  if (dateFrom && dateTo && dateFrom > dateTo) throw new Error("La fecha inicial es posterior a la final.");
  return {
    costCenter: $("#accountingCenter").value,
    account: $("#accountingAccount").value.trim(), party: $("#accountingParty").value.trim(),
    search: $("#accountingSearch").value.trim(), dateFrom, dateTo
  };
}

function renderCenters() {
  const select = $("#accountingCenter");
  const previous = select.value;
  select.innerHTML = `<option value="">Todos (${number(centers.reduce((sum, row) => sum + row.row_count, 0))})</option>`
    + centers.map((row) => `<option value="${escapeHtml(row.cost_center)}">${escapeHtml(row.cost_center || "Sin CC")} · ${number(row.row_count)}</option>`).join("");
  select.value = centers.some((row) => row.cost_center === previous) ? previous : "";
  $("#accountingCenterList").innerHTML = centers.map((row) => `<button type="button" class="accounting-center-chip ${row.cost_center === select.value ? "selected" : ""}" data-center="${escapeHtml(row.cost_center)}"><strong>${escapeHtml(row.cost_center || "Sin CC")}</strong><span>${number(row.row_count)} filas</span></button>`).join("");
}

function renderAccountingCosts(rows) {
  const sum = (key) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  $("#accountingExpenses").textContent = cop(sum("expenses"));
  $("#accountingSalesCosts").textContent = cop(sum("sales_costs"));
  $("#accountingProductionCosts").textContent = cop(sum("production_costs"));
  $("#accountingCostLines").textContent = number(sum("cost_expense_lines"));
  $("#accountingCostRows").innerHTML = rows.filter((row) => row.cost_expense_lines > 0).map((row) => `
    <tr><td><button type="button" class="table-action" data-accounting-cost-center="${escapeHtml(row.cost_center)}">${escapeHtml(row.cost_center || "Sin CC")}</button></td>
    <td>${number(row.cost_expense_lines)}</td><td class="text-end">${cop(row.expenses)}</td>
    <td class="text-end">${cop(row.sales_costs)}</td><td class="text-end">${cop(row.production_costs)}</td></tr>`).join("");
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
  const [centerRows, costRows, parties] = batch ? await Promise.all([
    gateway.listAccountingCenters(batch.id), gateway.listAccountingCostCenters(batch.id), gateway.listAccountingParties(batch.id)
  ]) : [[], [], []];
  centers = centerRows;
  renderAccountingCosts(costRows);
  $("#accountingPartyOptions").innerHTML = parties.map((party) => `<option value="${escapeHtml(party.third_party_name)}"></option>`).join("");
  $("#accountingRowCount").textContent = number(batch?.expected_rows);
  $("#accountingCenterCount").textContent = number(centers.length);
  $("#accountingDebits").textContent = cop(batch?.total_debit);
  $("#accountingCredits").textContent = cop(batch?.total_credit);
  $("#accountingExportButton").disabled = !batch || batch.status !== "complete";
  renderCenters();
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
    message("Preparando todas las filas originales…");
    const rows = [];
    for await (const chunk of (await window.SOINSOLAR_APP_API.gateway()).accountingRawPages(batch.id)) {
      rows.push(...chunk.map((item) => item.raw_cells));
      message(`Descargando ${number(rows.length)} de ${number(batch.expected_rows)} filas…`);
    }
    if (rows.length !== batch.expected_rows) throw new Error(`La descarga tiene ${rows.length} de ${batch.expected_rows} filas. Intenta nuevamente.`);
    const blob = new Blob(["\uFEFF", auxiliaryCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `auxiliar-contable-${batch.id}.csv`; link.click();
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

function wire() {
  document.addEventListener("soinsolar:costs-open", () => refresh().catch((error) => message(error.message, true)));
  $("#accountingImportButton").addEventListener("click", () => $("#accountingFile").click());
  $("#accountingFile").addEventListener("change", importFile);
  $("#accountingExportButton").addEventListener("click", exportOriginal);
  $("#accountingBatch").addEventListener("change", () => loadBatch().catch((error) => message(error.message, true)));
  $("#accountingFilters").addEventListener("submit", (event) => { event.preventDefault(); page = 0; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingClear").addEventListener("click", () => {
    $("#accountingCenter").value = "";
    for (const id of ["accountingAccount", "accountingParty", "accountingSearch", "accountingFrom", "accountingTo"]) $("#" + id).value = "";
    renderCenters(); page = 0; loadPage().catch((error) => message(error.message, true));
  });
  $("#accountingCostRows").addEventListener("click", (event) => {
    const button = event.target.closest("[data-accounting-cost-center]");
    if (!button) return;
    $("#accountingCenter").value = button.dataset.accountingCostCenter;
    $("#accountingAccount").value = ""; // The CC detail includes all source accounts.
    renderCenters(); page = 0; loadPage().catch((error) => message(error.message, true));
    $("#accountingFilters").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#accountingCenterList").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-center]");
    if (!chip) return;
    $("#accountingCenter").value = chip.dataset.center;
    renderCenters(); page = 0; loadPage().catch((error) => message(error.message, true));
  });
  $("#accountingRows").addEventListener("click", (event) => { if (event.target.dataset.rawRow) openRaw(event.target.dataset.rawRow); });
  $("#accountingPrevious").addEventListener("click", () => { page--; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingNext").addEventListener("click", () => { page++; loadPage().catch((error) => message(error.message, true)); });
  $("#accountingCloseDetail").addEventListener("click", () => $("#accountingDetailDialog").close());
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
