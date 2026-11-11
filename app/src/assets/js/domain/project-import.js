import { projectInputToRecord } from "../data/models.js?v=1.18.10";
import { parseCostCsv } from "./cost-import.js?v=1.16.0";
import { centerKey } from "./accounting-projects.js?v=1.16.0";

export const PROJECT_IMPORT_HEADERS = Object.freeze([
  "Centro de costo", "Nombre del proyecto", "Municipio", "Tipo de servicio",
  "Estado", "Cliente", "Potencia kWp", "Fecha de inicio", "Fecha de finalización",
  "Centro principal", "Observaciones", "Valor del contrato", "Número de contrato",
  "Facturado acumulado", "Corte de facturación", "Avance ejecución Excel (%)",
  "Mes informado de ejecución", "Notas de seguimiento Excel", "Referencias factura Excel",
  "Facturado sin mes (Excel)"
]);

// Compatibilidad con las exportaciones anteriores, que dejaban el valor en notas.
export function referencedContractValue(notes) {
  const match = String(notes ?? "").match(/(?:^|·\s*)Valor contractual en (?:Excel|archivo):\s*(\d+(?:\.\d+)?)(?=\s*(?:·|$))/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

const columns = {
  costCenter: ["centro_de_costo", "centro_de_costos", "cost_center", "cc"],
  name: ["nombre_del_proyecto", "nombre", "proyecto", "name"],
  municipality: ["municipio", "ciudad", "municipality"],
  serviceType: ["tipo_de_servicio", "servicio", "service_type"],
  status: ["estado", "status"], clientName: ["cliente", "client_name"],
  powerKwp: ["potencia_kwp", "potencia", "power_kwp", "kwp"],
  startDate: ["fecha_de_inicio", "fecha_inicio", "start_date"],
  endDate: ["fecha_de_finalizacion", "fecha_fin", "end_date"],
  parentCenter: ["centro_principal", "centro_de_costo_principal", "parent_cost_center"],
  notes: ["observaciones", "notas", "notes"],
  contractValue: ["valor_del_contrato", "valor_contrato", "contract_value"],
  contractNumber: ["numero_de_contrato", "numero_contrato", "contract_number"],
  billedTotal: ["facturado_acumulado", "total_facturado", "billed_total"],
  billedAsOf: ["corte_de_facturacion", "fecha_de_corte", "imported_as_of"],
  executionSnapshot: ["avance_ejecucion_excel", "avance_ejecucion_excel_", "avance_de_ejecucion_excel"],
  executionMonth: ["mes_informado_de_ejecucion"],
  followupNotes: ["notas_de_seguimiento_excel"],
  invoiceReferences: ["referencias_factura_excel"],
  undatedBilled: ["facturado_sin_mes_excel", "facturado_sin_mes"]
};

const headerKey = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

function sourceValues(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [headerKey(key), value]));
}

function field(values, aliases) {
  const alias = aliases.find((key) => values[key] !== undefined && values[key] !== null && String(values[key]).trim());
  return alias ? values[alias] : "";
}

function dateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
  const iso = match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("fecha inválida; usa AAAA-MM-DD");
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error("fecha imposible");
  return iso;
}

function powerValue(value) {
  if (value === "" || value === null || value === undefined) return null;
  const text = String(value).trim().replace(/\s/g, "");
  const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
  const normalized = comma >= 0 && dot >= 0
    ? comma > dot ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", "")
    : text.replace(",", ".");
  const power = Number(normalized);
  if (!Number.isFinite(power) || power < 0 || power > 999999999.999) throw new Error("potencia inválida");
  if (Math.abs(power * 1000 - Math.round(power * 1000)) > 1e-6) throw new Error("la potencia admite hasta tres decimales");
  return power;
}

function contractValue(value) {
  if (value === "" || value == null || value === 0 || value === "0") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0 || value > 9999999999999999) throw new Error("valor contractual inválido");
    return Math.round(value * 100) / 100;
  }
  const text = String(value).trim().replace(/[$\s]/g, "");
  const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
  const normalized = comma >= 0 && dot >= 0
    ? comma > dot ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", "")
    : comma >= 0 ? text.replace(",", ".") : text;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number <= 0 || number > 9999999999999999 ||
      Math.abs(number * 100 - Math.round(number * 100)) > 0.01) {
    throw new Error("valor contractual inválido; usa un valor positivo con máximo dos decimales");
  }
  return Math.round(number * 100) / 100;
}

