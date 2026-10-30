import { projectInputToRecord } from "../data/models.js?v=1.16.0";
import { parseCostCsv } from "./cost-import.js?v=1.16.0";
import { centerKey } from "./accounting-projects.js?v=1.16.0";

export const PROJECT_IMPORT_HEADERS = Object.freeze([
  "Centro de costo", "Nombre del proyecto", "Municipio", "Tipo de servicio",
  "Estado", "Cliente", "Potencia kWp", "Fecha de inicio", "Fecha de finalización",
  "Centro principal", "Observaciones"
]);

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
  notes: ["observaciones", "notas", "notes"]
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

export function parseProjectCsv(text) {
  const rows = parseCostCsv(text, { strictColumns: true });
  if (!rows.length) throw new Error("El CSV de proyectos está vacío o solo contiene encabezados.");
  return rows;
}

export function resolveProjectImportRows(rows, existingProjects = [], newId = () => crypto.randomUUID()) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("El archivo de proyectos no contiene filas.");
  const headers = Object.keys(rows[0]).map(headerKey);
  if (new Set(headers).size !== headers.length) throw new Error("El archivo tiene encabezados repetidos. Renombra las columnas para poder revisar todos sus datos.");
  const supported = new Set(Object.values(columns).flat());
  const unexpected = Object.keys(rows[0]).filter((header) => !supported.has(headerKey(header))
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
  const seen = new Set(), valid = [], skipped = [], errors = [];
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
    if (matches.length === 1) { skipped.push({ rowNumber, costCenter, projectName: matches[0].projectName }); return; }
    try {
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
        notes: String(field(values, columns.notes)).trim(),
        parentCenter: String(field(values, columns.parentCenter)).trim()
      };
      if (input.clientName.length > 180 || input.notes.length > 500) throw new Error("cliente u observaciones demasiado largos");
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
  return { valid, skipped, errors };
}
