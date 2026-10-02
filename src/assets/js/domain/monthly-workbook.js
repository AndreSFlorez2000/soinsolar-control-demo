const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function managementSummarySheet(reportRows = []) {
  return {
    name: "Resumen",
    title: "Resumen de proyectos | SOINSOLAR",
    notes: [
      "Avance físico acumulado: obra ejecutada. Avance financiero: facturado ÷ contrato. Pagado: dinero recibido. Consulta las hojas mensuales para comparar cada periodo.",
      "Importes en pesos colombianos (COP). Las celdas vacías de avance físico indican que aún no se registró seguimiento."
    ],
    headers: ["Centro de costo", "Centro principal", "Proyecto", "Municipio", "Estado", "Contrato vigente", "Avance físico acumulado", "Facturado", "Avance financiero", "Pagado", "Costos y gastos", "Rentabilidad", "Saldo contractual", "Cartera"],
    types: ["text", "text", "text", "text", "text", "money", "percent", "money", "percent", "money", "money", "money", "money", "money"],
    freezeColumns: 3,
    highlightColumns: [6, 8, 9, 13],
    headerGroups: [
      { from: 0, to: 4, style: 1 }, { from: 5, to: 6, style: 10 },
      { from: 7, to: 8, style: 11 }, { from: 9, to: 9, style: 12 },
      { from: 10, to: 11, style: 13 }, { from: 12, to: 13, style: 14 }
    ],
    tabColor: "123A56",
    printPagesWide: 2,
    columnWidths: [20, 22, 42, 24, 20, 23, 26, 23, 26, 23, 24, 24, 25, 23],
    rows: reportRows.map((row) => [
      row.costCenter, row.parentCostCenter, row.projectName, row.municipality, row.status, row.contractValue,
      row.executionProgress === null ? null : row.executionProgress / 100, row.invoiced, row.financialProgress / 100,
      row.paid, row.costsExpenses, row.profitability, row.contractualBalance, row.paymentPending
    ])
  };
}

