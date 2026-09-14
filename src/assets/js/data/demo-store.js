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
  periodInputToRecord,
  projectInputToRecord,
  APP_ROLES,
  CONTRACT_STATUSES,
  INVOICE_STATUSES,
  PAYMENT_STATUSES
} from "./models.js?v=1.1.0";

const STORAGE_KEY = "soinsolar-control-demo-v4";

const initialState = Object.freeze({
  profiles: [
    {
      id: "80000000-0000-4000-8000-000000000001",
      full_name: "Administrador demostrativo",
      role: "administrador",
      active: true,
      created_at: "2026-08-01T12:00:00Z",
      updated_at: "2026-08-01T12:00:00Z"
    },
    {
      id: "80000000-0000-4000-8000-000000000002",
      full_name: "Gerencia demostrativa",
      role: "gerencia",
      active: true,
      created_at: "2026-08-01T12:00:00Z",
      updated_at: "2026-08-01T12:00:00Z"
    }
  ],
  projects: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      cost_center: "CC-101",
      name: "Parque Solar La Esperanza",
      client_name: "Cliente demostrativo A",
      municipality: "Valledupar",
      service_type: "Construcción EPC",
      power_kwp: 420,
      status: "activo",
      start_date: "2026-03-01",
      end_date: "2027-02-28",
      notes: "Proyecto utilizado únicamente como demostración.",
      contract_id: "20000000-0000-4000-8000-000000000001",
      contract_number: "CTR-DEMO-001",
      contract_value: 2850000000,
      total_invoiced: 2137500000,
      total_paid: 1840000000
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      cost_center: "CC-118",
      name: "Cubierta Industrial Norte",
      client_name: "Cliente demostrativo B",
      municipality: "Ibagué",
      service_type: "Instalación fotovoltaica",
      power_kwp: 185.5,
      status: "activo",
      start_date: "2026-04-15",
      end_date: "2026-12-15",
      notes: null,
      contract_id: "20000000-0000-4000-8000-000000000002",
      contract_number: "CTR-DEMO-002",
      contract_value: 2000000000,
      total_invoiced: 1840000000,
      total_paid: 1640000000
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      cost_center: "CC-124",
      name: "Sistema Solar Empresarial",
      client_name: "Cliente demostrativo C",
      municipality: "Bogotá",
      service_type: "Suministro e instalación",
      power_kwp: 310,
      status: "activo",
      start_date: "2026-06-01",
      end_date: "2027-05-31",
      notes: null,
      contract_id: "20000000-0000-4000-8000-000000000003",
      contract_number: "CTR-DEMO-003",
      contract_value: 3570000000,
      total_invoiced: 1660000000,
      total_paid: 1440000000
    }
  ],
  periods: [
    { id: "30000000-0000-4000-8000-000000000001", year: 2026, month: 8, status: "cerrado", closed_at: "2026-09-03T14:00:00Z", closed_by: "80000000-0000-4000-8000-000000000001", created_at: "2026-08-01T12:00:00Z" },
    { id: "30000000-0000-4000-8000-000000000002", year: 2026, month: 9, status: "abierto", closed_at: null, closed_by: null, created_at: "2026-09-01T12:00:00Z" }
  ],
  monthlyTracking: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000001",
      recognized_value: 1800000000, invoiced_value: 1800000000, paid_value: 1600000000,
      costs_expenses_value: 1200000000, observations: "Cierre demostrativo de agosto.",
      validation_status: "validado", validated_at: "2026-09-03T13:30:00Z",
      created_at: "2026-08-31T18:00:00Z", updated_at: "2026-09-03T13:30:00Z"
    },
    {
      id: "50000000-0000-4000-8000-000000000002",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000002",
      recognized_value: 337500000, invoiced_value: 337500000, paid_value: 240000000,
      costs_expenses_value: 363000000, observations: "Seguimiento de septiembre listo para validación.",
      validation_status: "pendiente", validated_at: null,
      created_at: "2026-09-12T16:00:00Z", updated_at: "2026-09-12T16:00:00Z"
    },
    {
      id: "50000000-0000-4000-8000-000000000003",
      project_id: "10000000-0000-4000-8000-000000000002",
      contract_id: "20000000-0000-4000-8000-000000000002",
      period_id: "30000000-0000-4000-8000-000000000002",
      recognized_value: 840000000, invoiced_value: 840000000, paid_value: 740000000,
      costs_expenses_value: 1100000000, observations: "Seguimiento en revisión.",
      validation_status: "pendiente", validated_at: null,
      created_at: "2026-09-12T17:00:00Z", updated_at: "2026-09-12T17:00:00Z"
    },
    {
      id: "50000000-0000-4000-8000-000000000004",
      project_id: "10000000-0000-4000-8000-000000000003",
      contract_id: "20000000-0000-4000-8000-000000000003",
      period_id: "30000000-0000-4000-8000-000000000002",
      recognized_value: 1660000000, invoiced_value: 1660000000, paid_value: 1440000000,
      costs_expenses_value: 1183000000, observations: "Datos mensuales registrados.",
      validation_status: "borrador", validated_at: null,
      created_at: "2026-09-13T14:00:00Z", updated_at: "2026-09-13T14:00:00Z"
    }
  ],
  invoices: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000001",
      invoice_number: "FAC-DEMO-001",
      issue_date: "2026-08-28",
      amount: 1800000000,
      status: "emitida",
      support_path: "Soportes/FAC-DEMO-001.pdf",
      created_at: "2026-08-28T14:00:00Z"
    },
    {
      id: "60000000-0000-4000-8000-000000000002",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000002",
      invoice_number: "FAC-DEMO-002",
      issue_date: "2026-09-12",
      amount: 337500000,
      status: "emitida",
      support_path: "Soportes/FAC-DEMO-002.pdf",
      created_at: "2026-09-12T14:00:00Z"
    },
    {
      id: "60000000-0000-4000-8000-000000000003",
      project_id: "10000000-0000-4000-8000-000000000002",
      contract_id: "20000000-0000-4000-8000-000000000002",
      period_id: "30000000-0000-4000-8000-000000000002",
      invoice_number: "FAC-DEMO-003",
      issue_date: "2026-09-15",
      amount: 1840000000,
      status: "emitida",
      support_path: "Soportes/FAC-DEMO-003.pdf",
      created_at: "2026-09-15T14:00:00Z"
    },
    {
      id: "60000000-0000-4000-8000-000000000004",
      project_id: "10000000-0000-4000-8000-000000000003",
      contract_id: "20000000-0000-4000-8000-000000000003",
      period_id: "30000000-0000-4000-8000-000000000002",
      invoice_number: "FAC-DEMO-004",
      issue_date: "2026-09-18",
      amount: 1660000000,
      status: "emitida",
      support_path: "Soportes/FAC-DEMO-004.pdf",
      created_at: "2026-09-18T14:00:00Z"
    }
  ],
  payments: [
    {
      id: "65000000-0000-4000-8000-000000000001",
      invoice_id: "60000000-0000-4000-8000-000000000001",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000001",
      payment_reference: "PAG-DEMO-001",
      payment_date: "2026-08-30",
      amount: 1600000000,
      status: "confirmado",
      support_path: "Soportes/PAG-DEMO-001.pdf",
      created_at: "2026-08-30T14:00:00Z"
    },
    {
      id: "65000000-0000-4000-8000-000000000002",
      invoice_id: "60000000-0000-4000-8000-000000000002",
      project_id: "10000000-0000-4000-8000-000000000001",
      contract_id: "20000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000002",
      payment_reference: "PAG-DEMO-002",
      payment_date: "2026-09-20",
      amount: 240000000,
      status: "confirmado",
      support_path: "Soportes/PAG-DEMO-002.pdf",
      created_at: "2026-09-20T14:00:00Z"
    },
    {
      id: "65000000-0000-4000-8000-000000000003",
      invoice_id: "60000000-0000-4000-8000-000000000003",
      project_id: "10000000-0000-4000-8000-000000000002",
      contract_id: "20000000-0000-4000-8000-000000000002",
      period_id: "30000000-0000-4000-8000-000000000002",
      payment_reference: "PAG-DEMO-003",
      payment_date: "2026-09-22",
      amount: 1640000000,
      status: "confirmado",
      support_path: "Soportes/PAG-DEMO-003.pdf",
      created_at: "2026-09-22T14:00:00Z"
    },
    {
      id: "65000000-0000-4000-8000-000000000004",
      invoice_id: "60000000-0000-4000-8000-000000000004",
      project_id: "10000000-0000-4000-8000-000000000003",
      contract_id: "20000000-0000-4000-8000-000000000003",
      period_id: "30000000-0000-4000-8000-000000000002",
      payment_reference: "PAG-DEMO-004",
      payment_date: "2026-09-25",
      amount: 1440000000,
      status: "confirmado",
      support_path: "Soportes/PAG-DEMO-004.pdf",
      created_at: "2026-09-25T14:00:00Z"
    }
  ],
  costsExpenses: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      project_id: "10000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000001",
      movement_type: "costo",
      category: "Materiales",
      description: "Suministro demostrativo de componentes.",
      supplier_name: "Proveedor de prueba A",
      document_reference: "DOC-DEMO-001",
      movement_date: "2026-08-12",
      amount: 1200000000,
      support_path: null,
      created_at: "2026-08-12T14:00:00Z"
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      project_id: "10000000-0000-4000-8000-000000000001",
      period_id: "30000000-0000-4000-8000-000000000002",
      movement_type: "gasto",
      category: "Transporte",
      description: "Traslado demostrativo de equipos.",
      supplier_name: "Proveedor de prueba B",
      document_reference: "DOC-DEMO-002",
      movement_date: "2026-09-09",
      amount: 363000000,
      support_path: null,
      created_at: "2026-09-09T14:00:00Z"
    },
    {
      id: "70000000-0000-4000-8000-000000000003",
      project_id: "10000000-0000-4000-8000-000000000002",
      period_id: "30000000-0000-4000-8000-000000000002",
      movement_type: "costo",
      category: "Mano de obra",
      description: "Servicio demostrativo de instalación.",
      supplier_name: "Proveedor de prueba C",
      document_reference: "DOC-DEMO-003",
      movement_date: "2026-09-15",
      amount: 1100000000,
      support_path: null,
      created_at: "2026-09-15T14:00:00Z"
    },
    {
      id: "70000000-0000-4000-8000-000000000004",
      project_id: "10000000-0000-4000-8000-000000000003",
      period_id: "30000000-0000-4000-8000-000000000002",
      movement_type: "costo",
      category: "Equipos",
      description: "Equipos demostrativos del proyecto.",
      supplier_name: "Proveedor de prueba D",
      document_reference: "DOC-DEMO-004",
      movement_date: "2026-09-18",
      amount: 1183000000,
      support_path: null,
      created_at: "2026-09-18T14:00:00Z"
    }
  ],
  auditLog: [
    {
      id: "1", table_name: "periods",
      record_id: "30000000-0000-4000-8000-000000000001", action: "UPDATE",
      changed_by: "80000000-0000-4000-8000-000000000001", changed_at: "2026-09-03T14:00:00Z",
      old_data: { id: "30000000-0000-4000-8000-000000000001", year: 2026, month: 8, status: "abierto" },
      new_data: { id: "30000000-0000-4000-8000-000000000001", year: 2026, month: 8, status: "cerrado" }
    },
    {
      id: "2", table_name: "monthly_tracking",
      record_id: "50000000-0000-4000-8000-000000000001", action: "UPDATE",
      changed_by: "80000000-0000-4000-8000-000000000001", changed_at: "2026-09-03T13:30:00Z",
      old_data: { id: "50000000-0000-4000-8000-000000000001", project_id: "10000000-0000-4000-8000-000000000001", validation_status: "pendiente" },
      new_data: { id: "50000000-0000-4000-8000-000000000001", project_id: "10000000-0000-4000-8000-000000000001", validation_status: "validado" }
    },
    {
      id: "3", table_name: "costs_expenses",
      record_id: "70000000-0000-4000-8000-000000000004", action: "INSERT",
      changed_by: "80000000-0000-4000-8000-000000000001", changed_at: "2026-09-18T14:00:00Z",
      old_data: null,
      new_data: { id: "70000000-0000-4000-8000-000000000004", project_id: "10000000-0000-4000-8000-000000000003", movement_type: "costo", amount: 1183000000 }
    }
  ]
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readState(storage) {
  if (!storage) return clone(initialState);
  try {
    const stored = JSON.parse(storage.getItem(STORAGE_KEY));
    if (stored?.profiles && stored?.projects && stored?.periods && stored?.invoices && stored?.payments && stored?.costsExpenses && stored?.monthlyTracking && stored?.auditLog) return stored;
  } catch {
    // Si el almacenamiento fue alterado, se recupera la demostración inicial.
  }
  return clone(initialState);
}

