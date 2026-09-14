import {
  assertEnum,
  assertMoney,
  assertText,
  assertUuid,
  costExpenseInputToRecord,
  monthlyTrackingInputToRecord,
  normalizeAuditEvent,
  normalizeCostExpense,
  normalizeMonthlySummary,
  normalizePeriod,
  normalizeProject,
  normalizeProjectSummary,
  projectInputToRecord,
  VALIDATION_STATUSES
} from "./models.js?v=0.4.0";

export class DataAccessError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = "DataAccessError";
    this.cause = cause;
  }
}

async function unwrap(query, context) {
  const { data, error } = await query;

  if (error) {
    throw new DataAccessError(`${context}: ${error.message}`, error);
  }

  return data;
}

function normalizeYear(value) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new DataAccessError("El año debe estar entre 2020 y 2100.");
  }
  return year;
}

function normalizeMonth(value) {
  const month = Number(value);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new DataAccessError("El mes debe estar entre 1 y 12.");
  }
  return month;
}

export class ProjectRepository {
  constructor(client) {
    this.client = client;
  }

  async list(filters = {}) {
    let query = this.client
      .from("project_financial_summary")
      .select("*")
      .order("name");

    if (filters.name) query = query.ilike("name", `%${String(filters.name).trim()}%`);
    if (filters.costCenter) query = query.eq("cost_center", String(filters.costCenter).trim());
    if (filters.municipality) {
      query = query.eq("municipality", String(filters.municipality).trim());
    }
    if (filters.status) query = query.eq("status", filters.status);

    const rows = await unwrap(query, "No fue posible consultar los proyectos");
    return rows.map(normalizeProjectSummary);
  }

  async get(projectId) {
    const id = assertUuid(projectId, "proyecto");
    const row = await unwrap(
      this.client.from("projects").select("*").eq("id", id).single(),
      "No fue posible consultar el proyecto"
    );
    return normalizeProject(row);
  }

  async getSummary(projectId) {
    const id = assertUuid(projectId, "proyecto");
    const row = await unwrap(
      this.client
        .from("project_financial_summary")
        .select("*")
        .eq("id", id)
        .single(),
      "No fue posible consultar el resumen financiero"
    );
    return normalizeProjectSummary(row);
  }

  async create(input, userId) {
    const record = projectInputToRecord(input, userId);
    record.created_by = userId ? assertUuid(userId, "usuario") : null;

    const row = await unwrap(
      this.client.from("projects").insert(record).select("*").single(),
      "No fue posible crear el proyecto"
    );
    return normalizeProject(row);
  }

  async update(projectId, input, userId) {
    const id = assertUuid(projectId, "proyecto");
    const record = projectInputToRecord(input, userId);

    const row = await unwrap(
      this.client.from("projects").update(record).eq("id", id).select("*").single(),
      "No fue posible actualizar el proyecto"
    );
    return normalizeProject(row);
  }

  async remove(projectId) {
    const id = assertUuid(projectId, "proyecto");
    await unwrap(
      this.client.from("projects").delete().eq("id", id),
      "No fue posible eliminar el proyecto"
    );
  }
}

export class ContractRepository {
  constructor(client) {
    this.client = client;
  }

  async listByProject(projectId) {
    const id = assertUuid(projectId, "proyecto");
    return unwrap(
      this.client
        .from("contracts")
        .select("*")
        .eq("project_id", id)
        .order("start_date", { ascending: false }),
      "No fue posible consultar los contratos"
    );
  }

  async create(input, userId) {
    const record = {
      project_id: assertUuid(input.projectId, "proyecto"),
      contract_number: assertText(input.contractNumber, "número de contrato", {
        min: 2,
        max: 80
      }),
      initial_value: assertMoney(input.initialValue, "valor inicial", {
        allowZero: false
      }),
      additions_value: assertMoney(input.additionsValue ?? 0, "adiciones"),
      deductions_value: assertMoney(input.deductionsValue ?? 0, "deducciones"),
      start_date: input.startDate,
      end_date: input.endDate || null,
      status: input.status ?? "borrador",
      created_by: userId ? assertUuid(userId, "usuario") : null,
      updated_by: userId ? assertUuid(userId, "usuario") : null
    };

    return unwrap(
      this.client.from("contracts").insert(record).select("*").single(),
      "No fue posible crear el contrato"
    );
  }

  async updateValues(contractId, values, userId) {
    const id = assertUuid(contractId, "contrato");
    const record = {
      initial_value: assertMoney(values.initialValue, "valor inicial", {
        allowZero: false
      }),
      additions_value: assertMoney(values.additionsValue ?? 0, "adiciones"),
      deductions_value: assertMoney(values.deductionsValue ?? 0, "deducciones"),
      updated_by: userId ? assertUuid(userId, "usuario") : null
    };

    return unwrap(
      this.client.from("contracts").update(record).eq("id", id).select("*").single(),
      "No fue posible actualizar el contrato"
    );
  }
}