const projectCenter = (value) => {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return text;
  return /^\d+\.0+$/.test(text) ? text.slice(0, text.indexOf(".")) : "";
};

const monthFromHeader = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 7);
  const match = /^(20\d{2})[-/](0[1-9]|1[0-2]|[1-9])(?=[-/T\s]|$)/.exec(String(value ?? ""));
  return match ? `${match[1]}-${match[2].padStart(2, "0")}` : null;
};

const lastDayOfMonth = (month) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};

function billedAmount(value) {
  if (value === "" || value == null || value === 0 || value === "0") return 0;
  const text = String(value).trim().replace(/[$\s]/g, "");
  const comma = text.lastIndexOf(","), dot = text.lastIndexOf(".");
  const normalized = comma >= 0 && dot >= 0
    ? comma > dot ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", "")
    : comma >= 0 ? text.replace(",", ".") : text;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || Math.abs(amount) > 9999999999999999) throw new Error("valor facturado inválido");
  return Math.round(amount * 100) / 100;
}

function readMonthlyBilling(row, values) {
  const fromBook = row.__monthlyBilled__;
  const source = fromBook ?? Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => /^facturado_20\d{2}_(0[1-9]|1[0-2])$/.test(key) && value !== "" && value != null)
    .map(([key, value]) => [key.slice(10, 14) + "-" + key.slice(15), value]));
  const monthly = {};
  for (const [month, value] of Object.entries(source)) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("mes de facturación inválido");
    const amount = billedAmount(value);
    if (amount) monthly[month] = amount;
  }
  const monthlyTotal = Math.round(Object.values(monthly).reduce((sum, amount) => sum + amount, 0) * 100) / 100;
  const undated = billedAmount(row.__undatedBilled__ ?? field(values, columns.undatedBilled));
  if (undated < 0) throw new Error("el facturado sin mes debe ser positivo");
  const total = Math.round((monthlyTotal + undated) * 100) / 100;
  const stated = field(values, columns.billedTotal);
  if (stated !== "" && Object.keys(monthly).length && Math.abs(billedAmount(stated) - total) > 0.01) {
    throw new Error("el facturado acumulado no coincide con la suma de los meses");
  }
  return { monthly, total: Object.keys(monthly).length || undated ? total : billedAmount(stated), undated };
}

function readMonthlyPercentages(row, values) {
  const source = row.__monthlyPercentages__ ?? Object.fromEntries(Object.entries(values)
    .filter(([key, value]) => /^porcentaje_facturado_20\d{2}_(0[1-9]|1[0-2])$/.test(key) && value !== "" && value != null)
    .map(([key, value]) => [key.slice(21, 25) + "-" + key.slice(26), value]));
  const percentages = {};
  for (const [month, value] of Object.entries(source)) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("mes del porcentaje facturado inválido");
    const number = Number(String(value).replace(",", "."));
    if (!Number.isFinite(number) || Math.abs(number) > 10000) throw new Error("porcentaje facturado inválido");
    percentages[month] = Math.round(number * 100) / 100;
  }
  return percentages;
}

