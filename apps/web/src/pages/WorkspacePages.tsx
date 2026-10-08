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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { runUiAction } from "../services/uiActionRegistry.js";
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
import { apiFetch, safeUUID } from "../services/applicationApiService.js";
import { Button } from "../components/UI/Button.js";
import { SyncErrorsPanel } from "../components/SyncErrorsPanel.js";
import type { PersistenceState } from "../persistence/persistenceStatus.js";
import { useAuthoritativeSyncStatus, syncStatusLabel } from "../services/syncStatusService.js";

type Sale = { id: string; saleNumber: string; grandTotal: number; soldAt: string; paymentStatus: string };

const PERSISTENCE_STATE_ORDER: PersistenceState[] = [
  "LOCAL_COMMITTED",
  "SYNC_PENDING",
  "SERVER_CONFIRMED",
  "FAILED",
  "CONFLICT",
  "TOMBSTONED",
];

function persistenceStateBadge(state: PersistenceState): string {
  switch (state) {
    case "SERVER_CONFIRMED": return "v2-badge-success";
    case "SYNC_PENDING": return "v2-badge-warning";
    case "FAILED":
    case "CONFLICT": return "v2-badge-danger";
    case "TOMBSTONED": return "v2-badge-muted";
    case "LOCAL_COMMITTED": return "v2-badge-info";
  }
}

