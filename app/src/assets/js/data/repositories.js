import {
  assertDate,
  assertEnum,
  assertMoney,
  assertText,
  assertUuid,
  costExpenseInputToRecord,
  monthlyTrackingInputToRecord,
  normalizeAuditEvent,
  normalizeContract,
  normalizeCostExpense,
  normalizeInvoice,
  normalizeMonthlySummary,
  normalizePayment,
  normalizeProfile,
  normalizePeriod,
  normalizeProject,
  normalizeProjectSummary,
  projectInputToRecord,
  APP_ROLES,
  CONTRACT_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  VALIDATION_STATUSES
} from "./models.js?v=1.3.1";

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

export class ProfileRepository {
  constructor(client) { this.client = client; }

  async list() {
    const rows = await unwrap(
      this.client.from("profiles").select("*").order("full_name"),
      "No fue posible consultar los usuarios"
    );
    return rows.map(normalizeProfile);
  }

  async get(userId) {
    const id = assertUuid(userId, "usuario");
    const row = await unwrap(
      this.client.from("profiles").select("*").eq("id", id).maybeSingle(),
      "No fue posible consultar el perfil"
    );
    return row ? normalizeProfile(row) : null;
  }

  async update(profileId, input) {
    const id = assertUuid(profileId, "usuario");
    const record = {
      full_name: assertText(input.fullName, "nombre", { min: 3, max: 180 }),
      role: assertEnum(input.role, APP_ROLES, "rol"),
      active: Boolean(input.active)
    };
    const row = await unwrap(
      this.client.from("profiles").update(record).eq("id", id).select("*").single(),
      "No fue posible actualizar el usuario"
    );
    return normalizeProfile(row);
  }
}

export class ProjectRepository {
  constructor(client) {
    this.client = client;
  }

  async list(filters = {}) {
    let query = this.client
      .from("cost_center_financial_summary")
      .select("*")
      .order("name");

    if (filters.name) {
      const term = String(filters.name).trim().replace(/[,%()]/g, "");
      if (term) query = query.or(`name.ilike.%${term}%,client_name.ilike.%${term}%`);
    }
    if (filters.costCenter) query = query.ilike("cost_center", `%${String(filters.costCenter).trim()}%`);
    if (filters.municipality) query = query.ilike("municipality", `%${String(filters.municipality).trim()}%`);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.serviceType) query = query.ilike("service_type", `%${String(filters.serviceType).trim()}%`);
    if (filters.progressMin !== null && filters.progressMin !== undefined && filters.progressMin !== "") {
      query = query.gte("financial_progress_percentage", Number(filters.progressMin));
    }
    if (filters.progressMax !== null && filters.progressMax !== undefined && filters.progressMax !== "") {
      query = query.lte("financial_progress_percentage", Number(filters.progressMax));
    }

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
        .from("cost_center_financial_summary")
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
  constructor(client) { this.client = client; }

  async listByProject(projectId) {
    const id = assertUuid(projectId, "proyecto");
    const rows = await unwrap(
      this.client.from("contracts").select("*").eq("project_id", id).order("start_date", { ascending: false }),
      "No fue posible consultar los contratos"
    );
    return rows.map(normalizeContract);
  }

  buildRecord(input, userId, creating = false) {
    const startDate = assertDate(input.startDate, "fecha inicial");
    const endDate = input.endDate ? assertDate(input.endDate, "fecha final") : null;
    if (endDate && endDate < startDate) throw new DataAccessError("La fecha final no puede ser anterior a la fecha inicial.");
    const record = {
      contract_number: assertText(input.contractNumber, "número de contrato", { min: 2, max: 80 }),
      initial_value: assertMoney(input.initialValue, "valor inicial", { allowZero: false }),
      additions_value: assertMoney(input.additionsValue ?? 0, "adiciones"),
      deductions_value: assertMoney(input.deductionsValue ?? 0, "deducciones"),
      start_date: startDate,
      end_date: endDate,
      status: assertEnum(input.status ?? "borrador", CONTRACT_STATUSES, "estado"),
      updated_by: userId ? assertUuid(userId, "usuario") : null
    };
    if (creating) {
      record.project_id = assertUuid(input.projectId, "proyecto");
      record.created_by = record.updated_by;
    }
    return record;
  }

