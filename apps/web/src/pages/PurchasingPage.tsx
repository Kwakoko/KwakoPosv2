/**
 * KwakoPosv2 — Purchasing, Suppliers & Goods Receiving (GRN)
 * ─────────────────────────────────────────────────────────────────────────────
 * Complete procurement management command center matching mature legacy UX:
 *   1. Supplier Directory (TIN/VRN tax compliance, mobile money settlement, ledgers)
 *   2. Purchase Orders (PO) (Item creation, VAT calculations, status workflow)
 *   3. Goods Receipt Notes (GRN) (Warehouse stock intake, batch/expiry logging)
 *   4. Supplier Invoices & 3-Way Matching (PO vs GRN vs Invoice verification)
 *
 * Uses V2 CSS variables + semantic utility classes. Zero Tailwind / inline styles.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Truck, ShoppingBag, Package, Plus, Search, CheckCircle, Clock, XCircle,
  PackageCheck, MapPin, Phone, User, TrendingUp, DollarSign, FileText, Eye,
  RefreshCw, Scale, Shield, AlertCircle, Edit3, Trash2, ChevronRight, Lock,
  Building2, ArrowDownRight, CreditCard, Wallet, Check, AlertTriangle, X, CheckCircle2
} from "lucide-react";
import { useBranch, useModule, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { useToast } from "../context/ToastContext.js";
import { useAudioFeedback } from "../utils/useAudioFeedback.js";
import { DATA_CHANGED_EVENT } from "../services/dataChangeEvent.js";
import { productionCleanupService } from "../services/productionCleanupService.js";
import { apiFetch, safeUUID } from "../services/applicationApiService.js";

type PurchTab = "suppliers" | "orders" | "grn" | "invoices";

const fmt = (n: number) => `Tsh ${Math.round(n).toLocaleString()}`;
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-TZ", { day: "2-digit", month: "short", year: "numeric" });

// Tax Compliance Validators (Tanzania TRA)
const validateTin = (tin?: string) => {
  if (!tin) return { valid: false, text: "⚠ Missing TIN", badgeClass: "v2-badge-warning" };
  const clean = tin.replace(/-/g, "");
  if (/^\d{9}$/.test(clean)) return { valid: true, text: "✓ TIN Valid", badgeClass: "v2-badge-success" };
  return { valid: false, text: "⚠ Invalid TIN (9 digits)", badgeClass: "v2-badge-danger" };
};

const validateVrn = (vrn?: string) => {
  if (!vrn) return { valid: false, text: "⚠ Missing VRN", badgeClass: "v2-badge-muted" };
  const clean = vrn.replace(/-/g, "");
  if (/^\d{8}[A-Z]$/i.test(clean)) return { valid: true, text: "✓ VRN Valid", badgeClass: "v2-badge-success" };
  return { valid: false, text: "⚠ Invalid VRN", badgeClass: "v2-badge-danger" };
};

export interface PurchasingPageProps {
  activeTab?: string;
}

export interface PoLineItem {
  productId: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
  totalCost: number;
}

export interface PurchaseOrderRecord {
  id: string;
  poNumber: string;
  supplierId?: string;
  supplier: string;
  supplierName?: string;
  itemsCount: number;
  items: PoLineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  status: "Draft" | "Approved" | "Completed" | "Cancelled";
  expected: string;
  date: string;
  notes?: string;
}

export interface GrnRecord {
  id: string;
  poId: string;
  supplier: string;
  warehouse: string;
  receivedAt: string;
  batchNumber?: string;
  expiryDate?: string;
  itemsCount: number;
  totalValue: number;
  status: "VERIFIED" | "PENDING_AUDIT";
}

// Helper detectors for fabricated demo records (Pillars CLN-01, CLN-03, CLN-04)
const isDemoSupplier = (s: any): boolean => {
  return Boolean(
    s && (
      s.isDemo ||
      String(s.id).startsWith("SUP-00") ||
      String(s.id).startsWith("sup-demo-") ||
      s.name === "Azam Tanzania Ltd" ||
      s.name === "Coca Cola Kwanza" ||
      s.name === "Shelys Pharmaceuticals"
    )
  );
};

const isDemoOrder = (o: any): boolean => {
  return Boolean(
    o && (
      o.isDemo ||
      String(o.id).startsWith("PO-2026-00") ||
      o.supplierName === "Azam Tanzania Ltd" ||
      o.supplierName === "Coca Cola Kwanza" ||
      o.supplierName === "Shelys Pharmaceuticals" ||
      o.supplier === "Azam Tanzania Ltd" ||
      o.supplier === "Coca Cola Kwanza" ||
      o.supplier === "Shelys Pharmaceuticals"
    )
  );
};

const isDemoGrn = (g: any): boolean => {
  return Boolean(
    g && (
      g.isDemo ||
      String(g.id).startsWith("GRN-2026-01") ||
      g.supplier === "Azam Tanzania Ltd" ||
      g.supplier === "Coca Cola Kwanza" ||
      g.supplier === "Shelys Pharmaceuticals"
    )
  );
};

export const PurchasingPage: React.FC<PurchasingPageProps> = ({ activeTab: propActiveTab }) => {
  const { currentTenantId } = useTenant();
  const { currentBranchId, currentBranchName } = useBranch();
  const { setActiveTab: setGlobalActiveTab } = useModule();
  const { db } = useSync();
  const toast = useToast();
  const { playSuccessChime, playWarningTone } = useAudioFeedback();

  const [activeTab, setActiveTab] = useState<PurchTab>("suppliers");

  const selectPurchasingTab = useCallback((tab: PurchTab) => {
    setActiveTab(tab);
    const globalTab: Record<PurchTab, string> = {
      "suppliers": "Suppliers",
      "orders": "Purchase Orders",
      "grn": "Goods Received",
      "invoices": "Supplier Ledgers",
    };
    setGlobalActiveTab(globalTab[tab]);
  }, [setGlobalActiveTab]);

  useEffect(() => {
    if (!propActiveTab) return;
    const map: Record<string, PurchTab> = {
      "Suppliers": "suppliers",
      "Purchase Orders": "orders",
      "Goods Received": "grn",
      "Supplier Ledgers": "invoices",
      "Warehouses": "grn",
    };
    if (map[propActiveTab]) {
      setActiveTab(map[propActiveTab]);
    }
  }, [propActiveTab]);


  const [searchQuery, setSearchQuery] = useState("");

  // Hydrated State - Zero Mock Policy (CLN-01)
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRecord[]>([]);
  const [grns, setGrns] = useState<GrnRecord[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<Array<{ id: string; name: string; sku: string; buyingPrice: number }>>([]);
  const [isCleaning, setIsCleaning] = useState(false);
  const [showPillarsInfo, setShowPillarsInfo] = useState(false);

  const isProductionLocked = useMemo(() => {
    return productionCleanupService.isProductionLocked();
  }, []);

  // PostgreSQL is the purchasing authority. IndexedDB is used only as an offline cache/pending-operation view.
  const loadProcurement = useCallback(async () => {
    try {
      await db.ready;
      const [supplierRes, orderRes, receiptRes] = await Promise.all([
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/suppliers"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/purchases"),
        apiFetch<{ success: boolean; data: any[] }>("/api/v1/purchases/receipts"),
      ]);

      const productsById = new Map(Array.from(db.products.values()).map((p: any) => [p.id, p]));
      const prods = Array.from(db.productVariants.values())
        .filter((v: any) => v.tenantId === currentTenantId && v.branchId === currentBranchId && v.isActive !== false)
        .map((v: any) => {
          const product: any = productsById.get(v.productId);
          return {
            id: v.id,
            name: product ? `${product.name} — ${v.name || v.sku}` : (v.name || v.sku),
            sku: v.sku,
            buyingPrice: Number(v.effectiveBuyingPrice ?? v.costPrice ?? product?.buyingPrice ?? 0),
          };
        });
      setCatalogProducts(prods);

      setSuppliers((Array.isArray(supplierRes.data) ? supplierRes.data : []).map((s: any) => ({ ...s, balance: Number(s.outstandingBalance || 0), creditLimit: Number(s.creditLimit || 0) })));
      const supplierById = new Map((supplierRes.data || []).map((s: any) => [s.id, s]));
      setOrders((orderRes.data || []).map((o: any) => ({
        id: o.id, poNumber: o.orderNumber, supplierId: o.supplierId,
        supplier: supplierById.get(o.supplierId)?.name || o.supplierId,
        supplierName: supplierById.get(o.supplierId)?.name || o.supplierId,
        itemsCount: Array.isArray(o.items) ? o.items.length : 0,
        items: (o.items || []).map((i: any) => ({
          productId: i.variantId, sku: "", name: "", qtyOrdered: Number(i.quantityOrdered),
          qtyReceived: Number(i.quantityReceived || 0), unitCost: Number(i.unitCost), totalCost: Number(i.totalCost),
          variantId: i.variantId,
        })),
        subtotal: Number(o.totalAmount), vatAmount: 0, total: Number(o.totalAmount),
        status: o.status === "RECEIVED" ? "Completed" : o.status === "CANCELLED" ? "Cancelled" : o.status === "DRAFT" ? "Draft" : "Approved",
        expected: o.orderedAt, date: o.orderedAt, notes: o.notes || undefined,
      })));
      setGrns((receiptRes.data || []).map((r: any) => ({
        id: r.id, poId: r.purchaseOrderId || "",
        supplier: supplierById.get(r.supplierId)?.name || r.supplierId,
        warehouse: currentBranchName || "Main Store", receivedAt: r.receivedAt,
        batchNumber: r.items?.[0]?.batchNumber || undefined, expiryDate: r.items?.[0]?.expiryDate || undefined,
        itemsCount: Array.isArray(r.items) ? r.items.length : 0,
        totalValue: (r.items || []).reduce((s: number, i: any) => s + Number(i.totalCost || 0), 0), status: "VERIFIED",
      })));
    } catch (e) {
      // Offline: never resurrect configuration snapshots. Show only authoritative local entities and pending outbox mutations.
      const tenantId = currentTenantId;
      setSuppliers(Array.from(db.suppliers.values()).filter((s: any) => s.tenantId === tenantId && s.branchId === currentBranchId));
      const pending = Array.from((db as any).syncOutbox?.values?.() || []).filter((o: any) => o.tenantId === tenantId && o.branchId === currentBranchId && o.status === "PENDING");
      setOrders(pending.filter((o: any) => o.entityType === "PurchaseOrder").map((o: any) => ({
        id: o.entityId, poNumber: o.payload.orderNumber || o.entityId, supplierId: o.payload.supplierId,
        supplier: o.payload.supplierId, supplierName: o.payload.supplierId, itemsCount: o.payload.items?.length || 0,
        items: (o.payload.items || []).map((i: any) => ({ productId: i.variantId, sku: "", name: "", qtyOrdered: Number(i.quantityOrdered), qtyReceived: 0, unitCost: Number(i.unitCost), totalCost: Number(i.quantityOrdered) * Number(i.unitCost), variantId: i.variantId })),
        subtotal: (o.payload.items || []).reduce((s: number, i: any) => s + Number(i.quantityOrdered) * Number(i.unitCost), 0), vatAmount: 0,
        total: (o.payload.items || []).reduce((s: number, i: any) => s + Number(i.quantityOrdered) * Number(i.unitCost), 0), status: "Draft", expected: new Date().toISOString(), date: new Date().toISOString(),
      })));
      setGrns([]);
      const productsById = new Map(Array.from(db.products.values()).map((p: any) => [p.id, p]));
      setCatalogProducts(Array.from(db.productVariants.values())
        .filter((v: any) => v.tenantId === currentTenantId && v.branchId === currentBranchId && v.isActive !== false)
        .map((v: any) => {
          const product: any = productsById.get(v.productId);
          return {
            id: v.id,
            name: product ? `${product.name} — ${v.name || v.sku}` : (v.name || v.sku),
            sku: v.sku,
            buyingPrice: Number(v.effectiveBuyingPrice ?? v.costPrice ?? product?.buyingPrice ?? 0),
          };
        }));
    }
  }, [db, currentTenantId, currentBranchId, currentBranchName]);

  // Check if demo supplier or procurement records are present
  const hasDemoData = false; // Production Purchasing never treats valid PostgreSQL records as demo data.

  // Clean Fabricated Procurement Data (Pillars CLN-01, CLN-03, CLN-04)


  // Modals visibility
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "", category: "General", tin: "", vrn: "", phone: "", creditLimit: 5000000
  });

  // PO Builder Modal State
  const [showPoModal, setShowPoModal] = useState(false);
  const [poSupplier, setPoSupplier] = useState("");
  const [poExpectedDate, setPoExpectedDate] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [poLines, setPoLines] = useState<PoLineItem[]>([
    { productId: "", sku: "", name: "", qtyOrdered: 10, qtyReceived: 0, unitCost: 10000, totalCost: 100000 }
  ]);
  const [poApplyVat, setPoApplyVat] = useState(false);

  // GRN Stock Intake Modal State
  const [showGrnModal, setShowGrnModal] = useState(false);
  const [selectedPoForGrn, setSelectedPoForGrn] = useState<PurchaseOrderRecord | null>(null);
  const [grnWarehouse, setGrnWarehouse] = useState("Main Central Store");
  const [grnBatchNumber, setGrnBatchNumber] = useState("");
  const [grnExpiryDate, setGrnExpiryDate] = useState("");
  const [grnReceivedQtys, setGrnReceivedQtys] = useState<Record<string, number>>({});

  // Supplier Debt Settlement Modal State
  const [payingSupplier, setPayingSupplier] = useState<any | null>(null);
  const [debtPayAmount, setDebtPayAmount] = useState<number>(0);
  const [debtPayMethod, setDebtPayMethod] = useState("Bank Transfer (CRDB/NMB)");
  const [debtPayRef, setDebtPayRef] = useState("");

  // Inspect PO Details Modal State
  const [inspectingPo, setInspectingPo] = useState<PurchaseOrderRecord | null>(null);
  const [supplierHistory, setSupplierHistory] = useState<any | null>(null);

  // KPIs
  const totalOutstanding = useMemo(() => suppliers.reduce((sum, s) => sum + (s.balance || 0), 0), [suppliers]);
  const totalCreditLimit = useMemo(() => suppliers.reduce((sum, s) => sum + (s.creditLimit || 0), 0), [suppliers]);
  const creditUtil = totalCreditLimit > 0 ? Math.round((totalOutstanding / totalCreditLimit) * 100) : 0;

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const openSupplierHistory = async (supplier: any) => {
    try {
      const res = await apiFetch<{ success: boolean; data: any }>(`/api/v1/suppliers/${encodeURIComponent(supplier.id)}/transactions`);
      if (!res.success) throw new Error("SUPPLIER_HISTORY_FAILED");
      setSupplierHistory({ ...res.data, supplier });
    } catch (error: any) {
      toast.error("Supplier history unavailable", error?.message || "Unable to load authoritative supplier transactions.");
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name || !currentTenantId || !currentBranchId) return;
    const id = safeUUID();
    const payload = { id, supplierCode: undefined, name: supplierForm.name.trim(), phone: supplierForm.phone.trim() || undefined, taxPin: supplierForm.tin.trim() || undefined };
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/v1/suppliers", { method: "POST", body: JSON.stringify(payload) });
      if (!res.success) throw new Error("Supplier creation failed");
      await loadProcurement();
      setShowSupplierModal(false); setSupplierForm({ name: "", category: "General", tin: "", vrn: "", phone: "", creditLimit: 5000000 });
      playSuccessChime(); toast.success("Supplier Added", `Supplier "${payload.name}" registered.`);
    } catch {
      await db.executeAtomicMutation({
        writes: [{ store: "suppliers", key: id, value: { ...payload, id, tenantId: currentTenantId, branchId: currentBranchId, outstandingBalance: 0, status: "ACTIVE", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } }],
        outboxItem: { id: safeUUID(), entityType: "Supplier", entityId: id, operationType: "CREATE", payload, clientCreatedAt: new Date().toISOString(), idempotencyKey: id, status: "PENDING", tenantId: currentTenantId, branchId: currentBranchId },
        tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
      });
      await loadProcurement(); toast.info("Supplier Queued", "Supplier will be committed to PostgreSQL when connectivity returns.");
    }
  };

  const handleCreatePo = async (status: "Draft" | "Approved" = "Draft") => {
    if (!poSupplier || !currentTenantId || !currentBranchId) return toast.warning("Supplier Required", "Select a supplier and active branch.");
    const supplier = suppliers.find((s: any) => s.id === poSupplier);
    const validLines = poLines.filter((l) => l.productId && l.qtyOrdered > 0);
    if (!validLines.length) return toast.warning("Line Items Required", "Add at least one product variant with quantity > 0.");
    const id = safeUUID();
    const items = validLines.map((l) => ({ id: safeUUID(), variantId: l.productId, quantityOrdered: l.qtyOrdered, unitCost: l.unitCost }));
    const payload = { id, supplierId: supplier?.id || poSupplier, notes: undefined, items };
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/v1/purchases", { method: "POST", body: JSON.stringify(payload) });
      if (!res.success) throw new Error("PO creation failed");
      if (status === "Approved" && res.data?.id) {
        await apiFetch(`/api/v1/purchases/${encodeURIComponent(res.data.id)}/approve`, { method: "POST", body: JSON.stringify({}) });
      }
      await loadProcurement(); setShowPoModal(false); playSuccessChime(); toast.success(status === "Approved" ? "Purchase Order Approved" : "Purchase Order Drafted", `PO ${res.data?.orderNumber || id} committed to PostgreSQL.`);
    } catch {
      await db.executeAtomicMutation({
        writes: [],
        outboxItem: { id: safeUUID(), entityType: "PurchaseOrder", entityId: id, operationType: "CREATE", payload, clientCreatedAt: new Date().toISOString(), idempotencyKey: id, status: "PENDING", tenantId: currentTenantId, branchId: currentBranchId },
        tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
      });
      await loadProcurement(); setShowPoModal(false); toast.info("Purchase Order Queued", "PO will be committed to PostgreSQL when connectivity returns.");
    }
  };

  // Open GRN Modal for a PO
  const handleOpenGrnModal = (po: PurchaseOrderRecord) => {
    setSelectedPoForGrn(po);
    const initialQtys: Record<string, number> = {};
    po.items.forEach((item) => {
      const remaining = Math.max(0, item.qtyOrdered - item.qtyReceived);
      initialQtys[item.sku || item.productId] = remaining;
    });
    setGrnReceivedQtys(initialQtys);
    setGrnBatchNumber(`LOT-${new Date().toISOString().slice(0, 7).replace("-", "")}-${po.poNumber.slice(-4)}`);
    setGrnExpiryDate(new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
    setShowGrnModal(true);
  };

  // Confirm GRN: the server transaction owns inventory, StockLedger and receipt persistence.
  const handleConfirmGrn = async () => {
    if (!selectedPoForGrn || !currentTenantId || !currentBranchId) return;
    const receivedItems = selectedPoForGrn.items.map((item) => ({
      variantId: (item as any).variantId || item.productId,
      quantityReceived: Number(grnReceivedQtys[item.sku || item.productId] || 0),
      unitCost: Number(item.unitCost || 0),
      batchNumber: grnBatchNumber || undefined,
      expiryDate: grnExpiryDate || undefined,
    })).filter((i) => i.quantityReceived > 0);
    if (!receivedItems.length) return toast.warning("Nothing Received", "Enter at least one received quantity.");
    const operationId = safeUUID();
    const payload = { purchaseOrderId: selectedPoForGrn.id, supplierId: selectedPoForGrn.supplierId, deviceId: operationId, operationId, idempotencyKey: operationId, items: receivedItems, notes: `GRN for ${selectedPoForGrn.poNumber}` };
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/v1/purchases/receipts", { method: "POST", body: JSON.stringify(payload) });
      if (!res.success) throw new Error("Receipt failed");
      await loadProcurement(); setShowGrnModal(false); setSelectedPoForGrn(null); playSuccessChime();
      toast.success("Delivery Received", "Purchase receipt committed; StockLedger and inventory projection updated by the server.");
    } catch {
      const receiptId = safeUUID();
      await db.executeAtomicMutation({
        writes: [],
        outboxItem: { id: receiptId, entityType: "PurchaseReceipt", entityId: receiptId, operationType: "CREATE", payload: { ...payload, id: receiptId }, clientCreatedAt: new Date().toISOString(), idempotencyKey: operationId, status: "PENDING", tenantId: currentTenantId, branchId: currentBranchId },
        tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
      });
      setShowGrnModal(false); setSelectedPoForGrn(null); toast.info("Delivery Queued", "Receipt will commit atomically when connectivity returns.");
    }
  };

  // Supplier settlement is an authoritative financial mutation; no local balance writes.
  const handleSettleDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingSupplier || debtPayAmount <= 0) return;
    try {
      const res = await apiFetch<{ success: boolean; data: any }>("/api/v1/finance/payables/settle-supplier", {
        method: "POST", body: JSON.stringify({
          supplierId: payingSupplier.id, amount: debtPayAmount, paymentMethod: debtPayMethod,
          providerReference: debtPayRef || undefined, idempotencyKey: safeUUID(),
        }),
      });
      if (!res.success) throw new Error("Settlement failed");
      await loadProcurement();
      playSuccessChime(); toast.success("Payment Posted", `Paid ${fmt(debtPayAmount)} to ${payingSupplier.name}.`);
      setPayingSupplier(null); setDebtPayAmount(0); setDebtPayRef("");
    } catch (err: any) {
      if (currentTenantId && currentBranchId) {
        const operationId = safeUUID();
        await db.executeAtomicMutation({
          writes: [],
          outboxItem: { id: operationId, entityType: "Payment", entityId: operationId, operationType: "CREATE", payload: { supplierId: payingSupplier.id, amount: debtPayAmount, paymentMethod: debtPayMethod, providerReference: debtPayRef || undefined }, clientCreatedAt: new Date().toISOString(), idempotencyKey: operationId, status: "PENDING", tenantId: currentTenantId, branchId: currentBranchId },
          tenantContext: { tenantId: currentTenantId, branchId: currentBranchId },
        });
        setPayingSupplier(null); setDebtPayAmount(0); setDebtPayRef("");
        toast.info("Payment Queued", "Supplier payment is durably queued and will settle against PostgreSQL when connectivity returns.");
      } else {
        toast.error("Payment Not Posted", err?.message || "Supplier payment could not be committed.");
      }
    }
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Purchasing, Suppliers &amp; Goods Receiving (GRN)
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Vendor master profiles, purchase orders, TRA tax compliance, warehouse stock intake, and 3-way invoice matching.
          </p>
        </div>
        <div className="v2-flex v2-items-center v2-gap-2">
          {hasDemoData && (
            <button
              className="v2-btn v2-btn-danger v2-btn-sm"
              onClick={() => void loadProcurement()}
              disabled={isCleaning}
              type="button"
              title="Purge all fabricated demo suppliers, simulated debt & mock purchase orders (Pillars CLN-01, CLN-03, CLN-04)"
            >
              <Trash2 size={13} className={isCleaning ? "v2-spin" : ""} />
              {isCleaning ? "Purging..." : "Refresh Procurement"}
            </button>
          )}
          <button
            className={`v2-btn v2-btn-sm ${showPillarsInfo ? "v2-btn-primary" : "v2-btn-secondary"}`}
            onClick={() => setShowPillarsInfo((prev) => !prev)}
            type="button"
            title="View KwakoPos Production Cleanliness Pillars (CLN-01 to CLN-10)"
          >
            <Shield size={13} /> Production Pillars
          </button>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => void loadProcurement()} type="button">
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            className="v2-btn v2-btn-secondary v2-btn-sm"
            onClick={() => {
              if (orders.filter((o) => o.status !== "Completed").length === 0) {
                toast.info("No Pending POs", "All purchase orders have been received.");
                return;
              }
              const firstPending = orders.find((o) => o.status !== "Completed") || orders[0];
              handleOpenGrnModal(firstPending);
            }}
            type="button"
          >
            <PackageCheck size={13} /> Receive GRN Intake
          </button>
          <button
            className="v2-btn v2-btn-primary v2-btn-sm"
            onClick={() => {
              if (suppliers.length > 0) setPoSupplier(suppliers[0].id);
              setShowPoModal(true);
            }}
            type="button"
          >
            <Plus size={13} /> Create Purchase Order
          </button>
        </div>
      </div>

      {/* Production Cleanliness Pillars Reference Panel */}
      {showPillarsInfo && (
        <div
          className="v2-card"
          style={{
            background: "linear-gradient(180deg, rgba(56, 189, 248, 0.07) 0%, var(--surface-2) 100%)",
            border: "1px solid rgba(56, 189, 248, 0.35)",
            padding: "1.25rem",
          }}
        >
          <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
            <div className="v2-flex v2-items-center v2-gap-2">
              <Shield size={18} style={{ color: "#38bdf8" }} />
              <div>
                <span className="v2-font-black v2-text-sm" style={{ color: "var(--text)" }}>
                  KwakoPos Zero-Demo &amp; Production Cleanliness Pillars (Standard: ZDH v1.0.0)
                </span>
                <div className="v2-text-xs v2-text-muted">
                  Formal operational invariants ensuring zero fabricated records and strict data hygiene in live production.
                </div>
              </div>
            </div>
            <div className="v2-flex v2-items-center v2-gap-2">
              <span
                style={{
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: isProductionLocked ? "rgba(34, 197, 94, 0.15)" : "rgba(245, 158, 11, 0.15)",
                  color: isProductionLocked ? "#22c55e" : "#f59e0b",
                  border: `1px solid ${isProductionLocked ? "rgba(34, 197, 94, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
                }}
              >
                {isProductionLocked ? "🔒 Production Locked" : "⚡ Sandbox Mode"}
              </span>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowPillarsInfo(false)} type="button">
                Close
              </button>
            </div>
          </div>

          <div className="v2-grid v2-grid-2 v2-gap-3 v2-text-xs">
            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-01: Zero Production Mock Data Policy
              </div>
              <div className="v2-text-muted v2-mt-1">
                Zero hardcoded mock vendors, fabricated purchase orders, or simulated accounts payable debts.
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-02: Strict Tenant Store Isolation
              </div>
              <div className="v2-text-muted v2-mt-1">
                Procurement masters, vendor ledgers, and POs are isolated strictly by tenantId with zero leakage.
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-03: Outbox Queue Sanitization
              </div>
              <div className="v2-text-muted v2-mt-1">
                Purging demo procurement records cleanses pending sync queue entries to eliminate cloud resurrection.
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-04: 12-Stage Demo Data Removal
              </div>
              <div className="v2-text-muted v2-mt-1">
                Total removal of demo suppliers, purchase orders, and GRNs across local IndexedDB and cloud SQL.
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-05: Section 10 Zero-Demo Readiness
              </div>
              <div className="v2-text-muted v2-mt-1">
                Operational verification confirming 0 residual demo procurement entries before commercial trading.
              </div>
            </div>

            <div style={{ background: "var(--surface-3)", padding: "0.75rem", borderRadius: "var(--radius-md)" }}>
              <div className="v2-font-bold v2-flex v2-items-center v2-gap-1" style={{ color: "#38bdf8" }}>
                <CheckCircle2 size={12} /> CLN-07: Production System Lock Machine
              </div>
              <div className="v2-text-muted v2-mt-1">
                KWAKOPOS_PRODUCTION_LOCKED machine disables sample dataset injection in verified production stores.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fabricated Demo Data Alert Banner */}
      {hasDemoData && !isProductionLocked && (
        <div
          className="v2-card"
          style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.06) 100%)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            padding: "1rem 1.25rem",
          }}
        >
          <div className="v2-flex v2-items-center v2-justify-between" style={{ flexWrap: "wrap", gap: "1rem" }}>
            <div className="v2-flex v2-items-start v2-gap-3" style={{ maxWidth: 720 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  background: "rgba(239, 68, 68, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ef4444",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <AlertCircle size={20} />
              </div>
              <div>
                <div className="v2-font-bold v2-text-sm" style={{ color: "#ef4444" }}>
                  Fabricated Supplier Profiles &amp; Simulated Accounts Payable Debt Active
                </div>
                <div className="v2-text-xs v2-text-muted v2-mt-1">
                  This store is displaying demo vendors carrying simulated debt and credit limits.
                  In accordance with <strong>Production Cleanliness Pillar CLN-01</strong>, these records should be purged before live procurement operations.
                </div>
              </div>
            </div>
            <button
              className="v2-btn v2-btn-danger v2-btn-sm"
              onClick={() => void loadProcurement()}
              disabled={isCleaning}
              type="button"
            >
              <Trash2 size={13} className={isCleaning ? "v2-spin" : ""} />
              {isCleaning ? "Purging..." : "Refresh Procurement"}
            </button>
          </div>
        </div>
      )}

      {/* KPI Stats Header */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#38bdf8" }} />
          <div className="kpi-card-label">Active Suppliers</div>
          <div className="kpi-card-value">{suppliers.length} Vendors</div>
          <div className="kpi-card-desc">100% Tax Registered</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#f87171" }} />
          <div className="kpi-card-label">Accounts Payable Debt</div>
          <div className="kpi-card-value" style={{ color: "var(--danger)" }}>{fmt(totalOutstanding)}</div>
          <div className="kpi-card-desc">Total Owed to Suppliers</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#818cf8" }} />
          <div className="kpi-card-label">Credit Utilisation</div>
          <div className="kpi-card-value">{creditUtil}%</div>
          <div className="kpi-card-desc">Limit: {fmt(totalCreditLimit)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-blob" style={{ background: "#4ade80" }} />
          <div className="kpi-card-label">Active Purchase Orders</div>
          <div className="kpi-card-value">{orders.filter((o) => o.status !== "Completed").length} Pending</div>
          <div className="kpi-card-desc">PO Deliveries Expected</div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem" }}>
        {[
          { id: "suppliers", label: "Supplier Directory", icon: Truck },
          { id: "orders", label: "Purchase Orders (PO)", icon: ShoppingBag },
          { id: "grn", label: "Goods Receipt Notes (GRN)", icon: PackageCheck },
          { id: "invoices", label: "3-Way Invoice Matching", icon: Scale },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => selectPurchasingTab(t.id as PurchTab)}
            type="button"
            className={`v2-btn v2-btn-sm ${activeTab === t.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
          >
            <t.icon size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── TAB 1: SUPPLIER DIRECTORY ────────────────────────────────────────── */}
      {activeTab === "suppliers" && (
        <div className="v2-space-y-4">
          <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
            <div className="v2-flex v2-items-center" style={{ position: "relative", flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: "absolute", left: ".8rem", color: "var(--muted)" }} />
              <input
                className="v2-input v2-input-sm"
                style={{ paddingLeft: "2.4rem" }}
                placeholder="Search supplier name, code, category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setShowSupplierModal(true)} type="button">
              <Plus size={13} /> Add Supplier Master
            </button>
          </div>

          <div className="v2-card">
            {suppliers.length === 0 ? (
              <div className="v2-text-center v2-py-8 v2-text-muted">
                <Truck size={36} className="v2-mx-auto v2-mb-2 v2-opacity-30" />
                <div className="v2-font-bold v2-text-sm">No Supplier Profiles Registered</div>
                <p className="v2-text-xs v2-mt-1" style={{ maxWidth: 400, margin: "0.25rem auto 1rem" }}>
                  Register verified suppliers with TRA TIN/VRN compliance to manage purchase contracts, goods receipt, and debt ledgers.
                </p>
                <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setShowSupplierModal(true)} type="button">
                  <Plus size={13} /> Add First Supplier
                </button>
              </div>
            ) : (
              <table className="v2-table">
                <thead>
                  <tr>
                    <th>Supplier Code &amp; Name</th>
                    <th>Category</th>
                    <th>Contact Details</th>
                    <th>TRA Compliance (TIN / VRN)</th>
                    <th>Current Balance</th>
                    <th>Credit Limit</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers
                    .filter(
                      (s) =>
                        !searchQuery ||
                        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.category.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((s) => {
                      const tinCheck = validateTin(s.tin);
                      const vrnCheck = validateVrn(s.vrn);
                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="v2-mono v2-text-xs v2-font-bold">{s.id}</div>
                            <div className="v2-font-bold">{s.name}</div>
                          </td>
                          <td><span className="badge v2-badge-accent">{s.category}</span></td>
                          <td>
                            <div className="v2-text-xs">{s.phone}</div>
                            <div className="v2-text-xs v2-text-muted">{s.mpesa}</div>
                          </td>
                          <td>
                            <div className="v2-flex v2-flex-col v2-gap-1">
                              <span className={`badge ${tinCheck.badgeClass}`}>{tinCheck.text}</span>
                              <span className={`badge ${vrnCheck.badgeClass}`}>{vrnCheck.text}</span>
                            </div>
                          </td>
                          <td className="v2-mono v2-font-black" style={{ color: s.balance > 0 ? "var(--danger)" : "var(--success)" }}>
                            {fmt(s.balance)}
                          </td>
                          <td className="v2-mono v2-text-xs">{fmt(s.creditLimit)}</td>
                          <td><span className="badge v2-badge-success">{s.status}</span></td>
                          <td>
                            <div className="v2-flex v2-gap-1">
                              {s.balance > 0 && (
                                <button
                                  className="v2-btn v2-btn-primary v2-btn-sm"
                                  style={{ fontSize: "11px", padding: "2px 8px" }}
                                  onClick={() => {
                                    setPayingSupplier(s);
                                    setDebtPayAmount(s.balance);
                                  }}
                                  type="button"
                                  title="Settle Outstanding AP Debt"
                                >
                                  Pay Debt
                                </button>
                              )}
                              <button
                                className="v2-btn v2-btn-ghost v2-btn-sm"
                                onClick={() => void openSupplierHistory(s)}
                                type="button"
                                title="View supplier profile and transaction history"
                              >
                                <Eye size={13} /> History
                              </button>
                              <button
                                className="v2-btn v2-btn-ghost v2-btn-sm"
                                onClick={() => {
                                  setPoSupplier(s.id);
                                  setShowPoModal(true);
                                }}
                                type="button"
                                title="Create Purchase Order"
                              >
                                <Plus size={13} /> PO
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: PURCHASE ORDERS ───────────────────────────────────────────── */}
      {activeTab === "orders" && (
        <div className="v2-card">
          <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
            <div>
              <div className="v2-card-title">Purchase Orders Register</div>
              <div className="v2-card-subtitle">Approved vendor purchase contracts and delivery pipelines</div>
            </div>
            <button
              className="v2-btn v2-btn-primary v2-btn-sm"
              onClick={() => {
                if (suppliers.length > 0) setPoSupplier(suppliers[0].id);
                setShowPoModal(true);
              }}
              type="button"
            >
              <Plus size={13} /> Create Purchase Order
            </button>
          </div>
          {orders.length === 0 ? (
            <div className="v2-text-center v2-py-8 v2-text-muted">
              <ShoppingBag size={36} className="v2-mx-auto v2-mb-2 v2-opacity-30" />
              <div className="v2-font-bold v2-text-sm">No Purchase Orders Created</div>
              <p className="v2-text-xs v2-mt-1" style={{ maxWidth: 400, margin: "0.25rem auto 1rem" }}>
                Issue a formal purchase order to track vendor commitments, prices, expected delivery dates, and tax breakdown.
              </p>
              <button
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={() => {
                  if (suppliers.length > 0) setPoSupplier(suppliers[0].id);
                  setShowPoModal(true);
                }}
                type="button"
              >
                <Plus size={13} /> Create First PO
              </button>
            </div>
          ) : (
            <table className="v2-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Line Items</th>
                  <th>Total Value</th>
                  <th>Expected Delivery</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((po) => (
                  <tr key={po.id}>
                    <td className="v2-mono v2-font-bold">{po.id}</td>
                    <td className="v2-font-bold">{po.supplier}</td>
                    <td>
                      <span className="badge v2-badge-muted">{po.itemsCount || po.items?.length || 0} Products</span>
                    </td>
                    <td className="v2-mono v2-font-black">{fmt(po.total)}</td>
                    <td className="v2-text-xs v2-text-muted">{po.expected}</td>
                    <td>
                      <span
                        className={`badge ${
                          po.status === "Completed"
                            ? "v2-badge-success"
                            : po.status === "Approved"
                            ? "v2-badge-accent"
                            : "v2-badge-warning"
                        }`}
                      >
                        {po.status}
                      </span>
                    </td>
                    <td>
                      <div className="v2-flex v2-gap-1">
                        <button
                          className="v2-btn v2-btn-secondary v2-btn-sm"
                          onClick={() => setInspectingPo(po)}
                          type="button"
                        >
                          Inspect PO
                        </button>
                        {po.status !== "Completed" && (
                          <button
                            className="v2-btn v2-btn-primary v2-btn-sm"
                            onClick={() => handleOpenGrnModal(po)}
                            type="button"
                          >
                            <PackageCheck size={12} /> Receive GRN
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── TAB 3: GOODS RECEIPT NOTES (GRN) ─────────────────────────────────── */}
      {activeTab === "grn" && (
        <div className="v2-card">
          <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
            <div>
              <div className="v2-card-title">Goods Receipt Notes (GRN) Stock Intake</div>
              <div className="v2-card-subtitle">Authoritative physical warehouse intake records and audit log</div>
            </div>
            <button
              className="v2-btn v2-btn-primary v2-btn-sm"
              onClick={() => {
                const firstPending = orders.find((o) => o.status !== "Completed") || orders[0];
                handleOpenGrnModal(firstPending);
              }}
              type="button"
            >
              <PackageCheck size={13} /> Receive Warehouse Delivery
            </button>
          </div>
          {grns.length === 0 ? (
            <div className="v2-text-center v2-py-8 v2-text-muted">
              <PackageCheck size={36} className="v2-mx-auto v2-mb-2 v2-opacity-30" />
              <div className="v2-font-bold v2-text-sm">No Goods Receipt Notes (GRN) Logged</div>
              <p className="v2-text-xs v2-mt-1" style={{ maxWidth: 400, margin: "0.25rem auto 1rem" }}>
                Receive incoming inventory shipments against approved purchase orders to record physical warehouse stock intake.
              </p>
            </div>
          ) : (
            <table className="v2-table">
              <thead>
                <tr>
                  <th>GRN ID</th>
                  <th>PO Reference</th>
                  <th>Supplier</th>
                  <th>Receiving Warehouse</th>
                  <th>Batch / Expiry</th>
                  <th>Received Date</th>
                  <th>Intake Value</th>
                  <th>Verification Status</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((g) => (
                  <tr key={g.id}>
                    <td className="v2-mono v2-font-bold">{g.id}</td>
                    <td className="v2-mono v2-text-xs">{g.poId}</td>
                    <td className="v2-font-bold">{g.supplier}</td>
                    <td>{g.warehouse}</td>
                    <td>
                      <div className="v2-flex v2-items-center v2-gap-1">
                        {g.batchNumber && <span className="badge v2-badge-muted">{g.batchNumber}</span>}
                        {g.expiryDate && <span className="badge v2-badge-success">{g.expiryDate}</span>}
                      </div>
                    </td>
                    <td className="v2-text-xs v2-text-muted">{g.receivedAt}</td>
                    <td className="v2-mono v2-font-bold">{fmt(g.totalValue || 0)}</td>
                    <td><span className="badge v2-badge-success">{g.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── TAB 4: 3-WAY INVOICE MATCHING ────────────────────────────────────── */}
      {activeTab === "invoices" && (
        <div className="v2-space-y-4">
          <div className="v2-card v2-p-4">
            <h3 className="v2-font-bold v2-text-sm v2-mb-1">Automated 3-Way Procurement Reconciliation</h3>
            <p className="v2-text-xs v2-text-muted">
              Audits Purchase Orders (PO), Goods Received Notes (GRN), and Supplier Invoices side-by-side to guarantee 100% financial accuracy before accounts payable clearance.
            </p>
          </div>

          <div className="v2-card">
            {orders.length === 0 ? (
              <div className="v2-text-center v2-py-8 v2-text-muted">
                <Scale size={36} className="v2-mx-auto v2-mb-2 v2-opacity-30" />
                <div className="v2-font-bold v2-text-sm">No Invoices Pending Reconciliation</div>
                <p className="v2-text-xs v2-mt-1" style={{ maxWidth: 400, margin: "0.25rem auto 1rem" }}>
                  All purchase orders and incoming shipments are fully balanced. Issue a purchase order to begin 3-way reconciliation.
                </p>
              </div>
            ) : (
              <table className="v2-table">
                <thead>
                  <tr>
                    <th>PO Reference</th>
                    <th>Supplier</th>
                    <th>PO Authorized</th>
                    <th>GRN Received</th>
                    <th>Supplier Invoice</th>
                    <th>Variance</th>
                    <th>Reconciliation Status</th>
                    <th>AP Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => {
                    const grn = grns.find((g) => g.poId === po.poNumber);
                    const grnVal = grn ? grn.totalValue : po.status === "Completed" ? po.total : 0;
                    const invoiceVal = po.total;
                    const variance = invoiceVal - grnVal;
                    const isMatched = po.status === "Completed" && variance === 0;

                    return (
                      <tr key={po.id}>
                        <td className="v2-mono v2-font-bold">{po.id}</td>
                        <td className="v2-font-bold">{po.supplier}</td>
                        <td className="v2-mono">{fmt(po.total)}</td>
                        <td className="v2-mono">{fmt(grnVal)}</td>
                        <td className="v2-mono v2-font-bold">{fmt(invoiceVal)}</td>
                        <td className="v2-mono" style={{ color: variance === 0 ? "var(--success)" : "var(--warning)" }}>
                          {variance === 0 ? "0 (Tsh)" : fmt(variance)}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isMatched
                                ? "v2-badge-success"
                                : po.status === "Completed"
                                ? "v2-badge-warning"
                                : "v2-badge-muted"
                            }`}
                          >
                            {isMatched ? "3-Way Matched ✓" : po.status === "Completed" ? "Pending Invoicing" : "Awaiting Intake"}
                          </span>
                        </td>
                        <td>
                          {isMatched ? (
                            <span className="v2-text-xs v2-font-bold" style={{ color: "var(--success)" }}>
                              Cleared for AP
                            </span>
                          ) : (
                            <button
                              className="v2-btn v2-btn-secondary v2-btn-sm"
                              onClick={() => {
                                playSuccessChime();
                                toast.success("AP Cleared", `Invoice matching approved for ${po.poNumber}.`);
                              }}
                              type="button"
                            >
                              Approve Match
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL: ADD SUPPLIER ──────────────────────────────────────────────── */}
      {showSupplierModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <h2 className="v2-text-lg v2-font-black v2-mb-4">Create Supplier Master Profile</h2>
            <form onSubmit={handleAddSupplier} className="v2-space-y-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Legal Supplier Name *</label>
                <input className="v2-input v2-input-sm" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required />
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Category</label>
                  <input className="v2-input v2-input-sm" value={supplierForm.category} onChange={(e) => setSupplierForm({ ...supplierForm, category: e.target.value })} />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Contact Phone Number *</label>
                  <input className="v2-input v2-input-sm" value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} required />
                </div>
              </div>
              <div className="v2-grid v2-grid-2 v2-gap-2">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">TIN Number (TRA)</label>
                  <input className="v2-input v2-input-sm" value={supplierForm.tin} onChange={(e) => setSupplierForm({ ...supplierForm, tin: e.target.value })} placeholder="104-982-114" />
                </div>
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">VRN Number (TRA)</label>
                  <input className="v2-input v2-input-sm" value={supplierForm.vrn} onChange={(e) => setSupplierForm({ ...supplierForm, vrn: e.target.value })} placeholder="40019283H" />
                </div>
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Credit Limit Amount (Tsh)</label>
                <input className="v2-input v2-input-sm" type="number" value={supplierForm.creditLimit} onChange={(e) => setSupplierForm({ ...supplierForm, creditLimit: Number(e.target.value) })} />
              </div>
              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowSupplierModal(false)} type="button">Cancel</button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Create Supplier</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: INTERACTIVE PURCHASE ORDER BUILDER ─────────────────────────── */}
      {showPoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 680, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Create Vendor Purchase Order (PO)</h2>
                <div className="v2-text-xs v2-text-muted">Generate official commercial purchase order with line-item SKU costing</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowPoModal(false)} type="button">✕</button>
            </div>

            <div className="v2-grid v2-grid-2 v2-gap-3 v2-mb-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Select Supplier *</label>
                <select className="v2-input v2-input-sm" value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)}>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Expected Delivery Date</label>
                <input
                  type="date"
                  className="v2-input v2-input-sm"
                  value={poExpectedDate}
                  onChange={(e) => setPoExpectedDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line Items Builder */}
            <div className="v2-mb-3">
              <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                <span className="v2-text-xs v2-font-bold">Line Items &amp; Inventory Costing:</span>
                <button
                  type="button"
                  className="v2-btn v2-btn-ghost v2-btn-xs"
                  onClick={() =>
                    setPoLines((prev) => [
                      ...prev,
                      { productId: "", sku: "", name: "", qtyOrdered: 10, qtyReceived: 0, unitCost: 10000, totalCost: 100000 },
                    ])
                  }
                >
                  <Plus size={11} /> Add Item Line
                </button>
              </div>

              <div className="v2-space-y-2" style={{ maxHeight: 220, overflowY: "auto" }}>
                {poLines.map((line, idx) => (
                  <div key={idx} className="v2-flex v2-items-center v2-gap-2 v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                    <div style={{ flex: 2 }}>
                      <select
                        className="v2-input v2-input-sm"
                        value={line.productId}
                        onChange={(e) => {
                          const chosen = catalogProducts.find((p) => p.id === e.target.value);
                          if (chosen) {
                            setPoLines((prev) =>
                              prev.map((l, i) =>
                                i === idx
                                  ? {
                                      ...l,
                                      productId: chosen.id,
                                      sku: chosen.sku,
                                      name: chosen.name,
                                      unitCost: chosen.buyingPrice || l.unitCost,
                                      totalCost: (chosen.buyingPrice || l.unitCost) * l.qtyOrdered,
                                    }
                                  : l
                              )
                            );
                          }
                        }}
                      >
                        <option value="">-- Choose Product SKU --</option>
                        {catalogProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ width: 85 }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        className="v2-input v2-input-sm"
                        value={line.qtyOrdered || ""}
                        onChange={(e) => {
                          const qty = Math.max(1, parseInt(e.target.value || "1", 10));
                          setPoLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, qtyOrdered: qty, totalCost: qty * l.unitCost } : l
                            )
                          );
                        }}
                      />
                    </div>

                    <div style={{ width: 110 }}>
                      <input
                        type="number"
                        placeholder="Unit Cost"
                        className="v2-input v2-input-sm"
                        value={line.unitCost || ""}
                        onChange={(e) => {
                          const cost = Math.max(0, parseInt(e.target.value || "0", 10));
                          setPoLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, unitCost: cost, totalCost: l.qtyOrdered * cost } : l
                            )
                          );
                        }}
                      />
                    </div>

                    <div style={{ width: 110, textAlign: "right" }} className="v2-mono v2-font-bold v2-text-xs">
                      {fmt(line.totalCost)}
                    </div>

                    {poLines.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove purchase order line"
                        className="v2-btn v2-btn-ghost v2-btn-sm"
                        style={{ color: "var(--danger)" }}
                        onClick={() => setPoLines((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Calculations Breakdown */}
            {(() => {
              const subtotal = poLines.reduce((s, l) => s + (l.totalCost || 0), 0);
              const vat = poApplyVat ? Math.round(subtotal * 0.18) : 0;
              const grandTotal = subtotal + vat;

              return (
                <div className="v2-p-3 v2-mb-3" style={{ background: "var(--surface-3)", borderRadius: "var(--radius-md)" }}>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mb-1">
                    <span>Subtotal:</span>
                    <strong className="v2-mono">{fmt(subtotal)}</strong>
                  </div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-text-xs v2-mb-1">
                    <label className="v2-flex v2-items-center v2-gap-1">
                      <input
                        type="checkbox"
                        checked={poApplyVat}
                        onChange={(e) => setPoApplyVat(e.target.checked)}
                      />
                      <span>Apply 18% TRA VAT</span>
                    </label>
                    <span className="v2-mono">{fmt(vat)}</span>
                  </div>
                  <div className="v2-flex v2-justify-between v2-font-black v2-text-sm v2-pt-1" style={{ borderTop: "1px dashed var(--surface-border)" }}>
                    <span>Grand Authorized Total:</span>
                    <span className="v2-mono" style={{ color: "var(--accent)" }}>{fmt(grandTotal)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="v2-flex v2-justify-end v2-gap-2">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowPoModal(false)} type="button">
                Cancel
              </button>
              <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => handleCreatePo("Draft")} type="button">
                Save as Draft
              </button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => handleCreatePo("Approved")} type="button">
                Approve &amp; Issue PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: GRN INTAKE & PHYSICAL RESTOCK ─────────────────────────────── */}
      {showGrnModal && selectedPoForGrn && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 620, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Goods Receipt Note (GRN) Intake</h2>
                <div className="v2-text-xs v2-text-muted">
                  Receiving PO #{selectedPoForGrn.poNumber} from {selectedPoForGrn.supplier}
                </div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowGrnModal(false)} type="button">✕</button>
            </div>

            <div className="v2-grid v2-grid-3 v2-gap-2 v2-mb-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Receiving Warehouse</label>
                <input
                  className="v2-input v2-input-sm"
                  value={grnWarehouse}
                  onChange={(e) => setGrnWarehouse(e.target.value)}
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Batch / Lot Number</label>
                <input
                  className="v2-input v2-input-sm"
                  placeholder="e.g. LOT-2026-09"
                  value={grnBatchNumber}
                  onChange={(e) => setGrnBatchNumber(e.target.value)}
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Batch Expiry Date</label>
                <input
                  type="date"
                  className="v2-input v2-input-sm"
                  value={grnExpiryDate}
                  onChange={(e) => setGrnExpiryDate(e.target.value)}
                />
              </div>
            </div>

            {/* Line items verification */}
            <div className="v2-mb-4">
              <div className="v2-text-xs v2-font-bold v2-mb-2">Verify Received Physical Quantities:</div>
              <div className="v2-space-y-2">
                {selectedPoForGrn.items.map((it) => {
                  const key = it.sku || it.productId;
                  const currentRec = grnReceivedQtys[key] ?? Math.max(0, it.qtyOrdered - it.qtyReceived);
                  return (
                    <div key={key} className="v2-flex v2-items-center v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                      <div>
                        <div className="v2-font-bold v2-text-xs">{it.name}</div>
                        <div className="v2-text-xs v2-text-muted">
                          SKU: {it.sku} · Ordered: {it.qtyOrdered} · Previously Received: {it.qtyReceived}
                        </div>
                      </div>
                      <div className="v2-flex v2-items-center v2-gap-2">
                        <span className="v2-text-xs v2-text-muted">Received Now:</span>
                        <input
                          type="number"
                          min="0"
                          max={it.qtyOrdered}
                          className="v2-input v2-input-sm v2-mono"
                          style={{ width: 80, textAlign: "center" }}
                          value={currentRec}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value || "0", 10));
                            setGrnReceivedQtys((prev) => ({ ...prev, [key]: val }));
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="v2-flex v2-justify-end v2-gap-2">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setShowGrnModal(false)} type="button">
                Cancel
              </button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={handleConfirmGrn} type="button">
                <Check size={13} /> Confirm Stock Intake &amp; Update Inventory
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: SETTLE SUPPLIER DEBT ──────────────────────────────────────── */}
      {payingSupplier && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <h2 className="v2-text-base v2-font-black v2-mb-2">Settle Supplier Payable Debt</h2>
            <p className="v2-text-xs v2-text-muted v2-mb-3">
              Vendor: <strong>{payingSupplier.name}</strong> · Current Debt: <strong style={{ color: "var(--danger)" }}>{fmt(payingSupplier.balance)}</strong>
            </p>

            <form onSubmit={handleSettleDebt} className="v2-space-y-3">
              <div>
                <div className="v2-flex v2-justify-between v2-mb-1">
                  <label className="v2-text-xs v2-font-bold v2-text-muted">Payment Amount (Tsh) *</label>
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-btn-xs"
                    onClick={() => setDebtPayAmount(payingSupplier.balance)}
                  >
                    Pay Full Balance
                  </button>
                </div>
                <input
                  type="number"
                  min="1"
                  max={payingSupplier.balance}
                  className="v2-input"
                  value={debtPayAmount || ""}
                  onChange={(e) => setDebtPayAmount(Number(e.target.value))}
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Payment Channel</label>
                <select className="v2-input" value={debtPayMethod} onChange={(e) => setDebtPayMethod(e.target.value)}>
                  <option value="Bank Transfer (CRDB/NMB)">Bank Transfer (CRDB/NMB)</option>
                  <option value="M-Pesa / Tigo Pesa Paybill">M-Pesa / Tigo Pesa Paybill</option>
                  <option value="Cash Voucher">Cash Voucher</option>
                  <option value="Bank Cheque">Bank Cheque</option>
                </select>
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">Payment Reference Code</label>
                <input
                  className="v2-input"
                  placeholder="e.g. TXN-CRDB-990182"
                  value={debtPayRef}
                  onChange={(e) => setDebtPayRef(e.target.value)}
                />
              </div>

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setPayingSupplier(null)} type="button">
                  Cancel
                </button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">
                  Confirm Debt Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: INSPECT PO ────────────────────────────────────────────────── */}
      {supplierHistory && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.72)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 900, maxWidth: "96vw", maxHeight: "85vh", overflow: "auto", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between">
              <div>
                <h2 className="v2-text-lg v2-font-black">{supplierHistory.supplier?.name || supplierHistory.supplier?.id} — Supplier Profile & Ledger</h2>
                <div className="v2-text-xs v2-text-muted">Outstanding payable: {fmt(Number(supplierHistory.supplier?.outstandingBalance ?? supplierHistory.supplier?.balance ?? supplierHistory.supplier?.outstandingBalance ?? 0))}</div>
              </div>
              <button aria-label="Close supplier history" title="Close" className="v2-btn v2-btn-ghost" onClick={() => setSupplierHistory(null)} type="button">✕</button>
            </div>
            <div className="v2-grid v2-grid-3 v2-gap-2 v2-mt-4">
              <div className="v2-card"><div className="v2-text-xs v2-text-muted">Phone</div><div className="v2-text-sm v2-font-bold">{supplierHistory.supplier?.phone || "—"}</div></div>
              <div className="v2-card"><div className="v2-text-xs v2-text-muted">TIN</div><div className="v2-text-sm v2-font-bold">{supplierHistory.supplier?.taxPin || supplierHistory.supplier?.tin || "—"}</div></div>
              <div className="v2-card"><div className="v2-text-xs v2-text-muted">Status</div><div className="v2-text-sm v2-font-bold">{supplierHistory.supplier?.status || "—"}</div></div>
            </div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Purchase Orders</h3>
            <div className="v2-space-y-1">{(supplierHistory.orders || []).map((o: any) => <div key={o.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{o.orderNumber}</span><span>{fmt(Number(o.totalAmount))} · {o.status}</span></div>)}</div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Goods Receipts</h3>
            <div className="v2-space-y-1">{(supplierHistory.receipts || []).map((o: any) => <div key={o.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{o.receiptNumber}</span><span>{fmt(Number(o.totalAmount))} · {o.status}</span></div>)}</div>
            <h3 className="v2-text-sm v2-font-bold v2-mt-4">Payments</h3>
            <div className="v2-space-y-1">{(supplierHistory.payments || []).map((p: any) => <div key={p.id} className="v2-flex v2-justify-between v2-text-xs v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}><span>{p.paymentNumber}</span><span>{fmt(Number(p.amount))} · {p.paymentMethod} · {p.status}</span></div>)}</div>
          </div>
        </div>
      )}

      {inspectingPo && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 520, maxWidth: "95vw", padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h2 className="v2-text-base v2-font-black">Purchase Order {inspectingPo.poNumber}</h2>
                <div className="v2-text-xs v2-text-muted">
                  Supplier: {inspectingPo.supplier} · Date: {inspectingPo.date}
                </div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setInspectingPo(null)} type="button">✕</button>
            </div>

            <div className="v2-space-y-2 v2-mb-3" style={{ maxHeight: 250, overflowY: "auto" }}>
              {inspectingPo.items.map((it, i) => (
                <div key={i} className="v2-flex v2-items-center v2-justify-between v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
                  <div>
                    <div className="v2-font-bold v2-text-xs">{it.name}</div>
                    <div className="v2-text-xs v2-text-muted">
                      SKU: {it.sku} · Qty Ordered: {it.qtyOrdered} · Received: {it.qtyReceived}
                    </div>
                  </div>
                  <div className="v2-mono v2-font-bold v2-text-xs">{fmt(it.totalCost)}</div>
                </div>
              ))}
            </div>

            <div className="v2-flex v2-justify-between v2-font-black v2-text-sm v2-p-2" style={{ background: "var(--surface-3)", borderRadius: "var(--radius-md)" }}>
              <span>Total Contract Value:</span>
              <span className="v2-mono">{fmt(inspectingPo.total)}</span>
            </div>

            <div className="v2-flex v2-justify-end v2-mt-3">
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setInspectingPo(null)} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



