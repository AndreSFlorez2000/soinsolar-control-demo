import {
  assertUuid,
  costExpenseInputToRecord,
  monthlyTrackingInputToRecord,
  normalizeAuditEvent,
  normalizeCostExpense,
  normalizeMonthlySummary,
  normalizePeriod,
  normalizeProject,
  normalizeProjectSummary,
  periodInputToRecord,
  projectInputToRecord
} from "./models.js?v=0.4.0";

const STORAGE_KEY = "soinsolar-control-demo-v3";

const initialState = Object.freeze({
  projects: [
    {
      id: "10000000-0000-4000-8000-000000000001",
      cost_center: "DEMO-001",
      name: "Proyecto Solar Demostrativo",
      client_name: "Cliente demostrativo A",
      municipality: "Municipio A",
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
      cost_center: "DEMO-002",
      name: "Proyecto Solar Comercial",
      client_name: "Cliente demostrativo B",
      municipality: "Municipio B",
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
      total_paid: 800000000
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      cost_center: "DEMO-003",
      name: "Proyecto Solar Empresarial",
      client_name: "Cliente demostrativo C",
      municipality: "Municipio C",
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
    if (stored?.projects && stored?.periods && stored?.costsExpenses && stored?.monthlyTracking && stored?.auditLog) return stored;
  } catch {
    // Si el almacenamiento fue alterado, se recupera la demostración inicial.
  }
  return clone(initialState);
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
  const previous = state.monthlyTracking
    .filter((item) => item.project_id === record.project_id)
    .filter((item) => {
      const itemPeriod = state.periods.find((candidate) => candidate.id === item.period_id);
      if (!itemPeriod || !period) return false;
      return itemPeriod.year < period.year || (itemPeriod.year === period.year && itemPeriod.month <= period.month);
    });
  const cumulativeInvoiced = previous.reduce((sum, item) => sum + Number(item.invoiced_value ?? 0), 0);
  return {
    ...record,
    tracking_id: record.id,
    cost_center: project?.cost_center ?? "",
    project_name: project?.name ?? "",
    year: period?.year, month: period?.month, period_status: period?.status,
    contract_value: Number(project?.contract_value ?? 0),
    costs_expenses_value: state.costsExpenses
      .filter((item) => item.project_id === record.project_id && item.period_id === record.period_id)
      .reduce((sum, item) => sum + Number(item.amount), 0),
    cumulative_invoiced_value: cumulativeInvoiced
  };
}

function projectSummary(record, state) {
  const totalCostsExpenses = state.costsExpenses
    .filter((item) => item.project_id === record.id)
    .reduce((sum, item) => sum + Number(item.amount), 0);

  return normalizeProjectSummary({
    ...record,
    total_costs_expenses: totalCostsExpenses
  });
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
        || Number(project.total_invoiced) > 0
        || Number(project.total_paid) > 0;
      if (hasMovements) {
        throw new Error("No se puede eliminar un proyecto con movimientos. Cambia su estado para conservar el histórico.");
      }
      state.projects = state.projects.filter((item) => item.id !== id);
      recordAudit("projects", id, "DELETE", project, null);
      persist();
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
        ...state.costsExpenses.filter((item) => item.period_id === id).map((item) => item.project_id)
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
