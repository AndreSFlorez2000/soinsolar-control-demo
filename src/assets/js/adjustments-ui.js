import { incrementalExecutionPercent } from "./domain/execution.js?v=1.4.1";
import { parseCostCsv, resolveCostImportRows } from "./domain/cost-import.js?v=1.5.7";
import { financialAdvance } from "./domain/financial.js?v=1.4.1";
import { buildMonthlyExecutionReport } from "./domain/reports.js?v=1.5.7";
import { monthlyWorkbookSheets } from "./domain/monthly-workbook.js?v=1.5.7";
import { createXlsx } from "./domain/xlsx-export.js?v=1.5.7";

function api() {
  if (!window.SOINSOLAR_APP_API) throw new Error("La aplicación todavía no está lista.");
  return window.SOINSOLAR_APP_API;
}

function formatPercent(value) {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(value ?? 0)) + "%";
}

function periodBefore(candidate, target) {
  return candidate.year < target.year || (candidate.year === target.year && candidate.month < target.month);
}

function previousExecution(projectId, periodId, trackingId = "") {
  const periods = api().periods();
  const target = periods.find((item) => item.id === periodId);
  if (!target) return 0;
  return api().monthly()
    .filter((row) => row.projectId === projectId && row.trackingId !== trackingId && row.executedCumulativePercentage !== null)
    .filter((row) => periodBefore(row, target))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0]?.executedCumulativePercentage ?? 0;
}

function updateExecutionPreview() {
  const cumulativeInput = document.querySelector("#monthlyExecutionPercentage");
  const preview = document.querySelector("#monthlyIncrementPreview");
  const financialPreview = document.querySelector("#monthlyFinancialPreview");
  if (!cumulativeInput || !preview) return;
  const projectId = document.querySelector("#monthlyProject")?.value ?? "";
  const periodId = document.querySelector("#monthlyPeriod")?.value ?? "";
  const trackingId = document.querySelector("#monthlyTrackingId")?.value ?? "";
  const project = api().projects().find((item) => item.projectId === projectId);
  const target = api().periods().find((item) => item.id === periodId);
  const latestBilling = api().monthly()
    .filter((row) => row.projectId === projectId && target && (periodBefore(row, target) || (row.year === target.year && row.month === target.month)))
    .sort((a, b) => b.year - a.year || b.month - a.month)[0];
  if (financialPreview) {
    financialPreview.value = Number(project?.contractValue ?? 0) > 0
      ? formatPercent(financialAdvance(
        Number(latestBilling?.cumulativeInvoicedValue ?? 0), Number(project.contractValue)
      )) : "Sin contrato";
  }
  const cumulative = Number(cumulativeInput.value || 0);
  const previous = previousExecution(projectId, periodId, trackingId);
  try {
    const incremental = incrementalExecutionPercent(cumulative, previous);
    preview.value = formatPercent(incremental);
  } catch (error) {
    preview.value = error.message;
  }
}

function exportMonthly() {
  const visible = api().visibleMonthly();
  const rows = buildMonthlyExecutionReport(api().projects(), visible, api().monthly());

  if (!rows.length) {
    window.alert("No hay periodos mensuales para exportar.");
    return;
  }

  const blob = createXlsx(monthlyWorkbookSheets(rows));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "seguimiento-mensual-" + new Date().toISOString().slice(0, 10) + ".xlsx";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function readImportRows(file) {
  if (/\.csv$/i.test(file.name)) return parseCostCsv(await file.text());
  if (!window.XLSX) throw new Error("No fue posible cargar el lector de Excel.");
  const workbook = window.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames.find((name) => name.trim().toLocaleLowerCase("es") === "costos y gastos")
    ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo Excel no contiene hojas para importar.");
  return window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", blankrows: false });
}

function setCostMessage(message, isError = false) {
  const element = document.querySelector("#costModuleMessage");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("error", isError);
}

async function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  setCostMessage("Validando archivo…");
  try {
    const rows = await readImportRows(file);
    const result = resolveCostImportRows(rows, {
      projects: api().projects(),
      periods: api().periods()
    });
    if (result.errors.length) {
      const detail = result.errors.slice(0, 5)
        .map((item) => "Fila " + item.rowNumber + ": " + item.errors.join("; "))
        .join(" | ");
      throw new Error("Importación cancelada. " + result.errors.length + " fila(s) con error. " + detail);
    }
    if (!result.valid.length) throw new Error("El archivo no contiene movimientos válidos.");
    if (result.valid.length > 500) throw new Error("El archivo supera 500 movimientos. Divídelo en archivos más pequeños.");

    const gateway = await api().gateway();
    await gateway.createCostsExpenses(result.valid);
    await api().reloadReferenceData();
    setCostMessage(result.valid.length + " movimiento(s) importados correctamente.");
    document.querySelector("#refreshAppButton")?.click();
  } catch (error) {
    setCostMessage(error.message || "No fue posible importar los costos.", true);
  } finally {
    event.target.value = "";
  }
}

function wire() {
  document.querySelector("#exportMonthlyButton")?.addEventListener("click", exportMonthly);
  document.querySelector("#importCostsButton")?.addEventListener("click", () => document.querySelector("#costImportFile")?.click());
  document.querySelector("#costImportFile")?.addEventListener("change", handleImport);
  ["monthlyExecutionPercentage", "monthlyProject", "monthlyPeriod"].forEach((id) => {
    document.querySelector("#" + id)?.addEventListener("input", updateExecutionPreview);
    document.querySelector("#" + id)?.addEventListener("change", updateExecutionPreview);
  });

  const monthlyDialog = document.querySelector("#monthlyDialog");
  monthlyDialog?.addEventListener("toggle", updateExecutionPreview);
  monthlyDialog?.addEventListener("click", () => queueMicrotask(updateExecutionPreview));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire, { once: true });
else wire();