// Una celda vacía indica que el periodo no está en la exportación; cero indica
// que sí está incluido y no tiene avance físico consignado en ese mes.
export function monthlyWorkbookSheets(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.projectId}:${row.year}`;
    if (!groups.has(key)) groups.set(key, {
      project: row, months: Array(12).fill(null), paymentMonths: Array(12).fill(null), last: row
    });
    const group = groups.get(key);
    group.months[row.month - 1] = row.monthlyProgress / 100;
    group.paymentMonths[row.month - 1] = row.monthlyPaid;
    if (row.month >= group.last.month) group.last = row;
  }

  const annualRows = [...groups.values()]
    .sort((a, b) => a.project.projectName.localeCompare(b.project.projectName, "es") || a.project.year - b.project.year)
    .map(({ project, months, last }) => [
      project.costCenter, project.projectName, project.year, project.contractValue,
      ...months, monthNames[last.month - 1], last.cumulativeProgress / 100
    ]);

  const monthlyMatrix = {
      name: "Mes a mes",
      title: "Avance físico mes a mes",
      notes: [
        "Cada porcentaje mensual es el avance acumulado del mes menos el acumulado anterior. Ejemplo: 50 % en octubre − 15 % en septiembre = 35 % en octubre.",
        "0 %: sin avance consignado para ese mes; consulta Estado del avance en Detalle mensual para saber si hubo registro. Celda vacía: periodo fuera de esta exportación."
      ],
      headers: ["Centro de costo", "Proyecto", "Año", "Contrato (COP)", ...monthNames, "Último mes incluido", "Avance acumulado"],
      types: ["text", "text", "number", "money0", ...monthNames.map(() => "percent"), "text", "percent"],
      rows: annualRows,
      freezeColumns: 3,
      highlightColumns: [...monthNames.map((_, index) => index + 4), 17],
      headerGroups: [{ from: 0, to: 3, style: 1 }, { from: 4, to: 15, style: 10 }, { from: 16, to: 17, style: 15 }],
      tabColor: "245C94",
      printPagesWide: 2,
      columnWidths: [20, 40, 10, 20, ...monthNames.map(() => 13), 21, 21]
    };
  const detail = {
      name: "Detalle mensual",
      title: "Comparación mensual de ejecución, facturación y pagos",
      notes: [
        "Lee F → G → H: avance anterior 15 %; avance actual 50 %; diferencia de octubre = 35 p.p. (puntos porcentuales). H se recalcula en Excel como (G − F) × 100.",
        "El valor equivalente del mes = contrato × H ÷ 100. Es una referencia física: no es una factura, un pago ni un costo.",
        "Facturado y pagado del mes son movimientos del periodo. Los acumulados suman los periodos anteriores, incluso de otros años. Cartera = facturado acumulado − pagado acumulado.",
        "Sin registro físico: 0 p.p. consignados no equivale a una verificación de obra sin avance. Una celda vacía en las matrices indica que el periodo no está exportado."
      ],
      headers: [
        "Centro de costo", "Proyecto", "Periodo", "Comparado con", "Contrato (COP)",
        "Avance cierre anterior", "Avance cierre actual", "Avance logrado en el mes (p.p.)",
        "Equivalente físico del mes (COP)", "Equivalente físico acumulado (COP)",
        "Facturado del mes (COP)", "Facturado acumulado (COP)",
        "Avance financiero del mes", "Avance financiero acumulado",
        "Pagado del mes (COP)", "Pagado acumulado (COP)",
        "Costos del mes (COP)", "Costos acumulados (COP)",
        "Cartera por cobrar (COP)", "Saldo por facturar (COP)",
        "Estado del avance", "Novedad que afecta la ejecución", "Observaciones", "Validación"
      ],
      types: ["text", "text", "text", "text", "money0", "percent", "percent", "points", "money0", "money0", "money0", "money0", "percent", "percent", "money0", "money0", "money0", "money0", "money0", "money0", "text", "text", "text", "text"],
      rows: rows.map((row) => [
        row.costCenter, row.projectName, `${row.year}-${String(row.month).padStart(2, "0")}`,
        row.previousExecutionPeriod
          ? `${monthNames[row.previousExecutionPeriod.month - 1]} ${row.previousExecutionPeriod.year}` : "Inicio (0 %)",
        row.contractValue, row.previousProgress / 100, row.cumulativeProgress / 100,
        row.monthlyProgress, row.monthlyEquivalent, row.cumulativeEquivalent,
        row.monthlyInvoiced, row.cumulativeInvoiced, row.monthlyBilling / 100, row.cumulativeBilling / 100,
        row.monthlyPaid, row.cumulativePaid, row.monthlyCosts, row.cumulativeCosts,
        row.receivable, row.contractBalance,
        row.executionRecorded ? "Avance registrado" : "Sin seguimiento físico",
        row.executionIssue, row.observations, row.validationStatus
      ]),
      formulas: {
        7: (r) => `ROUND((G${r}-F${r})*100,2)`,
        8: (r) => `ROUND(E${r}*H${r}/100,2)`,
        9: (r) => `ROUND(E${r}*G${r},2)`,
        12: (r) => `IFERROR(ROUND(K${r}/E${r},4),0)`,
        13: (r) => `IFERROR(ROUND(L${r}/E${r},4),0)`,
        18: (r) => `MAX(L${r}-P${r},0)`,
        19: (r) => `MAX(E${r}-L${r},0)`
      },
      freezeColumns: 3,
      highlightColumns: [7, 15, 18, 19],
      headerGroups: [
        { from: 0, to: 3, style: 1 }, { from: 4, to: 9, style: 10 },
        { from: 10, to: 13, style: 11 }, { from: 14, to: 15, style: 12 },
        { from: 16, to: 17, style: 13 }, { from: 18, to: 19, style: 14 },
        { from: 20, to: 23, style: 15 }
      ],
      wrapColumns: [21, 22],
      tabColor: "0C5361",
      printPagesWide: 3,
      columnWidths: [20, 40, 14, 22, 20, 21, 21, 27, 30, 34, 25, 28, 26, 30, 25, 28, 23, 27, 26, 27, 25, 48, 48, 21]
    };
  const paymentMatrix = {
      name: "Pagos mes a mes",
      title: "Pagos registrados mes a mes",
      notes: [
        "$0: periodo incluido sin pagos. Celda vacía: periodo fuera de esta exportación.",
        "Pagado en el año suma los meses incluidos; pagado acumulado incluye también los años anteriores hasta el último periodo mostrado."
      ],
      headers: [
        "Centro de costo", "Proyecto", "Año", ...monthNames,
        "Último mes incluido", "Pagado en el año (COP)", "Pagado acumulado (COP)"
      ],
      types: ["text", "text", "number", ...monthNames.map(() => "money0"), "text", "money0", "money0"],
      rows: [...groups.values()]
        .sort((a, b) => a.project.projectName.localeCompare(b.project.projectName, "es") || a.project.year - b.project.year)
        .map(({ project, paymentMonths, last }) => [
          project.costCenter, project.projectName, project.year, ...paymentMonths,
          monthNames[last.month - 1], paymentMonths.reduce((sum, value) => sum + (value ?? 0), 0), last.cumulativePaid
        ]),
      freezeColumns: 3,
      highlightColumns: [16, 17],
      headerGroups: [
        { from: 0, to: 2, style: 1 }, { from: 3, to: 14, style: 12 },
        { from: 15, to: 17, style: 14 }
      ],
      tabColor: "2D7C68",
      printPagesWide: 2,
      columnWidths: [20, 40, 10, ...monthNames.map(() => 19), 21, 25, 28]
    };
  return [detail, monthlyMatrix, paymentMatrix];
}
