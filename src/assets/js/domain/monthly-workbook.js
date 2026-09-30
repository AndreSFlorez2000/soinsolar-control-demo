const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

// Una celda vacía indica que el periodo no está en la exportación; cero indica
// que sí está incluido y no tiene avance físico consignado en ese mes.
export function monthlyWorkbookSheets(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.projectId}:${row.year}`;
    if (!groups.has(key)) groups.set(key, { project: row, months: Array(12).fill(null), last: row });
    const group = groups.get(key);
    group.months[row.month - 1] = row.monthlyProgress / 100;
    if (row.month >= group.last.month) group.last = row;
  }

  const annualRows = [...groups.values()]
    .sort((a, b) => a.project.projectName.localeCompare(b.project.projectName, "es") || a.project.year - b.project.year)
    .map(({ project, months, last }) => [
      project.costCenter, project.projectName, project.year, project.contractValue,
      ...months, monthNames[last.month - 1], last.cumulativeProgress / 100
    ]);

  return [
    {
      name: "Mes a mes",
      title: "Avance físico mes a mes",
      notes: [
        "Cada porcentaje mensual es el avance acumulado del mes menos el acumulado anterior. Ejemplo: 50 % en octubre − 15 % en septiembre = 35 % en octubre.",
        "0 %: mes incluido sin avance consignado. Celda vacía: periodo fuera de esta exportación. La facturación se consulta por separado en Detalle mensual."
      ],
      headers: ["Centro de costo", "Proyecto", "Año", "Contrato (COP)", ...monthNames, "Último mes incluido", "Avance acumulado"],
      types: ["text", "text", "number", "money0", ...monthNames.map(() => "percent"), "text", "percent"],
      rows: annualRows,
      freezeColumns: 3,
      highlightColumns: [...monthNames.map((_, index) => index + 4), 17],
      columnWidths: [20, 40, 10, 20, ...monthNames.map(() => 13), 21, 21]
    },
    {
      name: "Detalle mensual",
      title: "Detalle del avance por periodo",
      notes: [
        "Avance del mes = avance acumulado − avance anterior. El valor equivalente es una referencia del contrato; no es facturación ni pago.",
        "Facturación del mes (%) = facturado del mes ÷ contrato vigente. Los meses sin factura se muestran con 0 % y $0."
      ],
      headers: [
        "Centro de costo", "Proyecto", "Periodo", "Contrato (COP)", "Avance anterior",
        "Avance del mes", "Avance acumulado", "Equivalente del mes (COP)",
        "Equivalente acumulado (COP)", "Facturado del mes (COP)",
        "Facturación del mes", "Novedad que afecta la ejecución", "Estado del seguimiento"
      ],
      types: ["text", "text", "text", "money0", "percent", "percent", "percent", "money0", "money0", "money0", "percent", "text", "text"],
      rows: rows.map((row) => [
        row.costCenter, row.projectName, `${row.year}-${String(row.month).padStart(2, "0")}`,
        row.contractValue, row.previousProgress / 100, row.monthlyProgress / 100,
        row.cumulativeProgress / 100, row.monthlyEquivalent, row.cumulativeEquivalent,
        row.monthlyInvoiced, row.monthlyBilling / 100, row.executionIssue, row.validationStatus
      ]),
      freezeColumns: 3,
      highlightColumns: [5],
      columnWidths: [20, 40, 14, 20, 19, 19, 21, 28, 31, 26, 21, 48, 24]
    }
  ];
}
