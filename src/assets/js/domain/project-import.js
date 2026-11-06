import { projectInputToRecord } from "../data/models.js?v=1.16.0";
import { parseCostCsv } from "./cost-import.js?v=1.16.0";
import { centerKey } from "./accounting-projects.js?v=1.16.0";

export const PROJECT_IMPORT_HEADERS = Object.freeze([
  "Centro de costo", "Nombre del proyecto", "Municipio", "Tipo de servicio",
  "Estado", "Cliente", "Potencia kWp", "Fecha de inicio", "Fecha de finalización",
  "Centro principal", "Observaciones", "Valor del contrato", "Número de contrato"
]);

// Los libros históricos no registran la fecha del contrato. Hasta que se cree
// un contrato formal, su importe vive como referencia en las observaciones.
// La exportación lo recupera sin convertirlo en un contrato de la aplicación.
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
  contractNumber: ["numero_de_contrato", "numero_contrato", "contract_number"]
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
  const entries = [];
  sheet.rows.slice(header + 1).forEach((row, offset) => {
    const costCenter = projectCenter(row[0]);
    if (!costCenter) return; // Los renglones sin CC son detalle de la ficha anterior.
    const name = String(row[1] ?? "").trim();
    if (!name) return; // Totales y fórmulas preparadas para futuros registros.
    const description = String(row[descriptionColumn] ?? "").trim();
    const serviceCode = String(row[descriptionColumn + 1] ?? "").trim();
    const extras = [
      `Origen: ${sheet.name}, fila ${header + offset + 2}`,
      Number(row[contractColumn]) > 0 && `Valor contractual en Excel: ${row[contractColumn]}`,
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
      __rowNum__: header + offset + 1,
      __sourceSheet__: sheet.name
    });
  });
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
  const ambiguous = new Map();
  for (const { sheet, rows } of all) {
    const grouped = new Map();
    for (const row of rows) {
      const cc = row["Centro de costo"];
      grouped.set(cc, [...(grouped.get(cc) ?? []), row]);
    }
    for (const [cc, matches] of grouped) {
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
  if (!rows.length) throw new Error("La plantilla no contiene proyectos identificables por centro de costo.");
  return { rows, issues, sourceSheets: ordered.map(({ name }) => name) };
}

export function parseProjectCsv(text) {
  const rows = parseCostCsv(text, { strictColumns: true });
  if (!rows.length) throw new Error("El CSV de proyectos está vacío o solo contiene encabezados.");
  return rows;
}

export function resolveProjectImportRows(rows, existingProjects = [], newId = () => crypto.randomUUID(), options = {}) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("El archivo de proyectos no contiene filas.");
  const headers = Object.keys(rows[0]).map(headerKey);
  if (new Set(headers).size !== headers.length) throw new Error("El archivo tiene encabezados repetidos. Renombra las columnas para poder revisar todos sus datos.");
  const supported = new Set(Object.values(columns).flat());
  const unexpected = Object.keys(rows[0]).filter((header) => !header.startsWith("__") && !supported.has(headerKey(header))
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
  const seen = new Set(), valid = [], skipped = [], errors = [], conflicts = [];
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
      } else skipped.push({ rowNumber, costCenter, projectName: matches[0].projectName ?? matches[0].name });
      return;
    }
    try {
      const importedValue = contractValue(field(values, columns.contractValue));
      const importedNumber = String(field(values, columns.contractNumber)).trim();
      const sourceNotes = String(field(values, columns.notes)).trim();
      const notes = [sourceNotes,
        importedValue != null && !/Valor contractual en (Excel|archivo):/i.test(sourceNotes)
          ? `Valor contractual en archivo: ${importedValue}` : "",
        importedNumber && !/Contrato en archivo:/i.test(sourceNotes)
          ? `Contrato en archivo: ${importedNumber}` : ""
      ].filter(Boolean).join(" · ");
      const input = {
        id: newId(), costCenter,
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
        sourceSheet: row.__sourceSheet__ ?? ""
      };
      if (input.clientName.length > 180 || input.notes.length > 500 || input.contractNumber.length > 80) throw new Error("cliente, contrato u observaciones demasiado largos");
      projectInputToRecord(input, null);
      valid.push({ rowNumber, ...input });
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
  return { valid, skipped, errors, conflicts };
}
