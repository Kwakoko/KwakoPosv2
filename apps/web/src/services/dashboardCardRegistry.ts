import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  Calendar,
  Clock,
  DollarSign,
  Egg,
  Footprints,
  Layers,
  Package,
  PiggyBank,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";
import type { IndustryModule } from "../modules/moduleRegistry.js";
import { MODULE_MANIFESTS } from "../modules/moduleRegistry.js";
import type { DashboardKpiSnapshot } from "./dashboardKpiService.js";

export type DashboardCardFormat = "currency" | "count" | "percent" | "text";

export interface DashboardCardDefinition {
  key: string;
  /** Stable KPI identifier resolved by the authoritative dashboard KPI service. */
  kpiKey: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  format: DashboardCardFormat;
  systemKey?: "pendingOutbox";
}

const CORE_CARDS: Record<string, DashboardCardDefinition> = {
  SalesToday: {
    key: "SalesToday",
    kpiKey: "SalesToday",
    title: "Sales Today",
    description: "Completed sales recorded by PostgreSQL",
    icon: DollarSign,
    accent: "#3b82f6",
    format: "currency",
  },
  GrossProfitToday: {
    key: "GrossProfitToday",
    kpiKey: "GrossProfitToday",
    title: "Gross Profit",
    description: "Completed-sales gross profit from PostgreSQL",
    icon: TrendingUp,
    accent: "#10b981",
    format: "currency",
  },
  AovToday: {
    key: "AovToday",
    kpiKey: "AovToday",
    title: "Average Order Value",
    description: "Completed sales value divided by completed orders",
    icon: ShoppingCart,
    accent: "#6366f1",
    format: "currency",
  },
  ProductCount: {
    key: "ProductCount",
    kpiKey: "ProductCount",
    title: "Active Products",
    description: "Active products in the current branch",
    icon: Package,
    accent: "#f59e0b",
    format: "count",
  },
  StockAlerts: {
    key: "StockAlerts",
    kpiKey: "StockAlerts",
    title: "Stock Alerts",
    description: "Low-stock plus out-of-stock variants",
    icon: AlertTriangle,
    accent: "#ef4444",
    format: "count",
  },
  CustomerDebts: {
    key: "CustomerDebts",
    kpiKey: "CustomerDebts",
    title: "Customer Debts",
    description: "Current customer receivables in the branch",
    icon: Users,
    accent: "#8b5cf6",
    format: "currency",
  },
  InventoryValue: {
    key: "InventoryValue",
    kpiKey: "InventoryValue",
    title: "Inventory Value",
    description: "On-hand branch inventory at moving weighted-average cost",
    icon: PiggyBank,
    accent: "#ec4899",
    format: "currency",
  },
  CompletedOrders: {
    key: "CompletedOrders",
    kpiKey: "CompletedOrders",
    title: "Completed Orders",
    description: "Completed orders recorded by PostgreSQL today",
    icon: Banknote,
    accent: "#0ea5e9",
    format: "count",
  },
  LowStock: {
    key: "LowStock",
    kpiKey: "LowStock",
    title: "Low Stock",
    description: "Active variants at or below reorder level",
    icon: AlertTriangle,
    accent: "#f97316",
    format: "count",
  },
  OutOfStock: {
    key: "OutOfStock",
    kpiKey: "OutOfStock",
    title: "Out of Stock",
    description: "Active variants with no available quantity",
    icon: Package,
    accent: "#dc2626",
    format: "count",
  },
  CustomerCount: {
    key: "CustomerCount",
    kpiKey: "CustomerCount",
    title: "Active Customers",
    description: "Active customers in the current branch",
    icon: Users,
    accent: "#6366f1",
    format: "count",
  },
  SupplierCount: {
    key: "SupplierCount",
    kpiKey: "SupplierCount",
    title: "Active Suppliers",
    description: "Active suppliers in the current branch",
    icon: Briefcase,
    accent: "#64748b",
    format: "count",
  },
  PendingSync: {
    key: "PendingSync",
    kpiKey: "PendingSync",
    title: "Device Sync",
    description: "This device's local mutations awaiting cloud synchronization",
    icon: RefreshCw,
    accent: "#f97316",
    format: "count",
    systemKey: "pendingOutbox",
  },
};

