import { PROJECT_IMPORT_HEADERS, parseProjectCsv, resolveProjectImportRows } from "./domain/project-import.js?v=1.16.0";

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
  const header = PROJECT_IMPORT_HEADERS.map((value) => `"${value.replaceAll('"', '""')}"`).join(",");
  const blob = new Blob(["\uFEFF", header, "\r\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "formato-proyectos-soinsolar.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readRows(file) {
  if (/\.csv$/i.test(file.name)) return parseProjectCsv(await file.text());
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Selecciona un archivo CSV o Excel de proyectos.");
  if (!window.XLSX) throw new Error("No se pudo cargar el lector de Excel.");
  const book = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  if (book.SheetNames.length !== 1) throw new Error("El Excel debe contener una sola hoja de proyectos para no omitir información de otras hojas.");
  return window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "", blankrows: false, raw: false });
}

function showPreview(result, fileName) {
  pending = { rows: result.sourceRows, valid: result.valid, skipped: result.skipped, fileName };
  $("#projectImportSummary").textContent = `${fileName}: ${result.valid.length} proyecto(s) nuevo(s) para guardar; ${result.skipped.length} centro(s) ya existentes que se conservarán sin cambiar. ${result.valid.length > 12 ? "Se muestran los primeros 12; se guardarán todos los nuevos." : ""}`;
  $("#projectImportRows").innerHTML = result.valid.slice(0, 12).map((row) => `<tr>
    <td>${row.rowNumber}</td><td><strong>${escapeHtml(row.costCenter)}</strong></td>
    <td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.municipality)}</td>
    <td>${escapeHtml(row.serviceType)}</td><td>${escapeHtml(row.status)}</td>
  </tr>`).join("");
  message("", false, "#projectImportPreviewMessage");
  $("#projectImportSave").disabled = !result.valid.length;
  $("#projectImportSave").textContent = result.valid.length ? `Guardar ${result.valid.length} proyecto(s)` : "No hay proyectos nuevos";
  $("#projectImportDialog").showModal();
}

async function importFile(event) {
  const file = event.target.files?.[0];
  if (!file || busy) return;
  try {
    const api = window.SOINSOLAR_APP_API;
    if ((await api.gateway()).mode !== "supabase" || !api.profile()?.active || !["administrador", "gerencia"].includes(api.profile()?.role)) {
      throw new Error("La importación requiere una cuenta activa de administrador o gerencia.");
    }
    message(`Leyendo ${file.name}…`);
    const rows = await readRows(file);
    if (rows.length > 1000) throw new Error("El archivo tiene más de 1.000 filas. Divide la lista de proyectos en archivos más pequeños.");
    const result = resolveProjectImportRows(rows, api.projects());
    if (result.errors.length) {
      const sample = result.errors.slice(0, 6).map((error) => `Fila ${error.rowNumber}: ${error.reason}`).join(" · ");
      throw new Error(`${result.errors.length} fila(s) por corregir. No se guardó ninguna. ${sample}`);
    }
    showPreview({ ...result, sourceRows: rows }, file.name);
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
    const fresh = resolveProjectImportRows(pending.rows, await gateway.listProjects());
    if (fresh.errors.length || fresh.valid.length !== pending.valid.length || fresh.skipped.length !== pending.skipped.length) {
      throw new Error("La lista de proyectos cambió. Selecciona el archivo de nuevo para revisar los centros antes de guardar.");
    }
    const count = await gateway.createProjects(fresh.valid);
    $("#projectImportDialog").close();
    pending = null;
    message(`${count} proyecto(s) creados y vinculables por centro de costo. Los centros que ya existían se conservaron.`);
    await api.refresh();
  } catch (error) { message(error.message || "No se pudieron guardar los proyectos.", true, "#projectImportPreviewMessage"); }
  finally { busy = false; button.disabled = false; }
}

function wire() {
  document.addEventListener("soinsolar:projects-open", async () => {
    const api = window.SOINSOLAR_APP_API;
    if (api?.profile()?.active) $("#projectImportButton").hidden = (await api.gateway()).mode !== "supabase" || !["administrador", "gerencia"].includes(api.profile()?.role);
  });
  $("#projectTemplateButton").addEventListener("click", template);
  $("#projectImportButton").addEventListener("click", () => $("#projectImportFile").click());
  $("#projectImportFile").addEventListener("change", importFile);
  $("#projectImportSave").addEventListener("click", save);
  for (const id of ["projectImportClose", "projectImportCancel"]) $("#" + id).addEventListener("click", () => $("#projectImportDialog").close());
  window.addEventListener("soinsolar:logout", () => { pending = null; if ($("#projectImportDialog").open) $("#projectImportDialog").close(); message(""); });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
