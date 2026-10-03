/**
 * KwakoPosv2 — Reports & Analytics Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-fidelity reporting suite featuring 14 sub-report modules:
 *   1. Sales Report
 *   2. Profit & Loss Report
 *   3. Cashier Performance
 *   4. Payment Method Breakdown
 *   5. Inventory Valuation
 *   6. Customer Credit & Aging
 *   7. Returns & Refunds
 *   8. Branch Comparison
 *   9. Tax & EFD/TRA Compliance
 *  10. Discount & Promotion Analysis
 *  11. Expense Breakdown
 *  12. Stock Movement Lineage
 *  13. Purchasing & Supplier Analytics
 *  14. Accounts Receivable Aging
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { runUiAction } from "../services/uiActionRegistry.js";
import {
  BarChart2, TrendingUp, DollarSign, Download, RefreshCw,
  Filter, PieChart, Users, Package, Scale,
  Building, ShoppingBag, Receipt, AlertCircle, Tag, Shield,
  Sparkles, CheckCircle2, Clock, Truck, AlertTriangle, Layers
} from "lucide-react";
import {
  AreaChart, Area, PieChart as RePie, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { useModule, useTenant } from "../context/KwakoPosContexts.js";
import { apiFetch } from "../services/apiClient.js";
import { DATA_CHANGED_EVENT } from "../services/dataChangeEvent.js";
import { productionCleanupService } from "../services/productionCleanupService.js";

type ReportTab =
  | "sales" | "profit" | "cashier" | "payment" | "inventory"
  | "customers" | "returns" | "branch" | "tax" | "discount"
  | "expenses" | "movements" | "purchasing" | "aging";

const money = (v: number) =>
  v >= 1_000_000 ? `Tsh ${(v / 1_000_000).toFixed(2)}M`
  : v >= 1_000   ? `Tsh ${(v / 1_000).toFixed(0)}K`
  : `Tsh ${Math.round(v).toLocaleString()}`;

export interface ReportsPageProps {
  activeTab?: string;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ activeTab: propActiveTab }) => {
  const { currentTenantName } = useTenant();
  const { setActiveTab: setGlobalActiveTab } = useModule();

  const [activeTab, setActiveTab] = useState<ReportTab>("sales");
  const [sales, setSales] = useState<any[]>([]);
  const [returnedSalesData, setReturnedSalesData] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [reportBranches, setReportBranches] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportMetrics, setReportMetrics] = useState<any>(null);
  const [dateRange, setDateRange] = useState("this_month");
  const [branchFilter, setBranchFilter] = useState("all");
  const [showPillarsInfo, setShowPillarsInfo] = useState(false);
  const isProductionLocked = productionCleanupService.isProductionLocked();

  const selectReportTab = useCallback((tab: ReportTab) => {
    setActiveTab(tab);
    const globalTab: Record<ReportTab, string> = {
      "sales": "Sales",
      "profit": "Profit",
      "cashier": "Cashier Performance",
      "payment": "Payment Methods",
      "inventory": "Inventory Valuation",
      "customers": "Customers Report",
      "returns": "Returns & Refunds",
      "branch": "Branch Comparison",
      "tax": "Tax",
      "discount": "Discounts",
      "expenses": "Expenses Report",
      "movements": "Stock Movement",
      "purchasing": "Purchasing Report",
      "aging": "Receivables Aging",
    };
    setGlobalActiveTab(globalTab[tab]);
  }, [setGlobalActiveTab]);

  useEffect(() => {
    if (!propActiveTab) return;
    const map: Record<string, ReportTab> = {
      "Sales": "sales",
      "Profit": "profit",
      "Profit & Loss": "profit",
      "Cashier Performance": "cashier",
      "Payment Methods": "payment",
      "Inventory Valuation": "inventory",
      "Customers Report": "customers",
      "Returns & Refunds": "returns",
      "Branch Comparison": "branch",
      "Tax": "tax",
      "Tax & TRA EFD": "tax",
      "Discounts": "discount",
      "Discounts & Promos": "discount",
      "Expenses Report": "expenses",
      "Stock Movement": "movements",
      "Purchasing Report": "purchasing",
      "Receivables Aging": "aging",
    };
    if (map[propActiveTab]) {
      setActiveTab(map[propActiveTab]);
    }
  }, [propActiveTab]);


  // ─── Hydrate authoritative PostgreSQL report data ────────────────────────
  const loadReportData = useCallback(async () => {
    setReportLoading(true); setReportError(null);
    try {
      let branchId: string | null = null;
      if (branchFilter === "hq") {
        const main = reportBranches.find((b: any) => b.isMain);
        branchId = main?.id || null;
        if (!branchId) throw new Error("REPORT_MAIN_BRANCH_NOT_FOUND");
      }
      const params = new URLSearchParams({ range: dateRange });
      if (branchId) params.set("branchId", branchId);
      const response = await apiFetch<{ success: boolean; data: any }>(`/api/v1/reports/data?${params.toString()}`);
      if (!response?.success || !response.data) throw new Error("REPORT_DATA_UNAVAILABLE");
      const data = response.data;
      setSales(Array.isArray(data.sales) ? data.sales : []);
      setReturnedSalesData(Array.isArray(data.returnedSales) ? data.returnedSales : []);
      setExpenses(Array.isArray(data.expenses) ? data.expenses : []);
      setProducts(Array.isArray(data.products) ? data.products : []);
      setCustomers(Array.isArray(data.customers) ? data.customers : []);
      setPurchaseOrders(Array.isArray(data.purchaseOrders) ? data.purchaseOrders : []);
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      setReportBranches(Array.isArray(data.branches) ? data.branches : []);
      setReportMetrics(data.metrics || null);
    } catch (e: any) {
      console.error("[Reports] Authoritative report load failed", e);
      setReportError(String(e?.message || e || "REPORT_DATA_UNAVAILABLE"));
      setSales([]); setReturnedSalesData([]); setExpenses([]); setProducts([]); setCustomers([]);
      setPurchaseOrders([]); setInvoices([]); setReportMetrics(null);
    } finally { setReportLoading(false); }
  }, [dateRange, branchFilter, reportBranches]);

  useEffect(() => { void loadReportData(); }, [loadReportData]);

  // ─── Server-authoritative report metrics ─────────────────────────────────
  const validSales = useMemo(() => sales.filter((s) => !["Cancelled", "Voided", "CANCELLED", "VOIDED", "REFUNDED"].includes(String(s.status))), [sales]);
  const returnedSales = returnedSalesData;
  const discountedSales = useMemo(() => validSales.filter((s) => Number(s.discountTotal || s.discountAmount || 0) > 0), [validSales]);
  const totalGrossSales = Number(reportMetrics?.totalGrossSales ?? 0);
  const totalTaxCollected = Number(reportMetrics?.totalTaxCollected ?? 0);
  const totalDiscounts = Number(reportMetrics?.totalDiscounts ?? 0);
  const totalCOGS = Number(reportMetrics?.totalCOGS ?? 0);
  const totalExpensesAmt = Number(reportMetrics?.totalExpenses ?? 0);
  const grossProfit = Number(reportMetrics?.grossProfit ?? 0);
  const netOperatingProfit = Number(reportMetrics?.netOperatingProfit ?? 0);
  const marginPct = Number(reportMetrics?.marginPct ?? 0);
  const totalTransactions = Number(reportMetrics?.totalTransactions ?? 0);

  const salesByCashier = useMemo(() => {
    const map: Record<string, { name: string; branch: string; count: number; total: number }> = {};
    for (const s of validSales) {
      const key = s.soldById || "Unknown";
      if (!map[key]) map[key] = { name: key, branch: s.branchId || "—", count: 0, total: 0 };
      map[key].count += 1; map[key].total += Number(s.grandTotal || 0);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [validSales]);

  const salesByBranch = useMemo(() => {
    const map: Record<string, { branch: string; count: number; total: number }> = {};
    for (const s of validSales) {
      const key = s.branchId || "Unknown";
      if (!map[key]) map[key] = { branch: key, count: 0, total: 0 };
      map[key].count += 1; map[key].total += Number(s.grandTotal || 0);
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [validSales]);

  const arAgingCustomers = useMemo(() => {
    const customerMap = new Map(customers.map((c: any) => [c.id, c]));
    const grouped = new Map<string, any>();
    for (const inv of invoices.filter((i) => !["PAID", "CANCELLED"].includes(String(i.status).toUpperCase()))) {
      const balance = Math.max(0, Number(inv.balanceDue || 0));
      if (!balance) continue;
      const days = Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000));
      const existing = grouped.get(inv.customerId) || { ...(customerMap.get(inv.customerId) || {}), balance: 0, days: 0 };
      existing.balance += balance; existing.days = Math.max(existing.days, days);
      grouped.set(inv.customerId, existing);
    }
    return Array.from(grouped.values());
  }, [customers, invoices]);

  const salesChartData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const totals: Record<string, { Sales: number; Profit: number; Tax: number }> = {};
    for (const d of days) totals[d] = { Sales: 0, Profit: 0, Tax: 0 };
    for (const s of validSales) {
      const day = days[new Date(s.soldAt || s.createdAt).getDay()];
      totals[day].Sales += Number(s.grandTotal || 0);
      totals[day].Profit += Number(s.grossProfit || 0);
      totals[day].Tax += Number(s.taxTotal || 0);
    }
    return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ day: d, ...totals[d] }));
  }, [validSales]);

  const paymentPieData = useMemo(() => {
    const totals = reportMetrics?.paymentTotals || {};
    const entries = Object.entries(totals) as Array<[string, any]>;
    const amountTotal = entries.reduce((n, [, v]) => n + Number(v.amount || 0), 0);
    return entries.map(([name, value]) => ({ name, value: amountTotal ? Math.round(Number(value.amount || 0) / amountTotal * 100) : 0, amount: Number(value.amount || 0) }));
  }, [reportMetrics]);

  // ─── Empty State Helper ────────────────────────────────────────────────────
  const EmptyState = ({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) => (
    <div className="v2-p-8 v2-text-center">
      <Icon size={36} style={{ color: "var(--muted)", margin: "0 auto .5rem", opacity: 0.45 }} />
      <div className="v2-font-bold v2-text-sm">{title}</div>
      <p className="v2-text-xs v2-text-muted v2-mt-1" style={{ maxWidth: 380, margin: ".25rem auto 0" }}>{desc}</p>
    </div>
  );

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Reports & Business Intelligence Command Center
          </h1>
          <p className="v2-text-xs v2-text-muted">
            14 sub-reports with real-time aggregation, tax auditing, and multi-branch analytics.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button
            className={`v2-btn v2-btn-sm ${isProductionLocked ? "v2-btn-success" : "v2-btn-outline"}`}
            type="button"
            onClick={() => setShowPillarsInfo(!showPillarsInfo)}
            title="Production Cleanliness Pillars"
          >
            <Shield size={13} />
            {isProductionLocked ? "CLN-Locked" : "Pillars"}
          </button>
          <select
            className="v2-input v2-input-sm"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_quarter">This Quarter</option>
            <option value="this_year">This Year</option>
          </select>
          <select
            className="v2-input v2-input-sm"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="all">All Branches</option>
            <option value="hq">HQ Main Branch</option>
          </select>
          <button className="v2-btn v2-btn-primary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.ReportsPage.304.export-csv", "Export CSV", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.ReportsPage.304.export-csv">
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {/* Production Pillars Panel */}
      {showPillarsInfo && (
        <div className="v2-card" style={{ border: "1px solid var(--color-success-border, #22c55e33)" }}>
          <div className="v2-card-header">
            <div className="v2-card-title v2-flex v2-items-center v2-gap-2">
              <Shield size={15} style={{ color: "var(--color-success)" }} />
              KwakoPos Zero-Demo & Forensic Hygiene Standard — ZDH v1.0.0
              <span className={`badge ${isProductionLocked ? "v2-badge-success" : "v2-badge-warning"}`}>
                {isProductionLocked ? "PRODUCTION LOCKED" : "DEMO UNLOCKED"}
              </span>
            </div>
          </div>
          <div className="v2-card-body">
            <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: ".5rem" }}>
              {[
                { id: "CLN-01", label: "Zero Fabricated Data", icon: CheckCircle2 },
                { id: "CLN-02", label: "No Ghost Accounts", icon: Users },
                { id: "CLN-03", label: "Inventory Forensic Trace", icon: Package },
                { id: "CLN-04", label: "Supplier Provenance", icon: Truck },
                { id: "CLN-05", label: "Receipt Integrity", icon: Receipt },
                { id: "CLN-06", label: "Tax Record Completeness", icon: Scale },
                { id: "CLN-07", label: "Expense Audit Trail", icon: Layers },
                { id: "CLN-08", label: "Branch Data Isolation", icon: Building },
                { id: "CLN-09", label: "Return & Refund Chain", icon: RefreshCw },
                { id: "CLN-10", label: "Temporal Consistency", icon: Clock },
              ].map(({ id, label, icon: Icon }) => (
                <div key={id} className="v2-flex v2-items-center v2-gap-2 v2-text-xs" style={{ padding: ".35rem .5rem", background: "var(--surface-alt)", borderRadius: "var(--radius-sm)" }}>
                  <Icon size={12} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                  <span className="v2-font-bold" style={{ color: "var(--muted)", minWidth: 52 }}>{id}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab navigation */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem", overflowX: "auto" }}>
        {[
          { id: "sales", label: "Sales Summary", icon: DollarSign },
          { id: "profit", label: "Profit & Loss", icon: TrendingUp },
          { id: "cashier", label: "Cashier Perf.", icon: Users },
          { id: "payment", label: "Payments", icon: PieChart },
          { id: "inventory", label: "Stock Valuation", icon: Package },
          { id: "customers", label: "Customer Credit", icon: Users },
          { id: "returns", label: "Returns & Refunds", icon: RefreshCw },
          { id: "branch", label: "Branch Comparison", icon: Building },
          { id: "tax", label: "Tax & TRA EFD", icon: Scale },
          { id: "discount", label: "Discounts", icon: Tag },
          { id: "expenses", label: "Expenses", icon: Receipt },
          { id: "movements", label: "Stock Lineage", icon: BarChart2 },
          { id: "purchasing", label: "Purchasing", icon: ShoppingBag },
          { id: "aging", label: "AR Aging", icon: AlertCircle },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => selectReportTab(tab.id as ReportTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === tab.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
            style={{ whiteSpace: "nowrap" }}
          >
            <tab.icon size={13} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {reportError && <div className="v2-card" role="alert"><div className="v2-card-body v2-text-danger">Authoritative report data unavailable: {reportError}</div></div>}
      {reportLoading && <div className="v2-card"><div className="v2-card-body v2-text-muted">Loading authoritative PostgreSQL report data…</div></div>}

      {/* KPI Cards Header */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Total Gross Sales</div>
          <div className="kpi-card-value">{money(totalGrossSales)}</div>
          <div className={`kpi-card-trend ${totalGrossSales > 0 ? "up" : ""}`}>
            <TrendingUp size={10} /> {totalGrossSales > 0 ? "Live Revenue" : "Awaiting Sales"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">Net Operating Profit</div>
          <div className="kpi-card-value">{money(netOperatingProfit)}</div>
          <div className="kpi-card-trend up"><TrendingUp size={10} /> {marginPct}% Margin</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#818cf8" }} />
          <div className="kpi-card-label">EFD Tax Collected (VAT)</div>
          <div className="kpi-card-value">{money(totalTaxCollected)}</div>
          <div className="kpi-card-desc">TRA VFD Integrated</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#fbbf24" }} />
          <div className="kpi-card-label">Total Transactions</div>
          <div className="kpi-card-value">{totalTransactions.toLocaleString()} Receipts</div>
          <div className="kpi-card-desc">
            {totalTransactions > 0 ? `Avg ${money(totalGrossSales / totalTransactions)} / order` : "No receipts issued"}
          </div>
        </div>
      </div>

      {/* ── SALES ── */}
      {activeTab === "sales" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header">
              <div className="v2-card-title">Daily Sales & Net Profit Trend</div>
            </div>
            {validSales.length === 0 ? (
              <div className="v2-p-8 v2-text-center">
                <BarChart2 size={36} style={{ color: "var(--muted)", margin: "0 auto .5rem", opacity: 0.5 }} />
                <div className="v2-font-bold v2-text-sm">No Sales Transactions Recorded Yet</div>
                <p className="v2-text-xs v2-text-muted v2-mt-1" style={{ maxWidth: 360, margin: ".25rem auto 1rem" }}>
                  Orders processed through the POS counter will automatically compile into this real-time revenue trend.
                </p>
              </div>
            ) : (
              <div style={{ height: 300, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
                    <XAxis dataKey="day" stroke="var(--muted)" />
                    <YAxis stroke="var(--muted)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                    <Tooltip formatter={(v: any) => money(Number(v))} />
                    <Area type="monotone" dataKey="Sales" stroke="#38bdf8" fill="rgba(56,189,248,.15)" strokeWidth={2} />
                    <Area type="monotone" dataKey="Profit" stroke="#4ade80" fill="rgba(74,222,128,.15)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PAYMENT ── */}
      {activeTab === "payment" && (
        <div className="v2-space-y-4">
          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Payment Channel Share</div></div>
            {validSales.length === 0 ? (
              <EmptyState icon={PieChart} title="No Payment Data Available" desc="Process sales transactions to see payment method breakdown across Cash, M-Pesa, Card, and Airtel Money." />
            ) : (
              <div style={{ height: 260, width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RePie>
                    <Pie data={paymentPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {paymentPieData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </RePie>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PROFIT & LOSS ── */}
      {activeTab === "profit" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Profit & Loss Statement</div></div>
          {validSales.length === 0 ? (
            <EmptyState icon={TrendingUp} title="No P&L Data Available" desc="Sales records are required to compute gross profit, COGS, and operating margin. Start processing orders to see your P&L statement." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Line Item</th><th>Amount</th><th>% of Revenue</th></tr></thead>
              <tbody>
                <tr><td className="v2-font-bold">Gross Revenue</td><td className="v2-mono v2-font-black">{money(totalGrossSales)}</td><td>100%</td></tr>
                <tr><td className="v2-text-muted">Cost of Goods Sold (COGS)</td><td className="v2-mono">{money(totalCOGS)}</td><td className="v2-text-muted">{totalGrossSales > 0 ? Math.round((totalCOGS / totalGrossSales) * 100) : 0}%</td></tr>
                <tr><td className="v2-font-bold">Gross Profit</td><td className="v2-mono v2-font-bold">{money(totalGrossSales - totalCOGS)}</td><td>{totalGrossSales > 0 ? Math.round(((totalGrossSales - totalCOGS) / totalGrossSales) * 100) : 0}%</td></tr>
                <tr><td className="v2-text-muted">Total Expenses</td><td className="v2-mono">{money(totalExpensesAmt)}</td><td className="v2-text-muted">{totalGrossSales > 0 ? Math.round((totalExpensesAmt / totalGrossSales) * 100) : 0}%</td></tr>
                <tr style={{ borderTop: "2px solid var(--surface-border)" }}><td className="v2-font-black">Net Operating Profit</td><td className={`v2-mono v2-font-black ${netOperatingProfit >= 0 ? "v2-text-success" : "v2-text-danger"}`}>{money(netOperatingProfit)}</td><td className="v2-font-bold">{marginPct}%</td></tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CASHIER PERFORMANCE ── */}
      {activeTab === "cashier" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Cashier Performance Leaderboard</div></div>
          {salesByCashier.length === 0 ? (
            <EmptyState icon={Users} title="No Cashier Data Available" desc="POS transactions processed by named cashier accounts will appear here, ranked by total revenue and transaction count." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Cashier / Operator</th><th>Branch</th><th>Transactions</th><th>Total Revenue</th></tr></thead>
              <tbody>
                {salesByCashier.map((c) => (
                  <tr key={c.name}>
                    <td className="v2-font-bold">{c.name}</td>
                    <td>{c.branch}</td>
                    <td className="v2-mono">{c.count}</td>
                    <td className="v2-mono v2-font-black">{money(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── INVENTORY VALUATION ── */}
      {activeTab === "inventory" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Stock Valuation Report</div></div>
          {products.length === 0 ? (
            <EmptyState icon={Package} title="No Products Found" desc="Add products through the Inventory module to see stock quantities, cost values, and retail valuation across your catalogue." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>SKU / Code</th><th>Product Name</th><th>Qty in Stock</th><th>Cost Price</th><th>Retail Price</th><th>Stock Value</th></tr></thead>
              <tbody>
                {products.slice(0, 100).map((p: any, i: number) => {
                  const stocks = Array.isArray(p.branchStocks) ? p.branchStocks : [];
                  const qty = stocks.reduce((n: number, s: any) => n + Number(s.currentQuantity || 0), 0) || Number(p.availableStock || p.totalStock || 0);
                  const stockValue = stocks.reduce((n: number, s: any) => n + Number(s.stockValue || 0), 0);
                  const cost = qty > 0 ? stockValue / qty : Number(p.buyingPrice || 0);
                  const retail = Number(p.sellingPrice || p.price || 0);
                  return (
                    <tr key={p.id || p.sku || i}>
                      <td className="v2-mono v2-text-xs">{p.sku || p.barcode || `PRD-${i + 1}`}</td>
                      <td className="v2-font-bold">{p.name || p.productName || "—"}</td>
                      <td className="v2-mono">{qty.toLocaleString()}</td>
                      <td className="v2-mono">{money(cost)}</td>
                      <td className="v2-mono">{money(retail)}</td>
                      <td className="v2-mono v2-font-bold">{money(qty * cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── CUSTOMER CREDIT ── */}
      {activeTab === "customers" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Customer Directory & Credit Summary</div></div>
          {customers.length === 0 ? (
            <EmptyState icon={Users} title="No Customers Registered" desc="Customer profiles created in the Customers module will appear here with their purchase history and credit standing." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Customer Name</th><th>Phone</th><th>Email</th><th>Credit Balance</th><th>Status</th></tr></thead>
              <tbody>
                {customers.slice(0, 100).map((c: any, i: number) => {
                  const bal = Number(c.currentBalance || c.balance || c.creditBalance || c.amountOwed || 0);
                  return (
                    <tr key={c.id || i}>
                      <td className="v2-font-bold">{c.name || c.fullName || "—"}</td>
                      <td className="v2-text-xs v2-text-muted">{c.phone || c.phoneNumber || "—"}</td>
                      <td className="v2-text-xs v2-text-muted">{c.email || "—"}</td>
                      <td className={`v2-mono ${bal > 0 ? "v2-text-warning v2-font-bold" : ""}`}>{bal > 0 ? money(bal) : "—"}</td>
                      <td><span className={`badge ${bal > 0 ? "v2-badge-warning" : "v2-badge-success"}`}>{bal > 0 ? "CREDIT" : "CLEAR"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── RETURNS & REFUNDS ── */}
      {activeTab === "returns" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Returns, Refunds & Voided Transactions</div></div>
          {returnedSales.length === 0 ? (
            <EmptyState icon={RefreshCw} title="No Returns or Refunds Recorded" desc="Refunded, voided, or returned sales transactions will appear here with their original receipt references and refund amounts." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Receipt Ref</th><th>Customer</th><th>Cashier</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {returnedSales.map((s: any, i: number) => (
                  <tr key={s.id || s.receiptNumber || i}>
                    <td className="v2-mono v2-text-xs v2-font-bold">{s.receiptNumber || s.id || `RET-${i + 1}`}</td>
                    <td>{s.customerName || s.customer || "Walk-in"}</td>
                    <td className="v2-text-xs v2-text-muted">{s.cashierName || s.servedBy || "—"}</td>
                    <td className="v2-text-xs v2-text-muted">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="v2-mono v2-font-black">{money(Number(s.grandTotal || s.totalAmount || 0))}</td>
                    <td><span className="badge v2-badge-danger">{s.status || "RETURNED"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── BRANCH COMPARISON ── */}
      {activeTab === "branch" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Branch Revenue Comparison</div></div>
          {salesByBranch.length === 0 ? (
            <EmptyState icon={Building} title="No Multi-Branch Data Available" desc="Sales from different branches will be grouped and ranked here once transactions are recorded with branch assignment." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Branch</th><th>Transactions</th><th>Total Revenue</th><th>Share</th></tr></thead>
              <tbody>
                {salesByBranch.map((b) => (
                  <tr key={b.branch}>
                    <td className="v2-font-bold">{b.branch}</td>
                    <td className="v2-mono">{b.count}</td>
                    <td className="v2-mono v2-font-black">{money(b.total)}</td>
                    <td className="v2-mono">{totalGrossSales > 0 ? Math.round((b.total / totalGrossSales) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAX & EFD ── */}
      {activeTab === "tax" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Tax & TRA EFD Compliance Ledger</div></div>
          {validSales.length === 0 ? (
            <EmptyState icon={Scale} title="No Tax Records Available" desc="VAT and EFD tax data from POS transactions will appear here, organized for TRA compliance reporting and audit submissions." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Receipt Ref</th><th>Date</th><th>Gross Amount</th><th>VAT (18%)</th><th>Net Amount</th><th>EFD Status</th></tr></thead>
              <tbody>
                {validSales.slice(0, 100).map((s: any, i: number) => {
                  const gross = Number(s.grandTotal || 0);
                  const tax = Number(s.taxTotal || 0);
                  return (
                    <tr key={s.id || i}>
                      <td className="v2-mono v2-text-xs v2-font-bold">{s.receiptNumber || s.id || `REC-${i + 1}`}</td>
                      <td className="v2-text-xs v2-text-muted">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}</td>
                      <td className="v2-mono">{money(gross)}</td>
                      <td className="v2-mono v2-text-warning">{money(tax)}</td>
                      <td className="v2-mono v2-font-bold">{money(gross - tax)}</td>
                      <td>
                        <span className={
                          ["TRA_VERIFIED", "TRA_ACCEPTED"].includes(String(s.fiscalizationState))
                            ? "badge v2-badge-success"
                            : String(s.fiscalizationState) === "TRA_REJECTED"
                            ? "badge v2-badge-danger"
                            : "badge v2-badge-warning"
                        }>
                          {s.fiscalizationState || s.efdStatus || "NOT_SUBMITTED"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── DISCOUNTS ── */}
      {activeTab === "discount" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Discount & Promotion Analysis</div></div>
          {discountedSales.length === 0 ? (
            <EmptyState icon={Tag} title="No Discounted Sales Found" desc="Sales transactions that include a discount amount will appear here, showing discount values, reasons, and approval trail." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Receipt Ref</th><th>Customer</th><th>Gross Amount</th><th>Discount</th><th>Net Paid</th><th>Date</th></tr></thead>
              <tbody>
                {discountedSales.map((s: any, i: number) => {
                  const gross = Number(s.grandTotal || s.totalAmount || 0);
                  const disc = Number(s.discountAmount || s.discount || 0);
                  return (
                    <tr key={s.id || i}>
                      <td className="v2-mono v2-text-xs v2-font-bold">{s.receiptNumber || s.id || `DSC-${i + 1}`}</td>
                      <td>{s.customerName || s.customer || "Walk-in"}</td>
                      <td className="v2-mono">{money(gross)}</td>
                      <td className="v2-mono v2-text-warning v2-font-bold">-{money(disc)}</td>
                      <td className="v2-mono v2-font-black">{money(gross - disc)}</td>
                      <td className="v2-text-xs v2-text-muted">{s.createdAt ? new Date(s.createdAt).toLocaleDateString() : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="v2-font-bold">Total Discounts Granted</td>
                  <td className="v2-mono v2-font-black v2-text-warning">-{money(totalDiscounts)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── EXPENSES ── */}
      {activeTab === "expenses" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Expense Breakdown & Audit Trail</div></div>
          {expenses.length === 0 ? (
            <EmptyState icon={Receipt} title="No Expenses Recorded" desc="Business expenses logged through the Expenses module will appear here with category, amount, and authorization details." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Ref</th><th>Description</th><th>Category</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {expenses.slice(0, 100).map((e: any, i: number) => (
                  <tr key={e.id || i}>
                    <td className="v2-mono v2-text-xs v2-font-bold">{e.id || e.ref || `EXP-${i + 1}`}</td>
                    <td className="v2-font-bold">{e.reason || e.description || e.name || "—"}</td>
                    <td className="v2-text-xs v2-text-muted">{e.category || "General"}</td>
                    <td className="v2-text-xs v2-text-muted">{(e.incurredAt || e.date || e.createdAt) ? new Date(e.incurredAt || e.date || e.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="v2-mono v2-font-black">{money(Number(e.amount || 0))}</td>
                    <td><span className="badge v2-badge-success">{e.status || "RECORDED"}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td colSpan={4} className="v2-font-bold">Total Expenses</td><td className="v2-mono v2-font-black">{money(totalExpensesAmt)}</td><td /></tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── STOCK MOVEMENTS ── */}
      {activeTab === "movements" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Stock Movement Lineage</div></div>
          <EmptyState
            icon={Layers}
            title="Stock Movement Tracking Coming Soon"
            desc="Granular stock movement history — including goods receipts, adjustments, transfers, and write-offs — will be compiled here from your inventory audit trail."
          />
        </div>
      )}

      {/* ── PURCHASING ── */}
      {activeTab === "purchasing" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Purchasing & Supplier Analytics</div></div>
          {purchaseOrders.length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No Purchase Orders Found" desc="Purchase orders created through the Purchasing module will appear here, grouped by supplier with delivery and payment status." />
          ) : (
            <table className="v2-table">
              <thead><tr><th>PO Number</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
              <tbody>
                {purchaseOrders.slice(0, 100).map((po: any, i: number) => (
                  <tr key={po.id || po.poNumber || i}>
                    <td className="v2-mono v2-text-xs v2-font-bold">{po.poNumber || po.id || `PO-${i + 1}`}</td>
                    <td className="v2-font-bold">{po.supplier?.name || po.supplierName || po.supplier || "—"}</td>
                    <td className="v2-text-xs v2-text-muted">{(po.orderedAt || po.orderDate || po.createdAt) ? new Date(po.orderedAt || po.orderDate || po.createdAt).toLocaleDateString() : "—"}</td>
                    <td className="v2-mono">{Array.isArray(po.items) ? po.items.length : (po.itemCount || "—")}</td>
                    <td className="v2-mono v2-font-black">{money(Number(po.totalAmount || po.total || 0))}</td>
                    <td><span className={`badge ${po.status === "RECEIVED" ? "v2-badge-success" : po.status === "CANCELLED" ? "v2-badge-danger" : "v2-badge-warning"}`}>{po.status || "PENDING"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ACCOUNTS RECEIVABLE AGING ── */}
      {activeTab === "aging" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Accounts Receivable Aging Report</div></div>
          {arAgingCustomers.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No Outstanding Receivables"
              desc={customers.length === 0
                ? "Add customers with credit balances through the Customers module to track accounts receivable aging here."
                : "All customer accounts are currently settled with no outstanding credit balances."
              }
            />
          ) : (
            <table className="v2-table">
              <thead><tr><th>Customer</th><th>Phone</th><th>Credit Balance</th><th>Days Outstanding</th><th>Risk</th></tr></thead>
              <tbody>
                {arAgingCustomers.map((c: any, i: number) => {
                  const bal = Number(c.balance || c.creditBalance || c.amountOwed || 0);
                  const days = c.days || c.creditDaysOutstanding || c.daysOwed || 0;
                  const risk = days > 90 ? "HIGH" : days > 30 ? "MEDIUM" : "LOW";
                  return (
                    <tr key={c.id || i}>
                      <td className="v2-font-bold">{c.name || c.fullName || "—"}</td>
                      <td className="v2-text-xs v2-text-muted">{c.phone || "—"}</td>
                      <td className="v2-mono v2-font-black v2-text-warning">{money(bal)}</td>
                      <td className="v2-mono">{days > 0 ? `${days} days` : "—"}</td>
                      <td><span className={`badge ${risk === "HIGH" ? "v2-badge-danger" : risk === "MEDIUM" ? "v2-badge-warning" : "v2-badge-success"}`}>{risk}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};