const MODULE_CARDS: Record<string, DashboardCardDefinition> = {
  RestaurantActiveService: {
    key: "RestaurantActiveService",
    kpiKey: "RestaurantActiveService",
    title: "Active Service",
    description: "Live service-window workload",
    icon: Layers,
    accent: "#10b981",
    format: "count",
  },
  RestaurantKitchenQueue: {
    key: "RestaurantKitchenQueue",
    kpiKey: "RestaurantKitchenQueue",
    title: "Kitchen Queue",
    description: "Orders awaiting kitchen completion",
    icon: Clock,
    accent: "#f59e0b",
    format: "count",
  },
  PharmacyPendingRx: {
    key: "PharmacyPendingRx",
    kpiKey: "PharmacyPendingRx",
    title: "Pending Prescriptions",
    description: "Prescriptions awaiting pharmacist validation",
    icon: Clock,
    accent: "#f59e0b",
    format: "count",
  },
  PharmacyNearExpiry: {
    key: "PharmacyNearExpiry",
    kpiKey: "PharmacyNearExpiry",
    title: "Near-Expiry Alerts",
    description: "Medicines requiring expiry review",
    icon: AlertTriangle,
    accent: "#ef4444",
    format: "count",
  },
  RestaurantKitchenStatus: {
    key: "RestaurantKitchenStatus",
    kpiKey: "RestaurantKitchenStatus",
    title: "Kitchen Status",
    description: "Authoritative kitchen workload status is not registered",
    icon: Clock,
    accent: "#64748b",
    format: "text",
  },
  SaccoDepositsSavings: {
    key: "SaccoDepositsSavings",
    kpiKey: "SaccoDepositsSavings",
    title: "Deposits & Savings",
    description: "Member savings balance",
    icon: PiggyBank,
    accent: "#10b981",
    format: "currency",
  },
  SaccoOutstandingLoans: {
    key: "SaccoOutstandingLoans",
    kpiKey: "SaccoOutstandingLoans",
    title: "Outstanding Loans",
    description: "Active lending portfolio value",
    icon: Briefcase,
    accent: "#3b82f6",
    format: "currency",
  },
  SaccoInterestEarned: {
    key: "SaccoInterestEarned",
    kpiKey: "SaccoInterestEarned",
    title: "Interest Earned YTD",
    description: "Requires an authoritative accrued-interest KPI",
    icon: TrendingUp,
    accent: "#f59e0b",
    format: "currency",
  },
  SaccoMembers: {
    key: "SaccoMembers",
    kpiKey: "SaccoMembers",
    title: "SACCO Members",
    description: "Registered members in the current branch",
    icon: Users,
    accent: "#6366f1",
    format: "count",
  },
  PoultryAnimals: {
    key: "PoultryAnimals",
    kpiKey: "PoultryAnimals",
    title: "Total Animals",
    description: "Requires an authoritative livestock register KPI",
    icon: Footprints,
    accent: "#3b82f6",
    format: "count",
  },
  PoultryFlocks: {
    key: "PoultryFlocks",
    kpiKey: "PoultryFlocks",
    title: "Active Flocks",
    description: "Requires an authoritative flock register KPI",
    icon: Egg,
    accent: "#10b981",
    format: "count",
  },
  PoultryEggsToday: {
    key: "PoultryEggsToday",
    kpiKey: "PoultryEggsToday",
    title: "Daily Production",
    description: "Requires an authoritative egg-production KPI",
    icon: TrendingUp,
    accent: "#f59e0b",
    format: "count",
  },
  PoultryMortalityRate: {
    key: "PoultryMortalityRate",
    kpiKey: "PoultryMortalityRate",
    title: "Mortality Rate",
    description: "Requires authoritative mortality records",
    icon: AlertTriangle,
    accent: "#ef4444",
    format: "percent",
  },
  ConsultantClients: {
    key: "ConsultantClients",
    kpiKey: "ConsultantClients",
    title: "Total Clients",
    description: "Requires an authoritative consulting-client KPI",
    icon: Users,
    accent: "#6366f1",
    format: "count",
  },
  ConsultantEngagements: {
    key: "ConsultantEngagements",
    kpiKey: "ConsultantEngagements",
    title: "Active Engagements",
    description: "Requires an authoritative engagement KPI",
    icon: Briefcase,
    accent: "#3b82f6",
    format: "count",
  },
  ConsultantRevenue: {
    key: "ConsultantRevenue",
    kpiKey: "ConsultantRevenue",
    title: "Monthly Revenue",
    description: "Requires an authoritative consulting-revenue KPI",
    icon: DollarSign,
    accent: "#f59e0b",
    format: "currency",
  },
  ConsultantUtilization: {
    key: "ConsultantUtilization",
    kpiKey: "ConsultantUtilization",
    title: "Utilization Rate",
    description: "Requires authoritative billable-time records",
    icon: TrendingUp,
    accent: "#10b981",
    format: "percent",
  },
  ConsultantBillableHours: {
    key: "ConsultantBillableHours",
    kpiKey: "ConsultantBillableHours",
    title: "Billable Hours",
    description: "Requires authoritative timesheet records",
    icon: Clock,
    accent: "#f43f5e",
    format: "count",
  },
  ConsultantProposalConversion: {
    key: "ConsultantProposalConversion",
    kpiKey: "ConsultantProposalConversion",
    title: "Proposal Conversion",
    description: "Requires authoritative proposal workflow data",
    icon: TrendingUp,
    accent: "#10b981",
    format: "percent",
  },
  ConsultantUpcomingMeetings: {
    key: "ConsultantUpcomingMeetings",
    kpiKey: "ConsultantUpcomingMeetings",
    title: "Upcoming Meetings",
    description: "Requires authoritative calendar data",
    icon: Calendar,
    accent: "#3b82f6",
    format: "count",
  },
  ConsultantExpiringContracts: {
    key: "ConsultantExpiringContracts",
    kpiKey: "ConsultantExpiringContracts",
    title: "Expiring Contracts",
    description: "Requires authoritative contract data",
    icon: AlertTriangle,
    accent: "#ef4444",
    format: "count",
  },
};

