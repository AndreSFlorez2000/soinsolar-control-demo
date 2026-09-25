function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseCostCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const separator = (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
  const records = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === separator && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("El archivo CSV tiene comillas sin cerrar.");
  row.push(field);
  if (row.some((value) => value.trim())) records.push(row);
  const [headers = [], ...values] = records;
  return values.map((columns) => Object.fromEntries(headers.map((header, index) => [header, columns[index] ?? ""])));
}

function firstValue(row, aliases) {
  const normalized = Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [normalizeHeader(key), value])
  );
  for (const alias of aliases) {
    const value = normalized[normalizeHeader(alias)];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function parseMoney(value) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return NaN;
  const clean = text.replace(/\s/g, "").replace(/\$/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) {
    return Number(clean.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(clean)) {
    return Number(clean.replace(/,/g, ""));
  }
  return Number(clean.replace(",", "."));
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : "";
  }
  const slash = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (slash) {
    return parseDate(`${slash[3]}-${String(slash[2]).padStart(2, "0")}-${String(slash[1]).padStart(2, "0")}`);
  }
  return "";
}

function periodKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, "0")}`;
}

export function resolveCostImportRows(rows = [], { projects = [], periods = [] } = {}) {
  const projectsByCenter = new Map(projects.map((p) => [String(p.costCenter).trim().toLocaleLowerCase("es"), p]));
  const periodsByKey = new Map(periods.map((p) => [periodKey(p.year, p.month), p]));
  const valid = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const costCenter = String(firstValue(row, ["centro_costo", "centro de costo", "cost_center", "centro"])).trim();
    const type = String(firstValue(row, ["tipo", "tipo_movimiento", "movimiento"])).trim().toLocaleLowerCase("es");
    const category = String(firstValue(row, ["categoria", "categoría"])).trim();
    const description = String(firstValue(row, ["descripcion", "descripción", "detalle", "concepto"])).trim();
    const supplierName = String(firstValue(row, ["proveedor", "supplier", "supplier_name"])).trim();
    const documentReference = String(firstValue(row, ["referencia", "documento", "document_reference", "factura"])).trim();
    const movementDate = parseDate(firstValue(row, ["fecha", "fecha_movimiento", "movement_date"]));
    const amount = parseMoney(firstValue(row, ["valor", "monto", "amount", "valor_cop"]));

    const project = projectsByCenter.get(costCenter.toLocaleLowerCase("es"));
    const period = movementDate ? periodsByKey.get(movementDate.slice(0, 7)) : null;
    const rowErrors = [];

    if (!project) rowErrors.push(`centro de costo "${costCenter || "(vacío)"}" no existe`);
    if (!["costo", "gasto"].includes(type)) rowErrors.push("tipo debe ser costo o gasto");
    if (category.length < 2) rowErrors.push("categoría requerida");
    if (description.length < 3) rowErrors.push("descripción requerida");
    if (!movementDate) rowErrors.push("fecha inválida");
    if (!period) rowErrors.push("no existe el periodo de la fecha");
    else if (period.status !== "abierto") rowErrors.push("el periodo está cerrado");
    if (!Number.isFinite(amount) || amount <= 0) rowErrors.push("valor debe ser positivo");

    if (rowErrors.length) {
      errors.push({ rowNumber, errors: rowErrors, source: row });
      return;
    }

    valid.push({
      projectId: project.projectId,
      periodId: period.id,
      type,
      category,
      description,
      supplierName: supplierName || null,
      documentReference: documentReference || null,
      movementDate,
      amount,
      supportPath: null
    });
  });

  return Object.freeze({
    valid: Object.freeze(valid),
    errors: Object.freeze(errors)
  });
}