function decorateInvoice(record, state) {
  const project = state.projects.find((item) => item.id === record.project_id);
  const period = state.periods.find((item) => item.id === record.period_id);
  return {
    ...record,
    projects: project ? { id: project.id, cost_center: project.cost_center, name: project.name } : null,
    contracts: project ? { contract_number: project.contract_number } : null,
    periods: period ? { id: period.id, year: period.year, month: period.month, status: period.status } : null
  };
}

function decoratePayment(record, state) {
  const project = state.projects.find((item) => item.id === record.project_id);
  const period = state.periods.find((item) => item.id === record.period_id);
  const invoice = state.invoices.find((item) => item.id === record.invoice_id);
  return {
    ...record,
    projects: project ? { id: project.id, cost_center: project.cost_center, name: project.name } : null,
    invoices: invoice ? { invoice_number: invoice.invoice_number } : null,
    periods: period ? { id: period.id, year: period.year, month: period.month, status: period.status } : null
  };
}

function decorateCost(record, state) {
  const project = state.projects.find((item) => item.id === record.project_id);
  const period = state.periods.find((item) => item.id === record.period_id);
  return {
    ...record,
    projects: project
      ? { id: project.id, cost_center: project.cost_center, name: project.name }
      : null,
    periods: period
      ? { id: period.id, year: period.year, month: period.month, status: period.status }
      : null
  };
}

