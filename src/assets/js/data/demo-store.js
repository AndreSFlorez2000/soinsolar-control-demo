import {
  assertUuid,
  costExpenseInputToRecord,
  normalizeCostExpense,
  normalizeProject,
  normalizeProjectSummary,
  projectInputToRecord
} from "./models.js?v=0.3.1";

const STORAGE_KEY = "soinsolar-control-demo-v2";

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
    { id: "30000000-0000-4000-8000-000000000001", year: 2026, month: 8, status: "cerrado" },
    { id: "30000000-0000-4000-8000-000000000002", year: 2026, month: 9, status: "abierto" }
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
    if (stored?.projects && stored?.periods && stored?.costsExpenses) return stored;
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

  return Object.freeze({
    mode: "demo",

    async listProjects(filters = {}) {
      const name = String(filters.name ?? "").trim().toLocaleLowerCase("es");
      const costCenter = String(filters.costCenter ?? "").trim().toLocaleLowerCase("es");
      const municipality = String(filters.municipality ?? "").trim().toLocaleLowerCase("es");

      return state.projects
        .filter((project) => {
          const matchesName = !name || [project.name, project.client_name]
            .some((value) => String(value ?? "").toLocaleLowerCase("es").includes(name));
          const matchesCenter = !costCenter || project.cost_center.toLocaleLowerCase("es").includes(costCenter);
          const matchesMunicipality = !municipality || project.municipality.toLocaleLowerCase("es").includes(municipality);
          const matchesStatus = !filters.status || project.status === filters.status;
          return matchesName && matchesCenter && matchesMunicipality && matchesStatus;
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

      state.projects[index] = { ...state.projects[index], ...record, updated_at: new Date().toISOString() };
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
      persist();
    },

    async listPeriods() {
      return clone(state.periods).sort((left, right) => right.year - left.year || right.month - left.month);
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
      persist();
      return normalizeCostExpense(decorateCost(created, state));
    },

    reset() {
      state = clone(initialState);
      persist();
    }
  });
}
