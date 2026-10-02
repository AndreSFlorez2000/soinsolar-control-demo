// La primera hoja conserva los encabezados en la fila 1 para poder cargarla
// desde Costos y gastos después de diligenciar o editar sus movimientos.
export function costWorkbookSheets(movements = [], { template = false } = {}) {
  const blankRows = Array.from({ length: 20 }, () => Array(9).fill(""));
  const rows = template ? blankRows : movements.map((item) => [
    item.movementDate, item.project?.costCenter ?? item.costCenter ?? "",
    item.project?.name ?? item.projectName ?? "", item.type, item.category,
    item.description, item.supplierName, item.documentReference, item.amount
  ]);

  return [
    {
      name: "Costos y gastos",
      headers: ["Fecha", "Centro de costo", "Proyecto", "Tipo", "Categoría", "Descripción", "Proveedor", "Referencia", "Valor COP"],
      types: ["text", "text", "text", "text", "text", "text", "text", "text", "money0"],
      rows,
      freezeColumns: 2,
      highlightColumns: [8],
      headerGroups: [
        { from: 0, to: 2, style: 1 }, { from: 3, to: 5, style: 10 },
        { from: 6, to: 7, style: 11 }, { from: 8, to: 8, style: 12 }
      ],
      wrapColumns: [2, 4, 5, 6, 7],
      tabColor: "0C5361",
      printPagesWide: 1,
      columnWidths: [16, 19, 32, 13, 22, 42, 25, 22, 20]
    },
    {
      name: "Guía de carga",
      title: "Formato de costos y gastos | SOINSOLAR",
      notes: [
        "Diligencia la primera hoja, Costos y gastos, sin cambiar los encabezados. Una fila representa un movimiento.",
        "Importar crea movimientos nuevos. Para evitar duplicados, carga solamente las filas nuevas. El periodo de la fecha debe estar abierto.",
        "La carga por Excel no adjunta archivos de soporte; agrega cada soporte desde el formulario de un movimiento individual."
      ],
      headers: ["Campo", "Cómo diligenciarlo", "Obligatorio"],
      types: ["text", "text", "text"],
      rows: [
        ["Fecha", "AAAA-MM-DD; debe corresponder a un periodo abierto.", "Sí"],
        ["Centro de costo", "Código de un proyecto existente. Es el dato que vincula el movimiento al proyecto.", "Sí"],
        ["Proyecto", "Nombre de referencia para facilitar la lectura. La aplicación usa el centro de costo.", "No"],
        ["Tipo", "Escribe costo o gasto.", "Sí"],
        ["Categoría", "Categoría del movimiento, por ejemplo Materiales o Transporte.", "Sí"],
        ["Descripción", "Describe el bien, servicio o actividad. Mínimo tres caracteres.", "Sí"],
        ["Proveedor", "Nombre del proveedor, si aplica.", "No"],
        ["Referencia", "Número de factura o referencia documental, si aplica.", "No"],
        ["Valor COP", "Número positivo sin separadores de miles. Ejemplo: 250000.", "Sí"]
      ],
      freezeColumns: 1,
      headerGroups: [{ from: 0, to: 0, style: 1 }, { from: 1, to: 1, style: 10 }, { from: 2, to: 2, style: 12 }],
      wrapColumns: [1],
      tabColor: "A46A1A",
      printPagesWide: 1,
      columnWidths: [24, 82, 18]
    }
  ];
}
