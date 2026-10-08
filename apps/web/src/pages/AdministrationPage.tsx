import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Building2, CheckCircle2, CreditCard, Database, LockKeyhole, PackageCheck, RefreshCw, Save, Shield, Users, WalletCards } from "lucide-react";
import { apiFetch } from "../services/applicationApiService.js";
import { useBranch, useTenant } from "../context/KwakoPosContexts.js";

type AdministrationTab =
  | "tenant" | "branches" | "users" | "roles" | "subscription" | "billing"
  | "modules" | "system" | "security" | "audit";

interface BranchRecord {
  id: string;
  name: string;
  code: string;
  isMain: boolean;
}
interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId?: string;
  branchName?: string;
  status: string;
}
interface RoleRecord {
  id: string;
  name: string;
  description?: string;
  isSystemRole?: boolean;
  permissions: string[];
}
interface TenantState {
  tenantId: string;
  businessName?: string;
  branchName?: string;
  branchCode?: string;
  status?: string;
  industry?: string;
  modules?: string[];
  country?: string;
  currency?: string;
  timezone?: string;
  locale?: string;
  branchId?: string;
  completedAt?: string | null;
}
interface ModuleEntry {
  id: string;
  name: string;
  industry: string | null;
  description: string;
  status: string;
  source?: string;
}
interface SubscriptionRecord {
  id?: string;
  status?: string;
  planName?: string;
  plan?: { name?: string; code?: string; price?: number; interval?: string };
  currentPeriodPrice?: number;
  amount?: number;
  currency?: string;
  billingInterval?: string;
}
interface InvoiceRecord {
  id?: string;
  invoiceNumber?: string;
  status?: string;
  total?: number;
  amount?: number;
  balanceDue?: number;
  currency?: string;
  dueDate?: string;
  createdAt?: string;
}
interface AuditRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  timestamp: string;
  details: Record<string, unknown>;
}

const TABS: Array<{ id: AdministrationTab; label: string; icon: React.ElementType }> = [
  { id: "tenant", label: "Tenant", icon: Building2 },
  { id: "branches", label: "Branches", icon: Database },
  { id: "users", label: "Users", icon: Users },
  { id: "roles", label: "Roles & Permissions", icon: Shield },
  { id: "subscription", label: "Subscription", icon: CreditCard },
  { id: "billing", label: "Billing", icon: WalletCards },
  { id: "modules", label: "Feature Modules", icon: PackageCheck },
  { id: "system", label: "System Configuration", icon: Database },
  { id: "security", label: "Security Configuration", icon: LockKeyhole },
  { id: "audit", label: "Audit Logs", icon: Activity },
];

const SYSTEM_SETTING_KEYS = [
  "business.profile",
  "localization.config",
  "pos.config",
  "tax.config",
  "inventory.config",
  "notifications.config",
  "sync.config",
  "integrations.config",
];

function formatMoney(value: unknown, currency = "TZS") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-TZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function valueFromSettings(settings: any, key: string) {
  return settings?.[key]?.value ?? settings?.[key] ?? {};
}