export class PeriodRepository {
  constructor(client) {
    this.client = client;
  }

  async list() {
    const rows = await unwrap(
      this.client
        .from("periods")
        .select("*")
        .order("year", { ascending: false })
        .order("month", { ascending: false }),
      "No fue posible consultar los periodos"
    );
    return rows.map(normalizePeriod);
  }

  async find(year, month) {
    const row = await unwrap(
      this.client
        .from("periods")
        .select("*")
        .eq("year", normalizeYear(year))
        .eq("month", normalizeMonth(month))
        .single(),
      "No fue posible consultar el periodo"
    );
    return normalizePeriod(row);
  }

  async create(year, month) {
    const row = await unwrap(
      this.client
        .from("periods")
        .insert({ year: normalizeYear(year), month: normalizeMonth(month) })
        .select("*")
        .single(),
      "No fue posible crear el periodo"
    );
    return normalizePeriod(row);
  }

  async close(periodId, userId) {
    const id = assertUuid(periodId, "periodo");
    const user = assertUuid(userId, "usuario");

    const row = await unwrap(
      this.client
        .from("periods")
        .update({ status: "cerrado", closed_at: new Date().toISOString(), closed_by: user })
        .eq("id", id)
        .select("*")
        .single(),
      "No fue posible cerrar el periodo"
    );
    return normalizePeriod(row);
  }

  async reopen(periodId) {
    const id = assertUuid(periodId, "periodo");
    const row = await unwrap(
      this.client.from("periods").update({ status: "abierto", closed_at: null, closed_by: null }).eq("id", id).select("*").single(),
      "No fue posible reabrir el periodo"
    );
    return normalizePeriod(row);
  }
}

export class MonthlyTrackingRepository {
  constructor(client) {
    this.client = client;
  }

  async list(filters = {}) {
    let query = this.client.from("monthly_project_summary").select("*")
      .order("year", { ascending: false }).order("month", { ascending: false }).order("project_name");
    if (filters.projectId) query = query.eq("project_id", assertUuid(filters.projectId, "proyecto"));
    if (filters.periodId) query = query.eq("period_id", assertUuid(filters.periodId, "periodo"));
    if (filters.validationStatus) query = query.eq("validation_status", assertEnum(filters.validationStatus, VALIDATION_STATUSES, "estado de validación"));
    const rows = await unwrap(query, "No fue posible consultar los registros mensuales");
    return rows.map(normalizeMonthlySummary);
  }

  async listByProject(projectId, filters = {}) {
    const id = assertUuid(projectId, "proyecto");
    let query = this.client
      .from("monthly_project_summary")
      .select("*")
      .eq("project_id", id)
      .order("year")
      .order("month");

    if (filters.year) query = query.eq("year", normalizeYear(filters.year));
    if (filters.month) query = query.eq("month", normalizeMonth(filters.month));

    const rows = await unwrap(query, "No fue posible consultar el seguimiento mensual");
    return rows.map(normalizeMonthlySummary);
  }

  async save(input, userId) {
    const user = userId ? assertUuid(userId, "usuario") : null;
    const record = monthlyTrackingInputToRecord(input, user);
    const projectId = record.project_id;
    const periodId = record.period_id;

    const existing = await unwrap(
      this.client
        .from("monthly_tracking")
        .select("id")
        .eq("project_id", projectId)
        .eq("period_id", periodId)
        .maybeSingle(),
      "No fue posible verificar el seguimiento mensual"
    );

    if (existing) {
      return unwrap(
        this.client
          .from("monthly_tracking")
          .update(record)
          .eq("id", existing.id)
          .select("*")
          .single(),
        "No fue posible actualizar el seguimiento mensual"
      );
    }

    return unwrap(
      this.client
        .from("monthly_tracking")
        .insert({ ...record, created_by: user })
        .select("*")
        .single(),
      "No fue posible crear el seguimiento mensual"
    );
  }

  async validate(trackingId, userId) {
    const id = assertUuid(trackingId, "seguimiento");
    const user = assertUuid(userId, "usuario");

    return unwrap(
      this.client
        .from("monthly_tracking")
        .update({
          validation_status: "validado",
          validated_by: user,
          validated_at: new Date().toISOString(),
          updated_by: user
        })
        .eq("id", id)
        .select("*")
        .single(),
      "No fue posible validar el seguimiento mensual"
    );
  }
}

