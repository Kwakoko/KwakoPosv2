import React, { useEffect, useMemo, useState } from "react";
import { useAuth, useRbac, useSync, useTenant, useBranch } from "../context/KwakoPosContexts.js";
import { apiFetch, getAccessToken } from "../services/apiClient.js";

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
  const reload = async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: T[] }>(url);
      setData(Array.isArray(res.data) ? res.data : []);
      setError(null);
    } catch (e) { setError(errMsg(e)); }
  };
  useEffect(() => { void reload(); }, [url]);
  return { data, error, reload };
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="workspace-card"><div className="workspace-title"><span>{title}</span>{action}</div>{children}</section>;
}
function Empty({ message }: { message: string }) { return <div style={{ color: "var(--muted)", padding: "1rem 0" }}>{message}</div>; }

export const DashboardPage: React.FC<WorkspaceProps> = ({ onNavigate }) => {
  const { pendingOutboxCount, isOnline } = useSync();
  const products = useApiList<Product>("/products");
  const sales = useApiList<Sale>("/api/v1/pos/sales");
  const revenue = sales.data.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0);
  return <>
    <Panel title="Executive Dashboard" action={<button className="btn" onClick={() => onNavigate("/pos")}>Open POS</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Recorded Revenue</div><div className="metric-value">{money(revenue)}</div></div>
        <div className="metric-card"><div className="metric-label">Transactions</div><div className="metric-value">{sales.data.length}</div></div>
        <div className="metric-card"><div className="metric-label">Products</div><div className="metric-value">{products.data.length}</div></div>
        <div className="metric-card"><div className="metric-label">Sync Queue</div><div className="metric-value">{pendingOutboxCount}</div><div style={{ color: isOnline ? "var(--success)" : "var(--warning)" }}>{isOnline ? "Online" : "Offline"}</div></div>
      </div>
      {(products.error || sales.error) && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{products.error || sales.error}</div>}
    </Panel>
  </>;
};

