import { PROJECT_IMPORT_HEADERS, extractLegacyProjectRows, parseProjectCsv, referencedContractValue, resolveProjectImportRows } from "./domain/project-import.js?v=1.18.3";
import { createXlsx } from "./domain/xlsx-export.js?v=1.17.0";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
let pending = null, busy = false;

function message(value, error = false, selector = "#projectImportMessage") {
  const node = $(selector);
  node.textContent = value;
  node.classList.toggle("error", error);
}

function template() {
  const blob = createXlsx([projectSheet([])]);
  download(blob, "formato-proyectos-soinsolar.xlsx");
}

function projectSheet(rows, months = []) {
  const headers = [...PROJECT_IMPORT_HEADERS, ...months.map((month) => `Facturado ${month}`)];
  return { name: "Proyectos", headers, rows,
    types: headers.map((_, index) => index === 6 ? "number" : [11, 13].includes(index) || index >= PROJECT_IMPORT_HEADERS.length ? "money" : "text"),
    freezeColumns: 2, columnWidths: [20, 34, 22, 28, 16, 26, 16, 18, 18, 20, 44, 22, 28, 22, 18, ...months.map(() => 22)] };
}

function download(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readRows(file) {
  if (/\.csv$/i.test(file.name)) return { rows: parseProjectCsv(await file.text()), issues: [], legacy: false };
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo CSV o Excel de proyectos.");
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel.");
  const book = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  if (book.SheetNames.length === 1 && !/^PROYECTOS FV$/i.test(book.SheetNames[0])) {
    return { rows: window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],
      { defval: "", blankrows: false, raw: true }), issues: [], legacy: false };
  }
  const names = book.SheetNames.filter((name) => /^PROYECTOS FV$|^AVANCE DE PROYECTOS|^PENDEINTE 2024$|^PENDIENTE 2024$|^OTROS$|^VISITAS Y OTROS$/i.test(name));
  const sheets = names.map((name) => ({ name, rows: window.XLSX.utils.sheet_to_json(book.Sheets[name],
    { header: 1, defval: "", blankrows: true, raw: true }) }));
  return { ...extractLegacyProjectRows(sheets), legacy: true };
}

function showPreview(result, fileName, legacy, issues) {
  pending = { rows: result.sourceRows, valid: result.valid, skipped: result.skipped, fileName, legacy, issues };
  const contracts = result.valid.filter((row) => row.contractValue != null).length;
  const billed = result.valid.filter((row) => row.importedBilledTotal !== 0).length;
  $("#projectImportSummary").textContent = `${fileName}: ${result.valid.length} proyecto(s) nuevo(s); ${contracts} valor(es) contractuales y ${billed} registro(s) con facturación en campos financieros; ${result.skipped.length} existente(s) sin cambios; ${issues.length} caso(s) para revisar. ${result.valid.length > 12 ? "Vista previa de los primeros 12; se guardarán todos los válidos." : ""}`;
  $("#projectImportRows").innerHTML = result.valid.slice(0, 12).map((row) => `<tr>
    <td>${escapeHtml(row.sourceSheet || "Proyectos")} · ${row.rowNumber}</td><td><strong>${escapeHtml(row.costCenter)}</strong></td>
    <td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.municipality)}</td>
    <td>${escapeHtml(row.serviceType)}</td><td>${row.contractValue == null ? "Sin valor" : escapeHtml(new Intl.NumberFormat("es-CO").format(row.contractValue))}</td><td>${escapeHtml(new Intl.NumberFormat("es-CO").format(row.importedBilledTotal))}</td>
  </tr>`).join("");
  $("#projectImportIssues").hidden = !issues.length;
  $("#projectImportIssues").textContent = issues.slice(0, 5).map((issue) =>
    `${issue.sourceSheet || "Proyectos"} · fila ${issue.rowNumber || "?"} · CC ${issue.costCenter || "sin CC"}: ${issue.reason}`).join("\n") +
    (issues.length > 5 ? `\n… y ${issues.length - 5} más. Descarga la lista completa.` : "");
  $("#projectImportDownloadIssues").hidden = !issues.length;
  message("", false, "#projectImportPreviewMessage");
  $("#projectImportSave").disabled = !result.valid.length;
  $("#projectImportSave").textContent = result.valid.length ? `Guardar ${result.valid.length} proyecto(s)` : "No hay proyectos nuevos";
  $("#projectImportDialog").showModal();
}

