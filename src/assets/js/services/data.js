import {
  ContractRepository,
  FinanceRepository,
  MonthlyTrackingRepository,
  PeriodRepository,
  ProjectRepository
} from "../data/repositories.js";
import { requireSupabaseClient } from "./supabase.js";

export function createDataService(client = requireSupabaseClient()) {
  if (!client?.from || !client?.auth) {
    throw new TypeError("Se requiere un cliente válido de Supabase.");
  }

  return Object.freeze({
    projects: new ProjectRepository(client),
    contracts: new ContractRepository(client),
    periods: new PeriodRepository(client),
    monthlyTracking: new MonthlyTrackingRepository(client),
    finance: new FinanceRepository(client)
  });
}