export class AuditRepository {
  constructor(client) {
    this.client = client;
  }

  async list(filters = {}) {
    let query = this.client
      .from("audit_log")
      .select("id, table_name, record_id, action, changed_by, changed_at, old_data, new_data")
      .order("changed_at", { ascending: false })
      .limit(500);
    if (filters.tableName) query = query.eq("table_name", assertText(filters.tableName, "tabla", { min: 2, max: 80 }));
    if (filters.recordId) query = query.eq("record_id", assertUuid(filters.recordId, "registro"));
    if (filters.action) query = query.eq("action", assertEnum(filters.action, ["INSERT", "UPDATE", "DELETE"], "acción"));
    if (filters.dateFrom) query = query.gte("changed_at", `${filters.dateFrom}T00:00:00.000Z`);
    if (filters.dateTo) query = query.lte("changed_at", `${filters.dateTo}T23:59:59.999Z`);
    const rows = await unwrap(query, "No fue posible consultar el historial");
    return rows.map(normalizeAuditEvent).filter((event) => !filters.projectId || event.projectId === filters.projectId);
  }
}

export class FinanceRepository {
  constructor(client) {
    this.client = client;
  }

  async listInvoices(projectId) {
    const id = assertUuid(projectId, "proyecto");
    return unwrap(
      this.client
        .from("invoices")
        .select("*, periods(year, month)")
        .eq("project_id", id)
        .order("issue_date", { ascending: false }),
      "No fue posible consultar las facturas"
    );
  }

  async createInvoice(input, userId) {
    const user = userId ? assertUuid(userId, "usuario") : null;
    const record = {
      project_id: assertUuid(input.projectId, "proyecto"),
      contract_id: assertUuid(input.contractId, "contrato"),
      period_id: assertUuid(input.periodId, "periodo"),
      invoice_number: assertText(input.invoiceNumber, "número de factura", {
        min: 2,
        max: 80
      }),
      issue_date: input.issueDate,
      amount: assertMoney(input.amount, "valor facturado", { allowZero: false }),
      status: input.status ?? "registrada",
      support_path: input.supportPath || null,
      created_by: user,
      updated_by: user
    };

    return unwrap(
      this.client.from("invoices").insert(record).select("*").single(),
      "No fue posible registrar la factura"
    );
  }

  async listPayments(invoiceId) {
    const id = assertUuid(invoiceId, "factura");
    return unwrap(
      this.client
        .from("payments")
        .select("*")
        .eq("invoice_id", id)
        .order("payment_date", { ascending: false }),
      "No fue posible consultar los pagos"
    );
  }

  async createPayment(input, userId) {
    const user = userId ? assertUuid(userId, "usuario") : null;
    const record = {
      invoice_id: assertUuid(input.invoiceId, "factura"),
      project_id: assertUuid(input.projectId, "proyecto"),
      contract_id: assertUuid(input.contractId, "contrato"),
      period_id: assertUuid(input.periodId, "periodo"),
      payment_reference: assertText(input.paymentReference, "referencia de pago", {
        min: 2,
        max: 80
      }),
      payment_date: input.paymentDate,
      amount: assertMoney(input.amount, "valor pagado", { allowZero: false }),
      status: input.status ?? "registrado",
      support_path: input.supportPath || null,
      created_by: user,
      updated_by: user
    };

    return unwrap(
      this.client.from("payments").insert(record).select("*").single(),
      "No fue posible registrar el pago"
    );
  }

  async listCostsExpenses(filters = {}) {
    let query = this.client
      .from("costs_expenses")
      .select("*, projects(id, cost_center, name), periods(id, year, month, status)")
      .order("movement_date", { ascending: false });

    if (filters.projectId) {
      query = query.eq("project_id", assertUuid(filters.projectId, "proyecto"));
    }
    if (filters.type) query = query.eq("movement_type", filters.type);
    if (filters.periodId) {
      query = query.eq("period_id", assertUuid(filters.periodId, "periodo"));
    }
    if (filters.category) {
      query = query.ilike("category", `%${String(filters.category).trim()}%`);
    }
    if (filters.dateFrom) query = query.gte("movement_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("movement_date", filters.dateTo);

    const rows = await unwrap(query, "No fue posible consultar los costos y gastos");
    return rows.map(normalizeCostExpense);
  }

  async createCostExpense(input, userId) {
    const record = costExpenseInputToRecord(input, userId);

    const row = await unwrap(
      this.client
        .from("costs_expenses")
        .insert(record)
        .select("*, projects(id, cost_center, name), periods(id, year, month, status)")
        .single(),
      "No fue posible registrar el costo o gasto"
    );
    return normalizeCostExpense(row);
  }
}