function legacyRows(sheet) {
  const header = sheet.rows.findIndex((row) =>
    String(row[0] ?? "").trim().toUpperCase() === "C COSTO" &&
    String(row[1] ?? "").trim().toUpperCase() === "NOMBRE");
  if (header < 0) return [];
  const contractColumn = sheet.rows[header].findIndex((value) =>
    String(value ?? "").trim().toUpperCase() === "VALOR CONTRATO");
  if (contractColumn < 0) return [];
  const descriptionColumn = sheet.rows[header].findIndex((value) =>
    String(value ?? "").trim().toUpperCase().startsWith("PROYECTO Y OBSERVACIONES"));
  const orderColumn = sheet.rows[header].findIndex((value) => /^O\.?C\.?$/i.test(String(value ?? "").trim()));
  const invoiceColumn = sheet.rows[header].findIndex((value) => /^N[ªº°]?\s*FAC$/i.test(String(value ?? "").trim()));
  const executionColumn = sheet.rows[header].findIndex((value) => /^%\s*AVANCE$/i.test(String(value ?? "").trim()));
  const executionMonthColumn = sheet.rows[header].findIndex((value) => /^MES$/i.test(String(value ?? "").trim()));
  const monthlyColumns = sheet.rows[header].flatMap((value, index) => {
    const month = monthFromHeader(value);
    return month && String(sheet.rows[header + 1]?.[index] ?? "").trim().toUpperCase() === "FACTURADO"
      ? [{ index, month, percentIndex: String(sheet.rows[header + 1]?.[index + 1] ?? "").trim() === "%" ? index + 1 : -1 }] : [];
  });
  const asOf = monthlyColumns.length ? lastDayOfMonth(monthlyColumns.map(({ month }) => month).sort().at(-1)) : null;
  const boundaries = sheet.rows.flatMap((row, index) => index > header && projectCenter(row[0]) ? [index] : []);
  const entries = [];
  for (const [position, start] of boundaries.entries()) {
    const row = sheet.rows[start];
    const end = boundaries[position + 1] ?? sheet.rows.length;
    const costCenter = projectCenter(row[0]);
    const name = String(row[1] ?? "").trim();
    if (!name) continue; // Las filas de centros vacíos terminan el bloque anterior.
    const description = String(row[descriptionColumn] ?? "").trim();
    const serviceCode = String(row[descriptionColumn + 1] ?? "").trim();
    const monthly = {}, monthlyPercentages = {}, contractComponents = [], review = [];
    const followupNotes = [], invoiceReferences = [];
    const seenInvoices = new Set();
    let unlabeled = false, duplicate = false;
    for (let index = start; index < end; index++) {
      const detail = sheet.rows[index];
      const invoice = String(detail[invoiceColumn] ?? "").trim().toUpperCase();
      if (index > start && String(detail[descriptionColumn] ?? "").trim()) {
        followupNotes.push({ sheet: sheet.name, row: index + 1, text: String(detail[descriptionColumn]).trim() });
      }
      if (invoice) invoiceReferences.push({ sheet: sheet.name, row: index + 1, reference: String(detail[invoiceColumn]).trim() });
      const extraValue = Number(detail[contractColumn]);
      if (Number.isFinite(extraValue) && extraValue > 0) {
        contractComponents.push({ row: index + 1, amount: Math.round(extraValue * 100) / 100 });
      }
      const amountCells = monthlyColumns.filter(({ index: col }) =>
        typeof detail[col] === "number" && Number.isFinite(detail[col]) && detail[col] !== 0);
      if (index === start) for (const { index: col, month, percentIndex } of monthlyColumns) {
        const percent = percentIndex >= 0 ? detail[percentIndex] : null;
        if (!amountCells.some((item) => item.index === col) && typeof percent === "number" && Number.isFinite(percent)) {
          monthlyPercentages[month] = Math.round(percent * 10000) / 100;
        }
      }
      // Los totales al pie de la hoja no son una continuación del último proyecto.
      if (!invoice && !detail[descriptionColumn] && extraValue > 0 && amountCells.length > 3) continue;
      for (const { index: col, month, percentIndex } of amountCells) {
        const value = billedAmount(detail[col]);
        const key = invoice ? `${month}|${invoice}|${value}` : "";
        if (key && seenInvoices.has(key)) { duplicate = true; continue; }
        if (key) seenInvoices.add(key);
        if (!invoice) unlabeled = true;
        monthly[month] = Math.round(((monthly[month] ?? 0) + value) * 100) / 100;
        const percentage = percentIndex >= 0 ? detail[percentIndex] : null;
        if (typeof percentage === "number" && Number.isFinite(percentage)) {
          monthlyPercentages[month] = Math.round(((monthlyPercentages[month] ?? 0) + percentage * 100) * 100) / 100;
        }
      }
    }
    if (contractComponents.length > 1) review.push("Varios valores contractuales en el centro; revisar ajustes o adiciones.");
    if (unlabeled) review.push("Facturación mensual sin número de factura en algunas filas.");
    if (duplicate) review.push("Se excluyó una factura repetida con igual mes y valor.");
    const billedTotal = Math.round(Object.values(monthly).reduce((sum, value) => sum + value, 0) * 100) / 100;
    if (Number(row[contractColumn]) > 0 && billedTotal > Number(row[contractColumn]) + 1) {
      review.push("Facturado mayor que el valor contractual principal; revisar ajustes.");
    }
    const extras = [
      `Origen: ${sheet.name}, fila ${start + 1}`,
      description && `Descripción: ${description}`,
      serviceCode && `T.S.: ${serviceCode}`,
      row[descriptionColumn + 2] && `Tipo en Excel: ${row[descriptionColumn + 2]}`,
      row[descriptionColumn + 3] && `Estado en Excel: ${row[descriptionColumn + 3]}`,
      orderColumn >= 0 && row[orderColumn] && `O.C.: ${row[orderColumn]}`
    ].filter(Boolean).join(" · ");
    entries.push({
      "Centro de costo": costCenter,
      "Nombre del proyecto": name,
      "Municipio": String(row[2] ?? "").trim() || "Sin municipio registrado",
      "Tipo de servicio": ({ SER: "Servicio", SUM: "Suministro", AIU: "Servicio" })[serviceCode.toUpperCase()] || "Servicio por clasificar",
      "Estado": "planeado", // El ESTADO del libro es de facturación, no de ejecución.
      "Observaciones": extras.slice(0, 500),
      "Valor del contrato": row[contractColumn] ?? "",
      "Número de contrato": "",
      "Facturado acumulado": billedTotal,
      __rowNum__: start,
      __sourceSheet__: sheet.name,
      __monthlyBilled__: monthly,
      __monthlyPercentages__: monthlyPercentages,
      __contractComponents__: contractComponents,
      __executionSnapshotPercentage__: executionColumn >= 0 && typeof row[executionColumn] === "number"
        && row[executionColumn] >= 0 && row[executionColumn] <= 1
          ? Math.round(row[executionColumn] * 10000) / 100 : null,
      __executionMonthLabel__: executionMonthColumn >= 0 ? String(row[executionMonthColumn] ?? "").trim() : "",
      __followupNotes__: followupNotes,
      __invoiceReferences__: invoiceReferences,
      __alternateSnapshots__: [],
      __importedAsOf__: asOf,
      __financialReview__: review.join(" ")
    });
  }
  return entries;
}

