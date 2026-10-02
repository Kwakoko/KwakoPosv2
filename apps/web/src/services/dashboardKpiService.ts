import { apiFetch } from "./apiClient.js";

export interface DashboardKpiSnapshot {
  asOfRevision: string;
  capturedAt: string;
  tenantId: string;
  branchId: string;
  salesToday: number;
  grossProfit: number;
  aov: number;
  todayOrderCount: number;
  completedOrders: number;
  inventoryValue: number;
  stockAlerts: number;
  lowStockCount: number;
  outOfStockCount: number;
  customerDebts: number;
  customerCount: number;
  productCount: number;
  supplierCount: number;
  /** Keyed KPI values consumed by the dashboard card registry. Null means the metric is not implemented for this module. */
  kpis: Record<string, number | null>;
}

/**
 * Fetches the single PostgreSQL-authoritative dashboard snapshot.
 * Callers must not replace a failed online request with IndexedDB KPI data.
 */
export async function fetchDashboardKpiSnapshot(): Promise<DashboardKpiSnapshot> {
  const response = await apiFetch<{ success: boolean; data: DashboardKpiSnapshot }>("/api/v1/dashboard/kpis");
  if (!response?.success || !response.data) {
    throw new Error("Authoritative dashboard KPI snapshot unavailable");
  }
  return response.data;
}
