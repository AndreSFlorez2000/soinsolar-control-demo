const monthNames = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export function historicalProjectGroups(projects = [], projectId = "") {
  return projects.filter((project) => (!projectId || (project.id ?? project.projectId) === projectId)
    && (project.importedContractValue != null || project.importedBilledTotal != null
      || Object.keys(project.importedMonthlyBilled ?? {}).length
      || project.importedFollowupNotes?.length || project.importedInvoiceReferences?.length))
    .sort((left, right) => String(left.costCenter).localeCompare(String(right.costCenter), "es", { numeric: true }))
    .map((project) => {
      let cumulative = 0;
      const monthKeys = new Set([...Object.keys(project.importedMonthlyBilled ?? {}),
        ...Object.keys(project.importedMonthlyBilledPercentages ?? {})]);
      const months = [...monthKeys].filter((month) => /^20\d{2}-(0[1-9]|1[0-2])$/.test(month))
        .sort((left, right) => left.localeCompare(right))
        .map((month) => {
          const billed = Number(project.importedMonthlyBilled?.[month] ?? 0);
          cumulative = Math.round((cumulative + billed) * 100) / 100;
          const sourcePercent = project.importedMonthlyBilledPercentages?.[month];
          return { month, billed, cumulative,
            sourcePercent: sourcePercent == null ? null : Number(sourcePercent),
            calculatedPercent: Number(project.importedContractValue) > 0
              ? billed / Number(project.importedContractValue) * 100 : null };
        });
      return { project, months };
    });
}

export function historicalWorkbookSheet(projects = [], projectId = "") {
  const groups = historicalProjectGroups(projects, projectId);
  const rows = [];
  for (const { project, months } of groups) {
    const firstRow = rows.length;
    const notes = (project.importedFollowupNotes ?? []).map((item) =>
      `${item.sheet || "Excel"} fila ${item.row || "?"}: ${item.text}`).join("\n");
    const references = (project.importedInvoiceReferences ?? [])
      .map((item) => item.reference).filter((value) => !/^pendiente\s*$/i.test(String(value ?? "").trim())).join("; ");
    const entries = months.length ? months : [{ month: "", billed: null, cumulative: null, sourcePercent: null, calculatedPercent: null }];
    for (const [index, item] of entries.entries()) {
      rows.push([project.costCenter, project.name, project.importedFinancialSource || "Excel histórico",
        item.month, project.importedContractValue ?? null, item.billed,
        item.sourcePercent == null ? null : item.sourcePercent / 100,
        item.calculatedPercent == null ? null : item.calculatedPercent / 100,
        item.cumulative, project.importedBilledTotal ?? null,
        index === 0 && project.importedExecutionSnapshotPercentage != null
          ? Number(project.importedExecutionSnapshotPercentage) / 100 : null,
        index === 0 ? project.importedExecutionMonthLabel || "" : "",
        index === 0 ? references : "", index === 0 ? notes : "",
        index === 0 ? project.importedFinancialReview || "" : "", "Fila principal"]);
    }
    if (Number(project.importedUndatedBilled) > 0) rows.push([
      project.costCenter, project.name, project.importedFinancialSource || "Excel histórico",
      "Sin mes identificado", project.importedContractValue ?? null, Number(project.importedUndatedBilled),
      null, null, project.importedBilledTotal ?? null, project.importedBilledTotal ?? null,
      null, "", "", "", "Importe descontado literalmente en AI; fecha por conciliar", "Fórmula AI; sin mes"
    ]);
    for (const alternate of project.importedAlternateSnapshots ?? []) {
      const altMonths = [...new Set([...Object.keys(alternate.monthlyBilled ?? {}),
        ...Object.keys(alternate.monthlyPercentages ?? {})])].sort();
      for (const month of altMonths.length ? altMonths : [""]) {
        const billed = alternate.monthlyBilled?.[month];
        const percentage = alternate.monthlyPercentages?.[month];
        rows.push([project.costCenter, project.name, `${alternate.sheet || "Otra hoja"}, fila ${alternate.row || "?"}`,
          month, alternate.contractValue ?? null, billed == null ? null : Number(billed),
          percentage == null ? null : Number(percentage) / 100,
          Number(alternate.contractValue) > 0 && billed != null ? Number(billed) / Number(alternate.contractValue) : null,
          null, alternate.billedTotal ?? null, null, "", "", "",
          alternate.includedInTotal
            ? "Meses nuevos de esta hoja ya incorporados al acumulado; no sumar de nuevo"
            : "Cifras distintas: conciliar antes de incorporar",
          alternate.includedInTotal ? "Otra hoja; meses nuevos incorporados" : "Otra hoja; no sumada"]);
      }
    }
    for (const [index, row] of rows.slice(firstRow).entries()) row.push(...(index === 0
      ? [project.importedProjectDescription || "", project.importedServiceCode || "",
        project.importedProjectType || "", project.importedSourceStatus || "",
        project.importedOrderReference || "", project.importedInvoiceMarker || "",
        project.importedPowerValue ?? null, project.importedPowerUnit || ""]
      : ["", "", "", "", "", "", null, ""]));
  }
  return {
    name: "Histórico del Excel",
    title: "Seguimiento mensual y notas del libro histórico",
    notes: [
      "El porcentaje facturado del Excel corresponde a la columna % junto a FACTURADO. El porcentaje calculado divide el importe mensual entre el valor contractual principal.",
      "El avance general del Excel se ubica en el mes MES y el año único de los encabezados del libro. No es ejecución mensual validada. Un importe descontado literalmente en AI sin fecha figura en una fila separada.",
      "Las filas de otras hojas indican si sus meses nuevos ya se incorporaron al acumulado o si son alternativas sin sumar. No se deben sumar otra vez. El archivo no acredita pagos.",
      "Los datos originales del proyecto y su potencia se muestran en columnas separadas. kW y kWp conservan la unidad que consta en la descripción; no se convierten."
    ],
    headers: ["Centro de costo", "Proyecto", "Hoja / fuente", "Mes facturado", "Contrato principal (COP)",
      "Facturado mes (COP)", "% facturado Excel", "% importe / contrato", "Facturado acumulado (COP)",
      "Facturado al corte (COP)", "Avance ejecución general Excel", "Mes de ejecución (sin año)",
      "Referencias de factura", "Notas de seguimiento", "Pendiente de revisión", "Procedencia",
      "Descripción del proyecto", "T.S. Excel", "Tipo Excel", "Estado Excel", "O.C. Excel",
      "Columna N.º FAC", "Potencia Excel", "Unidad potencia"],
    types: ["text", "text", "text", "text", "money", "money", "percent", "percent", "money", "money", "percent", "text", "text", "text", "text", "text",
      "text", "text", "text", "text", "text", "text", "number", "text"],
    rows, freezeColumns: 2, wrapColumns: [12, 13, 14, 16], tabColor: "8053A0",
    columnWidths: [18, 36, 32, 17, 23, 23, 20, 22, 27, 26, 27, 23, 32, 55, 55, 24,
      48, 18, 24, 20, 24, 22, 18, 18]
  };
}