// El libro original contiene varias copias históricas de PROYECTOS FV. Se usa
// la hoja principal y se añaden únicamente los CC ausentes en las otras listas.
// Los CC repetidos dentro de una misma hoja quedan en revisión, sin elegir uno.
export function extractLegacyProjectRows(sheets) {
  const primary = sheets.find((sheet) => sheet.name.toUpperCase() === "PROYECTOS FV")
    ?? sheets.find((sheet) => /^AVANCE DE PROYECTOS/i.test(sheet.name));
  if (!primary) throw new Error("No se encontró la hoja principal «PROYECTOS FV» de la plantilla.");
  const supplemental = sheets.filter((sheet) => sheet !== primary &&
    (/^AVANCE DE PROYECTOS/i.test(sheet.name) ||
      ["PENDEINTE 2024", "PENDIENTE 2024", "OTROS", "VISITAS Y OTROS"].includes(sheet.name.toUpperCase())));
  const ordered = [primary, ...supplemental];
  const all = ordered.map((sheet) => ({ sheet, rows: legacyRows(sheet) }));
  const primaryCenters = new Set(all[0].rows.map((row) => row["Centro de costo"]));
  const archive = all.find(({ sheet }) => /^(?:PENDEINTE|PENDIENTE) 2024$/i.test(sheet.name));
  const archiveByRow = new Map((archive?.rows ?? []).map((row) => [row.__rowNum__ + 1, row]));
  const ambiguous = new Map();
  for (const { sheet, rows } of all) {
    const grouped = new Map();
    for (const row of rows) {
      const cc = row["Centro de costo"];
      grouped.set(cc, [...(grouped.get(cc) ?? []), row]);
    }
    for (const [cc, matches] of grouped) {
      // Una lista auxiliar puede reutilizar centros de la hoja principal para
      // proyectos diferentes; no descartar por eso la fila principal inequívoca.
      if (sheet !== primary && primaryCenters.has(cc)) continue;
      if (matches.length > 1) ambiguous.set(cc, `${sheet.name}: ${matches.map((row) =>
        `fila ${row.__rowNum__ + 1}, ${row["Nombre del proyecto"].replace(/\s+/g, " ").slice(0, 65)}`).join("; ")}`);
    }
  }
  const seen = new Set(), rows = [], issues = [];
  for (const { rows: candidates } of all) for (const row of candidates) {
    const cc = row["Centro de costo"];
    if (seen.has(cc)) continue;
    seen.add(cc);
    if (ambiguous.has(cc)) {
      issues.push({ costCenter: cc, rowNumber: row.__rowNum__ + 1, sourceSheet: row.__sourceSheet__,
        reason: `Centro repetido para varios proyectos (${ambiguous.get(cc)}). Corrige el centro de costo en el Excel.` });
    } else rows.push(row);
  }
  // Algunas filas finales de agosto reutilizan centros de la lista principal.
  // La ficha principal es inequívoca; la otra necesita un código propio.
  const august = all.find(({ sheet }) => sheet.name.toUpperCase() === "AVANCE DE PROYECTOS AGOSTO");
  if (august) {
    const byCenter = new Map();
    for (const row of august.rows) byCenter.set(row["Centro de costo"], [...(byCenter.get(row["Centro de costo"]) ?? []), row]);
    for (const [cc, matches] of byCenter) if (primaryCenters.has(cc) && matches.length > 1) {
      const primaryNames = all[0].rows.filter((row) => row["Centro de costo"] === cc);
      const extras = matches.filter((row) => !primaryNames.some((source) => {
        const original = headerKey(source["Nombre del proyecto"]);
        const candidate = headerKey(row["Nombre del proyecto"]);
        return candidate === original || candidate.startsWith(`${original}_`);
      }));
      for (const extra of extras) issues.push({ costCenter: cc, rowNumber: extra.__rowNum__ + 1,
        sourceSheet: extra.__sourceSheet__,
        reason: `También figura como «${extra["Nombre del proyecto"].trim()}» con un centro ya asignado en PROYECTOS FV. Confirma su código antes de crear otra ficha.` });
    }
  }
  const alternate = all.find(({ sheet }) => sheet.name.toUpperCase() === "AVANCE DE PROYECTOS AGOSTO")?.rows ?? [];
  for (const row of rows) {
    if (row.__sourceSheet__ === primary.name && primary.name.toUpperCase() === "PROYECTOS FV") {
      const formula = primary.aiFormulas?.[row.__rowNum__ + 1] ?? "";
      const source = primary.rows[row.__rowNum__] ?? [];
      const archiveReference = /'(?:PENDEINTE|PENDIENTE) 2024'!\$?AI\$?(\d+)/i.exec(formula);
      const prior = archiveReference ? archiveByRow.get(Number(archiveReference[1])) : null;
      if (prior && prior["Centro de costo"] === row["Centro de costo"]) {
        row.__monthlyBilled__ = { ...prior.__monthlyBilled__, ...row.__monthlyBilled__ };
        row.__monthlyPercentages__ = { ...prior.__monthlyPercentages__, ...row.__monthlyPercentages__ };
        row.__followupNotes__.push(...prior.__followupNotes__);
        row.__invoiceReferences__.push(...prior.__invoiceReferences__);
        row["Facturado acumulado"] = Math.round(Object.values(row.__monthlyBilled__).reduce((sum, amount) => sum + amount, 0) * 100) / 100;
      }
      if (typeof source[34] === "number" && Number.isFinite(source[34])) {
        row.__sourcePendingToInvoice__ = Math.round(source[34] * 100) / 100;
        if (typeof source[35] === "number") row.__sourcePendingPercentage__ = Math.round(source[35] * 10000) / 100;
      }
      // AI descuenta a veces una cifra literal que no figura en ningún mes.
      // Solo se incorpora cuando el valor coincide con la conciliación completa.
      const literal = /-(\d+(?:\.\d+)?)\)?$/.exec(formula)?.[1];
      if (literal && typeof source[34] === "number") {
        const contractColumn = primary.rows.find((cells) => cells[0] === "C COSTO" && cells[1] === "NOMBRE")
          ?.findIndex((value) => String(value ?? "").trim().toUpperCase() === "VALOR CONTRATO");
        const refs = [...formula.matchAll(/(?<![A-Z0-9_])J(\d+)/gi)].map((match) => Number(match[1]));
        const basis = refs.reduce((sum, number) => sum + Number(primary.rows[number - 1]?.[contractColumn] || 0), 0);
        const dated = Number(row["Facturado acumulado"]);
        const undated = Number(literal);
        if (refs.length && Number.isFinite(basis) && undated > 0
          && Math.abs(basis - source[34] - dated - undated) <= 1) {
          row.__undatedBilled__ = undated;
          row["Facturado acumulado"] = Math.round((dated + undated) * 100) / 100;
        }
      }
      if (prior && typeof source[34] === "number") {
        const refs = [...formula.matchAll(/(?<![A-Z0-9_])J(\d+)/gi)].map((match) => Number(match[1]));
        const contractColumn = primary.rows.find((cells) => cells[0] === "C COSTO" && cells[1] === "NOMBRE")
          ?.findIndex((value) => String(value ?? "").trim().toUpperCase() === "VALOR CONTRATO");
        const basis = refs.reduce((sum, number) => sum + Number(primary.rows[number - 1]?.[contractColumn] || 0), 0);
        const difference = Math.round((basis - source[34] - Number(row["Facturado acumulado"])) * 100) / 100;
        if (Math.abs(difference) > 1) row.__financialReview__ +=
          ` La fórmula AI difiere en ${difference} COP de las facturas fechadas de 2024 y 2025; conciliar sin asignar un mes inventado.`;
      }
      const matches = alternate.filter((other) => other["Centro de costo"] === row["Centro de costo"]
        && headerKey(other["Nombre del proyecto"]) === headerKey(row["Nombre del proyecto"]));
      if (matches.length === 1) {
        const other = matches[0];
        const notes = new Set(row.__followupNotes__.map(({ text }) => headerKey(text)));
        for (const item of other.__followupNotes__) if (!notes.has(headerKey(item.text))) {
          row.__followupNotes__.push(item);
          notes.add(headerKey(item.text));
        }
        const references = new Set(row.__invoiceReferences__.map(({ reference }) => headerKey(reference)));
        for (const item of other.__invoiceReferences__) if (!references.has(headerKey(item.reference))) {
          row.__invoiceReferences__.push(item);
          references.add(headerKey(item.reference));
        }
        const contract = contractValue(other["Valor del contrato"]);
        const originalContract = contractValue(row["Valor del contrato"]);
        const differs = contract !== originalContract ||
          Math.abs(other["Facturado acumulado"] - row["Facturado acumulado"]) > 0.01 ||
          JSON.stringify(other.__monthlyBilled__) !== JSON.stringify(row.__monthlyBilled__);
        if (differs) {
          row.__alternateSnapshots__.push({ sheet: other.__sourceSheet__, row: other.__rowNum__ + 1,
            contractValue: contract, billedTotal: other["Facturado acumulado"],
            monthlyBilled: other.__monthlyBilled__, monthlyPercentages: other.__monthlyPercentages__ });
          row.__financialReview__ += " Otra hoja del libro contiene cifras distintas para este centro; conciliar ambas versiones.";
        }
      }
    }
    const value = contractValue(row["Valor del contrato"]);
    const mismatches = Object.entries(row.__monthlyBilled__).filter(([month, amount]) =>
      value && Object.hasOwn(row.__monthlyPercentages__, month)
      && Math.abs(row.__monthlyPercentages__[month] - amount / value * 100) > 0.05).map(([month]) => month);
    if (mismatches.length) row.__financialReview__ += ` El porcentaje facturado del Excel difiere del importe/contrato en ${mismatches.join(", ")}.`;
    row.__financialReview__ = row.__financialReview__.trim();
  }
  if (!rows.length) throw new Error("La plantilla no contiene proyectos identificables por centro de costo.");
  return { rows, issues, sourceSheets: ordered.map(({ name }) => name) };
}