function decorateMonthly(record, state) {
  const project = state.projects.find((item) => item.id === record.project_id);
  const period = state.periods.find((item) => item.id === record.period_id);
  const orderedPeriods = state.periods.filter((candidate) => period && (
    candidate.year < period.year || (candidate.year === period.year && candidate.month <= period.month)
  )).map((candidate) => candidate.id);
  const invoicedValue = state.invoices
    .filter((item) => item.project_id === record.project_id && item.period_id === record.period_id && item.status !== "anulada")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const paidValue = state.payments
    .filter((item) => item.project_id === record.project_id && item.period_id === record.period_id && item.status !== "anulado")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const cumulativeInvoiced = state.invoices
    .filter((item) => item.project_id === record.project_id && orderedPeriods.includes(item.period_id) && item.status !== "anulada")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    ...record,
    tracking_id: record.id,
    cost_center: project?.cost_center ?? "",
    project_name: project?.name ?? "",
    year: period?.year,
    month: period?.month,
    period_status: period?.status,
    contract_value: Number(project?.contract_value ?? 0),
    invoiced_value: invoicedValue,
    paid_value: paidValue,
    costs_expenses_value: state.costsExpenses
      .filter((item) => item.project_id === record.project_id && item.period_id === record.period_id)
      .reduce((sum, item) => sum + Number(item.amount), 0),
    cumulative_invoiced_value: cumulativeInvoiced
  };
}