export const AdministrationPage: React.FC<{ onNavigate?: (path: string) => void }> = ({ onNavigate }) => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();

  const [activeTab, setActiveTab] = useState<AdministrationTab>("tenant");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenant, setTenant] = useState<TenantState | null>(null);
  const [tenantName, setTenantName] = useState(currentTenantName || "");
  const [mainBranchName, setMainBranchName] = useState(currentBranchName || "");
  const [mainBranchCode, setMainBranchCode] = useState("");

  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchCode, setNewBranchCode] = useState("");

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);

  const [plans, setPlans] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [billingKpis, setBillingKpis] = useState<any>(null);

  const [moduleCatalog, setModuleCatalog] = useState<ModuleEntry[]>([]);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  const [settings, setSettings] = useState<Record<string, any>>({});
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<AuditRecord[]>([]);

  const navigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const load = useCallback(async () => {
    if (!currentTenantId) {
      setError("No active tenant context is available.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tenantRes, branchRes, usersRes, rolesRes, plansRes, subRes, invoiceRes, kpiRes, moduleRes, settingsRes, auditRes] = await Promise.all([
        apiFetch<{ success: boolean; data: TenantState }>(`/api/v1/onboarding/tenants/${currentTenantId}`),
        apiFetch<{ success: boolean; data: BranchRecord[] }>("/api/v1/branches"),
        apiFetch<{ success: boolean; data: UserRecord[] }>("/api/v1/users"),
        apiFetch<{ success: boolean; data: RoleRecord[] }>("/api/v1/roles"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/billing/plans"),
        apiFetch<{ success: boolean; data: SubscriptionRecord }>("/api/v1/billing/subscriptions/current"),
        apiFetch<{ success: boolean; data: InvoiceRecord[] }>("/api/v1/billing/invoices"),
        apiFetch<{ success: boolean; data: { catalog: ModuleEntry[]; entitlements: ModuleEntry[] } }>("/api/v1/administration/modules"),
        apiFetch<{ success: boolean; data: Record<string, any> }>("/api/v1/settings"),
        apiFetch<{ success: boolean; data: AuditRecord[] }>("/api/v1/administration/audit"),
      ]);
      const failed = [
        tenantRes, branchRes, usersRes, rolesRes, plansRes, subRes, invoiceRes, moduleRes, settingsRes, auditRes,
      ].find((result) => !result?.success);
      if (failed) throw new Error("One or more Administration authorities did not return successfully.");

      setTenant(tenantRes.data);
      setBranches(branchRes.data || []);
      setUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data || null);
      setInvoices(invoiceRes.data || []);
      setBillingKpis({
        activeSubscriptions: String(subRes.data?.status || "").toUpperCase() === "ACTIVE" ? 1 : 0,
      });
      setModuleCatalog(moduleRes.data?.catalog || []);
      setEnabledModules((moduleRes.data?.entitlements || []).map((item: ModuleEntry) => item.id));
      setSettings(settingsRes.data || {});
      setSettingDrafts(
        Object.fromEntries(
          Object.entries(settingsRes.data || {}).map(([key, entry]: [string, any]) => [key, JSON.stringify(entry?.value ?? entry ?? {}, null, 2)]),
        ),
      );
      setAudit(auditRes.data || []);

      const main = (branchRes.data || []).find((branch) => branch.isMain) || branchRes.data?.[0];
      if (main) {
        setMainBranchName(tenantRes.data?.branchName || main.name);
        setMainBranchCode(tenantRes.data?.branchCode || main.code);
      }
      setTenantName(tenantRes.data?.businessName || currentTenantName || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Administration data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [currentTenantId, currentTenantName]);

  useEffect(() => { void load(); }, [load]);

  const saveTenant = async () => {
    if (!currentTenantId) return;
    setBusy(true);
    try {
      await apiFetch(`/api/v1/onboarding/tenants/${currentTenantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          businessName: tenantName.trim(),
          branchName: mainBranchName.trim(),
          branchCode: mainBranchCode.trim(),
        }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const createBranch = async () => {
    if (!newBranchName.trim() || !newBranchCode.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/api/v1/branches", {
        method: "POST",
        body: JSON.stringify({ name: newBranchName.trim(), code: newBranchCode.trim(), isMain: branches.length === 0 }),
      });
      setNewBranchName("");
      setNewBranchCode("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const updateBranch = async (branch: BranchRecord, patch: Partial<BranchRecord>) => {
    setBusy(true);
    try {
      await apiFetch(`/api/v1/branches/${branch.id}`, { method: "PUT", body: JSON.stringify(patch) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const updateUserStatus = async (user: UserRecord) => {
    const status = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    setBusy(true);
    try {
      await apiFetch(`/api/v1/users/${user.id}`, { method: "PUT", body: JSON.stringify({ status }) });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const saveSetting = async (key: string) => {
    const draft = settingDrafts[key];
    if (draft == null) return;
    let value: unknown;
    try {
      value = JSON.parse(draft);
    } catch {
      setError(`Invalid JSON in ${key}.`);
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/v1/administration/settings/batch", {
        method: "PUT",
        body: JSON.stringify({ settings: [{ key, scope: "BRANCH", value, operationType: "UPDATE" }] }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = async (moduleId: string) => {
    const next = enabledModules.includes(moduleId)
      ? enabledModules.filter((id) => id !== moduleId)
      : [...enabledModules, moduleId];
    setBusy(true);
    try {
      await apiFetch("/api/v1/administration/modules", {
        method: "PUT",
        body: JSON.stringify({ moduleIds: next }),
      });
      setEnabledModules(next);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const groupedSettings = useMemo(() => ({
    system: SYSTEM_SETTING_KEYS.filter((key) => key !== "sync.config" && key !== "integrations.config"),
    security: ["security.config", "sync.config", "integrations.config"],
  }), []);

  const activePlanName = subscription?.plan?.name || subscription?.planName || "—";
  const subscriptionPrice = subscription?.currentPeriodPrice ?? subscription?.amount ?? subscription?.plan?.price;
  const subscriptionCurrency = subscription?.currency || "TZS";

  if (loading) {
    return <div className="v2-card" style={{ padding: "2rem", display: "grid", placeItems: "center" }}><RefreshCw className="v2-spin" size={20} /><span className="v2-text-sm v2-text-muted">Loading authoritative Administration state…</span></div>;
  }

  if (error) {
    return (
      <div className="v2-card" style={{ padding: "2rem" }}>
        <div className="v2-flex v2-items-center v2-gap-2"><Shield size={18} /><strong>Administration authority unavailable</strong></div>
        <p className="v2-text-sm v2-text-muted">{error}</p>
        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => void load()} type="button">Retry</button>
      </div>
    );
  }

  return (
    <div className="v2-space-y-4">
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <div className="v2-text-xs v2-text-muted">TENANT ADMINISTRATION • PRODUCTION CONTROL</div>
          <h1 className="v2-text-xl v2-font-black" style={{ margin: ".2rem 0" }}>Administration</h1>
          <p className="v2-text-sm v2-text-muted">Authoritative tenant, branch, access, subscription, billing, modules, configuration and audit controls.</p>
        </div>
        <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => void load()} disabled={busy} type="button"><RefreshCw size={13} /> Refresh</button>
      </div>

      <div className="v2-flex v2-gap-1" style={{ overflowX: "auto", borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`v2-btn v2-btn-sm ${activeTab === tab.id ? "v2-btn-primary" : "v2-btn-ghost"}`}><Icon size={13} />{tab.label}</button>;
        })}
      </div>

      {activeTab === "tenant" && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between">
              <div><strong>Tenant identity</strong><p className="v2-text-xs v2-text-muted">Changes are persisted to the tenant authority and audited.</p></div>
              <span className="badge v2-badge-success"><CheckCircle2 size={12} /> {tenant?.status || "ACTIVE"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ marginTop: "1rem" }}>
              <label className="v2-text-sm">Business name<input className="v2-input" value={tenantName} onChange={(e) => setTenantName(e.target.value)} /></label>
              <label className="v2-text-sm">Main branch name<input className="v2-input" value={mainBranchName} onChange={(e) => setMainBranchName(e.target.value)} /></label>
              <label className="v2-text-sm">Main branch code<input className="v2-input" value={mainBranchCode} onChange={(e) => setMainBranchCode(e.target.value)} /></label>
              <div className="v2-text-sm"><span className="v2-text-muted">Tenant ID</span><div className="font-mono">{currentTenantId}</div><span className="v2-text-muted">Country / Currency / Timezone</span><div>{tenant?.country || "—"} / {tenant?.currency || "—"} / {tenant?.timezone || "—"}</div></div>
            </div>
            <div style={{ marginTop: "1rem" }}><button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => void saveTenant()} disabled={busy} type="button"><Save size={13} /> Save tenant changes</button></div>
          </div>
        </div>
      )}

      {activeTab === "branches" && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <strong>Add branch</strong>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ marginTop: "1rem" }}>
              <input className="v2-input" placeholder="Branch name" value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} />
              <input className="v2-input" placeholder="Branch code" value={newBranchCode} onChange={(e) => setNewBranchCode(e.target.value)} />
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => void createBranch()} disabled={busy} type="button">Create branch</button>
            </div>
          </div>
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-table-wrap"><table className="v2-table"><thead><tr><th>Name</th><th>Code</th><th>Main</th><th>Action</th></tr></thead><tbody>
              {branches.map((branch) => <tr key={branch.id}>
                <td><input className="v2-input v2-input-sm" defaultValue={branch.name} onBlur={(e) => e.target.value !== branch.name && void updateBranch(branch, { name: e.target.value })} /></td>
                <td><input className="v2-input v2-input-sm" defaultValue={branch.code} onBlur={(e) => e.target.value !== branch.code && void updateBranch(branch, { code: e.target.value })} /></td>
                <td><input type="checkbox" checked={branch.isMain} onChange={(e) => void updateBranch(branch, { isMain: e.target.checked })} disabled={busy || branch.isMain} /></td>
                <td><span className="v2-text-xs v2-text-muted">{branch.id}</span></td>
              </tr>)}
            </tbody></table></div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between"><strong>User administration</strong><button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => navigate("/users")}>Open full Users & Roles workspace</button></div>
            <div className="v2-table-wrap" style={{ marginTop: "1rem" }}><table className="v2-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Branch</th><th>Status</th><th></th></tr></thead><tbody>
              {users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.role || "—"}</td><td>{user.branchName || "—"}</td><td>{user.status}</td><td><button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => void updateUserStatus(user)} disabled={busy || user.id === (currentTenantId || "")} type="button">{user.status === "ACTIVE" ? "Suspend" : "Activate"}</button></td></tr>)}
            </tbody></table></div>
          </div>
        </div>
      )}

      {activeTab === "roles" && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between"><strong>Roles and permission authority</strong><button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => navigate("/users")}>Open role builder</button></div>
            <div className="v2-table-wrap" style={{ marginTop: "1rem" }}><table className="v2-table"><thead><tr><th>Role</th><th>Type</th><th>Permissions</th></tr></thead><tbody>
              {roles.map((role) => <tr key={role.id}><td><strong>{role.name}</strong><div className="v2-text-xs v2-text-muted">{role.description}</div></td><td>{role.isSystemRole ? "System" : "Custom"}</td><td><div className="flex flex-wrap gap-1">{(role.permissions || []).map((permission) => <span key={permission} className="badge">{permission}</span>)}</div></td></tr>)}
            </tbody></table></div>
          </div>
        </div>
      )}

      {activeTab === "subscription" && (
        <div className="v2-space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="kpi-card"><div className="kpi-card-label">Current plan</div><div className="kpi-card-value">{activePlanName}</div><div className="kpi-card-desc">Status: {subscription?.status || "—"}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Current price</div><div className="kpi-card-value">{formatMoney(subscriptionPrice, subscriptionCurrency)}</div><div className="kpi-card-desc">{subscription?.billingInterval || subscription?.plan?.interval || "Billing interval unavailable"}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Available plans</div><div className="kpi-card-value">{plans.length}</div><div className="kpi-card-desc">Authoritative SaaS catalog</div></div>
          </div>
          <div className="v2-card" style={{ padding: "1.2rem" }}><strong>Plan catalog</strong><div className="v2-table-wrap" style={{ marginTop: "1rem" }}><table className="v2-table"><thead><tr><th>Plan</th><th>Price</th><th>Status</th></tr></thead><tbody>{plans.map((plan: any) => <tr key={plan.id || plan.code}><td>{plan.name || plan.code || "Plan"}</td><td>{formatMoney(plan.price ?? plan.amount, plan.currency || "TZS")}</td><td>{plan.status || "ACTIVE"}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {activeTab === "billing" && (
        <div className="v2-space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="kpi-card"><div className="kpi-card-label">Active subscriptions</div><div className="kpi-card-value">{billingKpis?.activeSubscriptions ?? "—"}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Invoices</div><div className="kpi-card-value">{invoices.length}</div></div>
            <div className="kpi-card"><div className="kpi-card-label">Subscription status</div><div className="kpi-card-value">{subscription?.status || "—"}</div></div>
          </div>
          <div className="v2-card" style={{ padding: "1.2rem" }}><strong>Invoices and payment state</strong><div className="v2-table-wrap" style={{ marginTop: "1rem" }}><table className="v2-table"><thead><tr><th>Invoice</th><th>Status</th><th>Amount</th><th>Due</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id || invoice.invoiceNumber}><td>{invoice.invoiceNumber || invoice.id || "Invoice"}</td><td>{invoice.status || "—"}</td><td>{formatMoney(invoice.total ?? invoice.amount ?? invoice.balanceDue, invoice.currency || "TZS")}</td><td>{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {activeTab === "modules" && (
        <div className="v2-card" style={{ padding: "1.2rem" }}>
          <strong>Feature module entitlements</strong>
          <p className="v2-text-xs v2-text-muted">Each change replaces the tenant entitlement set transactionally and writes a tenant audit event.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ marginTop: "1rem" }}>
            {moduleCatalog.map((module) => <label key={module.id} className="v2-card" style={{ padding: ".9rem", display: "flex", gap: ".75rem", alignItems: "flex-start" }}>
              <input type="checkbox" checked={enabledModules.includes(module.id)} onChange={() => void toggleModule(module.id)} disabled={busy} />
              <div><strong>{module.name}</strong><div className="v2-text-xs v2-text-muted">{module.industry || "Platform module"} • {module.description}</div><div className="v2-text-xs">ID: {module.id}</div></div>
            </label>)}
          </div>
        </div>
      )}

      {(activeTab === "system" || activeTab === "security") && (
        <div className="v2-space-y-4">
          <div className="v2-card" style={{ padding: "1.2rem" }}>
            <strong>{activeTab === "system" ? "System configuration" : "Security configuration"}</strong>
            <p className="v2-text-xs v2-text-muted">Values below are loaded from the effective tenant/branch configuration service. Writes are audited and versioned.</p>
          </div>
          {(activeTab === "system" ? groupedSettings.system : groupedSettings.security).map((key) => <div key={key} className="v2-card" style={{ padding: "1.2rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between"><strong>{key}</strong><button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => void saveSetting(key)} disabled={busy} type="button"><Save size={13} /> Save</button></div>
            <textarea className="v2-input" style={{ width: "100%", minHeight: 180, fontFamily: "monospace", marginTop: ".75rem" }} value={settingDrafts[key] || JSON.stringify(valueFromSettings(settings, key), null, 2)} onChange={(e) => setSettingDrafts((prev) => ({ ...prev, [key]: e.target.value }))} />
          </div>)}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="v2-card" style={{ padding: "1.2rem" }}>
          <div className="v2-flex v2-items-center v2-justify-between"><strong>Tenant audit logs</strong><span className="badge">{audit.length} events</span></div>
          <div className="v2-table-wrap" style={{ marginTop: "1rem" }}><table className="v2-table"><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead><tbody>{audit.map((event) => <tr key={event.id}><td>{event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}</td><td>{event.action}</td><td>{event.entityType} / {event.entityId}</td><td>{event.userId}</td><td><code style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(event.details)}</code></td></tr>)}</tbody></table></div>
        </div>
      )}
    </div>
  );
};

export default AdministrationPage;
