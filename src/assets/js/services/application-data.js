import { createDataService } from "./data.js?v=1.4.1";
import { getCurrentUser, isDemoMode, requireSupabaseClient } from "./supabase.js?v=1.4.0";

export async function createApplicationDataGateway() {
  if (isDemoMode()) {
    const { createDemoStore } = await import("../data/demo-store.js?v=1.4.1");
    return createDemoStore();
  }

  const client = requireSupabaseClient();
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("La sesión no está disponible. Inicia sesión nuevamente.");
  }

  const data = createDataService(client);
  const userId = user.id;

  return Object.freeze({
    mode: "supabase",
    userId,
    getCurrentProfile: () => data.profiles.get(userId),
    listProfiles: () => data.profiles.list(),
    updateProfile: (id, input) => data.profiles.update(id, input),
    listProjects: (filters) => data.projects.list(filters),
    getProject: (id) => data.projects.get(id),
    getProjectSummary: (id) => data.projects.getSummary(id),
    createProject: (input) => data.projects.create(input, userId),
    updateProject: (id, input) => data.projects.update(id, input, userId),
    removeProject: (id) => data.projects.remove(id),
    listContracts: (projectId) => data.contracts.listByProject(projectId),
    createContract: (input) => data.contracts.create(input, userId),
    updateContract: (id, input) => data.contracts.update(id, input, userId),
    listPeriods: () => data.periods.list(),
    createPeriod: (input) => data.periods.create(input.year, input.month),
    closePeriod: (id) => data.periods.close(id, userId),
    reopenPeriod: (id) => data.periods.reopen(id),
    listMonthlyTracking: (filters) => data.monthlyTracking.list(filters),
    saveMonthlyTracking: (input) => data.monthlyTracking.save(input, userId),
    validateMonthlyTracking: (id) => data.monthlyTracking.validate(id, userId),
    listInvoices: (filters) => data.finance.listInvoices(filters),
    createInvoice: (input) => data.finance.createInvoice(input, userId),
    listPayments: (filters) => data.finance.listPayments(filters),
    createPayment: (input) => data.finance.createPayment(input, userId),
    listCostsExpenses: (filters) => data.finance.listCostsExpenses(filters),
    createCostExpense: (input) => data.finance.createCostExpense(input, userId),
    listAudit: (filters) => data.audit.list(filters),
    uploadSupport: (input) => data.supports.upload(input),
    getSupportUrl: (path) => data.supports.createSignedUrl(path)
  });
}