function projectSummary(record, state) {
  const totalInvoiced = state.invoices
    .filter((item) => item.project_id === record.id && item.status !== "anulada")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalPaid = state.payments
    .filter((item) => item.project_id === record.id && item.status !== "anulado")
    .reduce((sum, item) => sum + Number(item.amount), 0);
  const totalCostsExpenses = state.costsExpenses
    .filter((item) => item.project_id === record.id)
    .reduce((sum, item) => sum + Number(item.amount), 0);
  return normalizeProjectSummary({
    ...record,
    total_invoiced: totalInvoiced,
    total_paid: totalPaid,
    total_costs_expenses: totalCostsExpenses
  });
}

function contractFromProject(project) {
  if (!project?.contract_id) return null;
  return {
    id: project.contract_id,
    project_id: project.id,
    contract_number: project.contract_number,
    initial_value: Number(project.contract_initial_value ?? project.contract_value ?? 0),
    additions_value: Number(project.contract_additions_value ?? 0),
    deductions_value: Number(project.contract_deductions_value ?? 0),
    current_value: Number(project.contract_value ?? 0),
    start_date: project.contract_start_date ?? project.start_date ?? "2026-01-01",
    end_date: project.contract_end_date ?? project.end_date ?? null,
    status: project.contract_status ?? "vigente"
  };
}

