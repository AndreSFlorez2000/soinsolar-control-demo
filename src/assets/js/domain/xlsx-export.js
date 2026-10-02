// Archivo XLSX mínimo (Open XML, ZIP sin compresión) para el navegador.
// Cada celda de texto usa inlineStr: las observaciones nunca se evalúan como fórmulas.
const encoder = new TextEncoder();
const xml = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function column(index) {
  let letters = "";
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    letters = String.fromCharCode(65 + (number - 1) % 26) + letters;
  }
  return letters;
}

function worksheet({ headers, rows, types, title = "", notes = [], freezeColumns = 0, highlightColumns = [], columnWidths = [], formulas = {} }) {
  const headerRow = (title ? 1 + notes.length : 0) + 1;
  const highlighted = new Set(highlightColumns);
  const lastColumn = column(headers.length - 1);
  const cell = (value, rowIndex, colIndex, kind, style = 0, formula = null) => {
    if (value === null || value === undefined || value === "") return "";
    const ref = `${column(colIndex)}${rowIndex}`;
    if (["number", "money", "money0", "percent", "points"].includes(kind)) {
      const number = Number(value);
      if (!Number.isFinite(number)) return "";
      const numericStyle = kind === "money" ? 2 : kind === "money0" ? 7
        : kind === "percent" ? (highlighted.has(colIndex) ? 6 : 3)
        : kind === "points" ? (highlighted.has(colIndex) ? 8 : 9) : 0;
      // Las fórmulas solo proceden de funciones fijas del informe, nunca de observaciones del usuario.
      if (formula && !/^[A-Z0-9$()+\-*/., ]+$/.test(formula)) throw new TypeError("Fórmula de informe no válida.");
      return `<c r="${ref}" s="${numericStyle}">${formula ? `<f>${xml(formula)}</f>` : ""}<v>${number}</v></c>`;
    }
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  };
  const leading = title
    ? [`<row r="1" ht="30" customHeight="1">${cell(title, 1, 0, "text", 4)}</row>`,
      ...notes.map((note, index) => `<row r="${index + 2}" ht="25" customHeight="1">${cell(note, index + 2, 0, "text", 5)}</row>`)]
    : [];
  const body = [headers, ...rows].map((values, index) => {
    const rowIndex = headerRow + index;
    return `<row r="${rowIndex}"${index ? "" : ' ht="34" customHeight="1"'}>${values.map((value, colIndex) =>
      cell(value, rowIndex, colIndex, index ? types[colIndex] : "text", index ? 0 : 1,
        index ? formulas[colIndex]?.(rowIndex) : null)
    ).join("")}</row>`;
  });
  const widths = headers.map((header, index) => {
    let max = String(header).length;
    for (const row of rows) max = Math.max(max, String(row[index] ?? "").length);
    const width = columnWidths[index] ?? Math.min(Math.max(max + 2, 13), 54);
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const xSplit = freezeColumns ? ` xSplit="${freezeColumns}"` : "";
  const pane = `<pane${xSplit} ySplit="${headerRow}" topLeftCell="${column(freezeColumns)}${headerRow + 1}" activePane="${freezeColumns ? "bottomRight" : "bottomLeft"}" state="frozen"/>`;
  const merges = title ? `<mergeCells count="${1 + notes.length}">${[1, ...notes.map((_, index) => index + 2)].map((index) => `<mergeCell ref="A${index}:${lastColumn}${index}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews><cols>${widths}</cols><sheetData>${[...leading, ...body].join("")}</sheetData>${merges}<autoFilter ref="A${headerRow}:${lastColumn}${headerRow + rows.length}"/></worksheet>`;
}

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/><numFmt numFmtId="166" formatCode="&quot;$&quot;#,##0"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF123A56"/><sz val="16"/><name val="Calibri"/></font><font><color rgb="FF53687B"/><sz val="10"/><name val="Calibri"/></font><font><b/><color rgb="FF0C5361"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123A56"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE2F5F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// El avance del mes se presenta como diferencia en puntos porcentuales.
const reportStyles = styles
  .replace('<numFmts count="3">', '<numFmts count="4">')
  .replace('</numFmts>', '<numFmt numFmtId="167" formatCode="0.00&quot; p.p.&quot;"/></numFmts>')
  .replace('<cellXfs count="8">', '<cellXfs count="10">')
  .replace('</cellXfs>', '<xf numFmtId="167" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>');

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function zip(files) {
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const [name, body] of files) {
    const filename = encoder.encode(name);
    const content = encoder.encode(body);
    const checksum = crc32(content);
    const local = new Uint8Array(30 + filename.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint32(14, checksum, true);
    l.setUint32(18, content.length, true);
    l.setUint32(22, content.length, true);
    l.setUint16(26, filename.length, true);
    local.set(filename, 30);
    parts.push(local, content);
    const central = new Uint8Array(46 + filename.length);
    const c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, content.length, true);
    c.setUint32(24, content.length, true);
    c.setUint16(28, filename.length, true);
    c.setUint32(42, offset, true);
    central.set(filename, 46);
    directory.push(central);
    offset += local.length + content.length;
  }
  const directoryLength = directory.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directoryLength, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

export function createXlsx(sheets) {
  if (!sheets.length || sheets.some(({ headers, rows, types }) => !headers?.length || !Array.isArray(rows) || types?.length !== headers.length)) {
    throw new TypeError("El libro requiere hojas con encabezados, filas y tipos.");
  }
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="0" fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", reportStyles],
    ...sheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)])
  ];
  return zip(files);
}
