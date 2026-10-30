// The Unico .Net auxiliary export has no separate header row. Every record
// repeats the report metadata and contains 58 source cells, including blanks.
export const AUXILIARY_COLUMNS = Object.freeze([
  "Empresa", "Separador", "Libro", "NIT", "Etiqueta rango", "Rango", "Etiqueta fecha reporte", "Fecha reporte",
  "Etiqueta hora", "Hora reporte", "Etiqueta usuario", "Usuario", "Encabezado fecha", "Encabezado serie",
  "Encabezado tipo", "Encabezado CC", "Encabezado número", "Encabezado CH", "Encabezado detalle",
  "Encabezado débito", "Encabezado crédito", "Encabezado saldo", "Etiqueta subcuenta", "Código subcuenta",
  "Nombre subcuenta", "Etiqueta saldo cuenta 1", "Etiqueta saldo cuenta 2", "Saldo anterior cuenta",
  "Saldo final cuenta", "Etiqueta NIT tercero", "NIT tercero", "Nombre tercero", "Etiqueta saldo tercero",
  "Saldo anterior tercero", "Fecha movimiento", "Serie", "Tipo documento", "Centro de costo", "Número documento",
  "CH", "Detalle", "Débito", "Crédito", "Saldo movimiento", "Dato tercero 1", "Dato tercero 2",
  "Dato tercero 3", "Dato tercero 4", "Dato tercero 5", "Dato tercero 6", "Etiqueta totales cuenta",
  "Total débitos cuenta", "Total créditos cuenta", "Etiqueta registros", "Registros reporte", "Software", "Etiqueta página", "Página"
]);

export function parseAuxiliaryCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  const source = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; }
      else if (quoted) { quoted = false; closed = true; }
      else if (!field && !closed) quoted = true;
      else throw new Error(`Comillas inválidas cerca de la fila ${rows.length + 1}.`);
    } else if (ch === "," && !quoted) {
      row.push(field); field = ""; closed = false;
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; closed = false;
    } else {
      if (closed && ch !== " " && ch !== "\t") throw new Error(`Texto inesperado después de comillas en la fila ${rows.length + 1}.`);
      if (!closed) field += ch;
    }
  }
  if (quoted) throw new Error("El archivo termina con una celda entre comillas sin cerrar.");
  if (row.length || field || closed) { row.push(field); rows.push(row); }
  return rows;
}

function amount(value, rowNumber, label) {
  const raw = String(value ?? "").trim();
  if (!raw) return "0.00";
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(raw)) {
    throw new Error(`Fila ${rowNumber}: ${label} inválido (${raw}).`);
  }
  return Number(raw.replaceAll(",", "")).toFixed(2);
}

function movementDate(value, rowNumber) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s|$)/.exec(String(value ?? "").trim());
  if (!match) throw new Error(`Fila ${rowNumber}: fecha del movimiento inválida.`);
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCFullYear() !== Number(year)) {
    throw new Error(`Fila ${rowNumber}: fecha del movimiento imposible.`);
  }
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function normalizeAuxiliaryRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("El auxiliar contable está vacío.");
  let debitCents = 0, creditCents = 0;
  const entries = rows.map((source, index) => {
    const rowNumber = index + 1;
    if (!Array.isArray(source) || source.length !== AUXILIARY_COLUMNS.length) {
      throw new Error(`Fila ${rowNumber}: se esperaban ${AUXILIARY_COLUMNS.length} columnas, se recibieron ${source?.length ?? 0}. Se canceló toda la importación.`);
    }
    const raw_cells = source.map((cell) => String(cell ?? ""));
    if (raw_cells[2] !== "LIBROS AUXILIARES" || !raw_cells[23].trim()) {
      throw new Error(`Fila ${rowNumber}: no corresponde al auxiliar contable original.`);
    }
    const debit = amount(raw_cells[41], rowNumber, "débito");
    const credit = amount(raw_cells[42], rowNumber, "crédito");
    debitCents += Math.round(Number(debit) * 100);
    creditCents += Math.round(Number(credit) * 100);
    return {
      row_number: rowNumber,
      raw_cells,
      account_code: raw_cells[23], account_name: raw_cells[24],
      movement_date: movementDate(raw_cells[34], rowNumber),
      series: raw_cells[35], document_type: raw_cells[36], cost_center: raw_cells[37],
      document_number: raw_cells[38], third_party_id: raw_cells[30], third_party_name: raw_cells[31],
      detail: raw_cells[40], debit, credit,
      running_balance: amount(raw_cells[43], rowNumber, "saldo")
    };
  });
  const first = entries[0].raw_cells;
  const declared = Number(String(first[54]).replaceAll(",", ""));
  if (Number.isInteger(declared) && declared > 0 && declared !== entries.length) {
    throw new Error(`El reporte declara ${declared} movimientos, pero contiene ${entries.length}. No se importó ninguna fila.`);
  }
  return {
    entries,
    metadata: {
      company: first[0], report_period: first[5], report_date_text: first[7],
      expected_rows: entries.length,
      total_debit: (debitCents / 100).toFixed(2),
      total_credit: (creditCents / 100).toFixed(2)
    }
  };
}

export function auxiliaryCsv(rows) {
  return rows.map((cells) => cells.map((value) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(",")).join("\r\n") + "\r\n";
}