export function createDemoStore({ storage = defaultStorage() } = {}) {
  let state = readState(storage);

  function persist() {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function recordAudit(tableName, recordId, action, oldData, newData) {
    const nextId = state.auditLog.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    state.auditLog.push({
      id: String(nextId), table_name: tableName, record_id: recordId, action,
      changed_by: "80000000-0000-4000-8000-000000000001",
      changed_at: new Date().toISOString(),
      old_data: oldData ? clone(oldData) : null,
      new_data: newData ? clone(newData) : null
    });
  }

  return Object.freeze({
    mode: "demo",

    async getCurrentProfile() {
      return normalizeProfile(state.profiles[0]);
    },

    async listProfiles() {
      return state.profiles.map(normalizeProfile).sort((left, right) => left.fullName.localeCompare(right.fullName, "es"));
    },

    async updateProfile(profileId, input) {
      const id = assertUuid(profileId, "usuario");
      const profile = state.profiles.find((item) => item.id === id);
      if (!profile) throw new Error("El usuario solicitado no existe.");
      const previous = clone(profile);
      profile.full_name = assertText(input.fullName, "nombre", { min: 3, max: 180 });
      profile.role = assertEnum(input.role, APP_ROLES, "rol");
      profile.active = Boolean(input.active);
      profile.updated_at = new Date().toISOString();
      recordAudit("profiles", id, "UPDATE", previous, profile);
      persist();
      return normalizeProfile(profile);
    },

    async listProjects(filters = {}) {
      const name = String(filters.name ?? "").trim().toLocaleLowerCase("es");
      const costCenter = String(filters.costCenter ?? "").trim().toLocaleLowerCase("es");
      const municipality = String(filters.municipality ?? "").trim().toLocaleLowerCase("es");
      const serviceType = String(filters.serviceType ?? "").trim().toLocaleLowerCase("es");
      const progressMin = filters.progressMin === null || filters.progressMin === undefined || filters.progressMin === "" ? null : Number(filters.progressMin);
      const progressMax = filters.progressMax === null || filters.progressMax === undefined || filters.progressMax === "" ? null : Number(filters.progressMax);

      return state.projects
        .filter((project) => {
          const summary = projectSummary(project, state);
          const matchesName = !name || [project.name, project.client_name]
            .some((value) => String(value ?? "").toLocaleLowerCase("es").includes(name));
          const matchesCenter = !costCenter || project.cost_center.toLocaleLowerCase("es").includes(costCenter);
          const matchesMunicipality = !municipality || project.municipality.toLocaleLowerCase("es").includes(municipality);
          const matchesStatus = !filters.status || project.status === filters.status;
          const matchesService = !serviceType || project.service_type.toLocaleLowerCase("es").includes(serviceType);
          const matchesMinimum = progressMin === null || summary.financialProgressPercentage >= progressMin;
          const matchesMaximum = progressMax === null || summary.financialProgressPercentage <= progressMax;
          return matchesName && matchesCenter && matchesMunicipality && matchesStatus && matchesService && matchesMinimum && matchesMaximum;
        })
        .sort((left, right) => left.name.localeCompare(right.name, "es"))
        .map((project) => projectSummary(project, state));
    },

    async getProject(projectId) {
      const id = assertUuid(projectId, "proyecto");
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error("El proyecto solicitado no existe.");
      return normalizeProject(project);
    },

    async getProjectSummary(projectId) {
      const id = assertUuid(projectId, "proyecto");
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error("El resumen solicitado no existe.");
      return projectSummary(project, state);
    },

    async createProject(input) {
      const record = projectInputToRecord(input, null);
      const duplicate = state.projects.some(
        (item) => item.cost_center.toLocaleLowerCase("es") === record.cost_center.toLocaleLowerCase("es")
      );
      if (duplicate) throw new Error("Ya existe un proyecto con ese centro de costo.");

      const created = {
        id: createUuid(),
        ...record,
        contract_id: null,
        contract_number: null,
        contract_value: 0,
        total_invoiced: 0,
        total_paid: 0,
        created_at: new Date().toISOString()
      };
      state.projects.push(created);
      recordAudit("projects", created.id, "INSERT", null, created);
      persist();
      return normalizeProject(created);
    },

    async updateProject(projectId, input) {
      const id = assertUuid(projectId, "proyecto");
      const index = state.projects.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("El proyecto que intentas modificar no existe.");
      const record = projectInputToRecord(input, null);
      const duplicate = state.projects.some(
        (item) => item.id !== id && item.cost_center.toLocaleLowerCase("es") === record.cost_center.toLocaleLowerCase("es")
      );
      if (duplicate) throw new Error("Ya existe otro proyecto con ese centro de costo.");

      const previous = clone(state.projects[index]);
      state.projects[index] = { ...state.projects[index], ...record, updated_at: new Date().toISOString() };
      recordAudit("projects", id, "UPDATE", previous, state.projects[index]);
      persist();
      return normalizeProject(state.projects[index]);
    },

    async removeProject(projectId) {
      const id = assertUuid(projectId, "proyecto");
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error("El proyecto que intentas eliminar no existe.");
      const hasMovements = state.costsExpenses.some((item) => item.project_id === id)
        || state.monthlyTracking.some((item) => item.project_id === id)
        || state.invoices.some((item) => item.project_id === id)
        || state.payments.some((item) => item.project_id === id);
      if (hasMovements) {
        throw new Error("No se puede eliminar un proyecto con movimientos. Cambia su estado para conservar el histórico.");
      }
      state.projects = state.projects.filter((item) => item.id !== id);
      recordAudit("projects", id, "DELETE", project, null);
      persist();
    },

    async listContracts(projectId) {
      const id = assertUuid(projectId, "proyecto");
      const project = state.projects.find((item) => item.id === id);
      if (!project) throw new Error("El proyecto solicitado no existe.");
      const contract = contractFromProject(project);
      return contract ? [normalizeContract(contract)] : [];
    },

    async createContract(input) {
      const projectId = assertUuid(input.projectId, "proyecto");
      const project = state.projects.find((item) => item.id === projectId);
      if (!project) throw new Error("El proyecto solicitado no existe.");
      if (project.contract_id) throw new Error("El proyecto ya tiene un contrato registrado.");
      const initialValue = assertMoney(input.initialValue, "valor inicial", { allowZero: false });
      const additionsValue = assertMoney(input.additionsValue ?? 0, "adiciones");
      const deductionsValue = assertMoney(input.deductionsValue ?? 0, "deducciones");
      const currentValue = initialValue + additionsValue - deductionsValue;
      if (currentValue <= 0) throw new Error("El valor contractual vigente debe ser positivo.");
      const startDate = assertDate(input.startDate, "fecha inicial");
      const endDate = input.endDate ? assertDate(input.endDate, "fecha final") : null;
      if (endDate && endDate < startDate) throw new Error("La fecha final no puede ser anterior a la fecha inicial.");
      const contract = {
        id: createUuid(), project_id: projectId,
        contract_number: assertText(input.contractNumber, "número de contrato", { min: 2, max: 80 }),
        initial_value: initialValue, additions_value: additionsValue, deductions_value: deductionsValue,
        current_value: currentValue, start_date: startDate, end_date: endDate,
        status: assertEnum(input.status ?? "borrador", CONTRACT_STATUSES, "estado")
      };
      Object.assign(project, {
        contract_id: contract.id, contract_number: contract.contract_number,
        contract_value: currentValue, contract_initial_value: initialValue,
        contract_additions_value: additionsValue, contract_deductions_value: deductionsValue,
        contract_start_date: startDate, contract_end_date: endDate, contract_status: contract.status
      });
      recordAudit("contracts", contract.id, "INSERT", null, contract);
      persist();
      return normalizeContract(contract);
    },

    async updateContract(contractId, input) {
      const id = assertUuid(contractId, "contrato");
      const project = state.projects.find((item) => item.contract_id === id);
      if (!project) throw new Error("El contrato solicitado no existe.");
      const previous = contractFromProject(project);
      const initialValue = assertMoney(input.initialValue, "valor inicial", { allowZero: false });
      const additionsValue = assertMoney(input.additionsValue ?? 0, "adiciones");
      const deductionsValue = assertMoney(input.deductionsValue ?? 0, "deducciones");
      const currentValue = initialValue + additionsValue - deductionsValue;
      const invoiced = state.invoices.filter((item) => item.contract_id === id && item.status !== "anulada").reduce((sum, item) => sum + Number(item.amount), 0);
      const recognized = state.monthlyTracking.filter((item) => item.contract_id === id).reduce((sum, item) => sum + Number(item.recognized_value), 0);
      if (currentValue < invoiced || currentValue < recognized) throw new Error("El valor contractual no puede ser menor que la facturación o el avance reconocido.");
      const startDate = assertDate(input.startDate, "fecha inicial");
      const endDate = input.endDate ? assertDate(input.endDate, "fecha final") : null;
      if (endDate && endDate < startDate) throw new Error("La fecha final no puede ser anterior a la fecha inicial.");
      Object.assign(project, {
        contract_number: assertText(input.contractNumber, "número de contrato", { min: 2, max: 80 }),
        contract_value: currentValue, contract_initial_value: initialValue,
        contract_additions_value: additionsValue, contract_deductions_value: deductionsValue,
        contract_start_date: startDate, contract_end_date: endDate,
        contract_status: assertEnum(input.status ?? "borrador", CONTRACT_STATUSES, "estado")
      });
      const updated = contractFromProject(project);
      recordAudit("contracts", id, "UPDATE", previous, updated);
      persist();
      return normalizeContract(updated);
    },

    async listPeriods() {
      return clone(state.periods)
        .sort((left, right) => right.year - left.year || right.month - left.month)
        .map(normalizePeriod);
    },

    async createPeriod(input) {
      const record = periodInputToRecord(input);
      if (state.periods.some((item) => item.year === record.year && item.month === record.month)) throw new Error("El periodo seleccionado ya existe.");
      if (state.periods.some((item) => item.status === "abierto")) throw new Error("Cierra el periodo activo antes de abrir uno nuevo.");
      const created = { id: createUuid(), ...record, closed_at: null, closed_by: null, created_at: new Date().toISOString() };
      state.periods.push(created); recordAudit("periods", created.id, "INSERT", null, created); persist();
      return normalizePeriod(created);
    },

    async closePeriod(periodId) {
      const id = assertUuid(periodId, "periodo");
      const period = state.periods.find((item) => item.id === id);
      if (!period) throw new Error("El periodo solicitado no existe.");
      if (period.status === "cerrado") throw new Error("El periodo ya está cerrado.");
      const projectsWithActivity = new Set([
        ...state.monthlyTracking.filter((item) => item.period_id === id).map((item) => item.project_id),
        ...state.costsExpenses.filter((item) => item.period_id === id).map((item) => item.project_id),
        ...state.invoices.filter((item) => item.period_id === id).map((item) => item.project_id),
        ...state.payments.filter((item) => item.period_id === id).map((item) => item.project_id)
      ]);
      const incomplete = [...projectsWithActivity].filter((projectId) => !state.monthlyTracking.some(
        (item) => item.period_id === id && item.project_id === projectId && item.validation_status === "validado"
      ));
      if (incomplete.length) throw new Error(`No se puede cerrar: ${incomplete.length} proyecto(s) con actividad no tienen seguimiento validado.`);
      const previous = clone(period);
      period.status = "cerrado"; period.closed_at = new Date().toISOString();
      period.closed_by = "80000000-0000-4000-8000-000000000001";
      recordAudit("periods", id, "UPDATE", previous, period); persist();
      return normalizePeriod(period);
    },

    async reopenPeriod(periodId) {
      const id = assertUuid(periodId, "periodo");
      const period = state.periods.find((item) => item.id === id);
      if (!period) throw new Error("El periodo solicitado no existe.");
      if (period.status === "abierto") throw new Error("El periodo ya está abierto.");
      if (state.periods.some((item) => item.id !== id && item.status === "abierto")) throw new Error("Cierra el periodo activo antes de reabrir otro.");
      const previous = clone(period);
      period.status = "abierto"; period.closed_at = null; period.closed_by = null;
      recordAudit("periods", id, "UPDATE", previous, period); persist();
      return normalizePeriod(period);
    },

    async listMonthlyTracking(filters = {}) {
      return state.monthlyTracking
        .map((item) => normalizeMonthlySummary(decorateMonthly(item, state)))
        .filter((item) => !filters.projectId || item.projectId === filters.projectId)
        .filter((item) => !filters.periodId || item.periodId === filters.periodId)
        .filter((item) => !filters.validationStatus || item.validationStatus === filters.validationStatus)
        .sort((left, right) => right.year - left.year || right.month - left.month || left.projectName.localeCompare(right.projectName, "es"));
    },

    async saveMonthlyTracking(input) {
      const record = monthlyTrackingInputToRecord(input, null);
      if (record.validation_status === "validado") throw new Error("Guarda el registro como borrador o pendiente y utiliza la acción Validar.");
      const project = state.projects.find((item) => item.id === record.project_id);
      const period = state.periods.find((item) => item.id === record.period_id);
      if (!project) throw new Error("Selecciona un proyecto existente.");
      if (!project.contract_id || project.contract_id !== record.contract_id) throw new Error("El proyecto no tiene un contrato vigente asociado.");
      if (!period) throw new Error("Selecciona un periodo existente.");
      if (period.status !== "abierto") throw new Error("El periodo está cerrado y no admite registros mensuales.");
      const existingIndex = state.monthlyTracking.findIndex((item) => item.project_id === record.project_id && item.period_id === record.period_id);
      const accumulatedOther = state.monthlyTracking
        .filter((item, index) => index !== existingIndex && item.contract_id === record.contract_id)
        .reduce((sum, item) => sum + Number(item.recognized_value), 0);
      if (accumulatedOther + record.recognized_value > Number(project.contract_value)) throw new Error("El avance reconocido acumulado supera el valor contractual vigente.");
      if (existingIndex >= 0) {
        const previous = clone(state.monthlyTracking[existingIndex]);
        state.monthlyTracking[existingIndex] = { ...state.monthlyTracking[existingIndex], ...record, validated_at: null, updated_at: new Date().toISOString() };
        recordAudit("monthly_tracking", previous.id, "UPDATE", previous, state.monthlyTracking[existingIndex]); persist();
        return normalizeMonthlySummary(decorateMonthly(state.monthlyTracking[existingIndex], state));
      }
      const created = {
        id: createUuid(), ...record, invoiced_value: 0, paid_value: 0,
        costs_expenses_value: state.costsExpenses.filter((item) => item.project_id === record.project_id && item.period_id === record.period_id).reduce((sum, item) => sum + Number(item.amount), 0),
        validated_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      };
      state.monthlyTracking.push(created); recordAudit("monthly_tracking", created.id, "INSERT", null, created); persist();
      return normalizeMonthlySummary(decorateMonthly(created, state));
    },

    async validateMonthlyTracking(trackingId) {
      const id = assertUuid(trackingId, "seguimiento");
      const record = state.monthlyTracking.find((item) => item.id === id);
      if (!record) throw new Error("El seguimiento solicitado no existe.");
      const period = state.periods.find((item) => item.id === record.period_id);
      if (period?.status !== "abierto") throw new Error("Un periodo cerrado no admite nuevas validaciones.");
      const previous = clone(record);
      record.validation_status = "validado"; record.validated_at = new Date().toISOString(); record.updated_at = record.validated_at;
      recordAudit("monthly_tracking", id, "UPDATE", previous, record); persist();
      return normalizeMonthlySummary(decorateMonthly(record, state));
    },

    async listInvoices(filters = {}) {
      const dateFrom = filters.dateFrom || null;
      const dateTo = filters.dateTo || null;
      return state.invoices
        .filter((item) => !filters.projectId || item.project_id === filters.projectId)
        .filter((item) => !filters.periodId || item.period_id === filters.periodId)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !dateFrom || item.issue_date >= dateFrom)
        .filter((item) => !dateTo || item.issue_date <= dateTo)
        .sort((left, right) => right.issue_date.localeCompare(left.issue_date))
        .map((item) => normalizeInvoice(decorateInvoice(item, state)));
    },

    async createInvoice(input) {
      const projectId = assertUuid(input.projectId, "proyecto");
      const contractId = assertUuid(input.contractId, "contrato");
      const periodId = assertUuid(input.periodId, "periodo");
      const project = state.projects.find((item) => item.id === projectId && item.contract_id === contractId);
      const period = state.periods.find((item) => item.id === periodId);
      if (!project) throw new Error("Selecciona un proyecto con contrato.");
      if (!period || period.status !== "abierto") throw new Error("Selecciona un periodo abierto.");
      const issueDate = assertDate(input.issueDate, "fecha de emisión");
      if (!issueDate.startsWith(`${period.year}-${String(period.month).padStart(2, "0")}`)) {
        throw new Error("La fecha de la factura debe corresponder al periodo seleccionado.");
      }
      const invoiceNumber = assertText(input.invoiceNumber, "número de factura", { min: 2, max: 80 });
      if (state.invoices.some((item) => item.invoice_number.toLocaleLowerCase("es") === invoiceNumber.toLocaleLowerCase("es"))) {
        throw new Error("Ya existe una factura con ese número.");
      }
      const amount = assertMoney(input.amount, "valor facturado", { allowZero: false });
      const status = assertEnum(input.status ?? "registrada", INVOICE_STATUSES, "estado de factura");
      const accumulated = state.invoices
        .filter((item) => item.contract_id === contractId && item.status !== "anulada")
        .reduce((sum, item) => sum + Number(item.amount), 0);
      if (status !== "anulada" && accumulated + amount > Number(project.contract_value)) {
        throw new Error("La facturación acumulada no puede superar el valor contractual vigente.");
      }
      const created = {
        id: createUuid(), project_id: projectId, contract_id: contractId, period_id: periodId,
        invoice_number: invoiceNumber, issue_date: issueDate, amount, status,
        support_path: input.supportPath?.trim() || null, created_at: new Date().toISOString()
      };
      state.invoices.push(created);
      recordAudit("invoices", created.id, "INSERT", null, created);
      persist();
      return normalizeInvoice(decorateInvoice(created, state));
    },

    async listPayments(filters = {}) {
      const dateFrom = filters.dateFrom || null;
      const dateTo = filters.dateTo || null;
      return state.payments
        .filter((item) => !filters.invoiceId || item.invoice_id === filters.invoiceId)
        .filter((item) => !filters.projectId || item.project_id === filters.projectId)
        .filter((item) => !filters.periodId || item.period_id === filters.periodId)
        .filter((item) => !filters.status || item.status === filters.status)
        .filter((item) => !dateFrom || item.payment_date >= dateFrom)
        .filter((item) => !dateTo || item.payment_date <= dateTo)
        .sort((left, right) => right.payment_date.localeCompare(left.payment_date))
        .map((item) => normalizePayment(decoratePayment(item, state)));
    },

    async createPayment(input) {
      const invoiceId = assertUuid(input.invoiceId, "factura");
      const periodId = assertUuid(input.periodId, "periodo");
      const invoice = state.invoices.find((item) => item.id === invoiceId);
      const period = state.periods.find((item) => item.id === periodId);
      if (!invoice || invoice.status === "anulada") throw new Error("Selecciona una factura activa.");
      if (!period || period.status !== "abierto") throw new Error("Selecciona un periodo abierto.");
      const paymentDate = assertDate(input.paymentDate, "fecha de pago");
      if (!paymentDate.startsWith(`${period.year}-${String(period.month).padStart(2, "0")}`)) {
        throw new Error("La fecha del pago debe corresponder al periodo seleccionado.");
      }
      const paymentReference = assertText(input.paymentReference, "referencia de pago", { min: 2, max: 80 });
      if (state.payments.some((item) => item.payment_reference.toLocaleLowerCase("es") === paymentReference.toLocaleLowerCase("es"))) {
        throw new Error("Ya existe un pago con esa referencia.");
      }
      const amount = assertMoney(input.amount, "valor pagado", { allowZero: false });
      const status = assertEnum(input.status ?? "registrado", PAYMENT_STATUSES, "estado de pago");
      const accumulated = state.payments
        .filter((item) => item.invoice_id === invoiceId && item.status !== "anulado")
        .reduce((sum, item) => sum + Number(item.amount), 0);
      if (status !== "anulado" && accumulated + amount > Number(invoice.amount)) {
        throw new Error("Los pagos activos no pueden superar el valor de la factura.");
      }
      const created = {
        id: createUuid(), invoice_id: invoiceId, project_id: invoice.project_id,
        contract_id: invoice.contract_id, period_id: periodId,
        payment_reference: paymentReference, payment_date: paymentDate, amount, status,
        support_path: input.supportPath?.trim() || null, created_at: new Date().toISOString()
      };
      state.payments.push(created);
      recordAudit("payments", created.id, "INSERT", null, created);
      persist();
      return normalizePayment(decoratePayment(created, state));
    },

    async listCostsExpenses(filters = {}) {
      const category = String(filters.category ?? "").trim().toLocaleLowerCase("es");
      return state.costsExpenses
        .filter((item) => {
          const matchesProject = !filters.projectId || item.project_id === filters.projectId;
          const matchesPeriod = !filters.periodId || item.period_id === filters.periodId;
          const matchesType = !filters.type || item.movement_type === filters.type;
          const matchesCategory = !category || item.category.toLocaleLowerCase("es").includes(category);
          const matchesFrom = !filters.dateFrom || item.movement_date >= filters.dateFrom;
          const matchesTo = !filters.dateTo || item.movement_date <= filters.dateTo;
          return matchesProject && matchesPeriod && matchesType && matchesCategory && matchesFrom && matchesTo;
        })
        .sort((left, right) => right.movement_date.localeCompare(left.movement_date))
        .map((item) => normalizeCostExpense(decorateCost(item, state)));
    },

    async createCostExpense(input) {
      const record = costExpenseInputToRecord(input, null);
      const project = state.projects.find((item) => item.id === record.project_id);
      const period = state.periods.find((item) => item.id === record.period_id);
      if (!project) throw new Error("Selecciona un proyecto existente.");
      if (!period) throw new Error("Selecciona un periodo existente.");
      if (period.status !== "abierto") throw new Error("No se pueden registrar movimientos en un periodo cerrado.");
      if (!record.movement_date.startsWith(`${period.year}-${String(period.month).padStart(2, "0")}`)) {
        throw new Error("La fecha del movimiento debe corresponder al periodo seleccionado.");
      }

      const created = { id: createUuid(), ...record, created_at: new Date().toISOString() };
      state.costsExpenses.push(created);
      recordAudit("costs_expenses", created.id, "INSERT", null, created);
      persist();
      return normalizeCostExpense(decorateCost(created, state));
    },

    async listAudit(filters = {}) {
      const dateFrom = filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : null;
      const dateTo = filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : null;
      return state.auditLog.map(normalizeAuditEvent)
        .filter((event) => !filters.projectId || event.projectId === filters.projectId)
        .filter((event) => !filters.tableName || event.tableName === filters.tableName)
        .filter((event) => !filters.action || event.action === filters.action)
        .filter((event) => !dateFrom || event.changedAt >= dateFrom)
        .filter((event) => !dateTo || event.changedAt <= dateTo)
        .sort((left, right) => right.changedAt.localeCompare(left.changedAt));
    },

    reset() {
      state = clone(initialState);
      persist();
    }
  });
}
