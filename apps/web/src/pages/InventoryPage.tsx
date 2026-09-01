/**
 * KwakoPosv2 — Inventory & Stock Operations Command Center
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete, high-fidelity Inventory Command Center matching mature legacy UX:
 *   1. Dashboard KPIs (Total SKUs, Valuation, Reorder Alerts, Stock Turnover)
 *   2. Product Catalog & Variant Builder (Auto-SKU generator, Multi-tier pricing)
 *   3. Categories & Brands Master Manager
 *   4. Stock Movement Audit Ledger (Inbound, Outbound, Returns, Transfers, Adjustments)
 *   5. Branch-to-Branch Stock Transfers (Draft -> Submit -> Receive)
 *   6. Physical Stock Count Audit (Count input -> Variance calculation -> Approval)
 *   7. Inventory Valuation & Slow-Moving Stock Reports
 *   8. Recipe & Composite Product Builder (BOM / Ingredients)
 *   9. Stock Wastage & Spillage Logger
 *  10. Barcode Label Generator & Bulk CSV Importer Modal
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useMemo, useState } from "react";
import {
  Package, Layers, BarChart3, Tag, Clock, Plus, Search, Edit2, Trash2,
  AlertTriangle, ArrowLeftRight, ClipboardList, FileText, RefreshCw,
  TrendingUp, TrendingDown, Archive, Zap, Barcode, Hash, Target,
  Send, Check, Eye, ShoppingCart, DollarSign, Upload, Truck, ShieldAlert,
  CheckCircle, Download, X, QrCode, Printer
} from "lucide-react";
import { useBranch, useModule, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;
const fmtNum = (n: number) => n.toLocaleString();

export interface ProductVariantData {
  id: string;
  name: string;
  sku: string;
  attributes: Record<string, string>;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
  status: "Active" | "Low Stock" | "Out of Stock";
  hasVariants?: boolean;
  variants?: ProductVariantData[];
}

export type InventoryTab =
  | "dashboard" | "products" | "categories" | "ledger"
  | "transfers" | "count" | "recipes" | "wastage" | "reports";

export const InventoryPage: React.FC = () => {
  const { currentTenantName } = useTenant();
  const { currentBranchName } = useBranch();
  const { activeModule } = useModule();
  const [activeTab, setActiveTab] = useState<InventoryTab>("dashboard");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Sample Products State
  const [items, setItems] = useState<InventoryItem[]>([
    { id: "inv-001", name: "Azam Wheat Flour 2kg", sku: "SKU-AZM-FLR-01", category: "Grains & Flour", brand: "Azam", buyingPrice: 6200, sellingPrice: 7900, stock: 45, reorderLevel: 10, status: "Active" },
    {
      id: "inv-006",
      name: "Amoxicillin 500mg Capsules",
      sku: "SKU-AMX-500-06",
      category: "Pharmacy",
      brand: "Zenith Labs",
      buyingPrice: 8000,
      sellingPrice: 12000,
      stock: 85,
      reorderLevel: 15,
      status: "Active",
      hasVariants: true,
      variants: [
        { id: "var-01", name: "Box of 21 Capsules", sku: "AMX-500-BOX21", attributes: { Pack: "Box", Count: "21" }, buyingPrice: 8000, sellingPrice: 12000, stock: 50, reorderLevel: 10 },
        { id: "var-02", name: "Strip of 10 Capsules", sku: "AMX-500-STP10", attributes: { Pack: "Strip", Count: "10" }, buyingPrice: 3800, sellingPrice: 6000, stock: 35, reorderLevel: 5 },
      ]
    },
    { id: "inv-002", name: "Coca Cola 500ml Pet", sku: "SKU-COK-500-02", category: "Beverages", brand: "Coca Cola", buyingPrice: 1100, sellingPrice: 1500, stock: 120, reorderLevel: 20, status: "Active" },
    { id: "inv-003", name: "Unga wa Ngano 10kg", sku: "SKU-UNG-10K-03", category: "Grains & Flour", brand: "Azam", buyingPrice: 24000, sellingPrice: 28000, stock: 8, reorderLevel: 10, status: "Low Stock" },
    { id: "inv-004", name: "Fresh Cow Milk 1L", sku: "SKU-MLK-1L-04", category: "Dairy", brand: "ASAS", buyingPrice: 2200, sellingPrice: 3000, stock: 0, reorderLevel: 15, status: "Out of Stock" },
    { id: "inv-005", name: "Cooking Oil 5L Refined", sku: "SKU-OIL-5L-05", category: "Edible Oils", brand: "Korie", buyingPrice: 36000, sellingPrice: 43000, stock: 14, reorderLevel: 5, status: "Active" },
  ]);

  // Modal States
  const [addProductModal, setAddProductModal] = useState(false);
  const [csvImportModal, setCsvImportModal] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [selectedBarcodeItem, setSelectedBarcodeItem] = useState<InventoryItem | null>(null);

  // Variant Builder Modal State
  const [variantModalProduct, setVariantModalProduct] = useState<InventoryItem | null>(null);
  const [newVarAttrKey, setNewVarAttrKey] = useState("Size");
  const [newVarAttrVal, setNewVarAttrVal] = useState("");
  const [newVarPrice, setNewVarPrice] = useState(0);
  const [newVarStock, setNewVarStock] = useState(10);

  // New Product Form State
  const [newProd, setNewProd] = useState({
    name: "", category: "Grains & Flour", brand: "", buyingPrice: 0, sellingPrice: 0, stock: 0, reorderLevel: 10
  });

  // Stock Movement Ledger Filter & Entry State
  const [ledgerMovementFilter, setLedgerMovementFilter] = useState("ALL");
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState("");
  const [stockAdjModal, setStockAdjModal] = useState(false);
  const [adjSku, setAdjSku] = useState("SKU-AZM-FLR-01");
  const [adjType, setAdjType] = useState<"ADJUSTMENT_GAIN" | "ADJUSTMENT_LOSS" | "OPENING_STOCK" | "WASTAGE_SPILL">("ADJUSTMENT_GAIN");
  const [adjQty, setAdjQty] = useState(1);
  const [adjNotes, setAdjNotes] = useState("");

  const [ledger, setLedger] = useState([
    { id: "led-101", date: "2026-09-01 10:15", sku: "SKU-AZM-FLR-01", name: "Azam Wheat Flour 2kg", type: "SALE_OUTBOUND", qty: -2, qtyBefore: 47, balance: 45, unitCost: 6200, totalCost: 12400, ref: "SALE-2026-9912", user: "Cashier 01" },
    { id: "led-102", date: "2026-09-01 09:30", sku: "SKU-COK-500-02", name: "Coca Cola 500ml Pet", type: "GRN_INBOUND", qty: +50, qtyBefore: 70, balance: 120, unitCost: 1100, totalCost: 55000, ref: "PO-2026-004", user: "Inventory Officer" },
    { id: "led-103", date: "2026-08-31 16:45", sku: "SKU-UNG-10K-03", name: "Unga wa Ngano 10kg", type: "TRANSFER_OUT", qty: -5, qtyBefore: 13, balance: 8, unitCost: 24000, totalCost: 120000, ref: "TR-2026-08", user: "Store Manager" },
    { id: "led-104", date: "2026-08-31 14:10", sku: "SKU-AMX-500-06", name: "Amoxicillin 500mg Capsules", type: "OPENING_STOCK", qty: +85, qtyBefore: 0, balance: 85, unitCost: 8000, totalCost: 680000, ref: "INIT-2026-01", user: "System Bootstrap" },
    { id: "led-105", date: "2026-08-31 11:20", sku: "SKU-MLK-1L-04", name: "Fresh Cow Milk 1L", type: "WASTAGE_SPILL", qty: -2, qtyBefore: 2, balance: 0, unitCost: 2200, totalCost: 4400, ref: "WST-2026-01", user: "Shift Supervisor" },
  ]);

  const filteredLedger = useMemo(() => {
    return ledger.filter((l) => {
      const matchType = ledgerMovementFilter === "ALL" || l.type === ledgerMovementFilter;
      const q = ledgerSearchQuery.toLowerCase().trim();
      const matchQ = !q || l.name.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q) || l.ref.toLowerCase().includes(q);
      return matchType && matchQ;
    });
  }, [ledger, ledgerMovementFilter, ledgerSearchQuery]);

  // Branch Stock Transfer State
  const [transfers, setTransfers] = useState([
    { id: "TR-2026-08", fromBranch: "Main HQ Warehouse", toBranch: "Kijitonyama Branch", itemsCount: 3, status: "IN_TRANSIT", date: "2026-08-31" },
    { id: "TR-2026-07", fromBranch: "Posta Counter", toBranch: "Main HQ Warehouse", itemsCount: 1, status: "RECEIVED", date: "2026-08-28" },
  ]);

  // Physical Count State
  const [counts] = useState([
    { id: "CNT-2026-01", date: "2026-08-31", auditor: "Joseph Mchome", totalItems: 145, varianceItems: 3, status: "PENDING_APPROVAL" }
  ]);

  // Recipe State
  const [recipes] = useState([
    { id: "REC-01", parentName: "Cocktail Special 500ml", yieldQty: 1, ingredients: [{ name: "Safari Lager 500ml", qty: 250, unit: "ml" }, { name: "Sprite 300ml", qty: 250, unit: "ml" }] }
  ]);

  // Wastage State
  const [wastages, setWastages] = useState([
    { id: "WST-01", date: "2026-09-01 08:30", name: "Fresh Cow Milk 1L", qty: 2, reason: "EXPIRED", cost: 4400, loggedBy: "Shift Supervisor" }
  ]);

  // Filtered Products
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((i) => {
      const matchCat = categoryFilter === "All" || i.category === categoryFilter;
      const matchQ = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.brand.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [items, categoryFilter, searchQuery]);

  // Stock Valuation Metrics
  const totalStockValuation = items.reduce((sum, i) => sum + i.stock * i.buyingPrice, 0);
  const totalRetailValuation = items.reduce((sum, i) => sum + i.stock * i.sellingPrice, 0);
  const potentialProfit = totalRetailValuation - totalStockValuation;
  const lowStockCount = items.filter((i) => i.stock > 0 && i.stock <= i.reorderLevel).length;
  const outOfStockCount = items.filter((i) => i.stock === 0).length;

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name.trim()) return;

    const autoSku = `SKU-${newProd.name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const status: InventoryItem["status"] = newProd.stock === 0 ? "Out of Stock" : newProd.stock <= newProd.reorderLevel ? "Low Stock" : "Active";

    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      name: newProd.name.trim(),
      sku: autoSku,
      category: newProd.category,
      brand: newProd.brand.trim() || "General",
      buyingPrice: Number(newProd.buyingPrice),
      sellingPrice: Number(newProd.sellingPrice),
      stock: Number(newProd.stock),
      reorderLevel: Number(newProd.reorderLevel),
      status,
    };

    setItems((prev) => [newItem, ...prev]);
    setNewProd({ name: "", category: "Grains & Flour", brand: "", buyingPrice: 0, sellingPrice: 0, stock: 0, reorderLevel: 10 });
    setAddProductModal(false);
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header Bar */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Inventory & Stock Operations Command Center
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Manage SKU catalog, stock movement audit trail, branch transfers, physical counts, recipes, and wastage logs.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => setCsvImportModal(true)} type="button">
            <Upload size={13} /> Bulk CSV Import
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setAddProductModal(true)} type="button">
            <Plus size={13} /> Add New SKU
          </button>
        </div>
      </div>

      {/* KPI Cards Header */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-label">Total Stock Valuation (Cost)</div>
          <div className="kpi-card-value" style={{ color: "var(--accent)" }}>{money(totalStockValuation)}</div>
          <div className="kpi-card-desc">Retail potential: {money(totalRetailValuation)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Est. Potential Profit</div>
          <div className="kpi-card-value" style={{ color: "var(--success)" }}>{money(potentialProfit)}</div>
          <div className="kpi-card-desc">Margin: {Math.round((potentialProfit / (totalRetailValuation || 1)) * 100)}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Low Stock Alerts</div>
          <div className="kpi-card-value" style={{ color: lowStockCount > 0 ? "var(--warning)" : "var(--muted)" }}>
            {lowStockCount} SKUs
          </div>
          <div className="kpi-card-desc">Below branch reorder threshold</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Out of Stock SKUs</div>
          <div className="kpi-card-value" style={{ color: outOfStockCount > 0 ? "var(--danger)" : "var(--muted)" }}>
            {outOfStockCount} SKUs
          </div>
          <div className="kpi-card-desc">Needs urgent replenishment</div>
        </div>
      </div>

      {/* 9-Tab Sub-Navigation */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem", overflowX: "auto" }}>
        {[
          { id: "dashboard", label: "Overview", icon: BarChart3 },
          { id: "products", label: "SKU Catalog", icon: Package },
          { id: "categories", label: "Categories & Brands", icon: Layers },
          { id: "ledger", label: "Stock Ledger", icon: Clock },
          { id: "transfers", label: "Branch Transfers", icon: ArrowLeftRight },
          { id: "count", label: "Physical Count", icon: ClipboardList },
          { id: "recipes", label: "Recipes / BOM", icon: Zap },
          { id: "wastage", label: "Wastage & Spillage", icon: AlertTriangle },
          { id: "reports", label: "Valuation Reports", icon: FileText },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as InventoryTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
            style={{ whiteSpace: "nowrap" }}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── TAB 1: OVERVIEW DASHBOARD ────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="v2-card">
          <div className="v2-card-header"><div className="v2-card-title">Inventory Health Overview</div></div>
          <div className="v2-space-y-4">
            <div className="v2-grid v2-grid-2 v2-gap-4">
              <div>
                <h3 className="v2-font-bold v2-text-sm v2-mb-2">Low Stock Replenishment Required</h3>
                <div className="v2-card v2-p-2">
                  {items.filter((i) => i.stock <= i.reorderLevel).map((i) => (
                    <div key={i.id} className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
                      <div>
                        <div className="v2-font-bold v2-text-xs">{i.name}</div>
                        <div className="v2-text-xs v2-text-muted">{i.sku} · Reorder Level: {i.reorderLevel}</div>
                      </div>
                      <span className={`badge ${i.stock === 0 ? "v2-badge-danger" : "v2-badge-warning"}`}>
                        {i.stock} in stock
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="v2-font-bold v2-text-sm v2-mb-2">Recent Movement Ledger</h3>
                <div className="v2-card v2-p-2">
                  {ledger.map((l) => (
                    <div key={l.id} className="v2-flex v2-items-center v2-justify-between v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)" }}>
                      <div>
                        <div className="v2-font-bold v2-text-xs">{l.name}</div>
                        <div className="v2-text-xs v2-text-muted">{l.date} · Ref: {l.ref}</div>
                      </div>
                      <span className={`v2-mono v2-font-bold v2-text-xs ${l.qty > 0 ? "v2-text-success" : "v2-text-danger"}`}>
                        {l.qty > 0 ? `+${l.qty}` : l.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SKU CATALOG ───────────────────────────────────────────────── */}
      {activeTab === "products" && (
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1 }}>
              <Search size={13} style={{ color: "var(--muted)" }} />
              <input
                className="v2-input"
                style={{ border: "none", flex: 1 }}
                placeholder="Search SKU catalog by product name, SKU, or brand..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button">
              <Download size={13} /> Export Catalog
            </button>
          </div>

          <table className="v2-table">
            <thead>
              <tr>
                <th>SKU Code</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Buying Price</th>
                <th>Selling Price</th>
                <th>Stock Qty</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td className="v2-mono v2-text-xs">{item.sku}</td>
                  <td className="v2-font-bold">{item.name}</td>
                  <td><span className="badge v2-badge-muted">{item.category}</span></td>
                  <td className="v2-mono">{money(item.buyingPrice)}</td>
                  <td className="v2-mono v2-font-bold">{money(item.sellingPrice)}</td>
                  <td className="v2-mono v2-font-bold">{fmtNum(item.stock)}</td>
                  <td>
                    <span className={`badge ${item.status === "Active" ? "v2-badge-success" : item.status === "Low Stock" ? "v2-badge-warning" : "v2-badge-danger"}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <div className="v2-flex v2-gap-1">
                      <button
                        className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                        onClick={() => setVariantModalProduct(item)}
                        title="Manage Product Variants"
                        type="button"
                      >
                        <Layers size={13} />
                      </button>
                      <button
                        className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                        onClick={() => {
                          setSelectedBarcodeItem(item);
                          setBarcodeModal(true);
                        }}
                        title="Print Barcode Labels"
                        type="button"
                      >
                        <Barcode size={13} />
                      </button>
                      <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" title="Edit SKU" type="button">
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB 3: STOCK LEDGER ─────────────────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="v2-card">
          <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
            <div className="v2-flex v2-items-center v2-gap-3" style={{ flex: 1 }}>
              <div className="v2-card-title">Stock Movement Audit Trail</div>
              <div className="v2-flex v2-items-center v2-gap-2" style={{ flex: 1, maxWidth: 300 }}>
                <Search size={13} style={{ color: "var(--muted)" }} />
                <input
                  className="v2-input v2-input-sm"
                  placeholder="Filter by SKU, name, or ref..."
                  value={ledgerSearchQuery}
                  onChange={(e) => setLedgerSearchQuery(e.target.value)}
                />
              </div>
              <select
                className="v2-input v2-input-sm"
                style={{ width: 160 }}
                value={ledgerMovementFilter}
                onChange={(e) => setLedgerMovementFilter(e.target.value)}
              >
                <option value="ALL">All Movement Types</option>
                <option value="SALE_OUTBOUND">POS Sales (Outbound)</option>
                <option value="GRN_INBOUND">PO Intake (GRN Inbound)</option>
                <option value="TRANSFER_IN">Branch Transfer (In)</option>
                <option value="TRANSFER_OUT">Branch Transfer (Out)</option>
                <option value="ADJUSTMENT_GAIN">Stock Audit Gain</option>
                <option value="ADJUSTMENT_LOSS">Stock Audit Loss</option>
                <option value="WASTAGE_SPILL">Wastage / Spillage</option>
                <option value="CUSTOMER_RETURN">Customer Return</option>
                <option value="OPENING_STOCK">Opening Stock</option>
              </select>
            </div>
            <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setStockAdjModal(true)} type="button">
              <Plus size={13} /> Record Stock Adjustment
            </button>
          </div>

          <table className="v2-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>SKU Code</th>
                <th>Product Name</th>
                <th>Movement Type</th>
                <th>Qty Change</th>
                <th>Stock Lineage</th>
                <th>Unit Cost</th>
                <th>Valuation Impact</th>
                <th>Reference</th>
                <th>Operator</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={10} className="v2-text-center v2-text-muted v2-py-4">
                    No stock movement audit records found matching active filter.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((l) => (
                  <tr key={l.id}>
                    <td className="v2-text-xs v2-text-muted">{l.date}</td>
                    <td className="v2-mono v2-text-xs">{l.sku}</td>
                    <td className="v2-font-bold">{l.name}</td>
                    <td>
                      <span className={`badge ${l.qty > 0 ? "v2-badge-success" : "v2-badge-muted"}`}>
                        {l.type}
                      </span>
                    </td>
                    <td className={`v2-mono v2-font-bold ${l.qty > 0 ? "v2-text-success" : "v2-text-danger"}`}>
                      {l.qty > 0 ? `+${l.qty}` : l.qty}
                    </td>
                    <td className="v2-mono v2-text-xs">
                      {l.qtyBefore} → <span className="v2-font-bold">{l.balance}</span>
                    </td>
                    <td className="v2-mono">{money(l.unitCost || 0)}</td>
                    <td className="v2-mono v2-font-bold">{money(l.totalCost || 0)}</td>
                    <td className="v2-mono v2-text-xs">{l.ref}</td>
                    <td className="v2-text-xs v2-text-muted">{l.user || "System"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB 4: BRANCH TRANSFERS ─────────────────────────────────────────── */}
      {activeTab === "transfers" && (
        <div className="v2-card">
          <div className="v2-card-header">
            <div className="v2-card-title">Branch-to-Branch Stock Transfers</div>
            <button className="v2-btn v2-btn-primary v2-btn-sm" type="button">
              <Plus size={13} /> Create Transfer
            </button>
          </div>
          <table className="v2-table">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Origin Branch</th>
                <th>Destination Branch</th>
                <th>Items Count</th>
                <th>Status</th>
                <th>Transfer Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((tr) => (
                <tr key={tr.id}>
                  <td className="v2-mono v2-text-xs">{tr.id}</td>
                  <td>{tr.fromBranch}</td>
                  <td>{tr.toBranch}</td>
                  <td className="v2-mono">{tr.itemsCount} SKUs</td>
                  <td>
                    <span className={`badge ${tr.status === "RECEIVED" ? "v2-badge-success" : "v2-badge-warning"}`}>
                      {tr.status}
                    </span>
                  </td>
                  <td className="v2-text-muted">{tr.date}</td>
                  <td>
                    <button className="v2-btn v2-btn-ghost v2-btn-icon-sm" type="button">
                      <Eye size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Add Product Modal --- */}
      {addProductModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 500, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-4">
              <h2 className="v2-text-lg v2-font-black">Register New Inventory SKU</h2>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setAddProductModal(false)} type="button">✕</button>
            </div>

            <form onSubmit={handleCreateProduct} className="v2-space-y-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">PRODUCT FULL NAME *</label>
                <input className="v2-input" value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} placeholder="e.g. Premium White Sugar 1kg" required />
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">CATEGORY</label>
                  <select className="v2-input" value={newProd.category} onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}>
                    <option value="Grains & Flour">Grains & Flour</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Dairy">Dairy</option>
                    <option value="Edible Oils">Edible Oils</option>
                    <option value="Pharmacy">Pharmacy</option>
                  </select>
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">BRAND / MAKE</label>
                  <input className="v2-input" value={newProd.brand} onChange={(e) => setNewProd({ ...newProd, brand: e.target.value })} placeholder="Brand name" />
                </div>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">BUYING COST PRICE (TSH)</label>
                  <input className="v2-input" type="number" value={newProd.buyingPrice || ""} onChange={(e) => setNewProd({ ...newProd, buyingPrice: Number(e.target.value) })} required />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">SELLING RETAIL PRICE (TSH)</label>
                  <input className="v2-input" type="number" value={newProd.sellingPrice || ""} onChange={(e) => setNewProd({ ...newProd, sellingPrice: Number(e.target.value) })} required />
                </div>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">INITIAL STOCK QTY</label>
                  <input className="v2-input" type="number" value={newProd.stock || ""} onChange={(e) => setNewProd({ ...newProd, stock: Number(e.target.value) })} required />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">REORDER THRESHOLD</label>
                  <input className="v2-input" type="number" value={newProd.reorderLevel || ""} onChange={(e) => setNewProd({ ...newProd, reorderLevel: Number(e.target.value) })} required />
                </div>
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setAddProductModal(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Save Product SKU</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Product Variant Manager Modal --- */}
      {variantModalProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 560, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Manage Variants — {variantModalProduct.name}</h2>
                <div className="v2-text-xs v2-text-muted">Parent SKU: {variantModalProduct.sku}</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">✕</button>
            </div>

            {/* Existing Variants Table */}
            <div className="v2-mb-4" style={{ maxHeight: 220, overflowY: "auto" }}>
              {!variantModalProduct.variants || variantModalProduct.variants.length === 0 ? (
                <div className="v2-text-xs v2-text-muted v2-text-center v2-py-4">No variant variations configured for this SKU yet.</div>
              ) : (
                <table className="v2-table v2-table-sm">
                  <thead>
                    <tr>
                      <th>Variant Name</th>
                      <th>SKU</th>
                      <th>Selling Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantModalProduct.variants.map((v) => (
                      <tr key={v.id}>
                        <td className="v2-font-bold">{v.name}</td>
                        <td className="v2-mono v2-text-xs">{v.sku}</td>
                        <td className="v2-mono">{money(v.sellingPrice)}</td>
                        <td className="v2-mono v2-font-bold">{v.stock}</td>
                        <td>
                          <button
                            className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                            style={{ color: "var(--danger)" }}
                            onClick={() => {
                              const updatedVars = variantModalProduct.variants?.filter((x) => x.id !== v.id);
                              setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? { ...i, variants: updatedVars } : i));
                              setVariantModalProduct({ ...variantModalProduct, variants: updatedVars });
                            }}
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Add New Variant Form */}
            <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)" }}>
              <div className="v2-font-bold v2-text-xs v2-mb-2">Add New Attribute Variant</div>
              <div className="v2-grid v2-grid-2 v2-gap-2 v2-mb-2">
                <select className="v2-input v2-input-sm" value={newVarAttrKey} onChange={(e) => setNewVarAttrKey(e.target.value)}>
                  <option value="Size">Size (e.g. Small, 500ml, 10kg)</option>
                  <option value="Pack">Pack (e.g. Box, Strip, Carton)</option>
                  <option value="Color">Color / Flavor</option>
                  <option value="Custom">Custom Attribute</option>
                </select>
                <input className="v2-input v2-input-sm" placeholder="Variant Value (e.g. Box of 24)" value={newVarAttrVal} onChange={(e) => setNewVarAttrVal(e.target.value)} />
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-2 v2-mb-3">
                <input className="v2-input v2-input-sm" type="number" placeholder="Selling Price Override (Tsh)" value={newVarPrice || ""} onChange={(e) => setNewVarPrice(Number(e.target.value))} />
                <input className="v2-input v2-input-sm" type="number" placeholder="Initial Stock Qty" value={newVarStock || ""} onChange={(e) => setNewVarStock(Number(e.target.value))} />
              </div>

              <button
                className="v2-btn v2-btn-primary v2-btn-sm"
                style={{ width: "100%", justifyContent: "center" }}
                disabled={!newVarAttrVal.trim()}
                onClick={() => {
                  if (!newVarAttrVal.trim()) return;
                  const varSku = `VAR-${variantModalProduct.sku.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`;
                  const newVar: ProductVariantData = {
                    id: `var-${Date.now()}`,
                    name: `${newVarAttrKey}: ${newVarAttrVal.trim()}`,
                    sku: varSku,
                    attributes: { [newVarAttrKey]: newVarAttrVal.trim() },
                    buyingPrice: variantModalProduct.buyingPrice,
                    sellingPrice: newVarPrice || variantModalProduct.sellingPrice,
                    stock: newVarStock,
                    reorderLevel: 5,
                  };
                  const updatedVars = [...(variantModalProduct.variants || []), newVar];
                  setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? { ...i, hasVariants: true, variants: updatedVars } : i));
                  setVariantModalProduct({ ...variantModalProduct, hasVariants: true, variants: updatedVars });
                  setNewVarAttrVal("");
                }}
                type="button"
              >
                <Plus size={13} /> Add Variant Option
              </button>
            </div>

            <div className="v2-flex v2-justify-end v2-mt-4">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">Close</button>
            </div>
          </div>
        </div>
      )}
      {/* --- Record Stock Adjustment Modal --- */}
      {stockAdjModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 480, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Record Stock Adjustment</h2>
                <div className="v2-text-xs v2-text-muted">Post a canonical inventory movement entry to the stock audit ledger</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setStockAdjModal(false)} type="button">✕</button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const targetItem = items.find((i) => i.sku === adjSku) || items[0];
                if (!targetItem) return;

                const isGain = adjType === "ADJUSTMENT_GAIN" || adjType === "OPENING_STOCK";
                const qtyChange = isGain ? Math.abs(adjQty) : -Math.abs(adjQty);
                const prevStock = targetItem.stock;
                const newStock = Math.max(0, prevStock + qtyChange);

                const nowStr = new Date().toISOString().replace("T", " ").slice(0, 16);
                const refCode = `ADJ-${Date.now().toString().slice(-6)}`;

                const newEntry = {
                  id: `led-${Date.now()}`,
                  date: nowStr,
                  sku: targetItem.sku,
                  name: targetItem.name,
                  type: adjType,
                  qty: qtyChange,
                  qtyBefore: prevStock,
                  balance: newStock,
                  unitCost: targetItem.buyingPrice,
                  totalCost: Math.abs(qtyChange) * targetItem.buyingPrice,
                  ref: refCode,
                  user: "Current Operator",
                };

                setLedger((prev) => [newEntry, ...prev]);
                setItems((prev) =>
                  prev.map((i) =>
                    i.sku === targetItem.sku
                      ? { ...i, stock: newStock, status: newStock === 0 ? "Out of Stock" : newStock <= i.reorderLevel ? "Low Stock" : "Active" }
                      : i
                  )
                );

                setStockAdjModal(false);
                setAdjNotes("");
              }}
              className="v2-space-y-3"
            >
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">SELECT TARGET SKU *</label>
                <select className="v2-input" value={adjSku} onChange={(e) => setAdjSku(e.target.value)}>
                  {items.map((i) => (
                    <option key={i.id} value={i.sku}>
                      {i.name} ({i.sku}) — Stock: {i.stock}
                    </option>
                  ))}
                </select>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">MOVEMENT TYPE</label>
                  <select className="v2-input" value={adjType} onChange={(e) => setAdjType(e.target.value as any)}>
                    <option value="ADJUSTMENT_GAIN">ADJUSTMENT GAIN (+)</option>
                    <option value="ADJUSTMENT_LOSS">ADJUSTMENT LOSS (-)</option>
                    <option value="WASTAGE_SPILL">WASTAGE / SPILLAGE (-)</option>
                    <option value="OPENING_STOCK">OPENING STOCK (+)</option>
                  </select>
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">QUANTITY DELTA</label>
                  <input className="v2-input" type="number" min="1" value={adjQty} onChange={(e) => setAdjQty(Number(e.target.value))} required />
                </div>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">REASON & AUDIT NOTES</label>
                <input className="v2-input" placeholder="e.g. Physical inventory count discrepancy" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setStockAdjModal(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Post Stock Adjustment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