  async create(input, userId) {
    const row = await unwrap(
      this.client.from("contracts").insert(this.buildRecord(input, userId, true)).select("*").single(),
      "No fue posible crear el contrato"
    );
    return normalizeContract(row);
  }

  async update(contractId, input, userId) {
    const id = assertUuid(contractId, "contrato");
    const row = await unwrap(
      this.client.from("contracts").update(this.buildRecord(input, userId)).eq("id", id).select("*").single(),
      "No fue posible actualizar el contrato"
    );
    return normalizeContract(row);
  }

  async updateValues(contractId, values, userId) {
    return this.update(contractId, values, userId);
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
          .update({ ...record, validated_by: null, validated_at: null })
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
  constructor(client) { this.client = client; }

  async listInvoices(filters = {}) {
    let query = this.client
      .from("invoices")
      .select("*, projects(id, cost_center, name), periods(id, year, month, status), contracts(contract_number)")
      .order("issue_date", { ascending: false });
    if (filters.projectId) query = query.eq("project_id", assertUuid(filters.projectId, "proyecto"));
    if (filters.periodId) query = query.eq("period_id", assertUuid(filters.periodId, "periodo"));
    if (filters.status) query = query.eq("status", assertEnum(filters.status, INVOICE_STATUSES, "estado de factura"));
    if (filters.dateFrom) query = query.gte("issue_date", assertDate(filters.dateFrom, "fecha inicial"));
    if (filters.dateTo) query = query.lte("issue_date", assertDate(filters.dateTo, "fecha final"));
    const rows = await unwrap(query, "No fue posible consultar las facturas");
    return rows.map(normalizeInvoice);
  }

  async createInvoice(input, userId) {
    const user = userId ? assertUuid(userId, "usuario") : null;
    const record = {
      project_id: assertUuid(input.projectId, "proyecto"),
      contract_id: assertUuid(input.contractId, "contrato"),
      period_id: assertUuid(input.periodId, "periodo"),
      invoice_number: assertText(input.invoiceNumber, "número de factura", { min: 2, max: 80 }),
      issue_date: assertDate(input.issueDate, "fecha de emisión"),
      amount: assertMoney(input.amount, "valor facturado", { allowZero: false }),
      status: assertEnum(input.status ?? "registrada", INVOICE_STATUSES, "estado de factura"),
      support_path: input.supportPath?.trim() || null,
      created_by: user,
      updated_by: user
    };
    const row = await unwrap(
      this.client.from("invoices").insert(record)
        .select("*, projects(id, cost_center, name), periods(id, year, month, status), contracts(contract_number)").single(),
      "No fue posible registrar la factura"
    );
    return normalizeInvoice(row);
  }

  async listPayments(filters = {}) {
    let query = this.client
      .from("payments")
      .select("*, projects(id, cost_center, name), periods(id, year, month, status), invoices(invoice_number)")
      .order("payment_date", { ascending: false });
    if (filters.invoiceId) query = query.eq("invoice_id", assertUuid(filters.invoiceId, "factura"));
    if (filters.projectId) query = query.eq("project_id", assertUuid(filters.projectId, "proyecto"));
    if (filters.periodId) query = query.eq("period_id", assertUuid(filters.periodId, "periodo"));
    if (filters.status) query = query.eq("status", assertEnum(filters.status, PAYMENT_STATUSES, "estado de pago"));
    if (filters.dateFrom) query = query.gte("payment_date", assertDate(filters.dateFrom, "fecha inicial"));
    if (filters.dateTo) query = query.lte("payment_date", assertDate(filters.dateTo, "fecha final"));
    const rows = await unwrap(query, "No fue posible consultar los pagos");
    return rows.map(normalizePayment);
  }

  async createPayment(input, userId) {
    const user = userId ? assertUuid(userId, "usuario") : null;
    const record = {
      invoice_id: assertUuid(input.invoiceId, "factura"),
      project_id: assertUuid(input.projectId, "proyecto"),
      contract_id: assertUuid(input.contractId, "contrato"),
      period_id: assertUuid(input.periodId, "periodo"),
      payment_reference: assertText(input.paymentReference, "referencia de pago", { min: 2, max: 80 }),
      payment_date: assertDate(input.paymentDate, "fecha de pago"),
      amount: assertMoney(input.amount, "valor pagado", { allowZero: false }),
      status: assertEnum(input.status ?? "registrado", PAYMENT_STATUSES, "estado de pago"),
      support_path: input.supportPath?.trim() || null,
      created_by: user,
      updated_by: user
    };
    const row = await unwrap(
      this.client.from("payments").insert(record)
        .select("*, projects(id, cost_center, name), periods(id, year, month, status), invoices(invoice_number)").single(),
      "No fue posible registrar el pago"
    );
    return normalizePayment(row);
  }

  async listCostsExpenses(filters = {}) {
    let query = this.client
      .from("costs_expenses")
      .select("*, projects(id, cost_center, name), periods(id, year, month, status)")
      .order("movement_date", { ascending: false });
    if (filters.projectId) query = query.eq("project_id", assertUuid(filters.projectId, "proyecto"));
    if (filters.type) query = query.eq("movement_type", filters.type);
    if (filters.periodId) query = query.eq("period_id", assertUuid(filters.periodId, "periodo"));
    if (filters.category) query = query.ilike("category", `%${String(filters.category).trim()}%`);
    if (filters.dateFrom) query = query.gte("movement_date", filters.dateFrom);
    if (filters.dateTo) query = query.lte("movement_date", filters.dateTo);
    const rows = await unwrap(query, "No fue posible consultar los costos y gastos");
    return rows.map(normalizeCostExpense);
  }

  async createCostExpense(input, userId) {
    const record = costExpenseInputToRecord(input, userId);
    const row = await unwrap(
      this.client.from("costs_expenses").insert(record)
        .select("*, projects(id, cost_center, name), periods(id, year, month, status)").single(),
      "No fue posible registrar el costo o gasto"
    );
    return normalizeCostExpense(row);
  }
}

export class SupportRepository {
  constructor(client) {
    this.client = client;
    this.bucket = "project-supports";
  }

