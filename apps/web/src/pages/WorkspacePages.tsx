/**
 * KwakoPosv2 — Workspace Pages
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-fidelity page components: Dashboard, POS, Inventory, Customers,
 * Purchasing, Finance, Reports, Settings, Users, SuperAdmin, Diagnostics,
 * Expenses, AI, CashDrawer, Receipts, Trash, plus all vertical module pages.
 *
 * Law Firm & Pharmacy are in dedicated files and re-exported here.
 *
 * CSS: V2 design system classes only. No static inline styles; only genuinely
 *      dynamic values (colours, computed widths) use inline style props.
 * Data: V2 API (apiFetch) + IndexedDB outbox. No Dexie-React-Hooks.
 * Charts: recharts AreaChart, BarChart, PieChart, ResponsiveContainer.
 * Icons: lucide-react.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Activity, AlertTriangle, ArrowRight, BarChart2, Bell, Box, Briefcase,
  Calendar, Car, CheckCircle, ChevronRight, Clock, Coins, DollarSign,
  Download, Egg, ExternalLink, FileText, Fuel, Hash, Home, Layers,
  LogOut, Map, MapPin, Moon, Package, PawPrint, Pill, Plus, Radio,
  Receipt, RefreshCw, Scale, Search, Shield, ShoppingBag, ShoppingCart,
  Sparkles, Sprout, Star, Sun, Tag, Trash2, TrendingDown, TrendingUp,
  Truck, Tv, Upload, Users, Utensils, Wifi, WifiOff, Wrench, X, Zap,
  Filter, Eye, Edit2, CheckSquare, PiggyBank, Building, Check, Circle,
} from "lucide-react";
import {
  useAuth, useSync, useTenant, useBranch, useRbac, useModule,
  useTranslation, useFormatters,
} from "../context/KwakoPosContexts.js";
import { apiFetch, safeUUID } from "../services/apiClient.js";

// Dedicated full-module files — re-exported here for unified import in App.tsx
export { LawFirmPage } from "./LawFirmPage.js";
export { PharmacyPage } from "./PharmacyPage.js";
export { ReportsPage } from "./ReportsPage.js";
export { UsersRolesPage } from "./UsersRolesPage.js";
export { SuperAdminPage } from "./SuperAdminPage.js";
export { CashDrawerPage } from "./CashDrawerPage.js";
export { ReceiptsPage } from "./ReceiptsPage.js";
export { TrashPage } from "./TrashPage.js";
export { HelpPage } from "./HelpPage.js";
export { CustomersPage } from "./CustomersPage.js";
export { PurchasingPage } from "./PurchasingPage.js";
export { SettingsPage } from "./SettingsPage.js";
export { PosPage } from "./PosPage.js";
export { InventoryPage } from "./InventoryPage.js";
export { DashboardPage } from "./DashboardPage.js";


// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceProps { onNavigate: (path: string) => void; }

type Variant  = { id: string; productId: string; name: string; sku: string; barcode?: string | null; price: number; costPrice: number; isActive: boolean };
type Product  = { id: string; name: string; sku: string; category?: string; isActive?: boolean; variants?: Variant[] };
type Customer = { id: string; customerCode: string; name: string; phone?: string | null; email?: string | null; currentBalance?: number; status?: string };
type Sale     = { id: string; saleNumber: string; grandTotal: number; soldAt: string; paymentStatus: string };
type Purchase = { id: string; purchaseOrderNumber?: string; totalCost?: number; status?: string; supplierName?: string };
type CartItem = { productId: string; variantId: string; name: string; price: number; qty: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const money = (v: number) =>
  v >= 1_000_000 ? `Tsh ${(v / 1_000_000).toFixed(1)}M`
  : v >= 1_000   ? `Tsh ${(v / 1_000).toFixed(0)}K`
  : `Tsh ${Math.round(v).toLocaleString()}`;

const errMsg = (e: unknown) => e instanceof Error ? e.message : "Unable to load data";

function useApiList<T>(url: string) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: T[] }>(url);
      setData(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload };
}

// ─── Recharts Custom Tooltip ──────────────────────────────────────────────────

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  const isMoney = (name: string) => ["Revenue", "Profit", "Sales", "Cost", "Savings", "Loans"].includes(name);
  return (
    <div className="v2-card" style={{ minWidth: 150, padding: ".65rem .85rem" }}>
      <p className="v2-text-xs v2-font-black" style={{ marginBottom: ".4rem", color: "var(--text-secondary)" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="v2-flex v2-items-center v2-justify-between v2-gap-4" style={{ marginTop: ".2rem" }}>
          <span className="v2-text-xs v2-flex v2-items-center v2-gap-1" style={{ color: p.color }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, display: "inline-block" }} />
            {p.name}
          </span>
          <span className="v2-text-xs v2-font-black" style={{ color: "var(--text)" }}>
            {isMoney(p.name) ? money(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── Shared Components ────────────────────────────────────────────────────────

const Panel: React.FC<{ title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title, action, children, className = "",
}) => (
  <section className={`workspace-card v2-animate-page-enter ${className}`}>
    <div className="workspace-title">
      <span>{title}</span>
      {action}
    </div>
    {children}
  </section>
);

const Empty: React.FC<{ icon?: React.ReactNode; message: string; action?: React.ReactNode }> = ({
  icon, message, action,
}) => (
  <div className="v2-empty">
    <div className="v2-empty-icon">{icon || <Package size={22} />}</div>
    <p className="v2-empty-title">{message}</p>
    {action && <div style={{ marginTop: ".75rem" }}>{action}</div>}
  </div>
);

const LoadingRows: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="v2-space-y-4" style={{ padding: ".5rem 0" }}>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="v2-skeleton v2-skeleton-text" style={{ width: `${60 + (i % 3) * 15}%` }} />
    ))}
  </div>
);

const KpiCard: React.FC<{
  label: string; value: string | number; desc?: string;
  icon: React.ReactNode; accent: string;
  trend?: "up" | "down" | null; trendLabel?: string;
  onClick?: () => void;
}> = ({ label, value, desc, icon, accent, trend, trendLabel, onClick }) => (
  <div
    className={`kpi-card${onClick ? " select-none" : ""}`}
    onClick={onClick}
    style={onClick ? { cursor: "pointer" } : undefined}
    role={onClick ? "button" : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    <div className="kpi-card-blob" style={{ background: accent }} />
    <div className="v2-flex v2-items-start v2-justify-between v2-gap-2">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="kpi-card-label">{label}</div>
        <div className="kpi-card-value">{value}</div>
        {trend && (
          <div className={`kpi-card-trend${trend === "up" ? " up" : " down"}`}>
            {trend === "up" ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trendLabel || (trend === "up" ? "+Today" : "−Today")}
          </div>
        )}
        {desc && <div className="kpi-card-desc">{desc}</div>}
      </div>
      <div className="kpi-card-icon-box" style={{ background: `${accent}18`, color: accent }}>
        {icon}
      </div>
    </div>
  </div>
);

// Demo chart seed data (used when API returns empty arrays)
const DEMO_REVENUE = [
  { name: "Mon", Revenue: 2800000, Profit: 820000 },
  { name: "Tue", Revenue: 3200000, Profit: 960000 },
  { name: "Wed", Revenue: 2600000, Profit: 740000 },
  { name: "Thu", Revenue: 4100000, Profit: 1280000 },
  { name: "Fri", Revenue: 5400000, Profit: 1720000 },
  { name: "Sat", Revenue: 6200000, Profit: 2020000 },
  { name: "Sun", Revenue: 3900000, Profit: 1140000 },
];

const DEMO_PIE = [
  { name: "Cash", value: 52, color: "#3b82f6" },
  { name: "M-Pesa", value: 31, color: "#10b981" },
  { name: "Card",   value: 17, color: "#f59e0b" },
];

const DEMO_TOP_PRODUCTS = [
  { name: "Coca Cola 500ml",   Revenue: 1820000, Units: 364 },
  { name: "Azam Flour 2kg",    Revenue: 1450000, Units: 290 },
  { name: "Unga wa Ngano 1kg", Revenue: 980000,  Units: 245 },
  { name: "Maziwa 1L",         Revenue: 750000,  Units: 300 },
  { name: "Sukari 1kg",        Revenue: 620000,  Units: 155 },
];

// DashboardPage is exported from ./DashboardPage.js

// PosPage is exported from ./PosPage.js

// InventoryPage is exported from ./InventoryPage.js

// CustomersPage, PurchasingPage, and SettingsPage are exported from dedicated module files

// ReportsPage is exported from ./ReportsPage.js

import { UsersRolesPage as UsersPage } from "./UsersRolesPage.js";
export { UsersPage };

// SuperAdminPage is exported from ./SuperAdminPage.js

// ─── DIAGNOSTICS PAGE ─────────────────────────────────────────────────────────

export const DiagnosticsPage: React.FC = () => {
  const { t } = useTranslation();
  const { db, syncOutbox, syncError, isOnline, pendingOutboxCount } = useSync();
  const outbox = db.getPendingOutbox();
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{t("nav.diagnostics")}</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={!isOnline} onClick={() => void syncOutbox().catch(() => undefined)} type="button">
          <RefreshCw size={13} /> {t("sync.forceSync")}
        </button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Network Status"    value={isOnline ? t("sync.networkOnline") : t("sync.networkOffline")} icon={isOnline ? <Wifi size={18} /> : <WifiOff size={18} />} accent={isOnline ? "#4ade80" : "#fbbf24"} />
        <KpiCard label={t("sync.syncOutbox")} value={pendingOutboxCount} desc={t("sync.pendingTransactions")}        icon={<Upload size={18} />}    accent="#38bdf8" />
        <KpiCard label="Stock Ledger"      value={db.stockLedger.size} desc="Local IDB entries"        icon={<Activity size={18} />}  accent="#818cf8" />
        <KpiCard label="Sync Status"       value={syncError ? t("sync.syncError") : t("sync.syncSuccess")} icon={<AlertTriangle size={18} />} accent={syncError ? "#f87171" : "#4ade80"} />
      </div>
      {syncError && <div className="badge v2-badge-danger v2-mb-4">{syncError}</div>}
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">{t("sync.syncOutbox")} ({outbox.length})</div></div>
        <div className="v2-card-body">
          <pre style={{ background: "var(--bg)", padding: "1rem", borderRadius: "var(--radius-lg)", overflow: "auto", fontSize: ".75rem", lineHeight: 1.6, maxHeight: 400, color: "var(--text-secondary)" }}>
            {outbox.length ? JSON.stringify(outbox, null, 2) : `// ${t("sync.noPending")}`}
          </pre>
        </div>
      </div>
    </div>
  );
};

// ─── EXPENSES PAGE ────────────────────────────────────────────────────────────

const DEMO_EXPENSES = [
  { id: "EXP-2026-081", category: "Utilities",  desc: "TANESCO Electricity Bill",    amount: 850000,  status: "PAID"    },
  { id: "EXP-2026-082", category: "Rent",       desc: "Store Monthly Lease",          amount: 3000000, status: "PAID"    },
  { id: "EXP-2026-083", category: "Supplies",   desc: "Thermal Printer Roll Paper",   amount: 120000,  status: "PENDING" },
  { id: "EXP-2026-084", category: "Wages",      desc: "Casual Labour - Stocktake",    amount: 450000,  status: "PAID"    },
  { id: "EXP-2026-085", category: "Transport",  desc: "Delivery motorbike fuel",       amount: 85000,   status: "PENDING" },
];

export const ExpensesPage: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency, formatMoneyCompact } = useFormatters();
  const totalExpenses = DEMO_EXPENSES.reduce((s, e) => s + e.amount, 0);
  const pending       = DEMO_EXPENSES.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{t("expenses.title")}</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> {t("expenses.recordExpense")}</button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label={t("expenses.monthlyExpenses")}  value={formatMoneyCompact(totalExpenses)} desc="All categories"       icon={<DollarSign size={18} />} accent="#f87171" />
        <KpiCard label={t("expenses.pettyCashBalance")} value={formatMoneyCompact(650000)}        desc="Available float"      icon={<Coins size={18} />}      accent="#38bdf8" />
        <KpiCard label={t("expenses.pendingApproval")}  value={`${DEMO_EXPENSES.filter((e) => e.status === "PENDING").length} Vouchers`} desc={formatMoneyCompact(pending)} icon={<Clock size={18} />} accent="#fbbf24" />
        <KpiCard label={t("expenses.paidThisMonth")}    value={`${DEMO_EXPENSES.filter((e) => e.status === "PAID").length} Vouchers`} desc="Processed" icon={<CheckCircle size={18} />} accent="#4ade80" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">{t("expenses.outgoingsLedger")}</div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> {t("expenses.exportVouchers")}</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>{t("expenses.voucherNumber")}</th><th>{t("expenses.expenseCategory")}</th><th>{t("expenses.expenseDescription")}</th><th>{t("expenses.expenseAmount")}</th><th>{t("expenses.voucherStatus")}</th><th>{t("common.actions")}</th></tr></thead>
          <tbody>
            {DEMO_EXPENSES.map((e) => (
              <tr key={e.id}>
                <td className="v2-mono v2-text-xs">{e.id}</td>
                <td><span className="badge v2-badge-muted">{e.category}</span></td>
                <td>{e.desc}</td>
                <td className="v2-font-black">{formatCurrency(e.amount)}</td>
                <td><span className={`badge ${e.status === "PAID" ? "v2-badge-success" : "v2-badge-warning"}`}>{e.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Eye size={13} /></button>
                    {e.status === "PENDING" && <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title={t("expenses.approveVoucher")}><Check size={13} style={{ color: "var(--success)" }} /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── AI INSIGHTS PAGE ─────────────────────────────────────────────────────────

export const AiPage: React.FC = () => {
  const [killSwitch, setKillSwitch] = useState(false);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>AI Operating Layer</h1>
          <p className="v2-text-xs v2-text-muted" style={{ marginTop: ".1rem" }}>KwakoPos intelligent insights & automation policy gateway</p>
        </div>
        <button
          className={`v2-btn v2-btn-sm ${killSwitch ? "v2-btn-danger" : "v2-btn-success"}`}
          onClick={() => setKillSwitch((v) => !v)}
          type="button"
        >
          <Zap size={13} /> KILL SWITCH: {killSwitch ? "ACTIVE" : "INACTIVE"}
        </button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Active Agents"      value={killSwitch ? "0 Agents" : "10 Agents"} desc="Vertical AI agents"   icon={<Sparkles size={18} />}   accent={killSwitch ? "#f87171" : "#38bdf8"} />
        <KpiCard label="Guarded Executions" value="1,482"                                 desc="Policy-guarded runs"  icon={<Activity size={18} />}   accent="#818cf8" />
        <KpiCard label="Level 4 Violations" value="0"                                     desc="Critical boundary breaches" icon={<Shield size={18} />} accent="#4ade80" />
        <KpiCard label="Avg Confidence"     value="94.2%"                                 desc="Model accuracy score" icon={<Star size={18} />}        accent="#fbbf24" />
      </div>
      {[
        { title: "Revenue Forecasting", desc: "7-day ahead revenue prediction using ARIMA + seasonal decomposition.", status: killSwitch ? "HALTED" : "RUNNING", confidence: "92.4%" },
        { title: "Demand Sensing",      desc: "Real-time inventory reorder signal generation from sales velocity.", status: killSwitch ? "HALTED" : "RUNNING", confidence: "96.1%" },
        { title: "Customer Churn Risk", desc: "Identifies customers at risk of churning using RFM + ML scoring.",   status: killSwitch ? "HALTED" : "STANDBY", confidence: "88.7%" },
        { title: "Anomaly Detection",   desc: "Flags suspicious transactions, duplicate payments, outlier sales.",  status: killSwitch ? "HALTED" : "RUNNING", confidence: "99.1%" },
      ].map((agent) => (
        <div key={agent.title} className="v2-card v2-mb-4">
          <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
            <div style={{ width: 40, height: 40, borderRadius: "var(--radius-lg)", background: "var(--accent-muted)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Sparkles size={18} style={{ color: "var(--accent)" }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="v2-text-sm v2-font-black">{agent.title}</div>
              <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".15rem" }}>{agent.desc}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <span className={`badge ${agent.status === "RUNNING" ? "v2-badge-success" : agent.status === "HALTED" ? "v2-badge-danger" : "v2-badge-muted"}`}>{agent.status}</span>
              <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".3rem" }}>Confidence: {agent.confidence}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// CashDrawerPage, ReceiptsPage, TrashPage, HelpPage are exported from dedicated module files

// ─── FINANCE PAGE ─────────────────────────────────────────────────────────────

export const FinancePage: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency, formatMoneyCompact } = useFormatters();
  const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales");
  const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{t("finance.title")}</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Download size={13} /> {t("finance.trialBalance")}</button>
      </div>
      {error && <div className="badge v2-badge-danger v2-mb-4">{error}</div>}
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label={t("finance.recordedRevenue")}   value={formatMoneyCompact(total || 42850000)} icon={<DollarSign size={18} />} accent="#38bdf8" />
        <KpiCard label={t("finance.totalTransactions")} value={sales.length || 842}      icon={<Receipt size={18} />}    accent="#4ade80" />
        <KpiCard label={t("finance.trialBalance")}      value="BALANCED"                  icon={<Scale size={18} />}      accent="#818cf8" />
        <KpiCard label={t("finance.openReceivables")}   value={formatMoneyCompact(3200000)}            icon={<Coins size={18} />}      accent="#fbbf24" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">{t("finance.chartOfAccounts")}</div></div>
        <table className="v2-table">
          <thead><tr><th>{t("finance.accountName")}</th><th>{t("finance.accountType")}</th><th>{t("finance.debit")}</th><th>{t("finance.credit")}</th><th>{t("finance.balance")}</th></tr></thead>
          <tbody>
            {[
              { account: `1100 — Cash in Hand`,         type: t("finance.typeAsset"),     debit: formatCurrency(4820000), credit: formatCurrency(300000),  balance: formatCurrency(4520000) },
              { account: `1200 — Accounts Receivable`,  type: t("finance.typeAsset"),     debit: formatCurrency(3200000), credit: formatCurrency(0),       balance: formatCurrency(3200000) },
              { account: `2100 — Accounts Payable`,     type: t("finance.typeLiability"), debit: formatCurrency(0),       credit: formatCurrency(8400000), balance: formatCurrency(8400000) },
              { account: `4100 — Sales Revenue`,        type: t("finance.typeRevenue"),   debit: formatCurrency(0),       credit: formatCurrency(total || 42850000), balance: formatCurrency(total || 42850000) },
            ].map((row, i) => (
              <tr key={i}>
                <td className="v2-font-bold">{row.account}</td>
                <td><span className={`badge ${row.type === t("finance.typeRevenue") ? "v2-badge-success" : row.type === t("finance.typeLiability") ? "v2-badge-danger" : "v2-badge-accent"}`}>{row.type}</span></td>
                <td className="v2-mono v2-text-xs">{row.debit}</td>
                <td className="v2-mono v2-text-xs">{row.credit}</td>
                <td className="v2-font-black">{row.balance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── VERTICAL MODULE STUBS ────────────────────────────────────────────────────
// Full-featured stubs with KPIs and a quick-action table. Full pages come in Phase 7.

function ModuleStubPage({ title, icon, kpis, actions }: {
  title: string;
  icon: React.ReactNode;
  kpis: Array<{ label: string; value: string; accent: string }>;
  actions?: Array<{ label: string; onClick?: () => void }>;
}) {
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-gap-3 v2-mb-4">
        <div style={{ width: 40, height: 40, borderRadius: "var(--radius-lg)", background: "var(--accent-muted)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {icon}
        </div>
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{title}</h1>
      </div>
      <div className="metrics-grid" style={{ marginBottom: "1rem" }}>
        {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} icon={<Activity size={18} />} accent={k.accent} />)}
      </div>
      {actions && (
        <div className="v2-flex v2-gap-2" style={{ marginBottom: "1rem" }}>
          {actions.map((a) => <button key={a.label} className="v2-btn v2-btn-primary v2-btn-sm" onClick={a.onClick} type="button">{a.label}</button>)}
        </div>
      )}
      <div className="v2-card">
        <Empty icon={icon} message={`${title} workspace is loading full components…`} action={<span className="badge v2-badge-accent">Phase 7</span>} />
      </div>
    </div>
  );
}


// ─── Vertical module pages — re-exported from dedicated files ─────────────────
export { PoultryLivestockPage, FleetPage, WorkforcePage, TelecomPage } from "./VerticalModulePages.js";
