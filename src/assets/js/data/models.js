export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export const PROJECT_STATUSES = [
  "planeado",
  "activo",
  "suspendido",
  "finalizado",
  "cancelado"
];

export const VALIDATION_STATUSES = [
  "borrador",
  "pendiente",
  "validado",
  "rechazado"
];

export const MOVEMENT_TYPES = ["costo", "gasto"];

export function assertDate(value, field) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new ValidationError(`${field} debe tener formato AAAA-MM-DD.`, field);
  }

  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new ValidationError(`${field} no es una fecha válida.`, field);
  }

  return normalized;
}

export function assertUuid(value, field = "id") {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(String(value ?? ""))) {
    throw new ValidationError(`${field} debe ser un UUID válido.`, field);
  }

  return String(value);
}

export function assertText(value, field, { min = 1, max = 250 } = {}) {
  const normalized = String(value ?? "").trim();

  if (normalized.length < min || normalized.length > max) {
    throw new ValidationError(
      `${field} debe contener entre ${min} y ${max} caracteres.`,
      field
    );
  }

  return normalized;
}

export function assertMoney(value, field, { allowZero = true } = {}) {
  const number = Number(value);
  const minimum = allowZero ? 0 : Number.EPSILON;

  if (!Number.isFinite(number) || number < minimum) {
    throw new ValidationError(
      `${field} debe ser un valor monetario ${allowZero ? "no negativo" : "positivo"}.`,
      field
    );
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
}

export function assertEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    throw new ValidationError(
      `${field} debe ser uno de: ${allowed.join(", ")}.`,
      field
    );
  }

  return value;
}

export function normalizeProject(record) {
  return Object.freeze({
    id: assertUuid(record.id),
    costCenter: assertText(record.cost_center, "centro de costo", {
      min: 2,
      max: 50
    }),
    name: assertText(record.name, "nombre", { min: 3, max: 180 }),
    clientName: record.client_name?.trim() || null,
    municipality: assertText(record.municipality, "municipio", {
      min: 2,
      max: 120
    }),
    serviceType: assertText(record.service_type, "tipo de servicio", {
      min: 2,
      max: 120
    }),
    powerKwp:
      record.power_kwp === null || record.power_kwp === undefined
        ? null
        : Number(record.power_kwp),
    status: assertEnum(record.status, PROJECT_STATUSES, "estado"),
    startDate: record.start_date || null,
    endDate: record.end_date || null,
    notes: record.notes || null
  });
}

export function normalizeProjectSummary(record) {
  const contractValue = assertMoney(record.contract_value ?? 0, "valor contractual");
  const totalInvoiced = assertMoney(record.total_invoiced ?? 0, "total facturado");
  const totalPaid = assertMoney(record.total_paid ?? 0, "total pagado");
  const totalCostsExpenses = assertMoney(
    record.total_costs_expenses ?? 0,
    "costos y gastos"
  );

  return Object.freeze({
    projectId: assertUuid(record.id),
    costCenter: String(record.cost_center),
    projectName: String(record.name),
    municipality: String(record.municipality),
    serviceType: String(record.service_type),
    status: String(record.status),
    contractId: record.contract_id ? assertUuid(record.contract_id, "contrato") : null,
    contractNumber: record.contract_number || null,
    contractValue,
    totalInvoiced,
    totalPaid,
    totalCostsExpenses,
    contractualBalance: assertMoney(
      record.contractual_balance ?? Math.max(contractValue - totalInvoiced, 0),
      "saldo contractual"
    ),
    paymentPending: assertMoney(
      record.payment_pending ?? Math.max(totalInvoiced - totalPaid, 0),
      "pago pendiente"
    ),
    financialProgressPercentage: Number(
      record.financial_progress_percentage ??
        (contractValue > 0 ? (totalInvoiced / contractValue) * 100 : 0)
    )
  });
}