export function parseProjectCsv(text) {
  const rows = parseCostCsv(text, { strictColumns: true });
  if (!rows.length) throw new Error("El CSV de proyectos está vacío o solo contiene encabezados.");
  return rows;
}

// Una segunda carga del mismo libro no debe generar cientos de auditorías sin cambios.
// AI/AJ se dejan fuera de esta actualización hasta conciliar su significado.
export function changedHistoricalUpdates(updates, existingProjects) {
  const fields = ["importedContractValue", "importedBilledTotal", "importedUndatedBilled",
    "importedMonthlyBilled", "importedMonthlyBilledPercentages", "importedContractComponents",
    "importedExecutionSnapshotPercentage", "importedExecutionMonthLabel", "importedFollowupNotes",
    "importedInvoiceReferences", "importedAlternateSnapshots", "importedAsOf", "importedFinancialReview"];
  const canonical = (value) => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value === "" || value == null ? null : value;
  const byId = new Map(existingProjects.map((project) => [project.id ?? project.projectId, project]));
  return updates.filter((input) => {
    const existing = byId.get(input.id);
    return !existing || fields.some((field) => JSON.stringify(canonical(input[field])) !== JSON.stringify(canonical(existing[field])));
  });
}

export function resolveProjectImportRows(rows, existingProjects = [], newId = () => crypto.randomUUID(), options = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("El archivo de proyectos no contiene filas.");
  const headers = Object.keys(rows[0]).map(headerKey);
  if (new Set(headers).size !== headers.length) throw new Error("El archivo tiene encabezados repetidos. Renombra las columnas para poder revisar todos sus datos.");
  const supported = new Set(Object.values(columns).flat());
  const unexpected = Object.keys(rows[0]).filter((header) => !header.startsWith("__") && !supported.has(headerKey(header))
    && !/^facturado_20\d{2}_(0[1-9]|1[0-2])$/.test(headerKey(header))
    && !/^porcentaje_facturado_20\d{2}_(0[1-9]|1[0-2])$/.test(headerKey(header))
    && rows.some((row) => row[header] !== undefined && row[header] !== null && String(row[header]).trim()));
  if (unexpected.length) throw new Error(`El archivo contiene columnas con datos que este cargador no guardaría: ${unexpected.slice(0, 5).join(", ")}. Revisa el formato antes de importar.`);
  for (const key of ["costCenter", "name", "municipality", "serviceType"]) {
    if (!columns[key].some((alias) => headers.includes(alias))) {
      throw new Error(`Falta la columna «${PROJECT_IMPORT_HEADERS[["costCenter", "name", "municipality", "serviceType"].indexOf(key)]}». Descarga el formato.`);
    }
  }
  const existing = new Map();
  for (const project of existingProjects) {
    const key = centerKey(project.costCenter);
    existing.set(key, [...(existing.get(key) ?? []), project]);
  }
  const seen = new Set(), valid = [], updates = [], skipped = [], errors = [], conflicts = [];
  rows.forEach((row, index) => {
    if (Object.values(row).every((value) => value == null || String(value).trim() === "")) return;
    const rowNumber = Number.isInteger(row.__rowNum__) ? row.__rowNum__ + 1 : index + 2;
    const values = sourceValues(row);
    const costCenter = String(field(values, columns.costCenter)).trim();
    const key = centerKey(costCenter);
    if (!key) { errors.push({ rowNumber, reason: "centro de costo vacío" }); return; }
    if (seen.has(key)) { errors.push({ rowNumber, reason: `centro ${costCenter} repetido en el archivo` }); return; }
    seen.add(key);
    const matches = existing.get(key) ?? [];
    if (matches.length > 1) { errors.push({ rowNumber, reason: `centro ${costCenter} coincide con varias fichas existentes` }); return; }
    if (matches.length === 1) {
      const importedName = String(field(values, columns.name)).trim();
      if (options.reviewNameConflicts && headerKey(importedName) !== headerKey(matches[0].projectName ?? matches[0].name)) {
        conflicts.push({ rowNumber, costCenter, sourceSheet: row.__sourceSheet__,
          reason: `Ya existe como «${matches[0].projectName ?? matches[0].name}»; el Excel dice «${importedName}».` });
        return;
      }
      if (!options.updateExistingMatched) {
        skipped.push({ rowNumber, costCenter, projectName: matches[0].projectName ?? matches[0].name });
        return;
      }
    }
    try {
      const importedValue = contractValue(field(values, columns.contractValue));
      const billed = readMonthlyBilling(row, values);
      const billedPercentages = readMonthlyPercentages(row, values);
      const importedAsOf = dateValue(row.__importedAsOf__ ?? field(values, columns.billedAsOf))
        ?? (Object.keys(billed.monthly).length ? lastDayOfMonth(Object.keys(billed.monthly).sort().at(-1)) : null);
      const importedNumber = String(field(values, columns.contractNumber)).trim();
      const sourceNotes = String(field(values, columns.notes)).trim()
        .replace(/\s*·?\s*Valor contractual en (?:Excel|archivo):\s*\d+(?:\.\d+)?/gi, "").trim();
      const executionValue = row.__executionSnapshotPercentage__ ?? field(values, columns.executionSnapshot);
      const executionSnapshot = executionValue === "" || executionValue == null ? null
        : Number(String(executionValue).replace(",", "."));
      const followup = row.__followupNotes__ ?? String(field(values, columns.followupNotes)).split("\n")
        .map((text) => text.trim()).filter(Boolean).map((text) => ({ sheet: "Archivo de proyectos", row: rowNumber, text }));
      const references = row.__invoiceReferences__ ?? String(field(values, columns.invoiceReferences)).split("\n")
        .map((reference) => reference.trim()).filter(Boolean)
        .map((reference) => ({ sheet: "Archivo de proyectos", row: rowNumber, reference }));
      const notes = [sourceNotes,
        importedNumber && !/Contrato en archivo:/i.test(sourceNotes)
          ? `Contrato en archivo: ${importedNumber}` : ""
      ].filter(Boolean).join(" · ");
      const input = {
        id: matches.length ? matches[0].id ?? matches[0].projectId : newId(), costCenter,
        name: String(field(values, columns.name)).trim(),
        municipality: String(field(values, columns.municipality)).trim(),
        serviceType: String(field(values, columns.serviceType)).trim(),
        status: String(field(values, columns.status) || "planeado").trim().toLowerCase(),
        clientName: String(field(values, columns.clientName)).trim(),
        powerKwp: powerValue(field(values, columns.powerKwp)),
        startDate: dateValue(field(values, columns.startDate)),
        endDate: dateValue(field(values, columns.endDate)),
        notes,
        parentCenter: String(field(values, columns.parentCenter)).trim(),
        contractValue: importedValue,
        contractNumber: importedNumber,
        sourceSheet: row.__sourceSheet__ ?? "",
        importedContractValue: importedValue,
        importedBilledTotal: billed.total,
        importedUndatedBilled: billed.undated,
        importedPendingToInvoice: row.__sourcePendingToInvoice__ ?? null,
        importedPendingPercentage: row.__sourcePendingPercentage__ ?? null,
        importedMonthlyBilled: billed.monthly,
        importedMonthlyBilledPercentages: billedPercentages,
        importedContractComponents: row.__contractComponents__ ?? [],
        importedExecutionSnapshotPercentage: executionSnapshot,
        importedExecutionMonthLabel: row.__executionMonthLabel__ ?? String(field(values, columns.executionMonth)).trim(),
        importedFollowupNotes: followup,
        importedInvoiceReferences: references,
        importedAlternateSnapshots: row.__alternateSnapshots__ ?? [],
        importedAsOf,
        importedFinancialSource: row.__sourceSheet__
          ? `${row.__sourceSheet__}, fila ${rowNumber}` : "Archivo de proyectos",
        importedFinancialReview: row.__financialReview__ ?? null
      };
      if (input.clientName.length > 180 || input.notes.length > 500 || input.contractNumber.length > 80) throw new Error("cliente, contrato u observaciones demasiado largos");
      projectInputToRecord(input, null);
      (matches.length ? updates : valid).push({ rowNumber, ...input });
    } catch (error) { errors.push({ rowNumber, reason: error.message }); }
  });

  const imported = new Map(valid.map((row) => [centerKey(row.costCenter), row]));
  for (const row of valid) {
    if (!row.parentCenter) { row.parentProjectId = null; continue; }
    const key = centerKey(row.parentCenter);
    const candidates = existing.get(key) ?? [];
    const parent = imported.get(key);
    if (candidates.length > 1 || (candidates.length && parent)) {
      errors.push({ rowNumber: row.rowNumber, reason: `centro principal ${row.parentCenter} ambiguo` });
    } else if (key === centerKey(row.costCenter)) {
      errors.push({ rowNumber: row.rowNumber, reason: "un proyecto no puede ser su propio centro principal" });
    } else if (!parent && !candidates.length) {
      errors.push({ rowNumber: row.rowNumber, reason: `centro principal ${row.parentCenter} no existe` });
    } else row.parentProjectId = parent?.id ?? candidates[0].projectId;
  }
  for (const row of valid) {
    const visited = new Set();
    let current = row;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      current = valid.find((candidate) => candidate.id === current.parentProjectId);
    }
    if (current) errors.push({ rowNumber: row.rowNumber, reason: "ciclo entre centros principales" });
  }
  return { valid, updates, skipped, errors, conflicts };
}
