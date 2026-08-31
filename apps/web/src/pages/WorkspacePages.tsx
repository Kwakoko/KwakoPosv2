import React, { useEffect, useMemo, useState } from "react";
import { useAuth, useRbac, useSync, useTenant, useBranch } from "../context/KwakoPosContexts.js";
import { apiFetch, getAccessToken, safeUUID } from "../services/apiClient.js";

export interface WorkspaceProps { onNavigate: (path: string) => void; }
type Variant = { id: string; productId: string; name: string; sku: string; barcode?: string | null; price: number; costPrice: number; isActive: boolean };
type Product = { id: string; name: string; sku: string; category?: string; isActive?: boolean; variants?: Variant[] };
type Customer = { id: string; customerCode: string; name: string; phone?: string | null; email?: string | null; currentBalance?: number; status?: string };
type Sale = { id: string; saleNumber: string; grandTotal: number; soldAt: string; paymentStatus: string };
type Purchase = { id: string; purchaseOrderNumber?: string; totalCost?: number; status?: string; supplierName?: string };

const money = (v: number) => `TZS ${Number(v || 0).toLocaleString()}`;
const errMsg = (e: unknown) => e instanceof Error ? e.message : "Unable to load workspace data";

function useApiList<T>(url: string) {
  const [data, setData] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ success?: boolean; data?: T[] }>(url);
      setData(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, [url]);
  return { data, error, loading, reload };
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="workspace-card"><div className="workspace-title"><span>{title}</span>{action}</div>{children}</section>;
}
function Empty({ message }: { message: string }) { return <div style={{ color: "var(--muted)", padding: "1rem 0" }}>{message}</div>; }
function Loading() { return <div style={{ color: "var(--muted)", padding: "1rem 0" }}>Loading authoritative V2 data…</div>; }

function ModuleShellPage({ name, description }: { name: string; description: string }) {
  return <Panel title={name} action={<span className="badge badge-warning">DATA SOURCE REQUIRED</span>}>
    <div className="metric-card">
      <div className="metric-label">V2 Module Shell</div>
      <div className="metric-value" style={{ fontSize: "1.1rem" }}>Interactive UI available</div>
      <div style={{ color: "var(--muted)", marginTop: ".5rem", lineHeight: 1.5 }}>{description}</div>
      <div style={{ color: "var(--warning)", marginTop: ".75rem", fontSize: ".82rem", fontWeight: 700 }}>
        No fabricated operational data is shown. This module must remain below PRODUCTION_CERTIFIED until its V2 domain/API workflow is browser-verified.
      </div>
    </div>
  </Panel>;
}

export const DashboardPage: React.FC<WorkspaceProps> = ({ onNavigate }) => {
  const { pendingOutboxCount, isOnline } = useSync();
  const products = useApiList<Product>("/products");
  const sales = useApiList<Sale>("/api/v1/pos/sales");
  const revenue = sales.data.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
  return <Panel title="Executive Dashboard" action={<button className="btn" onClick={() => onNavigate("/pos")}>⚡ Open POS Terminal</button>}>
    {(products.loading || sales.loading) && <Loading />}
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Recorded Revenue</div><div className="metric-value">{money(revenue)}</div></div>
      <div className="metric-card"><div className="metric-label">Transactions</div><div className="metric-value">{sales.data.length}</div></div>
      <div className="metric-card"><div className="metric-label">Products</div><div className="metric-value">{products.data.length}</div></div>
      <div className="metric-card"><div className="metric-label">Sync Outbox Queue</div><div className="metric-value">{pendingOutboxCount}</div><div style={{ color: isOnline ? "var(--success)" : "var(--warning)" }}>{isOnline ? "Online" : "Offline Mode"}</div></div>
    </div>
    {(products.error || sales.error) && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{products.error || sales.error}</div>}
  </Panel>;
};