const DASHBOARD_CARD_REGISTRY: Record<string, DashboardCardDefinition> = {
  ...CORE_CARDS,
  ...MODULE_CARDS,
  RetailSalesToday: { ...CORE_CARDS.SalesToday, key: "RetailSalesToday", title: "Today's Sales" },
  RetailGrossProfit: { ...CORE_CARDS.GrossProfitToday, key: "RetailGrossProfit", title: "Gross Profit (Real)" },
  RetailAov: { ...CORE_CARDS.AovToday, key: "RetailAov", title: "Avg Order Value (AOV)" },
  RetailProducts: { ...CORE_CARDS.ProductCount, key: "RetailProducts", title: "Total Products" },
  RetailStockAlerts: { ...CORE_CARDS.StockAlerts, key: "RetailStockAlerts" },
  RetailCustomerDebts: { ...CORE_CARDS.CustomerDebts, key: "RetailCustomerDebts" },
  RetailInventoryValue: { ...CORE_CARDS.InventoryValue, key: "RetailInventoryValue" },
  RestaurantSalesToday: { ...CORE_CARDS.SalesToday, key: "RestaurantSalesToday" },
  RestaurantLowIngredients: { ...CORE_CARDS.LowStock, key: "RestaurantLowIngredients", title: "Low Ingredients" },
  PharmacySalesToday: { ...CORE_CARDS.SalesToday, key: "PharmacySalesToday" },
  PharmacyCriticalLowDrugs: { ...CORE_CARDS.LowStock, key: "PharmacyCriticalLowDrugs", title: "Critically Low Drugs" },
  DefaultSalesToday: { ...CORE_CARDS.SalesToday, key: "DefaultSalesToday" },
  DefaultInventoryValue: { ...CORE_CARDS.InventoryValue, key: "DefaultInventoryValue", title: "Inventory Valuation" },
  DefaultCustomerCount: { ...CORE_CARDS.CustomerCount, key: "DefaultCustomerCount", title: "Active Contacts" },
  DefaultStockAlerts: { ...CORE_CARDS.StockAlerts, key: "DefaultStockAlerts", title: "System Alerts" },
};

export const DEFAULT_DASHBOARD_CARD_KEYS = [
  "DefaultSalesToday",
  "DefaultInventoryValue",
  "DefaultCustomerCount",
  "DefaultStockAlerts",
];

export function getDashboardCardDefinitions(module: IndustryModule): DashboardCardDefinition[] {
  const manifest = MODULE_MANIFESTS[module];
  const keys = manifest?.dashboardCardKeys?.length
    ? manifest.dashboardCardKeys
    : DEFAULT_DASHBOARD_CARD_KEYS;

  return keys
    .map((key) => DASHBOARD_CARD_REGISTRY[key])
    .filter((card): card is DashboardCardDefinition => Boolean(card));
}

export function formatDashboardKpiValue(
  definition: DashboardCardDefinition,
  snapshot: DashboardKpiSnapshot,
): string | number {
  const value = snapshot.kpis?.[definition.kpiKey];
  if (value === null || value === undefined) return "—";
  if (definition.format === "currency") {
    const amount = Number(value);
    return amount >= 1_000_000
      ? `Tsh ${(amount / 1_000_000).toFixed(1)}M`
      : amount >= 1_000
        ? `Tsh ${(amount / 1_000).toFixed(1)}K`
        : `Tsh ${Math.round(amount).toLocaleString()}`;
  }
  if (definition.format === "count") return Number(value).toLocaleString();
  if (definition.format === "percent") return `${Number(value).toFixed(1)}%`;
  return String(value);
}