function downloadIssues() {
  if (!pending?.issues.length) return;
  const safe = (value) => {
    const text = String(value ?? "");
    return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
  };
  const lines = [["Hoja", "Fila", "Centro de costo", "Motivo"], ...pending.issues.map((issue) =>
    [issue.sourceSheet, issue.rowNumber, issue.costCenter, issue.reason])];
  download(new Blob(["\uFEFF", lines.map((row) => row.map(safe).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" }), "proyectos-por-revisar.csv");
}

async function exportProjects() {
  const button = $("#projectExportButton");
  button.disabled = true;
  try {
    const api = window.SOINSOLAR_APP_API;
    const gateway = await api.gateway();
    const [projects, summaries, contracts, invoices] = await Promise.all([
      gateway.listProjectDetails(), gateway.listProjects(), gateway.listContracts(), gateway.listInvoices()
    ]);
    const byProject = new Map(), invoiceByProject = new Map();
    const summaryByProject = new Map(summaries.map((summary) => [summary.projectId, summary]));
    const centers = new Map(projects.map((project) => [project.id, project.costCenter]));
    for (const contract of contracts) byProject.set(contract.projectId,
      [...(byProject.get(contract.projectId) ?? []), contract]);
    for (const invoice of invoices) if (invoice.status !== "anulada") invoiceByProject.set(invoice.projectId,
      [...(invoiceByProject.get(invoice.projectId) ?? []), invoice]);
    const monthlyByProject = new Map(projects.map((project) => {
      const months = { ...project.importedMonthlyBilled };
      for (const invoice of invoiceByProject.get(project.id) ?? []) {
        if (project.importedAsOf && invoice.issueDate <= project.importedAsOf) continue;
        const month = invoice.issueDate.slice(0, 7);
        months[month] = Math.round(((Number(months[month]) || 0) + invoice.amount) * 100) / 100;
      }
      return [project.id, months];
    }));
    const months = [...new Set([...monthlyByProject.values()].flatMap((monthly) => Object.keys(monthly)))].sort();
    const rows = projects.map((project) => {
      const linked = byProject.get(project.id) ?? [];
      const summary = summaryByProject.get(project.id);
      const monthly = monthlyByProject.get(project.id);
      return [project.costCenter, project.name, project.municipality, project.serviceType,
        project.status, project.clientName ?? "", project.powerKwp ?? "", project.startDate ?? "",
        project.endDate ?? "", centers.get(project.parentProjectId) ?? "", project.notes ?? "",
        summary?.contractValue || project.importedContractValue || referencedContractValue(project.notes) || "",
        linked.length === 1 ? linked[0].contractNumber : linked.length ? "Varios contratos" : "",
        summary?.totalInvoiced ?? project.importedBilledTotal ?? 0, project.importedAsOf ?? "",
        ...months.map((month) => monthly[month] ?? "")];
    });
    download(createXlsx([projectSheet(rows, months)]), `proyectos-soinsolar-${new Date().toISOString().slice(0, 10)}.xlsx`);
    message(`${rows.length} proyecto(s) exportados a Excel.`);
  } catch (error) { message(error.message || "No se pudo exportar la lista.", true); }
  finally { button.disabled = false; }
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file || busy) return;
  pending = null;
  $("#projectReviewIssuesButton").hidden = true;
  try {
    const api = window.SOINSOLAR_APP_API;
    if ((await api.gateway()).mode !== "supabase" || !api.profile()?.active || !["administrador", "gerencia"].includes(api.profile()?.role)) {
      throw new Error("La importación requiere una cuenta activa de administrador o gerencia.");
    }
    message(`Leyendo ${file.name}…`);
    const source = await readRows(file);
    const rows = source.rows;
    if (rows.length > 1000) throw new Error("El archivo tiene más de 1.000 filas. Divide la lista de proyectos en archivos más pequeños.");
    const result = resolveProjectImportRows(rows, api.projects(), () => crypto.randomUUID(),
      { reviewNameConflicts: source.legacy });
    if (result.errors.length && !source.legacy) {
      const sample = result.errors.slice(0, 6).map((error) => `Fila ${error.rowNumber}: ${error.reason}`).join(" · ");
      throw new Error(`${result.errors.length} fila(s) por corregir. No se guardó ninguna. ${sample}`);
    }
    const issues = [...source.issues, ...result.conflicts, ...result.errors];
    showPreview({ ...result, sourceRows: rows }, file.name, source.legacy, issues);
    message("Archivo revisado. Confirma la importación en la ventana de vista previa.");
  } catch (error) { pending = null; message(error.message || "No se pudo leer el archivo.", true); }
  finally { event.target.value = ""; }
}

async function save() {
  if (!pending || busy || !pending.valid.length) return;
  busy = true;
  const button = $("#projectImportSave");
  button.disabled = true;
  button.textContent = "Guardando…";
  try {
    const api = window.SOINSOLAR_APP_API;
    const gateway = await api.gateway();
    // Otra cuenta pudo crear una ficha desde que se abrió la vista previa.
    const fresh = resolveProjectImportRows(pending.rows, await gateway.listProjects(), () => crypto.randomUUID(),
      { reviewNameConflicts: pending.legacy });
    if ((!pending.legacy && fresh.errors.length) || fresh.valid.length !== pending.valid.length || fresh.skipped.length !== pending.skipped.length) {
      throw new Error("La lista de proyectos cambió. Selecciona el archivo de nuevo para revisar los centros antes de guardar.");
    }
    const count = await gateway.createProjects(fresh.valid);
    $("#projectImportDialog").close();
    $("#projectReviewIssuesButton").hidden = !pending.issues.length;
    message(`${count} proyecto(s) importados. Las fichas existentes quedaron intactas. ${pending.issues.length ? `${pending.issues.length} centro(s) requieren revisión; descarga la lista.` : ""}`);
    pending = { ...pending, valid: [] };
    await api.refresh();
  } catch (error) { message(error.message || "No se pudieron guardar los proyectos.", true, "#projectImportPreviewMessage"); }
  finally { busy = false; button.disabled = false; }
}

function wire() {
  document.addEventListener("soinsolar:projects-open", async () => {
    const api = window.SOINSOLAR_APP_API;
    if (api?.profile()?.active) {
      const live = (await api.gateway()).mode === "supabase";
      $("#projectImportButton").hidden = !live || !["administrador", "gerencia"].includes(api.profile()?.role);
      $("#projectExportButton").hidden = !live;
    }
  });
  $("#projectTemplateButton").addEventListener("click", template);
  $("#projectExportButton").addEventListener("click", exportProjects);
  $("#projectImportDownloadIssues").addEventListener("click", downloadIssues);
  $("#projectReviewIssuesButton").addEventListener("click", downloadIssues);
  $("#projectImportButton").addEventListener("click", () => $("#projectImportFile").click());
  $("#projectImportFile").addEventListener("change", importFile);
  $("#projectImportSave").addEventListener("click", save);
  for (const id of ["projectImportClose", "projectImportCancel"]) $("#" + id).addEventListener("click", () => $("#projectImportDialog").close());
  window.addEventListener("soinsolar:logout", () => { pending = null; $("#projectReviewIssuesButton").hidden = true; if ($("#projectImportDialog").open) $("#projectImportDialog").close(); message(""); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