export const PosPage: React.FC<WorkspaceProps> = () => {
  const { data: products, error } = useApiList<Product>("/products");
  const { db, syncOutbox } = useSync();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<{ productId: string; variantId: string; name: string; price: number; qty: number }[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const variants = useMemo(() => products.flatMap(p => (p.variants || []).filter(v => v.isActive).map(v => ({ product: p, variant: v }))), [products]);
  const filtered = variants.filter(({ product, variant }) => `${product.name} ${product.sku} ${variant.name} ${variant.sku} ${variant.barcode || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const add = (product: Product, variant: Variant) => setCart(items => { const existing = items.find(x => x.variantId === variant.id); return existing ? items.map(x => x.variantId === variant.id ? { ...x, qty: x.qty + 1 } : x) : [...items, { productId: product.id, variantId: variant.id, name: `${product.name} — ${variant.name}`, price: variant.price, qty: 1 }]; });
  const remove = (variantId: string) => setCart(items => items.filter(x => x.variantId !== variantId));
  const checkout = async () => {
    if (!cart.length || !user) return;
    const operationId = safeUUID();
    const payload = { items: cart.map(x => ({ productId: x.productId, variantId: x.variantId, quantity: x.qty, unitPrice: x.price })), payments: [{ amount: total, paymentMethod }], deviceId: localStorage.getItem("kwakopos:v2:device-id") || "web-client", operationId, idempotencyKey: operationId };
    setBusy(true); setMessage(null);
    try {
      if (navigator.onLine && getAccessToken()) { await apiFetch("/api/v1/pos/sales", { method: "POST", body: JSON.stringify(payload) }); setMessage("Sale accepted by the V2 server."); }
      else { db.enqueueOutbox({ entityType: "Sale" as never, entityId: operationId, operationType: "CREATE", payload, idempotencyKey: operationId }); setMessage("Sale saved locally and queued for synchronization."); }
      setCart([]); try { await syncOutbox(); } catch { /* queue state remains visible */ }
    } catch (e) { setMessage(`Sale failed: ${errMsg(e)}`); } finally { setBusy(false); }
  };
  return <Panel title="POS Checkout Terminal" action={<span className="badge badge-info">{navigator.onLine ? "ONLINE" : "OFFLINE"}</span>}>
    <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search synchronized V2 products / SKU / barcode..." />
    {error && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginTop: "1rem" }}>
      <div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: ".75rem" }}>{filtered.map(({ product, variant }) => <button className="metric-card" key={variant.id} onClick={() => add(product, variant)} style={{ textAlign: "left", color: "var(--text)", cursor: "pointer" }}><strong>{product.name}</strong><div style={{ color: "var(--muted)" }}>{variant.name}</div><div style={{ color: "var(--accent)", fontWeight: 800 }}>{money(variant.price)}</div></button>)}</div>{!filtered.length && <Empty message="No synchronized saleable variants match your search." />}</div>
      <div className="metric-card"><strong>Active Sale Cart</strong>{!cart.length ? <Empty message="Cart is empty." /> : cart.map(x => <div key={x.variantId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem", marginTop: ".6rem" }}><span>{x.name} × {x.qty}</span><div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}><strong>{money(x.price * x.qty)}</strong><button aria-label={`Remove ${x.name}`} style={{ background: "transparent", border: 0, color: "var(--danger)", cursor: "pointer" }} onClick={() => remove(x.variantId)}>✕</button></div></div>)}<hr style={{ margin: "1rem 0", border: 0, borderTop: "1px solid var(--surface-border)" }} /><div style={{ marginBottom: ".75rem" }}><label style={{ fontSize: ".75rem", color: "var(--muted)", fontWeight: 700 }}>PAYMENT METHOD</label><select className="search-input" style={{ marginTop: ".35rem" }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="CASH">Cash (TZS)</option><option value="MPESA">M-Pesa / Mobile Money</option><option value="CARD">Credit / Debit Card</option><option value="CREDIT">Customer Credit Ledger</option></select></div><div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "1.1rem" }}>Total Pay <span>{money(total)}</span></div><button className="btn" disabled={busy || !cart.length} onClick={checkout} style={{ marginTop: "1rem", width: "100%" }}>{busy ? "Processing Sale…" : "Complete Transaction"}</button>{message && <div style={{ marginTop: ".75rem", color: message.includes("failed") ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{message}</div>}</div>
    </div>
  </Panel>;
};

export const InventoryPage: React.FC = () => {
  const { data: products, error } = useApiList<Product>("/products");
  const { db } = useSync();
  const [tab, setTab] = useState<"catalog" | "fefo" | "ledger">("catalog");
  return <Panel title="Inventory & StockLedger Lineage">
    <div style={{ display: "flex", gap: ".5rem", marginBottom: "1rem", flexWrap: "wrap" }}><button className={`btn ${tab === "catalog" ? "" : "btn-secondary"}`} onClick={() => setTab("catalog")}>Product Catalog ({products.length})</button><button className={`btn ${tab === "fefo" ? "" : "btn-secondary"}`} onClick={() => setTab("fefo")}>FEFO Batch Priority</button><button className={`btn ${tab === "ledger" ? "" : "btn-secondary"}`} onClick={() => setTab("ledger")}>Stock Ledger Lineage ({db.stockLedger.size})</button></div>
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : tab === "catalog" ? (products.length ? <table><thead><tr><th>Product</th><th>SKU</th><th>Variants</th><th>Local Ledger Entries</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.variants?.length || 0}</td><td>{p.variants?.filter(v => db.stockLedger.has(v.id)).length || 0}</td></tr>)}</tbody></table> : <Empty message="No products are currently synchronized." />) : tab === "fefo" ? <Empty message="FEFO batch data is not embedded in the UI. Connect the authoritative V2 batch/expiry endpoint before certifying this view." /> : <table><thead><tr><th>Movement ID</th><th>Variant ID</th><th>Type</th><th>Quantity</th><th>Timestamp</th></tr></thead><tbody>{Array.from(db.stockLedger.values()).map((entry: any, i) => <tr key={entry.id || i}><td>{entry.id || `MVT-${i}`}</td><td>{entry.variantId}</td><td>{entry.type || "UNKNOWN"}</td><td>{entry.qty}</td><td>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—"}</td></tr>)}{!db.stockLedger.size && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>No local stock ledger entries in IndexedDB store.</td></tr>}</tbody></table>}
  </Panel>;
};

export const CustomersPage: React.FC = () => {
  const { data: customers, error, reload, loading } = useApiList<Customer>("/api/v1/customers");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => { if (!name.trim()) return; setBusy(true); try { await apiFetch("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }) }); setName(""); setPhone(""); await reload(); } catch (e) { alert(errMsg(e)); } finally { setBusy(false); } };
  return <Panel title="Customer CRM Directory"><div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: ".5rem", marginBottom: "1rem" }}><input className="search-input" value={name} onChange={e => setName(e.target.value)} placeholder="Customer Name" /><input className="search-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" /><button className="btn" onClick={create} disabled={busy}>Add Customer</button></div>{loading ? <Loading /> : error ? <div style={{ color: "var(--danger)" }}>{error}</div> : customers.length ? <table><thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Balance</th><th>Status</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td>{c.customerCode}</td><td>{c.name}</td><td>{c.phone || "—"}</td><td>{money(c.currentBalance || 0)}</td><td><span className="badge badge-success">{c.status || "ACTIVE"}</span></td></tr>)}</tbody></table> : <Empty message="No customers exist in this tenant/branch." />}</Panel>;
};

export const PurchasingPage: React.FC = () => { const { data: purchases, error, loading } = useApiList<Purchase>("/api/v1/purchases"); return <Panel title="Purchasing & Goods Receiving (PO)">{loading ? <Loading /> : error ? <div style={{ color: "var(--danger)" }}>{error}</div> : purchases.length ? <table><thead><tr><th>Order #</th><th>Supplier</th><th>Total Cost</th><th>Status</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.purchaseOrderNumber || p.id}</td><td>{p.supplierName || "—"}</td><td>{money(p.totalCost || 0)}</td><td><span className="badge badge-info">{p.status || "OPEN"}</span></td></tr>)}</tbody></table> : <Empty message="No purchase orders exist in this tenant/branch." />}</Panel>; };

export const FinancePage: React.FC = () => { const { data: sales, error, loading } = useApiList<Sale>("/api/v1/pos/sales"); const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0); return <Panel title="Finance — Commercial Transaction Summary">{loading ? <Loading /> : error ? <div style={{ color: "var(--danger)" }}>{error}</div> : <div className="metrics-grid"><div className="metric-card"><div className="metric-label">Recorded Sales</div><div className="metric-value">{money(total)}</div></div><div className="metric-card"><div className="metric-label">Transactions</div><div className="metric-value">{sales.length}</div></div><div className="metric-card"><div className="metric-label">Accounting Authority</div><div className="metric-value" style={{ fontSize: "1rem" }}>V2 Finance Domain</div><div style={{ color: "var(--muted)", marginTop: ".35rem" }}>This screen does not claim a trial-balance result without an authoritative ledger query.</div></div></div>}</Panel>; };

export const ReportsPage: React.FC = () => { const { data: sales, error, loading } = useApiList<Sale>("/api/v1/pos/sales"); return <Panel title="Reports & Analytics">{loading ? <Loading /> : error ? <div style={{ color: "var(--danger)" }}>{error}</div> : sales.length ? <table><thead><tr><th>Sale #</th><th>Date</th><th>Total</th><th>Payment</th></tr></thead><tbody>{sales.slice(0,100).map(s => <tr key={s.id}><td>{s.saleNumber}</td><td>{new Date(s.soldAt).toLocaleString()}</td><td>{money(s.grandTotal)}</td><td>{s.paymentStatus}</td></tr>)}</tbody></table> : <Empty message="No sales records exist for reporting." />}</Panel>; };

export const SettingsPage: React.FC = () => { const { currentTenantId, currentTenantName } = useTenant(); const { currentBranchId, currentBranchName } = useBranch(); return <Panel title="Hierarchical Tenant & Branch Settings"><div className="metrics-grid"><div className="metric-card"><div className="metric-label">Active Tenant Context</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{currentTenantName || "Not loaded"}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{currentTenantId || "—"}</div></div><div className="metric-card"><div className="metric-label">Active Branch Context</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{currentBranchName || "Not loaded"}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{currentBranchId || "—"}</div></div><div className="metric-card"><div className="metric-label">VAT</div><div className="metric-value" style={{ fontSize: "1rem" }}>Configured by V2 settings</div></div><div className="metric-card"><div className="metric-label">Currency</div><div className="metric-value" style={{ fontSize: "1rem" }}>Configured by V2 settings</div></div></div></Panel>; };

export const UsersPage: React.FC = () => { const { role, permissions } = useRbac(); const { user } = useAuth(); return <Panel title="Users Directory & RBAC Permission Matrix"><div className="metrics-grid"><div className="metric-card"><div className="metric-label">Logged User</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{user?.name || "Unknown"}</div></div><div className="metric-card"><div className="metric-label">Assigned Role</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{role || "Unknown"}</div></div><div className="metric-card"><div className="metric-label">Granted Permissions</div><div className="metric-value">{permissions.length} Grants</div></div></div><div style={{ color: "var(--muted)", marginTop: "1rem" }}>This page reflects the active V2 authorization context; user mutation APIs must be browser-certified before being described as production-ready.</div></Panel>; };

export const SuperAdminPage: React.FC = () => { const { role, permissions } = useRbac(); const allowed = role === "SUPER_ADMIN" || role === "ADMIN" || permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS"); return <Panel title="Super Admin Platform Control Tower" action={<button className="btn" disabled={!allowed}>Provision New Tenant</button>}>{allowed ? <div className="metric-card"><div className="metric-label">Platform-control authorization</div><div className="metric-value" style={{ fontSize: "1rem" }}>Granted by V2 RBAC</div><div style={{ color: "var(--muted)", marginTop: ".5rem" }}>Live tenant counts, billing, feature flags and platform health must come from authoritative Super Admin APIs before certification.</div></div> : <div className="badge badge-danger">Access Denied by V2 RBAC Policy</div>}</Panel>; };

export const DiagnosticsPage: React.FC = () => { const { db, syncOutbox, syncError } = useSync(); return <Panel title="Client Sync Inspector & Outbox Queue"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div>Pending outbox operations: <strong>{db.getPendingOutbox().length}</strong></div><button className="btn" onClick={() => syncOutbox().catch(() => undefined)}>Force Sync Trigger</button></div>{syncError && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{syncError}</div>}<pre style={{ marginTop: "1rem", background: "var(--bg)", padding: "1rem", borderRadius: ".5rem", overflow: "auto", fontSize: ".8rem" }}>{JSON.stringify(db.getPendingOutbox(), null, 2)}</pre></Panel>; };

export const ExpensesPage: React.FC = () => <ModuleShellPage name="Expenses & Outgoings" description="The V2 Expenses workspace is present, but no authoritative expense-list or ledger endpoint is embedded in this shell. Keep it below PRODUCTION_CERTIFIED until its complete workflow is browser-verified." />;
export const AiPage: React.FC = () => <ModuleShellPage name="AI Operating Layer" description="The V2 AI workspace is present. AI insights/execution counters are intentionally not fabricated; connect the governed AI endpoints and evidence before certification." />;
export const CashDrawerPage: React.FC = () => <ModuleShellPage name="Cash Drawer Reconciliation" description="The V2 cash-drawer workspace is present. Opening/closing balances must come from the authoritative cash-drawer service before certification." />;
export const ReceiptsPage: React.FC = () => <ModuleShellPage name="Receipts & E-Invoice" description="The V2 receipts workspace is present. Receipt counts and fiscal-device status must come from the authoritative receipt/e-invoice service before certification." />;
export const TrashPage: React.FC = () => <ModuleShellPage name="Trash & Recovery" description="The V2 recovery workspace is present. Deleted-record lists and purge actions must come from the authoritative soft-delete/audit service before certification." />;
export const LawFirmPage: React.FC = () => <ModuleShellPage name="Law Firm Practice Command Center" description="Legacy Law Firm UX is represented in the V2 shell; authoritative matters, billing, trust and conflict workflows require the V2 Law Firm domain/API integration before certification." />;
export const PharmacyPage: React.FC = () => <ModuleShellPage name="Clinical Pharmacy & FEFO Dispensing" description="Legacy Pharmacy UX is represented in the V2 shell; authoritative dispensing, batch, expiry and prescription workflows require the V2 Pharmacy domain/API integration before certification." />;
export const PoultryLivestockPage: React.FC = () => <ModuleShellPage name="Poultry & Livestock Production" description="Legacy Poultry/Livestock UX is represented in the V2 shell; authoritative flock, feed, production and batch workflows require the V2 domain/API integration before certification." />;
export const FleetPage: React.FC = () => <ModuleShellPage name="Vehicle Fleet & Logistics" description="Legacy Fleet UX is represented in the V2 shell; authoritative vehicle, dispatch, fuel and maintenance workflows require the V2 Fleet domain/API integration before certification." />;
export const WorkforcePage: React.FC = () => <ModuleShellPage name="Workforce Management" description="Legacy Workforce UX is represented in the V2 shell; authoritative employee, attendance, shift and payroll workflows require the V2 Workforce domain/API integration before certification." />;
export const TelecomPage: React.FC = () => <ModuleShellPage name="Telecom & Airtime Distribution" description="Legacy Telecom UX is represented in the V2 shell; authoritative agent, float, recharge and settlement workflows require the V2 Telecom domain/API integration before certification." />;
export const HelpPage: React.FC = () => <Panel title="KwakoPos Knowledge Center & Support"><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "1rem" }}><div className="metric-card"><div className="metric-label">Interactive Documentation</div><div style={{ marginTop: ".5rem", fontWeight: 700 }}>POS, Inventory & Sync Guides</div><div style={{ color: "var(--muted)", fontSize: ".8rem", marginTop: ".25rem" }}>Documentation content is delivered from the V2 application source; operational claims are not synthesized.</div></div><div className="metric-card"><div className="metric-label">Keyboard Shortcuts</div><div style={{ marginTop: ".5rem" }}>Ctrl+K / Cmd+K for global search</div></div></div></Panel>;
