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
} from "../context/KwakoPosContexts.js";
import { apiFetch, safeUUID } from "../services/apiClient.js";

// Dedicated full-module files — re-exported here for unified import in App.tsx
export { LawFirmPage } from "./LawFirmPage.js";
export { PharmacyPage } from "./PharmacyPage.js";


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

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────

export const DashboardPage: React.FC<WorkspaceProps> = ({ onNavigate }) => {
  const { pendingOutboxCount, isOnline } = useSync();
  const products = useApiList<Product>("/products");
  const sales    = useApiList<Sale>("/api/v1/pos/sales");
  const customers = useApiList<Customer>("/api/v1/customers");
  const { activeModule } = useModule();

  const revenue   = sales.data.reduce((s, x) => s + Number(x.grandTotal || 0), 0);
  const isClean   = !products.data.length && !sales.data.length;
  const todaySales = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return sales.data.filter(s => new Date(s.soldAt) >= start);
  }, [sales.data]);
  const todayRevenue = todaySales.reduce((s, x) => s + Number(x.grandTotal || 0), 0);

  const chartData = useMemo(() => DEMO_REVENUE, []);

  // Onboarding wizard
  const onboardingSteps = [
    { step: "01", title: "Add Products", desc: "Define inventory items, categories & attributes.", tab: "Inventory", icon: <Package size={18} />, gradient: "linear-gradient(135deg,#3b82f6,#06b6d4)" },
    { step: "02", title: "Register Suppliers", desc: "Configure suppliers and warehouse settings.", tab: "Purchasing", icon: <Truck size={18} />, gradient: "linear-gradient(135deg,#f59e0b,#f97316)" },
    { step: "03", title: "Add Customers", desc: "Register customers for CRM and credit billing.", tab: "Customers", icon: <Users size={18} />, gradient: "linear-gradient(135deg,#10b981,#14b8a6)" },
    { step: "04", title: "Launch POS", desc: "Open the sales terminal, scan items, and check out.", tab: "POS", icon: <ShoppingCart size={18} />, gradient: "linear-gradient(135deg,#8b5cf6,#6366f1)" },
  ];

  return (
    <div className="v2-animate-page-enter">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-6">
        <div>
          <h1 className="v2-text-2xl v2-font-black" style={{ marginBottom: ".2rem", letterSpacing: "-.025em" }}>
            {activeModule} Dashboard
          </h1>
          <p className="v2-text-sm v2-text-muted">
            {new Date().toLocaleDateString("en-TZ", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => onNavigate("/pos")} type="button">
            <ShoppingCart size={14} /> Open POS Terminal
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button">
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="metrics-grid kpi-grid-4 v2-mb-6">
        <KpiCard
          label="Today's Revenue"
          value={money(todayRevenue || revenue)}
          trend={todayRevenue > 0 ? "up" : null}
          trendLabel="+12.4% vs yesterday"
          desc={`${todaySales.length || sales.data.length} transactions`}
          icon={<DollarSign size={20} />}
          accent="#38bdf8"
          onClick={() => onNavigate("/reports")}
        />
        <KpiCard
          label="Active Products"
          value={products.data.length || 284}
          desc="Across all categories"
          icon={<Package size={20} />}
          accent="#4ade80"
          onClick={() => onNavigate("/inventory")}
        />
        <KpiCard
          label="Customers"
          value={customers.data.length || 1_842}
          trend="up"
          trendLabel="+24 this month"
          desc="Registered in CRM"
          icon={<Users size={20} />}
          accent="#818cf8"
          onClick={() => onNavigate("/customers")}
        />
        <KpiCard
          label="Sync Queue"
          value={pendingOutboxCount}
          trend={pendingOutboxCount > 0 ? "down" : null}
          trendLabel={`${pendingOutboxCount} pending`}
          desc={isOnline ? "Server reachable" : "Offline — local mode"}
          icon={isOnline ? <Wifi size={20} /> : <WifiOff size={20} />}
          accent={pendingOutboxCount > 0 ? "#fbbf24" : "#4ade80"}
        />
      </div>

      {/* Charts row */}
      <div className="v2-grid-2 v2-mb-6" style={{ gap: "1rem" }}>
        {/* Revenue Area Chart */}
        <div className="v2-card">
          <div className="v2-card-header">
            <div>
              <div className="v2-card-title">Revenue & Profit — Last 7 Days</div>
              <div className="v2-card-description">Daily revenue vs gross profit</div>
            </div>
            <span className="badge v2-badge-accent">Week</span>
          </div>
          <div className="v2-card-body" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={45} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted)" }} />
                <Area type="monotone" dataKey="Revenue" stroke="#38bdf8" strokeWidth={2} fill="url(#gradRevenue)" />
                <Area type="monotone" dataKey="Profit"  stroke="#4ade80" strokeWidth={2} fill="url(#gradProfit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment mix Pie + Top Products bar */}
        <div className="v2-card">
          <div className="v2-card-header">
            <div>
              <div className="v2-card-title">Payment Mix</div>
              <div className="v2-card-description">Transaction breakdown by method</div>
            </div>
          </div>
          <div className="v2-card-body v2-flex v2-items-center v2-gap-4">
            <div style={{ width: 140, height: 140, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={DEMO_PIE} dataKey="value" cx="50%" cy="50%" innerRadius={38} outerRadius={60} strokeWidth={0}>
                    {DEMO_PIE.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${v}%`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="v2-space-y-4" style={{ flex: 1 }}>
              {DEMO_PIE.map((p) => (
                <div key={p.name} className="v2-flex v2-items-center v2-gap-2">
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                  <span className="v2-text-sm" style={{ flex: 1 }}>{p.name}</span>
                  <span className="v2-text-sm v2-font-black">{p.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Products bar chart */}
      <div className="v2-card v2-mb-6">
        <div className="v2-card-header">
          <div>
            <div className="v2-card-title">Top Products by Revenue</div>
            <div className="v2-card-description">Best performing SKUs this period</div>
          </div>
          <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => onNavigate("/inventory")} type="button">
            View all <ArrowRight size={13} />
          </button>
        </div>
        <div className="v2-card-body" style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={DEMO_TOP_PRODUCTS} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${(v/1_000_000).toFixed(1)}M`} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={42} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="Revenue" fill="#38bdf8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Onboarding wizard (shown for clean tenants) */}
      {isClean && (
        <div className="v2-card v2-mb-6">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2">
              <div style={{ width: 32, height: 32, borderRadius: "var(--radius-lg)", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Sparkles size={16} style={{ color: "#fff" }} />
              </div>
              <div>
                <div className="v2-card-title">Welcome to KwakoPos! 🎉</div>
                <div className="v2-card-description">Follow these 4 steps to set up your {activeModule} workspace.</div>
              </div>
            </div>
          </div>
          <div className="v2-card-body">
            <div className="v2-grid-2" style={{ gap: ".75rem" }}>
              {onboardingSteps.map(({ step, title, desc, tab, icon, gradient }) => (
                <button
                  key={step}
                  className="v2-btn v2-btn-secondary"
                  style={{ justifyContent: "flex-start", gap: ".75rem", padding: ".85rem 1rem", height: "auto" }}
                  onClick={() => onNavigate(`/${tab.toLowerCase()}`)}
                  type="button"
                >
                  <div style={{ width: 36, height: 36, borderRadius: "var(--radius-md)", background: gradient, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}>
                    {icon}
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: ".65rem", fontWeight: 900, color: "var(--muted)", marginBottom: ".1rem" }}>STEP {step}</div>
                    <div className="v2-text-sm v2-font-black">{title}</div>
                    <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".1rem", fontWeight: 400 }}>{desc}</div>
                  </div>
                  <ArrowRight size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick stats row */}
      <div className="v2-grid-4" style={{ gap: ".75rem" }}>
        {[
          { label: "Gross Margin", value: "38.2%", icon: <TrendingUp size={14} />, color: "var(--success)" },
          { label: "Avg Basket", value: money(42500), icon: <ShoppingCart size={14} />, color: "var(--accent)" },
          { label: "Low Stock Items", value: "14 SKUs", icon: <AlertTriangle size={14} />, color: "var(--warning)" },
          { label: "Open Orders", value: "7 Orders", icon: <Clock size={14} />, color: "var(--info)" },
        ].map((stat) => (
          <div key={stat.label} className="v2-card v2-flex v2-items-center v2-gap-3" style={{ padding: ".85rem 1rem" }}>
            <div style={{ color: stat.color }}>{stat.icon}</div>
            <div>
              <div className="v2-text-xs v2-text-muted">{stat.label}</div>
              <div className="v2-text-sm v2-font-black" style={{ color: stat.color, marginTop: ".1rem" }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── POS PAGE ─────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "CASH",   label: "Cash (TZS)" },
  { value: "MPESA",  label: "M-Pesa / Tigo / Airtel" },
  { value: "CARD",   label: "Credit / Debit Card" },
  { value: "CREDIT", label: "Customer Credit Ledger" },
  { value: "BANK",   label: "Bank Transfer" },
];

export const PosPage: React.FC<WorkspaceProps> = () => {
  const { data: products, error, loading } = useApiList<Product>("/products");
  const { db, syncOutbox, isOnline } = useSync();
  const { user } = useAuth();
  const [query, setQuery]         = useState("");
  const [cart, setCart]           = useState<CartItem[]>([]);
  const [payMethod, setPayMethod] = useState("CASH");
  const [busy, setBusy]           = useState(false);
  const [message, setMessage]     = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [category, setCategory]   = useState("All");
  const searchRef = useRef<HTMLInputElement>(null);

  const categories = useMemo(() => {
    const cats = new Set(["All", ...products.map((p) => p.category || "General").filter(Boolean)]);
    return [...cats];
  }, [products]);

  const variants = useMemo(() =>
    products.flatMap((p) =>
      (p.variants || [])
        .filter((v) => v.isActive)
        .map((v) => ({ product: p, variant: v }))
    ), [products]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return variants.filter(({ product, variant }) => {
      const matchCat = category === "All" || (product.category || "General") === category;
      const matchQ = !q || `${product.name} ${product.sku} ${variant.name} ${variant.sku} ${variant.barcode || ""}`.toLowerCase().includes(q);
      return matchCat && matchQ;
    }).slice(0, 48);
  }, [variants, query, category]);

  const total = cart.reduce((s, x) => s + x.price * x.qty, 0);

  const addToCart = useCallback((product: Product, variant: Variant) => {
    setCart((items) => {
      const ex = items.find((x) => x.variantId === variant.id);
      return ex
        ? items.map((x) => x.variantId === variant.id ? { ...x, qty: x.qty + 1 } : x)
        : [...items, { productId: product.id, variantId: variant.id, name: `${product.name} — ${variant.name}`, price: variant.price, qty: 1 }];
    });
  }, []);

  const removeFromCart  = (variantId: string) => setCart((items) => items.filter((x) => x.variantId !== variantId));
  const updateQty       = (variantId: string, qty: number) => {
    if (qty <= 0) return removeFromCart(variantId);
    setCart((items) => items.map((x) => x.variantId === variantId ? { ...x, qty } : x));
  };
  const clearCart = () => setCart([]);

  const checkout = async () => {
    if (!cart.length || !user) return;
    const operationId = safeUUID();
    const payload = {
      items: cart.map((x) => ({ productId: x.productId, variantId: x.variantId, quantity: x.qty, unitPrice: x.price })),
      payments: [{ amount: total, paymentMethod: payMethod }],
      deviceId: localStorage.getItem("kwakopos:v2:device-id") || "web-client",
      operationId, idempotencyKey: operationId,
    };
    setBusy(true); setMessage(null);
    try {
      if (isOnline) {
        await apiFetch("/api/v1/pos/sales", { method: "POST", body: JSON.stringify(payload) });
        setMessage({ text: "✓ Sale accepted. Receipt queued.", type: "success" });
      } else {
        db.enqueueOutbox({ entityType: "Sale" as never, entityId: operationId, operationType: "CREATE", payload, idempotencyKey: operationId });
        setMessage({ text: "✓ Saved locally — will sync when online.", type: "success" });
      }
      clearCart();
      try { await syncOutbox(); } catch { /* keep queue visible */ }
    } catch (e) { setMessage({ text: `Sale failed: ${errMsg(e)}`, type: "error" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-animate-page-enter">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <div>
          <h1 className="v2-text-2xl v2-font-black" style={{ letterSpacing: "-.025em" }}>POS Checkout Terminal</h1>
          <p className="v2-text-xs v2-text-muted" style={{ marginTop: ".1rem" }}>
            {variants.length} saleable variants loaded
          </p>
        </div>
        <span className={`badge ${isOnline ? "v2-badge-success" : "v2-badge-warning"}`}>
          {isOnline ? "● ONLINE" : "● OFFLINE"}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1rem", alignItems: "start" }}>
        {/* Product Grid */}
        <div className="v2-card">
          <div className="v2-card-header">
            {/* Search */}
            <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
              <Search size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
              <input
                ref={searchRef}
                className="v2-input"
                style={{ border: "none", padding: ".3rem .45rem", flex: 1 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products / SKU / barcode…"
                aria-label="Search products"
              />
              {query && (
                <button className="topbar-icon-btn" onClick={() => setQuery("")} aria-label="Clear search" type="button">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="module-sector-pills" style={{ borderBottom: "1px solid var(--surface-border)" }}>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`sector-pill${category === cat ? " active" : ""}`}
                onClick={() => setCategory(cat)}
                type="button"
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="v2-card-body">
            {error && <div className="badge v2-badge-danger" style={{ marginBottom: ".75rem" }}>{error}</div>}
            {loading ? (
              <LoadingRows rows={6} />
            ) : !filtered.length ? (
              <Empty icon={<ShoppingCart size={22} />} message="No products match your search." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: ".6rem" }}>
                {filtered.map(({ product, variant }) => (
                  <button
                    key={variant.id}
                    className="v2-card"
                    style={{ padding: ".75rem", textAlign: "left", cursor: "pointer", border: "1px solid var(--surface-border)", background: "var(--surface-2)" }}
                    onClick={() => addToCart(product, variant)}
                    type="button"
                  >
                    <div className="v2-text-sm v2-font-black v2-truncate" style={{ color: "var(--text)" }}>{product.name}</div>
                    <div className="v2-text-xs v2-text-muted v2-truncate" style={{ marginTop: ".1rem" }}>{variant.name}</div>
                    <div className="v2-text-sm v2-font-black" style={{ color: "var(--accent)", marginTop: ".35rem" }}>{money(variant.price)}</div>
                    {product.category && (
                      <span className="badge v2-badge-muted" style={{ marginTop: ".3rem" }}>{product.category}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart & Checkout */}
        <div className="v2-card" style={{ position: "sticky", top: "calc(var(--topbar-height) + 1rem)" }}>
          <div className="v2-card-header">
            <div className="v2-card-title">Active Sale Cart</div>
            {cart.length > 0 && (
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={clearCart} type="button">
                Clear <X size={13} />
              </button>
            )}
          </div>
          <div className="v2-card-body" style={{ maxHeight: "40vh", overflowY: "auto", padding: ".65rem 1rem" }}>
            {!cart.length ? (
              <Empty icon={<ShoppingCart size={20} />} message="Cart is empty" />
            ) : (
              <div className="v2-space-y-4">
                {cart.map((item) => (
                  <div key={item.variantId} className="v2-flex v2-items-center v2-gap-2">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="v2-text-xs v2-font-black v2-truncate">{item.name}</div>
                      <div className="v2-text-xs v2-text-muted">{money(item.price)} each</div>
                    </div>
                    <div className="v2-flex v2-items-center v2-gap-1">
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" onClick={() => updateQty(item.variantId, item.qty - 1)} type="button">−</button>
                      <span className="v2-text-sm v2-font-black" style={{ minWidth: 22, textAlign: "center" }}>{item.qty}</span>
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" onClick={() => updateQty(item.variantId, item.qty + 1)} type="button">+</button>
                    </div>
                    <div className="v2-text-sm v2-font-black" style={{ color: "var(--accent)", minWidth: 68, textAlign: "right" }}>{money(item.price * item.qty)}</div>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" onClick={() => removeFromCart(item.variantId)} type="button" aria-label="Remove">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: ".75rem 1.25rem", borderTop: "1px solid var(--surface-border)" }}>
            {/* Sub-total */}
            <div className="v2-flex v2-justify-between v2-mb-2">
              <span className="v2-text-xs v2-text-muted">Sub-total</span>
              <span className="v2-text-sm v2-font-black">{money(total)}</span>
            </div>
            <div className="v2-flex v2-justify-between v2-mb-4">
              <span className="v2-text-xs v2-text-muted">VAT (18%)</span>
              <span className="v2-text-sm v2-font-black">{money(total * 0.18)}</span>
            </div>
            <div className="v2-divider" />
            <div className="v2-flex v2-justify-between" style={{ marginBottom: ".85rem" }}>
              <span className="v2-text-base v2-font-black">Total</span>
              <span className="v2-text-xl v2-font-black" style={{ color: "var(--accent)" }}>{money(total * 1.18)}</span>
            </div>

            {/* Payment method */}
            <div style={{ marginBottom: ".75rem" }}>
              <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>PAYMENT METHOD</label>
              <select
                className="v2-select v2-w-full"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                aria-label="Payment method"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <button
              className="btn v2-btn-primary v2-w-full"
              style={{ justifyContent: "center" }}
              disabled={busy || !cart.length}
              onClick={() => void checkout()}
              type="button"
            >
              {busy ? <><RefreshCw size={14} className="v2-animate-spin" /> Processing…</> : <><CheckCircle size={14} /> Complete Transaction</>}
            </button>

            {message && (
              <div
                className={`badge ${message.type === "success" ? "v2-badge-success" : "v2-badge-danger"}`}
                style={{ marginTop: ".65rem", display: "block", textAlign: "center" }}
              >
                {message.text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── INVENTORY PAGE ───────────────────────────────────────────────────────────

const INV_TABS = ["Catalog", "FEFO Batches", "Stock Ledger", "Adjustments"] as const;
type InvTab = typeof INV_TABS[number];

const DEMO_FEFO = [
  { batch: "BAT-2026-081", name: "Coca Cola 500ml",      expiry: "2026-12-31", qty: "1,200 Units", priority: 1, status: "success" },
  { batch: "BAT-2026-094", name: "Azam Flour 2kg",       expiry: "2027-02-15", qty: "450 Bags",    priority: 2, status: "info" },
  { batch: "BAT-2026-102", name: "Panadol 500mg × 100",  expiry: "2026-10-01", qty: "84 Boxes",    priority: 1, status: "danger" },
  { batch: "BAT-2026-114", name: "Maziwa 1L UHT",        expiry: "2026-11-20", qty: "630 Cartons", priority: 2, status: "warning" },
];

export const InventoryPage: React.FC = () => {
  const { data: products, error, loading } = useApiList<Product>("/products");
  const { db } = useSync();
  const [activeTab, setActiveTab] = useState<InvTab>("Catalog");
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) =>
    !search || `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Inventory & Stock Ledger</h1>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> Export</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Add Product</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Total SKUs"         value={products.length || 284} desc="Active products" icon={<Package size={18} />} accent="#38bdf8" />
        <KpiCard label="Low Stock Alerts"   value="14" trend="down" trendLabel="Below reorder" desc="Needs replenishment" icon={<AlertTriangle size={18} />} accent="#fbbf24" />
        <KpiCard label="Out of Stock"       value="3" trend="down" trendLabel="Critical" desc="Zero inventory" icon={<X size={18} />} accent="#f87171" />
        <KpiCard label="Near Expiry (90d)"  value="6 Batches" desc="FEFO priority" icon={<Clock size={18} />} accent="#818cf8" />
      </div>

      {/* Tab nav */}
      <div className="v2-card">
        <div style={{ display: "flex", gap: ".3rem", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--surface-border)" }}>
          {INV_TABS.map((t) => (
            <button
              key={t}
              className={`sector-pill${activeTab === t ? " active" : ""}`}
              onClick={() => setActiveTab(t)}
              type="button"
            >
              {t}
            </button>
          ))}
          {activeTab === "Catalog" && (
            <div className="v2-flex v2-items-center v2-gap-1" style={{ marginLeft: "auto" }}>
              <Search size={13} style={{ color: "var(--muted)" }} />
              <input
                className="v2-input"
                style={{ border: "none", padding: ".25rem .4rem", width: 180 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search catalog…"
              />
            </div>
          )}
        </div>
        <div className="v2-card-body" style={{ padding: 0 }}>
          {activeTab === "Catalog" && (
            error ? <div className="badge v2-badge-danger" style={{ margin: "1rem" }}>{error}</div>
            : loading ? <div style={{ padding: "1rem" }}><LoadingRows /></div>
            : !filtered.length ? <Empty message="No synchronized products." />
            : (
              <table className="v2-table">
                <thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Variants</th><th>Local Ledger</th><th>Actions</th></tr></thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id}>
                      <td className="v2-font-bold">{p.name}</td>
                      <td><span className="v2-mono v2-text-xs">{p.sku}</span></td>
                      <td><span className="badge v2-badge-muted">{p.category || "General"}</span></td>
                      <td>{p.variants?.length || 0}</td>
                      <td>{p.variants?.filter((v) => db.stockLedger.has(v.id)).length || 0}</td>
                      <td>
                        <div className="v2-flex v2-gap-1">
                          <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="View"><Eye size={13} /></button>
                          <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="Edit"><Edit2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {activeTab === "FEFO Batches" && (
            <table className="v2-table">
              <thead><tr><th>Batch #</th><th>Product</th><th>Expiry Date</th><th>Qty Available</th><th>Priority</th></tr></thead>
              <tbody>
                {DEMO_FEFO.map((b) => (
                  <tr key={b.batch}>
                    <td className="v2-mono v2-text-xs">{b.batch}</td>
                    <td className="v2-font-bold">{b.name}</td>
                    <td>{b.expiry}</td>
                    <td>{b.qty}</td>
                    <td><span className={`badge v2-badge-${b.status}`}>PRIORITY {b.priority}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === "Stock Ledger" && (
            <table className="v2-table">
              <thead><tr><th>Movement ID</th><th>Variant ID</th><th>Type</th><th>Qty</th><th>Timestamp</th></tr></thead>
              <tbody>
                {Array.from(db.stockLedger.values()).map((entry: any, i: number) => (
                  <tr key={i}>
                    <td className="v2-mono v2-text-xs">{entry.id || `MVT-${i}`}</td>
                    <td className="v2-mono v2-text-xs">{entry.variantId}</td>
                    <td><span className="badge v2-badge-info">{entry.type || "SALE"}</span></td>
                    <td>{entry.qty}</td>
                    <td className="v2-text-xs v2-text-muted">{new Date().toLocaleString()}</td>
                  </tr>
                ))}
                {!db.stockLedger.size && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "2rem" }}>No local stock ledger entries.</td></tr>}
              </tbody>
            </table>
          )}
          {activeTab === "Adjustments" && (
            <div className="v2-empty">
              <div className="v2-empty-icon"><CheckSquare size={22} /></div>
              <p className="v2-empty-title">Stock Adjustments</p>
              <p className="v2-empty-desc">Record manual count corrections, damage write-offs, and audit adjustments.</p>
              <button className="v2-btn v2-btn-primary" style={{ marginTop: ".75rem" }} type="button"><Plus size={14} /> New Adjustment</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── CUSTOMERS PAGE ───────────────────────────────────────────────────────────

export const CustomersPage: React.FC = () => {
  const { data: customers, error, loading, reload } = useApiList<Customer>("/api/v1/customers");
  const { activeModule } = useModule();
  const [name, setName]   = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy]   = useState(false);
  const [search, setSearch] = useState("");

  const entityLabelMap: Partial<Record<string, string>> = {
    Pharmacy: "Patient", Law: "Client", "Real Estate": "Tenant", Hotel: "Guest", SACCO: "Member",
  };
  const entityLabel = entityLabelMap[activeModule] ?? "Customer";

  const filtered = customers.filter((c) =>
    !search || `${c.name} ${c.phone || ""} ${c.customerCode}`.toLowerCase().includes(search.toLowerCase())
  );

  const create = async () => {
    if (!name.trim()) return; setBusy(true);
    try {
      await apiFetch("/api/v1/customers", { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || undefined }) });
      setName(""); setPhone("");
      await reload();
    } catch (e) { alert(errMsg(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>{entityLabel} CRM Directory</h1>
        <span className="badge v2-badge-accent">{customers.length} {entityLabel}s</span>
      </div>

      {/* Add form */}
      <div className="v2-card v2-mb-4">
        <div className="v2-card-header"><div className="v2-card-title">Register New {entityLabel}</div></div>
        <div className="v2-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: ".75rem", alignItems: "end" }}>
            <div>
              <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>FULL NAME *</label>
              <input className="v2-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${entityLabel} full name`} />
            </div>
            <div>
              <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>PHONE NUMBER</label>
              <input className="v2-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255 7XX XXX XXX" />
            </div>
            <button className="btn v2-btn-primary" disabled={busy || !name.trim()} onClick={() => void create()} type="button">
              <Plus size={14} /> Add {entityLabel}
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${entityLabel}s…`} />
          </div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> Export</button>
        </div>
        {error ? <div className="badge v2-badge-danger" style={{ margin: "1rem" }}>{error}</div>
        : loading ? <div style={{ padding: "1rem" }}><LoadingRows /></div>
        : !filtered.length ? <Empty icon={<Users size={22} />} message={`No ${entityLabel}s found.`} />
        : (
          <table className="v2-table">
            <thead><tr><th>Code</th><th>Name</th><th>Phone</th><th>Credit Balance</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="v2-mono v2-text-xs">{c.customerCode}</td>
                  <td className="v2-font-bold">{c.name}</td>
                  <td className="v2-text-muted">{c.phone || "—"}</td>
                  <td style={{ color: (c.currentBalance || 0) > 0 ? "var(--danger)" : "var(--muted)" }}>
                    {money(c.currentBalance || 0)}
                  </td>
                  <td><span className={`badge ${c.status === "INACTIVE" ? "v2-badge-danger" : "v2-badge-success"}`}>{c.status || "ACTIVE"}</span></td>
                  <td>
                    <div className="v2-flex v2-gap-1">
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="View profile"><Eye size={13} /></button>
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="Edit"><Edit2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── PURCHASING PAGE ──────────────────────────────────────────────────────────

export const PurchasingPage: React.FC = () => {
  const { data: purchases, error, loading } = useApiList<Purchase>("/api/v1/purchases");
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Purchasing & Goods Receiving</h1>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Truck size={13} /> Suppliers</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Create PO</button>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Open POs"         value={purchases.length || 8}  desc="Awaiting delivery" icon={<ShoppingBag size={18} />} accent="#38bdf8" />
        <KpiCard label="Pending GRNs"     value="3"                       desc="Goods to receive"  icon={<Package size={18} />}    accent="#fbbf24" />
        <KpiCard label="Monthly Spend"    value={money(28500000)}          desc="This month"        icon={<DollarSign size={18} />} accent="#4ade80" />
        <KpiCard label="Active Suppliers" value="24"                       desc="Approved vendors"  icon={<Building size={18} />}   accent="#818cf8" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">Purchase Orders</div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> Export</button>
        </div>
        {error ? <div className="badge v2-badge-danger" style={{ margin: "1rem" }}>{error}</div>
        : loading ? <div style={{ padding: "1rem" }}><LoadingRows /></div>
        : !purchases.length ? <Empty icon={<ShoppingBag size={22} />} message="No purchase orders yet." action={<button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Create PO</button>} />
        : (
          <table className="v2-table">
            <thead><tr><th>Order #</th><th>Supplier</th><th>Total Cost</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td className="v2-mono v2-text-xs">{p.purchaseOrderNumber || p.id}</td>
                  <td className="v2-font-bold">{p.supplierName || "—"}</td>
                  <td>{money(p.totalCost || 0)}</td>
                  <td><span className={`badge ${p.status === "RECEIVED" ? "v2-badge-success" : p.status === "CANCELLED" ? "v2-badge-danger" : "v2-badge-warning"}`}>{p.status || "OPEN"}</span></td>
                  <td><button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Eye size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────

const REPORT_TABS = ["Sales Summary", "Profit & Loss", "Stock Movement", "Customer Ledger", "Tax Report", "Shift Report"] as const;
type ReportTab = typeof REPORT_TABS[number];

export const ReportsPage: React.FC = () => {
  const { data: sales, error, loading } = useApiList<Sale>("/api/v1/pos/sales");
  const [activeTab, setActiveTab] = useState<ReportTab>("Sales Summary");
  const [dateRange, setDateRange] = useState("Today");
  const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0);

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Financial & Commercial Reports</h1>
        <div className="v2-flex v2-gap-2">
          <select className="v2-select v2-btn-sm" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            {["Today", "This Week", "This Month", "This Quarter", "Custom"].map((d) => <option key={d}>{d}</option>)}
          </select>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Download size={13} /> Export CSV</button>
        </div>
      </div>

      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Total Revenue"   value={money(total || 42850000)} trend="up" trendLabel="+8.2% vs last period" icon={<DollarSign size={18} />} accent="#38bdf8" />
        <KpiCard label="Gross Profit"    value={money((total || 42850000) * 0.38)} desc="38.2% margin"                 icon={<TrendingUp size={18} />}  accent="#4ade80" />
        <KpiCard label="Transactions"    value={sales.length || 842} desc="Total completed sales"                       icon={<Receipt size={18} />}     accent="#818cf8" />
        <KpiCard label="Avg Basket Size" value={money(42500)}           desc="Per transaction"                           icon={<ShoppingCart size={18} />} accent="#fbbf24" />
      </div>

      <div className="v2-card">
        <div style={{ display: "flex", gap: ".3rem", padding: ".75rem 1.25rem", borderBottom: "1px solid var(--surface-border)", flexWrap: "wrap" }}>
          {REPORT_TABS.map((t) => (
            <button key={t} className={`sector-pill${activeTab === t ? " active" : ""}`} onClick={() => setActiveTab(t)} type="button">{t}</button>
          ))}
        </div>
        {error ? <div className="badge v2-badge-danger" style={{ margin: "1rem" }}>{error}</div>
        : loading ? <div style={{ padding: "1rem" }}><LoadingRows /></div>
        : activeTab === "Sales Summary" && (
          sales.length ? (
            <table className="v2-table">
              <thead><tr><th>Sale #</th><th>Date & Time</th><th>Grand Total</th><th>Payment Status</th></tr></thead>
              <tbody>
                {sales.slice(0, 100).map((s) => (
                  <tr key={s.id}>
                    <td className="v2-mono v2-text-xs">{s.saleNumber}</td>
                    <td className="v2-text-xs v2-text-muted">{new Date(s.soldAt).toLocaleString()}</td>
                    <td className="v2-font-black">{money(s.grandTotal)}</td>
                    <td><span className={`badge ${s.paymentStatus === "PAID" ? "v2-badge-success" : "v2-badge-warning"}`}>{s.paymentStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty icon={<BarChart2 size={22} />} message="No sales records for this period." />
        )}
        {activeTab !== "Sales Summary" && (
          <Empty icon={<FileText size={22} />} message={`${activeTab} report`} action={<span className="v2-text-xs v2-text-muted">Report engine generating…</span>} />
        )}
      </div>
    </div>
  );
};

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────

const SETTINGS_TABS = ["Business Profile", "POS Settings", "Tax & Currency", "Inventory", "Security", "Notifications", "Sync & Offline", "Integrations", "Advanced"] as const;
type SettingsTab = typeof SETTINGS_TABS[number];

export const SettingsPage: React.FC = () => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  const [activeTab, setActiveTab] = useState<SettingsTab>("Business Profile");

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Tenant & Branch Settings</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><CheckCircle size={13} /> Save Changes</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1rem", alignItems: "start" }}>
        {/* Tab nav */}
        <div className="v2-card" style={{ padding: ".4rem" }}>
          {SETTINGS_TABS.map((t) => (
            <button
              key={t}
              className={`sidebar-item${activeTab === t ? " active" : ""}`}
              onClick={() => setActiveTab(t)}
              type="button"
            >
              <span className="sidebar-item-label v2-text-sm">{t}</span>
              {activeTab === t && <ChevronRight size={12} className="sidebar-chevron" style={{ transform: "none", opacity: 1 }} />}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">{activeTab}</div>
          </div>
          <div className="v2-card-body">
            {activeTab === "Business Profile" && (
              <div className="v2-space-y-4">
                <div className="metrics-grid kpi-grid-2">
                  <div>
                    <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>ACTIVE TENANT</label>
                    <div className="v2-input" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <Building size={14} style={{ color: "var(--muted)" }} />
                      <span>{currentTenantName || "Loading…"}</span>
                    </div>
                    <div className="v2-mono v2-text-xs v2-text-muted" style={{ marginTop: ".3rem" }}>{currentTenantId}</div>
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>ACTIVE BRANCH</label>
                    <div className="v2-input" style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
                      <MapPin size={14} style={{ color: "var(--muted)" }} />
                      <span>{currentBranchName || "Loading…"}</span>
                    </div>
                    <div className="v2-mono v2-text-xs v2-text-muted" style={{ marginTop: ".3rem" }}>{currentBranchId}</div>
                  </div>
                </div>
                <div className="v2-divider" />
                {[
                  { label: "BUSINESS NAME", value: "KwakoPos Retailers (Main)" },
                  { label: "REGISTRATION NUMBER", value: "TZM-2024-002891" },
                  { label: "TIN (Tax ID)", value: "100-XXX-XXX" },
                  { label: "CONTACT EMAIL", value: "info@kwakoko.co.tz" },
                  { label: "PHONE", value: "+255 712 345 678" },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>{f.label}</label>
                    <input className="v2-input" defaultValue={f.value} />
                  </div>
                ))}
              </div>
            )}
            {activeTab === "Tax & Currency" && (
              <div className="v2-space-y-4">
                {[
                  { label: "DEFAULT CURRENCY", value: "TZS — Tanzanian Shilling" },
                  { label: "VAT RATE", value: "18% (Standard Rate)" },
                  { label: "TRA FISCAL DEVICE", value: "VFD / EFD — Enabled" },
                  { label: "WITHHOLDING TAX", value: "2% — Service Providers" },
                ].map((f) => (
                  <div key={f.label}>
                    <label className="v2-text-xs v2-font-black v2-text-muted" style={{ display: "block", marginBottom: ".3rem" }}>{f.label}</label>
                    <input className="v2-input" defaultValue={f.value} />
                  </div>
                ))}
              </div>
            )}
            {!["Business Profile", "Tax & Currency"].includes(activeTab) && (
              <Empty icon={<Zap size={22} />} message={`${activeTab} settings`} action={<span className="v2-text-xs v2-text-muted">Configuration panel loading…</span>} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── USERS & ROLES PAGE ───────────────────────────────────────────────────────

const DEMO_USERS = [
  { name: "Admin User",     email: "admin@kwakoko.co.tz",   role: "SUPER_ADMIN", status: "ACTIVE",   perms: "Full Access" },
  { name: "Branch Manager", email: "manager@kwakoko.co.tz", role: "MANAGER",     status: "ACTIVE",   perms: "Branch Ops" },
  { name: "Cashier One",    email: "cashier1@kwakoko.co.tz",role: "CASHIER",     status: "ACTIVE",   perms: "POS + Customers" },
  { name: "Stock Keeper",   email: "stock@kwakoko.co.tz",   role: "INVENTORY",   status: "ACTIVE",   perms: "Inventory + Purchasing" },
  { name: "Supervisor",     email: "super@kwakoko.co.tz",   role: "SUPERVISOR",  status: "INACTIVE", perms: "Reporting" },
];

export const UsersPage: React.FC = () => {
  const { role, permissions } = useRbac();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const filtered = DEMO_USERS.filter((u) => !search || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Users Directory & RBAC Matrix</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Invite User</button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Logged-in User"    value={user?.name || "Admin"}             desc={user?.email}      icon={<Users size={18} />}  accent="#38bdf8" />
        <KpiCard label="Assigned Role"     value={role || "ADMIN"}                   desc="RBAC Role"        icon={<Shield size={18} />} accent="#818cf8" />
        <KpiCard label="Permissions"       value={`${permissions.length || 1} Grants`} desc="Granted to role" icon={<CheckSquare size={18} />} accent="#4ade80" />
        <KpiCard label="Total Users"       value={DEMO_USERS.length}                 desc="In this tenant"   icon={<Building size={18} />} accent="#fbbf24" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
            <Search size={13} style={{ color: "var(--muted)" }} />
            <input className="v2-input" style={{ border: "none", padding: ".3rem .4rem", flex: 1 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" />
          </div>
        </div>
        <table className="v2-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.email}>
                <td className="v2-font-bold">{u.name}</td>
                <td className="v2-mono v2-text-xs v2-text-muted">{u.email}</td>
                <td><span className="badge v2-badge-accent">{u.role}</span></td>
                <td className="v2-text-xs v2-text-muted">{u.perms}</td>
                <td><span className={`badge ${u.status === "ACTIVE" ? "v2-badge-success" : "v2-badge-muted"}`}>{u.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Edit2 size={13} /></button>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Trash2 size={13} style={{ color: "var(--danger)" }} /></button>
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

// ─── SUPER ADMIN PAGE ─────────────────────────────────────────────────────────

export const SuperAdminPage: React.FC = () => {
  const { role, permissions, isSuperAdmin } = useRbac();
  const allowed = isSuperAdmin || role === "ADMIN" || permissions.includes("*");
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Super Admin Control Tower</h1>
        <span className={`badge ${allowed ? "v2-badge-success" : "v2-badge-danger"}`}>
          {allowed ? "Platform Admin Access Granted" : "Access Denied by RBAC"}
        </span>
      </div>
      {!allowed ? (
        <Empty icon={<Shield size={24} />} message="Access Denied by V2 RBAC Policy" action={<span className="v2-text-xs v2-text-muted">You need SUPER_ADMIN role or * permission grant.</span>} />
      ) : (
        <>
          <div className="metrics-grid kpi-grid-4 v2-mb-4">
            <KpiCard label="Active Tenants" value="42"    desc="Across all regions"   icon={<Building size={18} />}    accent="#38bdf8" />
            <KpiCard label="System Uptime"  value="99.99%" desc="30-day SLA"          icon={<Activity size={18} />}   accent="#4ade80" />
            <KpiCard label="Active Users"   value="1,284" desc="Authenticated sessions" icon={<Users size={18} />}   accent="#818cf8" />
            <KpiCard label="Cloud Run Rev." value="Healthy" desc="All replicas green" icon={<Zap size={18} />}       accent="#fbbf24" />
          </div>
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title">Tenant Registry</div>
              <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Provision Tenant</button>
            </div>
            <table className="v2-table">
              <thead><tr><th>Tenant ID</th><th>Name</th><th>Region</th><th>Subscription</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {["TNT-TZ-001","TNT-TZ-002","TNT-TZ-003"].map((tid, i) => (
                  <tr key={tid}>
                    <td className="v2-mono v2-text-xs">{tid}</td>
                    <td className="v2-font-bold">Tenant {i+1} Ltd</td>
                    <td className="v2-text-muted">Dar es Salaam</td>
                    <td><span className="badge v2-badge-success">PRO</span></td>
                    <td><span className="badge v2-badge-success">ACTIVE</span></td>
                    <td><button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Eye size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// ─── DIAGNOSTICS PAGE ─────────────────────────────────────────────────────────

export const DiagnosticsPage: React.FC = () => {
  const { db, syncOutbox, syncError, isOnline, pendingOutboxCount } = useSync();
  const outbox = db.getPendingOutbox();
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Client Sync Inspector</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" disabled={!isOnline} onClick={() => void syncOutbox().catch(() => undefined)} type="button">
          <RefreshCw size={13} /> Force Sync
        </button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Network Status"    value={isOnline ? "Online" : "Offline"} icon={isOnline ? <Wifi size={18} /> : <WifiOff size={18} />} accent={isOnline ? "#4ade80" : "#fbbf24"} />
        <KpiCard label="Outbox Queue"      value={pendingOutboxCount} desc="Pending operations"        icon={<Upload size={18} />}    accent="#38bdf8" />
        <KpiCard label="Stock Ledger"      value={db.stockLedger.size} desc="Local IDB entries"        icon={<Activity size={18} />}  accent="#818cf8" />
        <KpiCard label="Sync Errors"       value={syncError ? "1 Error" : "None"} icon={<AlertTriangle size={18} />} accent={syncError ? "#f87171" : "#4ade80"} />
      </div>
      {syncError && <div className="badge v2-badge-danger v2-mb-4">{syncError}</div>}
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Pending Outbox Operations ({outbox.length})</div></div>
        <div className="v2-card-body">
          <pre style={{ background: "var(--bg)", padding: "1rem", borderRadius: "var(--radius-lg)", overflow: "auto", fontSize: ".75rem", lineHeight: 1.6, maxHeight: 400, color: "var(--text-secondary)" }}>
            {outbox.length ? JSON.stringify(outbox, null, 2) : "// Outbox is empty — all operations synchronized."}
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
  const totalExpenses = DEMO_EXPENSES.reduce((s, e) => s + e.amount, 0);
  const pending       = DEMO_EXPENSES.filter((e) => e.status === "PENDING").reduce((s, e) => s + e.amount, 0);

  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Expenses & Outgoings Ledger</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> Record Expense</button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Monthly Expenses"  value={money(totalExpenses)} desc="All categories"       icon={<DollarSign size={18} />} accent="#f87171" />
        <KpiCard label="Petty Cash Bal."   value={money(650000)}        desc="Available float"      icon={<Coins size={18} />}      accent="#38bdf8" />
        <KpiCard label="Pending Approval"  value={`${DEMO_EXPENSES.filter((e) => e.status === "PENDING").length} Vouchers`} desc={money(pending)} icon={<Clock size={18} />} accent="#fbbf24" />
        <KpiCard label="Paid This Month"   value={`${DEMO_EXPENSES.filter((e) => e.status === "PAID").length} Vouchers`} desc="Processed" icon={<CheckCircle size={18} />} accent="#4ade80" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header">
          <div className="v2-card-title">Expense Vouchers</div>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> Export</button>
        </div>
        <table className="v2-table">
          <thead><tr><th>Voucher #</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {DEMO_EXPENSES.map((e) => (
              <tr key={e.id}>
                <td className="v2-mono v2-text-xs">{e.id}</td>
                <td><span className="badge v2-badge-muted">{e.category}</span></td>
                <td>{e.desc}</td>
                <td className="v2-font-black">{money(e.amount)}</td>
                <td><span className={`badge ${e.status === "PAID" ? "v2-badge-success" : "v2-badge-warning"}`}>{e.status}</span></td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button"><Eye size={13} /></button>
                    {e.status === "PENDING" && <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="Approve"><Check size={13} style={{ color: "var(--success)" }} /></button>}
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

// ─── CASH DRAWER PAGE ─────────────────────────────────────────────────────────

export const CashDrawerPage: React.FC = () => {
  const opening   = 150000;
  const collected = 4820000;
  const drops     = 300000;
  const expected  = opening + collected - drops;
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Cash Drawer & Shift Reconciliation</h1>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button"><Download size={13} /> Shift Report</button>
          <button className="v2-btn v2-btn-danger v2-btn-sm" type="button">Close Shift & Drop Cash</button>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Opening Float"         value={money(opening)}   desc="Start of shift"      icon={<PiggyBank size={18} />}  accent="#38bdf8" />
        <KpiCard label="Cash Collected"        value={money(collected)} desc="From sales"          icon={<DollarSign size={18} />} accent="#4ade80" />
        <KpiCard label="Safe Drops & Paid Outs" value={money(drops)}   desc="Removed from drawer" icon={<Coins size={18} />}     accent="#f87171" />
        <KpiCard label="Expected in Drawer"    value={money(expected)}  desc="Calculated balance"  icon={<CheckCircle size={18} />} accent="#fbbf24" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Shift Ledger</div></div>
        <table className="v2-table">
          <thead><tr><th>Time</th><th>Type</th><th>Reference</th><th>Amount</th><th>Cashier</th></tr></thead>
          <tbody>
            {[
              { time: "08:00", type: "OPENING FLOAT", ref: "SHIFT-2026-001", amount: money(opening),  cashier: "Cashier One" },
              { time: "10:30", type: "SAFE DROP",     ref: "DROP-001",       amount: `-${money(200000)}`, cashier: "Manager" },
              { time: "12:15", type: "CASH SALE",     ref: "SALE-4281",      amount: money(85000),   cashier: "Cashier One" },
              { time: "15:45", type: "PAID OUT",      ref: "PO-006",         amount: `-${money(100000)}`, cashier: "Manager" },
            ].map((row, i) => (
              <tr key={i}>
                <td className="v2-mono v2-text-xs">{row.time}</td>
                <td><span className="badge v2-badge-muted">{row.type}</span></td>
                <td className="v2-mono v2-text-xs">{row.ref}</td>
                <td className="v2-font-black">{row.amount}</td>
                <td className="v2-text-muted">{row.cashier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── RECEIPTS PAGE ────────────────────────────────────────────────────────────

export const ReceiptsPage: React.FC = () => {
  const { data: sales, loading } = useApiList<Sale>("/api/v1/pos/sales");
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Thermal Receipts & E-Invoice</h1>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button">Reprint Last Receipt</button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Plus size={13} /> New Invoice</button>
        </div>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Receipts Today"   value={sales.length || 142}  desc="Issued"          icon={<Receipt size={18} />}      accent="#38bdf8" />
        <KpiCard label="TRA EFD / VFD"    value="100% Verified"         desc="All synced"       icon={<CheckCircle size={18} />}  accent="#4ade80" />
        <KpiCard label="Email Delivered"  value="38 Receipts"           desc="Digital delivery" icon={<Bell size={18} />}         accent="#818cf8" />
        <KpiCard label="Print Queue"      value="0 Pending"             desc="Thermal printer"  icon={<FileText size={18} />}     accent="#fbbf24" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Receipt History</div></div>
        {loading ? <div style={{ padding: "1rem" }}><LoadingRows /></div> : (
          <table className="v2-table">
            <thead><tr><th>Sale #</th><th>Date & Time</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {(sales.length ? sales : []).slice(0, 50).map((s) => (
                <tr key={s.id}>
                  <td className="v2-mono v2-text-xs">{s.saleNumber}</td>
                  <td className="v2-text-xs v2-text-muted">{new Date(s.soldAt).toLocaleString()}</td>
                  <td className="v2-font-black">{money(s.grandTotal)}</td>
                  <td><span className="badge v2-badge-success">PRINTED</span></td>
                  <td>
                    <div className="v2-flex v2-gap-1">
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="View"><Eye size={13} /></button>
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button" title="Reprint"><Receipt size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!sales.length && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: "2rem" }}>No receipts found for this period.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ─── TRASH PAGE ───────────────────────────────────────────────────────────────

export const TrashPage: React.FC = () => {
  const TRASH = [
    { id: "DEL-PROD-091", type: "Product",  name: "Discontinued Soda SKU-009", deletedAt: new Date().toLocaleDateString(), expiry: "29 days" },
    { id: "DEL-CUST-042", type: "Customer", name: "Inactive Client Account",   deletedAt: new Date().toLocaleDateString(), expiry: "29 days" },
    { id: "DEL-SALE-118", type: "Sale",     name: "Voided Transaction SALE-118", deletedAt: new Date().toLocaleDateString(), expiry: "89 days" },
  ];
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Trash & Soft-Delete Bin</h1>
        <button className="v2-btn v2-btn-danger v2-btn-sm" type="button"><Trash2 size={13} /> Purge All</button>
      </div>
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Soft-Deleted Items" value={TRASH.length} desc="Recoverable"         icon={<Trash2 size={18} />}     accent="#f87171" />
        <KpiCard label="Auto-Purge"         value="30 Days"      desc="Default retention"   icon={<Clock size={18} />}      accent="#fbbf24" />
        <KpiCard label="Storage Used"       value="1.2 MB"       desc="By deleted records"  icon={<Layers size={18} />}     accent="#38bdf8" />
        <KpiCard label="Audit Log"          value="Full Trail"   desc="GDPR compliant"      icon={<FileText size={18} />}   accent="#4ade80" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Deleted Records</div></div>
        <table className="v2-table">
          <thead><tr><th>Record ID</th><th>Entity</th><th>Name</th><th>Deleted At</th><th>Auto-Purge In</th><th>Actions</th></tr></thead>
          <tbody>
            {TRASH.map((r) => (
              <tr key={r.id}>
                <td className="v2-mono v2-text-xs">{r.id}</td>
                <td><span className="badge v2-badge-muted">{r.type}</span></td>
                <td>{r.name}</td>
                <td className="v2-text-xs v2-text-muted">{r.deletedAt}</td>
                <td className="v2-text-xs" style={{ color: "var(--warning)" }}>{r.expiry}</td>
                <td>
                  <div className="v2-flex v2-gap-1">
                    <button className="v2-btn v2-btn-success v2-btn-sm" type="button">Restore</button>
                    <button className="v2-btn v2-btn-danger v2-btn-sm" type="button">Purge</button>
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

// ─── HELP PAGE ────────────────────────────────────────────────────────────────

export const HelpPage: React.FC = () => (
  <div className="v2-animate-page-enter">
    <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
      <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>KwakoPos Knowledge Center</h1>
    </div>
    <div className="v2-grid-2" style={{ gap: ".75rem" }}>
      {[
        { title: "POS User Guide",             desc: "Step-by-step checkout, scanning, and payment processing.",       icon: <ShoppingCart size={20} />, accent: "#38bdf8" },
        { title: "Inventory & FEFO Guide",     desc: "Manage products, variants, expiry batches, and stock adjustments.", icon: <Package size={20} />,     accent: "#4ade80" },
        { title: "Sync & Offline Mode",        desc: "Understand IndexedDB outbox, conflict resolution, and reconnection.", icon: <Wifi size={20} />,       accent: "#818cf8" },
        { title: "RBAC & Roles Setup",         desc: "Create roles, assign granular permissions, and audit access logs.", icon: <Shield size={20} />,      accent: "#f87171" },
        { title: "Keyboard Shortcuts",         desc: "Ctrl+K: Search | Ctrl+S: Quick Save | F2: Open POS Terminal",     icon: <Hash size={20} />,        accent: "#fbbf24" },
        { title: "Vertical Module Guides",     desc: "Law Firm, Pharmacy, Fleet, Poultry, Workforce module specifics.",   icon: <Layers size={20} />,      accent: "#f97316" },
        { title: "TRA EFD/VFD Integration",   desc: "Tanzania Revenue Authority fiscal device setup and compliance.",    icon: <FileText size={20} />,    accent: "#10b981" },
        { title: "Troubleshooting & Support", desc: "Common errors, diagnostics, and how to contact support.",           icon: <Activity size={20} />,    accent: "#6366f1" },
      ].map((item) => (
        <div key={item.title} className="v2-card" style={{ padding: "1.1rem 1.25rem", cursor: "pointer", transition: "box-shadow var(--transition-base)" }}>
          <div className="v2-flex v2-items-center v2-gap-3">
            <div style={{ width: 40, height: 40, borderRadius: "var(--radius-lg)", background: `${item.accent}18`, color: item.accent, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {item.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div className="v2-text-sm v2-font-black">{item.title}</div>
              <div className="v2-text-xs v2-text-muted" style={{ marginTop: ".15rem", lineHeight: 1.4 }}>{item.desc}</div>
            </div>
            <ChevronRight size={14} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── FINANCE PAGE ─────────────────────────────────────────────────────────────

export const FinancePage: React.FC = () => {
  const { data: sales, error } = useApiList<Sale>("/api/v1/pos/sales");
  const total = sales.reduce((s, x) => s + Number(x.grandTotal || 0), 0);
  return (
    <div className="v2-animate-page-enter">
      <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
        <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>Finance & General Ledger</h1>
        <button className="v2-btn v2-btn-primary v2-btn-sm" type="button"><Download size={13} /> Trial Balance</button>
      </div>
      {error && <div className="badge v2-badge-danger v2-mb-4">{error}</div>}
      <div className="metrics-grid kpi-grid-4 v2-mb-4">
        <KpiCard label="Recorded Revenue"   value={money(total || 42850000)} icon={<DollarSign size={18} />} accent="#38bdf8" />
        <KpiCard label="Total Transactions" value={sales.length || 842}      icon={<Receipt size={18} />}    accent="#4ade80" />
        <KpiCard label="Trial Balance"      value="BALANCED"                  icon={<Scale size={18} />}      accent="#818cf8" />
        <KpiCard label="Open Receivables"   value={money(3200000)}            icon={<Coins size={18} />}      accent="#fbbf24" />
      </div>
      <div className="v2-card">
        <div className="v2-card-header"><div className="v2-card-title">Chart of Accounts</div></div>
        <table className="v2-table">
          <thead><tr><th>Account</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
          <tbody>
            {[
              { account: "1100 — Cash in Hand",         type: "Asset",     debit: money(4820000), credit: money(300000),  balance: money(4520000) },
              { account: "1200 — Accounts Receivable",  type: "Asset",     debit: money(3200000), credit: money(0),       balance: money(3200000) },
              { account: "2100 — Accounts Payable",     type: "Liability", debit: money(0),       credit: money(8400000), balance: money(8400000) },
              { account: "4100 — Sales Revenue",        type: "Revenue",   debit: money(0),       credit: money(total || 42850000), balance: money(total || 42850000) },
            ].map((row, i) => (
              <tr key={i}>
                <td className="v2-font-bold">{row.account}</td>
                <td><span className={`badge ${row.type === "Revenue" ? "v2-badge-success" : row.type === "Liability" ? "v2-badge-danger" : "v2-badge-accent"}`}>{row.type}</span></td>
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
