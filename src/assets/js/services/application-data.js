import { createDemoStore } from "../data/demo-store.js?v=0.3.0";
import { createDataService } from "./data.js?v=0.3.0";
import { getCurrentSession, isDemoMode, requireSupabaseClient } from "./supabase.js?v=0.3.0";

export async function createApplicationDataGateway() {
  if (isDemoMode()) return createDemoStore();

  const client = requireSupabaseClient();
  const session = await getCurrentSession();
  if (!session?.user?.id) {
    throw new Error("La sesión no está disponible. Inicia sesión nuevamente.");
  }

  const data = createDataService(client);
  const userId = session.user.id;

  return Object.freeze({
    mode: "supabase",
    userId,
    listProjects: (filters) => data.projects.list(filters),
    getProject: (id) => data.projects.get(id),
    getProjectSummary: (id) => data.projects.getSummary(id),
    createProject: (input) => data.projects.create(input, userId),
    updateProject: (id, input) => data.projects.update(id, input, userId),
    removeProject: (id) => data.projects.remove(id),
    listPeriods: () => data.periods.list(),
    listCostsExpenses: (filters) => data.finance.listCostsExpenses(filters),
    createCostExpense: (input) => data.finance.createCostExpense(input, userId)
  });
}
