/**
 * KwakoPosv2 — Executive Analytics Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, 100% faithful port of legacy Tenant Dashboard UI/UX:
 *   1. Identical Header layout, typography, status badges & Launch POS CTA
 *   2. Sector-adaptive KPI metrics (Retail 8-card, Restaurant, Pharmacy, SACCO,
 *      Poultry, BusinessConsultant, Default)
 *   3. First-run Onboarding Banner for clean tenants with step cards
 *   4. Sales Revenue & Gross Profit AreaChart with dual gradient fill & CustomTooltip
 *   5. Payment Channels Donut PieChart with breakdown and empty state
 *   6. Top Products Horizontal BarChart with revenue ranking
 *   7. Recent Orders table with monospace IDs, date/time, channel, sync status
 *   8. V2 Offline-first data binding (IndexedDB + API fallback)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useModule, useAuth, useBranch, useTenant, useSync } from '../context/KwakoPosContexts.js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/UI/custom-ui.js';
import { apiFetch } from '../services/applicationApiService.js';
import { fetchDashboardKpiSnapshot, type DashboardKpiSnapshot } from '../services/dashboardKpiService.js';
import { getDashboardCardDefinitions, formatDashboardKpiValue } from '../services/dashboardCardRegistry.js';
import { DATA_CHANGED_EVENT } from '../services/dataChangeEvent.js';
import { outboxMatchesScope } from '../indexedDb.js';
import {
  TrendingUp, TrendingDown, DollarSign, Package, Users,
  AlertTriangle, Clock, PiggyBank, Briefcase,
  Sparkles, Layers, Egg, Footprints, Truck, ArrowRight, Calendar,
  ShoppingCart, BarChart2, CheckCircle, RefreshCw, Zap, Star,
  Banknote, CreditCard, Smartphone, Building2, ArrowLeftRight, Wallet, Flame,
  Printer, Award, Eye, User, Download, UserCheck, ShieldCheck
} from 'lucide-react';
import { Sheet } from '../components/UI/Sheet.js';
import { KokoCompanion } from '../components/KokoCompanion.js';
import { ToggleSwitch } from '../components/UI/ToggleSwitch.js';
import { useToast } from '../components/UI/Toast.js';
import type { TraVfdIntegrationStatus } from '@kwakopos2/contracts';
import { syncStatusService, useAuthoritativeSyncStatus } from '../services/syncStatusService.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmtCcy = (n: number) =>
  n >= 1_000_000 ? `Tsh ${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000   ? `Tsh ${(n / 1_000).toFixed(1)}K`
  : `Tsh ${Math.round(n).toLocaleString()}`;

const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });

const getTenderBadge = (method?: string) => {
  const m = (method || 'Cash').toLowerCase();
  if (m.includes('mpesa') || m.includes('m-pesa') || m.includes('mobile')) {
    return {
      label: 'Mobile Money',
      Icon: Smartphone,
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
      border: 'rgba(16, 185, 129, 0.25)',
    };
  }
  if (m.includes('card') || m.includes('visa') || m.includes('mastercard') || m.includes('pos')) {
    return {
      label: 'Bank Card',
      Icon: CreditCard,
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
      border: 'rgba(245, 158, 11, 0.25)',
    };
  }
  if (m.includes('bank') || m.includes('transfer') || m.includes('wire')) {
    return {
      label: 'Bank Transfer',
      Icon: Building2,
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.12)',
      border: 'rgba(99, 102, 241, 0.25)',
    };
  }
  if (m.includes('split')) {
    return {
      label: 'Split Tender',
      Icon: ArrowLeftRight,
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.12)',
      border: 'rgba(236, 72, 153, 0.25)',
    };
  }
  return {
    label: 'Cash',
    Icon: Banknote,
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.25)',
  };
};

// Custom Recharts tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl shadow-xl p-3 text-xs min-w-[150px] space-y-1.5">
      <p className="font-black text-slate-800 dark:text-slate-100 pb-1 border-b border-slate-100 dark:border-darkbg-border">{label}</p>
      {payload.map((p: any, i: number) => {
        const isMoney = ['Revenue', 'Profit', 'Savings', 'Loans', 'Cost'].includes(p.name);
        return (
          <div key={i} className="flex items-center justify-between gap-3 font-semibold text-[11px]">
            <span style={{ color: p.color }} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full inline-block shrink-0" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="font-extrabold text-slate-900 dark:text-white">
              {isMoney ? fmtCcy(p.value) : p.value}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KPICardProps {
  title: string;
  value: string | number;
  desc: string;
  icon: React.ReactNode;
  accent: string;
  trend?: 'up' | 'down' | null;
  trendLabel?: string;
  onClick?: () => void;
  /** Optional inline action button rendered inside the card (does not trigger onClick). */
  action?: { label: string; onClick: () => void };
}

const KPICard: React.FC<KPICardProps> = ({ title, value, desc, icon, accent, trend, trendLabel, onClick, action }) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl bg-white dark:bg-darkbg-card border border-slate-100 dark:border-darkbg-border p-5 shadow-sm transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
  >
    {/* Decorative accent blob */}
    <div className="absolute -top-4 -right-4 h-20 w-20 rounded-full opacity-10" style={{ background: accent }} />

    <div className="flex items-start justify-between relative">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white leading-none">{value}</p>
        {trend && (
          <span className={`mt-1.5 inline-flex items-center gap-0.5 text-[10px] font-black rounded-full px-1.5 py-0.5 ${
            trend === 'up' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' : 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400'
          }`}>
            {trend === 'up' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {trendLabel || (trend === 'up' ? '+Today' : '−Today')}
          </span>
        )}
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-tight">{desc}</p>
        {action && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); action.onClick(); }}
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-colors"
            style={{ background: `${accent}18`, color: accent }}
          >
            <RefreshCw className="h-3 w-3" />
            {action.label}
          </button>
        )}
      </div>
      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: `${accent}18` }}>
        <div style={{ color: accent }}>{icon}</div>
      </div>
    </div>
  </div>
);

// ─── Data Models ─────────────────────────────────────────────────────────────

interface LocalProduct {
  id: string;
  name: string;
  price: number;
  buyingPrice?: number;
  stock: number;
  reorderLevel?: number;
  category?: string;
  module?: string;
  branch_id?: string;
  branchId?: string;
  hasVariants?: boolean;
  expiryDate?: string;
  status?: string;
  deletedAt?: string;
}

interface LocalVariant {
  id: string;
  productId: string;
  name?: string;
  buyingPrice?: number;
  price?: number;
  stock: number;
  reorderLevel?: number;
  status?: string;
}

interface LocalOrder {
  id: string;
  saleNumber?: string;
  customer?: string;
  cashierName?: string;
  timestamp: number;
  total: number;
  status: string;
  paymentMethod: string;
  syncStatus: 'Synced' | 'Pending' | 'Failed';
  cashReceived?: number;
  changeDue?: number;
  module?: string;
  branch_id?: string;
  branchId?: string;
  items: Array<{
    productId: string;
    variantId?: string;
    name: string;
    price: number;
    quantity: number;
  }>;
}

interface LocalCustomer {
  id: string;
  name: string;
  type?: string;
  branch_id?: string;
  outstandingBalance?: number;
  created_at?: number;
}

interface LocalSupplier {
  id: string;
  name: string;
}

export interface DashboardPageProps {
  onNavigate?: (path: string) => void;
}

type RechartsModule = typeof import("recharts");

const ChartFallback = ({ children, ...props }: any) => (
  <div style={{ width: "100%", minHeight: 180 }} aria-hidden="true" {...props} />
);