export function normalizeMonthlySummary(record) {
  return Object.freeze({
    projectId: assertUuid(record.project_id, "proyecto"),
    costCenter: String(record.cost_center),
    projectName: String(record.project_name),
    periodId: assertUuid(record.period_id, "periodo"),
    year: Number(record.year),
    month: Number(record.month),
    recognizedValue: assertMoney(record.recognized_value ?? 0, "valor reconocido"),
    invoicedValue: assertMoney(record.invoiced_value ?? 0, "valor facturado"),
    paidValue: assertMoney(record.paid_value ?? 0, "valor pagado"),
    costsExpensesValue: assertMoney(
      record.costs_expenses_value ?? 0,
      "costos y gastos"
    ),
    validationStatus: record.validation_status || null
  });
}

export function projectInputToRecord(input, userId) {
  const startDate = input.startDate ? assertDate(input.startDate, "fecha de inicio") : null;
  const endDate = input.endDate ? assertDate(input.endDate, "fecha de finalización") : null;

  if (startDate && endDate && endDate < startDate) {
    throw new ValidationError(
      "La fecha de finalización no puede ser anterior a la fecha de inicio.",
      "endDate"
    );
  }

  return {
    cost_center: assertText(input.costCenter, "centro de costo", {
      min: 2,
      max: 50
    }),
    name: assertText(input.name, "nombre", { min: 3, max: 180 }),
    client_name: input.clientName?.trim() || null,
    municipality: assertText(input.municipality, "municipio", {
      min: 2,
      max: 120
    }),
    service_type: assertText(input.serviceType, "tipo de servicio", {
      min: 2,
      max: 120
    }),
    power_kwp:
      input.powerKwp === null || input.powerKwp === undefined
        ? null
        : assertMoney(input.powerKwp, "potencia"),
    status: assertEnum(input.status ?? "planeado", PROJECT_STATUSES, "estado"),
    start_date: startDate,
    end_date: endDate,
    notes: input.notes?.trim() || null,
    updated_by: userId ? assertUuid(userId, "usuario") : null
  };
}

export function costExpenseInputToRecord(input, userId) {
  const user = userId ? assertUuid(userId, "usuario") : null;

  return {
    project_id: assertUuid(input.projectId, "proyecto"),
    period_id: assertUuid(input.periodId, "periodo"),
    movement_type: assertEnum(input.type, MOVEMENT_TYPES, "tipo de movimiento"),
    category: assertText(input.category, "categoría", { min: 2, max: 100 }),
    description: assertText(input.description, "descripción", { min: 3, max: 300 }),
    supplier_name: input.supplierName?.trim()
      ? assertText(input.supplierName, "proveedor", { min: 2, max: 180 })
      : null,
    document_reference: input.documentReference?.trim()
      ? assertText(input.documentReference, "referencia documental", { min: 2, max: 100 })
      : null,
    movement_date: assertDate(input.movementDate, "fecha del movimiento"),
    amount: assertMoney(input.amount, "valor", { allowZero: false }),
    support_path: input.supportPath?.trim() || null,
    created_by: user,
    updated_by: user
  };
}

export function normalizeCostExpense(record) {
  const project = record.projects ?? record.project ?? null;
  const period = record.periods ?? record.period ?? null;

  return Object.freeze({
    id: assertUuid(record.id),
    projectId: assertUuid(record.project_id, "proyecto"),
    periodId: assertUuid(record.period_id, "periodo"),
    type: assertEnum(record.movement_type, MOVEMENT_TYPES, "tipo de movimiento"),
    category: assertText(record.category, "categoría", { min: 2, max: 100 }),
    description: assertText(record.description, "descripción", { min: 3, max: 300 }),
    supplierName: record.supplier_name?.trim() || null,
    documentReference: record.document_reference?.trim() || null,
    movementDate: assertDate(record.movement_date, "fecha del movimiento"),
    amount: assertMoney(record.amount, "valor", { allowZero: false }),
    supportPath: record.support_path || null,
    project: project
      ? {
          id: String(project.id ?? record.project_id),
          costCenter: String(project.cost_center ?? ""),
          name: String(project.name ?? "")
        }
      : null,
    period: period
      ? {
          id: String(period.id ?? record.period_id),
          year: Number(period.year),
          month: Number(period.month),
          status: String(period.status ?? "")
        }
      : null,
    createdAt: record.created_at || null
  });
}
