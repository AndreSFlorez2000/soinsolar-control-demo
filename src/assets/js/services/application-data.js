import { createDataService } from "./data.js?v=1.18.20";
import { getCurrentUser, isDemoMode, requireSupabaseClient } from "./supabase.js?v=1.4.0";

export async function createApplicationDataGateway() {
  if (isDemoMode()) {
    const { createDemoStore } = await import("../data/demo-store.js?v=1.12.0");
    return createDemoStore();
  }

  const client = requireSupabaseClient();
  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("La sesión no está disponible. Inicia sesión nuevamente.");
  }

  const data = createDataService(client);
  const userId = user.id;
  async function cleanupRpc(name, args) {
    const { data: result, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message || "No fue posible completar la acción de administración.");
    return result;
  }

  return Object.freeze({
    mode: "supabase",
    userId,
    getCurrentProfile: () => data.profiles.get(userId),
    listProfiles: () => data.profiles.list(),
    updateProfile: (id, input) => data.profiles.update(id, input),
    previewAdminCleanup: (kind, identifier = null) => cleanupRpc("admin_cleanup_preview", {
      p_kind: kind, p_identifier: identifier
    }),
    executeAdminCleanup: (kind, identifier, token, confirmation) => cleanupRpc("admin_cleanup_execute", {
      p_kind: kind, p_identifier: identifier, p_token: token, p_confirmation: confirmation
    }),
    listProjects: (filters) => data.projects.list(filters),
    listProjectDetails: () => data.projects.listDetails(),
    getProject: (id) => data.projects.get(id),
    getProjectSummary: (id) => data.projects.getSummary(id),
    createProject: (input) => data.projects.create(input, userId),
    createProjects: (inputs) => data.projects.createMany(inputs, userId),
    updateImportedHistory: (inputs) => data.projects.updateImportedHistoryMany(inputs, userId),
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
    applyExecutionProgress: (input) => data.monthlyTracking.applyExecutionProgress(input),
    validateMonthlyTracking: (id) => data.monthlyTracking.validate(id, userId),
    listInvoices: (filters) => data.finance.listInvoices(filters),
    createInvoice: (input) => data.finance.createInvoice(input, userId),
    listPayments: (filters) => data.finance.listPayments(filters),
    createPayment: (input) => data.finance.createPayment(input, userId),
    listCostsExpenses: (filters) => data.finance.listCostsExpenses(filters),
    listAccountingImports: () => data.accounting.listImports(),
    listAccountingCenters: (id) => data.accounting.listCenters(id),
    listAccountingCostCenters: (id) => data.accounting.listCostCenters(id),
    listAccountingCostEntries: (id) => data.accounting.listCostEntries(id),
    getAccountingEntry: (id, rowNumber) => data.accounting.getEntry(id, rowNumber),
    listAccountingParties: (id) => data.accounting.listParties(id),
    summarizeAccounting: (filters) => data.accounting.summary(filters),
    listAccountingEntries: (id, filters, page) => data.accounting.listEntries(id, filters, page),
    accountingRawPages: (id) => data.accounting.rawPages(id),
    importAccountingAuxiliary: (input) => data.accounting.importAuxiliary(input),
    createCostExpense: (input) => data.finance.createCostExpense(input, userId),
    createCostsExpenses: (inputs) => data.finance.createCostsExpenses(inputs, userId),
    listAudit: (filters) => data.audit.list(filters),
    uploadSupport: (input) => data.supports.upload(input),
    getSupportUrl: (path) => data.supports.createSignedUrl(path)
  });
}
