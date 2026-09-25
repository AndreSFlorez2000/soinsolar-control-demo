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
export const PERIOD_STATUSES = ["abierto", "cerrado"];
export const AUDIT_ACTIONS = ["INSERT", "UPDATE", "DELETE"];
export const CONTRACT_STATUSES = [
  "borrador",
  "vigente",
  "suspendido",
  "finalizado",
  "cancelado"
];
export const INVOICE_STATUSES = ["registrada", "emitida", "anulada"];
export const PAYMENT_STATUSES = ["registrado", "confirmado", "anulado"];
export const APP_ROLES = ["administrador", "gerencia"];

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

export function assertPercentage(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new ValidationError(`${field} debe estar entre 0 y 100.`, field);
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
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
    parentProjectId: record.parent_project_id ? assertUuid(record.parent_project_id, "centro de costo principal") : null,
    parentCostCenter: record.parent_cost_center || null,
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
    clientName: record.client_name || null,
    parentProjectId: record.parent_project_id ? assertUuid(record.parent_project_id, "centro de costo principal") : null,
    parentCostCenter: record.parent_cost_center || null,
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
    ),
    executedProgressPercentage: record.executed_progress_percentage === null || record.executed_progress_percentage === undefined
      ? null : Number(record.executed_progress_percentage),
    profitability: Number(record.profitability ?? (contractValue - totalCostsExpenses)),
    profitabilityPercentage: Number(
      record.profitability_percentage ??
        (contractValue > 0 ? ((contractValue - totalCostsExpenses) / contractValue) * 100 : 0)
    )
  });
}

export function normalizeMonthlySummary(record) {
  const executionKnown = Object.hasOwn(record, "executed_cumulative_percentage")
    ? record.executed_cumulative_percentage !== null
    : true;
  const contractValue = assertMoney(record.contract_value ?? 0, "valor contractual");
  const invoicedValue = assertMoney(record.invoiced_value ?? 0, "valor facturado");
  const cumulativeInvoicedValue = assertMoney(
    record.cumulative_invoiced_value ?? invoicedValue,
    "facturación acumulada"
  );

  return Object.freeze({
    trackingId: record.tracking_id ? assertUuid(record.tracking_id, "seguimiento") : null,
    projectId: assertUuid(record.project_id, "proyecto"),
    costCenter: String(record.cost_center),
    projectName: String(record.project_name),
    periodId: assertUuid(record.period_id, "periodo"),
    contractId: record.contract_id ? assertUuid(record.contract_id, "contrato") : null,
    year: Number(record.year),
    month: Number(record.month),
    periodStatus: String(record.period_status ?? record.status ?? ""),
    contractValue,
    executedIncrementalPercentage: executionKnown ? Number(record.executed_incremental_percentage ?? 0) : null,
    executedCumulativePercentage: executionKnown ? Number(record.executed_cumulative_percentage ?? 0) : null,
    invoicedValue,
    paidValue: assertMoney(record.paid_value ?? 0, "valor pagado"),
    costsExpensesValue: assertMoney(
      record.costs_expenses_value ?? 0,
      "costos y gastos"
    ),
    cumulativeInvoicedValue,
    monthlyProgressPercentage: executionKnown
      ? Number(record.executed_incremental_percentage ?? record.monthly_progress_percentage ?? 0) : null,
    cumulativeProgressPercentage: executionKnown
      ? Number(record.executed_cumulative_percentage ?? record.cumulative_progress_percentage ?? 0) : null,
    monthlyBillingPercentage: Number(
      record.monthly_billing_percentage ??
      record.monthly_progress_percentage ??
      (contractValue > 0 ? (invoicedValue / contractValue) * 100 : 0)
    ),
    cumulativeBillingPercentage: Number(
      record.cumulative_billing_percentage ??
      record.cumulative_progress_percentage ??
      (contractValue > 0 ? (cumulativeInvoicedValue / contractValue) * 100 : 0)
    ),
    validationStatus: record.validation_status || null,
    observations: record.observations || null,
    validatedAt: record.validated_at || null
  });
}

export function normalizePeriod(record) {
  const year = Number(record.year);
  const month = Number(record.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ValidationError("año debe estar entre 2020 y 2100.", "año");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError("mes debe estar entre 1 y 12.", "mes");
  }

  return Object.freeze({
    id: assertUuid(record.id, "periodo"),
    year,
    month,
    status: assertEnum(record.status, PERIOD_STATUSES, "estado del periodo"),
    closedAt: record.closed_at || null,
    closedBy: record.closed_by || null,
    createdAt: record.created_at || null
  });
}

export function periodInputToRecord(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ValidationError("El año debe estar entre 2020 y 2100.", "year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError("El mes debe estar entre 1 y 12.", "month");
  }
  return { year, month, status: "abierto" };
}

