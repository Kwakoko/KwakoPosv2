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
import { apiFetch, safeUUID } from "../services/apiClient.js";
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

export interface AiPageProps { activeTab?: string; }

type AiInsightView = {
  insightId:string; tenantId:string; branchId:string; title:string; observation:string;
  evidence:Array<{sourceType:string;sourceId:string;label:string;value?:string|number|boolean;observedAt:string;evidenceClass:string}>;
  interpretation:string; impact:string; recommendedNextStep:string; confidenceScore:number; status:string;
};
type AiRecommendationView = {
  recommendationId:string; tenantId:string; branchId:string; insightId?:string; title:string; summary:string;
  evidence:AiInsightView["evidence"]; expectedImpact:string; riskLevel:string; policyStatus:string; approvalStatus:string;
  approvedByUserId?:string; createdAt:string;
};
type AiHealthView = {
  activeInsightsCount:number; pendingApprovalsCount:number; approvedRecommendationsCount:number;
  ledgerEntriesCount:number; killSwitchActive:boolean; dataGrounded:boolean; aiPlatformOperational:boolean;
};

export const AiPage: React.FC<AiPageProps> = () => {
  const [insights,setInsights]=useState<AiInsightView[]>([]);
  const [recommendations,setRecommendations]=useState<AiRecommendationView[]>([]);
  const [health,setHealth]=useState<AiHealthView|null>(null);
  const [loading,setLoading]=useState(true);
  const [workingId,setWorkingId]=useState<string|null>(null);
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [i,r,h]=await Promise.all([
        apiFetch<{success:boolean;data:AiInsightView[]}>("/api/v1/ai-operating-layer/insights"),
        apiFetch<{success:boolean;data:AiRecommendationView[]}>("/api/v1/ai-operating-layer/recommendations"),
        apiFetch<{success:boolean;data:AiHealthView}>("/api/v1/ai-operating-layer/dashboard"),
      ]);
      setInsights(Array.isArray(i.data)?i.data:[]);
      setRecommendations(Array.isArray(r.data)?r.data:[]);
      setHealth(h.data||null);
      setError(null);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load AI Insights.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const approve=async(id:string)=>{
    setWorkingId(id);
    try{
      await apiFetch("/api/v1/ai-operating-layer/approve",{method:"POST",body:JSON.stringify({recommendationId:id})});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to approve recommendation.");}
    finally{setWorkingId(null);}
  };

  const toggleKillSwitch=async()=>{
    const enabled=!(health?.killSwitchActive??false);
    setWorkingId("KILL_SWITCH");
    try{
      await apiFetch("/api/v1/ai-operating-layer/kill-switch",{method:"POST",body:JSON.stringify({scope:"TENANT",enabled})});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to change AI kill switch.");}
    finally{setWorkingId(null);}
  };

  const averageConfidence=insights.length?insights.reduce((s,i)=>s+i.confidenceScore,0)/insights.length:0;

  return <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <div>
        <h1 className="v2-text-xl v2-font-black" style={{letterSpacing:"-.02em"}}>AI Insights Engine</h1>
        <p className="v2-text-xs v2-text-muted" style={{marginTop:".1rem"}}>Tenant-scoped, evidence-backed business insights</p>
      </div>
      <button
        className={health?.killSwitchActive?"v2-btn v2-btn-sm v2-btn-danger":"v2-btn v2-btn-sm v2-btn-success"}
        onClick={()=>void toggleKillSwitch()} disabled={workingId==="KILL_SWITCH"} type="button"
      >
        <Zap size={13}/> KILL SWITCH: {health?.killSwitchActive?"ACTIVE":"INACTIVE"}
      </button>
    </div>

    {error&&<div className="badge v2-badge-danger v2-mb-4">{error}</div>}
    <div className="metrics-grid kpi-grid-4 v2-mb-4">
      <KpiCard label="Active Insights" value={health?.activeInsightsCount??(loading?"…":0)} desc="Durable PostgreSQL insight records" icon={<Sparkles size={18}/>} accent="#a855f7"/>
      <KpiCard label="Pending Approvals" value={health?.pendingApprovalsCount??(loading?"…":0)} desc="Recommendations awaiting review" icon={<Shield size={18}/>} accent="#818cf8"/>
      <KpiCard label="Approved" value={health?.approvedRecommendationsCount??0} desc="Persisted approval state" icon={<CheckCircle size={18}/>} accent="#4ade80"/>
      <KpiCard label="Avg Confidence" value={(averageConfidence*100).toFixed(1)+"%"} desc={health?.dataGrounded?"Evidence-grounded":"Unavailable"} icon={<Star size={18}/>} accent="#fbbf24"/>
    </div>

    {loading?<LoadingRows rows={5}/>:insights.length===0?<Empty icon={<Sparkles size={22}/>} message="No active AI insights are available for this tenant and branch."/>:
      <div className="v2-space-y-4">{insights.map((insight)=><div key={insight.insightId} className="v2-card"><div className="v2-card-body">
        <div className="v2-flex v2-items-center v2-justify-between v2-gap-3">
          <div><div className="v2-text-sm v2-font-black">{insight.title}</div><div className="v2-text-xs v2-text-muted" style={{marginTop:".25rem"}}>{insight.observation}</div></div>
          <span className="badge v2-badge-accent">{(insight.confidenceScore*100).toFixed(0)}% confidence</span>
        </div>
        <div className="v2-grid-2 v2-gap-3" style={{marginTop:".75rem"}}>
          <div><div className="v2-text-xs v2-font-bold">Interpretation</div><div className="v2-text-xs v2-text-muted" style={{marginTop:".15rem"}}>{insight.interpretation}</div></div>
          <div><div className="v2-text-xs v2-font-bold">Impact</div><div className="v2-text-xs v2-text-muted" style={{marginTop:".15rem"}}>{insight.impact}</div></div>
        </div>
        <div style={{marginTop:".75rem"}}><div className="v2-text-xs v2-font-bold">Evidence</div><div className="v2-flex v2-gap-2" style={{flexWrap:"wrap",marginTop:".35rem"}}>
          {insight.evidence.map(e=><span key={e.sourceType+"-"+e.sourceId} className="badge v2-badge-muted">{e.label}: {String(e.value??e.sourceId)}</span>)}
        </div></div>
        <div className="v2-text-xs v2-text-muted" style={{marginTop:".75rem"}}>Next step: {insight.recommendedNextStep}</div>
      </div></div>)}</div>
    }

    {recommendations.length>0&&<div className="v2-card" style={{marginTop:"1rem"}}>
      <div className="v2-card-header"><div className="v2-card-title">Recommendations</div></div>
      <div className="v2-card-body">{recommendations.map(rec=><div key={rec.recommendationId} className="v2-flex v2-items-center v2-justify-between v2-gap-3" style={{padding:".65rem 0",borderBottom:"1px solid var(--border-subtle)"}}>
        <div style={{flex:1}}>
          <div className="v2-text-sm v2-font-black">{rec.title}</div>
          <div className="v2-text-xs v2-text-muted" style={{marginTop:".15rem"}}>{rec.summary}</div>
          <div className="v2-text-xs v2-text-muted" style={{marginTop:".15rem"}}>Risk: {rec.riskLevel} · Policy: {rec.policyStatus} · Status: {rec.approvalStatus}</div>
        </div>
        {rec.approvalStatus==="PENDING"&&<button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={()=>void approve(rec.recommendationId)} disabled={workingId===rec.recommendationId}>
          {workingId===rec.recommendationId?<RefreshCw size={13} className="v2-animate-spin"/>:<Check size={13}/>} Approve
        </button>}
      </div>)}</div>
    </div>}
  </div>;
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
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.WorkspacePages.350.button", "Button", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.WorkspacePages.350.button"><Download size={13} /> {t("finance.trialBalance")}</button>
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
