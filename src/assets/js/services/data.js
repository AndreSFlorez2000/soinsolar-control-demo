import {
  AuditRepository,
  ContractRepository,
  FinanceRepository,
  MonthlyTrackingRepository,
  PeriodRepository,
  ProfileRepository,
  ProjectRepository
} from "../data/repositories.js?v=1.1.0";
import { requireSupabaseClient } from "./supabase.js?v=1.1.0";

export function createDataService(client = requireSupabaseClient()) {
  if (!client?.from || !client?.auth) {
    throw new TypeError("Se requiere un cliente válido de Supabase.");
  }

  return Object.freeze({
    profiles: new ProfileRepository(client),
    projects: new ProjectRepository(client),
    contracts: new ContractRepository(client),
    periods: new PeriodRepository(client),
    monthlyTracking: new MonthlyTrackingRepository(client),
    finance: new FinanceRepository(client),
    audit: new AuditRepository(client)
  });
}
