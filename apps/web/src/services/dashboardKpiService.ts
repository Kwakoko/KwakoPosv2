import { apiFetch } from "./apiClient.js";

export interface DashboardRevenuePoint {
  name: string; fullLabel: string; Revenue: number; Profit: number; COGS: number; PriorRevenue: number; ordersCount: number; marginPct: string;
}
export interface DashboardPaymentChannel { name: string; volume: number; count: number; volumeShare: number; countShare: number; aov: number; }
export interface DashboardTopProduct { productId: string; name: string; revenue: number; units: number; stock: number; category: string; rank: number; }
export interface DashboardAnalyticsSnapshot {
  timeframe: "today" | "7d" | "30d" | "month";
  chartPoints: DashboardRevenuePoint[]; totalRevenue: number; totalCOGS: number; totalProfit: number; marginPct: string;
  revenueDeltaPct: string | null; profitDeltaPct: string | null; priorTotalRevenue: number;
  peakHour: { hour: string; revenue: number; ordersCount: number } | null;
  paymentChannels: DashboardPaymentChannel[]; paymentTotalVolume: number; paymentTotalCount: number; paymentOverallAov: number;
  topProducts: DashboardTopProduct[]; topProductsTotalTracked: number;
}
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
  grossSalesToday: number;
  discountsToday: number;
  refundsToday: number;
  netSalesToday: number;
  cogsToday: number;
  grossMarginToday: number;
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
  analytics: DashboardAnalyticsSnapshot;
}

/**
 * Fetches the single PostgreSQL-authoritative dashboard snapshot.
 * Callers must not replace a failed online request with IndexedDB KPI data.
 */
export async function fetchDashboardKpiSnapshot(
  timeframe: DashboardAnalyticsSnapshot["timeframe"] = "7d",
): Promise<DashboardKpiSnapshot> {
  const response = await apiFetch<{ success: boolean; data: DashboardKpiSnapshot }>(`/api/v1/dashboard/kpis?timeframe=${encodeURIComponent(timeframe)}`);
  if (!response?.success || !response.data) {
    throw new Error("Authoritative dashboard KPI snapshot unavailable");
  }
  return response.data;
}