  async upload({ projectId, category, file }) {
    const id = assertUuid(projectId, "proyecto");
    if (!(file instanceof Blob) || !file.size) throw new DataAccessError("Selecciona un archivo válido.");
    if (file.size > 10 * 1024 * 1024) throw new DataAccessError("El soporte no puede superar 10 MB.");
    const allowed = new Set([
      "application/pdf", "image/png", "image/jpeg", "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ]);
    if (!allowed.has(file.type)) throw new DataAccessError("Formato no permitido. Usa PDF, PNG, JPG, XLS o XLSX.");
    const safeCategory = assertText(category, "categoría de soporte", { min: 2, max: 40 })
      .toLocaleLowerCase("es").replace(/[^a-z0-9-]+/g, "-");
    const extension = String(file.name ?? "soporte").split(".").pop()
      .toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "") || "bin";
    const unique = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `${id}/${safeCategory}/${unique}.${extension}`;
    const { data, error } = await this.client.storage.from(this.bucket)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new DataAccessError(`No fue posible cargar el soporte: ${error.message}`, error);
    return data.path;
  }

  async createSignedUrl(path, expiresIn = 60) {
    const normalized = assertText(path, "ruta del soporte", { min: 3, max: 500 });
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(normalized, expiresIn);
    if (error) throw new DataAccessError(`No fue posible abrir el soporte: ${error.message}`, error);
    return data.signedUrl;
  }
}