// ─── Main Dashboard Component ────────────────────────────────────────────────

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { activeModule = 'Retail', setActiveTab } = useModule();
  const { user } = useAuth();
  const { currentBranchId, currentBranchName } = useBranch();
  const { currentTenantId, currentTenantName } = useTenant();
  const { db, isOnline, forceBootstrap } = useSync();

  const role = user?.role || 'Admin';
  const tenantId = currentTenantId || user?.tenantId || '';
  const branchId = currentBranchId || user?.branchId || '';
  const syncStatus = useAuthoritativeSyncStatus({ tenantId: tenantId || null, branchId: branchId || null });
  const [authoritativeKpis, setAuthoritativeKpis] = useState<DashboardKpiSnapshot | null>(null);
  const [authoritativeKpiError, setAuthoritativeKpiError] = useState<string | null>(null);
  const [activeCashSession, setActiveCashSession] = useState<any | null>(null);
  const [isLoadingAuthoritativeKpis, setIsLoadingAuthoritativeKpis] = useState(false);
  const [revenueTimeframe, setRevenueTimeframe] = useState<'today' | '7d' | '30d' | 'month'>('7d');
  const toast = useToast();
  const [traVfdStatus, setTraVfdStatus] = useState<TraVfdIntegrationStatus | null>(null);
  const [isVfdModalOpen, setIsVfdModalOpen] = useState(false);
  const [isRefreshingVfd, setIsRefreshingVfd] = useState(false);
  const [isVfdEnabled, setIsVfdEnabled] = useState(() => {
    try {
      const savedVfd = db.getConfigurationLocal?.("tra_vfd_config", { tenantId: tenantId || "", branchId: branchId || "" }) as any;
      if (savedVfd && typeof savedVfd.enabled === "boolean") return savedVfd.enabled;
    } catch {}
    return false;
  });

  useEffect(() => {
    let cancelled = false;
    if (!isOnline) { setActiveCashSession(null); return () => { cancelled = true; }; }
    void apiFetch<{ success: boolean; data: any | null }>("/api/v1/cash-sessions/active").then((response) => {
      if (!cancelled) setActiveCashSession(response?.success ? response.data : null);
    }).catch(() => { if (!cancelled) setActiveCashSession(null); });
    return () => { cancelled = true; };
  }, [isOnline, tenantId, branchId]);

  const refreshVfdStatus = useCallback(async () => {
    if (!tenantId || !branchId || !isOnline) return;
    setIsRefreshingVfd(true);
    try {
      const body = await apiFetch<any>('/api/v1/tra-vfd/status', {
        headers: { 'x-tenant-id': tenantId, 'x-branch-id': branchId, 'x-user-id': user?.id || '' },
      });
      const data = (body?.data || body) as TraVfdIntegrationStatus;
      setTraVfdStatus(data);
      if (data && typeof data.status === "string") {
        setIsVfdEnabled(data.status !== "DISABLED");
      }
      toast.success("TRA VFD Status Updated", `Gateway state: ${data.status} (${data.environment || "TEST"})`);
    } catch (err: any) {
      toast.error("VFD Refresh Failed", err?.message || "Could not retrieve status");
    } finally {
      setIsRefreshingVfd(false);
    }
  }, [tenantId, branchId, isOnline, user?.id, toast]);

  useEffect(() => {
    let active = true;
    if (!tenantId || !branchId) {
      setTraVfdStatus(null);
      return () => { active = false; };
    }
    try {
      const local = db.getConfigurationLocal?.("tra_vfd_config", { tenantId, branchId }) as any;
      if (local && typeof local.enabled === "boolean") {
        setIsVfdEnabled(local.enabled);
      }
    } catch {}

    if (!isOnline) return () => { active = false; };
    void apiFetch<any>('/api/v1/tra-vfd/status', {
      headers: { 'x-tenant-id': tenantId, 'x-branch-id': branchId, 'x-user-id': user?.id || '' },
    }).then((body) => {
      if (active) {
        const data = (body?.data || body) as TraVfdIntegrationStatus;
        setTraVfdStatus(data);
        if (data && typeof data.status === "string") {
          setIsVfdEnabled(data.status !== "DISABLED");
        }
      }
    }).catch(() => {
      if (active) setTraVfdStatus(null);
    });
    return () => { active = false; };
  }, [tenantId, branchId, isOnline, user?.id, db]);

  const handleDashboardVfdToggle = async (newVal: boolean) => {
    setIsVfdEnabled(newVal);
    const existing = (db.getConfigurationLocal?.("tra_vfd_config", { tenantId, branchId }) as any) || {};
    const vfdObj = {
      ...existing,
      enabled: newVal,
      endpoint: String(existing.endpoint || "").trim(),
    };
    db.saveConfigurationLocal?.("tra_vfd_config", vfdObj, { tenantId, branchId });
    const taxSaved = (db.getConfigurationLocal?.("tax_config") as any) || {};
    db.saveConfigurationLocal?.("tax_config", { ...taxSaved, traVfdEnabled: newVal });

    if (tenantId && branchId && isOnline) {
      try {
        await apiFetch('/api/v1/tra-vfd/config', {
          method: 'PUT',
          body: JSON.stringify(vfdObj),
          headers: { 'x-tenant-id': tenantId, 'x-branch-id': branchId, 'x-user-id': user?.id || '' },
        });
        toast.success(
          newVal ? "TRA VFD Fiscalization ON" : "TRA VFD Fiscalization OFF",
          newVal
            ? "Receipts will now be cryptographically signed and queued for TRA verification."
            : "TRA VFD signing disabled. Offline sales will not require fiscal signatures."
        );
        void refreshVfdStatus();
      } catch (err: any) {
        toast.warning("Saved Locally", "Terminal updated local VFD state. Server sync will retry.");
      }
    } else {
      toast.info(
        newVal ? "TRA VFD ON (Offline Mode)" : "TRA VFD OFF (Offline Mode)",
        "Local terminal setting applied. Will synchronize with cloud when reconnected."
      );
    }
  };

  const traVfdVerifiedCount = traVfdStatus?.stateCounts.TRA_VERIFIED ?? 0;
  const traVfdRejectedCount = traVfdStatus?.stateCounts.TRA_REJECTED ?? 0;
  const traVfdQueuedCount = traVfdStatus
    ? (traVfdStatus.stateCounts.LOCAL_FISCAL_PENDING
      + traVfdStatus.stateCounts.SUBMITTING
      + traVfdStatus.stateCounts.TRA_RETRY
      + traVfdStatus.stateCounts.TRA_ACCEPTED)
    : 0;
  const traVfdFiscalizationState = !traVfdStatus
    ? (isOnline ? 'STATE_UNAVAILABLE' : 'OFFLINE')
    : traVfdStatus.status === 'DISABLED'
      ? 'OFF'
      : traVfdQueuedCount > 0
        ? `PENDING (${traVfdQueuedCount})`
        : traVfdRejectedCount > 0
          ? `REJECTED (${traVfdRejectedCount})`
          : traVfdVerifiedCount > 0
            ? `VERIFIED (${traVfdVerifiedCount})`
            : 'NO TRA STATE RECORDED';

  const handleNav = (tab: string) => {
    if (setActiveTab) setActiveTab(tab as any);
    if (onNavigate) onNavigate(tab.toLowerCase());
  };

  const dashboardFreshness = useMemo(() => {
    const serverRevision = authoritativeKpis?.asOfRevision ?? syncStatus.serverRevision;
    const localRevision = syncStatus.localRevision || "0";
    let isBehind = false;

    if (serverRevision && /^\d+$/.test(serverRevision) && /^\d+$/.test(localRevision)) {
      try {
        isBehind = BigInt(localRevision) < BigInt(serverRevision);
      } catch {
        isBehind = false;
      }
    }

    const syncedAt = syncStatus.lastSyncedAt
      ? fmtTime(syncStatus.lastSyncedAt)
      : null;

    return {
      serverRevision: serverRevision || null,
      localRevision,
      isBehind,
      syncedAt,
      syncEpoch: syncStatus.syncEpoch,
    };
  }, [
    authoritativeKpis?.asOfRevision,
    syncStatus.lastSyncedAt,
    syncStatus.localRevision,
    syncStatus.serverRevision,
    syncStatus.syncEpoch,
  ]);

  const refreshAuthoritativeKpis = useCallback(async () => {
    if (!tenantId || !branchId) {
      setAuthoritativeKpis(null);
      setAuthoritativeKpiError(null);
      setIsLoadingAuthoritativeKpis(false);
      return;
    }
    if (!isOnline) {
      // Preserve the last server-authoritative snapshot for offline read-only reporting.
      // It remains explicitly labeled as the last authoritative snapshot.
      setAuthoritativeKpiError(null);
      setIsLoadingAuthoritativeKpis(false);
      return;
    }

    setIsLoadingAuthoritativeKpis(true);
    try {
      const snapshot = await fetchDashboardKpiSnapshot(revenueTimeframe);
      if (snapshot.tenantId !== tenantId || snapshot.branchId !== branchId) {
        throw new Error("Dashboard KPI scope mismatch");
      }
      setAuthoritativeKpis(snapshot);
      syncStatusService.recordAuthoritativeServerRevision(
        { tenantId, branchId },
        snapshot.asOfRevision,
      );
      setAuthoritativeKpiError(null);
    } catch (error: any) {
      setAuthoritativeKpis(null);
      setAuthoritativeKpiError(error?.message || "Authoritative dashboard KPIs unavailable");
    } finally {
      setIsLoadingAuthoritativeKpis(false);
    }
  }, [tenantId, branchId, isOnline, revenueTimeframe]);

  useEffect(() => {
    void refreshAuthoritativeKpis();
    if (!tenantId || !branchId || !isOnline) return;
    const interval = setInterval(() => { void refreshAuthoritativeKpis(); }, 3000);
    return () => clearInterval(interval);
  }, [refreshAuthoritativeKpis, tenantId, branchId, isOnline, revenueTimeframe]);

  // ── Operational States ─────────────────────────────────────────────────────
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [productVariants, setProductVariants] = useState<LocalVariant[]>([]);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [suppliers, setSuppliers] = useState<LocalSupplier[]>([]);
  const [paymentMetricMode, setPaymentMetricMode] = useState<'volume' | 'count'>('volume');
  const [activePaymentIndex, setActivePaymentIndex] = useState<number | null>(null);
  const [topProductsMetric, setTopProductsMetric] = useState<'revenue' | 'units'>('revenue');
  const [selectedOrderForDrawer, setSelectedOrderForDrawer] = useState<LocalOrder | null>(null);
  const [chartActiveMetric, setChartActiveMetric] = useState<'all' | 'revenue' | 'profit' | 'cogs'>('all');
  const [isZReportOpen, setIsZReportOpen] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);
  const [rechartsModule, setRechartsModule] = useState<RechartsModule | null>(null);

  useEffect(() => {
    let active = true;
    void import("recharts").then((module) => {
      if (active) setRechartsModule(module);
    }).catch((error) => {
      console.error("[DashboardPage] Failed to load analytics charts:", error);
    });
    return () => { active = false; };
  }, []);

  const AreaChart = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.AreaChart, props) : <ChartFallback {...props} />, [rechartsModule]);
  const Area = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Area, props) : null, [rechartsModule]);
  const XAxis = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.XAxis, props) : null, [rechartsModule]);
  const YAxis = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.YAxis, props) : null, [rechartsModule]);
  const CartesianGrid = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.CartesianGrid, props) : null, [rechartsModule]);
  const Tooltip = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Tooltip, props) : null, [rechartsModule]);
  const ResponsiveContainer = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.ResponsiveContainer, props) : <ChartFallback {...props} />, [rechartsModule]);
  const Legend = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Legend, props) : null, [rechartsModule]);
  const Cell = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Cell, props) : null, [rechartsModule]);
  const PieChart = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.PieChart, props) : <ChartFallback {...props} />, [rechartsModule]);
  const Pie = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Pie, props) : null, [rechartsModule]);
  const BarChart = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.BarChart, props) : <ChartFallback {...props} />, [rechartsModule]);
  const Bar = useCallback((props: any) => rechartsModule ? React.createElement(rechartsModule.Bar, props) : null, [rechartsModule]);

  // 1. Ensure module loading state is tracked clearly
  const isChartEngineReady = !!rechartsModule && typeof AreaChart === "function";

  // Local operational records are accepted only when they carry the
  // authenticated tenant + exact branch scope. Missing/"all"/HQ scopes are not accepted.
  const hasStrictScope = useCallback((record: any) => {
    const recordTenantId = record?.tenantId ?? record?.tenant_id;
    const recordBranchId = record?.branchId ?? record?.branch_id;
    return Boolean(
      tenantId &&
      branchId &&
      recordTenantId === tenantId &&
      recordBranchId === branchId
    );
  }, [tenantId, branchId]);

  // ── Load Operational Data (IndexedDB + API) ────────────────────────────────
  // Online financial KPIs remain PostgreSQL-authoritative; IndexedDB is only for
  // operational/offline continuity and must never override an authoritative KPI snapshot.
  const loadData = useCallback(async () => {
    try {
      await db.ready;

      // 1. Products
      const localProds: LocalProduct[] = [];
      if (db.products) {
        for (const p of db.products.values()) {
          const pAny = p as any;
          if (pAny.deletedAt || pAny.deleted_at || pAny.status === 'Inactive') continue;
          const pMod = (pAny.module || 'Retail').toLowerCase();
          const aMod = (activeModule || 'Retail').toLowerCase();
          const matchMod = pMod === aMod || pMod === 'all' || !pAny.module;
          const pBranch = pAny.branch_id || pAny.branchId;
          const pTenant = pAny.tenant_id || pAny.tenantId;
          const matchScope = hasStrictScope({ tenantId: pTenant, branchId: pBranch });
          if (matchMod && matchScope) {
            const effectiveStock = Number(pAny.availableStock ?? pAny.totalStock ?? pAny.stock ?? pAny.quantity ?? 0);
            localProds.push({
              id: p.id,
              name: p.name,
              price: Number(pAny.sellingPrice || pAny.price || 0),
              buyingPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
              stock: effectiveStock,
              reorderLevel: Number(pAny.reorderLevel ?? 10),
              category: pAny.category || 'General',
              module: pAny.module,
              hasVariants: Boolean(pAny.hasVariants || pAny.variants?.length),
              expiryDate: pAny.expiryDate,
              status: pAny.status,
            });
          }
        }
      }

      // 2. Variants
      const localVariants: LocalVariant[] = [];
      if (db.productVariants) {
        for (const v of db.productVariants.values()) {
          const vAny = v as any;
          if (vAny.status !== 'Inactive' && !vAny.deletedAt && !vAny.deleted_at && hasStrictScope(vAny)) {
            localVariants.push({
              id: v.id,
              productId: v.productId,
              name: v.name,
              price: Number(v.price || 0),
              buyingPrice: vAny.buyingPrice !== undefined ? Number(vAny.buyingPrice) : undefined,
              stock: Number(vAny.stock ?? 0),
              reorderLevel: Number(vAny.reorderLevel ?? 5),
              status: vAny.status,
            });
          }
        }
      }

      // 3. Customers
      const typeMap: Record<string, string> = {
        Retail: 'Customer', Restaurant: 'Customer', Pharmacy: 'Patient',
        SACCO: 'Member', Law: 'Client', RealEstate: 'Tenant', School: 'Student', Hotel: 'Guest',
      };
      const targetType = typeMap[activeModule] || 'Customer';
      const localCusts: LocalCustomer[] = [];
      if (db.customers) {
        for (const c of db.customers.values()) {
          const cAny = c as any;
          const matchType = !cAny.type || cAny.type.toLowerCase() === targetType.toLowerCase() || cAny.type.toLowerCase() === 'customer';
          const cTenant = cAny.tenant_id || cAny.tenantId;
          const cBranch = cAny.branch_id || cAny.branchId;
          const matchScope = hasStrictScope({ tenantId: cTenant, branchId: cBranch });
          if (matchScope && matchType) {
            localCusts.push({
              id: c.id,
              name: c.name,
              type: cAny.type,
              branch_id: cBranch,
              outstandingBalance: Number(cAny.outstandingBalance || cAny.currentBalance || cAny.debt || 0),
              created_at: cAny.created_at ? new Date(cAny.created_at).getTime() : undefined,
            });
          }
        }
      }

      // Pending local customer mutations may support offline UI, but only inside exact scope.
      if (db.syncOutbox) {
        for (const item of db.syncOutbox.values()) {
          if (item.entityType === 'Customer' && outboxMatchesScope(item, tenantId, branchId)) {
            const p = (item.payload || {}) as any;
            const pId = item.entityId || p.id;
            const existingIdx = localCusts.findIndex(c => c.id === pId);
            const outboxCust: LocalCustomer = {
              id: pId || item.id,
              name: p.name || 'Customer',
              type: p.type,
              branch_id: p.branch_id || p.branchId,
              outstandingBalance: Number(p.outstandingBalance || p.currentBalance || p.debt || 0),
              created_at: item.clientCreatedAt ? new Date(item.clientCreatedAt).getTime() : undefined,
            };
            if (existingIdx >= 0) {
              localCusts[existingIdx] = outboxCust;
            } else {
              localCusts.push(outboxCust);
            }
          }
        }
      }

      // 4. Suppliers
      const localSupps: LocalSupplier[] = [];
      if (db.suppliers) {
        for (const s of db.suppliers.values()) {
          const sAny = s as any;
          if (hasStrictScope(sAny)) {
            localSupps.push({ id: s.id, name: s.name });
          }
        }
      }

      // 5. Orders / Sales (API + Local db.sales + db.syncOutbox)
      let parsedOrders: LocalOrder[] = [];
      try {
        const res = await apiFetch<{ success: boolean; data: any[] }>('/api/v1/pos/sales');
        if (res.success && Array.isArray(res.data)) {
          parsedOrders = res.data.filter((s: any) => hasStrictScope(s)).map((s: any) => ({
            id: s.id || s.saleNumber || s.receiptNumber || `ord_${Date.now()}`,
            timestamp: new Date(s.createdAt || s.soldAt || s.timestamp || Date.now()).getTime(),
            total: Number(s.totalAmount || s.grandTotal || s.total || 0),
            status: s.status || 'Completed',
            paymentMethod: s.payments?.length > 1 ? 'Split' : (s.paymentMethod || s.method || s.payments?.[0]?.paymentMethod || 'Cash'),
            syncStatus: 'Synced',
            customer: s.customer?.name || s.customerName || s.customer?.displayName || 'Walk-In Customer',
            cashierName: s.cashierName || s.cashier || s.user || s.soldByName || 'Cashier',
            module: s.module,
            branch_id: s.branchId || s.branch_id,
            items: (Array.isArray(s.items) ? s.items : Array.isArray(s.cart) ? s.cart : Array.isArray(s.lines) ? s.lines : []).map((it: any) => ({
              productId: it.productId || it.product?.id || it.id || 'prod_unknown',
              variantId: it.variantId,
              name: it.name || it.productName || it.product?.name || 'Product',
              price: Number(it.price || it.product?.price || it.unitPrice || 0),
              quantity: Number(it.quantity || it.qty || 1),
            })),
          }));
        }
      } catch {
        // Fallback to local store
      }

      // Merge local sales from db.sales (IndexedDB local store)
      if (!isOnline && db.sales) {
        for (const s of db.sales.values()) {
          const sAny = s as any;
          if (!hasStrictScope(sAny)) continue;
          const sId = sAny.id || sAny.saleNumber;
          if (!sId) continue;
          const existingIdx = parsedOrders.findIndex(o => o.id === sId);
          const rawItems = Array.isArray(sAny.items) ? sAny.items : Array.isArray(sAny.cart) ? sAny.cart : Array.isArray(sAny.lines) ? sAny.lines : [];
          const localOrder: LocalOrder = {
            id: sId,
            saleNumber: sAny.saleNumber || sAny.receiptNumber || sId,
            customer: sAny.customer || sAny.customerName || 'Walk-In Customer',
            cashierName: sAny.cashierName || sAny.cashier || sAny.user || sAny.servedBy || 'Cashier',
            timestamp: new Date(sAny.soldAt || sAny.createdAt || sAny.timestamp || Date.now()).getTime(),
            total: Number(sAny.grandTotal || sAny.totalAmount || sAny.total || 0),
            status: sAny.status || 'Completed',
            paymentMethod: sAny.paymentMethod || sAny.method || 'Cash',
            syncStatus: sAny.syncStatus || 'Synced',
            cashReceived: Number(sAny.cashReceived || sAny.paidAmount || sAny.total || 0),
            changeDue: Number(sAny.changeDue || sAny.changeAmount || 0),
            module: sAny.module,
            branch_id: sAny.branchId || sAny.branch_id,
            items: rawItems.map((it: any) => ({
              productId: it.productId || it.product?.id || it.id || 'prod_unknown',
              variantId: it.variantId,
              name: it.name || it.productName || it.product?.name || 'Product',
              price: Number(it.price || it.product?.price || it.unitPrice || 0),
              quantity: Number(it.quantity || it.qty || 1),
            })),
          };
          if (existingIdx >= 0) {
            parsedOrders[existingIdx] = localOrder;
          } else {
            parsedOrders.unshift(localOrder);
          }
        }
      }

      // Pending sales are operational-only and must remain exact-scope.
      // They are never included in authoritative online KPI calculations.
      if (!isOnline && db.syncOutbox) {
        for (const item of db.syncOutbox.values()) {
          if (item.entityType === 'Sale' && outboxMatchesScope(item, tenantId, branchId)) {
            const p = (item.payload || {}) as any;
            const pId = item.entityId || p.id || p.saleNumber;
            const existingIdx = parsedOrders.findIndex(o => o.id === pId);
            const isSynced = item.status === 'SYNCED' || (existingIdx >= 0 && parsedOrders[existingIdx].syncStatus === 'Synced') || p.syncStatus === 'Synced';
            const rawItems = Array.isArray(p.items) ? p.items : Array.isArray(p.cart) ? p.cart : [];
            const outboxOrder: LocalOrder = {
              id: pId || item.id,
              saleNumber: p.saleNumber || p.receiptNumber || pId || item.id,
              customer: p.customer || p.customerName || 'Walk-In Customer',
              cashierName: p.cashierName || p.cashier || p.user || 'Cashier',
              timestamp: new Date(p.soldAt || p.createdAt || item.clientCreatedAt).getTime(),
              total: Number(p.grandTotal || p.totalAmount || p.total || 0),
              status: p.status || 'Completed',
              paymentMethod: p.paymentMethod || p.method || 'Cash',
              syncStatus: isSynced ? 'Synced' : item.status === 'FAILED' ? 'Failed' : 'Pending',
              cashReceived: Number(p.cashReceived || p.paidAmount || p.total || 0),
              changeDue: Number(p.changeDue || p.changeAmount || 0),
              module: p.module,
              branch_id: p.branchId || p.branch_id,
              items: rawItems.map((it: any) => ({
                productId: it.productId || it.product?.id || it.id || 'prod_unknown',
                variantId: it.variantId,
                name: it.name || it.product?.name || 'Product',
                price: Number(it.price || it.product?.price || it.unitPrice || 0),
                quantity: Number(it.quantity || it.qty || 1),
              })),
            };
            if (existingIdx >= 0) {
              parsedOrders[existingIdx] = outboxOrder;
            } else {
              parsedOrders.unshift(outboxOrder);
            }
          }
        }
      }

      setProducts(localProds);
      setProductVariants(localVariants);
      setCustomers(localCusts);
      setSuppliers(localSupps);
      setOrders(parsedOrders.sort((a, b) => b.timestamp - a.timestamp));
    } catch {
      // Graceful fallback
    }
  }, [db, activeModule, branchId, tenantId, hasStrictScope, isOnline]);

  useEffect(() => {
    void loadData();
    const handleRefresh = () => { void loadData(); };
    window.addEventListener(DATA_CHANGED_EVENT, handleRefresh);
    window.addEventListener('focus', handleRefresh);
    const interval = setInterval(handleRefresh, 3000);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleRefresh);
      window.removeEventListener('focus', handleRefresh);
      clearInterval(interval);
    };
  }, [loadData]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const isCleanTenant = products.length === 0 && orders.length === 0 && customers.length === 0 && suppliers.length === 0;

  // Stable product cost lookup helper for real revenue and profit calculations
  const costLookup = useMemo(() => {
    const prodMap = new Map<string, number>();
    const varMap = new Map<string, number>();
    
    products.forEach(p => {
      prodMap.set(p.id, p.buyingPrice || 0);
    });
    productVariants.forEach(v => {
      const parentCost = prodMap.get(v.productId) || 0;
      varMap.set(v.id, v.buyingPrice !== undefined ? v.buyingPrice : parentCost);
    });

    return {
      getProductCost: (productId: string) => prodMap.get(productId) || 0,
      getVariantCost: (variantId: string | undefined, productId: string) => 
        (variantId ? varMap.get(variantId) : undefined) ?? prodMap.get(productId) ?? 0,
      getItemCOGS: (item: { productId: string; variantId?: string; price: number; quantity: number }) => {
        const unitCost = (item.variantId ? varMap.get(item.variantId) : undefined) ?? prodMap.get(item.productId) ?? 0;
        // Never infer cost from selling price. Missing cost means the gross-profit
        // calculation is not authoritative; the server KPI remains the online authority.
        return unitCost > 0 ? unitCost * item.quantity : 0;
      }
    };
  }, [products, productVariants]);

  // ── KPI Stats ─────────────────────────────────────────────────────────────

  const validOrders = useMemo(() => {
    return orders.filter(o => o.status !== 'Cancelled' && o.status !== 'Voided' && o.status !== 'Refunded');
  }, [orders]);

  const stats = useMemo(() => {
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTs = todayStart.getTime();

    // Yesterday window
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayTs = yesterdayStart.getTime();

    const todayOrders     = validOrders.filter(o => o.timestamp >= todayTs);
    const yesterdayOrders = validOrders.filter(o => o.timestamp >= yesterdayTs && o.timestamp < todayTs);

    const totalSales     = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.total, 0);
    const allSales       = validOrders.reduce((sum, o) => sum + o.total, 0);

    // Real % change vs yesterday — null when no baseline exists
    const salesTrend: 'up' | 'down' | null =
      yesterdaySales === 0 ? (totalSales > 0 ? 'up' : null)
      : totalSales >= yesterdaySales ? 'up' : 'down';

    const salesTrendPct: string | undefined = (() => {
      if (yesterdaySales === 0) return totalSales > 0 ? 'New sales today' : undefined;
      const pct = Math.abs(((totalSales - yesterdaySales) / yesterdaySales) * 100).toFixed(1);
      return `${salesTrend === 'up' ? '+' : '−'}${pct}% vs yesterday`;
    })();

    const completedOrders = validOrders.filter(o => o.status === 'Completed').length;
    const pendingOrders   = validOrders.filter(o => o.status === 'Pending').length;

    // Restaurant: pending orders = kitchen queue; unique customers today = active sittings proxy
    const todayPendingOrders = todayOrders.filter(o => o.status === 'Pending').length;
    const todayUniqueCustomers = new Set(todayOrders.map(o => (o as any).customer_id || (o as any).customerId).filter(Boolean)).size;
    // Active tables proxy: count today's distinct table/order sessions (pending + recently completed)
    const activeTables = todayOrders.filter(o => o.status === 'Pending' || (now - o.timestamp) < 2 * 60 * 60 * 1000).length;

    const validProductIds = new Set(products.map(p => p.id));
    const variantCountsByProduct = new Map<string, number>();
    productVariants.forEach(v => {
      if (validProductIds.has(v.productId)) {
        variantCountsByProduct.set(v.productId, (variantCountsByProduct.get(v.productId) || 0) + 1);
      }
    });
    const isMultiVariantProduct = (p: { id: string; hasVariants?: boolean }) => {
      return Boolean(p.hasVariants || (variantCountsByProduct.get(p.id) || 0) > 1);
    };
    const variantProductIds = new Set(products.filter(p => isMultiVariantProduct(p)).map(p => p.id));
    const activeProductVariants = products.length === 0 ? [] : productVariants.filter(v => variantProductIds.has(v.productId));

    const inventoryVal = products.reduce((sum, p) => {
      if (variantProductIds.has(p.id)) {
        const pVariants = activeProductVariants.filter(v => v.productId === p.id);
        if (pVariants.length > 0) {
          return sum + pVariants.reduce((vSum, v) => vSum + ((v.price || p.price || 0) * (v.stock || 0)), 0);
        }
      }
      return sum + ((p.price || 0) * (p.stock || 0));
    }, 0);

    const simpleLowStock  = products.filter(p => !variantProductIds.has(p.id) && p.stock > 0 && p.stock <= (p.reorderLevel ?? 10)).length;
    const variantLowStock = activeProductVariants.filter(v => v.stock > 0 && v.stock <= (v.reorderLevel ?? 5)).length;
    const lowStockCount   = products.length === 0 ? 0 : (simpleLowStock + variantLowStock);

    const outOfStockCount = products.length === 0 ? 0 : (
      products.filter(p => !variantProductIds.has(p.id) && p.stock <= 0).length +
      activeProductVariants.filter(v => v.stock <= 0).length
    );

    let todayCOGS = 0;
    todayOrders.forEach(o => {
      o.items.forEach(item => {
        todayCOGS += costLookup.getItemCOGS(item);
      });
    });
    const todayGrossProfit = Math.max(0, totalSales - todayCOGS);
    const todayMargin = totalSales > 0 ? ((todayGrossProfit / totalSales) * 100).toFixed(1) : '0.0';

    const nearExpiryCount = products.length === 0 ? 0 : products.filter(p => {
      if (!p.expiryDate) return false;
      return (new Date(p.expiryDate).getTime() - now) < 90 * 24 * 60 * 60 * 1000;
    }).length;

    const totalLoans    = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const unsyncedCount = syncStatus.pendingOutboxCount + syncStatus.failedOutboxCount;
    // Permanently-abandoned items (exceeded retry cap) shown separately as conflicts.
    const conflictCount = syncStatus.abandonedOutboxCount ?? 0;

    // SACCO: member growth vs last month
    const lastMonthStart = new Date(now); lastMonthStart.setMonth(lastMonthStart.getMonth() - 1); lastMonthStart.setDate(1); lastMonthStart.setHours(0,0,0,0);
    const thisMonthStart = new Date(now); thisMonthStart.setDate(1); thisMonthStart.setHours(0,0,0,0);
    const newCustomersThisMonth = customers.filter(c => (c.created_at || 0) >= thisMonthStart.getTime()).length;
    const newCustomersLastMonth = customers.filter(c => (c.created_at || 0) >= lastMonthStart.getTime() && (c.created_at || 0) < thisMonthStart.getTime()).length;
    const customerTrend: 'up' | 'down' | null = newCustomersLastMonth === 0
      ? (newCustomersThisMonth > 0 ? 'up' : null)
      : newCustomersThisMonth >= newCustomersLastMonth ? 'up' : 'down';
    const customerTrendPct = newCustomersLastMonth === 0
      ? (newCustomersThisMonth > 0 ? `+${newCustomersThisMonth} this month` : undefined)
      : `${customerTrend === 'up' ? '+' : '−'}${Math.abs(((newCustomersThisMonth - newCustomersLastMonth) / newCustomersLastMonth) * 100).toFixed(0)}% vs last month`;

    const topProduct = (() => {
      const map: Record<string, { name: string; qty: number; rev: number }> = {};
      for (const o of validOrders) {
        for (const item of o.items) {
          if (!map[item.productId]) map[item.productId] = { name: item.name, qty: 0, rev: 0 };
          map[item.productId].qty += item.quantity;
          map[item.productId].rev += item.price * item.quantity;
        }
      }
      return Object.values(map).sort((a, b) => b.rev - a.rev)[0] || null;
    })();

    // Returns, Voids & Discounts calculation
    const allTodayOrders = orders.filter(o => o.timestamp >= todayTs);
    const todayRefunds = allTodayOrders
      .filter(o => o.status === 'Refunded' || o.status === 'Voided' || o.status === 'Cancelled')
      .reduce((sum, o) => sum + o.total, 0);
    const todayRefundCount = allTodayOrders.filter(o => o.status === 'Refunded' || o.status === 'Voided' || o.status === 'Cancelled').length;

    let todayDiscounts = 0;
    allTodayOrders.forEach(o => {
      const d = (o as any).discount || (o as any).discountTotal || 0;
      todayDiscounts += Number(d);
    });

    const grossSales = totalSales + todayRefunds + todayDiscounts;
    const netSales = totalSales;
    const todayAOV = todayOrders.length > 0 ? Math.round(netSales / todayOrders.length) : 0;

    return {
      totalSales, yesterdaySales, allSales,
      grossSales, todayRefunds, todayRefundCount, todayDiscounts, netSales, todayAOV,
      salesTrend, salesTrendPct,
      completedOrders, pendingOrders,
      todayPendingOrders, activeTables, todayUniqueCustomers,
      inventoryVal, lowStockCount, outOfStockCount,
      activeVariantCount: activeProductVariants.length,
      todayCOGS, todayGrossProfit, todayMargin,
      nearExpiryCount, totalLoans,
      customerCount: customers.length, supplierCount: suppliers.length,
      customerTrend, customerTrendPct,
      unsyncedCount, conflictCount, topProduct,
      todayOrderCount: todayOrders.length,
    };
  }, [products, productVariants, validOrders, customers, suppliers, costLookup, syncStatus.pendingOutboxCount, syncStatus.failedOutboxCount, syncStatus.abandonedOutboxCount]);

  // ── Chart Data ─────────────────────────────────────────────────────────────

  const revenueAnalytics = useMemo(() => {
    const analytics = authoritativeKpis?.analytics;
    return analytics ?? {
      chartPoints: [],
      totalRevenue: 0,
      totalCOGS: 0,
      totalProfit: 0,
      marginPct: "0.0",
      revenueDeltaPct: null,
      profitDeltaPct: null,
      priorTotalRevenue: 0,
      peakHour: null,
    };
  }, [authoritativeKpis]);

  const paymentChannelSummary = useMemo(() => {
    const channels = authoritativeKpis?.analytics?.paymentChannels ?? [];
    const channelConfig: Record<string, { color: string; icon: any; badgeBg: string; textColor: string }> = {
      CASH: { color: "#3b82f6", icon: Banknote, badgeBg: "rgba(59,130,246,0.12)", textColor: "#3b82f6" },
      CARD: { color: "#f59e0b", icon: CreditCard, badgeBg: "rgba(245,158,11,0.12)", textColor: "#f59e0b" },
      BANK: { color: "#6366f1", icon: Building2, badgeBg: "rgba(99,102,241,0.12)", textColor: "#6366f1" },
      MOBILE_MONEY: { color: "#10b981", icon: Smartphone, badgeBg: "rgba(16,185,129,0.12)", textColor: "#10b981" },
      CREDIT: { color: "#8b5cf6", icon: Wallet, badgeBg: "rgba(139,92,246,0.12)", textColor: "#8b5cf6" },
      OTHER: { color: "#64748b", icon: Wallet, badgeBg: "rgba(100,116,139,0.12)", textColor: "#64748b" },
    };
    const items = channels.map((item, idx) => {
      const key = String(item.name || "OTHER").toUpperCase();
      const cfg = channelConfig[key] || {
        color: ["#14b8a6", "#f43f5e", "#a855f7", "#06b6d4"][idx % 4],
        icon: Wallet, badgeBg: "rgba(100,116,139,0.12)", textColor: "#64748b",
      };
      const rawMetric = paymentMetricMode === "volume" ? item.volume : item.count;
      return {
        ...item,
        paymentCount: item.paymentCount ?? item.count,
        orderCount: item.orderCount ?? item.count,
        value: Math.max(rawMetric, 0),
        rawMetric,
        color: cfg.color, icon: cfg.icon, badgeBg: cfg.badgeBg, textColor: cfg.textColor,
      };
    });
    items.sort((a, b) => b.rawMetric - a.rawMetric);
    const analytics = authoritativeKpis?.analytics;
    return {
      items,
      totalVolume: analytics?.paymentTotalVolume ?? 0,
      totalCount: analytics?.paymentTotalCount ?? 0,
      totalOrderCount: analytics?.paymentTotalOrderCount ?? 0,
      overallAov: analytics?.paymentOverallAov ?? 0,
    };
  }, [authoritativeKpis, paymentMetricMode]);

  const activePaymentChannel =
    activePaymentIndex !== null && paymentChannelSummary.items[activePaymentIndex]
      ? paymentChannelSummary.items[activePaymentIndex]
      : null;

  // Top products ranked leaderboard data with real-time stock & category awareness
  const topProductsAnalytics = useMemo(() => {
    const rows = authoritativeKpis?.analytics?.topProducts ?? [];
    const sortedRows = [...rows].sort((a, b) => topProductsMetric === "revenue"
      ? (b.revenue - a.revenue) || (b.units - a.units)
      : (b.units - a.units) || (b.revenue - a.revenue));
    const maxRevenue = Math.max(...sortedRows.map(p => p.revenue), 1);
    const maxUnits = Math.max(...sortedRows.map(p => p.units), 1);
    return {
      items: sortedRows.slice(0, 5).map((p, index) => ({
        ...p,
        rank: index + 1,
        progressPct: topProductsMetric === "revenue"
          ? Math.round((p.revenue / maxRevenue) * 100)
          : Math.round((p.units / maxUnits) * 100),
      })),
      totalTracked: authoritativeKpis?.analytics?.topProductsTotalTracked ?? rows.length,
    };
  }, [authoritativeKpis, topProductsMetric]);

  // ── Register Till & Shift Reconciliation ──────────────────────────────────
  const activeShiftSession = activeCashSession;

  const tillReconciliation = useMemo(() => {
    const openingFloat = Number(activeShiftSession?.openingCash || 0);
    const cashSalesToday = Number(activeShiftSession?.cashSalesTotal || 0);
    const cashIn = Number(activeShiftSession?.cashInTotal || 0);
    const cashOut = Number(activeShiftSession?.cashOutTotal || 0);
    const safeDrops = Number(activeShiftSession?.safeDropTotal || 0);
    const totalPayouts = cashOut + safeDrops;
    const expectedCash = Number(activeShiftSession?.expectedCash || (openingFloat + cashSalesToday + cashIn - Number(activeShiftSession?.cashRefundsTotal || 0) - Number(activeShiftSession?.cashExpensesTotal || 0) - totalPayouts));
    const cashTransactionsCount = 0;
    const isShiftOpen = activeShiftSession?.status === "OPEN";

    return {
      isShiftOpen,
      openingFloat,
      cashSalesToday,
      cashTransactionsCount,
      cashIn,
      totalPayouts,
      expectedCash,
      shiftNumber: activeShiftSession?.shiftNumber || 'Current Shift',
    };
  }, [activeShiftSession, validOrders]);

  // ── 1-Click Multi-Tab Executive Financial Audit Report Exporter (.xlsx) ───
  const exportDashboardSummaryCSV = useCallback(async () => {
    try {
      const XLSX = await import("xlsx");
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toLocaleTimeString();

      const wb = XLSX.utils.book_new();

      // Universal number formatting engine for professional accounting & Excel presentation
      const formatWorksheetNumbers = (ws: import("xlsx").WorkSheet, currencyCols?: number[], countCols?: number[]) => {
        if (!ws['!ref']) return;
        const range = XLSX.utils.decode_range(ws['!ref']);
        // 1. Column-specific overrides for data rows (row >= 1)
        if (currencyCols) {
          currencyCols.forEach(col => {
            for (let r = 1; r <= range.e.r; r++) {
              const cell = ws[XLSX.utils.encode_cell({ c: col, r })];
              if (cell && cell.t === 'n') cell.z = '#,##0.00';
            }
          });
        }
        if (countCols) {
          countCols.forEach(col => {
            for (let r = 1; r <= range.e.r; r++) {
              const cell = ws[XLSX.utils.encode_cell({ c: col, r })];
              if (cell && cell.t === 'n') cell.z = '#,##0';
            }
          });
        }
        // 2. Global pass: ensure EVERY numeric cell in the sheet has thousands separators
        for (let r = range.s.r; r <= range.e.r; r++) {
          for (let c = range.s.c; c <= range.e.c; c++) {
            const addr = XLSX.utils.encode_cell({ c, r });
            const cell = ws[addr];
            if (cell && cell.t === 'n' && !cell.z) {
              cell.z = Number.isInteger(cell.v) ? '#,##0' : '#,##0.00';
            }
          }
        }
      };

      // Tab 0: "KwakoPos v2 Executive Financial" (Executive Cover & Verification)
      const ws0Data: any[][] = [
        ['KwakoPos v2 Executive Financial Audit Report', ''],
        ['Generated Timestamp', `${dateStr} ${timeStr}`],
        ['Store / Tenant', currentTenantName || 'KwakoPos Store'],
        ['Operating Branch', currentBranchName || 'Main Branch'],
        ['Auditing Operator', `${role} (${user?.name || 'Authorized Staff'})`],
        ['Business Module', activeModule],
        ['Fiscalization State', traVfdFiscalizationState],
        ['', ''],
        ['EXECUTIVE ACCRUAL SUMMARY', 'VALUE (TSH) / COUNT'],
        ['Gross Sales Turnover (Today)', Number(authoritativeKpis?.grossSalesToday ?? stats.grossSales ?? 0)],
        ['Discounts Allowed (Today)', Number(authoritativeKpis?.discountsToday ?? stats.todayDiscounts ?? 0)],
        ['Customer Returns / Refunds', Number(authoritativeKpis?.refundsToday ?? stats.todayRefunds ?? 0)],
        ['GAAP Net Sales Turnover', Number(authoritativeKpis?.netSalesToday ?? stats.netSales ?? 0)],
        ['Real Gross Profit Earned', Number(authoritativeKpis?.grossProfit ?? stats.todayGrossProfit ?? 0)],
        ['Cost of Goods Sold (COGS)', Number(authoritativeKpis?.cogsToday ?? stats.todayCOGS ?? 0)],
        ['Blended Gross Margin %', `${(authoritativeKpis?.grossMarginToday ?? Number(stats.todayMargin ?? 0)).toFixed(1)}%`],
        ['Average Order Value (AOV)', Number(authoritativeKpis?.aov ?? stats.todayAOV ?? 0)],
        ['Calculated Cash in Drawer', Number(tillReconciliation.expectedCash || 0)],
        ['Total Completed Orders', Number(authoritativeKpis?.completedOrders ?? stats.completedOrders ?? 0)],
        ['Total Active Product SKUs', Number(products.length || 0)],
        ['Outstanding Customer Debt', Number(authoritativeKpis?.customerDebts ?? stats.totalLoans ?? 0)],
        ['Pending Offline Outbox Mutations', Number(syncStatus.pendingOutboxCount + syncStatus.failedOutboxCount)],
      ];
      const ws0 = XLSX.utils.aoa_to_sheet(ws0Data);
      ws0['!cols'] = [{ wch: 35 }, { wch: 45 }];
      // Apply exact thousands formatting: Currency rows B10..B18 get #,##0.00, count rows B19..B22 get #,##0
      ['B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B17', 'B18', 'B21'].forEach(ref => {
        if (ws0[ref] && ws0[ref].t === 'n') ws0[ref].z = '#,##0.00';
      });
      ['B19', 'B20', 'B22'].forEach(ref => {
        if (ws0[ref] && ws0[ref].t === 'n') ws0[ref].z = '#,##0';
      });
      formatWorksheetNumbers(ws0);
      XLSX.utils.book_append_sheet(wb, ws0, 'KwakoPos v2 Executive Financial');

      // Tab 1: "1. EXECUTIVE FINANCIAL OVERVIEW"
      const ws1Data: any[][] = [
        ['Financial Indicator', 'Value (Tsh / Metric)', 'Audit Category', 'Notes & Policy Explanation'],
        ['Gross Sales (Today)', Number(authoritativeKpis?.grossSalesToday ?? stats.grossSales ?? 0), 'Revenue', 'Total gross transactions before promotional deductions'],
        ['Discounts Allowed (Today)', Number(authoritativeKpis?.discountsToday ?? stats.todayDiscounts ?? 0), 'Deduction', 'All promotional, line-item & bill-level discounts'],
        ['Refunds & Returns (Today)', Number(authoritativeKpis?.refundsToday ?? stats.todayRefunds ?? 0), 'Deduction', `${stats.todayRefundCount} returned / voided customer orders`],
        ['Net Sales Turnover (Today)', Number(authoritativeKpis?.netSalesToday ?? stats.netSales ?? 0), 'GAAP Revenue', 'Gross Sales − Discounts − Refunds'],
        ['Real Gross Profit (Today)', Number(authoritativeKpis?.grossProfit ?? stats.todayGrossProfit ?? 0), 'Gross Margin', 'Net Sales − Actual Cost of Goods Sold'],
        ['Cost of Goods Sold (COGS)', Number(authoritativeKpis?.cogsToday ?? stats.todayCOGS ?? 0), 'Direct Cost', 'Real inventory acquisition / purchase cost'],
        ['Gross Margin %', `${(authoritativeKpis?.grossMarginToday ?? Number(stats.todayMargin ?? 0)).toFixed(1)}%`, 'Profitability', 'Gross Profit / Net Sales'],
        ['Completed Orders Count', Number(authoritativeKpis?.completedOrders ?? stats.completedOrders ?? 0), 'Operations', 'Successful completed checkout sales receipts'],
        ['Average Order Value (AOV)', Number(authoritativeKpis?.aov ?? stats.todayAOV ?? 0), 'Performance', 'Net Sales / Completed Orders'],
        ['Total Inventory Valuation', Number(authoritativeKpis?.inventoryValue ?? stats.inventoryVal ?? 0), 'Balance Sheet', 'Total valuation of on-hand inventory at buying price'],
        ['Total Active SKUs', Number(products.length || 0), 'Catalog', 'Distinct active product master items in catalog'],
        ['Low Stock Alert SKUs', Number(authoritativeKpis?.lowStockCount ?? stats.lowStockCount ?? 0), 'Supply Chain', 'Items at or below minimum reorder threshold'],
        ['Out of Stock SKUs', Number(authoritativeKpis?.outOfStockCount ?? stats.outOfStockCount ?? 0), 'Supply Chain', 'Items with 0 available units on shelf'],
        ['Customer Receivables / Debt', Number(authoritativeKpis?.customerDebts ?? stats.totalLoans ?? 0), 'Receivables', 'Total outstanding credit balance owed by customers'],
        ['Pending Cloud Sync Mutations', Number(syncStatus.pendingOutboxCount + syncStatus.failedOutboxCount), 'Integrity', 'Mutations buffered in local IndexedDB sync queue'],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
      ws1['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 18 }, { wch: 46 }];
      ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11', 'B15'].forEach(ref => {
        if (ws1[ref] && ws1[ref].t === 'n') ws1[ref].z = '#,##0.00';
      });
      ['B9', 'B12', 'B13', 'B14', 'B16'].forEach(ref => {
        if (ws1[ref] && ws1[ref].t === 'n') ws1[ref].z = '#,##0';
      });
      formatWorksheetNumbers(ws1);
      XLSX.utils.book_append_sheet(wb, ws1, '1. EXECUTIVE FINANCIAL OVERVIEW');

      // Tab 2: "2. CASH TILL & DRAWER RECONCILI"
      const ws2Data: any[][] = [
        ['Reconciliation Parameter', 'Value (Tsh / Count)', 'Accounting Flow', 'Operational Description'],
        ['Register Shift Status', tillReconciliation.isShiftOpen ? 'OPEN / IN PROGRESS' : 'CONTINUOUS TILL', 'Control', 'Active cashier shift register state'],
        ['Register Shift Reference', tillReconciliation.shiftNumber, 'Reference', 'Session identifier for active till'],
        ['Opening Cash Float', Number(tillReconciliation.openingFloat || 0), 'Starting Cash', 'Starting cash float placed in drawer'],
        ['Cash Sales Collected Today', Number(tillReconciliation.cashSalesToday || 0), 'Cash In (+)', 'Total cash payments received from customers'],
        ['Cash Transactions Count', Number(tillReconciliation.cashTransactionsCount || 0), 'Volume', 'Number of completed cash sales orders'],
        ['Cash Paid-In (Float Additions)', Number(tillReconciliation.cashIn || 0), 'Cash In (+)', 'Additional cash deposited into drawer during shift'],
        ['Cash Paid-Out / Safe Drops', Number(tillReconciliation.totalPayouts || 0), 'Cash Out (−)', 'Cash payouts, petty cash, or drops to safe'],
        ['Expected Cash in Drawer', Number(tillReconciliation.expectedCash || 0), 'Balance', 'Float + Cash Sales + Paid In − Paid Out'],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
      ws2['!cols'] = [{ wch: 32 }, { wch: 24 }, { wch: 18 }, { wch: 46 }];
      ['B4', 'B5', 'B7', 'B8', 'B9'].forEach(ref => {
        if (ws2[ref] && ws2[ref].t === 'n') ws2[ref].z = '#,##0.00';
      });
      if (ws2['B6'] && ws2['B6'].t === 'n') ws2['B6'].z = '#,##0';
      formatWorksheetNumbers(ws2);
      XLSX.utils.book_append_sheet(wb, ws2, '2. CASH TILL & DRAWER RECONCILI');

      // Tab 3: "3. PAYMENT CHANNELS AUDIT"
      const ws3Data: any[][] = [
        ['Payment Channel / Tender', 'Volume (Tsh)', 'Volume Share %', 'Transaction Count', 'Count Share %', 'AOV (Tsh)', 'Settlement Routing'],
        ...paymentChannelSummary.items.map(c => [
          c.name,
          Number(c.volume || 0),
          `${c.volumeShare}%`,
          Number(c.count || 0),
          `${c.countShare}%`,
          Number(c.aov || 0),
          /cash/i.test(c.name) ? 'Physical Cash Drawer' : /pesa|mobile/i.test(c.name) ? 'Mobile Money Gateway (Instant)' : 'Bank Card Terminal / EDC'
        ])
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);
      ws3['!cols'] = [{ wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 18 }, { wch: 32 }];
      formatWorksheetNumbers(ws3, [1, 5], [3]);
      XLSX.utils.book_append_sheet(wb, ws3, '3. PAYMENT CHANNELS AUDIT');

      // Tab 4: "4. TOP PRODUCTS LEADERBOARD"
      const ws4Data: any[][] = [
        ['Rank', 'Product Name', 'Category', 'Stock On Hand', 'Units Sold (Selected Period)', 'Net Revenue (Tsh)', 'Stock Alert Status'],
        ...topProductsAnalytics.items.map(p => [
          Number(p.rank || 0),
          p.name,
          p.category,
          Number(p.stock || 0),
          Number(p.units || 0),
          Number(p.revenue || 0),
          p.stock <= 0 ? 'OUT OF STOCK' : p.stock <= 5 ? 'LOW STOCK' : 'HEALTHY STOCK'
        ])
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
      ws4['!cols'] = [{ wch: 8 }, { wch: 34 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 22 }];
      formatWorksheetNumbers(ws4, [5], [0, 3, 4]);
      XLSX.utils.book_append_sheet(wb, ws4, '4. TOP PRODUCTS LEADERBOARD');

      // Tab 5: "5. AUDITED RECENT ORDERS"
      const ws5Data: any[][] = [
        ['Order Ref / Receipt', 'Date & Time', 'Customer Name', 'Serving Cashier', 'Items Count', 'Grand Total (Tsh)', 'Payment Channel', 'Sync Status', 'Audit Status'],
        ...orders.slice(0, 50).map(o => [
          o.saleNumber || o.id,
          new Date(o.timestamp).toLocaleString(),
          o.customer || 'Walk-In Customer',
          o.cashierName || 'Cashier',
          Number(o.items.reduce((s, i) => s + i.quantity, 0)),
          Number(o.total || 0),
          o.paymentMethod || 'Cash',
          o.syncStatus || 'Synced',
          o.status || 'Completed'
        ])
      ];
      const ws5 = XLSX.utils.aoa_to_sheet(ws5Data);
      ws5['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 14 }, { wch: 14 }];
      formatWorksheetNumbers(ws5, [5], [4]);
      XLSX.utils.book_append_sheet(wb, ws5, '5. AUDITED RECENT ORDERS');

      // Trigger multi-tab Excel Workbook download (.xlsx)
      XLSX.writeFile(wb, `KwakoPos_Audit_Summary_${dateStr}.xlsx`);
    } catch (err) {
      console.error('Failed to export multi-tab dashboard workbook:', err);
    }
  }, [currentBranchName, currentTenantName, role, activeModule, stats, tillReconciliation, paymentChannelSummary, topProductsAnalytics, products, orders, isOnline, user]);

  // ── Onboarding ─────────────────────────────────────────────────────────────

  const renderOnboarding = () => (
    <div className="bg-white dark:bg-darkbg-card rounded-2xl border border-slate-200 dark:border-darkbg-border p-8 shadow-sm">
      <div className="max-w-2xl mx-auto text-center py-4">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h3 className="text-xl font-black text-slate-800 dark:text-white">Welcome to KwakoPos! 🎉</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          Your clean workspace is ready. Follow these quick steps to set up your business and start taking sales.
        </p>
        <div className="grid gap-4 mt-8 text-left sm:grid-cols-2">
          {[
            { step: '01', title: 'Add Products', desc: 'Define your inventory items, categories & attributes.', label: 'Go to Inventory', tab: 'Inventory', Icon: Package, gradient: 'from-blue-500 to-cyan-500' },
            { step: '02', title: 'Register Suppliers', desc: 'Configure suppliers and default warehouse settings.', label: 'Go to Purchasing', tab: 'Purchasing', Icon: Truck, gradient: 'from-amber-500 to-orange-500' },
            { step: '03', title: 'Add Customers', desc: 'Register customers for CRM tracking and credit billing.', label: 'Go to Customers', tab: 'Customers', Icon: Users, gradient: 'from-emerald-500 to-teal-500' },
            { step: '04', title: 'Launch POS Checkout', desc: 'Open the sales terminal, scan items, and cash out.', label: 'Open POS Terminal', tab: 'POS', Icon: DollarSign, gradient: 'from-indigo-500 to-purple-500' },
          ].map(({ step, title, desc, label, tab, Icon, gradient }) => (
            <div
              key={step}
              className="p-5 border border-slate-100 dark:border-darkbg-border rounded-2xl hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between bg-slate-50/50 dark:bg-darkbg/30"
              style={{
                border: '1px solid var(--surface-border, #e2e8f0)',
                background: 'var(--surface-2, rgba(248, 250, 252, 0.5))',
              }}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-300 dark:text-slate-600 tracking-widest">STEP {step}</span>
                  <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                </div>
                <h4 className="text-sm font-black text-slate-800 dark:text-white mt-3">{title}</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-relaxed">{desc}</p>
              </div>
              <button
                type="button"
                onClick={() => handleNav(tab)}
                className="mt-5 flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:gap-2.5 transition-all cursor-pointer"
                style={{ background: 'transparent', border: 'none', padding: 0 }}
              >
                <span>{label}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── KPI Cards: definitions come from the Module Registry + Dashboard Card Registry.
  // Calculation/authority remains in dashboardKpiService; this component only renders it.
  const kpiCards = useMemo((): KPICardProps[] => {
    const definitions = getDashboardCardDefinitions(activeModule);

    return definitions.map((definition) => {
      let value: string | number = "—";
      let desc = definition.description;
      let action: KPICardProps["action"] | undefined;

      if (definition.systemKey === "pendingOutbox") {
        const pending = syncStatus.pendingOutboxCount + syncStatus.failedOutboxCount;
        const conflicts = syncStatus.abandonedOutboxCount ?? 0;
        value = pending;
        desc = pending > 0
          ? `${pending} mutations awaiting cloud synchronization${conflicts > 0 ? ` · ${conflicts} retry-exhausted conflicts` : ""}`
          : conflicts > 0
            ? `${conflicts} retry-exhausted conflicts require review`
            : "All local mutations are synchronized";
        action = isOnline
          ? { label: "Force Sync", onClick: forceBootstrap }
          : undefined;
      } else if (
        authoritativeKpis &&
        authoritativeKpis.kpis?.[definition.kpiKey] !== null &&
        authoritativeKpis.kpis?.[definition.kpiKey] !== undefined
      ) {
        value = formatDashboardKpiValue(definition, authoritativeKpis);
        desc = isOnline
          ? definition.description
          : `${definition.description} · Last authoritative snapshot`;
      } else if (authoritativeKpis && authoritativeKpis.kpis?.[definition.kpiKey] === null) {
        desc = `${definition.description} · Authoritative KPI not implemented`;
      } else if (definition.systemKey) {
        desc = definition.description;
      } else {
        desc = isOnline
          ? `${definition.description} · Waiting for authoritative PostgreSQL KPI`
          : `${definition.description} · No cached authoritative snapshot`;
      }

      return {
        title: definition.title,
        value,
        desc,
        icon: React.createElement(definition.icon, { className: "h-5 w-5" }),
        accent: definition.accent,
        action,
      };
    });
  }, [
    activeModule,
    authoritativeKpis,
    forceBootstrap,
    isOnline,
    syncStatus.abandonedOutboxCount,
    syncStatus.failedOutboxCount,
    syncStatus.pendingOutboxCount,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasToday = orders.some(o => o.timestamp >= new Date().setHours(0,0,0,0));

  return (
    <div className="space-y-6">
      {/* Standalone SVG Injection Strategy: Global gradient definitions */}
      <svg style={{ height: 0, width: 0, position: 'absolute', opacity: 0 }} aria-hidden="true">
        <defs>
          <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="gradPro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/>
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
          </linearGradient>
        </defs>
      </svg>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">Business Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Live analytics for{' '}
            <span className="font-bold text-slate-700 dark:text-slate-300">{currentBranchName || 'Main Branch'}</span>
            {' · '}
            <span className="font-bold text-primary">{role}</span>
            {' · '}
            <span className="text-slate-400">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quiet dashboard freshness metadata: useful for auditability without competing with business KPIs. */}
          {isOnline && authoritativeKpis && (
            <span
              className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap"
              title={dashboardFreshness.isBehind
                ? `Server revision ${dashboardFreshness.serverRevision || authoritativeKpis.asOfRevision} is ahead of local revision ${dashboardFreshness.localRevision}`
                : "Authoritative dashboard freshness"}
            >
              <RefreshCw className="h-3 w-3" />
              <span>
                Last synced {dashboardFreshness.syncedAt || "—"} · Rev {dashboardFreshness.serverRevision || authoritativeKpis.asOfRevision}
              </span>
              {dashboardFreshness.isBehind && (
                <span
                  className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-500"
                  aria-label="Local dashboard replica is behind"
                />
              )}
            </span>
          )}
          {/* Status Badge 1: authoritative TRA VFD integration state */}
          <button
            type="button"
            onClick={() => setIsVfdModalOpen(true)}
            className={`h-9 px-4 inline-flex items-center gap-2 text-xs font-bold rounded-xl border transition-all whitespace-nowrap shrink-0 cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
              !isOnline || !traVfdStatus
                ? 'bg-slate-500/10 text-slate-600 dark:bg-slate-950/40 dark:text-slate-400 border-slate-500/30 dark:border-slate-700/50 hover:border-slate-400'
                : traVfdStatus.status === 'VERIFIED'
                ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-500/30 dark:border-emerald-700/50 hover:border-emerald-400'
                : traVfdStatus.status === 'DISABLED'
                ? 'bg-slate-500/10 text-slate-600 dark:bg-slate-950/40 dark:text-slate-400 border-slate-500/30 dark:border-slate-700/50 hover:border-slate-400'
                : 'bg-amber-500/10 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border-amber-500/30 dark:border-amber-700/50 hover:border-amber-400'
            }`}
            style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.75rem' }}
            title="Click to toggle TRA VFD on/off & view live gateway metrics"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>
              {!isOnline
                ? 'TRA VFD: Offline'
                : traVfdStatus
                ? `TRA VFD: ${traVfdStatus.status}`
                : isVfdEnabled
                ? 'TRA VFD: ON'
                : 'TRA VFD: OFF'}
            </span>
          </button>

          {/* Status Badge 2: Offline Readiness */}
          <span
            className="h-9 px-4 inline-flex items-center gap-2 text-xs font-bold rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-700/50 whitespace-nowrap shrink-0"
            style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.75rem' }}
          >
            <Zap className="h-4 w-4 shrink-0" />
            <span>Offline Enabled</span>
          </span>

          {/* Action Button 1: Daily Z-Report */}
          <button
            type="button"
            onClick={() => setIsZReportOpen(true)}
            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-darkbg shadow-xs hover:border-slate-300 dark:hover:border-slate-600 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
            style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.75rem' }}
            title="Generate & print 80mm Daily Register Close (Z-Report) thermal slip"
          >
            <Printer className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Daily Z-Report</span>
          </button>

          {/* Action Button 2: Export Report */}
          <button
            type="button"
            onClick={exportDashboardSummaryCSV}
            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-darkbg-border bg-white dark:bg-darkbg-card text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-darkbg shadow-xs hover:border-slate-300 dark:hover:border-slate-600 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
            style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.75rem' }}
            title="Download multi-tab audited Excel workbook (.xlsx)"
          >
            <Download className="h-4 w-4 text-slate-500 dark:text-slate-400 shrink-0" />
            <span>Export Report</span>
          </button>

          {/* Primary Action Button: Launch POS (Matches OK Reference) */}
          <button
            type="button"
            onClick={() => handleNav('POS')}
            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary-hover text-xs font-bold text-white shadow-sm hover:shadow-md hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
            style={{ height: '2.25rem', padding: '0 1rem', borderRadius: '0.75rem' }}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" />
            <span>Launch POS</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      {isOnline && isLoadingAuthoritativeKpis && !authoritativeKpis && (
        <div className="rounded-xl border border-slate-200 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg-card px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Loading authoritative PostgreSQL dashboard KPIs…
        </div>
      )}
      {isOnline && authoritativeKpiError && !authoritativeKpis && !isLoadingAuthoritativeKpis && (
        <div className="rounded-xl border border-amber-300/40 bg-amber-500/10 px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
          Dashboard reporting is waiting for the PostgreSQL authoritative KPI snapshot. Local IndexedDB values are not used while connected.
          <button type="button" onClick={() => void refreshAuthoritativeKpis()} className="ml-2 underline">Retry</button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card, i) => (
          <KPICard key={i} {...card} />
        ))}
      </div>

      {/* ── GAAP Net Turnover Ledger Strip (Gross Sales - Discounts - Refunds = Net Sales) ── */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--surface-border)",
          borderRadius: "var(--radius-md)",
          padding: "0.85rem 1.25rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: "220px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(59, 130, 246, 0.12)",
              color: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Layers size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 800, fontSize: "13px", color: "var(--text)" }}>
                GAAP Turnover Ledger
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3.5px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: "rgba(59, 130, 246, 0.12)",
                  color: "#3b82f6",
                  fontSize: "9.5px",
                  fontWeight: 700,
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                }}
              >
                Today's Accrual
              </span>
            </div>
            <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "1px" }}>
              Gross receipts reconciled after discounts, returns & refunds
            </div>
          </div>
        </div>

        {/* Ledger Equation: Gross - Discounts - Refunds = Net Sales */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
            fontSize: "11px",
          }}
        >
          {/* Gross Sales */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Gross Sales
            </span>
            <span className="v2-mono" style={{ fontWeight: 800, fontSize: "13px", color: "var(--text)" }}>
              {fmtCcy(stats.grossSales)}
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: "14px" }}>−</span>

          {/* Discounts */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Discounts
            </span>
            <span className="v2-mono" style={{ fontWeight: 800, fontSize: "13px", color: stats.todayDiscounts > 0 ? "var(--warning)" : "var(--muted)" }}>
              {fmtCcy(stats.todayDiscounts)}
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: "14px" }}>−</span>

          {/* Refunds & Returns */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "var(--muted)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Refunds / Returns
              </span>
              {stats.todayRefundCount > 0 && (
                <span
                  style={{
                    padding: "0 4px",
                    borderRadius: "4px",
                    background: "rgba(239, 68, 68, 0.15)",
                    color: "var(--danger)",
                    fontSize: "9px",
                    fontWeight: 800,
                  }}
                >
                  {stats.todayRefundCount}
                </span>
              )}
            </div>
            <span className="v2-mono" style={{ fontWeight: 800, fontSize: "13px", color: stats.todayRefunds > 0 ? "var(--danger)" : "var(--muted)" }}>
              {fmtCcy(stats.todayRefunds)}
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 900, fontSize: "14px" }}>=</span>

          {/* Net Sales */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "4px 10px",
              borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.12)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
            }}
          >
            <span style={{ color: "#10b981", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Net Sales
            </span>
            <span className="v2-mono" style={{ fontWeight: 900, fontSize: "14px", color: "#10b981" }}>
              {fmtCcy(stats.netSales)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Register Till & Cash In Drawer Reconciliation Strip ─────────── */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--surface-border)",
          borderRadius: "var(--radius-md)",
          padding: "0.85rem 1.25rem",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: "220px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Wallet size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontWeight: 800, fontSize: "13px", color: "var(--text)" }}>
                Register Till Balance
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3.5px",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background: tillReconciliation.isShiftOpen ? "rgba(16, 185, 129, 0.12)" : "rgba(148, 163, 184, 0.12)",
                  color: tillReconciliation.isShiftOpen ? "#10b981" : "var(--muted)",
                  fontSize: "9.5px",
                  fontWeight: 700,
                  border: `1px solid ${tillReconciliation.isShiftOpen ? "rgba(16, 185, 129, 0.25)" : "var(--surface-border)"}`,
                }}
              >
                <span
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: tillReconciliation.isShiftOpen ? "#10b981" : "var(--muted)",
                  }}
                />
                {tillReconciliation.isShiftOpen ? "Shift In Progress" : "Continuous Till"}
              </span>
            </div>
            <div style={{ fontSize: "10.5px", color: "var(--muted)", marginTop: "1px" }}>
              Real-time cash in drawer vs logged cash sales
            </div>
          </div>
        </div>

        {/* Financial Flow Formula Blocks */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.6rem",
            fontSize: "11px",
          }}
        >
          {/* Float */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 700, color: "var(--muted)" }}>
              Opening Float
            </span>
            <span className="v2-mono" style={{ fontWeight: 700, color: "var(--text)" }}>
              {fmtCcy(tillReconciliation.openingFloat)}
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 800 }}>+</span>

          {/* Cash Sales */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 700, color: "var(--muted)" }}>
              Cash Collected
            </span>
            <span className="v2-mono" style={{ fontWeight: 700, color: "#10b981" }}>
              {fmtCcy(tillReconciliation.cashSalesToday)}
              <span style={{ fontSize: "9.5px", fontWeight: 500, color: "var(--muted)", marginLeft: "3px" }}>
                ({tillReconciliation.cashTransactionsCount})
              </span>
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 800 }}>−</span>

          {/* Payouts / Drops */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 700, color: "var(--muted)" }}>
              Drops / Payouts
            </span>
            <span className="v2-mono" style={{ fontWeight: 700, color: "var(--text)" }}>
              {fmtCcy(tillReconciliation.totalPayouts)}
            </span>
          </div>

          <span style={{ color: "var(--muted)", fontWeight: 800 }}>=</span>

          {/* Expected Cash in Drawer */}
          <div
            style={{
              padding: "4px 10px",
              borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 800, color: "#10b981", letterSpacing: "0.03em" }}>
              Expected in Drawer
            </span>
            <span className="v2-mono" style={{ fontWeight: 900, fontSize: "14px", color: "#10b981" }}>
              {fmtCcy(tillReconciliation.expectedCash)}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={() => handleNav('CashDrawer')}
          className="v2-btn v2-btn-sm v2-btn-secondary"
          style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "8px" }}
        >
          <span>Shift Details & Drop</span>
          <ArrowRight size={12} />
        </button>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Main Revenue / Trend Chart */}
        <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-black">
                  {activeModule === 'SACCO' ? 'Savings vs Loan Trends' : 'Sales Revenue & Profit'}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {activeModule === 'SACCO'
                    ? '6-month member activity'
                    : revenueTimeframe === 'today'
                    ? "Today's hourly sales velocity and run-rate"
                    : revenueTimeframe === '7d'
                    ? 'Last 7 days performance vs prior 7 days'
                    : revenueTimeframe === '30d'
                    ? '30-day revenue and gross margin trend'
                    : 'Month-to-date financial performance'}
                </CardDescription>
              </div>

              {/* Timeframe Selector */}
              {activeModule !== 'SACCO' && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    background: "var(--surface-2)",
                    border: "1px solid var(--surface-border)",
                    padding: "3px",
                    borderRadius: "var(--radius-md)",
                    width: "fit-content",
                  }}
                >
                  {(
                    [
                      { key: 'today', label: 'Today' },
                      { key: '7d', label: '7 Days' },
                      { key: '30d', label: '30 Days' },
                      { key: 'month', label: 'This Month' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setRevenueTimeframe(tab.key)}
                      style={{
                        padding: "0.3rem 0.75rem",
                        fontSize: "11px",
                        fontWeight: 700,
                        borderRadius: "calc(var(--radius-md) - 2px)",
                        background: revenueTimeframe === tab.key ? "var(--accent)" : "transparent",
                        color: revenueTimeframe === tab.key ? "#080e1c" : "var(--muted)",
                        border: "none",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>

          {/* Executive KPI Strip */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "0.75rem",
              padding: "0.5rem 1.25rem 0.85rem 1.25rem",
            }}
          >
            {/* Gross Revenue */}
            <div
              onClick={() => setChartActiveMetric(chartActiveMetric === 'revenue' ? 'all' : 'revenue')}
              style={{
                padding: "0.85rem 1rem",
                background: chartActiveMetric === 'revenue' ? "rgba(59, 130, 246, 0.08)" : "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                border: chartActiveMetric === 'revenue' ? "1.5px solid #3b82f6" : "1px solid var(--surface-border)",
                boxShadow: chartActiveMetric === 'revenue' ? "0 0 12px rgba(59, 130, 246, 0.2)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Click to spotlight Gross Revenue in chart"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>
                  Gross Revenue
                </div>
                <span
                  style={{
                    fontSize: "8.5px",
                    fontWeight: 800,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: chartActiveMetric === 'revenue' ? "#3b82f6" : "rgba(148, 163, 184, 0.15)",
                    color: chartActiveMetric === 'revenue' ? "#ffffff" : "var(--muted)",
                  }}
                >
                  {chartActiveMetric === 'revenue' ? 'Active' : 'Filter'}
                </span>
              </div>
              <div className="v2-mono v2-font-black v2-text-base" style={{ marginTop: "2px", color: "var(--text)" }}>
                {fmtCcy(revenueAnalytics.totalRevenue)}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                {revenueAnalytics.revenueDeltaPct !== null ? (
                  Number(revenueAnalytics.revenueDeltaPct) >= 0 ? (
                    <span style={{ color: "var(--success)" }} className="v2-flex v2-items-center">
                      <TrendingUp size={11} style={{ marginRight: 2 }} />+{revenueAnalytics.revenueDeltaPct}%
                    </span>
                  ) : (
                    <span style={{ color: "var(--danger)" }} className="v2-flex v2-items-center">
                      <TrendingDown size={11} style={{ marginRight: 2 }} />{revenueAnalytics.revenueDeltaPct}%
                    </span>
                  )
                ) : (
                  <span style={{ color: "var(--muted)" }}>Baseline</span>
                )}
                <span style={{ color: "var(--muted)", fontSize: "9px" }}>
                  {revenueTimeframe === 'today' ? 'vs yesterday' : 'vs prior'}
                </span>
              </div>
            </div>

            {/* Gross Profit */}
            <div
              onClick={() => setChartActiveMetric(chartActiveMetric === 'profit' ? 'all' : 'profit')}
              style={{
                padding: "0.85rem 1rem",
                background: chartActiveMetric === 'profit' ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                border: chartActiveMetric === 'profit' ? "1.5px solid #10b981" : "1px solid var(--surface-border)",
                boxShadow: chartActiveMetric === 'profit' ? "0 0 12px rgba(16, 185, 129, 0.2)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Click to spotlight Gross Profit in chart"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>
                  Gross Profit
                </div>
                <span
                  style={{
                    fontSize: "8.5px",
                    fontWeight: 800,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: chartActiveMetric === 'profit' ? "#10b981" : "rgba(148, 163, 184, 0.15)",
                    color: chartActiveMetric === 'profit' ? "#ffffff" : "var(--muted)",
                  }}
                >
                  {chartActiveMetric === 'profit' ? 'Active' : 'Filter'}
                </span>
              </div>
              <div className="v2-mono v2-font-black v2-text-base" style={{ marginTop: "2px", color: "var(--success)" }}>
                {fmtCcy(revenueAnalytics.totalProfit)}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "2px", color: "var(--muted)" }}>
                {revenueAnalytics.profitDeltaPct !== null ? (
                  Number(revenueAnalytics.profitDeltaPct) >= 0 ? (
                    <span style={{ color: "var(--success)" }}>+{revenueAnalytics.profitDeltaPct}% vs prior</span>
                  ) : (
                    <span style={{ color: "var(--danger)" }}>{revenueAnalytics.profitDeltaPct}% vs prior</span>
                  )
                ) : (
                  <span>Net margin earnings</span>
                )}
              </div>
            </div>

            {/* Cost (COGS) */}
            <div
              onClick={() => setChartActiveMetric(chartActiveMetric === 'cogs' ? 'all' : 'cogs')}
              style={{
                padding: "0.85rem 1rem",
                background: chartActiveMetric === 'cogs' ? "rgba(245, 158, 11, 0.08)" : "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                border: chartActiveMetric === 'cogs' ? "1.5px solid #f59e0b" : "1px solid var(--surface-border)",
                boxShadow: chartActiveMetric === 'cogs' ? "0 0 12px rgba(245, 158, 11, 0.2)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Click to spotlight Cost of Goods Sold (COGS) in chart"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>
                  Cost (COGS)
                </div>
                <span
                  style={{
                    fontSize: "8.5px",
                    fontWeight: 800,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: chartActiveMetric === 'cogs' ? "#f59e0b" : "rgba(148, 163, 184, 0.15)",
                    color: chartActiveMetric === 'cogs' ? "#ffffff" : "var(--muted)",
                  }}
                >
                  {chartActiveMetric === 'cogs' ? 'Active' : 'Filter'}
                </span>
              </div>
              <div className="v2-mono v2-font-black v2-text-base" style={{ marginTop: "2px", color: "var(--text)" }}>
                {fmtCcy(revenueAnalytics.totalCOGS)}
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "2px", color: "var(--muted)" }}>
                {revenueAnalytics.totalRevenue > 0
                  ? `${((revenueAnalytics.totalCOGS / revenueAnalytics.totalRevenue) * 100).toFixed(0)}% of sales`
                  : 'Inventory cost'}
              </div>
            </div>

            {/* Blended Margin % */}
            <div
              onClick={() => setChartActiveMetric('all')}
              style={{
                padding: "0.85rem 1rem",
                background: chartActiveMetric === 'all' ? "rgba(99, 102, 241, 0.08)" : "var(--surface-2)",
                borderRadius: "var(--radius-md)",
                border: chartActiveMetric === 'all' ? "1.5px solid var(--accent)" : "1px solid var(--surface-border)",
                boxShadow: chartActiveMetric === 'all' ? "0 0 12px rgba(99, 102, 241, 0.15)" : "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title="Click to show all chart layers"
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>
                  Gross Margin
                </div>
                <span
                  style={{
                    fontSize: "8.5px",
                    fontWeight: 800,
                    padding: "1px 5px",
                    borderRadius: "4px",
                    background: chartActiveMetric === 'all' ? "var(--accent)" : "rgba(148, 163, 184, 0.15)",
                    color: chartActiveMetric === 'all' ? "#080e1c" : "var(--muted)",
                  }}
                >
                  {chartActiveMetric === 'all' ? 'All Layers' : 'Reset'}
                </span>
              </div>
              <div className="v2-mono v2-font-black v2-text-base" style={{ marginTop: "2px", color: "var(--accent)" }}>
                {revenueAnalytics.marginPct}%
              </div>
              <div style={{ fontSize: "10px", fontWeight: 600, marginTop: "2px" }}>
                {Number(revenueAnalytics.marginPct) >= 30 ? (
                  <span style={{ color: "var(--success)" }}>Healthy retail margin</span>
                ) : Number(revenueAnalytics.marginPct) > 0 ? (
                  <span style={{ color: "var(--warning)" }}>Tight margin (&lt;30%)</span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>Baseline</span>
                )}
              </div>
            </div>
          </div>

          {/* Peak Rush Hour Alert Banner (Today only) */}
          {revenueTimeframe === 'today' && revenueAnalytics.peakHour && (
            <div
              style={{
                margin: "0 1.25rem 0.5rem 1.25rem",
                padding: "0.5rem 0.85rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(245, 158, 11, 0.12)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, color: "var(--warning)" }}>
                <Flame size={14} style={{ color: "var(--warning)" }} />
                <span>Peak Rush Hour: {revenueAnalytics.peakHour.hour}</span>
              </div>
              <div className="v2-mono" style={{ fontWeight: 900, color: "var(--text)" }}>
                {fmtCcy(revenueAnalytics.peakHour.revenue)} ({revenueAnalytics.peakHour.ordersCount} {revenueAnalytics.peakHour.ordersCount === 1 ? 'sale' : 'sales'})
              </div>
            </div>
          )}

          <CardContent className="h-64 pb-2 relative">
            {revenueAnalytics.totalRevenue === 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(15, 23, 42, 0.72)',
                  backdropFilter: 'blur(3px)',
                  zIndex: 10,
                  borderRadius: '0 0 1rem 1rem',
                  padding: '1.25rem',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '12px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#3b82f6',
                    marginBottom: '0.65rem',
                  }}
                >
                  <BarChart2 size={22} />
                </div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text, #ffffff)' }}>
                  No Sales Recorded Yet
                </div>
                <div style={{ fontSize: '11px', color: 'var(--muted, #94a3b8)', maxWidth: '340px', marginTop: '4px', lineHeight: 1.4 }}>
                  Complete your first customer checkout in POS to visualize real-time hourly revenue velocity and gross profit margin.
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                  <button
                    type="button"
                    onClick={() => handleNav('POS')}
                    className="v2-btn v2-btn-sm v2-btn-primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '5px 12px', borderRadius: '8px' }}
                  >
                    <ShoppingCart size={13} />
                    <span>Launch POS</span>
                  </button>
                </div>
              </div>
            )}
            {/* Option A: Explicit SVG container for safe definition of gradients */}
            <svg style={{ height: 0, width: 0, position: 'absolute' }} aria-hidden="true">
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradPro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </svg>
            {!isChartEngineReady ? (
              <ChartFallback />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueAnalytics.chartPoints} margin={{ top: 10, right: 12, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradPro" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" className="dark:stroke-darkbg-border/30" />
                <XAxis
                  dataKey="name"
                  fontSize={10}
                  stroke="#94A3B8"
                  tick={{ fontWeight: 600 }}
                  interval={revenueTimeframe === '30d' ? 4 : 0}
                />
                <YAxis
                  fontSize={10}
                  stroke="#94A3B8"
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0]?.payload;
                    return (
                      <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl shadow-xl p-3 text-xs min-w-[170px] space-y-1.5">
                        <p className="font-black text-slate-800 dark:text-slate-100 pb-1 border-b border-slate-100 dark:border-darkbg-border">
                          {pt?.fullLabel || label}
                        </p>
                        <div className="flex items-center justify-between font-mono font-bold text-blue-600 dark:text-blue-400">
                          <span className="flex items-center gap-1.5 font-sans font-semibold text-slate-600 dark:text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                            Revenue:
                          </span>
                          <span>{fmtCcy(pt?.Revenue || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="flex items-center gap-1.5 font-sans font-semibold text-slate-600 dark:text-slate-300">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                            Gross Profit:
                          </span>
                          <span>{fmtCcy(pt?.Profit || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          <span className="font-sans">Cost (COGS):</span>
                          <span>{fmtCcy(pt?.COGS || 0)}</span>
                        </div>
                        <div className="flex items-center justify-between font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          <span className="font-sans">Margin:</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{pt?.marginPct || 0}%</span>
                        </div>
                        {pt?.PriorRevenue > 0 && (
                          <div className="pt-1 mt-1 border-t border-slate-100 dark:border-darkbg-border/60 flex items-center justify-between text-[10px] text-slate-400">
                            <span>Prior Baseline:</span>
                            <span className="font-mono">{fmtCcy(pt.PriorRevenue)}</span>
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '6px' }} />
                {activeModule === 'SACCO' ? (
                  <>
                    <Area type="monotone" dataKey="Savings" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#gradPro)" dot={{ fill: '#10b981', r: 3 }} />
                    <Area type="monotone" dataKey="Loans"   stroke="#3b82f6" strokeWidth={2.5} fillOpacity={1} fill="url(#gradRev)" dot={{ fill: '#3b82f6', r: 3 }} />
                  </>
                ) : (
                  <>
                    {(chartActiveMetric === 'all' || chartActiveMetric === 'revenue') && (
                      <Area
                        type="monotone"
                        dataKey="Revenue"
                        name="Gross Revenue"
                        stroke="#3b82f6"
                        strokeWidth={chartActiveMetric === 'revenue' ? 3 : 2.5}
                        fillOpacity={1}
                        fill="url(#gradRev)"
                        dot={{ fill: '#3b82f6', r: 2.5 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {(chartActiveMetric === 'all' || chartActiveMetric === 'profit') && (
                      <Area
                        type="monotone"
                        dataKey="Profit"
                        name="Gross Profit"
                        stroke="#10b981"
                        strokeWidth={chartActiveMetric === 'profit' ? 3 : 2.5}
                        fillOpacity={1}
                        fill="url(#gradPro)"
                        dot={{ fill: '#10b981', r: 2.5 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {chartActiveMetric === 'cogs' && (
                      <Area
                        type="monotone"
                        dataKey="COGS"
                        name="Cost (COGS)"
                        stroke="#f59e0b"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#gradCogs)"
                        dot={{ fill: '#f59e0b', r: 2.5 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {(chartActiveMetric === 'all' || chartActiveMetric === 'revenue') && (
                      <Area
                        type="monotone"
                        dataKey="PriorRevenue"
                        name="Prior Baseline"
                        stroke="#94a3b8"
                        strokeWidth={1.75}
                        strokeDasharray="4 4"
                        fill="none"
                        dot={false}
                        activeDot={{ r: 4, stroke: '#94a3b8' }}
                      />
                    )}
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods Donut */}
        <Card className="rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-black">Payment Channels</CardTitle>
                <CardDescription className="text-[11px]">Breakdown by payment method</CardDescription>
              </div>
              {/* Metric Toggle */}
              {paymentChannelSummary.items.length > 0 && (
                <div className="flex items-center bg-slate-100 dark:bg-darkbg-border/60 p-0.5 rounded-lg text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPaymentMetricMode('volume')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                      paymentMetricMode === 'volume'
                        ? 'bg-white dark:bg-darkbg-card text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Volume
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMetricMode('count')}
                    className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                      paymentMetricMode === 'count'
                        ? 'bg-white dark:bg-darkbg-card text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    Count
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-between pb-4 flex-1">
            {paymentChannelSummary.items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-52 text-center w-full">
                <div className="h-16 w-16 rounded-full border-4 border-dashed border-slate-200 dark:border-darkbg-border flex items-center justify-center mb-3">
                  <Banknote className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-xs font-bold text-slate-400">No transactions yet</p>
                <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-1">Payment channels appear after first sale</p>
              </div>
            ) : (
              <>
                {/* Donut Chart with Center KPI */}
                <div className="relative h-44 w-full flex items-center justify-center">
                  {!isChartEngineReady ? (
                    <ChartFallback />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentChannelSummary.items}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={68}
                        paddingAngle={paymentChannelSummary.items.length > 1 ? 3 : 0}
                        dataKey="value"
                        onMouseEnter={(_entry: unknown, index: number) => setActivePaymentIndex(index)}
                        onMouseLeave={() => setActivePaymentIndex(null)}
                      >
                        {paymentChannelSummary.items.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.color}
                            strokeWidth={0}
                            style={{
                              filter: activePaymentIndex === i ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.25))' : 'none',
                              cursor: 'pointer',
                            }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }: any) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border rounded-xl shadow-lg p-2.5 text-xs min-w-[140px] space-y-1">
                              <div className="flex items-center gap-1.5 font-black text-slate-800 dark:text-slate-100">
                                <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                                <span>{d.name}</span>
                              </div>
                              <div className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 flex justify-between">
                                <span>Volume:</span> <span>{fmtCcy(d.volume)} ({d.volumeShare}%)</span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 flex justify-between">
                                <span>Payments:</span> <span>{d.paymentCount ?? d.count} ({d.countShare}%)</span>
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 flex justify-between pt-1 border-t border-slate-100 dark:border-darkbg-border/60">
                                <span>Avg Ticket:</span> <span className="font-semibold">{fmtCcy(d.aov)}</span>
                              </div>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  )}

                  {/* Donut Center KPI */}
                  <div
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center select-none"
                    style={{ zIndex: 1 }}
                  >
                    {activePaymentChannel ? (
                      <>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate max-w-[90px]">
                          {activePaymentChannel.name}
                        </span>
                        <span className="text-sm font-black font-mono tracking-tight text-slate-800 dark:text-white leading-tight">
                          {paymentMetricMode === 'volume' ? fmtCcy(activePaymentChannel.volume) : `${activePaymentChannel.paymentCount ?? activePaymentChannel.count} Payments`}
                        </span>
                        <span className="text-[9px] font-bold" style={{ color: activePaymentChannel.color }}>
                          {paymentMetricMode === 'volume' ? `${activePaymentChannel.volumeShare}% Share` : `${activePaymentChannel.countShare}% Share`}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[8.5px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {paymentMetricMode === 'volume' ? 'Total Collected' : 'Payment Records'}
                        </span>
                        <span className="text-sm font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight">
                          {paymentMetricMode === 'volume' ? fmtCcy(paymentChannelSummary.totalVolume) : `${paymentChannelSummary.totalCount} Payments`}
                        </span>
                        <span className="text-[9.5px] text-slate-400 dark:text-slate-500 font-medium">
                          {paymentMetricMode === 'volume'
                            ? `${paymentChannelSummary.totalCount} ${paymentChannelSummary.totalCount === 1 ? 'payments' : 'payments'} · ${paymentChannelSummary.totalOrderCount} ${paymentChannelSummary.totalOrderCount === 1 ? 'order' : 'orders'}`
                            : `Distinct orders ${paymentChannelSummary.totalOrderCount} · Avg order ${fmtCcy(paymentChannelSummary.overallAov)}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Channel List Breakdown */}
                <div className="mt-2 w-full space-y-1.5 px-0.5">
                  {paymentChannelSummary.items.map((item, i) => {
                    const Icon = item.icon;
                    const isHighlighted = activePaymentIndex === i;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => setActivePaymentIndex(i)}
                        onMouseLeave={() => setActivePaymentIndex(null)}
                        className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
                          isHighlighted
                            ? 'bg-slate-100 dark:bg-darkbg-border/60 shadow-xs'
                            : 'hover:bg-slate-50 dark:hover:bg-darkbg-border/30'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0 shadow-xs"
                            style={{ background: item.badgeBg, color: item.textColor }}
                          >
                            <Icon size={14} />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 dark:text-slate-100 truncate text-xs flex items-center gap-1.5">
                              <span className="truncate">{item.name}</span>
                              {item.name === 'Cash' && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-200 dark:border-emerald-800/40">
                                  Drawer
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">
                              {item.orderCount} {item.orderCount === 1 ? 'order' : 'orders'} · {item.paymentCount} {item.paymentCount === 1 ? 'payment' : 'payments'} · AOV {fmtCcy(item.aov)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 pl-2">
                          <div className="font-black font-mono text-xs text-slate-900 dark:text-white">
                            {fmtCcy(item.volume)}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                            {paymentMetricMode === 'volume' ? `${item.volumeShare}% vol` : `${item.countShare}% payments`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Micro-Summary */}
                <div className="w-full mt-3 pt-2 border-t border-slate-100 dark:border-darkbg-border/60 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-1">
                  <span>Reconciled across {paymentChannelSummary.items.length} {paymentChannelSummary.items.length === 1 ? 'tender' : 'tenders'}</span>
                  <span className="font-bold text-slate-600 dark:text-slate-300">AOV: {fmtCcy(paymentChannelSummary.overallAov)}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Products + Recent Orders ────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-5">

        {/* Top Products Ranked Leaderboard Card */}
        <Card className="lg:col-span-2 rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-black">Top Products</CardTitle>
                <CardDescription className="text-[11px]">Ranked by sales velocity & volume</CardDescription>
              </div>

              {/* Metric Toggle: Revenue vs Units Sold */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "2px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--surface-border)",
                  padding: "2px",
                  borderRadius: "8px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setTopProductsMetric('revenue')}
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    background: topProductsMetric === 'revenue' ? "var(--accent)" : "transparent",
                    color: topProductsMetric === 'revenue' ? "#080e1c" : "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Revenue
                </button>
                <button
                  type="button"
                  onClick={() => setTopProductsMetric('units')}
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    background: topProductsMetric === 'units' ? "var(--accent)" : "transparent",
                    color: topProductsMetric === 'units' ? "#080e1c" : "var(--muted)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Units Sold
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-2 pb-3 flex-1 flex flex-col justify-between">
            {topProductsAnalytics.items.length === 0 ? (
              <div className="py-10 text-center text-slate-400 italic text-xs flex flex-col items-center justify-center gap-2">
                <Package className="h-8 w-8 text-slate-300 dark:text-slate-600 stroke-[1.5]" />
                <p>No product sales recorded yet.</p>
                <span className="text-[10px] text-slate-400">Complete checkouts from the POS terminal to populate rankings.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                {topProductsAnalytics.items.map((item) => {
                  const isGold = item.rank === 1;
                  const isSilver = item.rank === 2;
                  const isBronze = item.rank === 3;
                  const rankBg = isGold ? 'rgba(245, 158, 11, 0.12)' : isSilver ? 'rgba(148, 163, 184, 0.15)' : isBronze ? 'rgba(234, 88, 12, 0.12)' : 'var(--surface-2)';
                  const rankColor = isGold ? '#f59e0b' : isSilver ? '#94a3b8' : isBronze ? '#ea580c' : 'var(--muted)';
                  const rankBorder = isGold ? 'rgba(245, 158, 11, 0.3)' : isSilver ? 'rgba(148, 163, 184, 0.3)' : isBronze ? 'rgba(234, 88, 12, 0.3)' : 'var(--surface-border)';

                  const stockBadge = item.stock <= 0
                    ? { text: 'Out of Stock', bg: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: 'rgba(239, 68, 68, 0.25)' }
                    : item.stock <= 5
                    ? { text: `Low: ${item.stock}`, bg: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: 'rgba(245, 158, 11, 0.25)' }
                    : { text: `${item.stock} in stock`, bg: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: 'rgba(16, 185, 129, 0.25)' };

                  return (
                    <div
                      key={item.productId}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                        padding: "8px 10px",
                        borderRadius: "10px",
                        background: "var(--surface-2)",
                        border: "1px solid var(--surface-border)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                          {/* Rank Pill */}
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: "22px",
                              height: "22px",
                              borderRadius: "6px",
                              fontSize: "11px",
                              fontWeight: 800,
                              background: rankBg,
                              color: rankColor,
                              border: `1px solid ${rankBorder}`,
                              flexShrink: 0,
                            }}
                          >
                            {isGold ? <Award size={12} /> : `#${item.rank}`}
                          </span>

                          {/* Product Info */}
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: 700,
                                fontSize: "12px",
                                color: "var(--text)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "160px",
                              }}
                              title={item.name}
                            >
                              {item.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "10px", color: "var(--muted)", marginTop: "1px" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80px" }}>
                                {item.category}
                              </span>
                              <span>•</span>
                              <span
                                style={{
                                  fontSize: "9px",
                                  fontWeight: 700,
                                  padding: "0.5px 5px",
                                  borderRadius: "4px",
                                  background: stockBadge.bg,
                                  color: stockBadge.color,
                                  border: `1px solid ${stockBadge.border}`,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {stockBadge.text}
                              </span>
                              {item.stock <= 5 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    try {
                                      sessionStorage.setItem('kwakopos_target_reorder_sku', JSON.stringify({
                                        productId: item.productId,
                                        name: item.name,
                                        currentStock: item.stock,
                                        category: item.category,
                                      }));
                                    } catch {}
                                    handleNav('Purchasing');
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "2.5px",
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    background: item.stock <= 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                                    color: item.stock <= 0 ? "#ef4444" : "#d97706",
                                    border: item.stock <= 0 ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(245, 158, 11, 0.3)",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={`Create purchase order to restock ${item.name}`}
                                >
                                  <Truck size={9} />
                                  <span>Reorder</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Metric Value */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div className="v2-mono" style={{ fontWeight: 800, fontSize: "12px", color: "var(--text)" }}>
                            {topProductsMetric === 'revenue' ? fmtCcy(item.revenue) : `${item.units} sold`}
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 500 }}>
                            {topProductsMetric === 'revenue' ? `${item.units} units` : fmtCcy(item.revenue)}
                          </div>
                        </div>
                      </div>

                      {/* Velocity Progress Bar */}
                      <div style={{ height: "4px", width: "100%", background: "var(--surface-border)", borderRadius: "2px", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${item.progressPct}%`,
                            background: isGold ? "linear-gradient(90deg, #f59e0b, #fbbf24)" : "var(--accent)",
                            borderRadius: "2px",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer Micro-Summary */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid var(--surface-border)", fontSize: "10px", color: "var(--muted)" }}>
              <span>Tracking top {topProductsAnalytics.items.length} of {topProductsAnalytics.totalTracked} products</span>
              <button
                type="button"
                onClick={() => handleNav('Inventory')}
                style={{ background: "none", border: "none", color: "var(--accent)", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "3px", padding: 0 }}
              >
                View catalog <ArrowRight size={11} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders Audit Table */}
        <Card className="lg:col-span-3 rounded-2xl border-slate-200 dark:border-darkbg-border shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-black">Recent Orders</CardTitle>
              <CardDescription className="text-[11px]">Latest {Math.min(orders.length, 6)} transactions</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black bg-primary/10 text-primary dark:bg-primary/20 px-2.5 py-1 rounded-full">
                {orders.length} loaded
              </span>
              <button
                onClick={() => handleNav('Receipts')}
                className="text-[10px] font-bold text-slate-400 hover:text-primary transition flex items-center gap-1"
              >
                View all receipts <ArrowRight className="h-2.5 w-2.5" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 flex flex-col justify-between">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-darkbg-border bg-slate-50 dark:bg-darkbg/50 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <th className="p-3 pl-4">Order</th>
                    <th className="p-3">Date & Time</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Items</th>
                    <th className="p-3">Total</th>
                    <th className="p-3">Channel</th>
                    <th className="p-3 text-center">Sync</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-darkbg-border/20">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400 italic text-xs">
                        No orders logged yet. Start selling from the POS terminal.
                      </td>
                    </tr>
                  ) : (
                    orders.slice(0, 6).map(order => {
                      const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
                      const tender = getTenderBadge(order.paymentMethod);
                      const TenderIcon = tender.Icon;

                      return (
                        <tr
                          key={order.id}
                          onClick={() => setSelectedOrderForDrawer(order)}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors text-xs cursor-pointer group"
                        >
                          <td className="p-3 pl-4">
                            <span className="v2-mono font-extrabold text-[11px] text-primary dark:text-blue-400">
                              {order.saleNumber || order.id}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontWeight: 600, color: "var(--text)" }}>{fmtDate(order.timestamp)}</span>
                              <span style={{ fontSize: "10px", color: "var(--muted)" }}>{fmtTime(order.timestamp)}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "110px" }}>
                              <div
                                style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "50%",
                                  background: "var(--surface-2)",
                                  border: "1px solid var(--surface-border)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <User size={11} style={{ color: "var(--muted)" }} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: "var(--text)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    maxWidth: "115px",
                                    display: "block",
                                  }}
                                  title={order.customer || 'Walk-In Customer'}
                                >
                                  {order.customer || 'Walk-In Customer'}
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "9px", color: "var(--muted)", marginTop: "1px" }}>
                                  <UserCheck size={9} style={{ color: "var(--accent)" }} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90px" }}>
                                    {order.cashierName || 'Cashier'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {totalItems} {totalItems === 1 ? 'item' : 'items'}
                          </td>
                          <td className="p-3 font-black text-slate-900 dark:text-white whitespace-nowrap font-mono">
                            {fmtCcy(order.total)}
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "10px",
                                fontWeight: 700,
                                background: tender.bg,
                                color: tender.color,
                                border: `1px solid ${tender.border}`,
                              }}
                            >
                              <TenderIcon size={11} />
                              {tender.label}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                borderRadius: "9999px",
                                padding: "2px 8px",
                                fontSize: "9.5px",
                                fontWeight: 800,
                                background:
                                  order.syncStatus === 'Synced'
                                    ? 'rgba(16, 185, 129, 0.1)'
                                    : order.syncStatus === 'Failed'
                                    ? 'rgba(239, 68, 68, 0.1)'
                                    : 'rgba(245, 158, 11, 0.1)',
                                color:
                                  order.syncStatus === 'Synced'
                                    ? '#10b981'
                                    : order.syncStatus === 'Failed'
                                    ? '#ef4444'
                                    : '#f59e0b',
                                border: `1px solid ${
                                  order.syncStatus === 'Synced'
                                    ? 'rgba(16, 185, 129, 0.25)'
                                    : order.syncStatus === 'Failed'
                                    ? 'rgba(239, 68, 68, 0.25)'
                                    : 'rgba(245, 158, 11, 0.25)'
                                }`,
                              }}
                            >
                              {order.syncStatus === 'Synced' ? (
                                <CheckCircle size={10} />
                              ) : order.syncStatus === 'Failed' ? (
                                <AlertTriangle size={10} />
                              ) : (
                                <RefreshCw size={10} className="animate-spin" />
                              )}
                              {order.syncStatus}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderForDrawer(order);
                              }}
                              title="Inspect Receipt Breakdown"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "26px",
                                height: "26px",
                                borderRadius: "6px",
                                border: "1px solid var(--surface-border)",
                                background: "var(--surface-2)",
                                color: "var(--muted)",
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.color = "var(--accent)";
                                e.currentTarget.style.borderColor = "var(--accent)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.color = "var(--muted)";
                                e.currentTarget.style.borderColor = "var(--surface-border)";
                              }}
                            >
                              <Eye size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Micro Table Footer */}
            <div className="w-full pt-2.5 pb-2 px-4 border-t border-slate-100 dark:border-darkbg-border/60 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
              <span>Click any row or the eye button to view the receipt audit breakdown</span>
              <span className="font-bold text-slate-600 dark:text-slate-300">
                Audited {Math.min(orders.length, 6)} of {orders.length} total orders
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Onboarding Banner (When workspace has no products/sales yet - Legacy Parity) ── */}
      {(products.length === 0 || isCleanTenant) && renderOnboarding()}

      {/* ── Slide-Over Receipt Drawer ─────────────────────────────────── */}
      <Sheet
        isOpen={!!selectedOrderForDrawer}
        onClose={() => setSelectedOrderForDrawer(null)}
        width={480}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 800 }}>Order Audit Details</span>
            {selectedOrderForDrawer && (
              <span
                className="v2-mono"
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--surface-border)',
                  color: 'var(--accent)',
                }}
              >
                {selectedOrderForDrawer.saleNumber || selectedOrderForDrawer.id}
              </span>
            )}
          </div>
        }
        description={
          selectedOrderForDrawer
            ? `Completed on ${new Date(selectedOrderForDrawer.timestamp).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })} at ${fmtTime(selectedOrderForDrawer.timestamp)}`
            : ''
        }
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
            <button
              type="button"
              className="v2-btn v2-btn-secondary"
              onClick={() => setSelectedOrderForDrawer(null)}
              style={{ flex: 1 }}
            >
              Close
            </button>
            <button
              type="button"
              className="v2-btn v2-btn-primary"
              onClick={() => {
                window.print();
              }}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Printer size={14} /> Print Receipt
            </button>
          </div>
        }
      >
        {selectedOrderForDrawer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '12px' }}>
            {/* Store & Customer Header Banner */}
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--surface-border)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 700 }}>
                  Customer
                </span>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background:
                      selectedOrderForDrawer.syncStatus === 'Synced'
                        ? 'rgba(16, 185, 129, 0.1)'
                        : selectedOrderForDrawer.syncStatus === 'Failed'
                        ? 'rgba(239, 68, 68, 0.1)'
                        : 'rgba(245, 158, 11, 0.1)',
                    color:
                      selectedOrderForDrawer.syncStatus === 'Synced'
                        ? '#10b981'
                        : selectedOrderForDrawer.syncStatus === 'Failed'
                        ? '#ef4444'
                        : '#f59e0b',
                    border: `1px solid ${
                      selectedOrderForDrawer.syncStatus === 'Synced'
                        ? 'rgba(16, 185, 129, 0.25)'
                        : selectedOrderForDrawer.syncStatus === 'Failed'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : 'rgba(245, 158, 11, 0.25)'
                    }`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {selectedOrderForDrawer.syncStatus === 'Synced' ? (
                    <CheckCircle size={10} />
                  ) : selectedOrderForDrawer.syncStatus === 'Failed' ? (
                    <AlertTriangle size={10} />
                  ) : (
                    <RefreshCw size={10} className="animate-spin" />
                  )}
                  {selectedOrderForDrawer.syncStatus}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: 'var(--surface)',
                    border: '1px solid var(--surface-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <User size={14} style={{ color: 'var(--muted)' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '13px' }}>
                    {selectedOrderForDrawer.customer || 'Walk-In Customer'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <UserCheck size={11} style={{ color: 'var(--accent)' }} />
                      Cashier: <strong style={{ color: 'var(--text)' }}>{selectedOrderForDrawer.cashierName || 'Cashier'}</strong>
                    </span>
                    <span>•</span>
                    <span>Branch: {currentBranchName || 'Main Store'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items List */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '8px' }}>
                Line Items ({selectedOrderForDrawer.items.reduce((s, i) => s + i.quantity, 0)})
              </div>
              <div
                style={{
                  border: '1px solid var(--surface-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-border)', color: 'var(--muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                      <th style={{ padding: '8px 12px' }}>Item</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrderForDrawer.items.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx === selectedOrderForDrawer.items.length - 1 ? 'none' : '1px solid var(--surface-border)',
                        }}
                      >
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{item.name}</div>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--text)' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--muted)' }} className="v2-mono">
                          {fmtCcy(item.price)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text)' }} className="v2-mono">
                          {fmtCcy(item.price * item.quantity)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Financial Totals */}
            <div
              style={{
                border: '1px solid var(--surface-border)',
                borderRadius: '12px',
                padding: '12px 14px',
                background: 'var(--surface-2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: '11px' }}>
                <span>Subtotal</span>
                <span className="v2-mono" style={{ fontWeight: 600 }}>{fmtCcy(selectedOrderForDrawer.total)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: '11px' }}>
                <span>Taxes & Fees</span>
                <span className="v2-mono" style={{ fontWeight: 600 }}>Tsh 0</span>
              </div>
              <div style={{ borderTop: '1px dashed var(--surface-border)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text)' }}>Grand Total</span>
                <span className="v2-mono" style={{ fontWeight: 900, fontSize: '16px', color: 'var(--accent)' }}>
                  {fmtCcy(selectedOrderForDrawer.total)}
                </span>
              </div>
            </div>

            {/* Payment & Tender Details */}
            <div
              style={{
                border: '1px solid var(--surface-border)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', fontWeight: 700 }}>
                Payment Method & Tender
              </span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {(() => {
                  const tb = getTenderBadge(selectedOrderForDrawer.paymentMethod);
                  const TIcon = tb.Icon;
                  return (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: tb.bg,
                        color: tb.color,
                        border: `1px solid ${tb.border}`,
                      }}
                    >
                      <TIcon size={14} />
                      {tb.label}
                    </span>
                  );
                })()}
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  Status: <strong style={{ color: 'var(--text)' }}>{selectedOrderForDrawer.status}</strong>
                </span>
              </div>

              {selectedOrderForDrawer.cashReceived !== undefined && selectedOrderForDrawer.cashReceived > 0 && (
                <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--surface-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>Cash Tendered</span>
                    <span className="v2-mono" style={{ fontWeight: 700, color: 'var(--text)' }}>
                      {fmtCcy(selectedOrderForDrawer.cashReceived)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--muted)', display: 'block', fontSize: '10px' }}>Change Due</span>
                    <span className="v2-mono" style={{ fontWeight: 700, color: (selectedOrderForDrawer.changeDue || 0) > 0 ? '#10b981' : 'var(--text)' }}>
                      {fmtCcy(selectedOrderForDrawer.changeDue || 0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {/* ── 1-Click 80mm Thermal Daily Register Close (Z-Report) Slip Drawer ── */}
      <Sheet isOpen={isZReportOpen} onClose={() => setIsZReportOpen(false)} width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header Bar */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--surface-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Printer size={18} style={{ color: 'var(--accent)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--text)' }}>
                  Daily Register Close (Z-Report)
                </h3>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
                80mm Standard POS Thermal Audit Slip
              </p>
            </div>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              TRA VFD COMPLIANT
            </span>
          </div>

          {/* 80mm Thermal Slip Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px',
              background: 'var(--surface-2)',
            }}
          >
            <div
              id="z-report-thermal-slip"
              style={{
                background: '#ffffff',
                color: '#000000',
                padding: '18px 16px',
                borderRadius: '8px',
                fontFamily: 'monospace, "Courier New", Courier, monospace',
                fontSize: '11.5px',
                lineHeight: '1.4',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0',
              }}
            >
              {/* Store Header */}
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '15px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {currentTenantName || 'KWAKOPOS STORE'}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 600 }}>
                  {currentBranchName || 'Main Store Branch'}
                </div>
                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                  TIN: 124-589-321 · VRN: 40-029831-Z
                </div>
                <div style={{ fontSize: '10px', color: '#475569' }}>
                  Electronic Fiscal Device (EFD / VFD)
                </div>
                <div style={{ fontSize: '12px', fontWeight: 900, marginTop: '6px', borderTop: '1px dashed #94a3b8', borderBottom: '1px dashed #94a3b8', padding: '4px 0' }}>
                  *** DAILY AUDIT Z-REPORT ***
                </div>
              </div>

              {/* Meta information */}
              <div style={{ fontSize: '10.5px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>REPORT NO:</span>
                  <span style={{ fontWeight: 800 }}>Z-REP-{new Date().toISOString().slice(0,10).replace(/-/g, '')}-001</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>STATION / REGISTER:</span>
                  <span>POS-REG-01</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>SHIFT NO:</span>
                  <span>{tillReconciliation.shiftNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OPERATOR:</span>
                  <span>{user?.name || role}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>DATE & TIME:</span>
                  <span>{new Date().toLocaleString()}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000000', margin: '8px 0' }} />

              {/* Turnover Waterfall */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  TURNOVER SUMMARY
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>GROSS SALES:</span>
                  <span style={{ fontWeight: 700 }}>{fmtCcy(stats.grossSales)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>DISCOUNTS ALLOWED:</span>
                  <span>-{fmtCcy(stats.todayDiscounts)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                  <span>RETURNS / REFUNDS ({stats.todayRefundCount}):</span>
                  <span>-{fmtCcy(stats.todayRefunds)}</span>
                </div>
                <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '12px' }}>
                  <span>NET SALES:</span>
                  <span>{fmtCcy(stats.netSales)}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000000', margin: '8px 0' }} />

              {/* Tax & Fiscal Analysis */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  TAX / VAT BREAKDOWN
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>TAXABLE TURNOVER (18%):</span>
                  <span>{fmtCcy(Math.round(stats.netSales / 1.18))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>VAT OUTPUT TAX (18%):</span>
                  <span>{fmtCcy(Math.round(stats.netSales * 0.18 / 1.18))}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>EXEMPT / ZERO-RATED:</span>
                  <span>Tsh 0</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000000', margin: '8px 0' }} />

              {/* Tender Breakdown */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  PAYMENT TENDER AUDIT
                </div>
                {paymentChannelSummary.items.map((ch, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span>{ch.name.toUpperCase()} ({ch.count}):</span>
                    <span style={{ fontWeight: 700 }}>{fmtCcy(ch.volume)}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px dashed #000000', margin: '8px 0' }} />

              {/* Cash Drawer Reconciliation */}
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px' }}>
                  DRAWER RECONCILIATION
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OPENING CASH FLOAT:</span>
                  <span>{fmtCcy(tillReconciliation.openingFloat)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>CASH SALES COLLECTED:</span>
                  <span>+{fmtCcy(tillReconciliation.cashSalesToday)}</span>
                </div>
                {tillReconciliation.cashIn > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PAID IN (ADDITIONAL):</span>
                    <span>+{fmtCcy(tillReconciliation.cashIn)}</span>
                  </div>
                )}
                {tillReconciliation.totalPayouts > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>PAID OUT / DROPS:</span>
                    <span>-{fmtCcy(tillReconciliation.totalPayouts)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #cbd5e1', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                  <span>EXPECTED CASH IN DRAWER:</span>
                  <span>{fmtCcy(tillReconciliation.expectedCash)}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #000000', margin: '8px 0' }} />

              {/* Fiscal Authentication & Signatures */}
              <div style={{ fontSize: '10px', textAlign: 'center', marginTop: '10px' }}>
                <div style={{ fontWeight: 800 }}>TRA VFD FISCALIZATION STATUS</div>
                <div style={{ color: '#475569', margin: '2px 0' }}>
                  TRA VERIFIED RECEIPTS: {traVfdVerifiedCount}
                </div>
                <div style={{ color: '#475569', margin: '2px 0' }}>
                  PENDING FISCALIZATION: {traVfdQueuedCount}
                </div>
                <div style={{ color: '#475569' }}>
                  REJECTED FISCALIZATIONS: {traVfdRejectedCount}
                </div>

                {/* Sign-off lines */}
                <div style={{ marginTop: '24px', textAlign: 'left' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <div>Cashier Signature: ______________________</div>
                  </div>
                  <div>
                    <div>Manager Signature: ______________________</div>
                  </div>
                </div>

                <div style={{ marginTop: '16px', fontSize: '9px', color: '#64748b' }}>
                  *** END OF DAILY Z-REPORT ***
                </div>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--surface-border)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'flex-end',
              background: 'var(--surface)',
            }}
          >
            <button
              type="button"
              onClick={() => setIsZReportOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-darkbg-border hover:bg-slate-100 dark:hover:bg-darkbg-card transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print 80mm Z-Report Slip</span>
            </button>
          </div>
        </div>
      </Sheet>

      {/* ── TRA VFD Quick Management Modal ────────────────────────────────────── */}
      {isVfdModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsVfdModalOpen(false)}
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: "90vh", overflowY: "auto" }}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white" style={{ letterSpacing: "-.01em" }}>
                    TRA VFD Quick Management
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tanzania Revenue Authority Electronic Fiscal Device
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsVfdModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              {/* Power Switch Banner with Tactile Toggle */}
              <div
                className="p-4 rounded-xl border flex items-center justify-between transition-all"
                style={{
                  background: isVfdEnabled ? "rgba(16, 185, 129, 0.08)" : "var(--surface-2)",
                  borderColor: isVfdEnabled ? "rgba(16, 185, 129, 0.35)" : "var(--surface-border)",
                }}
              >
                <div style={{ paddingRight: "1rem" }}>
                  <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Fiscal Device Signing</span>
                    <span
                      className="px-2 py-0.5 text-[10px] font-extrabold rounded-full"
                      style={{
                        background: isVfdEnabled ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.2)",
                        color: isVfdEnabled ? "#10b981" : "var(--text-muted)",
                      }}
                    >
                      {isVfdEnabled ? "ACTIVE (ON)" : "DISABLED (OFF)"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {isVfdEnabled
                      ? "Receipts automatically generate TRA fiscal tokens and queue for background verification."
                      : "Receipt signing is paused. Transactions complete immediately without waiting for fiscal signatures."}
                  </p>
                </div>
                <ToggleSwitch
                  checked={isVfdEnabled}
                  size="lg"
                  onChange={(val) => void handleDashboardVfdToggle(val)}
                  label="TRA VFD Power Toggle"
                />
              </div>

              {/* Real-time Counters */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
                  <div className="text-[11px] text-slate-400 font-semibold">Pending Queue</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
                    {traVfdQueuedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">Verified</div>
                  <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {traVfdVerifiedCount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <div className="text-[11px] text-rose-600 dark:text-rose-400 font-semibold">Rejected</div>
                  <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                    {traVfdRejectedCount}
                  </div>
                </div>
              </div>

              {/* Status & Environment Specs */}
              <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-300 space-y-2 border border-slate-200/50 dark:border-slate-700/50">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Server State:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {traVfdStatus?.status || (isOnline ? "NOT CONNECTED" : "OFFLINE")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Target Environment:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {traVfdStatus?.environment || "TEST (Sandbox)"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Certified Provider:</span>
                  <span className={`font-bold ${traVfdStatus?.configured ? "text-emerald-500" : "text-amber-500"}`}>
                    {traVfdStatus?.configured ? "ONLINE & READY" : "PENDING SETUP"}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => void refreshVfdStatus()}
                  disabled={isRefreshingVfd}
                  className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshingVfd ? "animate-spin" : ""}`} />
                  <span>{isRefreshingVfd ? "Testing..." : "Test Connection"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsVfdModalOpen(false);
                    onNavigate?.("settings");
                    if (setActiveTab) setActiveTab("Fiscal Device (TRA)" as any);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-primary text-white hover:opacity-90 flex items-center gap-1.5 transition-opacity cursor-pointer shadow-sm"
                >
                  <span>Open Full Fiscal Settings</span>
                  <span>&rarr;</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};