export const PosPage: React.FC<WorkspaceProps> = () => {
  const { data: products, error } = useApiList<Product>("/products");
  const { db, syncOutbox } = useSync();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<{ productId: string; variantId: string; name: string; price: number; qty: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const variants = useMemo(() => products.flatMap(p => (p.variants || []).filter(v => v.isActive).map(v => ({ product: p, variant: v }))), [products]);
  const filtered = variants.filter(({ product, variant }) => `${product.name} ${product.sku} ${variant.name} ${variant.sku} ${variant.barcode || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);
  const add = (product: Product, variant: Variant) => setCart(items => {
    const existing = items.find(x => x.variantId === variant.id);
    return existing ? items.map(x => x.variantId === variant.id ? { ...x, qty: x.qty + 1 } : x) : [...items, { productId: product.id, variantId: variant.id, name: `${product.name} — ${variant.name}`, price: variant.price, qty: 1 }];
  });
  const checkout = async () => {
    if (!cart.length || !user) return;
    const operationId = crypto.randomUUID();
    const payload = { items: cart.map(x => ({ productId: x.productId, variantId: x.variantId, quantity: x.qty, unitPrice: x.price })), payments: [{ amount: total, paymentMethod: "CASH" }], deviceId: localStorage.getItem("kwakopos:v2:device-id") || "web-client", operationId, idempotencyKey: operationId };
    setBusy(true); setMessage(null);
    try {
      if (navigator.onLine && getAccessToken()) {
        await apiFetch("/api/v1/pos/sales", { method: "POST", body: JSON.stringify(payload) });
        setMessage("Sale accepted by the V2 server.");
      } else {
        db.enqueueOutbox({ entityType: "Sale" as never, entityId: operationId, operationType: "CREATE", payload, idempotencyKey: operationId });
        setMessage("Sale saved locally and queued for synchronization.");
      }
      setCart([]);
      try { await syncOutbox(); } catch { /* keep local queue visible */ }
    } catch (e) { setMessage(`Sale failed: ${errMsg(e)}`); }
    finally { setBusy(false); }
  };
  return <Panel title="POS Checkout" action={<span className="badge badge-info">{navigator.onLine ? "ONLINE" : "OFFLINE"}</span>}>
    <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search synchronized V2 products / SKU / barcode" />
    {error && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginTop: "1rem" }}>
      <div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: ".75rem" }}>
        {filtered.map(({ product, variant }) => <button className="metric-card" key={variant.id} onClick={() => add(product, variant)} style={{ textAlign: "left", color: "var(--text)", cursor: "pointer" }}><strong>{product.name}</strong><div style={{ color: "var(--muted)" }}>{variant.name}</div><div style={{ color: "var(--accent)", fontWeight: 800 }}>{money(variant.price)}</div></button>)}
      </div>{!filtered.length && <Empty message="No synchronized saleable variants are available." />}</div>
      <div className="metric-card"><strong>Cart</strong>{!cart.length ? <Empty message="Cart is empty." /> : cart.map(x => <div key={x.variantId} style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", marginTop: ".6rem" }}><span>{x.name} × {x.qty}</span><strong>{money(x.price * x.qty)}</strong></div>)}<hr style={{ margin: "1rem 0", border: 0, borderTop: "1px solid var(--surface-border)" }} /><div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900 }}>Total <span>{money(total)}</span></div><button className="btn" disabled={busy || !cart.length} onClick={checkout} style={{ marginTop: "1rem", width: "100%" }}>{busy ? "Processing…" : "Complete Sale"}</button>{message && <div style={{ marginTop: ".75rem", color: message.includes("failed") ? "var(--danger)" : "var(--success)" }}>{message}</div>}</div>
    </div>
  </Panel>;
};

export const InventoryPage: React.FC = () => { const { data: products, error } = useApiList<Product>("/products"); const { db } = useSync(); return <Panel title="Inventory & StockLedger"><div style={{ color: "var(--muted)", marginBottom: ".75rem" }}>Products: {products.length} · Local ledger entries: {db.stockLedger.size}</div>{error ? <div style={{ color: "var(--danger)" }}>{error}</div> : products.length ? <table><thead><tr><th>Product</th><th>SKU</th><th>Variants</th><th>Local Ledger Entries</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.variants?.length || 0}</td><td>{p.variants?.filter(v => db.stockLedger.has(v.id)).length || 0}</td></tr>)}</tbody></table> : <Empty message="No products are currently synchronized for this tenant/branch." />}</Panel>; };

export const CustomersPage: React.FC = () => { const { data: customers, error, reload } = useApiList<Customer>("/api/v1/customers"); const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false); const create = async () => { if (!name.trim()) return; setBusy(true); try { await apiFetch("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }) }); setName(""); setPhone(""); await reload(); } catch (e) { alert(errMsg(e)); } finally { setBusy(false); } }; return <Panel title="Customers"><div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: ".5rem", marginBottom: "1rem" }}><input className="search-input" value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" /><input className="search-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" /><button className="btn" onClick={create} disabled={busy}>Add</button></div>{error ? <div style={{ color: "var(--danger)" }}>{error}</div> : customers.length ? <table><thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Balance</th><th>Status</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td>{c.customerCode}</td><td>{c.name}</td><td>{c.phone || "—"}</td><td>{money(c.currentBalance || 0)}</td><td>{c.status || "ACTIVE"}</td></tr>)}</tbody></table> : <Empty message="No customers exist in this tenant/branch." />}</Panel>; };

export const PurchasingPage: React.FC = () => { const { data: purchases, error } = useApiList<Purchase>("/api/v1/purchases"); return <Panel title="Purchasing & Receiving">{error ? <div style={{ color: "var(--danger)" }}>{error}</div> : purchases.length ? <table><thead><tr><th>Order</th><th>Supplier</th><th>Total</th><th>Status</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.purchaseOrderNumber || p.id}</td><td>{p.supplierName || "—"}</td><td>{money(p.totalCost || 0)}</td><td>{p.status || "OPEN"}</td></tr>)}</tbody></table> : <Empty message="No purchase orders exist in this tenant/branch." />}</Panel>; };

export const FinancePage: React.FC = () => { const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales"); const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0); return <Panel title="Finance — Commercial Transaction Summary">{error ? <div style={{ color: "var(--danger)" }}>{error}</div> : <div className="metrics-grid"><div className="metric-card"><div className="metric-label">Recorded Sales</div><div className="metric-value">{money(total)}</div></div><div className="metric-card"><div className="metric-label">Transactions</div><div className="metric-value">{sales.length}</div></div></div>}</Panel>; };

export const ReportsPage: React.FC = () => { const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales"); return <Panel title="Reports & Analytics">{error ? <div style={{ color: "var(--danger)" }}>{error}</div> : sales.length ? <table><thead><tr><th>Sale</th><th>Date</th><th>Total</th><th>Payment</th></tr></thead><tbody>{sales.slice(0,100).map(s => <tr key={s.id}><td>{s.saleNumber}</td><td>{new Date(s.soldAt).toLocaleString()}</td><td>{money(s.grandTotal)}</td><td>{s.paymentStatus}</td></tr>)}</tbody></table> : <Empty message="No sales records exist for reporting." />}</Panel>; };

export const SettingsPage: React.FC = () => { const { currentTenantId, currentTenantName } = useTenant(); const { currentBranchId, currentBranchName } = useBranch(); return <Panel title="Tenant & Branch Context"><div className="metrics-grid"><div className="metric-card"><div className="metric-label">Tenant</div><div className="metric-value" style={{ fontSize: "1rem" }}>{currentTenantName || "Not loaded"}</div><div style={{ color: "var(--muted)" }}>{currentTenantId || "—"}</div></div><div className="metric-card"><div className="metric-label">Branch</div><div className="metric-value" style={{ fontSize: "1rem" }}>{currentBranchName || "Not loaded"}</div><div style={{ color: "var(--muted)" }}>{currentBranchId || "—"}</div></div></div></Panel>; };

export const UsersPage: React.FC = () => { const { role, permissions } = useRbac(); return <Panel title="Users & RBAC"><div className="metrics-grid"><div className="metric-card"><div className="metric-label">Role</div><div className="metric-value" style={{ fontSize: "1.2rem" }}>{role || "Unknown"}</div></div><div className="metric-card"><div className="metric-label">Granted Permissions</div><div className="metric-value" style={{ fontSize: "1.2rem" }}>{permissions.length}</div></div></div><div style={{ color: "var(--muted)", marginTop: "1rem" }}>The V2 session is the authorization source for this workspace.</div></Panel>; };

export const SuperAdminPage: React.FC = () => { const { role, permissions } = useRbac(); const allowed = role === "SUPER_ADMIN" || role === "ADMIN" || permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS"); return <Panel title="Super Admin Platform Control Tower">{allowed ? <div className="badge badge-success">Platform-control access granted by V2 authorization</div> : <div className="badge badge-danger">Access denied by V2 RBAC</div>}</Panel>; };

export const DiagnosticsPage: React.FC = () => { const { db, syncOutbox, syncError } = useSync(); return <Panel title="Sync Inspector & Outbox"><div>Pending operations: <strong>{db.getPendingOutbox().length}</strong></div><button className="btn" style={{ marginTop: ".75rem" }} onClick={() => syncOutbox().catch(() => undefined)}>Synchronize</button>{syncError && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{syncError}</div>}<pre style={{ marginTop: "1rem", background: "var(--bg)", padding: "1rem", overflow: "auto" }}>{JSON.stringify(db.getPendingOutbox(), null, 2)}</pre></Panel>; };

export const ExpensesPage: React.FC = () => {
  return (
    <Panel title="Expenses & Outgoings Ledger" action={<button className="btn">Record New Expense</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Monthly Expenses</div><div className="metric-value">{money(4850000)}</div></div>
        <div className="metric-card"><div className="metric-label">Petty Cash Balance</div><div className="metric-value">{money(650000)}</div></div>
        <div className="metric-card"><div className="metric-label">Pending Approval</div><div className="metric-value">2 Vouchers</div></div>
      </div>
      <table>
        <thead><tr><th>Voucher #</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>EXP-2026-081</td><td>Utilities</td><td>TANESCO Electricity Bill</td><td>{money(850000)}</td><td><span className="badge badge-success">PAID</span></td></tr>
          <tr><td>EXP-2026-082</td><td>Rent</td><td>Store Monthly Lease</td><td>{money(3000000)}</td><td><span className="badge badge-success">PAID</span></td></tr>
          <tr><td>EXP-2026-083</td><td>Supplies</td><td>Thermal Printer Roll Paper</td><td>{money(120000)}</td><td><span className="badge badge-warning">PENDING</span></td></tr>
        </tbody>
      </table>
    </Panel>
  );
};

export const AiPage: React.FC = () => {
  return (
    <Panel title="KwakoPos AI Operating Layer & Policy Gateway" action={<span className="badge badge-success">KILL SWITCH: INACTIVE</span>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active Vertical Agents</div><div className="metric-value">10 Agents</div></div>
        <div className="metric-card"><div className="metric-label">Guarded Executions</div><div className="metric-value">1,482 Actions</div></div>
        <div className="metric-card"><div className="metric-label">Level 4 Guard Violations</div><div className="metric-value">0 Violations</div></div>
        <div className="metric-card"><div className="metric-label">Token Efficiency</div><div className="metric-value">98.5%</div></div>
      </div>
      <div style={{ marginTop: "1rem", color: "var(--muted)" }}><strong>AI Action Policy Hierarchy:</strong> Level 0 (Assist) → Level 1 (Guarded Auto) → Level 2 (Approval) → Level 3 (Human Consent) → Level 4 (Prohibited).</div>
    </Panel>
  );
};

export const CashDrawerPage: React.FC = () => {
  return (
    <Panel title="Cash Drawer Shift Reconciliation" action={<button className="btn">Close Shift & Drop Cash</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Opening Float</div><div className="metric-value">{money(150000)}</div></div>
        <div className="metric-card"><div className="metric-label">Cash Collected</div><div className="metric-value">{money(4820000)}</div></div>
        <div className="metric-card"><div className="metric-label">Paid Out / Drops</div><div className="metric-value">{money(300000)}</div></div>
        <div className="metric-card"><div className="metric-label">Expected Drawer Cash</div><div className="metric-value">{money(4670000)}</div></div>
      </div>
    </Panel>
  );
};

export const ReceiptsPage: React.FC = () => {
  return (
    <Panel title="Thermal Receipts & E-Invoice Engine" action={<button className="btn">Reprint Last Receipt</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Receipts Issued Today</div><div className="metric-value">142 Receipts</div></div>
        <div className="metric-card"><div className="metric-label">TRA EFD / VFD Sync</div><div className="metric-value" style={{ color: "var(--success)" }}>100% VERIFIED</div></div>
        <div className="metric-card"><div className="metric-label">Digital Receipts Sent</div><div className="metric-value">98 SMS / WhatsApp</div></div>
      </div>
    </Panel>
  );
};

export const LawFirmPage: React.FC = () => {
  return (
    <Panel title="Law Firm Practice Command Center" action={<button className="btn">Conflict Search</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active Legal Matters</div><div className="metric-value">48 Matters</div></div>
        <div className="metric-card"><div className="metric-label">Critical Court Deadlines</div><div className="metric-value" style={{ color: "var(--warning)" }}>5 Due Soon</div></div>
        <div className="metric-card"><div className="metric-label">Approved Unbilled Time</div><div className="metric-value">{money(18500000)}</div></div>
        <div className="metric-card"><div className="metric-label">Segregated Trust Funds</div><div className="metric-value">{money(45200000)}</div></div>
      </div>
      <table>
        <thead><tr><th>Matter #</th><th>Title & Practice Area</th><th>Client</th><th>Lead Partner</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>MAT-2026-081</td><td>Standard Chartered vs Telecom</td><td>Tanzania Telecom</td><td>Advocate M. K. Lyimo</td><td><span className="badge badge-info">LITIGATION</span></td></tr>
          <tr><td>MAT-2026-088</td><td>Commercial Land Acquisition</td><td>Azam Group</td><td>Advocate A. Rashid</td><td><span className="badge badge-success">CONVEYANCING</span></td></tr>
        </tbody>
      </table>
    </Panel>
  );
};

export const PharmacyPage: React.FC = () => {
  return (
    <Panel title="Clinical Pharmacy & FEFO Dispensing" action={<button className="btn">FEFO Dispensing Counter</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Today Dispensed</div><div className="metric-value">{money(6180000)}</div></div>
        <div className="metric-card"><div className="metric-label">Expiry Alerts (&lt; 90 days)</div><div className="metric-value" style={{ color: "var(--warning)" }}>6 Batches</div></div>
        <div className="metric-card"><div className="metric-label">Drug Safety Alerts</div><div className="metric-value" style={{ color: "var(--danger)" }}>2 Alerts</div></div>
        <div className="metric-card"><div className="metric-label">Quarantined Batches</div><div className="metric-value">1 Batch</div></div>
      </div>
      <table>
        <thead><tr><th>Generic / Brand</th><th>Batch #</th><th>Expiry Date</th><th>Stock</th><th>FEFO Status</th></tr></thead>
        <tbody>
          <tr><td>Amoxicillin 500mg</td><td>BAT-AMO-8841</td><td>2026-11-15</td><td>450 Caps</td><td><span className="badge badge-success">PRIORITY 1</span></td></tr>
          <tr><td>Paracetamol 500mg</td><td>BAT-PAR-9910</td><td>2027-04-20</td><td>1,200 Tabs</td><td><span className="badge badge-info">PRIORITY 2</span></td></tr>
        </tbody>
      </table>
    </Panel>
  );
};

export const PoultryLivestockPage: React.FC = () => {
  return (
    <Panel title="Poultry & Livestock Production Command Center" action={<button className="btn">Record Batch Output</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active Flock Batches</div><div className="metric-value">12,500 Birds</div></div>
        <div className="metric-card"><div className="metric-label">Daily Egg Production</div><div className="metric-value">8,420 Eggs</div></div>
        <div className="metric-card"><div className="metric-label">Feed Conversion (FCR)</div><div className="metric-value">1.55 FCR</div></div>
        <div className="metric-card"><div className="metric-label">Mortality Rate</div><div className="metric-value" style={{ color: "var(--success)" }}>0.12%</div></div>
      </div>
    </Panel>
  );
};

export const FleetPage: React.FC = () => {
  return (
    <Panel title="Vehicle Fleet & Logistics Command Center" action={<button className="btn">Dispatch Trip</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active Vehicles</div><div className="metric-value">14 Vehicles</div></div>
        <div className="metric-card"><div className="metric-label">Fuel Consumption</div><div className="metric-value">1,420 Liters</div></div>
        <div className="metric-card"><div className="metric-label">Maintenance Due</div><div className="metric-value" style={{ color: "var(--warning)" }}>2 Trucks</div></div>
        <div className="metric-card"><div className="metric-label">Active Trips</div><div className="metric-value">8 Trips</div></div>
      </div>
    </Panel>
  );
};

export const WorkforcePage: React.FC = () => {
  return (
    <Panel title="Workforce Management & Payroll" action={<button className="btn">Clock In Employee</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active Staff</div><div className="metric-value">42 Employees</div></div>
        <div className="metric-card"><div className="metric-label">Clocked In Today</div><div className="metric-value">38 Staff</div></div>
        <div className="metric-card"><div className="metric-label">Monthly Payroll</div><div className="metric-value">{money(38500000)}</div></div>
      </div>
    </Panel>
  );
};

export const TelecomPage: React.FC = () => {
  return (
    <Panel title="Telecom & Airtime Distribution Center" action={<button className="btn">Rebalance Float</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Active SIM Agents</div><div className="metric-value">124 Agents</div></div>
        <div className="metric-card"><div className="metric-label">Airtime Sold Today</div><div className="metric-value">{money(14200000)}</div></div>
        <div className="metric-card"><div className="metric-label">Commission Earned</div><div className="metric-value">{money(710000)}</div></div>
      </div>
    </Panel>
  );
};

export const HelpPage: React.FC = () => {
  return (
    <Panel title="KwakoPos Knowledge Center & Support">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        <div className="metric-card">
          <div className="metric-label">Interactive Documentation</div>
          <div style={{ marginTop: ".5rem", fontWeight: 700 }}>POS & FEFO User Guides</div>
          <div style={{ color: "var(--muted)", fontSize: ".8rem", marginTop: ".25rem" }}>Step-by-step walkthroughs for checkout, inventory, and sync.</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Keyboard Shortcuts</div>
          <div style={{ marginTop: ".5rem" }}>Ctrl+K: Search | Cmd+K: Commands</div>
          <div style={{ color: "var(--muted)", fontSize: ".8rem", marginTop: ".25rem" }}>Instant access to all modules and system actions.</div>
        </div>
      </div>
    </Panel>
  );
};