export function managementSummarySheet(reportRows = []) {
  return {
    name: "Resumen",
    title: "Resumen de proyectos | SOINSOLAR",
    notes: [
      "Avance físico acumulado: obra ejecutada. Facturación: facturado ÷ contrato. Recaudo Financiero: pagado ÷ contrato. Consulta las hojas mensuales para comparar cada periodo.",
      "Importes en pesos colombianos (COP). Las celdas vacías de avance físico indican que aún no se registró seguimiento."
    ],
    headers: ["Centro de costo", "Centro principal", "Proyecto", "Municipio", "Estado", "Contrato vigente", "Avance físico acumulado", "Facturado", "Facturación %", "Recaudo registrado", "Costos y gastos", "Rentabilidad", "Saldo por facturar", "Cartera formal"],
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
        "Facturado y recaudo registrado son movimientos distintos. Los acumulados suman los periodos anteriores. El Excel histórico no confirma importes ni fechas de recaudo.",
        "Sin registro físico: 0 p.p. consignados no equivale a una verificación de obra sin avance. Los meses del Excel muestran su facturación y avance general en columnas propias; ese avance aún no está validado."
      ],
      headers: [
        "Centro de costo", "Proyecto", "Periodo", "Comparado con", "Contrato (COP)",
        "Avance cierre anterior", "Avance cierre actual", "Avance logrado en el mes (p.p.)",
        "Equivalente físico del mes (COP)", "Equivalente físico acumulado (COP)",
        "Facturado del mes (COP)", "Facturado acumulado (COP)",
        "Facturación del mes (%)", "Facturación acumulada (%)",
        "Pagado del mes (COP)", "Pagado acumulado (COP)",
        "Costos del mes (COP)", "Costos acumulados (COP)",
        "Diferencia facturado − recaudo registrado, sin conciliar (COP)", "Saldo por facturar (COP)",
        "Estado del avance", "Novedad que afecta la ejecución", "Observaciones", "Validación",
        "Avance general Excel (%)", "Facturación Excel mes (%)", "Origen"
      ],
      types: ["text", "text", "text", "text", "money0", "percent", "percent", "points", "money0", "money0", "money0", "money0", "percent", "percent", "money0", "money0", "money0", "money0", "money0", "money0", "text", "text", "text", "text", "percent", "percent", "text"],
      rows: rows.map((row) => [
        row.costCenter, row.projectName, `${row.year}-${String(row.month).padStart(2, "0")}`,
        row.previousExecutionPeriod
          ? `${monthNames[row.previousExecutionPeriod.month - 1]} ${row.previousExecutionPeriod.year}` : "Inicio (0 %)",
        row.contractValue, row.previousProgress / 100, row.cumulativeProgress / 100,
        row.monthlyProgress, row.monthlyEquivalent, row.cumulativeEquivalent,
        row.monthlyInvoiced, row.cumulativeInvoiced, row.monthlyBilling / 100, row.cumulativeBilling / 100,
        row.monthlyPaid, row.cumulativePaid, row.monthlyCosts, row.cumulativeCosts,
        row.receivable, row.contractBalance,
        row.executionRecorded ? "Avance registrado" : row.importedExecutionPercentage == null
          ? "Sin seguimiento físico" : "Referencia Excel sin validar",
        row.executionIssue, row.observations, row.validationStatus,
        row.importedExecutionPercentage == null ? null : row.importedExecutionPercentage / 100,
        row.importedBillingPercentage == null ? null : row.importedBillingPercentage / 100,
        row.importedHistory ? "Excel histórico" : "Sistema"
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
        { from: 20, to: 23, style: 15 }, { from: 24, to: 26, style: 15 }
      ],
      wrapColumns: [21, 22],
      tabColor: "0C5361",
      printPagesWide: 3,
      columnWidths: [20, 40, 14, 22, 20, 21, 21, 27, 30, 34, 25, 28, 26, 30, 25, 28, 23, 27, 26, 27, 25, 48, 48, 21, 26, 26, 21]
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
