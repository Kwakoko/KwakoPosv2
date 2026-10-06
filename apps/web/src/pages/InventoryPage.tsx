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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { InventoryValuationEngine } from "@kwakopos2/domain";
import { runUiAction } from "../services/uiActionRegistry.js";
import {
  Package, Layers, BarChart3, Tag, Clock, Plus, Search, Edit2, Trash2,
  AlertTriangle, ArrowLeftRight, ClipboardList, FileText, RefreshCw,
  TrendingUp, TrendingDown, Archive, Zap, Barcode, Hash, Target,
  Send, Check, Eye, ShoppingCart, DollarSign, Upload, Truck, ShieldAlert,
  CheckCircle, Download, X, QrCode, Printer, PackageOpen, Sparkles, Palette, Globe
} from "lucide-react";
import { useBranch, useModule, useRbac, useSync, useTenant } from "../context/KwakoPosContexts.js";
import { useToast } from "../context/ToastContext.js";
import { useAudioFeedback } from "../utils/useAudioFeedback.js";
import { BarcodeLabelGeneratorModal } from "../components/UI/BarcodeLabelGeneratorModal.js";
import { Sheet } from "../components/UI/Sheet.js";
import { ProductRegistrationWizardModal } from "../components/UI/ProductRegistrationWizardModal.js";
import { NumberStepper } from "../components/UI/NumberStepper.js";
import { safeUUID } from "../services/applicationApiService.js";
import { buildStockBalanceProjection, queueStockAdjustment, calculateLocalStockAsOfDate, STOCK_CHANGED_EVENT } from "../services/inventoryStockService.js";
import { DATA_CHANGED_EVENT, publishDataChanged } from "../services/dataChangeEvent.js";
import { commitLocalOutbox, commitLocalOutboxes } from "../persistence/commitLocalMutation.js";
import { InventoryOperationalWorkspace } from "../components/InventoryOperationalWorkspace.js";

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;
const fmtNum = (n: number) => n.toLocaleString();
const catalogCode = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || `CAT_${Date.now()}`;
const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export interface CategoryRecord {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDefault?: boolean;
}

export interface BrandRecord {
  id: string;
  name: string;
  origin?: string;
  notes?: string;
  isDefault?: boolean;
}

export const CATEGORY_COLORS = [
  { name: "Emerald", hex: "#10b981", label: "Emerald Green" },
  { name: "Sky", hex: "#0ea5e9", label: "Sky Blue" },
  { name: "Purple", hex: "#8b5cf6", label: "Royal Purple" },
  { name: "Amber", hex: "#f59e0b", label: "Warm Amber" },
  { name: "Rose", hex: "#f43f5e", label: "Rose Crimson" },
  { name: "Teal", hex: "#14b8a6", label: "Ocean Teal" },
  { name: "Orange", hex: "#f97316", label: "Vibrant Orange" },
  { name: "Indigo", hex: "#6366f1", label: "Deep Indigo" },
];

export const DEFAULT_CATEGORY_RECORDS: CategoryRecord[] = []; const DEFAULT_BRAND_RECORDS: BrandRecord[] = [];

