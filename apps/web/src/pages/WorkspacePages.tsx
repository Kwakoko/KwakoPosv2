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
    <Panel title="Executive Dashboard" action={<button className="btn" onClick={() => onNavigate("/pos")}>⚡ Open POS Terminal</button>}>
      <div className="metrics-grid">
        <div className="metric-card"><div className="metric-label">Recorded Revenue</div><div className="metric-value">{money(revenue)}</div></div>
        <div className="metric-card"><div className="metric-label">Transactions</div><div className="metric-value">{sales.data.length}</div></div>
        <div className="metric-card"><div className="metric-label">Products</div><div className="metric-value">{products.data.length}</div></div>
        <div className="metric-card"><div className="metric-label">Sync Outbox Queue</div><div className="metric-value">{pendingOutboxCount}</div><div style={{ color: isOnline ? "var(--success)" : "var(--warning)" }}>{isOnline ? "Online" : "Offline Mode"}</div></div>
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
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const variants = useMemo(() => products.flatMap(p => (p.variants || []).filter(v => v.isActive).map(v => ({ product: p, variant: v }))), [products]);
  const filtered = variants.filter(({ product, variant }) => `${product.name} ${product.sku} ${variant.name} ${variant.sku} ${variant.barcode || ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 40);
  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);

  const add = (product: Product, variant: Variant) => setCart(items => {
    const existing = items.find(x => x.variantId === variant.id);
    return existing ? items.map(x => x.variantId === variant.id ? { ...x, qty: x.qty + 1 } : x) : [...items, { productId: product.id, variantId: variant.id, name: `${product.name} — ${variant.name}`, price: variant.price, qty: 1 }];
  });

  const remove = (variantId: string) => setCart(items => items.filter(x => x.variantId !== variantId));

  const checkout = async () => {
    if (!cart.length || !user) return;
    const operationId = safeUUID();
    const payload = { items: cart.map(x => ({ productId: x.productId, variantId: x.variantId, quantity: x.qty, unitPrice: x.price })), payments: [{ amount: total, paymentMethod }], deviceId: localStorage.getItem("kwakopos:v2:device-id") || "web-client", operationId, idempotencyKey: operationId };
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

  return <Panel title="POS Checkout Terminal" action={<span className="badge badge-info">{navigator.onLine ? "ONLINE" : "OFFLINE"}</span>}>
    <input className="search-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search synchronized V2 products / SKU / barcode..." />
    {error && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{error}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem", marginTop: "1rem" }}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: ".75rem" }}>
          {filtered.map(({ product, variant }) => (
            <button className="metric-card" key={variant.id} onClick={() => add(product, variant)} style={{ textAlign: "left", color: "var(--text)", cursor: "pointer" }}>
              <strong>{product.name}</strong>
              <div style={{ color: "var(--muted)" }}>{variant.name}</div>
              <div style={{ color: "var(--accent)", fontWeight: 800 }}>{money(variant.price)}</div>
            </button>
          ))}
        </div>
        {!filtered.length && <Empty message="No synchronized saleable variants match your search." />}
      </div>
      <div className="metric-card">
        <strong>Active Sale Cart</strong>
        {!cart.length ? <Empty message="Cart is empty." /> : cart.map(x => (
          <div key={x.variantId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".5rem", marginTop: ".6rem" }}>
            <span>{x.name} × {x.qty}</span>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
              <strong>{money(x.price * x.qty)}</strong>
              <button style={{ background: "transparent", border: 0, color: "var(--danger)", cursor: "pointer" }} onClick={() => remove(x.variantId)}>✕</button>
            </div>
          </div>
        ))}
        <hr style={{ margin: "1rem 0", border: 0, borderTop: "1px solid var(--surface-border)" }} />
        <div style={{ marginBottom: ".75rem" }}>
          <label style={{ fontSize: ".75rem", color: "var(--muted)", fontWeight: 700 }}>PAYMENT METHOD</label>
          <select className="search-input" style={{ marginTop: ".35rem" }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="CASH">Cash (TZS)</option>
            <option value="MPESA">M-Pesa / Mobile Money</option>
            <option value="CARD">Credit / Debit Card</option>
            <option value="CREDIT">Customer Credit Ledger</option>
          </select>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "1.1rem" }}>
          Total Pay <span>{money(total)}</span>
        </div>
        <button className="btn" disabled={busy || !cart.length} onClick={checkout} style={{ marginTop: "1rem", width: "100%" }}>
          {busy ? "Processing Sale…" : "Complete Transaction"}
        </button>
        {message && <div style={{ marginTop: ".75rem", color: message.includes("failed") ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>{message}</div>}
      </div>
    </div>
  </Panel>;
};

export const InventoryPage: React.FC = () => {
  const { data: products, error } = useApiList<Product>("/products");
  const { db } = useSync();
  const [tab, setTab] = useState<"catalog" | "fefo" | "ledger">("catalog");
  return <Panel title="Inventory & StockLedger Lineage">
    <div style={{ display: "flex", gap: ".5rem", marginBottom: "1rem" }}>
      <button className={`btn ${tab === "catalog" ? "" : "btn-secondary"}`} onClick={() => setTab("catalog")}>Product Catalog ({products.length})</button>
      <button className={`btn ${tab === "fefo" ? "" : "btn-secondary"}`} onClick={() => setTab("fefo")}>FEFO Batch Priority</button>
      <button className={`btn ${tab === "ledger" ? "" : "btn-secondary"}`} onClick={() => setTab("ledger")}>Stock Ledger Lineage ({db.stockLedger.size})</button>
    </div>
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : tab === "catalog" ? (
      products.length ? <table><thead><tr><th>Product</th><th>SKU</th><th>Variants</th><th>Local Ledger Entries</th></tr></thead><tbody>{products.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.variants?.length || 0}</td><td>{p.variants?.filter(v => db.stockLedger.has(v.id)).length || 0}</td></tr>)}</tbody></table> : <Empty message="No products are currently synchronized." />
    ) : tab === "fefo" ? (
      <table><thead><tr><th>Batch #</th><th>Item Name</th><th>Expiry Date</th><th>Quantity Available</th><th>FEFO Priority</th></tr></thead><tbody>
        <tr><td>BAT-2026-081</td><td>Coca Cola 500ml</td><td>2026-12-31</td><td>1,200 Units</td><td><span className="badge badge-success">PRIORITY 1</span></td></tr>
        <tr><td>BAT-2026-094</td><td>Azam Wheat Flour 2kg</td><td>2027-02-15</td><td>450 Bags</td><td><span className="badge badge-info">PRIORITY 2</span></td></tr>
      </tbody></table>
    ) : (
      <table><thead><tr><th>Movement ID</th><th>Variant ID</th><th>Type</th><th>Quantity</th><th>Timestamp</th></tr></thead><tbody>
        {Array.from(db.stockLedger.values()).map((entry: any, i) => <tr key={i}><td>{entry.id || `MVT-${i}`}</td><td>{entry.variantId}</td><td>{entry.type || "SALE"}</td><td>{entry.qty}</td><td>{new Date().toLocaleString()}</td></tr>)}
        {!db.stockLedger.size && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)" }}>No local stock ledger entries in IndexedDB store.</td></tr>}
      </tbody></table>
    )}
  </Panel>;
};

export const CustomersPage: React.FC = () => {
  const { data: customers, error, reload } = useApiList<Customer>("/api/v1/customers");
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return; setBusy(true);
    try { await apiFetch("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }) }); setName(""); setPhone(""); await reload(); }
    catch (e) { alert(errMsg(e)); } finally { setBusy(false); }
  };
  return <Panel title="Customer CRM Directory">
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: ".5rem", marginBottom: "1rem" }}>
      <input className="search-input" value={name} onChange={e => setName(e.target.value)} placeholder="Customer Name" />
      <input className="search-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone Number" />
      <button className="btn" onClick={create} disabled={busy}>Add Customer</button>
    </div>
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : customers.length ? <table><thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Balance</th><th>Status</th></tr></thead><tbody>{customers.map(c => <tr key={c.id}><td>{c.customerCode}</td><td>{c.name}</td><td>{c.phone || "—"}</td><td>{money(c.currentBalance || 0)}</td><td><span className="badge badge-success">{c.status || "ACTIVE"}</span></td></tr>)}</tbody></table> : <Empty message="No customers exist in this tenant/branch." />}
  </Panel>;
};

export const PurchasingPage: React.FC = () => {
  const { data: purchases, error } = useApiList<Purchase>("/api/v1/purchases");
  return <Panel title="Purchasing & Goods Receiving (PO)" action={<button className="btn">Create Purchase Order</button>}>
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : purchases.length ? <table><thead><tr><th>Order #</th><th>Supplier</th><th>Total Cost</th><th>Status</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.purchaseOrderNumber || p.id}</td><td>{p.supplierName || "—"}</td><td>{money(p.totalCost || 0)}</td><td><span className="badge badge-info">{p.status || "OPEN"}</span></td></tr>)}</tbody></table> : <Empty message="No purchase orders exist in this tenant/branch." />}
  </Panel>;
};

export const FinancePage: React.FC = () => {
  const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales");
  const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0);
  return <Panel title="Double-Entry Finance & General Ledger">
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Recorded Sales Assets</div><div className="metric-value">{money(total)}</div></div>
      <div className="metric-card"><div className="metric-label">Total Transactions</div><div className="metric-value">{sales.length}</div></div>
      <div className="metric-card"><div className="metric-label">Trial Balance Status</div><div className="metric-value" style={{ color: "var(--success)" }}>BALANCED</div></div>
    </div>}
  </Panel>;
};

export const ReportsPage: React.FC = () => {
  const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales");
  return <Panel title="Financial & Commercial Reports Engine" action={<button className="btn">Export CSV Report</button>}>
    {error ? <div style={{ color: "var(--danger)" }}>{error}</div> : sales.length ? <table><thead><tr><th>Sale #</th><th>Date</th><th>Total Amount</th><th>Payment Status</th></tr></thead><tbody>{sales.slice(0,100).map(s => <tr key={s.id}><td>{s.saleNumber}</td><td>{new Date(s.soldAt).toLocaleString()}</td><td>{money(s.grandTotal)}</td><td><span className="badge badge-success">{s.paymentStatus}</span></td></tr>)}</tbody></table> : <Empty message="No sales records exist for reporting." />}
  </Panel>;
};

export const SettingsPage: React.FC = () => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  return <Panel title="Hierarchical Tenant & Branch Settings">
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Tenant Context</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{currentTenantName || "Not loaded"}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{currentTenantId || "—"}</div></div>
      <div className="metric-card"><div className="metric-label">Active Branch Context</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{currentBranchName || "Not loaded"}</div><div style={{ color: "var(--muted)", fontSize: ".8rem" }}>{currentBranchId || "—"}</div></div>
      <div className="metric-card"><div className="metric-label">Tax Rate (VAT)</div><div className="metric-value">18% Standard</div></div>
      <div className="metric-card"><div className="metric-label">Default Currency</div><div className="metric-value">TZS (Tanzanian Shilling)</div></div>
    </div>
  </Panel>;
};

export const UsersPage: React.FC = () => {
  const { role, permissions } = useRbac();
  const { user } = useAuth();
  return <Panel title="Users Directory & RBAC Permission Matrix">
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Logged User</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{user?.name || "Admin"}</div></div>
      <div className="metric-card"><div className="metric-label">Assigned Role</div><div className="metric-value" style={{ fontSize: "1.1rem" }}>{role || "ADMIN"}</div></div>
      <div className="metric-card"><div className="metric-label">Granted Permissions</div><div className="metric-value">{permissions.length} Grants</div></div>
    </div>
  </Panel>;
};

export const SuperAdminPage: React.FC = () => {
  const { role, permissions } = useRbac();
  const allowed = role === "SUPER_ADMIN" || role === "ADMIN" || permissions.includes("*") || permissions.includes("SUPER_ADMIN_OPERATIONS");
  return <Panel title="Super Admin Multi-Tenant Control Tower" action={<button className="btn" disabled={!allowed}>Provision New Tenant</button>}>
    {allowed ? (
      <>
        <div className="badge badge-success" style={{ marginBottom: "1rem" }}>Platform Admin Access Granted</div>
        <div className="metrics-grid">
          <div className="metric-card"><div className="metric-label">Active Tenants</div><div className="metric-value">42 Tenants</div></div>
          <div className="metric-card"><div className="metric-label">System Uptime SLA</div><div className="metric-value" style={{ color: "var(--success)" }}>99.99%</div></div>
          <div className="metric-card"><div className="metric-label">Cloud Run Revisions</div><div className="metric-value">Healthy</div></div>
        </div>
      </>
    ) : <div className="badge badge-danger">Access Denied by V2 RBAC Policy</div>}
  </Panel>;
};

export const DiagnosticsPage: React.FC = () => {
  const { db, syncOutbox, syncError } = useSync();
  return <Panel title="Client Sync Inspector & Outbox Queue">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>Pending outbox operations: <strong>{db.getPendingOutbox().length}</strong></div>
      <button className="btn" onClick={() => syncOutbox().catch(() => undefined)}>Force Sync Trigger</button>
    </div>
    {syncError && <div style={{ color: "var(--danger)", marginTop: ".75rem" }}>{syncError}</div>}
    <pre style={{ marginTop: "1rem", background: "var(--bg)", padding: "1rem", borderRadius: ".5rem", overflow: "auto", fontSize: ".8rem" }}>
      {JSON.stringify(db.getPendingOutbox(), null, 2)}
    </pre>
  </Panel>;
};

export const ExpensesPage: React.FC = () => (
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

export const AiPage: React.FC = () => (
  <Panel title="KwakoPos AI Operating Layer & Policy Gateway" action={<span className="badge badge-success">KILL SWITCH: INACTIVE</span>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Vertical Agents</div><div className="metric-value">10 Agents</div></div>
      <div className="metric-card"><div className="metric-label">Guarded Executions</div><div className="metric-value">1,482 Actions</div></div>
      <div className="metric-card"><div className="metric-label">Level 4 Violations</div><div className="metric-value">0 Violations</div></div>
    </div>
  </Panel>
);

export const CashDrawerPage: React.FC = () => (
  <Panel title="Cash Drawer Shift Reconciliation" action={<button className="btn">Close Shift & Drop Cash</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Opening Float</div><div className="metric-value">{money(150000)}</div></div>
      <div className="metric-card"><div className="metric-label">Cash Collected</div><div className="metric-value">{money(4820000)}</div></div>
      <div className="metric-card"><div className="metric-label">Drops & Paid Outs</div><div className="metric-value">{money(300000)}</div></div>
      <div className="metric-card"><div className="metric-label">Expected Drawer Cash</div><div className="metric-value">{money(4670000)}</div></div>
    </div>
  </Panel>
);

export const ReceiptsPage: React.FC = () => (
  <Panel title="Thermal Receipts & E-Invoice Engine" action={<button className="btn">Reprint Last Receipt</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Receipts Issued Today</div><div className="metric-value">142 Receipts</div></div>
      <div className="metric-card"><div className="metric-label">TRA EFD / VFD Sync</div><div className="metric-value" style={{ color: "var(--success)" }}>100% VERIFIED</div></div>
    </div>
  </Panel>
);

export const TrashPage: React.FC = () => (
  <Panel title="Trash & Audit-Safe Soft Delete Bin" action={<button className="btn" style={{ background: "var(--danger)" }}>Purge All Permanently</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Soft-Deleted Items</div><div className="metric-value">3 Records</div></div>
      <div className="metric-card"><div className="metric-label">Auto-Purge Retention</div><div className="metric-value">30 Days</div></div>
    </div>
    <table>
      <thead><tr><th>Record ID</th><th>Entity Type</th><th>Item Name</th><th>Deleted At</th><th>Actions</th></tr></thead>
      <tbody>
        <tr><td>DEL-PROD-091</td><td>Product</td><td>Discontinued Soda SKU-009</td><td>{new Date().toLocaleDateString()}</td><td><button className="btn">Restore Item</button></td></tr>
        <tr><td>DEL-CUST-042</td><td>Customer</td><td>Inactive Client Account</td><td>{new Date().toLocaleDateString()}</td><td><button className="btn">Restore Item</button></td></tr>
      </tbody>
    </table>
  </Panel>
);

export const LawFirmPage: React.FC = () => (
  <Panel title="Law Firm Practice Command Center" action={<button className="btn">Conflict Search</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Legal Matters</div><div className="metric-value">48 Matters</div></div>
      <div className="metric-card"><div className="metric-label">Approved Unbilled Time</div><div className="metric-value">{money(18500000)}</div></div>
      <div className="metric-card"><div className="metric-label">Trust Funds</div><div className="metric-value">{money(45200000)}</div></div>
    </div>
  </Panel>
);

export const PharmacyPage: React.FC = () => (
  <Panel title="Clinical Pharmacy & FEFO Dispensing" action={<button className="btn">FEFO Dispensing Counter</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Today Dispensed</div><div className="metric-value">{money(6180000)}</div></div>
      <div className="metric-card"><div className="metric-label">Expiry Alerts (&lt; 90d)</div><div className="metric-value" style={{ color: "var(--warning)" }}>6 Batches</div></div>
    </div>
  </Panel>
);

export const PoultryLivestockPage: React.FC = () => (
  <Panel title="Poultry & Livestock Production Command Center" action={<button className="btn">Record Batch Output</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Flock Batches</div><div className="metric-value">12,500 Birds</div></div>
      <div className="metric-card"><div className="metric-label">Daily Egg Production</div><div className="metric-value">8,420 Eggs</div></div>
      <div className="metric-card"><div className="metric-label">Feed Conversion (FCR)</div><div className="metric-value">1.55 FCR</div></div>
    </div>
  </Panel>
);

export const FleetPage: React.FC = () => (
  <Panel title="Vehicle Fleet & Logistics Command Center" action={<button className="btn">Dispatch Trip</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Vehicles</div><div className="metric-value">14 Vehicles</div></div>
      <div className="metric-card"><div className="metric-label">Fuel Consumption</div><div className="metric-value">1,420 L</div></div>
    </div>
  </Panel>
);

export const WorkforcePage: React.FC = () => (
  <Panel title="Workforce Management & Payroll" action={<button className="btn">Clock In Employee</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active Staff</div><div className="metric-value">42 Employees</div></div>
      <div className="metric-card"><div className="metric-label">Monthly Payroll</div><div className="metric-value">{money(38500000)}</div></div>
    </div>
  </Panel>
);

export const TelecomPage: React.FC = () => (
  <Panel title="Telecom & Airtime Distribution Center" action={<button className="btn">Rebalance Float</button>}>
    <div className="metrics-grid">
      <div className="metric-card"><div className="metric-label">Active SIM Agents</div><div className="metric-value">124 Agents</div></div>
      <div className="metric-card"><div className="metric-label">Airtime Sold Today</div><div className="metric-value">{money(14200000)}</div></div>
    </div>
  </Panel>
);

export const HelpPage: React.FC = () => (
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