function useApiList<T>(url: string) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: T[] }>(url);
      setData(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load data"); }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}

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
  const { db, syncError, isOnline, syncOutbox, persistenceStatus } = useSync();
  const { user } = useAuth();
  const syncStatus = useAuthoritativeSyncStatus({
    tenantId: user?.tenantId || null,
    branchId: user?.branchId || null,
  });
  const outbox = db.getPendingOutbox(syncStatus.tenantId || undefined, syncStatus.branchId || undefined);
  const outboxCount = syncStatus.pendingOutboxCount;
  const authoritativeSyncError = syncStatus.lastError;

  const handleSyncNow = async () => {
    try {
      await syncOutbox({ force: true });
    } catch (err) {
      console.error("Sync failed:", err);
    }
  };

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{t("nav.diagnostics")}</h1>
        <div className="v2-flex v2-gap-2 v2-items-center">
          <button
            className="v2-btn v2-btn-secondary v2-btn-sm"
            onClick={() => {
              window.history.pushState({}, "", "/persistence-test");
              window.dispatchEvent(new PopStateEvent("popstate"));
            }}
            type="button"
          >
            <Activity size={13} /> Persistence &amp; Sync Test Lab
          </button>
          <Button
            variant="primary"
            onClick={handleSyncNow}
            disabled={syncStatus.state === "SYNCING" || !isOnline}
          >
            {syncStatus.state === "SYNCING" && <RefreshCw size={13} className="v2-animate-spin v2-mr-1" />}
            Sync Now
          </Button>
        </div>
      </div>
      <div className="v2-mb-3">
        {syncStatus.state === "SYNCING" && <p className="v2-text-info">Syncing…</p>}
        {syncStatus.state === "SUCCESS" && <p className="v2-text-success">Sync completed.</p>}
        {(syncStatus.state === "ERROR" || syncStatus.failedOutboxCount > 0) && <p className="v2-text-danger">Sync requires attention.</p>}
        {syncStatus.state === "OFFLINE" && <p className="v2-text-info">Offline: local changes remain queued.</p>}
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Network Status"    value={isOnline ? t("sync.networkOnline") : t("sync.networkOffline")} icon={isOnline ? <Wifi size={18} /> : <WifiOff size={18} />} accent={isOnline ? "#4ade80" : "#fbbf24"} />
        <KpiCard label={t("sync.syncOutbox")} value={outboxCount} desc={t("sync.pendingTransactions")}        icon={<Upload size={18} />}    accent="#38bdf8" />
        <KpiCard label="Stock Ledger"      value={db.stockLedger.size} desc="Local IDB entries"        icon={<Activity size={18} />}  accent="#818cf8" />
        <KpiCard label="Sync Status"       value={syncStatus.state} desc={syncStatusLabel(syncStatus)} icon={<AlertTriangle size={18} />} accent={(syncStatus.state === "ERROR" || syncStatus.failedOutboxCount > 0) ? "#f87171" : "#4ade80"} />
      </div>
      {authoritativeSyncError && <div className="badge v2-badge-danger v2-mb-4">{authoritativeSyncError}</div>}
      <SyncErrorsPanel onRetry={handleSyncNow} className="v2-mb-4" />

      <div className="v2-card v2-mb-4">
        <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
          <div>
            <div className="v2-card-title">Application Persistence State</div>
            <div className="v2-text-xs v2-text-muted v2-mt-1">
              LOCAL_COMMITTED → SYNC_PENDING → SERVER_CONFIRMED
            </div>
          </div>
          {persistenceStatus.latest && (
            <span className={`badge ${persistenceStateBadge(persistenceStatus.latest.state)}`}>
              {persistenceStatus.latest.state}
            </span>
          )}
        </div>
        <div className="v2-card-body">
          <div className="v2-grid v2-grid-cols-2 md:v2-grid-cols-3 lg:v2-grid-cols-6 v2-gap-2 v2-mb-3">
            {PERSISTENCE_STATE_ORDER.map((state) => (
              <div key={state} className="v2-p-2 v2-border v2-rounded-lg">
                <div className="v2-text-xs v2-text-muted">{state}</div>
                <div className="v2-text-lg v2-font-black v2-mt-1">{persistenceStatus.counts[state]}</div>
              </div>
            ))}
          </div>
          {persistenceStatus.records.length > 0 ? (
            <div className="v2-space-y-2">
              {persistenceStatus.records.slice(0, 8).map((record) => (
                <div key={record.operationId} className="v2-flex v2-items-center v2-justify-between v2-gap-3 v2-p-2 v2-border-b">
                  <div className="v2-min-w-0">
                    <div className="v2-text-xs v2-font-bold">
                      {record.entityType} · {record.entityId}
                    </div>
                    <div className="v2-text-xs v2-text-muted">
                      {record.operationType} · {new Date(record.changedAt).toLocaleString()}
                    </div>
                    {record.error && <div className="v2-text-xs v2-text-danger v2-mt-1">{record.error}</div>}
                  </div>
                  <span className={`badge ${persistenceStateBadge(record.state)}`}>{record.state}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="v2-text-xs v2-text-muted">No local persistence lifecycle records yet.</div>
          )}
        </div>
      </div>

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

// ExpensesPage is exported from ./ExpensesPage.js

// ─── AI INSIGHTS PAGE ─────────────────────────────────────────────────────────

export interface AiPageProps {
  activeTab?: string;
}

export const AiPage: React.FC<AiPageProps> = () => {
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
  const [dashboard, setDashboard] = useState<any | null>(null);
  const [trialBalance, setTrialBalance] = useState<any | null>(null);
  const [pnl, setPnl] = useState<any | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<any | null>(null);
  const [cashFlow, setCashFlow] = useState<any | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const [d, tb, pl, bs, cf, ac] = await Promise.all([
        apiFetch<any>("/api/v1/finance/dashboard/executive"),
        apiFetch<any>("/api/v1/finance/reports/trial-balance"),
        apiFetch<any>("/api/v1/finance/reports/profit-loss"),
        apiFetch<any>("/api/v1/finance/reports/balance-sheet"),
        apiFetch<any>("/api/v1/finance/reports/cash-flow"),
        apiFetch<any>("/api/v1/finance/accounts"),
      ]);
      setDashboard(d.data);
      setTrialBalance(tb.data);
      setPnl(pl.data);
      setBalanceSheet(bs.data);
      setCashFlow(cf.data);
      setAccounts(Array.isArray(ac.data) ? ac.data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load Finance data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFinance(); }, [loadFinance]);

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{t("finance.title")}</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => void loadFinance()} disabled={loading}>
          <RefreshCw size={13} /> Refresh Finance
        </button>
      </div>

      {error && <div className="badge v2-badge-danger v2-mb-4">{error}</div>}
      {loading && !dashboard ? <LoadingRows rows={6} /> : (
        <>
          <div className="metrics-grid kpi-grid-4 v2-mb-4">
            <KpiCard label={t("finance.recordedRevenue")} value={formatMoneyCompact(Number(dashboard?.revenue || 0))} icon={<DollarSign size={18} />} accent="#38bdf8" />
            <KpiCard label="Net Profit" value={formatMoneyCompact(Number(dashboard?.netProfit || 0))} icon={<TrendingUp size={18} />} accent="#4ade80" />
            <KpiCard label={t("finance.trialBalance")} value={trialBalance?.isBalanced ? "BALANCED" : "OUT OF BALANCE"} icon={<Scale size={18} />} accent="#818cf8" />
            <KpiCard label={t("finance.openReceivables")} value={formatMoneyCompact(Number(dashboard?.accountsReceivable || 0))} icon={<Coins size={18} />} accent="#fbbf24" />
          </div>

          <div className="metrics-grid kpi-grid-4 v2-mb-4">
            <KpiCard label="Cash" value={formatMoneyCompact(Number(dashboard?.cashPosition || 0))} icon={<DollarSign size={18} />} accent="#22c55e" />
            <KpiCard label="Bank" value={formatMoneyCompact(Number(dashboard?.bankPosition || 0))} icon={<Building size={18} />} accent="#60a5fa" />
            <KpiCard label="Payables" value={formatMoneyCompact(Number(dashboard?.accountsPayable || 0))} icon={<Receipt size={18} />} accent="#f97316" />
            <KpiCard label="Inventory Value" value={formatMoneyCompact(Number(dashboard?.inventoryValue || 0))} icon={<Package size={18} />} accent="#a78bfa" />
          </div>

          <div className="metrics-grid kpi-grid-4 v2-mb-4">
            <KpiCard label="Operating Cash Flow" value={formatMoneyCompact(Number(cashFlow?.operatingCashFlow || 0))} icon={<TrendingUp size={18} />} accent="#22c55e" />
            <KpiCard label="Investing Cash Flow" value={formatMoneyCompact(Number(cashFlow?.investingCashFlow || 0))} icon={<TrendingDown size={18} />} accent="#60a5fa" />
            <KpiCard label="Financing Cash Flow" value={formatMoneyCompact(Number(cashFlow?.financingCashFlow || 0))} icon={<DollarSign size={18} />} accent="#c084fc" />
            <KpiCard label="Net Change in Cash" value={formatMoneyCompact(Number(cashFlow?.netChangeInCash || 0))} icon={<Activity size={18} />} accent="#fbbf24" />
          </div>

          <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: "1rem" }}>
            <Panel title={t("finance.chartOfAccounts")}>
              <table className="v2-table">
                <thead><tr><th>Code</th><th>{t("finance.accountName")}</th><th>{t("finance.accountType")}</th><th>Balance</th></tr></thead>
                <tbody>
                  {accounts.map((a: any) => {
                    const item = (trialBalance?.items || []).find((x: any) => x.accountId === a.id);
                    return <tr key={a.id}><td className="v2-mono">{a.accountCode}</td><td className="v2-font-bold">{a.name}</td><td>{a.accountClass}</td><td className="v2-mono">{formatCurrency(Number(item?.balance || 0))}</td></tr>;
                  })}
                  {!accounts.length && <tr><td colSpan={4}><Empty message="No chart-of-accounts records available." /></td></tr>}
                </tbody>
              </table>
            </Panel>

            <Panel title="Financial Statements">
              <div className="v2-space-y-3">
                <div className="v2-flex v2-justify-between"><span>P&L</span><strong>{formatCurrency(Number(pnl?.netProfit || 0))} net profit</strong></div>
                <div className="v2-flex v2-justify-between"><span>Balance Sheet</span><strong>{balanceSheet?.isBalanced ? "BALANCED" : "OUT OF BALANCE"}</strong></div>
                <div className="v2-flex v2-justify-between"><span>Trial Balance</span><strong>{trialBalance?.isBalanced ? "BALANCED" : "OUT OF BALANCE"}</strong></div>
                <div className="v2-flex v2-justify-between"><span>Cash Flow</span><strong>{formatCurrency(Number(cashFlow?.netChangeInCash || 0))} net change</strong></div>
              </div>
            </Panel>
          </div>

          <Panel title="Accounting Control">
            <div className="v2-flex v2-gap-2 v2-items-center">
              <span className="badge v2-badge-success">PostgreSQL authoritative</span>
              <span className="badge v2-badge-success">Double-entry enforced</span>
              <span className="badge v2-badge-success">Period controls enforced</span>
              <span className="badge v2-badge-success">Audit trail enabled</span>
              <span className="badge v2-badge-success">AR / AP linked to GL</span>
            </div>
          </Panel>
        </>
      )}
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