export function monthlyTrackingInputToRecord(input, userId) {
  const user = userId ? assertUuid(userId, "usuario") : null;
  const progress = input.executedCumulativePercentage;
  if (progress === "" || progress === null || progress === undefined) {
    throw new ValidationError("Registra el avance de ejecución.", "executedCumulativePercentage");
  }
  return {
    project_id: assertUuid(input.projectId, "proyecto"),
    contract_id: input.contractId ? assertUuid(input.contractId, "contrato") : null,
    period_id: assertUuid(input.periodId, "periodo"),
    executed_cumulative_percentage: assertPercentage(progress, "avance de ejecución"),
    recognized_value: 0,
    observations: input.observations?.trim() || null,
    validation_status: assertEnum(
      input.validationStatus ?? "pendiente",
      VALIDATION_STATUSES,
      "estado de validación"
    ),
    updated_by: user
  };
}

export function normalizeAuditEvent(record) {
  const oldData = record.old_data ?? null;
  const newData = record.new_data ?? null;
  const projectId = record.table_name === "projects"
    ? record.record_id
    : (newData?.project_id ?? oldData?.project_id ?? null);

  return Object.freeze({
    id: String(record.id),
    tableName: assertText(record.table_name, "tabla", { min: 2, max: 80 }),
    recordId: assertUuid(record.record_id, "registro"),
    action: assertEnum(record.action, AUDIT_ACTIONS, "acción"),
    changedBy: record.changed_by || null,
    changedAt: String(record.changed_at),
    oldData,
    newData,
    projectId: projectId ? assertUuid(projectId, "proyecto") : null
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
    parent_project_id: input.parentProjectId ? assertUuid(input.parentProjectId, "centro de costo principal") : null,
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

export function contractInputToRecord(input, userId) {
  const user = userId ? assertUuid(userId, "usuario") : null;
  const startDate = assertDate(input.startDate, "fecha de inicio");
  const endDate = input.endDate ? assertDate(input.endDate, "fecha de finalización") : null;
  if (endDate && endDate < startDate) {
    throw new ValidationError(
      "La fecha de finalización del contrato no puede ser anterior a su inicio.",
      "endDate"
    );
  }

  const initialValue = assertMoney(input.initialValue, "valor inicial", { allowZero: false });
  const additionsValue = assertMoney(input.additionsValue ?? 0, "adiciones");
  const deductionsValue = assertMoney(input.deductionsValue ?? 0, "deducciones");
  if (initialValue + additionsValue - deductionsValue <= 0) {
    throw new ValidationError(
      "El valor contractual vigente debe ser mayor que cero.",
      "deductionsValue"
    );
  }

  return {
    project_id: assertUuid(input.projectId, "proyecto"),
    contract_number: assertText(input.contractNumber, "número de contrato", {
      min: 2,
      max: 80
    }),
    initial_value: initialValue,
    additions_value: additionsValue,
    deductions_value: deductionsValue,
    start_date: startDate,
    end_date: endDate,
    status: assertEnum(input.status ?? "borrador", CONTRACT_STATUSES, "estado del contrato"),
    updated_by: user
  };
}

export function normalizeContract(record) {
  const project = record.projects ?? record.project ?? null;
  const initialValue = assertMoney(record.initial_value, "valor inicial", { allowZero: false });
  const additionsValue = assertMoney(record.additions_value ?? 0, "adiciones");
  const deductionsValue = assertMoney(record.deductions_value ?? 0, "deducciones");

  return Object.freeze({
    id: assertUuid(record.id, "contrato"),
    projectId: assertUuid(record.project_id, "proyecto"),
    contractNumber: assertText(record.contract_number, "número de contrato", { min: 2, max: 80 }),
    initialValue,
    additionsValue,
    deductionsValue,
    currentValue: assertMoney(
      record.current_value ?? initialValue + additionsValue - deductionsValue,
      "valor contractual vigente",
      { allowZero: false }
    ),
    startDate: assertDate(record.start_date, "fecha de inicio"),
    endDate: record.end_date ? assertDate(record.end_date, "fecha de finalización") : null,
    status: assertEnum(record.status, CONTRACT_STATUSES, "estado del contrato"),
    project: project
      ? {
          id: String(project.id ?? record.project_id),
          costCenter: String(project.cost_center ?? ""),
          name: String(project.name ?? "")
        }
      : null,
    createdAt: record.created_at || null,
    updatedAt: record.updated_at || null
  });
}

export function invoiceInputToRecord(input, userId) {
  const user = userId ? assertUuid(userId, "usuario") : null;
  return {
    project_id: assertUuid(input.projectId, "proyecto"),
    contract_id: assertUuid(input.contractId, "contrato"),
    period_id: assertUuid(input.periodId, "periodo"),
    invoice_number: assertText(input.invoiceNumber, "número de factura", { min: 2, max: 80 }),
    issue_date: assertDate(input.issueDate, "fecha de emisión"),
    amount: assertMoney(input.amount, "valor facturado", { allowZero: false }),
    status: assertEnum(input.status ?? "registrada", INVOICE_STATUSES, "estado de factura"),
    support_path: input.supportPath?.trim() || null,
    updated_by: user
  };
}

export function normalizeInvoice(record) {
  const project = record.projects ?? record.project ?? null;
  const contract = record.contracts ?? record.contract ?? null;
  const period = record.periods ?? record.period ?? null;
  return Object.freeze({
    id: assertUuid(record.id, "factura"),
    projectId: assertUuid(record.project_id, "proyecto"),
    contractId: assertUuid(record.contract_id, "contrato"),
    periodId: assertUuid(record.period_id, "periodo"),
    invoiceNumber: assertText(record.invoice_number, "número de factura", { min: 2, max: 80 }),
    issueDate: assertDate(record.issue_date, "fecha de emisión"),
    amount: assertMoney(record.amount, "valor facturado", { allowZero: false }),
    status: assertEnum(record.status, INVOICE_STATUSES, "estado de factura"),
    supportPath: record.support_path || null,
    project: project ? { id: String(project.id ?? record.project_id), costCenter: String(project.cost_center ?? ""), name: String(project.name ?? "") } : null,
    contract: contract ? { id: String(contract.id ?? record.contract_id), number: String(contract.contract_number ?? "") } : null,
    period: period ? { id: String(period.id ?? record.period_id), year: Number(period.year), month: Number(period.month), status: String(period.status ?? "") } : null,
    createdAt: record.created_at || null,
    updatedAt: record.updated_at || null
  });
}

export function paymentInputToRecord(input, userId) {
  const user = userId ? assertUuid(userId, "usuario") : null;
  return {
    invoice_id: assertUuid(input.invoiceId, "factura"),
    project_id: assertUuid(input.projectId, "proyecto"),
    contract_id: assertUuid(input.contractId, "contrato"),
    period_id: assertUuid(input.periodId, "periodo"),
    payment_reference: assertText(input.paymentReference, "referencia de pago", { min: 2, max: 80 }),
    payment_date: assertDate(input.paymentDate, "fecha de pago"),
    amount: assertMoney(input.amount, "valor pagado", { allowZero: false }),
    status: assertEnum(input.status ?? "registrado", PAYMENT_STATUSES, "estado del pago"),
    support_path: input.supportPath?.trim() || null,
    updated_by: user
  };
}

export function normalizePayment(record) {
  const project = record.projects ?? record.project ?? null;
  const invoice = record.invoices ?? record.invoice ?? null;
  const period = record.periods ?? record.period ?? null;
  return Object.freeze({
    id: assertUuid(record.id, "pago"),
    invoiceId: assertUuid(record.invoice_id, "factura"),
    projectId: assertUuid(record.project_id, "proyecto"),
    contractId: assertUuid(record.contract_id, "contrato"),
    periodId: assertUuid(record.period_id, "periodo"),
    paymentReference: assertText(record.payment_reference, "referencia de pago", { min: 2, max: 80 }),
    paymentDate: assertDate(record.payment_date, "fecha de pago"),
    amount: assertMoney(record.amount, "valor pagado", { allowZero: false }),
    status: assertEnum(record.status, PAYMENT_STATUSES, "estado del pago"),
    supportPath: record.support_path || null,
    project: project ? { id: String(project.id ?? record.project_id), costCenter: String(project.cost_center ?? ""), name: String(project.name ?? "") } : null,
    invoice: invoice ? { id: String(invoice.id ?? record.invoice_id), number: String(invoice.invoice_number ?? "") } : null,
    period: period ? { id: String(period.id ?? record.period_id), year: Number(period.year), month: Number(period.month), status: String(period.status ?? "") } : null,
    createdAt: record.created_at || null,
    updatedAt: record.updated_at || null
  });
}

export function normalizeProfile(record) {
  return Object.freeze({
    id: assertUuid(record.id, "usuario"),
    fullName: assertText(record.full_name, "nombre completo", { min: 3, max: 180 }),
    role: assertEnum(record.role, APP_ROLES, "rol"),
    active: Boolean(record.active),
    createdAt: record.created_at || null,
    updatedAt: record.updated_at || null
  });
}

export function profileInputToRecord(input) {
  return {
    full_name: assertText(input.fullName, "nombre completo", { min: 3, max: 180 }),
    role: assertEnum(input.role, APP_ROLES, "rol"),
    active: Boolean(input.active)
  };
}