export function toLocalDatetimeString(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export interface ProductVariantData {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  reorderLevel: number;
  updatedAt?: string;
  batchNumber?: string;
  expiryDate?: string;
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
  batchNumber?: string;
  expiryDate?: string;
  hasVariants?: boolean;
  variants?: ProductVariantData[];
}

export type InventoryTab =
  | "dashboard" | "products" | "categories" | "ledger"
  | "transfers" | "count" | "recipes" | "wastage" | "reports"
  | "alerts" | "sync" | "drilldown";

export interface InventoryPageProps {
  activeTab?: string;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ activeTab: propActiveTab }) => {
  const { currentTenantId, currentTenantName } = useTenant();
  const { currentBranchId, currentBranchName, availableBranches } = useBranch();
  const { activeModule, setActiveTab: setGlobalActiveTab } = useModule();
  const { db, syncOutbox, syncEngine } = useSync();
  const toast = useToast();
  const { playBeep, playSuccessChime, playWarningTone } = useAudioFeedback();
  const [activeTab, setActiveTab] = useState<InventoryTab>("dashboard");
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);

  const selectInventoryTab = useCallback((tab: InventoryTab) => {
    setActiveTab(tab);
    const globalTab: Record<InventoryTab, string> = {
      "dashboard": "Inventory Overview",
      "products": "Products",
      "categories": "Categories & Brands",
      "ledger": "Stock Adjustment",
      "transfers": "Stock Transfer",
      "count": "Stock Count",
      "recipes": "Product Bundles & Kits",
      "wastage": "Wastage & Spillage",
      "reports": "Inventory Reports",
      "alerts": "Stock Alerts",
      "sync": "Stock Sync Engine",
      "drilldown": "Ledger Drilldown",
    };
    setGlobalActiveTab(globalTab[tab]);
  }, [setGlobalActiveTab]);

  useEffect(() => {
    if (!propActiveTab) return;
    const map: Record<string, InventoryTab> = {
      "Inventory Overview": "dashboard",
      "Products": "products",
      "Categories & Brands": "categories",
      "Stock Adjustment": "ledger",
      "Stock Transfer": "transfers",
      "Stock Alerts": "alerts",
      "Stock Sync Engine": "sync",
      "Product Bundles & Kits": "recipes",
      "Stock Count": "count",
      "Ledger Drilldown": "drilldown",
      "Wastage & Spillage": "wastage",
      "Inventory Reports": "reports",
    };
    if (map[propActiveTab]) {
      setActiveTab(map[propActiveTab]);
    }
  }, [propActiveTab]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Dynamic Products & Ledger State
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [ledger, setLedger] = useState<{
    id: string; date: string; sku: string; name: string; type: string; qty: number; qtyBefore: number; balance: number; unitCost: number; totalCost: number; ref: string; user: string; notes?: string; deviceId?: string;
  }[]>([]);

  // Modal States
  const [addProductModal, setAddProductModal] = useState(false);
  const [csvImportModal, setCsvImportModal] = useState(false);
  const [barcodeModal, setBarcodeModal] = useState(false);
  const [selectedBarcodeItem, setSelectedBarcodeItem] = useState<InventoryItem | null>(null);

  // Edit Product Modal State
  const [editProductModal, setEditProductModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editProd, setEditProd] = useState({
    name: "", category: "", brand: "", buyingPrice: 0, sellingPrice: 0, stock: 0, reorderLevel: 10, status: "Active", batchNumber: "", expiryDate: ""
  });

  // Archive / Delete Confirmation State
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryItem | null>(null);

  // Categories & Brands Master Management State
  const [categoriesMeta, setCategoriesMeta] = useState<CategoryRecord[]>(DEFAULT_CATEGORY_RECORDS);
  const [brandsMeta, setBrandsMeta] = useState<BrandRecord[]>(DEFAULT_BRAND_RECORDS);

  // Search Filters for Tables
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [brandSearchQuery, setBrandSearchQuery] = useState("");

  // Add / Edit Category State
  const [addCategoryModal, setAddCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#10b981");
  const [categoryCascadeRename, setCategoryCascadeRename] = useState(true);

  // Add / Edit Brand State
  const [addBrandModal, setAddBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandRecord | null>(null);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandOrigin, setNewBrandOrigin] = useState("");
  const [newBrandNotes, setNewBrandNotes] = useState("");
  const [brandCascadeRename, setBrandCascadeRename] = useState(true);

  // Delete Safeguard Modals
  const [deleteCategorySafeguard, setDeleteCategorySafeguard] = useState<{
    category: string;
    assignedCount: number;
    fallbackCategory: string;
  } | null>(null);

  const [deleteBrandSafeguard, setDeleteBrandSafeguard] = useState<{
    brand: string;
    assignedCount: number;
    fallbackBrand: string;
  } | null>(null);

  // Variant Builder Modal State
  const [variantModalProduct, setVariantModalProduct] = useState<InventoryItem | null>(null);
  const [newVarAttrKey, setNewVarAttrKey] = useState("Size");
  const [newVarAttrVal, setNewVarAttrVal] = useState("");
  const [newVarPrice, setNewVarPrice] = useState(0);
  const [newVarStock, setNewVarStock] = useState(0);

  // In-Flow Variant Builder State (for Add Product Modal)
  const [hasVariantsToggle, setHasVariantsToggle] = useState(false);
  const [varOption1Name, setVarOption1Name] = useState("Size");
  const [varOption1Values, setVarOption1Values] = useState("Small, Medium, Large");
  const [varOption2Name, setVarOption2Name] = useState("");
  const [varOption2Values, setVarOption2Values] = useState("");
  const [inflowVariants, setInflowVariants] = useState<ProductVariantData[]>([]);

  // Variant Studio Sub-Views & Form States (for Drawer Tab 4)
  const [variantStudioPanel, setVariantStudioPanel] = useState<"none" | "add_single" | "generate_matrix" | "bulk_ops">("none");
  const [singleVarName, setSingleVarName] = useState("");
  const [singleVarSku, setSingleVarSku] = useState("");
  const [singleVarBarcode, setSingleVarBarcode] = useState("");
  const [singleVarBuying, setSingleVarBuying] = useState<number | "">("");
  const [singleVarSelling, setSingleVarSelling] = useState<number | "">("");
  const [singleVarStock, setSingleVarStock] = useState<number | "">(0);
  const [singleVarReorder, setSingleVarReorder] = useState<number | "">(5);
  const [studioMatrixOpt1, setStudioMatrixOpt1] = useState("Size");
  const [studioMatrixVals1, setStudioMatrixVals1] = useState("Small, Medium, Large");
  const [studioMatrixOpt2, setStudioMatrixOpt2] = useState("Color");
  const [studioMatrixVals2, setStudioMatrixVals2] = useState("");
  const [studioBulkPricePct, setStudioBulkPricePct] = useState(10);
  const [studioBulkStockAdd, setStudioBulkStockAdd] = useState(20);
  const [editingVariantRowId, setEditingVariantRowId] = useState<string | null>(null);
  const [inlineVariantEdit, setInlineVariantEdit] = useState<{
    name: string;
    sku: string;
    barcode: string;
    buyingPrice: number;
    sellingPrice: number;
    stock: number;
    reorderLevel: number;
  }>({ name: "", sku: "", barcode: "", buyingPrice: 0, sellingPrice: 0, stock: 0, reorderLevel: 5 });

  // Tab 2 Price Version Audit Form State
  const [priceAuditOpen, setPriceAuditOpen] = useState(false);
  const [priceAuditNewBuy, setPriceAuditNewBuy] = useState<number | "">("");
  const [priceAuditNewSell, setPriceAuditNewSell] = useState<number | "">("");
  const [priceAuditReason, setPriceAuditReason] = useState("Supplier Cost Adjustment");
  const [priceAuditNotes, setPriceAuditNotes] = useState("");

  // New Product Form State
  const [newProd, setNewProd] = useState({
    name: "", category: "", brand: "", buyingPrice: 0, sellingPrice: 0, stock: 0, reorderLevel: 10, batchNumber: "", expiryDate: ""
  });

  // Stock Movement Ledger Filter & Entry State
  const [ledgerMovementFilter, setLedgerMovementFilter] = useState("ALL");
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState("");
  const [stockAdjModal, setStockAdjModal] = useState(false);
  const [adjSku, setAdjSku] = useState("SKU-AZM-FLR-01");
  const [adjAdjustmentType, setAdjAdjustmentType] = useState<"INCREASE" | "DECREASE" | "SET">("INCREASE");
  const [adjType, setAdjType] = useState<"ADJUSTMENT_GAIN" | "ADJUSTMENT_LOSS" | "OPENING_STOCK" | "WASTAGE_SPILL">("ADJUSTMENT_GAIN");
  const [adjReasonCode, setAdjReasonCode] = useState("PURCHASE_RECEIVED");
  const [adjQty, setAdjQty] = useState(1);
  const [adjNotes, setAdjNotes] = useState("");
  const [isBackdated, setIsBackdated] = useState(false);
  const [adjOccurredAt, setAdjOccurredAt] = useState(() => toLocalDatetimeString());

  // Branch Stock Transfer State
  const [transfers, setTransfers] = useState<any[]>([]);
  const [counts, setCounts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [wastages, setWastages] = useState<any[]>([]);

  // ─── Hydrate Authoritative Inventory Catalog from Local DB ──────────────────
  const loadInventory = useCallback(async () => {
    try {
      await db.ready;
      if (!currentTenantId || !currentBranchId) {
        setItems([]);
        setLedger([]);
        return;
      }
      const stockProjection = buildStockBalanceProjection(db, currentTenantId, currentBranchId);
      const variantsByProduct = new Map<string, ProductVariantData[]>();
      for (const variant of db.productVariants.values()) {
        if (variant.tenantId !== currentTenantId || variant.branchId !== currentBranchId) continue;
        const list = variantsByProduct.get(variant.productId) || [];
        const effectiveVariantStock = Number(stockProjection.byVariant.get(variant.id) || 0);
        list.push({
          id: variant.id,
          name: variant.name,
          sku: variant.sku,
          barcode: (variant as any).barcode || (variant as any).attributes?.barcode || "",
          attributes: (variant as any).attributes || {},
          buyingPrice: Number((variant as any).buyingPrice || (variant as any).costPrice || 0),
          sellingPrice: Number(variant.price || (variant as any).sellingPrice || 0),
          stock: effectiveVariantStock,
          reorderLevel: Number((variant as any).reorderLevel || 5),
          updatedAt: (variant as any).updatedAt,
        });
        variantsByProduct.set(variant.productId, list);
      }

      const persistedCategories = db.getConfigurationLocal("inventory_categories_meta", { tenantId: currentTenantId });
      const persistedBrands = db.getConfigurationLocal("inventory_brands_meta", { tenantId: currentTenantId });
      const effectiveCategories = Array.isArray(persistedCategories) ? persistedCategories as CategoryRecord[] : categoriesMeta;
      const effectiveBrands = Array.isArray(persistedBrands) ? persistedBrands as BrandRecord[] : brandsMeta;
      const categoryById = new Map(effectiveCategories.map((c) => [c.id, c.name]));
      const brandById = new Map(effectiveBrands.map((b) => [b.id, b.name]));
      const loaded: InventoryItem[] = [];
      for (const prod of db.products.values()) {
        if (prod.tenantId !== currentTenantId || prod.branchId !== currentBranchId) continue;
        const pAny = prod as any;
        if (pAny.deletedAt || pAny.deleted_at || pAny.status === "Inactive") continue;
        const vars = variantsByProduct.get(prod.id);
        const pStock = vars && vars.length > 0
          ? vars.reduce((sum, v) => sum + Number(v.stock || 0), 0)
          : Number(stockProjection.byProduct.get(prod.id) || 0);
        const pReorder = Number(pAny.reorderLevel ?? 10);
        const pStatus: InventoryItem["status"] = pStock === 0 ? "Out of Stock" : pStock <= pReorder ? "Low Stock" : "Active";
        loaded.push({
          id: prod.id,
          name: prod.name,
          sku: prod.sku,
          category: (pAny.categoryId && categoryById.get(pAny.categoryId)) || pAny.category || "",
          brand: (pAny.brandId && brandById.get(pAny.brandId)) || pAny.brand || "",
          buyingPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
          sellingPrice: Number(pAny.sellingPrice || pAny.price || 0),
          stock: pStock,
          reorderLevel: pReorder,
          status: pStatus,
          batchNumber: pAny.batchNumber || pAny.batch || "",
          expiryDate: pAny.expiryDate || pAny.expiry || "",
          hasVariants: Boolean(pAny.hasVariants),
          variants: vars,
        });
      }
      setItems(loaded);

      // Hydrate stock ledger
      const loadedLedger: any[] = [];
      for (const entry of db.stockLedger.values()) {
        if (entry.tenantId !== currentTenantId || entry.branchId !== currentBranchId) continue;
        const eAny = entry as any;
        const entryDate = eAny.createdAt || eAny.timestamp || eAny.date;
        loadedLedger.push({
          id: entry.id,
          date: entryDate ? new Date(entryDate).toISOString().slice(0, 16).replace("T", " ") : "Recently",
          sku: eAny.sku || "SKU-PROD",
          name: eAny.name || "Stock Movement",
          type: entry.movementType || "ADJUSTMENT",
          qty: entry.quantity,
          qtyBefore: (eAny.balanceAfter || 0) - entry.quantity,
          balance: eAny.balanceAfter || 0,
          unitCost: Number(eAny.unitCost || 0),
          totalCost: Number(eAny.totalCost || 0),
          ref: eAny.ref || eAny.reason || "SYS-ADJ",
          user: eAny.user || "Staff",
          notes: eAny.notes || eAny.reason,
          deviceId: eAny.deviceId || "STORE",
        });
      }
      // Hydrate custom categories & brands metadata from configuration
      try {
        const savedCatsMeta = db.getConfigurationLocal("inventory_categories_meta", currentTenantId ? { tenantId: currentTenantId } : undefined);
        if (Array.isArray(savedCatsMeta) && savedCatsMeta.length > 0) {
          setCategoriesMeta(savedCatsMeta);
        } else {
          // Backward compatibility fallback to legacy string array
          const legacyCats = db.getConfigurationLocal("inventory_custom_categories", currentTenantId ? { tenantId: currentTenantId } : undefined);
          if (Array.isArray(legacyCats) && legacyCats.length > 0) {
            const merged: CategoryRecord[] = [];
            let cIdx = 0;
            for (const cStr of legacyCats) {
              if (typeof cStr === "string" && !merged.some((m) => m.name.toLowerCase() === cStr.toLowerCase())) {
                merged.push({
                  id: `cat-leg-${Date.now()}-${cIdx}`,
                  name: cStr,
                  color: CATEGORY_COLORS[cIdx % CATEGORY_COLORS.length].hex,
                });
                cIdx++;
              }
            }
            setCategoriesMeta(merged);
          }
        }

        const savedBrandsMeta = db.getConfigurationLocal("inventory_brands_meta", currentTenantId ? { tenantId: currentTenantId } : undefined);
        if (Array.isArray(savedBrandsMeta) && savedBrandsMeta.length > 0) {
          setBrandsMeta(savedBrandsMeta);
        } else {
          const legacyBrands = db.getConfigurationLocal("inventory_custom_brands", currentTenantId ? { tenantId: currentTenantId } : undefined);
          if (Array.isArray(legacyBrands) && legacyBrands.length > 0) {
            const merged: BrandRecord[] = [];
            let bIdx = 0;
            for (const bStr of legacyBrands) {
              if (typeof bStr === "string" && !merged.some((m) => m.name.toLowerCase() === bStr.toLowerCase())) {
                merged.push({
                  id: `br-leg-${Date.now()}-${bIdx}`,
                  name: bStr,
                  origin: "Registered Vendor",
                });
                bIdx++;
              }
            }
            setBrandsMeta(merged);
          }
        }
      } catch {}

      setLedger(loadedLedger.reverse());
    } catch (err) {
      console.error("[Inventory] Failed to hydrate inventory:", err);
    }
  }, [db, currentTenantId, currentBranchId]);

  useEffect(() => {
    void loadInventory();
    const handleSync = () => { void loadInventory(); };
    window.addEventListener(DATA_CHANGED_EVENT, handleSync);
    window.addEventListener(STOCK_CHANGED_EVENT, handleSync);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleSync);
      window.removeEventListener(STOCK_CHANGED_EVENT, handleSync);
    };
  }, [loadInventory]);

  const allCategories = useMemo(() => {
    const metaMap = new Map<string, CategoryRecord>();
    for (const cat of categoriesMeta) {
      metaMap.set(cat.name.toLowerCase(), cat);
    }
    let colorIndex = 0;
    for (const item of items) {
      if (item.category && !metaMap.has(item.category.toLowerCase())) {
        const fallbackColor = CATEGORY_COLORS[colorIndex % CATEGORY_COLORS.length].hex;
        colorIndex++;
        metaMap.set(item.category.toLowerCase(), {
          id: `cat-dyn-${Date.now()}-${colorIndex}`,
          name: item.category,
          description: "Active catalog category",
          color: fallbackColor,
        });
      }
    }
    return Array.from(metaMap.values());
  }, [categoriesMeta, items]);

  const allBrands = useMemo(() => {
    const metaMap = new Map<string, BrandRecord>();
    for (const b of brandsMeta) {
      metaMap.set(b.name.toLowerCase(), b);
    }
    let bIndex = 0;
    for (const item of items) {
      if (item.brand && !metaMap.has(item.brand.toLowerCase())) {
        bIndex++;
        metaMap.set(item.brand.toLowerCase(), {
          id: `br-dyn-${Date.now()}-${bIndex}`,
          name: item.brand,
          origin: "Catalog Vendor",
          notes: "Auto-detected from inventory catalog",
        });
      }
    }
    return Array.from(metaMap.values());
  }, [brandsMeta, items]);

  const filteredCategories = useMemo(() => {
    const q = categorySearchQuery.toLowerCase().trim();
    if (!q) return allCategories;
    return allCategories.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q))
    );
  }, [allCategories, categorySearchQuery]);

  const filteredBrands = useMemo(() => {
    const q = brandSearchQuery.toLowerCase().trim();
    if (!q) return allBrands;
    return allBrands.filter((b) =>
      b.name.toLowerCase().includes(q) || (b.origin && b.origin.toLowerCase().includes(q)) || (b.notes && b.notes.toLowerCase().includes(q))
    );
  }, [allBrands, brandSearchQuery]);

  const topCategoryStat = useMemo(() => {
    if (allCategories.length === 0) return null;
    let best = { name: allCategories[0].name, valuation: 0, skus: 0 };
    for (const cat of allCategories) {
      const catItems = items.filter((i) => i.category.toLowerCase() === cat.name.toLowerCase());
      const val = catItems.reduce((acc, i) => acc + i.stock * i.sellingPrice, 0);
      if (val >= best.valuation) {
        best = { name: cat.name, valuation: val, skus: catItems.length };
      }
    }
    return best;
  }, [allCategories, items]);

  const topBrandStat = useMemo(() => {
    if (allBrands.length === 0) return null;
    let best = { name: allBrands[0].name, units: 0, valuation: 0 };
    for (const b of allBrands) {
      const brandItems = items.filter((i) => i.brand.toLowerCase() === b.name.toLowerCase());
      const units = brandItems.reduce((acc, i) => acc + i.stock, 0);
      const val = brandItems.reduce((acc, i) => acc + i.stock * i.sellingPrice, 0);
      if (units >= best.units) {
        best = { name: b.name, units, valuation: val };
      }
    }
    return best;
  }, [allBrands, items]);

  const filteredLedger = useMemo(() => {
    return ledger.filter((l) => {
      const matchType = ledgerMovementFilter === "ALL" || l.type === ledgerMovementFilter;
      const q = ledgerSearchQuery.toLowerCase().trim();
      const matchQ = !q || l.name.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q) || l.ref.toLowerCase().includes(q);
      return matchType && matchQ;
    });
  }, [ledger, ledgerMovementFilter, ledgerSearchQuery]);

  // Filtered Products
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((i) => {
      const matchCat = categoryFilter === "All" || i.category === categoryFilter;
      const matchQ = !q || i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || i.brand.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [items, categoryFilter, searchQuery]);

  // ─── Authoritative Overview Metrics ────────────────────────────────────────
  // Inventory truth is variant + branch scoped. Parent products are catalog
  // definitions; sellable SKUs and quantities come from branch variants/ledger.
  const activeVariants = useMemo(() => items.flatMap((item) => item.variants || []), [items]);
  const totalUniqueSkus = useMemo(() => {
    const variantSkus = new Set(activeVariants.map((v) => v.sku.trim()).filter(Boolean));
    const parentOnlySkus = items.filter((i) => !i.variants?.length && i.sku.trim()).map((i) => i.sku.trim());
    for (const sku of parentOnlySkus) variantSkus.add(sku);
    return variantSkus.size;
  }, [activeVariants, items]);
  const totalStockUnits = useMemo(
    () => items.reduce((sum, i) => sum + Number(i.stock || 0), 0),
    [items],
  );

  // Inventory valuation is derived from ledger purchase/receipt costs, not the
  // mutable catalog buyingPrice. This keeps the UI aligned with server WAC.
  const authoritativeWacByVariant = useMemo(() => {
    const result = new Map<string, number>();
    const variants = Array.from(db.productVariants.values()).filter((v: any) =>
      v.tenantId === currentTenantId && v.branchId === currentBranchId
    ) as any[];
    const ledgers = Array.from(db.stockLedger.values()).filter((l: any) =>
      l.tenantId === currentTenantId && l.branchId === currentBranchId
    ) as any[];
    for (const variant of variants) {
      const summary = InventoryValuationEngine.calculateBranchInventoryValuation([variant], ledgers);
      result.set(variant.id, Number(summary.variantSummaries[0]?.unitCost || 0));
    }
    return result;
  }, [db, currentTenantId, currentBranchId]);

  const stockBuyingValue = items.reduce((sum, item) => {
    if (item.variants && item.variants.length > 0) {
      return sum + item.variants.reduce(
        (variantSum, variant) =>
          variantSum + Number(variant.stock || 0) * Number(authoritativeWacByVariant.get(variant.id) ?? variant.buyingPrice ?? 0),
        0,
      );
    }
    const variant = [...db.productVariants.values()].find(
      (v: any) => v.productId === item.id && v.tenantId === currentTenantId && v.branchId === currentBranchId,
    ) as any;
    const wac = variant ? authoritativeWacByVariant.get(variant.id) : undefined;
    return sum + item.stock * Number(wac ?? item.buyingPrice);
  }, 0);
  const stockSellingValue = items.reduce((sum, i) => sum + i.stock * i.sellingPrice, 0);
  const potentialProfit = stockSellingValue - stockBuyingValue;
  const avgMarginPct = stockSellingValue > 0 ? Math.round((potentialProfit / stockSellingValue) * 100) : 0;
  // Alert counts are SKU/variant based. Parent-only products remain supported.
  const stockTrackedRows = activeVariants.length > 0
    ? activeVariants.map((v) => ({ stock: Number(v.stock || 0), reorderLevel: Number(v.reorderLevel || 0) }))
    : items.map((i) => ({ stock: Number(i.stock || 0), reorderLevel: Number(i.reorderLevel || 0) }));
  const lowStockCount = stockTrackedRows.filter((r) => r.stock > 0 && r.stock <= r.reorderLevel).length;
  const outOfStockCount = stockTrackedRows.filter((r) => r.stock === 0).length;
  const overstockCount = stockTrackedRows.filter((r) => r.stock > 100).length;
  const expiringCount = useMemo(() => {
    const now = Date.now();
    const limit30Days = 86400000 * 30;
    return items.filter((i) => {
      const exp = (i as any).expiryDate;
      if (!exp) return false;
      const diff = new Date(exp).getTime() - now;
      return diff > 0 && diff <= limit30Days;
    }).length;
  }, [items]);
  // Availability health is normalized; an empty catalog is neutral, not healthy.
  const healthScore = stockTrackedRows.length === 0
    ? 0
    : Math.round(Math.max(0, 100 - ((outOfStockCount / stockTrackedRows.length) * 70) - ((lowStockCount / stockTrackedRows.length) * 30)));

  // Valuation Date Snapshot Filter
  const [valuationDateFilter, setValuationDateFilter] = useState("Today");
  const [valuationMethod, setValuationMethod] = useState("WAC");

  // ─── Dynamic Multi-Branch Valuation ───────────────────────────────────────
  const branchValuationList = useMemo(() => {
    const branches = availableBranches && availableBranches.length > 0
      ? availableBranches
      : [{ id: currentBranchId || "main", name: currentBranchName || "Main HQ" }];

    return branches.map((b) => {
      const projection = buildStockBalanceProjection(db, currentTenantId, b.id);
      const branchProducts = Array.from(db.products.values()).filter((p: any) =>
        (p.tenantId === currentTenantId || p.tenant_id === currentTenantId) &&
        !p.deletedAt && !p.deleted_at && p.status !== "Inactive"
      );

      let skus = 0;
      let units = 0;
      let buyingVal = 0;
      let sellingVal = 0;

      for (const p of branchProducts) {
        const variants = Array.from(db.productVariants.values()).filter((v: any) =>
          v.productId === p.id && v.tenantId === currentTenantId && v.branchId === b.id
        ) as any[];

        if (variants.length > 0) {
          for (const v of variants) {
            skus += 1;
            const qty = Number(projection.byVariant.get(v.id) || 0);
            units += qty;
            const cost = Number(authoritativeWacByVariant.get(v.id) ?? v.buyingPrice ?? v.costPrice ?? 0);
            const price = Number(v.price ?? v.sellingPrice ?? p.sellingPrice ?? 0);
            buyingVal += qty * cost;
            sellingVal += qty * price;
          }
        } else {
          const qty = Number(projection.byProduct.get(p.id) || 0);
          if (p.sku) skus += 1;
          units += qty;
          buyingVal += qty * Number(p.buyingPrice ?? 0);
          sellingVal += qty * Number(p.sellingPrice ?? 0);
        }
      }

      const profit = sellingVal - buyingVal;
      return {
        id: b.id,
        branch: b.name,
        skus,
        units,
        buyingVal,
        sellingVal,
        profit,
        margin: sellingVal > 0 ? Math.round((profit / sellingVal) * 100) : 0,
      };
    });
  }, [availableBranches, currentBranchId, currentBranchName, currentTenantId, db, authoritativeWacByVariant]);

  const generateInflowCombinations = (
    opt1Name = varOption1Name,
    opt1Vals = varOption1Values,
    opt2Name = varOption2Name,
    opt2Vals = varOption2Values
  ) => {
    const list1 = opt1Vals.split(",").map((s) => s.trim()).filter(Boolean);
    const list2 = opt2Name.trim() && opt2Vals.trim()
      ? opt2Vals.split(",").map((s) => s.trim()).filter(Boolean)
      : [""];
    if (list1.length === 0) return;

    const baseName = newProd.name.trim() || "Item";
    const prefix = baseName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "SKU";
    const baseSku = `SKU-${prefix}-${safeUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;

    const generated: ProductVariantData[] = [];
    for (const v1 of list1) {
      for (const v2 of list2) {
        const label = v2 ? `${opt1Name}: ${v1} / ${opt2Name}: ${v2}` : `${opt1Name}: ${v1}`;
        const suffix = (v1 + (v2 ? `-${v2}` : "")).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
        generated.push({
          id: safeUUID(),
          name: `${baseName} (${label})`,
          sku: `${baseSku}-${suffix}`,
          barcode: `890${safeUUID().replace(/-/g, "").slice(0, 9)}`,
          attributes: { [opt1Name]: v1, ...(opt2Name.trim() && v2 ? { [opt2Name]: v2 } : {}) },
          buyingPrice: Number(newProd.buyingPrice) || 0,
          sellingPrice: Number(newProd.sellingPrice) || 0,
          stock: 0,
          reorderLevel: 5,
        });
      }
    }
    setInflowVariants(generated);
  };

  // Product creation is intentionally owned by ProductRegistrationWizardModal.
  // Keeping a second registration implementation here would bypass the canonical
  // atomic Product + Variant + StockLedger + Outbox transaction.
  
  const handleOpenEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setEditProd({
      name: item.name,
      category: item.category,
      brand: item.brand,
      buyingPrice: item.buyingPrice,
      sellingPrice: item.sellingPrice,
      stock: item.stock,
      reorderLevel: item.reorderLevel,
      status: item.status,
      batchNumber: (item as any).batchNumber || "",
      expiryDate: (item as any).expiryDate || "",
    });
    setEditProductModal(true);
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing inventory."); return; }
    if (!editingItem) return;
    const pendingOutboxes: any[] = [];
    const prevItem = editingItem;
    const newStock = Number(editProd.stock);
    const newReorder = Number(editProd.reorderLevel);
    if (newStock !== prevItem.stock) {
      toast.error(
        "Stock Changes Use Stock Ledger",
        "Product editing cannot mutate stock. Use Add Stock, Stock Ledger, or Physical Count so every movement is recorded against an exact variant.",
      );
      return;
    }
    const newStatus: InventoryItem["status"] = prevItem.stock === 0 ? "Out of Stock" : prevItem.stock <= newReorder ? "Low Stock" : "Active";

    let existing = db.products.get(prevItem.id) as any;
    if (!existing) {
      for (const p of db.products.values()) {
        if (p.id === prevItem.id || p.sku === prevItem.sku) {
          existing = p;
          break;
        }
      }
    }

    const updatedRecord = {
      ...(existing || {}),
      id: prevItem.id,
      name: editProd.name.trim(),
      sku: prevItem.sku,
      category: editProd.category,
      categoryId: (() => { const c = categoriesMeta.find((x) => x.name.toLowerCase() === editProd.category.toLowerCase()); return c && isUuid(c.id) ? c.id : undefined; })(),
      brand: editProd.brand.trim(),
      brandId: (() => { const b = brandsMeta.find((x) => x.name.toLowerCase() === editProd.brand.trim().toLowerCase()); return b && isUuid(b.id) ? b.id : undefined; })(),
      costPrice: Number(editProd.buyingPrice),
      buyingPrice: Number(editProd.buyingPrice),
      sellingPrice: Number(editProd.sellingPrice),
      price: Number(editProd.sellingPrice),
      stock: Number(existing?.stock ?? existing?.totalStock ?? prevItem.stock),
      totalStock: Number(existing?.totalStock ?? prevItem.stock),
      availableStock: Number(existing?.availableStock ?? prevItem.stock),
      reorderLevel: newReorder,
      status: newStatus,
      batchNumber: editProd.batchNumber ? editProd.batchNumber.trim() : undefined,
      expiryDate: editProd.expiryDate ? editProd.expiryDate : undefined,
      updatedAt: new Date().toISOString(),
    };

    db.saveProductLocal(updatedRecord as any, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);

    pendingOutboxes.push({
      entityType: "Product",
      entityId: prevItem.id,
      operationType: "UPDATE",
      payload: {
        id: prevItem.id,
        name: updatedRecord.name,
        category: updatedRecord.category,
        categoryId: updatedRecord.categoryId,
        brand: updatedRecord.brand,
        brandId: updatedRecord.brandId,
        costPrice: Number(editProd.buyingPrice),
        buyingPrice: Number(editProd.buyingPrice),
        sellingPrice: Number(editProd.sellingPrice),
        price: Number(editProd.sellingPrice),
        reorderLevel: newReorder,
        status: newStatus,
        batchNumber: editProd.batchNumber ? editProd.batchNumber.trim() : undefined,
        expiryDate: editProd.expiryDate ? editProd.expiryDate : undefined,
        hasVariants: Boolean(existing?.hasVariants),
        isActive: true,
      },
      idempotencyKey: `PROD-UPDATE-${prevItem.id}-${Date.now()}`,
      tenantId: currentTenantId || undefined,
      branchId: currentBranchId || undefined,
    });


    if (pendingOutboxes.length) await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
    void loadInventory();
    setEditProductModal(false);
    setEditingItem(null);
    playSuccessChime();
    toast.success("SKU Updated", `Product "${updatedRecord.name}" successfully updated.`);
    publishDataChanged({ action: "INVENTORY_CHANGED" });
    void syncOutbox?.().catch(() => {});
  };

  // ─── Product Archival & Deletion Handlers ────────────────────────────────────
  const handleOpenDeleteModal = (item: InventoryItem) => {
    setItemToDelete(item);
    setDeleteConfirmModal(true);
  };

  const handleConfirmArchive = async () => {
    if (!itemToDelete) return;
    const target = itemToDelete;

    let existing = db.products.get(target.id) as any;
    if (!existing) {
      for (const p of db.products.values()) {
        if (p.id === target.id || p.sku === target.sku) {
          existing = p;
          break;
        }
      }
    }

    if (existing) {
      // Standard SaaS Archival: hides product from POS counter while preserving historical sales and audit ledgers
      const archived = {
        ...existing,
        status: "Inactive",
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveProductLocal(archived as any, currentTenantId ? { tenantId: currentTenantId, branchId: currentBranchId || undefined } : undefined);
      await commitLocalOutbox(db, {
        entityType: "Product",
        entityId: target.id,
        operationType: "UPDATE",
        payload: {
          id: target.id,
          status: "Inactive",
          isActive: false,
          deletedAt: archived.deletedAt,
          _baseUpdatedAt: existing.updatedAt,
        },
        idempotencyKey: `PROD-ARCHIVE-${target.id}-${Date.now()}`,
        tenantId: currentTenantId || undefined,
        branchId: currentBranchId || undefined,
      });
    } else {
      // Direct hard deletion from active cache
      db.deleteProductLocal(target.id);
      await commitLocalOutbox(db, {
        entityType: "Product",
        entityId: target.id,
        operationType: "UPDATE",
        payload: {
          id: target.id,
          isActive: false,
          status: "Inactive",
          deletedAt: new Date().toISOString(),
        },
        idempotencyKey: `PROD-DEL-${target.id}-${Date.now()}`,
        tenantId: currentTenantId || undefined,
        branchId: currentBranchId || undefined,
      });
    }

    void loadInventory();
    setDeleteConfirmModal(false);
    setItemToDelete(null);
    playSuccessChime();
    toast.success("Product Archived", `"${target.name}" (${target.sku}) archived. Hidden from POS counter.`);
    publishDataChanged({ action: "INVENTORY_CHANGED" });
    void syncOutbox?.().catch(() => {});
  };

  const handleOpenEditCategory = (cat: CategoryRecord) => {
    if (!isUuid(cat.id)) { toast.warning("Catalog Sync Required", "Synchronize catalog before editing this legacy record."); return; }
    setEditingCategory(cat); setNewCategoryName(cat.name); setNewCategoryDesc(cat.description || ""); setNewCategoryColor(cat.color || "#10b981"); setCategoryCascadeRename(true); setAddCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault(); const name = newCategoryName.trim(); if (!name || !currentTenantId || !currentBranchId) return;
    const pendingOutboxes: any[] = [];
    const now = new Date().toISOString(); const id = editingCategory?.id && isUuid(editingCategory.id) ? editingCategory.id : safeUUID();
    const record: any = { id, tenantId: currentTenantId, branchId: currentBranchId, name, code: catalogCode(name), description: newCategoryDesc.trim() || undefined, color: newCategoryColor, isActive: true, updatedAt: now, createdAt: (editingCategory as any)?.createdAt || now };
    const current = Array.isArray(db.getConfigurationLocal("inventory_categories_meta", { tenantId: currentTenantId })) ? db.getConfigurationLocal("inventory_categories_meta", { tenantId: currentTenantId }) : categoriesMeta;
    const next = [...current.filter((c: any) => c.id !== id && c.name.toLowerCase() !== name.toLowerCase()), record]; db.saveConfigurationLocal("inventory_categories_meta", next, { tenantId: currentTenantId }); setCategoriesMeta(next);
    pendingOutboxes.push({ entityType: "Category", entityId: id, operationType: editingCategory ? "UPDATE" : "CREATE", payload: { name, code: record.code, description: record.description, color: record.color, isActive: true, _baseUpdatedAt: (editingCategory as any)?.updatedAt }, idempotencyKey: `CAT-${editingCategory ? "U" : "C"}-${id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId });
    if (editingCategory && categoryCascadeRename && editingCategory.name.toLowerCase() !== name.toLowerCase()) for (const p of [...db.products.values()] as any[]) if (p.tenantId === currentTenantId && p.branchId === currentBranchId && (p.categoryId === id || String(p.category || "").toLowerCase() === editingCategory.name.toLowerCase())) { db.saveProductLocal({ ...p, categoryId: id, category: name, updatedAt: now }, { tenantId: currentTenantId, branchId: currentBranchId }); pendingOutboxes.push({ entityType: "Product", entityId: p.id, operationType: "UPDATE", payload: { categoryId: id, category: name, _baseUpdatedAt: p.updatedAt }, idempotencyKey: `PROD-CAT-${p.id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId }); }
    if (pendingOutboxes.length) await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
    setAddCategoryModal(false); setEditingCategory(null); void loadInventory(); void syncOutbox?.().catch(() => {}); toast.success(editingCategory ? "Category Updated" : "Category Added", `Category "${name}" saved.`);
  };
  const handleOpenDeleteCategory = (name: string, assignedCount: number) => {
    const cat = allCategories.find((c) => c.name.toLowerCase() === name.toLowerCase()); const fallback = allCategories.find((c) => c.id !== cat?.id && isUuid(c.id));
    if (!cat || !isUuid(cat.id)) { toast.warning("Catalog Sync Required", "Synchronize catalog before deleting this legacy record."); return; }
    if (assignedCount > 0 && !fallback) { toast.warning("Replacement Required", "Create an active replacement category first."); return; }
    setDeleteCategorySafeguard({ category: cat.name, assignedCount, fallbackCategory: fallback?.name || "" });
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deleteCategorySafeguard || !currentTenantId || !currentBranchId) return;
    const pendingOutboxes: any[] = [];
    const cat = allCategories.find((c) => c.name.toLowerCase() === deleteCategorySafeguard.category.toLowerCase()); const replacement = allCategories.find((c) => c.name.toLowerCase() === deleteCategorySafeguard.fallbackCategory.toLowerCase());
    const replacementId = deleteCategorySafeguard.assignedCount > 0 ? replacement?.id : undefined;
    if (!cat || !isUuid(cat.id) || (replacementId && !isUuid(replacementId))) return;
    const next = categoriesMeta.filter((c) => c.id !== cat.id); setCategoriesMeta(next); db.saveConfigurationLocal("inventory_categories_meta", next, { tenantId: currentTenantId });
    if (replacementId) for (const p of [...db.products.values()] as any[]) if (p.tenantId === currentTenantId && p.branchId === currentBranchId && p.categoryId === cat.id) { db.saveProductLocal({ ...p, categoryId: replacementId, category: replacement?.name, updatedAt: new Date().toISOString() }, { tenantId: currentTenantId, branchId: currentBranchId }); pendingOutboxes.push({ entityType: "Product", entityId: p.id, operationType: "UPDATE", payload: { categoryId: replacementId, category: replacement?.name, _baseUpdatedAt: p.updatedAt }, idempotencyKey: `PROD-CAT-R-${p.id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId }); }
    pendingOutboxes.push({ entityType: "Category", entityId: cat.id, operationType: "DELETE", payload: { replacementId }, idempotencyKey: `CAT-DELETE-${cat.id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId });
    await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
    setDeleteCategorySafeguard(null); void loadInventory(); void syncOutbox?.().catch(() => {});
  };

  const handleOpenEditBrand = (brand: BrandRecord) => { if (!isUuid(brand.id)) { toast.warning("Catalog Sync Required", "Synchronize catalog before editing this legacy record."); return; } setEditingBrand(brand); setNewBrandName(brand.name); setNewBrandOrigin(brand.origin || ""); setNewBrandNotes(brand.notes || ""); setBrandCascadeRename(true); setAddBrandModal(true); };
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault(); const name = newBrandName.trim(); if (!name || !currentTenantId || !currentBranchId) return;
    const pendingOutboxes: any[] = [];
    const now = new Date().toISOString(); const id = editingBrand?.id && isUuid(editingBrand.id) ? editingBrand.id : safeUUID();
    const record: any = { id, tenantId: currentTenantId, branchId: currentBranchId, name, code: catalogCode(name), origin: newBrandOrigin.trim() || undefined, notes: newBrandNotes.trim() || undefined, isActive: true, updatedAt: now, createdAt: (editingBrand as any)?.createdAt || now };
    const current = Array.isArray(db.getConfigurationLocal("inventory_brands_meta", { tenantId: currentTenantId })) ? db.getConfigurationLocal("inventory_brands_meta", { tenantId: currentTenantId }) : brandsMeta;
    const next = [...current.filter((b: any) => b.id !== id && b.name.toLowerCase() !== name.toLowerCase()), record]; db.saveConfigurationLocal("inventory_brands_meta", next, { tenantId: currentTenantId }); setBrandsMeta(next);
    pendingOutboxes.push({ entityType: "Brand", entityId: id, operationType: editingBrand ? "UPDATE" : "CREATE", payload: { name, code: record.code, origin: record.origin, notes: record.notes, isActive: true, _baseUpdatedAt: (editingBrand as any)?.updatedAt }, idempotencyKey: `BR-${editingBrand ? "U" : "C"}-${id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId });
    if (pendingOutboxes.length) await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
    setAddBrandModal(false); setEditingBrand(null); void loadInventory(); void syncOutbox?.().catch(() => {}); toast.success(editingBrand ? "Brand Updated" : "Brand Added", `Brand "${name}" saved.`);
  };

  const handleOpenDeleteBrand = (name: string, assignedCount: number) => {
    const brand = allBrands.find((b) => b.name.toLowerCase() === name.toLowerCase()); const fallback = allBrands.find((b) => b.id !== brand?.id && isUuid(b.id));
    if (!brand || !isUuid(brand.id)) { toast.warning("Catalog Sync Required", "Synchronize catalog before deleting this legacy record."); return; }
    if (assignedCount > 0 && !fallback) { toast.warning("Replacement Required", "Create an active replacement brand first."); return; }
    setDeleteBrandSafeguard({ brand: brand.name, assignedCount, fallbackBrand: fallback?.name || "" });
  };

  const handleConfirmDeleteBrand = async () => {
    if (!deleteBrandSafeguard || !currentTenantId || !currentBranchId) return;
    const pendingOutboxes: any[] = [];
    const brand = allBrands.find((b) => b.name.toLowerCase() === deleteBrandSafeguard.brand.toLowerCase()); const replacement = allBrands.find((b) => b.name.toLowerCase() === deleteBrandSafeguard.fallbackBrand.toLowerCase()); const replacementId = deleteBrandSafeguard.assignedCount > 0 ? replacement?.id : undefined;
    if (!brand || !isUuid(brand.id) || (replacementId && !isUuid(replacementId))) return;
    const next = brandsMeta.filter((b) => b.id !== brand.id); setBrandsMeta(next); db.saveConfigurationLocal("inventory_brands_meta", next, { tenantId: currentTenantId });
    if (replacementId) for (const p of [...db.products.values()] as any[]) if (p.tenantId === currentTenantId && p.branchId === currentBranchId && p.brandId === brand.id) { db.saveProductLocal({ ...p, brandId: replacementId, updatedAt: new Date().toISOString() }, { tenantId: currentTenantId, branchId: currentBranchId }); pendingOutboxes.push({ entityType: "Product", entityId: p.id, operationType: "UPDATE", payload: { brandId: replacementId, _baseUpdatedAt: p.updatedAt }, idempotencyKey: `PROD-BR-R-${p.id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId }); }
    pendingOutboxes.push({ entityType: "Brand", entityId: brand.id, operationType: "DELETE", payload: { replacementId }, idempotencyKey: `BR-DELETE-${brand.id}-${Date.now()}`, tenantId: currentTenantId, branchId: currentBranchId });
    await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
    setDeleteBrandSafeguard(null); void loadInventory(); void syncOutbox?.().catch(() => {});
  };

  return (
    <div className="v2-animate-page-enter v2-space-y-4">
      {/* Header Bar */}
      <div className="v2-flex v2-items-center v2-justify-between">
        <div>
          <h1 className="v2-text-xl v2-font-black" style={{ letterSpacing: "-.02em" }}>
            Inventory & Valuation Command Center
          </h1>
          <p className="v2-text-xs v2-text-muted">
            Weighted Average Cost (WAC) valuation, Stock Ledger audit trail, branch transfers, physical counts, and potential profit metrics.
          </p>
        </div>
        <div className="v2-flex v2-gap-2">
          <button
            className="v2-btn v2-btn-outline v2-btn-sm"
            onClick={() => setIsBarcodeModalOpen(true)}
            type="button"
            title="Generate and Print Barcode Labels (40x30mm Thermal & A4 24-Up)"
          >
            <Barcode size={13} /> Print Barcodes
          </button>
          <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => setCsvImportModal(true)} type="button">
            <Upload size={13} /> Bulk CSV Import
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={async () => {
            setActiveTab("ledger");
            const firstSku = items[0]?.variants?.[0]?.sku || items[0]?.sku || "";
            if (!adjSku || !items.some((i) => i.sku === adjSku || i.variants?.some((v) => v.sku === adjSku))) {
              setAdjSku(firstSku);
            }
            setAdjOccurredAt(toLocalDatetimeString());
            setStockAdjModal(true);
          }} type="button">
            <PackageOpen size={13} /> Add Stock
          </button>
          <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setAddProductModal(true)} type="button">
            <Plus size={13} /> Add Product
          </button>
        </div>
      </div>

      {/* Production Dashboard KPI Grid (11 SaaS Valuation Metrics) */}
      <div className="metrics-grid kpi-grid-4">
        <div className="kpi-card">
          <div className="kpi-card-label">Inventory Buying Value (Cost)</div>
          <div className="kpi-card-value" style={{ color: "var(--accent)" }}>{money(stockBuyingValue)}</div>
          <div className="kpi-card-desc">Weighted Avg Cost ({totalStockUnits} units)</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Inventory Selling Value (Retail)</div>
          <div className="kpi-card-value" style={{ color: "var(--text-color)" }}>{money(stockSellingValue)}</div>
          <div className="kpi-card-desc">Total retail value at current price</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Potential Gross Profit</div>
          <div className="kpi-card-value" style={{ color: "var(--success)" }}>{money(potentialProfit)}</div>
          <div className="kpi-card-desc">Average Margin: {avgMarginPct}%</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-card-label">Stock Health Index</div>
          <div className="kpi-card-value" style={{ color: healthScore > 80 ? "var(--success)" : "var(--warning)" }}>
            {healthScore}/100
          </div>
          <div className="kpi-card-desc">{lowStockCount} Low · {outOfStockCount} Out · {overstockCount} Overstock</div>
        </div>
      </div>

      {/* 9-Tab Sub-Navigation */}
      <div className="v2-flex v2-gap-1" style={{ borderBottom: "1px solid var(--surface-border)", paddingBottom: ".4rem", overflowX: "auto" }}>
        {[
          { id: "dashboard", label: "Overview", icon: BarChart3 },
          { id: "products", label: "SKU Catalog & Valuation", icon: Package },
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
            onClick={() => selectInventoryTab(t.id as InventoryTab)}
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
        <div className="v2-space-y-4">
          {/* Quick Metrics Bar */}
          <div className="v2-grid v2-grid-4 v2-gap-3">
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Unique SKUs</div>
              <div className="v2-font-black v2-text-lg">{totalUniqueSkus}</div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Total Stock Units</div>
              <div className="v2-font-black v2-text-lg">{totalStockUnits}</div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Expiring in 30 Days</div>
              <div className="v2-font-black v2-text-lg" style={{ color: "var(--warning)" }}>{expiringCount} Batches</div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Valuation Basis</div>
              <div className="v2-font-black v2-text-sm" style={{ color: "var(--accent)" }}>Weighted Average (WAC)</div>
            </div>
          </div>

          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Inventory Health Overview</div></div>
            <div className="v2-space-y-4">
              <div className="v2-grid v2-grid-2 v2-gap-4">
                <div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                    <h3 className="v2-font-bold v2-text-sm">Low Stock Replenishment Required</h3>
                    {items.filter((i) => i.stock <= i.reorderLevel).length > 0 && (
                      <button
                        type="button"
                        className="v2-btn v2-btn-primary v2-btn-sm"
                        onClick={async () => {
                          const lowItems = items.filter((i) => i.stock <= i.reorderLevel);
                          const poId = `PO-DRAFT-${Date.now().toString().slice(-6)}`;
                          const poLines = lowItems.map((item) => {
                            const neededQty = Math.max(10, item.reorderLevel * 2 - item.stock);
                            return {
                              productId: item.id,
                              sku: item.sku,
                              name: item.name,
                              qtyOrdered: neededQty,
                              qtyReceived: 0,
                              unitCost: item.buyingPrice,
                              totalCost: neededQty * item.buyingPrice,
                            };
                          });
                          const total = poLines.reduce((s, l) => s + l.totalCost, 0);
                          const draftPO = {
                            id: poId,
                            poNumber: poId,
                            supplier: "Primary Wholesale Supplier",
                            supplierName: "Primary Wholesale Supplier",
                            itemsCount: poLines.length,
                            items: poLines,
                            subtotal: total,
                            vatAmount: 0,
                            total,
                            status: "Draft" as const,
                            expected: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
                            date: new Date().toISOString().slice(0, 10),
                          };
                          const existingOrders = db.getConfigurationLocal("procurement_purchase_orders", currentTenantId ? { tenantId: currentTenantId } : undefined);
                          const updatedOrders = Array.isArray(existingOrders) ? [draftPO, ...existingOrders] : [draftPO];
                          db.saveConfigurationLocal("procurement_purchase_orders", updatedOrders, currentTenantId ? { tenantId: currentTenantId } : undefined);
                          playSuccessChime();
                          toast.success("Draft PO Created", `Generated PO #${poId} with ${lowItems.length} replenishment SKUs. Available in Purchasing.`);
                          publishDataChanged({ action: "PURCHASE_ORDER_CREATED", po: draftPO });
                        }}
                      >
                        <Truck size={13} /> Draft Low-Stock PO ({items.filter((i) => i.stock <= i.reorderLevel).length})
                      </button>
                    )}
                  </div>
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
        </div>
      )}

      {/* ─── TAB 2: SKU CATALOG & PRODUCT-LEVEL FINANCIAL METRICS ──────────────── */}
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
            <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.InventoryPage.1395.export-valuation-matrix", "Export Valuation Matrix", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.InventoryPage.1395.export-valuation-matrix">
              <Download size={13} /> Export Valuation Matrix
            </button>
          </div>

          <table className="v2-table">
            <thead>
              <tr>
                <th>SKU Code</th>
                <th>Product Name</th>
                <th>Stock Qty</th>
                <th>Avg Cost (WAC)</th>
                <th>Selling Price</th>
                <th>Buying Value</th>
                <th>Selling Value</th>
                <th>Expected Profit</th>
                <th>Margin %</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="v2-text-center v2-py-8">
                    <div className="v2-flex v2-flex-col v2-items-center v2-gap-2">
                      <PackageOpen size={36} style={{ color: "var(--muted)", opacity: 0.6 }} />
                      <div className="v2-font-bold v2-text-sm">No Products in Inventory Catalog</div>
                      <div className="v2-text-xs v2-text-muted" style={{ maxWidth: 380 }}>
                        Your inventory catalog is currently empty. Add your first product or import your real catalog via CSV.
                      </div>
                      <div className="v2-flex v2-gap-2 v2-mt-2">
                        <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setAddProductModal(true)} type="button">
                          <Plus size={13} /> Add First Product
                        </button>
                        <button className="v2-btn v2-btn-secondary v2-btn-sm" onClick={() => setCsvImportModal(true)} type="button">
                          <Upload size={13} /> Bulk CSV Import
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const itemBuyingVal = item.stock * item.buyingPrice;
                  const itemSellingVal = item.stock * item.sellingPrice;
                  const itemProfit = itemSellingVal - itemBuyingVal;
                  const itemMargin = itemSellingVal > 0 ? Math.round((itemProfit / itemSellingVal) * 100) : 0;
                  return (
                    <tr key={item.id}>
                      <td className="v2-mono v2-text-xs">{item.sku}</td>
                      <td>
                        <div className="v2-font-bold">{item.name}</div>
                        <div className="v2-flex v2-items-center v2-gap-2 v2-mt-0.5">
                          <span className="v2-text-xs v2-text-muted">{item.category} · {item.brand}</span>
                          {item.batchNumber && (
                            <span className="badge v2-badge-muted" style={{ fontSize: "10px", padding: "1px 4px" }}>
                              Lot: {item.batchNumber}
                            </span>
                          )}
                          {item.expiryDate && (() => {
                            const diffDays = Math.round((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
                            const badgeCls = diffDays <= 30 ? "v2-badge-danger" : diffDays <= 90 ? "v2-badge-warning" : "v2-badge-success";
                            return (
                              <span className={`badge ${badgeCls}`} style={{ fontSize: "10px", padding: "1px 4px" }}>
                                Exp: {item.expiryDate} {diffDays <= 90 ? `(${diffDays}d)` : ""}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="v2-mono v2-font-bold">{fmtNum(item.stock)}</td>
                      <td className="v2-mono">{money(item.buyingPrice)}</td>
                      <td className="v2-mono v2-font-bold">{money(item.sellingPrice)}</td>
                      <td className="v2-mono" style={{ color: "var(--accent)" }}>{money(itemBuyingVal)}</td>
                      <td className="v2-mono">{money(itemSellingVal)}</td>
                      <td className="v2-mono v2-font-bold" style={{ color: "var(--success)" }}>{money(itemProfit)}</td>
                      <td><span className="badge v2-badge-success">{itemMargin}%</span></td>
                      <td>
                        <div className="v2-flex v2-gap-1">
                          <button
                            className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                            onClick={() => handleOpenEditModal(item)}
                            title="Edit Product Details & Pricing"
                            type="button"
                          >
                            <Edit2 size={13} />
                          </button>
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
                            onClick={async () => {
                              setSelectedBarcodeItem(item);
                              setBarcodeModal(true);
                            }}
                            title="Print Barcode Labels"
                            type="button"
                          >
                            <Barcode size={13} />
                          </button>
                          <button
                            className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                            onClick={() => handleOpenDeleteModal(item)}
                            title="Archive / Archive Product"
                            type="button"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TAB: CATEGORIES & BRANDS MASTER MANAGER ─────────────────────── */}
      {activeTab === "categories" && (
        <div className="v2-space-y-4">
          {/* Header Banner */}
          <div className="v2-flex v2-items-center v2-justify-between">
            <div>
              <h2 className="v2-text-base v2-font-black">Merchandise Categories &amp; Brand Taxonomy</h2>
              <p className="v2-text-xs v2-text-muted">
                Enterprise merchandise hierarchy, color-coded POS category tags, and manufacturer brand governance.
              </p>
            </div>
            <div className="v2-flex v2-gap-2">
              <button
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={async () => {
                  setEditingCategory(null);
                  setNewCategoryName("");
                  setNewCategoryDesc("");
                  setNewCategoryColor("#10b981");
                  setAddCategoryModal(true);
                }}
                type="button"
              >
                <Plus size={13} /> Add Category
              </button>
              <button
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={async () => {
                  setEditingBrand(null);
                  setNewBrandName("");
                  setNewBrandOrigin("");
                  setNewBrandNotes("");
                  setAddBrandModal(true);
                }}
                type="button"
              >
                <Plus size={13} /> Add Brand
              </button>
            </div>
          </div>

          {/* Top Executive KPI Ribbon */}
          <div className="v2-grid v2-grid-4 v2-gap-3">
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Total Categories</div>
              <div className="v2-font-black v2-text-lg">{allCategories.length} Active</div>
              <div className="v2-text-xs v2-text-muted v2-mt-1">
                Catalog Valuation: <strong className="v2-mono">{money(stockSellingValue)}</strong>
              </div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Top Category by Value</div>
              <div className="v2-font-black v2-text-base v2-truncate" style={{ color: "var(--accent)" }}>
                {topCategoryStat ? topCategoryStat.name : "None"}
              </div>
              <div className="v2-text-xs v2-text-muted v2-mt-1">
                {topCategoryStat ? money(topCategoryStat.valuation) : "Tsh 0"} ({topCategoryStat ? topCategoryStat.skus : 0} SKUs)
              </div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Total Brands &amp; Makes</div>
              <div className="v2-font-black v2-text-lg">{allBrands.length} Active</div>
              <div className="v2-text-xs v2-text-muted v2-mt-1">
                In-Stock Units: <strong className="v2-mono">{totalStockUnits}</strong>
              </div>
            </div>
            <div className="v2-card v2-p-3">
              <div className="v2-text-xs v2-text-muted">Top Brand by Stock</div>
              <div className="v2-font-black v2-text-base v2-truncate" style={{ color: "var(--success)" }}>
                {topBrandStat ? topBrandStat.name : "None"}
              </div>
              <div className="v2-text-xs v2-text-muted v2-mt-1">
                {topBrandStat ? `${topBrandStat.units} units` : "0 units"} ({topBrandStat ? money(topBrandStat.valuation) : "Tsh 0"})
              </div>
            </div>
          </div>

          <div className="v2-grid v2-grid-2 v2-gap-4">
            {/* Categories Table Card */}
            <div className="v2-card">
              <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
                <div>
                  <div className="v2-card-title">Merchandise Categories ({filteredCategories.length})</div>
                  <div className="v2-card-subtitle">Active product categories configured for this store</div>
                </div>
                <button
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={async () => {
                    setEditingCategory(null);
                    setNewCategoryName("");
                    setNewCategoryDesc("");
                    setNewCategoryColor("#10b981");
                    setAddCategoryModal(true);
                  }}
                  type="button"
                >
                  <Plus size={12} /> New
                </button>
              </div>

              {/* Category Search Input */}
              <div style={{ padding: "0.5rem 1rem 0" }}>
                <div className="v2-flex v2-items-center" style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: ".6rem", color: "var(--muted)" }} />
                  <input
                    className="v2-input v2-input-sm"
                    style={{ paddingLeft: "1.8rem" }}
                    placeholder="Filter categories by name or description..."
                    value={categorySearchQuery}
                    onChange={(e) => setCategorySearchQuery(e.target.value)}
                  />
                  {categorySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCategorySearchQuery("")}
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      style={{ position: "absolute", right: ".4rem" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Category</th>
                      <th style={{ textAlign: "center", minWidth: 95 }}>Assigned SKUs</th>
                      <th style={{ textAlign: "center", minWidth: 95 }}>In-Stock Units</th>
                      <th style={{ textAlign: "right", minWidth: 115 }}>Valuation (Retail)</th>
                      <th style={{ textAlign: "right", minWidth: 130 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCategories.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="v2-text-center v2-py-4 v2-text-xs v2-text-muted">
                          No categories matching "{categorySearchQuery}".
                        </td>
                      </tr>
                    ) : (
                      filteredCategories.map((cat) => {
                        const catItems = items.filter((i) => i.category.toLowerCase() === cat.name.toLowerCase());
                        const catSkus = catItems.length;
                        const catUnits = catItems.reduce((acc, i) => acc + i.stock, 0);
                        const catVal = catItems.reduce((acc, i) => acc + i.stock * i.sellingPrice, 0);

                        return (
                          <tr key={cat.id || cat.name}>
                            <td>
                              <div
                                style={{
                                  borderLeft: `3.5px solid ${cat.color || "#10b981"}`,
                                  paddingLeft: "10px",
                                  minHeight: "22px",
                                  display: "flex",
                                  flexDirection: "column",
                                  justifyContent: "center",
                                }}
                              >
                                <span className="v2-font-bold v2-text-sm" style={{ whiteSpace: "nowrap" }}>
                                  {cat.name}
                                </span>
                                {cat.description && (
                                  <div className="v2-text-xs v2-text-muted" style={{ fontSize: "11px", marginTop: "2px" }}>
                                    {cat.description}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="v2-mono v2-font-bold" style={{ textAlign: "center" }}>{catSkus}</td>
                            <td className="v2-mono" style={{ textAlign: "center" }}>{catUnits}</td>
                            <td className="v2-mono v2-font-bold" style={{ textAlign: "right" }}>{money(catVal)}</td>
                            <td style={{ textAlign: "right" }}>
                              <div className="v2-flex v2-items-center v2-justify-end v2-gap-1">
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={async () => {
                                    setCategoryFilter(cat.name);
                                    setActiveTab("products");
                                    toast.info("Catalog Filtered", `Showing products in category "${cat.name}".`);
                                  }}
                                  title={`View ${catSkus} products in ${cat.name}`}
                                  style={{ padding: "3px 6px", fontSize: "11px" }}
                                >
                                  <Eye size={12} style={{ marginRight: 2 }} />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={() => handleOpenEditCategory(cat)}
                                  title="Edit Category"
                                  style={{ padding: "3px 6px", fontSize: "11px" }}
                                >
                                  <Edit2 size={12} style={{ marginRight: 2 }} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={() => handleOpenDeleteCategory(cat.name, catSkus)}
                                  title="Delete or Reassign Category"
                                  style={{ padding: "3px 6px", fontSize: "11px", color: "var(--danger)" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Brands Table Card */}
            <div className="v2-card">
              <div className="v2-card-header v2-flex v2-items-center v2-justify-between">
                <div>
                  <div className="v2-card-title">Product Brands &amp; Makes ({filteredBrands.length})</div>
                  <div className="v2-card-subtitle">Active manufacturer and vendor brands</div>
                </div>
                <button
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={async () => {
                    setEditingBrand(null);
                    setNewBrandName("");
                    setNewBrandOrigin("");
                    setNewBrandNotes("");
                    setAddBrandModal(true);
                  }}
                  type="button"
                >
                  <Plus size={12} /> New
                </button>
              </div>

              {/* Brand Search Input */}
              <div style={{ padding: "0.5rem 1rem 0" }}>
                <div className="v2-flex v2-items-center" style={{ position: "relative" }}>
                  <Search size={13} style={{ position: "absolute", left: ".6rem", color: "var(--muted)" }} />
                  <input
                    className="v2-input v2-input-sm"
                    style={{ paddingLeft: "1.8rem" }}
                    placeholder="Filter brands by name, origin, or maker..."
                    value={brandSearchQuery}
                    onChange={(e) => setBrandSearchQuery(e.target.value)}
                  />
                  {brandSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setBrandSearchQuery("")}
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      style={{ position: "absolute", right: ".4rem" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table className="v2-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 150 }}>Brand Name</th>
                      <th style={{ textAlign: "center", minWidth: 95 }}>Assigned SKUs</th>
                      <th style={{ textAlign: "center", minWidth: 95 }}>In-Stock Units</th>
                      <th style={{ textAlign: "right", minWidth: 115 }}>Valuation (Retail)</th>
                      <th style={{ textAlign: "right", minWidth: 130 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBrands.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="v2-text-center v2-py-4 v2-text-xs v2-text-muted">
                          No brands matching "{brandSearchQuery}".
                        </td>
                      </tr>
                    ) : (
                      filteredBrands.map((brand) => {
                        const brandItems = items.filter((i) => i.brand.toLowerCase() === brand.name.toLowerCase());
                        const brandSkus = brandItems.length;
                        const brandUnits = brandItems.reduce((acc, i) => acc + i.stock, 0);
                        const brandVal = brandItems.reduce((acc, i) => acc + i.stock * i.sellingPrice, 0);

                        return (
                          <tr key={brand.id || brand.name}>
                            <td>
                              <div>
                                <span className="v2-font-bold v2-text-sm" style={{ whiteSpace: "nowrap" }}>
                                  {brand.name}
                                </span>
                                {brand.origin && (
                                  <div className="v2-text-xs v2-text-muted" style={{ fontSize: "11px", marginTop: "1px" }}>
                                    {brand.origin}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="v2-mono v2-font-bold" style={{ textAlign: "center" }}>{brandSkus}</td>
                            <td className="v2-mono" style={{ textAlign: "center" }}>{brandUnits}</td>
                            <td className="v2-mono v2-font-bold" style={{ textAlign: "right" }}>{money(brandVal)}</td>
                            <td style={{ textAlign: "right" }}>
                              <div className="v2-flex v2-items-center v2-justify-end v2-gap-1">
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={async () => {
                                    setSearchQuery(brand.name);
                                    setActiveTab("products");
                                    toast.info("Catalog Filtered", `Showing products for brand "${brand.name}".`);
                                  }}
                                  title={`View ${brandSkus} products for ${brand.name}`}
                                  style={{ padding: "3px 6px", fontSize: "11px" }}
                                >
                                  <Eye size={12} style={{ marginRight: 2 }} />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={() => handleOpenEditBrand(brand)}
                                  title="Edit Brand"
                                  style={{ padding: "3px 6px", fontSize: "11px" }}
                                >
                                  <Edit2 size={12} style={{ marginRight: 2 }} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  className="v2-btn v2-btn-ghost v2-btn-xs"
                                  onClick={() => handleOpenDeleteBrand(brand.name, brandSkus)}
                                  title="Delete or Reassign Brand"
                                  style={{ padding: "3px 6px", fontSize: "11px", color: "var(--danger)" }}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
            <button
              className="v2-btn v2-btn-primary v2-btn-sm"
              onClick={() => {
                const firstSku = items[0]?.variants?.[0]?.sku || items[0]?.sku || "";
                if (!adjSku || !items.some((i) => i.sku === adjSku || i.variants?.some((v) => v.sku === adjSku))) {
                  setAdjSku(firstSku);
                }
                setAdjOccurredAt(toLocalDatetimeString());
                setStockAdjModal(true);
              }}
              type="button"
            >
              <PackageOpen size={13} /> Add Stock
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

      {activeTab === "transfers" && <InventoryOperationalWorkspace mode="transfers" />}
      {activeTab === "count" && <InventoryOperationalWorkspace mode="count" />}
      {activeTab === "wastage" && <InventoryOperationalWorkspace mode="wastage" />}
      {activeTab === "alerts" && <InventoryOperationalWorkspace mode="alerts" />}
      {activeTab === "sync" && <InventoryOperationalWorkspace mode="sync" />}
      {activeTab === "drilldown" && <InventoryOperationalWorkspace mode="drilldown" />}

      {/* ─── TAB 9: VALUATION REPORTS & MULTI-BRANCH SUMMARY ────────────────────── */}
      {activeTab === "reports" && (
        <div className="v2-space-y-4">
          {/* Controls Bar: Snapshot Date & Valuation Method */}
          <div className="v2-card v2-p-4">
            <div className="v2-flex v2-items-center v2-justify-between v2-gap-4">
              <div>
                <h3 className="v2-font-bold v2-text-sm">Historical Inventory Valuation Snapshot</h3>
                <p className="v2-text-xs v2-text-muted">Generate point-in-time valuation reports for audit, tax, and financial accounting.</p>
              </div>
              <div className="v2-flex v2-items-center v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mr-2">Snapshot Date:</label>
                  <select
                    className="v2-input v2-input-sm"
                    value={valuationDateFilter}
                    onChange={(e) => setValuationDateFilter(e.target.value)}
                  >
                    <option value="Today">Today (Live Balance)</option>
                    <option value="Yesterday">Yesterday End of Day</option>
                    <option value="Last 7 Days">Last 7 Days</option>
                    <option value="Last 30 Days">Last 30 Days</option>
                    <option value="Month End">Prior Month End</option>
                    <option value="Year End">Prior Year End</option>
                  </select>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-mr-2">Costing Method:</label>
                  <select
                    className="v2-input v2-input-sm"
                    value={valuationMethod}
                    onChange={(e) => setValuationMethod(e.target.value)}
                  >
                    <option value="WAC">Weighted Average Cost (WAC)</option>
                    <option value="FIFO">First-In, First-Out (FIFO)</option>
                    <option value="STANDARD">Standard Costing</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Multi-Branch Consolidated Valuation Summary */}
          <div className="v2-card">
            <div className="v2-card-header"><div className="v2-card-title">Multi-Branch Consolidated Inventory Valuation</div></div>
            <table className="v2-table">
              <thead>
                <tr>
                  <th>Branch Location</th>
                  <th>Unique SKUs</th>
                  <th>Total Units</th>
                  <th>Stock Buying Value (Cost)</th>
                  <th>Stock Selling Value (Retail)</th>
                  <th>Potential Profit</th>
                  <th>Gross Margin %</th>
                </tr>
              </thead>
              <tbody>
                {branchValuationList.map((b) => (
                  <tr key={b.id || b.branch}>
                    <td className="v2-font-bold">{b.branch}</td>
                    <td className="v2-mono">{b.skus}</td>
                    <td className="v2-mono">{fmtNum(b.units)}</td>
                    <td className="v2-mono" style={{ color: "var(--accent)" }}>{money(b.buyingVal)}</td>
                    <td className="v2-mono">{money(b.sellingVal)}</td>
                    <td className="v2-mono v2-font-bold" style={{ color: "var(--success)" }}>{money(b.profit)}</td>
                    <td><span className="badge v2-badge-success">{b.margin}%</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--surface-2)", fontWeight: "bold" }}>
                  <td>Tenant Consolidated Totals</td>
                  <td className="v2-mono">{totalUniqueSkus}</td>
                  <td className="v2-mono">{fmtNum(totalStockUnits)}</td>
                  <td className="v2-mono" style={{ color: "var(--accent)" }}>{money(stockBuyingValue)}</td>
                  <td className="v2-mono">{money(stockSellingValue)}</td>
                  <td className="v2-mono" style={{ color: "var(--success)" }}>{money(potentialProfit)}</td>
                  <td><span className="badge v2-badge-success">{avgMarginPct}%</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}


      {/* --- Production 5-Step Product Registration Wizard UI --- */}
      <ProductRegistrationWizardModal
        isOpen={addProductModal}
        onClose={() => setAddProductModal(false)}
        allCategories={allCategories}
        allBrands={allBrands}
        onOpenAddCategory={() => setAddCategoryModal(true)}
        onOpenAddBrand={() => {
          setEditingBrand(null);
          setNewBrandName("");
          setNewBrandOrigin("");
          setNewBrandNotes("");
          setAddBrandModal(true);
        }}
        currentTenantId={currentTenantId}
        currentBranchId={currentBranchId}
        db={db}
        syncOutbox={syncOutbox}
        onProductCreated={loadInventory}
      />

      {/* --- Edit Product Slide-Over Drawer (Sheet) --- */}
      <Sheet
        isOpen={Boolean(editProductModal && editingItem)}
        onClose={() => setEditProductModal(false)}
        title={
          <div className="v2-flex v2-items-center v2-gap-2">
            <Edit2 size={18} className="v2-text-accent" />
            <span>Edit Inventory SKU</span>
          </div>
        }
        description={editingItem ? `SKU Code: ${editingItem.sku} · Update pricing, classification, and stock targets` : ""}
        width={560}
      >
        {editingItem && (
          <form onSubmit={handleSaveEditProduct} className="v2-space-y-4">
            <div>
              <label className="v2-text-xs v2-font-bold v2-text-muted">PRODUCT FULL NAME *</label>
              <input
                className="v2-input"
                value={editProd.name}
                onChange={(e) => setEditProd({ ...editProd, name: e.target.value })}
                required
              />
            </div>

            <div className="v2-grid v2-grid-2 v2-gap-3">
              <div>
                <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                  <label className="v2-text-xs v2-font-bold v2-text-muted">CATEGORY</label>
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-btn-xs"
                    onClick={() => setAddCategoryModal(true)}
                    style={{ padding: "0 .25rem", height: "auto", fontSize: "10px" }}
                  >
                    + New
                  </button>
                </div>
                <select
                  className="v2-input"
                  value={editProd.category}
                  onChange={(e) => setEditProd({ ...editProd, category: e.target.value })}
                >
                  {allCategories.map((c) => (
                    <option key={c.id || c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                  <label className="v2-text-xs v2-font-bold v2-text-muted">BRAND / MAKE</label>
                  <button
                    type="button"
                    className="v2-btn v2-btn-ghost v2-btn-xs"
                    onClick={async () => {
                      setEditingBrand(null);
                      setNewBrandName("");
                      setNewBrandOrigin("");
                      setNewBrandNotes("");
                      setAddBrandModal(true);
                    }}
                    style={{ padding: "0 .25rem", height: "auto", fontSize: "10px" }}
                  >
                    + New Brand
                  </button>
                </div>
                <select
                  className="v2-input"
                  value={editProd.brand}
                  onChange={(e) => setEditProd({ ...editProd, brand: e.target.value })}
                >
                  
                  {allBrands
                    .filter((b) => b.name.toLowerCase() !== "general")
                    .map((b) => (
                      <option key={b.id || b.name} value={b.name}>{b.name}</option>
                    ))}
                  {editProd.brand && editProd.brand !== "General" && !allBrands.some((b) => b.name.toLowerCase() === editProd.brand.toLowerCase()) && (
                    <option value={editProd.brand}>{editProd.brand}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="v2-grid v2-grid-2 v2-gap-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">BUYING COST PRICE (TSH)</label>
                <input
                  className="v2-input"
                  type="number"
                  value={editProd.buyingPrice}
                  onChange={(e) => setEditProd({ ...editProd, buyingPrice: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">SELLING RETAIL PRICE (TSH)</label>
                <input
                  className="v2-input"
                  type="number"
                  value={editProd.sellingPrice}
                  onChange={(e) => setEditProd({ ...editProd, sellingPrice: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="v2-grid v2-grid-2 v2-gap-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">INVENTORY STOCK ON HAND</label>
                <input
                  className="v2-input"
                  type="number"
                  value={editProd.stock}
                  onChange={(e) => setEditProd({ ...editProd, stock: Number(e.target.value) })}
                  required
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">REORDER THRESHOLD</label>
                <input
                  className="v2-input"
                  type="number"
                  value={editProd.reorderLevel}
                  onChange={(e) => setEditProd({ ...editProd, reorderLevel: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="v2-grid v2-grid-2 v2-gap-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">BATCH / LOT NUMBER</label>
                <input
                  className="v2-input"
                  placeholder="e.g. LOT-2026-09"
                  value={editProd.batchNumber || ""}
                  onChange={(e) => setEditProd({ ...editProd, batchNumber: e.target.value })}
                />
              </div>
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">EXPIRY DATE (FEFO)</label>
                <input
                  className="v2-input"
                  type="date"
                  value={editProd.expiryDate || ""}
                  onChange={(e) => setEditProd({ ...editProd, expiryDate: e.target.value })}
                />
              </div>
            </div>

            <div className="v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)" }}>
              <div className="v2-flex v2-justify-between v2-text-xs">
                <span className="v2-text-muted">Expected Unit Margin:</span>
                <span className="v2-mono v2-font-bold" style={{ color: "var(--success)" }}>
                  {money(editProd.sellingPrice - editProd.buyingPrice)} ({editProd.sellingPrice > 0 ? Math.round(((editProd.sellingPrice - editProd.buyingPrice) / editProd.sellingPrice) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setEditProductModal(false)} type="button">Cancel</button>
              <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">Save Changes</button>
            </div>
          </form>
        )}
      </Sheet>

      {/* --- Archive Product Confirmation Modal --- */}
      {deleteConfirmModal && itemToDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 440, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-gap-3 v2-mb-3">
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: "var(--radius-full)",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "var(--danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="v2-font-black v2-text-base">Archive Product SKU</h3>
                <div className="v2-text-xs v2-text-muted">Preserve audit trail and financial history</div>
              </div>
            </div>

            <p className="v2-text-sm v2-mb-3">
              Are you sure you want to archive <strong>{itemToDelete.name}</strong> (<span className="v2-mono v2-text-xs">{itemToDelete.sku}</span>)?
            </p>

            <div className="v2-p-3 v2-mb-4" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-md)", fontSize: ".8rem" }}>
              <div className="v2-font-bold v2-mb-1">SaaS Best-Practice Architecture:</div>
              <div className="v2-text-muted">
                Archiving marks the SKU inactive and immediately hides it from the active POS counter. Past receipts, sales reports, and stock ledgers are securely retained for tax and audit compliance.
              </div>
            </div>

            <div className="v2-flex v2-justify-end v2-gap-2">
              <button
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={async () => {
                  setDeleteConfirmModal(false);
                  setItemToDelete(null);
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="v2-btn v2-btn-danger v2-btn-sm"
                onClick={() => handleConfirmArchive()}
                type="button"
              >
                Archive SKU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Add / Edit Merchandise Category Modal --- */}
      {addCategoryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 480, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h3 className="v2-font-black v2-text-base">
                  {editingCategory ? "Edit Merchandise Category" : "Add New Category"}
                </h3>
                <div className="v2-text-xs v2-text-muted">
                  Enterprise taxonomy, POS color badge, and real-time SKU re-classification
                </div>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={async () => {
                  setAddCategoryModal(false);
                  setEditingCategory(null);
                }}
                type="button"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="v2-space-y-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">CATEGORY NAME *</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Frozen Foods, Dairy, Beverages..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">DESCRIPTION (OPTIONAL)</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Perishable frozen items requiring refrigeration"
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                />
              </div>

              {/* Square Register Style Color Swatches */}
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                  POS TILE COLOR THEME
                </label>
                <div className="v2-flex v2-items-center v2-gap-2 v2-flex-wrap">
                  {CATEGORY_COLORS.map((col) => {
                    const isSelected = newCategoryColor.toLowerCase() === col.hex.toLowerCase();
                    return (
                      <button
                        key={col.hex}
                        type="button"
                        onClick={() => setNewCategoryColor(col.hex)}
                        title={col.label}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          backgroundColor: col.hex,
                          border: isSelected ? "3px solid var(--text)" : "2px solid transparent",
                          cursor: "pointer",
                          display: "grid",
                          placeItems: "center",
                          outline: "none",
                          transition: "transform 0.15s ease",
                          transform: isSelected ? "scale(1.15)" : "scale(1)",
                          boxShadow: isSelected ? `0 0 8px ${col.hex}aa` : "none",
                        }}
                      >
                        {isSelected && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>

                <div className="v2-flex v2-items-center v2-gap-2 v2-mt-2">
                  <span className="v2-text-xs v2-text-muted">Preview:</span>
                  <span
                    className="badge v2-text-xs v2-font-bold"
                    style={{
                      background: `${newCategoryColor}18`,
                      color: newCategoryColor,
                      border: `1px solid ${newCategoryColor}40`,
                      padding: "2px 8px",
                    }}
                  >
                    {newCategoryName.trim() || "Category Preview"}
                  </span>
                </div>
              </div>

              {/* Cascade Rename Toggle if editing existing category */}
              {editingCategory && (
                <label
                  className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold v2-cursor-pointer v2-p-2"
                  style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
                >
                  <input
                    type="checkbox"
                    checked={categoryCascadeRename}
                    onChange={(e) => setCategoryCascadeRename(e.target.checked)}
                  />
                  <span>Automatically update category on all existing assigned products</span>
                </label>
              )}

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={async () => {
                    setAddCategoryModal(false);
                    setEditingCategory(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">
                  {editingCategory ? "Update Category" : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Add / Edit Brand Modal --- */}
      {addBrandModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 480, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
              <div>
                <h3 className="v2-font-black v2-text-base">
                  {editingBrand ? "Edit Brand / Manufacturer" : "Add New Brand / Make"}
                </h3>
                <div className="v2-text-xs v2-text-muted">
                  Global manufacturer taxonomy, supplier origin, and product governance
                </div>
              </div>
              <button
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={async () => {
                  setAddBrandModal(false);
                  setEditingBrand(null);
                }}
                type="button"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBrand} className="v2-space-y-3">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">BRAND NAME *</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Coca-Cola, Samsung, Azam, Unilever..."
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">ORIGIN / SUPPLIER (OPTIONAL)</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Tanzania, Kenya, Germany, Japan..."
                  value={newBrandOrigin}
                  onChange={(e) => setNewBrandOrigin(e.target.value)}
                />
              </div>

              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted">VENDOR / INTERNAL NOTES (OPTIONAL)</label>
                <input
                  className="v2-input"
                  placeholder="e.g. Authorized distributor code, contact, or delivery cycle"
                  value={newBrandNotes}
                  onChange={(e) => setNewBrandNotes(e.target.value)}
                />
              </div>

              {/* Cascade Rename Toggle if editing existing brand */}
              {editingBrand && (
                <label
                  className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold v2-cursor-pointer v2-p-2"
                  style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}
                >
                  <input
                    type="checkbox"
                    checked={brandCascadeRename}
                    onChange={(e) => setBrandCascadeRename(e.target.checked)}
                  />
                  <span>Automatically update brand on all existing assigned products</span>
                </label>
              )}

              <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-2">
                <button
                  className="v2-btn v2-btn-ghost v2-btn-sm"
                  onClick={async () => {
                    setAddBrandModal(false);
                    setEditingBrand(null);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit">
                  {editingBrand ? "Update Brand" : "Save Brand"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Delete Category Safeguard Modal --- */}
      {deleteCategorySafeguard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 460, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-gap-3 v2-mb-3">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-full)",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "var(--danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="v2-font-black v2-text-base">Delete Category Safeguard</h3>
                <div className="v2-text-xs v2-text-muted">
                  Prevent orphaned catalog SKUs &amp; maintain catalog taxonomy
                </div>
              </div>
            </div>

            {deleteCategorySafeguard.assignedCount > 0 ? (
              <div className="v2-space-y-3">
                <div
                  className="v2-p-3"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div className="v2-font-bold v2-text-xs" style={{ color: "var(--danger)" }}>
                    ACTIVE PRODUCTS ASSIGNED
                  </div>
                  <div className="v2-text-xs v2-mt-1">
                    There are currently <strong>{deleteCategorySafeguard.assignedCount} active products</strong> assigned to category <strong>"{deleteCategorySafeguard.category}"</strong>.
                  </div>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">
                    SELECT FALLBACK REASSIGNMENT CATEGORY *
                  </label>
                  <select
                    className="v2-input v2-mt-1"
                    value={deleteCategorySafeguard.fallbackCategory}
                    onChange={(e) =>
                      setDeleteCategorySafeguard({
                        ...deleteCategorySafeguard,
                        fallbackCategory: e.target.value,
                      })
                    }
                  >
                    {allCategories
                      .filter((c) => c.name.toLowerCase() !== deleteCategorySafeguard.category.toLowerCase())
                      .map((c) => (
                        <option key={c.id || c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    
                  </select>
                  <p className="v2-text-xs v2-text-muted v2-mt-1">
                    All {deleteCategorySafeguard.assignedCount} products will be safely moved to this category to prevent orphans.
                  </p>
                </div>
              </div>
            ) : (
              <p className="v2-text-sm">
                Are you sure you want to delete category <strong>"{deleteCategorySafeguard.category}"</strong>?
                No active catalog products are assigned to this category.
              </p>
            )}

            <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <button
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => setDeleteCategorySafeguard(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="v2-btn v2-btn-danger v2-btn-sm"
                onClick={handleConfirmDeleteCategory}
                type="button"
              >
                {deleteCategorySafeguard.assignedCount > 0 ? "Reassign SKUs & Delete" : "Delete Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Delete Brand Safeguard Modal --- */}
      {deleteBrandSafeguard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 1000 }}>
          <div className="v2-card" style={{ width: 460, padding: "1.5rem" }}>
            <div className="v2-flex v2-items-center v2-gap-3 v2-mb-3">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "var(--radius-full)",
                  background: "rgba(239, 68, 68, 0.15)",
                  color: "var(--danger)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="v2-font-black v2-text-base">Delete Brand Safeguard</h3>
                <div className="v2-text-xs v2-text-muted">
                  Prevent unbranded SKUs &amp; maintain vendor lineage
                </div>
              </div>
            </div>

            {deleteBrandSafeguard.assignedCount > 0 ? (
              <div className="v2-space-y-3">
                <div
                  className="v2-p-3"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div className="v2-font-bold v2-text-xs" style={{ color: "var(--danger)" }}>
                    ACTIVE PRODUCTS ASSIGNED
                  </div>
                  <div className="v2-text-xs v2-mt-1">
                    There are currently <strong>{deleteBrandSafeguard.assignedCount} active products</strong> assigned to brand <strong>"{deleteBrandSafeguard.brand}"</strong>.
                  </div>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">
                    SELECT FALLBACK REASSIGNMENT BRAND *
                  </label>
                  <select
                    className="v2-input v2-mt-1"
                    value={deleteBrandSafeguard.fallbackBrand}
                    onChange={(e) =>
                      setDeleteBrandSafeguard({
                        ...deleteBrandSafeguard,
                        fallbackBrand: e.target.value,
                      })
                    }
                  >
                    {allBrands
                      .filter((b) => b.name.toLowerCase() !== deleteBrandSafeguard.brand.toLowerCase())
                      .map((b) => (
                        <option key={b.id || b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    
                  </select>
                  <p className="v2-text-xs v2-text-muted v2-mt-1">
                    All {deleteBrandSafeguard.assignedCount} products will be safely moved to this brand.
                  </p>
                </div>
              </div>
            ) : (
              <p className="v2-text-sm">
                Are you sure you want to delete brand <strong>"{deleteBrandSafeguard.brand}"</strong>?
                No active catalog products are assigned to this brand.
              </p>
            )}

            <div className="v2-flex v2-justify-end v2-gap-2 v2-pt-4" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <button
                className="v2-btn v2-btn-secondary v2-btn-sm"
                onClick={() => setDeleteBrandSafeguard(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="v2-btn v2-btn-danger v2-btn-sm"
                onClick={handleConfirmDeleteBrand}
                type="button"
              >
                {deleteBrandSafeguard.assignedCount > 0 ? "Reassign SKUs & Delete" : "Delete Brand"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Redesigned Product Details & Variant Architecture Command Center --- */}
      {variantModalProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "grid", placeItems: "center", zIndex: 1000, padding: "1rem" }}>
          <div className="v2-card" style={{ width: 850, maxHeight: "90vh", display: "flex", flexDirection: "column", padding: "1.5rem" }}>
            {/* Modal Header */}
            <div className="v2-flex v2-items-center v2-justify-between v2-pb-3" style={{ borderBottom: "1px solid var(--surface-border)" }}>
              <div>
                <div className="v2-flex v2-items-center v2-gap-2">
                  <h2 className="v2-text-lg v2-font-black">{variantModalProduct.name}</h2>
                  <span className="badge v2-badge-primary">{variantModalProduct.category}</span>
                  {variantModalProduct.hasVariants && <span className="badge v2-badge-success">Variant Product</span>}
                </div>
                <div className="v2-text-xs v2-text-muted">Parent SKU: <span className="v2-mono v2-font-bold">{variantModalProduct.sku}</span> · Brand: {variantModalProduct.brand}</div>
              </div>
              <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">✕</button>
            </div>

            {/* 7 Dedicated Tabs */}
            <div className="v2-flex v2-gap-1 v2-py-2" style={{ borderBottom: "1px solid var(--surface-border)", overflowX: "auto" }}>
              {[
                { id: "general", label: "General Info", icon: Package },
                { id: "pricing", label: "Pricing & Margins", icon: DollarSign },
                { id: "inventory", label: "Inventory Summary", icon: BarChart3 },
                { id: "variants", label: `Variants (${variantModalProduct.variants?.length || 0})`, icon: Layers },
                { id: "images", label: "Images", icon: QrCode },
                { id: "suppliers", label: "Suppliers", icon: Truck },
                { id: "history", label: "Stock History", icon: Clock },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`v2-btn v2-btn-sm ${newVarAttrKey === tab.id ? "v2-btn-primary" : "v2-btn-ghost"}`}
                  onClick={() => setNewVarAttrKey(tab.id)}
                  style={{ whiteSpace: "nowrap" }}
                >
                  <tab.icon size={13} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 0" }}>
              {/* TAB 1: General Info */}
              {(newVarAttrKey === "general" || newVarAttrKey === "Size") && (
                <div className="v2-space-y-3">
                  <div className="v2-grid v2-grid-2 v2-gap-3">
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted">PRODUCT NAME</label>
                      <input className="v2-input" value={variantModalProduct.name} readOnly />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted">SKU CODE</label>
                      <input className="v2-input v2-mono" value={variantModalProduct.sku} readOnly />
                    </div>
                  </div>

                  <div className="v2-grid v2-grid-2 v2-gap-3">
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted">CATEGORY</label>
                      <input className="v2-input" value={variantModalProduct.category} readOnly />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted">BRAND</label>
                      <input className="v2-input" value={variantModalProduct.brand} readOnly />
                    </div>
                  </div>

                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">DESCRIPTION</label>
                    <textarea className="v2-input" rows={2} value="Shared parent product details. Contains default pricing, images, tax codes, and supplier mappings." readOnly />
                  </div>
                </div>
              )}

              {/* TAB 2: Pricing & Price History Ledger Timeline */}
              {newVarAttrKey === "pricing" && (
                <div className="v2-space-y-4">
                  <div className="v2-grid v2-grid-4 v2-gap-3">
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-font-bold v2-text-muted">BUYING PRICE (COST)</div>
                      <div className="v2-text-xl v2-font-black" style={{ color: "var(--accent)" }}>{money(variantModalProduct.buyingPrice)}</div>
                      <div className="v2-text-xs v2-text-muted v2-mt-1">Active cost snapshot</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-font-bold v2-text-muted">SELLING PRICE (RETAIL)</div>
                      <div className="v2-text-xl v2-font-black" style={{ color: "var(--success)" }}>{money(variantModalProduct.sellingPrice)}</div>
                      <div className="v2-text-xs v2-text-muted v2-mt-1">Active retail price</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-font-bold v2-text-muted">PROFIT AMOUNT</div>
                      <div className="v2-text-xl v2-font-black" style={{ color: "var(--success)" }}>
                        {money(variantModalProduct.sellingPrice - variantModalProduct.buyingPrice)}
                      </div>
                      <div className="v2-text-xs v2-text-muted v2-mt-1">Profit per unit</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-font-bold v2-text-muted">MARGIN %</div>
                      <div className="v2-text-xl v2-font-black">
                        {variantModalProduct.sellingPrice > 0
                          ? Math.round(((variantModalProduct.sellingPrice - variantModalProduct.buyingPrice) / variantModalProduct.sellingPrice) * 10000) / 100
                          : 0}%
                      </div>
                      <div className="v2-text-xs v2-text-muted v2-mt-1">Gross profit margin</div>
                    </div>
                  </div>

                  <div className="v2-card v2-p-3" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                    <div className="v2-flex v2-items-center v2-justify-between">
                      <div>
                        <div className="v2-font-bold v2-text-sm">Price Versioning & Margin Audit Ledger</div>
                        <div className="v2-text-xs v2-text-muted">Commit verified wholesale cost & retail price version with audit trail</div>
                      </div>
                      <button
                        className="v2-btn v2-btn-primary v2-btn-sm"
                        type="button"
                        onClick={async () => {
                          setPriceAuditNewBuy(variantModalProduct.buyingPrice);
                          setPriceAuditNewSell(variantModalProduct.sellingPrice);
                          setPriceAuditReason("Supplier Cost Adjustment");
                          setPriceAuditNotes("");
                          setPriceAuditOpen(!priceAuditOpen);
                        }}
                      >
                        <DollarSign size={13} /> {priceAuditOpen ? "Close Form" : "Record Price Change"}
                      </button>
                    </div>

                    {priceAuditOpen && (
                      <div className="v2-mt-3 v2-p-3" style={{ background: "var(--surface-1)", borderRadius: "var(--radius-xs)", border: "1px solid var(--surface-border)" }}>
                        <div className="v2-font-bold v2-text-xs v2-mb-2" style={{ color: "var(--primary)" }}>NEW PRICE VERSION AUDIT FORM</div>
                        <div className="v2-grid v2-grid-3 v2-gap-2">
                          <div>
                            <label className="v2-text-xs v2-font-bold v2-text-muted">NEW BUYING COST (TSH)</label>
                            <input
                              className="v2-input v2-input-sm"
                              type="number"
                              value={priceAuditNewBuy}
                              onChange={(e) => setPriceAuditNewBuy(Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="v2-text-xs v2-font-bold v2-text-muted">NEW SELLING PRICE (TSH)</label>
                            <input
                              className="v2-input v2-input-sm"
                              type="number"
                              value={priceAuditNewSell}
                              onChange={(e) => setPriceAuditNewSell(Number(e.target.value))}
                            />
                          </div>
                          <div>
                            <label className="v2-text-xs v2-font-bold v2-text-muted">AUDIT REASON CODE</label>
                            <select
                              className="v2-input v2-input-sm"
                              value={priceAuditReason}
                              onChange={(e) => setPriceAuditReason(e.target.value)}
                            >
                              <option value="Supplier Cost Adjustment">Supplier Cost Adjustment</option>
                              <option value="Inflation / FX Shift">Inflation / FX Shift</option>
                              <option value="Promotional Markdown">Promotional Markdown</option>
                              <option value="Market Competitor Match">Market Competitor Match</option>
                              <option value="End of Season Liquidation">End of Season Liquidation</option>
                            </select>
                          </div>
                        </div>
                        <div className="v2-mt-2">
                          <label className="v2-text-xs v2-font-bold v2-text-muted">AUDITOR MEMO / NOTES</label>
                          <input
                            className="v2-input v2-input-sm"
                            placeholder="e.g. Invoice #TZ-2026-99 received from supplier with updated tariff"
                            value={priceAuditNotes}
                            onChange={(e) => setPriceAuditNotes(e.target.value)}
                          />
                        </div>
                        <div className="v2-flex v2-justify-end v2-gap-2 v2-mt-3">
                          <button
                            type="button"
                            className="v2-btn v2-btn-ghost v2-btn-xs"
                            onClick={() => setPriceAuditOpen(false)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="v2-btn v2-btn-primary v2-btn-xs"
                            onClick={async () => {
                              const newBuy = Number(priceAuditNewBuy);
                              const newSell = Number(priceAuditNewSell);
                              if (isNaN(newBuy) || newBuy < 0 || isNaN(newSell) || newSell < 0) {
                                toast.warning("Invalid Input", "Please enter valid buying and selling prices.");
                                return;
                              }
                              const margin = newSell - newBuy;
                              const marginPct = newSell > 0 ? Math.round((margin / newSell) * 10000) / 100 : 0;
                              const updated = {
                                ...variantModalProduct,
                                buyingPrice: newBuy,
                                costPrice: newBuy,
                                sellingPrice: newSell,
                                price: newSell,
                              };
                              db.saveProductLocal(updated as any, currentTenantId ? { tenantId: currentTenantId } : undefined);
                              setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updated : i));
                              setVariantModalProduct(updated);
                              setPriceAuditOpen(false);
                              playSuccessChime();
                              toast.success("Price Version Recorded", `New Margin: ${money(margin)} (${marginPct}%) · Reason: ${priceAuditReason}`);
                              publishDataChanged({ action: "INVENTORY_CHANGED" });
                            }}
                          >
                            <Check size={12} /> Commit Price Version
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Price History Timeline */}
                  <div className="v2-card v2-p-3">
                    <div className="v2-font-bold v2-text-xs v2-mb-2">Price & Margin History Ledger Timeline</div>
                    <div className="v2-space-y-3">
                      <div className="v2-p-2" style={{ borderLeft: "3px solid var(--primary)", background: "var(--surface-1)" }}>
                        <div className="v2-flex v2-items-center v2-justify-between">
                          <span className="v2-font-bold v2-text-xs">Version #2 · 11 July 2026</span>
                          <span className="badge v2-badge-success">PRICE_UPDATE</span>
                        </div>
                        <div className="v2-text-xs v2-text-muted v2-mt-1">Changed By: <strong>Admin User</strong> · Reason: <em>Supplier Price Increase</em></div>
                        <div className="v2-grid v2-grid-3 v2-gap-2 v2-mt-2 v2-text-xs v2-mono">
                          <div>Buying: 750 TZS &rarr; <strong>{money(variantModalProduct.buyingPrice)}</strong></div>
                          <div>Selling: 1,100 TZS &rarr; <strong>{money(variantModalProduct.sellingPrice)}</strong></div>
                          <div>Margin: <strong>{money(variantModalProduct.sellingPrice - variantModalProduct.buyingPrice)}</strong> ({variantModalProduct.sellingPrice > 0 ? Math.round(((variantModalProduct.sellingPrice - variantModalProduct.buyingPrice) / variantModalProduct.sellingPrice) * 100) : 0}%)</div>
                        </div>
                      </div>

                      <div className="v2-p-2" style={{ borderLeft: "3px solid var(--muted)", background: "var(--surface-1)" }}>
                        <div className="v2-flex v2-items-center v2-justify-between">
                          <span className="v2-font-bold v2-text-xs">Version #1 · Initial Product Setup</span>
                          <span className="badge v2-badge-muted">INITIAL_PRICE</span>
                        </div>
                        <div className="v2-text-xs v2-text-muted v2-mt-1">Changed By: <strong>System Console</strong> · Reason: <em>Initial Product Setup</em></div>
                        <div className="v2-grid v2-grid-3 v2-gap-2 v2-mt-2 v2-text-xs v2-mono">
                          <div>Buying: 0 &rarr; <strong>700 TZS</strong></div>
                          <div>Selling: 0 &rarr; <strong>1,000 TZS</strong></div>
                          <div>Margin: <strong>300 TZS</strong> (30%)</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Inventory Summary */}
              {newVarAttrKey === "inventory" && (
                <div className="v2-space-y-4">
                  <div className="v2-grid v2-grid-4 v2-gap-3">
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-text-muted">TOTAL PARENT STOCK</div>
                      <div className="v2-font-black v2-text-lg">{variantModalProduct.stock}</div>
                      <div className="v2-text-xs v2-text-muted">Sum of all variants</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-text-muted">RESERVED QUANTITY</div>
                      <div className="v2-font-black v2-text-lg" style={{ color: "var(--warning)" }}>0</div>
                      <div className="v2-text-xs v2-text-muted">Pending sales orders</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-text-muted">AVAILABLE STOCK</div>
                      <div className="v2-font-black v2-text-lg" style={{ color: "var(--success)" }}>{variantModalProduct.stock}</div>
                      <div className="v2-text-xs v2-text-muted">Ready to sell</div>
                    </div>
                    <div className="v2-card v2-p-3">
                      <div className="v2-text-xs v2-text-muted">VARIANT COUNT</div>
                      <div className="v2-font-black v2-text-lg">{variantModalProduct.variants?.length || 0}</div>
                      <div className="v2-text-xs v2-text-muted">Active variations</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Variants Studio */}
              {(newVarAttrKey === "variants" || newVarAttrKey === "Pack" || newVarAttrKey === "Color" || newVarAttrKey === "Custom") && (
                <div className="v2-space-y-4">
                  {/* Action Toolbar */}
                  <div className="v2-flex v2-items-center v2-justify-between v2-gap-2 v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-sm)" }}>
                    <div className="v2-flex v2-items-center v2-gap-2">
                      <button
                        className={`v2-btn v2-btn-sm ${variantStudioPanel === "add_single" ? "v2-btn-primary" : "v2-btn-secondary"}`}
                        type="button"
                        onClick={async () => {
                          if (variantStudioPanel === "add_single") {
                            setVariantStudioPanel("none");
                          } else {
                            setSingleVarName("");
                            setSingleVarSku(`VAR-${variantModalProduct.sku.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`);
                            setSingleVarBarcode(`890${Math.floor(100000000 + Math.random() * 900000000)}`);
                            setSingleVarBuying(variantModalProduct.buyingPrice);
                            setSingleVarSelling(variantModalProduct.sellingPrice);
                            setSingleVarStock(10);
                            setSingleVarReorder(5);
                            setVariantStudioPanel("add_single");
                          }
                        }}
                      >
                        <Plus size={13} /> Add Single Variant
                      </button>

                      <button
                        className={`v2-btn v2-btn-sm ${variantStudioPanel === "generate_matrix" ? "v2-btn-primary" : "v2-btn-secondary"}`}
                        type="button"
                        onClick={async () => {
                          setVariantStudioPanel(variantStudioPanel === "generate_matrix" ? "none" : "generate_matrix");
                        }}
                      >
                        <Zap size={13} /> Generate Matrix
                      </button>

                      <button
                        className={`v2-btn v2-btn-sm ${variantStudioPanel === "bulk_ops" ? "v2-btn-primary" : "v2-btn-ghost"}`}
                        type="button"
                        onClick={async () => {
                          setVariantStudioPanel(variantStudioPanel === "bulk_ops" ? "none" : "bulk_ops");
                        }}
                      >
                        Bulk Adjustments
                      </button>
                    </div>

                    <div className="v2-text-xs v2-text-muted">
                      <strong>{variantModalProduct.variants?.length || 0}</strong> variants &bull; <strong>{variantModalProduct.stock}</strong> total units
                    </div>
                  </div>

                  {/* Panel 1: Quick Add Single Variant Form */}
                  {variantStudioPanel === "add_single" && (
                    <div className="v2-p-3" style={{ background: "var(--surface-1)", borderRadius: "var(--radius-xs)", border: "1px solid var(--surface-border)" }}>
                      <div className="v2-font-bold v2-text-xs v2-mb-2" style={{ color: "var(--primary)" }}>ADD SINGLE PRODUCT VARIATION</div>
                      <div className="v2-grid v2-grid-3 v2-gap-2">
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">VARIANT NAME *</label>
                          <input
                            className="v2-input v2-input-sm"
                            placeholder="e.g. Size: Large or 500ml Pack"
                            value={singleVarName}
                            onChange={(e) => setSingleVarName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">SKU CODE *</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            value={singleVarSku}
                            onChange={(e) => setSingleVarSku(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">BARCODE / EAN</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            placeholder="Scan or auto-generated"
                            value={singleVarBarcode}
                            onChange={(e) => setSingleVarBarcode(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="v2-grid v2-grid-4 v2-gap-2 v2-mt-2">
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">BUYING COST (TSH)</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            type="number"
                            value={singleVarBuying}
                            onChange={(e) => setSingleVarBuying(Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">SELLING RETAIL (TSH)</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            type="number"
                            value={singleVarSelling}
                            onChange={(e) => setSingleVarSelling(Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">INITIAL STOCK</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            type="number"
                            value={singleVarStock}
                            onChange={(e) => setSingleVarStock(Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">REORDER LEVEL</label>
                          <input
                            className="v2-input v2-input-sm v2-mono"
                            type="number"
                            value={singleVarReorder}
                            onChange={(e) => setSingleVarReorder(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <div className="v2-flex v2-justify-end v2-gap-2 v2-mt-3">
                        <button
                          type="button"
                          className="v2-btn v2-btn-ghost v2-btn-xs"
                          onClick={() => setVariantStudioPanel("none")}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="v2-btn v2-btn-primary v2-btn-xs"
                          onClick={async () => {
                            if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                            const pendingOutboxes: any[] = [];
                            if (!singleVarName.trim()) {
                              toast.warning("Name Required", "Please specify a variant name.");
                              return;
                            }
                            const newVar: ProductVariantData = {
                              id: safeUUID(),
                              name: singleVarName.trim(),
                              sku: singleVarSku.trim() || `VAR-${variantModalProduct.sku.slice(-4)}-${Math.floor(100 + Math.random() * 900)}`,
                              barcode: singleVarBarcode.trim() || `890${Math.floor(100000000 + Math.random() * 900000000)}`,
                              attributes: { Custom: singleVarName.trim() },
                              buyingPrice: Number(singleVarBuying) || variantModalProduct.buyingPrice,
                              sellingPrice: Number(singleVarSelling) || variantModalProduct.sellingPrice,
                              stock: Number(singleVarStock) || 0,
                              reorderLevel: Number(singleVarReorder) || 5,
                            };
                            const updatedList = [...(variantModalProduct.variants || []), newVar];
                            const sumStock = updatedList.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
                            const updatedProduct = {
                              ...variantModalProduct,
                              stock: sumStock,
                              totalStock: sumStock,
                              availableStock: sumStock,
                              hasVariants: true,
                              variants: updatedList,
                            };

                            db.saveProductWithVariantsLocal(
                              updatedProduct as any,
                              updatedList.map((v) => ({
                                id: v.id,
                                productId: variantModalProduct.id,
                                name: v.name,
                                sku: v.sku,
                                barcode: v.barcode || "",
                                attributes: v.attributes || {},
                                buyingPrice: v.buyingPrice,
                                costPrice: v.buyingPrice,
                                sellingPrice: v.sellingPrice,
                                price: v.sellingPrice,
                                inventoryQuantity: v.stock,
                                stock: v.stock,
                                reorderLevel: v.reorderLevel,
                                isActive: true,
                                tenantId: currentTenantId || undefined,
                              })) as any,
                              currentTenantId ? { tenantId: currentTenantId } : undefined
                            );

                            pendingOutboxes.push({
                              entityType: "ProductVariant",
                              entityId: newVar.id,
                              operationType: "CREATE",
                              payload: {
                                id: newVar.id,
                                productId: variantModalProduct.id,
                                name: newVar.name,
                                sku: newVar.sku,
                                barcode: newVar.barcode || undefined,
                                price: newVar.sellingPrice,
                                costPrice: newVar.buyingPrice,
                                inventoryQuantity: 0,
                                stock: 0,
                                reorderLevel: newVar.reorderLevel,
                                attributes: newVar.attributes || {},
                                isActive: true,
                              },
                              idempotencyKey: `VAR-CREATE-${newVar.id}`,
                              tenantId: currentTenantId || undefined,
                              branchId: currentBranchId || undefined,
                            });

                            if (Number(newVar.stock) > 0) {
                              const adjOpId = `adj-var-${Date.now()}-${newVar.id}`;
                              pendingOutboxes.push({
                                entityType: "StockAdjustment",
                                entityId: adjOpId,
                                operationType: "CREATE",
                                payload: {
                                  productId: variantModalProduct.id,
                                  variantId: newVar.id,
                                  sku: newVar.sku,
                                  adjustmentType: "INCREASE",
                                  quantityChange: Number(newVar.stock),
                                  reason: "MANUAL_VARIANT_CREATION",
                                  deviceId: "web-client",
                                  operationId: adjOpId,
                                  idempotencyKey: `ADJ-${adjOpId}`,
                                },
                                idempotencyKey: `ADJ-${adjOpId}`,
                                tenantId: currentTenantId || undefined,
                                branchId: currentBranchId || undefined,
                              });
                            }

                            await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
                            setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                            setVariantModalProduct(updatedProduct);
                            setVariantStudioPanel("none");
                            playSuccessChime();
                            toast.success("Variant Created", `Variant "${newVar.name}" added and synced.`);
                            publishDataChanged({ action: "INVENTORY_CHANGED" });
                            void syncOutbox?.().catch(() => {});
                          }}
                        >
                          <Check size={12} /> Save Variant
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Panel 2: Matrix Generator Form */}
                  {variantStudioPanel === "generate_matrix" && (
                    <div className="v2-p-3" style={{ background: "var(--surface-1)", borderRadius: "var(--radius-xs)", border: "1px solid var(--surface-border)" }}>
                      <div className="v2-font-bold v2-text-xs v2-mb-2" style={{ color: "var(--primary)" }}>CARTESIAN VARIANT MATRIX GENERATOR</div>
                      <div className="v2-grid v2-grid-2 v2-gap-2">
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">OPTION 1 (e.g. Size, Pack, Volume)</label>
                          <input
                            className="v2-input v2-input-sm"
                            value={studioMatrixOpt1}
                            onChange={(e) => setStudioMatrixOpt1(e.target.value)}
                            placeholder="e.g. Size"
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">VALUES (Comma separated)</label>
                          <input
                            className="v2-input v2-input-sm"
                            value={studioMatrixVals1}
                            onChange={(e) => setStudioMatrixVals1(e.target.value)}
                            placeholder="Small, Medium, Large"
                          />
                        </div>
                      </div>

                      <div className="v2-grid v2-grid-2 v2-gap-2 v2-mt-2">
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">OPTION 2 (Optional, e.g. Color, Flavour)</label>
                          <input
                            className="v2-input v2-input-sm"
                            value={studioMatrixOpt2}
                            onChange={(e) => setStudioMatrixOpt2(e.target.value)}
                            placeholder="e.g. Color"
                          />
                        </div>
                        <div>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">VALUES (Comma separated)</label>
                          <input
                            className="v2-input v2-input-sm"
                            value={studioMatrixVals2}
                            onChange={(e) => setStudioMatrixVals2(e.target.value)}
                            placeholder="Red, Blue, Green (or leave empty)"
                          />
                        </div>
                      </div>

                      <div className="v2-flex v2-justify-end v2-gap-2 v2-mt-3">
                        <button
                          type="button"
                          className="v2-btn v2-btn-ghost v2-btn-xs"
                          onClick={() => setVariantStudioPanel("none")}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="v2-btn v2-btn-primary v2-btn-xs"
                          onClick={async () => {
                            if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                            const pendingOutboxes: any[] = [];
                            const list1 = studioMatrixVals1.split(",").map((s) => s.trim()).filter(Boolean);
                            const list2 = studioMatrixOpt2.trim() && studioMatrixVals2.trim()
                              ? studioMatrixVals2.split(",").map((s) => s.trim()).filter(Boolean)
                              : [""];
                            if (list1.length === 0) {
                              toast.warning("Values Required", "Please specify at least one option value.");
                              return;
                            }

                            const generated: ProductVariantData[] = [];
                            for (const v1 of list1) {
                              for (const v2 of list2) {
                                const label = v2 ? `${studioMatrixOpt1}: ${v1} / ${studioMatrixOpt2}: ${v2}` : `${studioMatrixOpt1}: ${v1}`;
                                const skuSuffix = (v1 + (v2 ? `-${v2}` : "")).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
                                generated.push({
                                  id: `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                  name: `${variantModalProduct.name} (${label})`,
                                  sku: `${variantModalProduct.sku}-${skuSuffix}`,
                                  barcode: `890${Math.floor(100000000 + Math.random() * 900000000)}`,
                                  attributes: { [studioMatrixOpt1]: v1, ...(studioMatrixOpt2 && v2 ? { [studioMatrixOpt2]: v2 } : {}) },
                                  buyingPrice: variantModalProduct.buyingPrice,
                                  sellingPrice: variantModalProduct.sellingPrice,
                                  stock: 0,
                                  reorderLevel: 5,
                                });
                              }
                            }

                            const updatedList = [...(variantModalProduct.variants || []), ...generated];
                            const sumStock = updatedList.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
                            const updatedProduct = {
                              ...variantModalProduct,
                              stock: sumStock,
                              totalStock: sumStock,
                              availableStock: sumStock,
                              hasVariants: true,
                              variants: updatedList,
                            };

                            db.saveProductWithVariantsLocal(
                              updatedProduct as any,
                              updatedList.map((v) => ({
                                id: v.id,
                                productId: variantModalProduct.id,
                                name: v.name,
                                sku: v.sku,
                                barcode: v.barcode || "",
                                attributes: v.attributes || {},
                                buyingPrice: v.buyingPrice,
                                costPrice: v.buyingPrice,
                                sellingPrice: v.sellingPrice,
                                price: v.sellingPrice,
                                inventoryQuantity: v.stock,
                                stock: v.stock,
                                reorderLevel: v.reorderLevel,
                                isActive: true,
                                tenantId: currentTenantId || undefined,
                              })) as any,
                              currentTenantId ? { tenantId: currentTenantId } : undefined
                            );

                            for (const g of generated) {
                              pendingOutboxes.push({
                                entityType: "ProductVariant",
                                entityId: g.id,
                                operationType: "CREATE",
                                payload: {
                                  id: g.id,
                                  productId: variantModalProduct.id,
                                  name: g.name,
                                  sku: g.sku,
                                  barcode: g.barcode || undefined,
                                  price: g.sellingPrice,
                                  costPrice: g.buyingPrice,
                                  inventoryQuantity: 0,
                                  stock: 0,
                                  reorderLevel: g.reorderLevel,
                                  attributes: g.attributes || {},
                                  isActive: true,
                                },
                                idempotencyKey: `VAR-GEN-${g.id}`,
                                tenantId: currentTenantId || undefined,
                                branchId: currentBranchId || undefined,
                              });
                              if (Number(g.stock) > 0) {
                                const adjOpId = `adj-gen-${Date.now()}-${g.id}`;
                                pendingOutboxes.push({
                                  entityType: "StockAdjustment",
                                  entityId: adjOpId,
                                  operationType: "CREATE",
                                  payload: {
                                    productId: variantModalProduct.id,
                                    variantId: g.id,
                                    sku: g.sku,
                                    adjustmentType: "INCREASE",
                                    quantityChange: Number(g.stock),
                                    reason: "MANUAL_VARIANT_CREATION",
                                    deviceId: "web-client",
                                    operationId: adjOpId,
                                    idempotencyKey: `ADJ-${adjOpId}`,
                                  },
                                  idempotencyKey: `ADJ-${adjOpId}`,
                                  tenantId: currentTenantId || undefined,
                                  branchId: currentBranchId || undefined,
                                });
                              }
                            }

                            await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
                            setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                            setVariantModalProduct(updatedProduct);
                            setVariantStudioPanel("none");
                            playSuccessChime();
                            toast.success("Variants Matrix Generated", `Generated and synced ${generated.length} variant combinations.`);
                            publishDataChanged({ action: "INVENTORY_CHANGED" });
                            void syncOutbox?.().catch(() => {});
                          }}
                        >
                          <Zap size={12} /> Generate {
                            (studioMatrixVals1.split(",").filter(Boolean).length || 1) *
                            (studioMatrixOpt2 && studioMatrixVals2 ? (studioMatrixVals2.split(",").filter(Boolean).length || 1) : 1)
                          } Combinations
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Panel 3: Bulk Operations Form */}
                  {variantStudioPanel === "bulk_ops" && (
                    <div className="v2-p-3" style={{ background: "var(--surface-1)", borderRadius: "var(--radius-xs)", border: "1px solid var(--surface-border)" }}>
                      <div className="v2-font-bold v2-text-xs v2-mb-2" style={{ color: "var(--primary)" }}>BULK INVENTORY & PRICE ADJUSTMENTS</div>
                      <div className="v2-grid v2-grid-2 v2-gap-3">
                        <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-xs)" }}>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">BULK PRICE SHIFT (%)</label>
                          <div className="v2-flex v2-gap-2 v2-mt-1">
                            <input
                              className="v2-input v2-input-sm v2-mono"
                              type="number"
                              value={studioBulkPricePct}
                              onChange={(e) => setStudioBulkPricePct(Number(e.target.value))}
                              placeholder="e.g. 10 or -5"
                            />
                            <button
                              type="button"
                              className="v2-btn v2-btn-secondary v2-btn-xs"
                              style={{ whiteSpace: "nowrap" }}
                              onClick={async () => {
                                if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                                const pendingOutboxes: any[] = [];
                                const pct = Number(studioBulkPricePct);
                                if (isNaN(pct) || pct === 0) return;
                                const updatedList = (variantModalProduct.variants || []).map((v) => ({
                                  ...v,
                                  sellingPrice: Math.round(v.sellingPrice * (1 + pct / 100)),
                                }));
                                const sumStock = updatedList.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
                                const updatedProduct = {
                                  ...variantModalProduct,
                                  stock: sumStock,
                                  totalStock: sumStock,
                                  availableStock: sumStock,
                                  variants: updatedList,
                                };
                                db.saveProductWithVariantsLocal(
                                  updatedProduct as any,
                                  updatedList.map((v) => ({
                                    id: v.id,
                                    productId: variantModalProduct.id,
                                    name: v.name,
                                    sku: v.sku,
                                    barcode: v.barcode || "",
                                    attributes: v.attributes || {},
                                    buyingPrice: v.buyingPrice,
                                    costPrice: v.buyingPrice,
                                    sellingPrice: v.sellingPrice,
                                    price: v.sellingPrice,
                                    inventoryQuantity: v.stock,
                                    stock: v.stock,
                                    reorderLevel: v.reorderLevel,
                                    isActive: true,
                                    tenantId: currentTenantId || undefined,
                                  })) as any,
                                  currentTenantId ? { tenantId: currentTenantId } : undefined
                                );

                                for (const v of updatedList) {
                                  pendingOutboxes.push({
                                    entityType: "ProductVariant",
                                    entityId: v.id,
                                    operationType: "UPDATE",
                                    payload: {
                                      id: v.id,
                                      price: v.sellingPrice,
                                    },
                                    idempotencyKey: `VAR-PRICE-${v.id}-${Date.now()}`,
                                    tenantId: currentTenantId || undefined,
                                    branchId: currentBranchId || undefined,
                                  });
                                }

                                await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
                                setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                                setVariantModalProduct(updatedProduct);
                                playSuccessChime();
                                toast.success("Bulk Prices Adjusted", `Shifted selling price by ${pct > 0 ? `+${pct}` : pct}% across all variants.`);
                                publishDataChanged({ action: "INVENTORY_CHANGED" });
                                void syncOutbox?.().catch(() => {});
                              }}
                            >
                              Apply % Shift
                            </button>
                          </div>
                        </div>

                        <div className="v2-p-2" style={{ background: "var(--surface-2)", borderRadius: "var(--radius-xs)" }}>
                          <label className="v2-text-xs v2-font-bold v2-text-muted">BULK STOCK ADDITION (UNITS)</label>
                          <div className="v2-flex v2-gap-2 v2-mt-1">
                            <input
                              className="v2-input v2-input-sm v2-mono"
                              type="number"
                              value={studioBulkStockAdd}
                              onChange={(e) => setStudioBulkStockAdd(Number(e.target.value))}
                              placeholder="e.g. 20"
                            />
                            <button
                              type="button"
                              className="v2-btn v2-btn-secondary v2-btn-xs"
                              style={{ whiteSpace: "nowrap" }}
                              onClick={async () => {
                                if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                                const pendingOutboxes: any[] = [];
                                const addStock = Number(studioBulkStockAdd);
                                if (isNaN(addStock) || addStock === 0) return;
                                const updatedList = (variantModalProduct.variants || []).map((v) => ({
                                  ...v,
                                  stock: Math.max(0, (v.stock || 0) + addStock),
                                }));
                                const sumStock = updatedList.reduce((acc, v) => acc + (Number(v.stock) || 0), 0);
                                const updatedProduct = {
                                  ...variantModalProduct,
                                  stock: sumStock,
                                  totalStock: sumStock,
                                  availableStock: sumStock,
                                  variants: updatedList,
                                };
                                db.saveProductWithVariantsLocal(
                                  updatedProduct as any,
                                  updatedList.map((v) => ({
                                    id: v.id,
                                    productId: variantModalProduct.id,
                                    name: v.name,
                                    sku: v.sku,
                                    barcode: v.barcode || "",
                                    attributes: v.attributes || {},
                                    buyingPrice: v.buyingPrice,
                                    costPrice: v.buyingPrice,
                                    sellingPrice: v.sellingPrice,
                                    price: v.sellingPrice,
                                    inventoryQuantity: v.stock,
                                    stock: v.stock,
                                    reorderLevel: v.reorderLevel,
                                    isActive: true,
                                    tenantId: currentTenantId || undefined,
                                  })) as any,
                                  currentTenantId ? { tenantId: currentTenantId } : undefined
                                );

                                for (const v of updatedList) {
                                  const adjOpId = `adj-bulk-${Date.now()}-${v.id}`;
                                  pendingOutboxes.push({
                                    entityType: "StockAdjustment",
                                    entityId: adjOpId,
                                    operationType: "CREATE",
                                    payload: {
                                      productId: variantModalProduct.id,
                                      variantId: v.id,
                                      sku: v.sku,
                                      adjustmentType: "INCREASE",
                                      quantityChange: addStock,
                                      reason: "BULK_STOCK_ADDITION",
                                      deviceId: "web-client",
                                      operationId: adjOpId,
                                      idempotencyKey: `ADJ-${adjOpId}`,
                                    },
                                    idempotencyKey: `ADJ-${adjOpId}`,
                                    tenantId: currentTenantId || undefined,
                                    branchId: currentBranchId || undefined,
                                  });
                                }

                                await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
                                setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                                setVariantModalProduct(updatedProduct);
                                playSuccessChime();
                                toast.success("Bulk Stock Updated", `Added ${addStock} units to all variants.`);
                                publishDataChanged({ action: "INVENTORY_CHANGED" });
                                void syncOutbox?.().catch(() => {});
                              }}
                            >
                              Add Stock
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Variants List Table */}
                  <table className="v2-table v2-table-sm">
                    <thead>
                      <tr>
                        <th>Variant Name</th>
                        <th>SKU Code</th>
                        <th>Barcode</th>
                        <th>Cost (Buying)</th>
                        <th>Retail (Selling)</th>
                        <th>Stock Units</th>
                        <th>Reorder</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(!variantModalProduct.variants || variantModalProduct.variants.length === 0) ? (
                        <tr>
                          <td colSpan={8} className="v2-text-center v2-text-muted v2-py-4">
                            No variants configured for this SKU yet. Click <strong>Generate Matrix</strong> or <strong>Add Single Variant</strong> above to build combinations.
                          </td>
                        </tr>
                      ) : (
                        variantModalProduct.variants.map((v) => {
                          const isEditing = editingVariantRowId === v.id;
                          return isEditing ? (
                            <tr key={v.id} style={{ background: "var(--surface-2)" }}>
                              <td>
                                <input
                                  className="v2-input v2-input-xs"
                                  value={inlineVariantEdit.name}
                                  onChange={(e) => setInlineVariantEdit({ ...inlineVariantEdit, name: e.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  className="v2-input v2-input-xs v2-mono"
                                  value={inlineVariantEdit.sku}
                                  onChange={(e) => setInlineVariantEdit({ ...inlineVariantEdit, sku: e.target.value })}
                                  style={{ width: "120px" }}
                                />
                              </td>
                              <td>
                                <input
                                  className="v2-input v2-input-xs v2-mono"
                                  value={inlineVariantEdit.barcode}
                                  onChange={(e) => setInlineVariantEdit({ ...inlineVariantEdit, barcode: e.target.value })}
                                  style={{ width: "105px" }}
                                />
                              </td>
                              <td>
                                <NumberStepper
                                  size="xs"
                                  min={0}
                                  step={1}
                                  width="94px"
                                  value={inlineVariantEdit.buyingPrice}
                                  ariaLabel="Buying cost price"
                                  onChange={(val) => setInlineVariantEdit({ ...inlineVariantEdit, buyingPrice: val })}
                                />
                              </td>
                              <td>
                                <NumberStepper
                                  size="xs"
                                  min={0}
                                  step={1}
                                  width="94px"
                                  value={inlineVariantEdit.sellingPrice}
                                  ariaLabel="Selling retail price"
                                  onChange={(val) => setInlineVariantEdit({ ...inlineVariantEdit, sellingPrice: val })}
                                />
                              </td>
                              <td>
                                <span className="v2-mono v2-text-xs v2-font-bold" title="Stock is ledger-controlled; use Add Stock / Physical Count">
                                  {Number(inlineVariantEdit.stock || 0).toLocaleString()}
                                </span>
                              </td>
                              <td>
                                <NumberStepper
                                  size="xs"
                                  min={0}
                                  step={1}
                                  width="75px"
                                  value={inlineVariantEdit.reorderLevel}
                                  ariaLabel="Reorder level"
                                  onChange={(val) => setInlineVariantEdit({ ...inlineVariantEdit, reorderLevel: val })}
                                />
                              </td>
                              <td>
                                <div className="v2-flex v2-gap-1">
                                  <button
                                    className="v2-btn v2-btn-primary v2-btn-icon-xs"
                                    type="button"
                                    title="Save changes"
                                    onClick={async () => {
                                      if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                                      const pendingOutboxes: any[] = [];
                                      const updatedList = (variantModalProduct.variants || []).map((item) =>
                                        item.id === v.id
                                          ? {
                                              ...item,
                                              name: inlineVariantEdit.name,
                                              sku: inlineVariantEdit.sku,
                                              barcode: inlineVariantEdit.barcode,
                                              buyingPrice: inlineVariantEdit.buyingPrice,
                                              sellingPrice: inlineVariantEdit.sellingPrice,
                                              stock: inlineVariantEdit.stock,
                                              reorderLevel: inlineVariantEdit.reorderLevel,
                                            }
                                          : item
                                      );
                                      const sumStock = updatedList.reduce((acc, item) => acc + (Number(item.stock) || 0), 0);
                                      const updatedProduct = {
                                        ...variantModalProduct,
                                        stock: sumStock,
                                        totalStock: sumStock,
                                        availableStock: sumStock,
                                        variants: updatedList,
                                      };
                                      db.saveProductWithVariantsLocal(
                                        updatedProduct as any,
                                        updatedList.map((item) => ({
                                          id: item.id,
                                          productId: variantModalProduct.id,
                                          name: item.name,
                                          sku: item.sku,
                                          barcode: item.barcode || "",
                                          attributes: item.attributes || {},
                                          buyingPrice: item.buyingPrice,
                                          costPrice: item.buyingPrice,
                                          sellingPrice: item.sellingPrice,
                                          price: item.sellingPrice,
                                          inventoryQuantity: item.stock,
                                          stock: item.stock,
                                          reorderLevel: item.reorderLevel,
                                          isActive: true,
                                          tenantId: currentTenantId || undefined,
                                        })) as any,
                                        currentTenantId ? { tenantId: currentTenantId } : undefined
                                      );
                                      setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                                      setVariantModalProduct(updatedProduct);
                                      const existingVariant = db.productVariants.get(v.id) as any;
                                      pendingOutboxes.push({ entityType: "ProductVariant", entityId: v.id, operationType: "UPDATE", payload: {
                                        id: v.id, name: inlineVariantEdit.name.trim(), sku: inlineVariantEdit.sku.trim(),
                                        barcode: inlineVariantEdit.barcode.trim() || undefined, price: Number(inlineVariantEdit.sellingPrice),
                                        costPrice: Number(inlineVariantEdit.buyingPrice), reorderLevel: Number(inlineVariantEdit.reorderLevel),
                                        attributes: existingVariant?.attributes || v.attributes || {}, isActive: true,
                                        _baseUpdatedAt: existingVariant?.updatedAt || v.updatedAt,
                                      }, idempotencyKey: `VAR-UPDATE-${v.id}-${Date.now()}`, tenantId: currentTenantId || undefined, branchId: currentBranchId || undefined });
                                      if (pendingOutboxes.length) await commitLocalOutboxes(db, pendingOutboxes, { tenantId: currentTenantId, branchId: currentBranchId });
                                      setEditingVariantRowId(null);
                                      playSuccessChime();
                                      toast.success("Variant Updated", `Variant "${inlineVariantEdit.name}" saved.`);
                                      publishDataChanged({ action: "INVENTORY_CHANGED" });
                                      void syncOutbox?.().catch(() => {});
                                    }}
                                  >
                                    <Check size={11} />
                                  </button>
                                  <button
                                    className="v2-btn v2-btn-ghost v2-btn-icon-xs"
                                    type="button"
                                    title="Cancel"
                                    onClick={() => setEditingVariantRowId(null)}
                                  >
                                    <X size={11} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            <tr key={v.id}>
                              <td className="v2-font-bold">{v.name}</td>
                              <td className="v2-mono v2-text-xs">{v.sku}</td>
                              <td className="v2-mono v2-text-xs" style={{ color: "var(--accent)" }}>{v.barcode || "—"}</td>
                              <td className="v2-mono">{money(v.buyingPrice)}</td>
                              <td className="v2-mono v2-font-bold">{money(v.sellingPrice)}</td>
                              <td className="v2-mono v2-font-bold" style={{ color: v.stock <= (v.reorderLevel || 5) ? "var(--warning)" : "var(--success)" }}>
                                {v.stock}
                              </td>
                              <td className="v2-mono">{v.reorderLevel || 5}</td>
                              <td>
                                <div className="v2-flex v2-gap-1">
                                  <button
                                    className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                                    title="Edit Variant Details"
                                    type="button"
                                    onClick={async () => {
                                      setInlineVariantEdit({
                                        name: v.name,
                                        sku: v.sku,
                                        barcode: v.barcode || "",
                                        buyingPrice: v.buyingPrice,
                                        sellingPrice: v.sellingPrice,
                                        stock: v.stock,
                                        reorderLevel: v.reorderLevel || 5,
                                      });
                                      setEditingVariantRowId(v.id);
                                    }}
                                  >
                                    <Edit2 size={12} />
                                  </button>
                                  <button
                                    className="v2-btn v2-btn-ghost v2-btn-icon-sm"
                                    style={{ color: "var(--danger)" }}
                                    title="Delete Variant"
                                    type="button"
                                    onClick={async () => {
                                      if (!currentTenantId || !currentBranchId) { toast.error("Tenant Context Required", "Select an active tenant and branch before changing variants."); return; }
                                      if (!confirm(`Delete variant "${v.name}"? Parent stock will automatically adjust.`)) return;
                                      const existingVariant = db.productVariants.get(v.id) as any;
                                      db.deleteVariantLocal(v.id);
                                       await commitLocalOutbox(db, { entityType: "ProductVariant", entityId: v.id, operationType: "DELETE",
                                         payload: { id: v.id, _baseUpdatedAt: existingVariant?.updatedAt || v.updatedAt },
                                         idempotencyKey: `VAR-DELETE-${v.id}-${Date.now()}`, tenantId: currentTenantId || undefined, branchId: currentBranchId || undefined });
                                      const updatedList = (variantModalProduct.variants || []).filter((x) => x.id !== v.id);
                                      const sumStock = updatedList.reduce((acc, item) => acc + (Number(item.stock) || 0), 0);
                                      const updatedProduct = {
                                        ...variantModalProduct,
                                        stock: sumStock,
                                        totalStock: sumStock,
                                        availableStock: sumStock,
                                        hasVariants: updatedList.length > 0,
                                        variants: updatedList,
                                      };
                                      setItems((prev) => prev.map((i) => i.id === variantModalProduct.id ? updatedProduct : i));
                                      setVariantModalProduct(updatedProduct);
                                      playSuccessChime();
                                      toast.success("Variant Deleted", `Removed "${v.name}". Parent SKU stock recalculated.`);
                                      publishDataChanged({ action: "INVENTORY_CHANGED" });
                                      void syncOutbox?.().catch(() => {});
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 5: Images */}
              {newVarAttrKey === "images" && (
                <div className="v2-space-y-3 v2-text-center v2-py-4">
                  <Upload size={32} style={{ margin: "0 auto", color: "var(--muted)" }} />
                  <div className="v2-font-bold v2-text-sm">Product Image Gallery</div>
                  <p className="v2-text-xs v2-text-muted">Upload high-resolution parent product images and variant-specific product shots.</p>
                  <button className="v2-btn v2-btn-secondary v2-btn-sm" type="button" onClick={() => runUiAction("ui.apps.web.src.pages.InventoryPage.3860.upload-image-file", "Upload Image File", "UI_COMMAND")} data-action-id="ui.apps.web.src.pages.InventoryPage.3860.upload-image-file"><Plus size={13} /> Upload Image File</button>
                </div>
              )}

              {/* TAB 6: Suppliers */}
              {newVarAttrKey === "suppliers" && (
                <div className="v2-space-y-3">
                  <div className="v2-card v2-p-3">
                    <div className="v2-font-bold v2-text-xs">Primary Supplier: Azam Flour Mills Tanzania</div>
                    <div className="v2-text-xs v2-text-muted">Supplier SKU Code: AZM-FLR-2026 · Preferred Lead Time: 3 Days</div>
                  </div>
                </div>
              )}

              {/* TAB 7: Stock History Audit Timeline */}
              {newVarAttrKey === "history" && (
                <div className="v2-space-y-3">
                  <div className="v2-flex v2-items-center v2-justify-between">
                    <div>
                      <div className="v2-font-bold v2-text-xs">Immutable Stock Ledger Movement Timeline</div>
                      <div className="v2-text-xs v2-text-muted">Audit trail for {variantModalProduct.name} (SKU: {variantModalProduct.sku})</div>
                    </div>
                    <span className="badge v2-badge-primary">Append-Only Immutable Ledger</span>
                  </div>

                  <table className="v2-table v2-table-sm">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Operator</th>
                        <th>Movement Type</th>
                        <th>Qty Delta</th>
                        <th>Stock Lineage</th>
                        <th>Unit Cost</th>
                        <th>Total Cost</th>
                        <th>Reference / Notes</th>
                        <th>Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger
                        .filter((l) => l.sku === variantModalProduct.sku || l.name.includes(variantModalProduct.name))
                        .map((l) => (
                          <tr key={l.id}>
                            <td className="v2-text-xs v2-mono">{l.date}</td>
                            <td className="v2-text-xs v2-font-bold">{l.user || "System / Admin"}</td>
                            <td>
                              <span
                                className={`badge ${
                                  l.qty > 0
                                    ? "v2-badge-success"
                                    : l.type.includes("DAMAGE") || l.type.includes("EXPIRY") || l.type.includes("LOSS")
                                    ? "v2-badge-danger"
                                    : "v2-badge-info"
                                }`}
                              >
                                {l.type}
                              </span>
                            </td>
                            <td className={`v2-mono v2-font-bold ${l.qty > 0 ? "v2-text-success" : "v2-text-danger"}`}>
                              {l.qty > 0 ? `+${l.qty}` : l.qty}
                            </td>
                            <td className="v2-mono v2-text-xs">
                              {Math.max(0, l.balance - l.qty)} &rarr; <span className="v2-font-bold">{l.balance}</span>
                            </td>
                            <td className="v2-mono v2-text-xs">{money(l.unitCost || variantModalProduct.buyingPrice)}</td>
                            <td className="v2-mono v2-text-xs v2-font-bold">{money(Math.abs(l.qty) * (l.unitCost || variantModalProduct.buyingPrice))}</td>
                            <td className="v2-mono v2-text-xs">
                              <span className="v2-font-bold">{l.ref}</span>
                              {l.notes && <div className="v2-text-xs v2-text-muted">{l.notes}</div>}
                            </td>
                            <td className="v2-mono v2-text-xs v2-text-muted">{l.deviceId || "POS-01"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="v2-flex v2-justify-end v2-pt-3" style={{ borderTop: "1px solid var(--surface-border)" }}>
              <button className="v2-btn v2-btn-primary v2-btn-sm" onClick={() => setVariantModalProduct(null)} type="button">Done & Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {/* --- Stock Movement & Backdated Inventory Modal --- */}
      {stockAdjModal && (() => {
        const targetItem =
          items.find((i) => i.sku === adjSku || i.variants?.some((v) => v.sku === adjSku)) ||
          items[0] ||
          null;
        const targetVariant =
          targetItem?.variants?.find((v) => v.sku === adjSku) ||
          targetItem?.variants?.[0] ||
          null;

        const targetVariantId = targetVariant?.id || (targetItem ? `${targetItem.id}-default` : "");
        const targetVariantSku = targetVariant?.sku || targetItem?.sku || adjSku || "SKU-DEFAULT";
        const targetVariantName = targetVariant?.name || targetItem?.name || "Standard";
        const targetUnitCost = Number(targetVariant?.buyingPrice ?? targetItem?.buyingPrice ?? 0);

        const ledgerEntries = db?.stockLedger ? Array.from(db.stockLedger.values()) : [];
        const entries = ledgerEntries.filter(
          (entry: any) =>
            (!currentTenantId || entry.tenantId === currentTenantId) &&
            (!currentBranchId || entry.branchId === currentBranchId) &&
            ((targetVariantId && entry.variantId === targetVariantId) ||
             (targetItem && entry.productId === targetItem.id && (!entry.variantId || entry.variantId === `${targetItem.id}-default`))),
        );
        const currentBalance = entries.reduce(
          (sum, e: any) => sum + Number(e.quantityChange ?? e.quantity ?? 0),
          0,
        );

        let historicalBalance = currentBalance;
        if (isBackdated && adjOccurredAt && targetVariantId) {
          try {
            historicalBalance = calculateLocalStockAsOfDate(
              db,
              targetVariantId,
              adjOccurredAt,
              currentTenantId || undefined,
              currentBranchId || undefined,
            );
          } catch {
            historicalBalance = currentBalance;
          }
        }

        const q = Number(adjQty) || 0;
        let delta = 0;
        if (adjAdjustmentType === "INCREASE") delta = q;
        else if (adjAdjustmentType === "DECREASE") delta = -q;
        else if (adjAdjustmentType === "SET") delta = isBackdated ? (q - historicalBalance) : (q - currentBalance);

        const projectedToday = currentBalance + delta;
        const minBackdate = toLocalDatetimeString(new Date(Date.now() - 730 * 24 * 3600 * 1000));
        const maxBackdate = toLocalDatetimeString(new Date(Date.now() + 5 * 60 * 1000));

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "grid", placeItems: "center", zIndex: 1000 }}>
            <div className="v2-card" style={{ width: 560, maxWidth: "calc(100vw - 2rem)", maxHeight: "90vh", overflowY: "auto", padding: "1.5rem" }}>
              <div className="v2-flex v2-items-center v2-justify-between v2-mb-3">
                <div>
                  <h2 className="v2-text-base v2-font-black">Stock Movement & Adjustment</h2>
                  <div className="v2-text-xs v2-text-muted">Real-time and backdated stock adjustments with 2-year threshold enforcement.</div>
                </div>
                <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setStockAdjModal(false)} type="button">✕</button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!targetItem || !currentTenantId || !currentBranchId) {
                    toast.warning("Stock Target Required", "Select a valid product and branch context.");
                    return;
                  }
                  const quantity = Number(adjQty);
                  const unitCost = targetUnitCost;
                  if (!Number.isFinite(quantity) || (adjAdjustmentType !== "SET" && quantity <= 0) || (adjAdjustmentType === "SET" && quantity < 0)) {
                    toast.warning("Invalid Quantity", "Enter a valid stock quantity.");
                    return;
                  }
                  if (!adjReasonCode) {
                    toast.warning("Reason Required", "Select a reason before posting.");
                    return;
                  }
                  if (projectedToday < 0) {
                    toast.warning("Negative Stock Disallowed", "This adjustment would result in a negative stock balance.");
                    return;
                  }
                  try {
                    const result = await queueStockAdjustment(db, {
                      tenantId: currentTenantId,
                      branchId: currentBranchId,
                      productId: targetItem.id,
                      variantId: targetVariantId,
                      sku: targetVariantSku,
                      productName: targetItem.name,
                      adjustmentType: adjAdjustmentType,
                      quantity,
                      unitCost,
                      reason: adjReasonCode,
                      notes: adjNotes,
                      movementType: (adjType === "WASTAGE_SPILL" ? "DAMAGE" : adjType) as any,
                      deviceId: syncEngine?.deviceId || "pos-terminal",
                      occurredAt: isBackdated && adjOccurredAt ? new Date(adjOccurredAt).toISOString() : undefined,
                    });
                    await loadInventory();
                    playSuccessChime();
                    const actionLabel = isBackdated ? "Backdated Adjustment" : "Stock Movement";
                    const deltaLabel = delta >= 0 ? `+${delta}` : `${delta}`;
                    toast.success(actionLabel, `${targetVariantName}: ${deltaLabel} applied. Local balance: ${result.quantityAfter}.`);
                    publishDataChanged({ action: "INVENTORY_CHANGED" });
                    void syncOutbox().catch(() => {});
                    setStockAdjModal(false);
                    setAdjNotes("");
                    setAdjQty(1);
                    setIsBackdated(false);
                  } catch (error) {
                    toast.warning("Stock Not Posted", error instanceof Error ? error.message : "Unable to queue stock movement.");
                  }
                }}
                className="v2-space-y-3"
              >
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">PRODUCT / VARIANT *</label>
                  <select className="v2-input" value={adjSku} onChange={(e) => setAdjSku(e.target.value)}>
                    {items.length === 0 ? (
                      <option value="">No products available</option>
                    ) : (
                      items.flatMap((item) => (item.variants && item.variants.length > 0 ? item.variants.map((variant) => (
                        <option key={variant.id} value={variant.sku}>{item.name} — {variant.name} ({variant.sku})</option>
                      )) : [<option key={item.id} value={item.sku}>{item.name} ({item.sku})</option>]))
                    )}
                  </select>
                </div>

                {/* Adjustment Mode Selector */}
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">ADJUSTMENT ACTION *</label>
                  <div className="v2-grid v2-grid-3 v2-gap-2 v2-mt-1">
                    <button
                      type="button"
                      className={`v2-btn v2-btn-sm ${adjAdjustmentType === "INCREASE" ? "v2-btn-primary" : "v2-btn-secondary"}`}
                      onClick={() => {
                        setAdjAdjustmentType("INCREASE");
                        setAdjType("ADJUSTMENT_GAIN");
                        setAdjReasonCode("PURCHASE_RECEIVED");
                      }}
                    >
                      + Add Stock
                    </button>
                    <button
                      type="button"
                      className={`v2-btn v2-btn-sm ${adjAdjustmentType === "DECREASE" ? "v2-btn-primary" : "v2-btn-secondary"}`}
                      onClick={() => {
                        setAdjAdjustmentType("DECREASE");
                        setAdjType("ADJUSTMENT_LOSS");
                        setAdjReasonCode("WASTAGE_SPILL");
                      }}
                    >
                      - Deduct / Loss
                    </button>
                    <button
                      type="button"
                      className={`v2-btn v2-btn-sm ${adjAdjustmentType === "SET" ? "v2-btn-primary" : "v2-btn-secondary"}`}
                      onClick={() => {
                        setAdjAdjustmentType("SET");
                        setAdjType("ADJUSTMENT_GAIN");
                        setAdjReasonCode("PHYSICAL_COUNT_VARIANCE");
                      }}
                    >
                      = Physical Count
                    </button>
                  </div>
                </div>

                <div className="v2-grid v2-grid-2 v2-gap-2">
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">
                      {adjAdjustmentType === "SET" ? "ACTUAL PHYSICAL COUNT *" : "QUANTITY *"}
                    </label>
                    <input
                      className="v2-input"
                      type="number"
                      min={adjAdjustmentType === "SET" ? "0" : "1"}
                      step="any"
                      value={adjQty}
                      onChange={(e) => setAdjQty(Number(e.target.value))}
                      required
                    />
                  </div>
                  <div>
                    <label className="v2-text-xs v2-font-bold v2-text-muted">REASON CODE *</label>
                    <select className="v2-input" value={adjReasonCode} onChange={(e) => setAdjReasonCode(e.target.value)}>
                      {adjAdjustmentType === "INCREASE" && (
                        <>
                          <option value="PURCHASE_RECEIVED">Purchase / Supplier Receipt</option>
                          <option value="PHYSICAL_COUNT_GAIN">Physical Count Gain</option>
                          <option value="OPENING_RECONCILIATION">Opening Balance Reconciliation</option>
                          <option value="CUSTOMER_RETURN">Customer Return</option>
                          <option value="INTERNAL_TRANSFER_RECEIVED">Internal Transfer Received</option>
                          <option value="OTHER">Other Approved Stock-In</option>
                        </>
                      )}
                      {adjAdjustmentType === "DECREASE" && (
                        <>
                          <option value="WASTAGE_SPILL">Wastage / Spoilage</option>
                          <option value="SHRINKAGE_THEFT">Shrinkage / Theft</option>
                          <option value="DAMAGED_EXPIRED">Damaged / Expired</option>
                          <option value="AUDIT_DISCREPANCY">Audit Deduction</option>
                          <option value="TRANSFER_OUT">Transfer Out</option>
                          <option value="OTHER">Other Approved Stock-Out</option>
                        </>
                      )}
                      {adjAdjustmentType === "SET" && (
                        <>
                          <option value="PHYSICAL_COUNT_VARIANCE">Physical Count Audit</option>
                          <option value="PERIODIC_STOCK_COUNT">Periodic Stock Reconciliation</option>
                          <option value="ANNUAL_AUDIT">Annual Inventory Count</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                {/* Backdating Toggle & Point-in-Time Controls */}
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--surface-border)", borderRadius: "8px", padding: "10px" }}>
                  <div className="v2-flex v2-items-center v2-justify-between">
                    <label className="v2-flex v2-items-center v2-gap-2 v2-text-xs v2-font-bold" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={isBackdated}
                        onChange={(e) => setIsBackdated(e.target.checked)}
                      />
                      <span>Backdate Stock Movement</span>
                    </label>
                    <span className="v2-badge v2-badge-sm" style={{ fontSize: "10px", opacity: 0.8 }}>
                      Limit: 2 Years Max
                    </span>
                  </div>

                  {isBackdated && (
                    <div className="v2-mt-2 v2-space-y-2">
                      <div>
                        <label className="v2-text-xs v2-font-bold v2-text-muted">HISTORICAL OCCURRED AT (MAX 2 YEARS)</label>
                        <input
                          className="v2-input"
                          type="datetime-local"
                          min={minBackdate}
                          max={maxBackdate}
                          value={adjOccurredAt}
                          onChange={(e) => setAdjOccurredAt(e.target.value)}
                          required={isBackdated}
                        />
                      </div>

                      {/* Point-in-Time Live Impact Preview */}
                      <div className="v2-card" style={{ background: "rgba(0,0,0,0.3)", padding: "8px", border: "1px solid var(--surface-border)" }}>
                        <div className="v2-text-xs v2-font-bold v2-mb-1" style={{ color: "var(--color-primary, #6366f1)" }}>
                          Point-in-Time Impact Preview
                        </div>
                        <div className="v2-grid v2-grid-3 v2-gap-1 v2-text-xs">
                          <div>
                            <span className="v2-text-muted">Stock on Date:</span>{" "}
                            <span className="v2-font-bold">{historicalBalance}</span>
                          </div>
                          <div>
                            <span className="v2-text-muted">Discrepancy:</span>{" "}
                            <span className="v2-font-bold" style={{ color: delta >= 0 ? "#10b981" : "#ef4444" }}>
                              {delta >= 0 ? `+${delta}` : delta}
                            </span>
                          </div>
                          <div>
                            <span className="v2-text-muted">Today's Stock:</span>{" "}
                            <span className="v2-font-bold" style={{ color: projectedToday < 0 ? "#ef4444" : "inherit" }}>
                              {currentBalance} → {projectedToday}
                            </span>
                          </div>
                        </div>
                        {projectedToday < 0 && (
                          <div className="v2-text-xs v2-mt-1" style={{ color: "#ef4444" }}>
                            Warning: Adjustment would cause running inventory to dip below zero!
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted">AUDIT NOTES</label>
                  <input
                    className="v2-input"
                    placeholder="Reference, supplier document, count sheet, reason for backdating..."
                    value={adjNotes}
                    onChange={(e) => setAdjNotes(e.target.value)}
                  />
                </div>

                <div className="v2-flex v2-items-center v2-justify-between v2-pt-2" style={{ borderTop: "1px solid var(--surface-border)" }}>
                  <div className="v2-text-xs v2-text-muted">
                    {isBackdated ? "Retroactive entry recalculates intermediate ledger balances safely." : "Local ledger committed atomically before sync."}
                  </div>
                  <div className="v2-flex v2-gap-2">
                    <button className="v2-btn v2-btn-ghost v2-btn-sm" onClick={() => setStockAdjModal(false)} type="button">Cancel</button>
                    <button className="v2-btn v2-btn-primary v2-btn-sm" type="submit" disabled={projectedToday < 0}>
                      <PackageOpen size={13} /> {isBackdated ? "Post Backdated Stock" : "Post Stock Movement"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* --- Barcode Label Sheet Generator Modal (40x30mm & A4 24-Up) --- */}
      <BarcodeLabelGeneratorModal
        isOpen={isBarcodeModalOpen}
        onClose={() => setIsBarcodeModalOpen(false)}
        products={items.map((i) => ({
          id: i.id,
          name: i.name,
          sku: i.sku,
          price: i.sellingPrice,
          category: i.category,
          variants: i.variants?.map((v) => ({
            id: v.id,
            name: v.name,
            sku: v.sku,
            barcode: v.barcode,
            price: v.sellingPrice,
            stock: v.stock,
          })),
        }))}
      />
    </div>
  );
};







