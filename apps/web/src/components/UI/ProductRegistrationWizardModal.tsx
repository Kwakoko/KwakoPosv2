/**
 * KwakoPos v2 — 5-Step Product Registration Wizard UI
 * ─────────────────────────────────────────────────────────────────────────────
 * Production-grade multi-step wizard replacing single-form product registration:
 *   Step 1: Product Identity (Name, Category, Brand, Product Type, SKU Auto/Manual)
 *   Step 2: Commercial Setup (Buying Cost, Selling Price, Margin Amount & %, Price Tiers)
 *   Step 3: Inventory Setup (Tracking Type, Opening Stock Movement, Reorder Level, Batch/Expiry)
 *   Step 4: Variant Studio (Toggle, Attribute Options, Matrix Generator, SKU/Barcode/Price/Stock)
 *   Step 5: Review & Register (Compact audit summary, Validation checklist, Safe transaction)
 *
 * Core Invariant:
 *   Opening stock is NEVER written directly to Product or Variant stock fields as
 *   an independent authority. Opening quantities are recorded strictly as
 *   StockLedger movements and StockAdjustment outbox mutations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Package, Layers, DollarSign, Plus, Trash2, Zap,
  AlertTriangle, Check, CheckCircle2, ChevronRight, ChevronLeft,
  X, RefreshCw, Sparkles, Info
} from "lucide-react";
import type { LocalIndexedDbStore } from "../../indexedDb.js";
import { useToast } from "../../context/ToastContext.js";
import { useAudioFeedback } from "../../utils/useAudioFeedback.js";
import { DATA_CHANGED_EVENT, publishDataChanged } from "../../services/dataChangeEvent.js";
import { STOCK_CHANGED_EVENT } from "../../services/inventoryStockService.js";
import { NumberStepper } from "./NumberStepper.js";

export type ProductType = "STANDARD" | "COMPOSITE" | "SERVICE" | "SERIALIZED";
export type TrackingType = "TRACKED" | "BATCH_EXPIRY" | "SERIALIZED" | "NON_TRACKED";

export interface CategoryOption {
  id: string;
  name: string;
  color?: string;
}

export interface BrandOption {
  id: string;
  name: string;
}

export interface VariantMatrixRow {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  attributes: Record<string, string>;
  buyingPrice: number;
  sellingPrice: number;
  priceOverridden: boolean;
  openingStock: number;
  reorderLevel: number;
}

export interface ProductRegistrationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCategories: CategoryOption[];
  allBrands: BrandOption[];
  onOpenAddCategory: () => void;
  onOpenAddBrand: () => void;
  currentTenantId?: string | null;
  currentBranchId?: string | null;
  db: LocalIndexedDbStore;
  syncOutbox?: () => Promise<any>;
  onProductCreated: () => void;
}

const money = (v: number) => `Tsh ${Math.round(v).toLocaleString()}`;

export const ProductRegistrationWizardModal: React.FC<ProductRegistrationWizardModalProps> = ({
  isOpen,
  onClose,
  allCategories,
  allBrands,
  onOpenAddCategory,
  onOpenAddBrand,
  currentTenantId,
  currentBranchId,
  db,
  syncOutbox,
  onProductCreated,
}) => {
  const toast = useToast();
  const { playSuccessChime, playWarningTone } = useAudioFeedback();

  // Wizard Navigation State (1 to 5)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [visitedSteps, setVisitedSteps] = useState<Set<number>>(new Set([1]));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // ── Step 1: Product Identity State ──────────────────────────────────────────
  const defaultInitialCategory = allCategories[0]?.name || "";
  const defaultInitialBrand = allBrands.find((b) => b.name.toLowerCase() !== "general")?.name || allBrands[0]?.name || "";

  const [name, setName] = useState("");
  const [category, setCategory] = useState(defaultInitialCategory);
  const [brand, setBrand] = useState(defaultInitialBrand);
  const [productType, setProductType] = useState<ProductType>("STANDARD");
  const [sku, setSku] = useState("");
  const [isManualSku, setIsManualSku] = useState(false);

  // ── Step 2: Commercial Setup State ──────────────────────────────────────────
  const [buyingPrice, setBuyingPrice] = useState<number | "">("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [showPriceTiers, setShowPriceTiers] = useState(false);
  const [wholesalePrice, setWholesalePrice] = useState<number | "">("");
  const [vipPrice, setVipPrice] = useState<number | "">("");
  const [floorPrice, setFloorPrice] = useState<number | "">("");

  // ── Step 3: Inventory Setup State ───────────────────────────────────────────
  const [trackingType, setTrackingType] = useState<TrackingType>("TRACKED");
  const [openingStock, setOpeningStock] = useState<number | "">("");
  const [reorderLevel, setReorderLevel] = useState<number | "">(10);
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  // ── Step 4: Variant Studio State ────────────────────────────────────
  const [hasVariants, setHasVariants] = useState(false);
  const [opt1Name, setOpt1Name] = useState("Size");
  const [opt1Values, setOpt1Values] = useState("Small, Medium, Large");
  const [opt2Name, setOpt2Name] = useState("");
  const [opt2Values, setOpt2Values] = useState("");
  const [variants, setVariants] = useState<VariantMatrixRow[]>([]);

  // Derived Commercial Values
  const numBuying = typeof buyingPrice === "number" ? buyingPrice : 0;
  const numSelling = typeof sellingPrice === "number" ? sellingPrice : 0;
  const marginAmount = numSelling - numBuying;
  const marginPercent = numSelling > 0 ? (marginAmount / numSelling) * 100 : 0;
  const isNegativeMargin = numSelling > 0 && numBuying > numSelling;

  // Auto-generate Base SKU when name changes and manual override is not set
  const generateAutoSku = useCallback((prodName: string) => {
    const cleanPrefix = prodName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "PROD";
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    return `SKU-${cleanPrefix}-${randomSuffix}`;
  }, []);

  useEffect(() => {
    if (!isManualSku && name.trim()) {
      setSku(generateAutoSku(name));
    }
  }, [name, isManualSku, generateAutoSku]);

  // Synchronize category and brand state with active catalog options
  useEffect(() => {
    if (isOpen) {
      if (!category && allCategories.length > 0) {
        setCategory(allCategories[0].name);
      }
      if (!brand && allBrands.length > 0) {
        const defaultBrand = allBrands.find((b) => b.name.toLowerCase() !== "general") || allBrands[0];
        if (defaultBrand) {
          setBrand(defaultBrand.name);
        }
      }
    }
  }, [isOpen, allCategories, allBrands, category, brand]);

  // Generate Matrix Combinations from Options
  const generateVariantMatrix = useCallback(() => {
    const vals1 = opt1Values
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const vals2 = opt2Values
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const baseSkuClean = sku.trim() || generateAutoSku(name);
    const defaultCost = typeof buyingPrice === "number" ? buyingPrice : 0;
    const defaultRetail = typeof sellingPrice === "number" ? sellingPrice : 0;
    const defaultReorder = typeof reorderLevel === "number" ? reorderLevel : 5;

    const generated: VariantMatrixRow[] = [];

    if (vals1.length === 0) {
      setVariants([]);
      return;
    }

    if (vals2.length === 0) {
      for (const v1 of vals1) {
        const rowId = `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const codeSuffix = v1.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
        generated.push({
          id: rowId,
          name: `${name.trim() || "Product"} - ${v1}`,
          sku: `${baseSkuClean}-${codeSuffix}`,
          barcode: `890${Math.floor(100000000 + Math.random() * 900000000)}`,
          attributes: { [opt1Name.trim() || "Option"]: v1 },
          buyingPrice: defaultCost,
          sellingPrice: defaultRetail,
          priceOverridden: false,
          openingStock: 0,
          reorderLevel: defaultReorder,
        });
      }
    } else {
      for (const v1 of vals1) {
        for (const v2 of vals2) {
          const rowId = `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const code1 = v1.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
          const code2 = v2.replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
          generated.push({
            id: rowId,
            name: `${name.trim() || "Product"} - ${v1} / ${v2}`,
            sku: `${baseSkuClean}-${code1}-${code2}`,
            barcode: `890${Math.floor(100000000 + Math.random() * 900000000)}`,
            attributes: {
              [opt1Name.trim() || "Option 1"]: v1,
              [opt2Name.trim() || "Option 2"]: v2,
            },
            buyingPrice: defaultCost,
            sellingPrice: defaultRetail,
            priceOverridden: false,
            openingStock: 0,
            reorderLevel: defaultReorder,
          });
        }
      }
    }

    setVariants(generated);
  }, [opt1Values, opt2Values, sku, generateAutoSku, name, buyingPrice, sellingPrice, reorderLevel, opt1Name, opt2Name]);

  // Calculate variant stock sum
  const totalVariantStock = useMemo(() => {
    return variants.reduce((acc, v) => acc + (Number(v.openingStock) || 0), 0);
  }, [variants]);

  // Step Validation Checks
  const stepErrors = useMemo(() => {
    const errs: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

    // Step 1 Validation
    const effectiveCategory = category.trim() || allCategories[0]?.name || "";
    if (!name.trim()) errs[1].push("Product Name is required.");
    if (!effectiveCategory) errs[1].push("Category is required.");
    if (!sku.trim()) errs[1].push("SKU Code is required.");

    // Check SKU tenant uniqueness
    if (sku.trim() && db) {
      const trimmedSku = sku.trim().toLowerCase();
      const duplicateProd = Array.from(db.products.values()).some((p: any) => {
        if (currentTenantId && p.tenantId && p.tenantId !== currentTenantId) return false;
        return p.sku && p.sku.toLowerCase() === trimmedSku;
      });
      const duplicateVar = Array.from(db.productVariants.values()).some((v: any) => {
        if (currentTenantId && v.tenantId && v.tenantId !== currentTenantId) return false;
        return v.sku && v.sku.toLowerCase() === trimmedSku;
      });
      if (duplicateProd || duplicateVar) {
        errs[1].push(`SKU "${sku}" is already assigned to another catalog record in this tenant.`);
      }
    }

    // Step 2 Validation
    if (buyingPrice === "" || Number(buyingPrice) < 0) {
      errs[2].push("Buying Cost must be a valid non-negative number.");
    }
    if (sellingPrice === "" || Number(sellingPrice) < 0) {
      errs[2].push("Selling Retail Price must be a valid non-negative number.");
    }

    // Step 3 Validation
    if (!hasVariants && (openingStock !== "" && Number(openingStock) < 0)) {
      errs[3].push("Opening stock cannot be negative.");
    }
    if (reorderLevel !== "" && Number(reorderLevel) < 0) {
      errs[3].push("Reorder threshold cannot be negative.");
    }
    if (trackingType === "BATCH_EXPIRY" && !batchNumber.trim()) {
      errs[3].push("Batch/Lot number is required when Batch & Expiry Tracking is selected.");
    }

    // Step 4 Validation
    if (hasVariants) {
      if (variants.length === 0) {
        errs[4].push("At least one variant combination must be generated when variants are enabled.");
      } else {
        const skuSet = new Set<string>();
        const barcodeSet = new Set<string>();
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          if (!v.name.trim()) errs[4].push(`Variant #${i + 1} Name cannot be empty.`);
          if (!v.sku.trim()) {
            errs[4].push(`Variant #${i + 1} SKU cannot be empty.`);
          } else {
            const vSkuLower = v.sku.trim().toLowerCase();
            if (skuSet.has(vSkuLower)) {
              errs[4].push(`Variant SKU "${v.sku}" is duplicated within the matrix.`);
            }
            skuSet.add(vSkuLower);
          }
          if (v.barcode && v.barcode.trim()) {
            const bCode = v.barcode.trim();
            if (barcodeSet.has(bCode)) {
              errs[4].push(`Variant Barcode "${bCode}" is duplicated within the matrix.`);
            }
            barcodeSet.add(bCode);
          }
          if (v.openingStock < 0) {
            errs[4].push(`Variant "${v.name}" opening stock cannot be negative.`);
          }
          if (v.buyingPrice < 0 || v.sellingPrice < 0) {
            errs[4].push(`Variant "${v.name}" prices must be non-negative.`);
          }
        }
      }
    }

    // Step 5 aggregates all previous step errors
    errs[5] = [...errs[1], ...errs[2], ...errs[3], ...errs[4]];

    return errs;
  }, [
    name, category, allCategories, sku, currentTenantId, db, buyingPrice, sellingPrice,
    hasVariants, openingStock, reorderLevel, trackingType, batchNumber, variants
  ]);

  const isCurrentStepValid = stepErrors[currentStep].length === 0;
  const isAllValid = stepErrors[5].length === 0;

  // Navigation Handlers
  const handleNext = () => {
    if (!isCurrentStepValid) {
      playWarningTone();
      return;
    }
    // Ensure category and brand are populated from active selections if not already set
    if (!category.trim() && allCategories.length > 0) {
      setCategory(allCategories[0].name);
    }
    if (!brand.trim() && allBrands.length > 0) {
      const defaultBrand = allBrands.find((b) => b.name.toLowerCase() !== "general") || allBrands[0];
      if (defaultBrand) {
        setBrand(defaultBrand.name);
      }
    }
    if (currentStep < 5) {
      const next = (currentStep + 1) as 1 | 2 | 3 | 4 | 5;
      setCurrentStep(next);
      setVisitedSteps((prev) => new Set([...prev, next]));
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const handleJumpToStep = (stepNum: 1 | 2 | 3 | 4 | 5) => {
    if (visitedSteps.has(stepNum) || stepNum <= currentStep) {
      setCurrentStep(stepNum);
    }
  };

  // Safe Close / Discard
  const handleClose = () => {
    const isDirty = Boolean(name.trim() || buyingPrice !== "" || sellingPrice !== "" || openingStock !== "");
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const confirmDiscard = () => {
    setShowDiscardConfirm(false);
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setCurrentStep(1);
    setVisitedSteps(new Set([1]));
    setName("");
    setCategory(allCategories[0]?.name || "");
    const defaultBrand = allBrands.find((b) => b.name.toLowerCase() !== "general") || allBrands[0];
    setBrand(defaultBrand?.name || "");
    setProductType("STANDARD");
    setSku("");
    setIsManualSku(false);
    setBuyingPrice("");
    setSellingPrice("");
    setShowPriceTiers(false);
    setWholesalePrice("");
    setVipPrice("");
    setFloorPrice("");
    setTrackingType("TRACKED");
    setOpeningStock("");
    setReorderLevel(10);
    setBatchNumber("");
    setExpiryDate("");
    setHasVariants(false);
    setOpt1Name("Size");
    setOpt1Values("Small, Medium, Large");
    setOpt2Name("");
    setOpt2Values("");
    setVariants([]);
  };

  // ── Final Registration Transaction ──────────────────────────────────────────
  const handleRegisterProduct = async () => {
    if (!isAllValid) {
      playWarningTone();
      return;
    }

    setIsSubmitting(true);
    try {
      const prodId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const now = new Date().toISOString();
      const baseSku = sku.trim();
      const costPriceNum = Number(buyingPrice) || 0;
      const retailPriceNum = Number(sellingPrice) || 0;
      const reorderLevelNum = Number(reorderLevel) || 10;

      const finalCategory = (category.trim() || allCategories[0]?.name || "General").trim();
      const finalBrand = (brand.trim() || allBrands.find((b) => b.name.toLowerCase() !== "general")?.name || allBrands[0]?.name || "General").trim();

      const selectedCategory = allCategories.find((c) => c.name.trim().toLowerCase() === finalCategory.toLowerCase());
      const selectedBrand = allBrands.find((b) => b.name.trim().toLowerCase() === finalBrand.toLowerCase());

      // Invariant: Product catalog stock values are strictly 0.
      // Stock quantity is projected solely from StockLedger movements.
      const productRecord = {
        id: prodId,
        tenantId: currentTenantId || "default",
        branchId: currentBranchId || "default",
        name: name.trim(),
        sku: baseSku,
        category: finalCategory,
        categoryId: selectedCategory?.id && selectedCategory.id !== "default" ? selectedCategory.id : undefined,
        brand: finalBrand,
        brandId: selectedBrand?.id && selectedBrand.id !== "default" ? selectedBrand.id : undefined,
        productType,
        buyingPrice: costPriceNum,
        sellingPrice: retailPriceNum,
        costPrice: costPriceNum,
        currentMarginAmount: marginAmount,
        currentMarginPercentage: marginPercent,
        stock: 0,
        totalStock: 0,
        availableStock: 0,
        reorderLevel: reorderLevelNum,
        status: "Active" as const,
        hasVariants,
        batchNumber: batchNumber.trim() || undefined,
        expiryDate: expiryDate || undefined,
        trackingType,
        wholesalePrice: wholesalePrice !== "" ? Number(wholesalePrice) : undefined,
        vipPrice: vipPrice !== "" ? Number(vipPrice) : undefined,
        floorPrice: floorPrice !== "" ? Number(floorPrice) : undefined,
        createdAt: now,
        updatedAt: now,
      };

      const scopedCtx = currentTenantId
        ? { tenantId: currentTenantId, branchId: currentBranchId || undefined }
        : undefined;

      if (hasVariants && variants.length > 0) {
        // --- Multi-Variant Product Registration ---
        const totalOpening = variants.reduce((sum, v) => sum + (Number(v.openingStock) || 0), 0);
        productRecord.stock = totalOpening;
        productRecord.totalStock = totalOpening;
        productRecord.availableStock = totalOpening;

        const variantsToSave = variants.map((v) => {
          const vOpeningStock = Number(v.openingStock) || 0;
          return {
            id: v.id,
            productId: prodId,
            name: v.name.trim(),
            sku: v.sku.trim(),
            barcode: v.barcode ? v.barcode.trim() : "",
            attributes: v.attributes || {},
            buyingPrice: Number(v.buyingPrice) || 0,
            costPrice: Number(v.buyingPrice) || 0,
            sellingPrice: Number(v.sellingPrice) || 0,
            price: Number(v.sellingPrice) || 0,
            inventoryQuantity: 0,
            stock: 0,
            reorderLevel: Number(v.reorderLevel) || 5,
            isActive: true,
            tenantId: currentTenantId || undefined,
            createdAt: now,
            updatedAt: now,
          };
        });

        const tenantContext = { tenantId: currentTenantId || "tenant-default", branchId: currentBranchId || "branch-default" };
        const makeOutboxItem = (entityType: string, entityId: string, payload: Record<string, unknown>, idempotencyKey: string) => ({
          id: idempotencyKey, entityType, entityId, operationType: "CREATE" as const, payload,
          clientCreatedAt: now, idempotencyKey, status: "PENDING" as const,
          tenantId: tenantContext.tenantId, branchId: tenantContext.branchId,
        });

        const writes: Array<{ store: any; key: string; value?: any; delete?: boolean }> = [
          { store: "products", key: prodId, value: productRecord },
          ...variantsToSave.map((v) => ({ store: "productVariants", key: v.id, value: v })),
        ];
        const outboxItems: any[] = [
          makeOutboxItem("Product", prodId, { ...productRecord, variants: variantsToSave }, "PROD-CREATE-" + prodId),
          ...variantsToSave.map((v) => makeOutboxItem("ProductVariant", v.id, { ...v }, "VAR-CREATE-" + v.id)),
        ];
        for (const v of variantsToSave) {
          const vOpeningStock = Number(variants.find((item) => item.id === v.id)?.openingStock) || 0;
          if (vOpeningStock <= 0) continue;
          const ledgerId = "led-" + v.id;
          writes.push({
            store: "stockLedger", key: ledgerId,
            value: {
              id: ledgerId, productId: prodId, variantId: v.id, sku: v.sku, name: v.name,
              quantity: vOpeningStock, quantityChange: vOpeningStock, quantityBefore: 0, quantityAfter: vOpeningStock,
              balanceAfter: vOpeningStock, reason: "OPENING_STOCK", movementType: "OPENING_STOCK",
              timestamp: now, tenantId: tenantContext.tenantId, branchId: tenantContext.branchId,
              operationId: "adj-" + v.id, idempotencyKey: "ADJ-" + v.id,
            },
          });
          outboxItems.push(makeOutboxItem(
            "StockAdjustment", "adj-" + v.id,
            {
              productId: prodId, variantId: v.id, sku: v.sku, adjustmentType: "INCREASE",
              movementType: "OPENING_STOCK", quantityChange: vOpeningStock, reason: "OPENING_STOCK",
              deviceId: "web-client", operationId: "adj-" + v.id, idempotencyKey: "ADJ-" + v.id,
            },
            "ADJ-" + v.id,
          ));
        }
        await db.executeAtomicMutation({ writes, outboxItems, tenantContext });      } else {
        // --- Non-Variant Product Registration ---
        const numOpeningStock = Number(openingStock) || 0;
        productRecord.stock = numOpeningStock;
        productRecord.totalStock = numOpeningStock;
        productRecord.availableStock = numOpeningStock;

        const defaultVarId = `${prodId}-default`;
        const defaultVariant = {
          id: defaultVarId,
          productId: prodId,
          name: "Standard",
          sku: `${baseSku}-STD`,
          barcode: "",
          price: retailPriceNum,
          costPrice: costPriceNum,
          buyingPrice: costPriceNum,
          sellingPrice: retailPriceNum,
          inventoryQuantity: 0,
          stock: 0,
          reorderLevel: reorderLevelNum,
          isActive: true,
          tenantId: currentTenantId || undefined,
          createdAt: now,
          updatedAt: now,
        };

        const tenantContext = { tenantId: currentTenantId || "tenant-default", branchId: currentBranchId || "branch-default" };
        const makeOutboxItem = (entityType: string, entityId: string, payload: Record<string, unknown>, idempotencyKey: string) => ({
          id: idempotencyKey, entityType, entityId, operationType: "CREATE" as const, payload,
          clientCreatedAt: now, idempotencyKey, status: "PENDING" as const,
          tenantId: tenantContext.tenantId, branchId: tenantContext.branchId,
        });
        const writes: Array<{ store: any; key: string; value?: any; delete?: boolean }> = [
          { store: "products", key: prodId, value: productRecord },
          { store: "productVariants", key: defaultVarId, value: defaultVariant },
        ];
        const outboxItems: any[] = [
          makeOutboxItem("Product", prodId, { ...productRecord, hasVariants: false, variants: [defaultVariant] }, "PROD-CREATE-" + prodId),
          makeOutboxItem("ProductVariant", defaultVarId, { ...defaultVariant }, "VAR-CREATE-" + defaultVarId),
        ];
        if (numOpeningStock > 0) {
          const ledgerId = "led-" + defaultVarId;
          writes.push({
            store: "stockLedger", key: ledgerId,
            value: {
              id: ledgerId, productId: prodId, variantId: defaultVarId, sku: defaultVariant.sku, name: productRecord.name,
              quantity: numOpeningStock, quantityChange: numOpeningStock, quantityBefore: 0, quantityAfter: numOpeningStock,
              balanceAfter: numOpeningStock, reason: "OPENING_STOCK", movementType: "OPENING_STOCK",
              timestamp: now, tenantId: tenantContext.tenantId, branchId: tenantContext.branchId,
              operationId: "adj-" + defaultVarId, idempotencyKey: "ADJ-" + defaultVarId,
            },
          });
          outboxItems.push(makeOutboxItem(
            "StockAdjustment", "adj-" + defaultVarId,
            {
              productId: prodId, variantId: defaultVarId, sku: defaultVariant.sku, adjustmentType: "INCREASE",
              movementType: "OPENING_STOCK", quantityChange: numOpeningStock, reason: "OPENING_STOCK",
              deviceId: "web-client", operationId: "adj-" + defaultVarId, idempotencyKey: "ADJ-" + defaultVarId,
            },
            "ADJ-" + defaultVarId,
          ));
        }
        await db.executeAtomicMutation({ writes, outboxItems, tenantContext });      }

      // Success workflow
      playSuccessChime();
      toast.success(
        "Product Registered Successfully",
        hasVariants
          ? `Product "${name}" registered with ${variants.length} variants and opening movements.`
          : `Product "${name}" registered with initial stock movement.`
      );

      publishDataChanged({ action: "INVENTORY_CHANGED" });
      window.dispatchEvent(new CustomEvent(STOCK_CHANGED_EVENT, { detail: { productId: prodId, reason: "PRODUCT_CREATED" } }));
      void syncOutbox?.().catch(() => {});

      onProductCreated();
      resetForm();
      onClose();
    } catch (err: any) {
      console.error("[Wizard] Product registration failed:", err);
      playWarningTone();
      toast.error("Registration Failed", err?.message || "Failed to persist product record.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const STEPS_CONFIG = [
    { num: 1, label: "Identity", icon: Package, desc: "Name & SKU" },
    { num: 2, label: "Commercial", icon: DollarSign, desc: "Cost & Retail" },
    { num: 3, label: "Inventory", icon: Layers, desc: "Stock & Rules" },
    { num: 4, label: "Variants", icon: Sparkles, desc: "Matrix Studio" },
    { num: 5, label: "Review", icon: CheckCircle2, desc: "Register" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10, 15, 29, 0.82)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      <div
        className="v2-card"
        style={{
          width: currentStep === 4 && hasVariants ? 940 : 760,
          maxWidth: "96vw",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          padding: 0,
          overflow: "hidden",
          borderRadius: "var(--radius-lg, 12px)",
          border: "1px solid var(--surface-border)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6)",
          transition: "width 0.2s ease-in-out",
        }}
      >
        {/* ── Wizard Header ─────────────────────────────────────────────────── */}
        <div
          className="v2-p-4 v2-flex v2-items-center v2-justify-between"
          style={{
            borderBottom: "1px solid var(--surface-border)",
            background: "var(--surface)",
          }}
        >
          <div className="v2-flex v2-items-center v2-gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "var(--radius-md, 8px)",
                background: "var(--accent-muted)",
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
              }}
            >
              <Package size={22} />
            </div>
            <div>
              <h2 id="wizard-title" className="v2-text-base v2-font-black" style={{ margin: 0 }}>
                Product Registration Wizard
              </h2>
              <p className="v2-text-xs v2-text-muted" style={{ margin: 0 }}>
                Step {currentStep} of 5 &bull; {STEPS_CONFIG[currentStep - 1].desc}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="v2-btn v2-btn-ghost v2-btn-sm"
            onClick={handleClose}
            aria-label="Close product registration modal"
            style={{ padding: "0.4rem 0.6rem" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Step Progress Indicator ───────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--surface-border)",
          }}
        >
          {STEPS_CONFIG.map((s) => {
            const isCurrent = s.num === currentStep;
            const isCompleted = visitedSteps.has(s.num) && s.num < currentStep;
            const hasError = (stepErrors[s.num]?.length || 0) > 0 && visitedSteps.has(s.num);
            const canClick = visitedSteps.has(s.num) || s.num <= currentStep;
            const Icon = s.icon;

            return (
              <button
                key={s.num}
                type="button"
                onClick={() => canClick && handleJumpToStep(s.num as any)}
                disabled={!canClick}
                style={{
                  background: isCurrent ? "var(--surface)" : "transparent",
                  border: "none",
                  borderBottom: isCurrent ? "2px solid var(--accent)" : "2px solid transparent",
                  padding: "0.65rem 0.5rem",
                  cursor: canClick ? "pointer" : "not-allowed",
                  opacity: canClick ? 1 : 0.45,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.2rem",
                  transition: "all 0.15s ease",
                  textAlign: "center",
                }}
              >
                <div className="v2-flex v2-items-center v2-gap-1">
                  {isCompleted ? (
                    <CheckCircle2 size={13} style={{ color: "var(--success)" }} />
                  ) : hasError ? (
                    <AlertTriangle size={13} style={{ color: "var(--danger)" }} />
                  ) : (
                    <Icon size={13} style={{ color: isCurrent ? "var(--accent)" : "var(--muted)" }} />
                  )}
                  <span
                    className="v2-text-xs v2-font-bold"
                    style={{ color: isCurrent ? "var(--text)" : "var(--muted)" }}
                  >
                    {s.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Step Body Container ───────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1.25rem 1.5rem",
            background: "var(--surface)",
          }}
        >
          {/* Validation Notice Bar if step has errors */}
          {stepErrors[currentStep].length > 0 && visitedSteps.has(currentStep) && (
            <div
              className="v2-p-2 v2-mb-3 v2-flex v2-items-center v2-gap-2"
              style={{
                background: "var(--danger-muted)",
                border: "1px solid var(--danger)",
                borderRadius: "var(--radius-sm)",
                color: "var(--danger)",
                fontSize: "12px",
              }}
            >
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <div>
                <strong>Please address the following:</strong> {stepErrors[currentStep][0]}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 1: PRODUCT IDENTITY
             ───────────────────────────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="v2-space-y-4">
              <div>
                <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                  PRODUCT FULL NAME <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  className="v2-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Azam Premium Wheat Flour 2kg or Cotton Polo Shirt"
                  autoFocus
                  required
                />
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <label className="v2-text-xs v2-font-bold v2-text-muted">
                      CATEGORY <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={onOpenAddCategory}
                      style={{ padding: "0 .25rem", height: "auto", fontSize: "10px" }}
                    >
                      + New Cat
                    </button>
                  </div>
                  <select
                    className="v2-input"
                    value={category || (allCategories[0]?.name ?? "")}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {allCategories.length === 0 && (
                      <option value="">-- No Categories Available --</option>
                    )}
                    {allCategories.map((c) => (
                      <option key={c.id || c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <label className="v2-text-xs v2-font-bold v2-text-muted">BRAND / MAKE</label>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={onOpenAddBrand}
                      style={{ padding: "0 .25rem", height: "auto", fontSize: "10px" }}
                    >
                      + New Brand
                    </button>
                  </div>
                  <select
                    className="v2-input"
                    value={brand || (allBrands.find((b) => b.name.toLowerCase() !== "general")?.name ?? allBrands[0]?.name ?? "")}
                    onChange={(e) => setBrand(e.target.value)}
                  >
                    {allBrands.length === 0 && (
                      <option value="">-- No Brands Available --</option>
                    )}
                    {allBrands
                      .filter((b) => b.name.toLowerCase() !== "general")
                      .map((b) => (
                        <option key={b.id || b.name} value={b.name}>
                          {b.name}
                        </option>
                      ))}
                    {brand && !allBrands.some((b) => b.name.toLowerCase() === brand.toLowerCase()) && (
                      <option value={brand}>{brand}</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    PRODUCT TYPE
                  </label>
                  <select
                    className="v2-input"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value as ProductType)}
                  >
                    <option value="STANDARD">Standard Physical Product</option>
                    <option value="COMPOSITE">Composite / Pack / Bundle</option>
                    <option value="SERVICE">Service / Non-Stock</option>
                    <option value="SERIALIZED">Serialized / High Value</option>
                  </select>
                </div>

                <div>
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-1">
                    <label className="v2-text-xs v2-font-bold v2-text-muted">
                      PRODUCT SKU <span style={{ color: "var(--danger)" }}>*</span>
                    </label>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={() => {
                        if (isManualSku) {
                          setIsManualSku(false);
                          setSku(generateAutoSku(name));
                        } else {
                          setIsManualSku(true);
                        }
                      }}
                      style={{ padding: "0 .25rem", height: "auto", fontSize: "10px" }}
                    >
                      {isManualSku ? "Auto-Generate" : "Manual Override"}
                    </button>
                  </div>
                  <div className="v2-flex v2-gap-1">
                    <input
                      className="v2-input v2-mono"
                      value={sku}
                      readOnly={!isManualSku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="e.g. SKU-AZAM-1001"
                      required
                    />
                    {!isManualSku && (
                      <button
                        type="button"
                        className="v2-btn v2-btn-secondary v2-btn-sm"
                        onClick={() => setSku(generateAutoSku(name))}
                        title="Regenerate SKU"
                      >
                        <RefreshCw size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 2: COMMERCIAL SETUP
             ───────────────────────────────────────────────────────────────── */}
          {currentStep === 2 && (
            <div className="v2-space-y-4">
              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    BUYING COST PRICE (TSH) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    className="v2-input v2-mono"
                    type="number"
                    min={0}
                    step="any"
                    value={buyingPrice}
                    onChange={(e) => setBuyingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 2400"
                    autoFocus
                    required
                  />
                  <span className="v2-text-xs v2-text-muted">Acquisition / wholesale supplier cost</span>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    SELLING RETAIL PRICE (TSH) <span style={{ color: "var(--danger)" }}>*</span>
                  </label>
                  <input
                    className="v2-input v2-mono"
                    type="number"
                    min={0}
                    step="any"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 3000"
                    required
                  />
                  <span className="v2-text-xs v2-text-muted">Base counter & checkout selling price</span>
                </div>
              </div>

              {/* Live Derived Margin Dashboard Widget */}
              <div
                className="v2-p-3"
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: isNegativeMargin ? "1px solid var(--danger)" : "1px solid var(--surface-border)",
                }}
              >
                <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                  <span className="v2-text-xs v2-font-bold v2-text-muted">DERIVED COMMERCIAL MARGIN</span>
                  {isNegativeMargin ? (
                    <span className="badge v2-badge-danger">Negative Margin Warning</span>
                  ) : marginPercent > 25 ? (
                    <span className="badge v2-badge-success">High Margin</span>
                  ) : (
                    <span className="badge v2-badge-primary">Standard Margin</span>
                  )}
                </div>

                <div className="v2-grid v2-grid-2 v2-gap-3">
                  <div>
                    <span className="v2-text-xs v2-text-muted">Unit Gross Margin Amount:</span>
                    <div
                      className="v2-text-lg v2-font-black v2-mono"
                      style={{ color: marginAmount < 0 ? "var(--danger)" : "var(--success)" }}
                    >
                      {money(marginAmount)}
                    </div>
                  </div>
                  <div>
                    <span className="v2-text-xs v2-text-muted">Gross Margin Percentage:</span>
                    <div
                      className="v2-text-lg v2-font-black v2-mono"
                      style={{ color: marginPercent < 0 ? "var(--danger)" : "var(--success)" }}
                    >
                      {marginPercent.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {isNegativeMargin && (
                  <div
                    className="v2-mt-2 v2-p-2 v2-flex v2-items-center v2-gap-2"
                    style={{
                      background: "var(--danger-muted)",
                      borderRadius: "var(--radius-xs)",
                      color: "var(--danger)",
                      fontSize: "11px",
                    }}
                  >
                    <AlertTriangle size={13} />
                    <span>Selling price is lower than buying cost. Selling at this price will incur a loss per unit.</span>
                  </div>
                )}
              </div>

              {/* Optional Multi-Tier Pricing Accordion */}
              <div
                style={{
                  border: "1px solid var(--surface-border)",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  className="v2-flex v2-items-center v2-justify-between v2-w-full v2-p-3"
                  onClick={() => setShowPriceTiers((prev) => !prev)}
                  style={{
                    background: "var(--surface-2)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div className="v2-flex v2-items-center v2-gap-2">
                    <DollarSign size={14} className="v2-text-accent" />
                    <span className="v2-font-bold v2-text-xs">Optional Customer Price Tiers</span>
                  </div>
                  <span className="v2-text-xs v2-text-muted">
                    {showPriceTiers ? "Collapse ▲" : "Expand ▼"}
                  </span>
                </button>

                {showPriceTiers && (
                  <div className="v2-p-3 v2-grid v2-grid-3 v2-gap-2" style={{ background: "var(--surface)" }}>
                    <div>
                      <label className="v2-text-xs v2-text-muted v2-block v2-mb-1">Wholesale Price</label>
                      <input
                        className="v2-input v2-input-sm v2-mono"
                        type="number"
                        min={0}
                        value={wholesalePrice}
                        onChange={(e) => setWholesalePrice(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Bulk / Carton"
                      />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-text-muted v2-block v2-mb-1">VIP / Member Price</label>
                      <input
                        className="v2-input v2-input-sm v2-mono"
                        type="number"
                        min={0}
                        value={vipPrice}
                        onChange={(e) => setVipPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Loyalty Member"
                      />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-text-muted v2-block v2-mb-1">Floor / Min Price</label>
                      <input
                        className="v2-input v2-input-sm v2-mono"
                        type="number"
                        min={0}
                        value={floorPrice}
                        onChange={(e) => setFloorPrice(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="Absolute Minimum"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 3: INVENTORY SETUP
             ───────────────────────────────────────────────────────────────── */}
          {currentStep === 3 && (
            <div className="v2-space-y-4">
              {/* Mandatory Policy Callout */}
              <div
                className="v2-p-3 v2-flex v2-items-start v2-gap-2"
                style={{
                  background: "var(--info-muted)",
                  border: "1px solid var(--info)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text)",
                }}
              >
                <Info size={16} className="v2-text-accent" style={{ flexShrink: 0, marginTop: 2 }} />
                <div className="v2-text-xs">
                  <div className="v2-font-bold v2-text-sm" style={{ color: "var(--accent)" }}>
                    Inventory Accounting Invariant
                  </div>
                  <div>
                    <strong>Register the product here. Opening stock is posted as an inventory movement.</strong>
                  </div>
                  <div className="v2-text-muted v2-mt-1">
                    Initial stock is never treated as an arbitrary catalog attribute; it is posted to the
                    immutable StockLedger and synced to PostgreSQL via audited idempotency keys.
                  </div>
                </div>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    TRACKING TYPE
                  </label>
                  <select
                    className="v2-input"
                    value={trackingType}
                    onChange={(e) => setTrackingType(e.target.value as TrackingType)}
                  >
                    <option value="TRACKED">Track Inventory (Standard FIFO/Count)</option>
                    <option value="BATCH_EXPIRY">Batch & Expiry Tracking (FEFO)</option>
                    <option value="SERIALIZED">Serialized / IMEI Tracking</option>
                    <option value="NON_TRACKED">Non-Tracked / Consumable</option>
                  </select>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    REORDER ALERT LEVEL
                  </label>
                  <input
                    className="v2-input v2-mono"
                    type="number"
                    min={0}
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 10"
                    required
                  />
                  <span className="v2-text-xs v2-text-muted">Threshold for Low Stock dashboard alerts</span>
                </div>
              </div>

              <div className="v2-grid v2-grid-2 v2-gap-3">
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    PROPOSED INITIAL OPENING STOCK (UNITS)
                    {hasVariants && <span className="badge v2-badge-success v2-ml-2">Sum of Variants</span>}
                  </label>
                  <input
                    className="v2-input v2-mono"
                    type="number"
                    min={0}
                    disabled={hasVariants}
                    value={hasVariants ? totalVariantStock : openingStock}
                    onChange={(e) => setOpeningStock(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="e.g. 50"
                  />
                  <span className="v2-text-xs v2-text-muted">
                    {hasVariants
                      ? "Derived from Step 4 variant matrix quantities."
                      : "Generates 1 OPENING_STOCK movement in the StockLedger."}
                  </span>
                </div>

                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    BATCH / LOT NUMBER
                    {trackingType === "BATCH_EXPIRY" && <span style={{ color: "var(--danger)" }}> *</span>}
                  </label>
                  <input
                    className="v2-input"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="e.g. LOT-2026-09A"
                  />
                </div>
              </div>

              {trackingType === "BATCH_EXPIRY" && (
                <div>
                  <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                    EXPIRY DATE (FEFO DISPATCH PRIORITY)
                  </label>
                  <input
                    className="v2-input"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 4: VARIANT STUDIO
             ───────────────────────────────────────────────────────────────── */}
          {currentStep === 4 && (
            <div className="v2-space-y-4">
              {/* Variant Workspace Toggle */}
              <div
                className="v2-p-3"
                style={{
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--surface-border)",
                }}
              >
                <label className="v2-flex v2-items-center v2-justify-between" style={{ cursor: "pointer", userSelect: "none" }}>
                  <div className="v2-flex v2-items-center v2-gap-2">
                    <input
                      type="checkbox"
                      checked={hasVariants}
                      onChange={(e) => {
                        const active = e.target.checked;
                        setHasVariants(active);
                        if (active && variants.length === 0) {
                          generateVariantMatrix();
                        }
                      }}
                    />
                    <span className="v2-font-bold v2-text-sm">
                      This product has multiple variants (e.g. Size, Color, Pack, Flavour)
                    </span>
                  </div>
                  <span className="badge v2-badge-primary">Variant Studio</span>
                </label>
              </div>

              {!hasVariants ? (
                <div
                  className="v2-p-6 v2-text-center"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px dashed var(--surface-border)",
                  }}
                >
                  <Package size={32} className="v2-text-muted" style={{ margin: "0 auto 0.75rem" }} />
                  <div className="v2-font-bold v2-text-sm">Single Standard Catalog Item</div>
                  <p className="v2-text-xs v2-text-muted" style={{ maxWidth: 460, margin: "0.25rem auto 1rem" }}>
                    Variants are disabled. A standard default variant (SKU: <code>{sku || "SKU"}-STD</code>)
                    will be registered with the commercial pricing and opening stock from Steps 2 & 3.
                  </p>
                  <button
                    type="button"
                    className="v2-btn v2-btn-secondary v2-btn-sm"
                    onClick={() => {
                      setHasVariants(true);
                      if (variants.length === 0) generateVariantMatrix();
                    }}
                  >
                    <Sparkles size={13} /> Enable Variants & Generate Matrix
                  </button>
                </div>
              ) : (
                <div className="v2-space-y-3">
                  {/* Option Generators */}
                  <div className="v2-grid v2-grid-2 v2-gap-2">
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                        OPTION 1 (e.g. Size, Weight, Pack)
                      </label>
                      <input
                        className="v2-input v2-input-sm"
                        value={opt1Name}
                        onChange={(e) => setOpt1Name(e.target.value)}
                        placeholder="e.g. Size"
                      />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                        VALUES (Comma separated)
                      </label>
                      <input
                        className="v2-input v2-input-sm"
                        value={opt1Values}
                        onChange={(e) => setOpt1Values(e.target.value)}
                        placeholder="Small, Medium, Large"
                      />
                    </div>
                  </div>

                  <div className="v2-grid v2-grid-2 v2-gap-2">
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                        OPTION 2 (Optional, e.g. Color, Flavour)
                      </label>
                      <input
                        className="v2-input v2-input-sm"
                        value={opt2Name}
                        onChange={(e) => setOpt2Name(e.target.value)}
                        placeholder="e.g. Color"
                      />
                    </div>
                    <div>
                      <label className="v2-text-xs v2-font-bold v2-text-muted v2-block v2-mb-1">
                        VALUES (Comma separated)
                      </label>
                      <input
                        className="v2-input v2-input-sm"
                        value={opt2Values}
                        onChange={(e) => setOpt2Values(e.target.value)}
                        placeholder="Red, Blue, Green (or blank)"
                      />
                    </div>
                  </div>

                  <div className="v2-flex v2-items-center v2-justify-between v2-pt-1">
                    <div className="v2-flex v2-gap-2">
                      <button
                        type="button"
                        className="v2-btn v2-btn-secondary v2-btn-xs"
                        onClick={generateVariantMatrix}
                      >
                        <Zap size={12} /> Regenerate Matrix Combinations
                      </button>
                      <button
                        type="button"
                        className="v2-btn v2-btn-ghost v2-btn-xs"
                        onClick={() => {
                          const newId = `var-custom-${Date.now()}`;
                          setVariants((prev) => [
                            ...prev,
                            {
                              id: newId,
                              name: `${name.trim() || "Product"} - Custom`,
                              sku: `${sku || "SKU"}-CUST-${prev.length + 1}`,
                              barcode: "",
                              attributes: { Custom: "True" },
                              buyingPrice: typeof buyingPrice === "number" ? buyingPrice : 0,
                              sellingPrice: typeof sellingPrice === "number" ? sellingPrice : 0,
                              priceOverridden: false,
                              openingStock: 0,
                              reorderLevel: 5,
                            },
                          ]);
                        }}
                      >
                        <Plus size={12} /> Add Row
                      </button>
                    </div>
                    <span className="v2-text-xs v2-text-muted">
                      <strong>{variants.length}</strong> variant{variants.length === 1 ? "" : "s"} &bull; Total Opening:{" "}
                      <strong style={{ color: "var(--success)" }}>{totalVariantStock}</strong> units
                    </span>
                  </div>

                  {/* Matrix Grid */}
                  <div
                    style={{
                      maxHeight: "260px",
                      overflowY: "auto",
                      border: "1px solid var(--surface-border)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <table className="v2-table v2-table-sm" style={{ margin: 0, fontSize: "11px" }}>
                      <thead>
                        <tr>
                          <th>Variant Name</th>
                          <th>SKU Code</th>
                          <th>Barcode</th>
                          <th style={{ width: "105px" }}>Cost (Tsh)</th>
                          <th style={{ width: "115px" }}>Retail (Tsh)</th>
                          <th style={{ width: "95px" }}>Opening Stock</th>
                          <th style={{ width: "36px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {variants.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="v2-text-center v2-text-muted v2-py-4">
                              No combinations generated yet. Click 'Regenerate Matrix Combinations' above.
                            </td>
                          </tr>
                        ) : (
                          variants.map((v, vIdx) => {
                            const isOverridden =
                              v.buyingPrice !== Number(buyingPrice) || v.sellingPrice !== Number(sellingPrice);

                            return (
                              <tr key={v.id}>
                                <td>
                                  <input
                                    className="v2-input v2-input-xs"
                                    value={v.name}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setVariants((prev) =>
                                        prev.map((item, idx) => (idx === vIdx ? { ...item, name: val } : item))
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <input
                                    className="v2-input v2-input-xs v2-mono"
                                    value={v.sku}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setVariants((prev) =>
                                        prev.map((item, idx) => (idx === vIdx ? { ...item, sku: val } : item))
                                      );
                                    }}
                                    style={{ width: "130px" }}
                                  />
                                </td>
                                <td>
                                  <input
                                    className="v2-input v2-input-xs v2-mono"
                                    value={v.barcode}
                                    placeholder="Barcode"
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setVariants((prev) =>
                                        prev.map((item, idx) => (idx === vIdx ? { ...item, barcode: val } : item))
                                      );
                                    }}
                                    style={{ width: "110px" }}
                                  />
                                </td>
                                <td>
                                  <NumberStepper
                                    size="xs"
                                    min={0}
                                    step={1}
                                    width="96px"
                                    value={v.buyingPrice}
                                    ariaLabel="Buying cost price"
                                    onChange={(val) => {
                                      setVariants((prev) =>
                                        prev.map((item, idx) =>
                                          idx === vIdx
                                            ? { ...item, buyingPrice: val, priceOverridden: true }
                                            : item
                                        )
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <div className="v2-flex v2-items-center v2-gap-1">
                                    <NumberStepper
                                      size="xs"
                                      min={0}
                                      step={1}
                                      width="96px"
                                      value={v.sellingPrice}
                                      ariaLabel="Selling retail price"
                                      onChange={(val) => {
                                        setVariants((prev) =>
                                          prev.map((item, idx) =>
                                            idx === vIdx
                                              ? { ...item, sellingPrice: val, priceOverridden: true }
                                              : item
                                          )
                                        );
                                      }}
                                    />
                                    {isOverridden && (
                                      <span
                                        className="badge v2-badge-warning"
                                        title="Price overridden from base product"
                                        style={{ fontSize: "9px", padding: "1px 4px" }}
                                      >
                                        Override
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <NumberStepper
                                    size="xs"
                                    min={0}
                                    step={1}
                                    width="86px"
                                    value={v.openingStock}
                                    ariaLabel="Opening stock"
                                    onChange={(val) => {
                                      setVariants((prev) =>
                                        prev.map((item, idx) => (idx === vIdx ? { ...item, openingStock: val } : item))
                                      );
                                    }}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="v2-btn v2-btn-ghost v2-btn-icon-xs"
                                    style={{ color: "var(--danger)" }}
                                    title="Delete combination"
                                    onClick={() => setVariants((prev) => prev.filter((_, idx) => idx !== vIdx))}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────────
              STEP 5: REVIEW & REGISTER
             ───────────────────────────────────────────────────────────────── */}
          {currentStep === 5 && (
            <div className="v2-space-y-3">
              {/* Comprehensive Summary Grid */}
              <div className="v2-grid v2-grid-2 v2-gap-3">
                {/* Product Identity Card */}
                <div
                  className="v2-p-3"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                    <span className="v2-text-xs v2-font-bold v2-text-muted">1. IDENTITY</span>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={() => setCurrentStep(1)}
                      style={{ fontSize: "10px", padding: "0 4px" }}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="v2-text-sm v2-font-black">{name || "Untitled Product"}</div>
                  <div className="v2-text-xs v2-text-muted v2-mt-1">
                    SKU: <strong className="v2-mono">{sku || "Not Generated"}</strong>
                  </div>
                  <div className="v2-flex v2-gap-2 v2-mt-2">
                    <span className="badge v2-badge-primary">{category || allCategories[0]?.name || "General"}</span>
                    <span className="badge v2-badge-muted">{brand || allBrands[0]?.name || "General"}</span>
                    <span className="badge v2-badge-muted">{productType}</span>
                  </div>
                </div>

                {/* Commercial Card */}
                <div
                  className="v2-p-3"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                    <span className="v2-text-xs v2-font-bold v2-text-muted">2. COMMERCIAL</span>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={() => setCurrentStep(2)}
                      style={{ fontSize: "10px", padding: "0 4px" }}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs">
                    <span className="v2-text-muted">Cost Price:</span>
                    <strong className="v2-mono">{money(numBuying)}</strong>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mt-1">
                    <span className="v2-text-muted">Retail Price:</span>
                    <strong className="v2-mono" style={{ color: "var(--accent)" }}>
                      {money(numSelling)}
                    </strong>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mt-1">
                    <span className="v2-text-muted">Unit Margin:</span>
                    <strong
                      className="v2-mono"
                      style={{ color: marginAmount < 0 ? "var(--danger)" : "var(--success)" }}
                    >
                      {money(marginAmount)} ({marginPercent.toFixed(1)}%)
                    </strong>
                  </div>
                </div>

                {/* Inventory Policies Card */}
                <div
                  className="v2-p-3"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                    <span className="v2-text-xs v2-font-bold v2-text-muted">3. INVENTORY</span>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={() => setCurrentStep(3)}
                      style={{ fontSize: "10px", padding: "0 4px" }}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs">
                    <span className="v2-text-muted">Tracking Model:</span>
                    <strong>{trackingType}</strong>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mt-1">
                    <span className="v2-text-muted">Reorder Threshold:</span>
                    <strong className="v2-mono">{reorderLevel || 0} units</strong>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs v2-mt-1">
                    <span className="v2-text-muted">Opening Movements:</span>
                    <strong className="v2-mono" style={{ color: "var(--success)" }}>
                      {hasVariants ? totalVariantStock : Number(openingStock) || 0} units
                    </strong>
                  </div>
                </div>

                {/* Variant Architecture Card */}
                <div
                  className="v2-p-3"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--surface-border)",
                  }}
                >
                  <div className="v2-flex v2-items-center v2-justify-between v2-mb-2">
                    <span className="v2-text-xs v2-font-bold v2-text-muted">4. VARIANTS</span>
                    <button
                      type="button"
                      className="v2-btn v2-btn-ghost v2-btn-xs"
                      onClick={() => setCurrentStep(4)}
                      style={{ fontSize: "10px", padding: "0 4px" }}
                    >
                      Edit
                    </button>
                  </div>
                  <div className="v2-flex v2-justify-between v2-text-xs">
                    <span className="v2-text-muted">Variant Matrix:</span>
                    <strong>{hasVariants ? `${variants.length} Combinations` : "Standard (Single)"}</strong>
                  </div>
                  <div className="v2-text-xs v2-text-muted v2-mt-1">
                    {hasVariants
                      ? `Options: ${opt1Name || "Option 1"}${opt2Name ? ` & ${opt2Name}` : ""}`
                      : "Default variant automatically generated."}
                  </div>
                </div>
              </div>

              {/* Validation Checklist / Barrier */}
              {stepErrors[5].length > 0 ? (
                <div
                  className="v2-p-3"
                  style={{
                    background: "var(--danger-muted)",
                    border: "1px solid var(--danger)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--danger)",
                    fontSize: "12px",
                  }}
                >
                  <div className="v2-font-bold v2-flex v2-items-center v2-gap-1 v2-mb-1">
                    <AlertTriangle size={14} /> Registration Requirements Unfulfilled:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                    {stepErrors[5].map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  className="v2-p-3 v2-flex v2-items-center v2-gap-2"
                  style={{
                    background: "var(--success-muted)",
                    border: "1px solid var(--success)",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--success)",
                    fontSize: "12px",
                  }}
                >
                  <CheckCircle2 size={16} />
                  <span>All 5 validation gates certified. Ready to persist locally and enqueue for sync.</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Wizard Footer Navigation ──────────────────────────────────────── */}
        <div
          className="v2-p-3 v2-flex v2-items-center v2-justify-between"
          style={{
            borderTop: "1px solid var(--surface-border)",
            background: "var(--surface-2)",
          }}
        >
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-sm"
                onClick={handleBack}
                disabled={isSubmitting}
              >
                <ChevronLeft size={14} /> Back
              </button>
            )}
          </div>

          <div className="v2-flex v2-gap-2">
            <button
              type="button"
              className="v2-btn v2-btn-ghost v2-btn-sm"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            {currentStep < 5 ? (
              <button
                type="button"
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={handleNext}
                disabled={!isCurrentStepValid}
              >
                Continue <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="v2-btn v2-btn-primary v2-btn-sm"
                onClick={handleRegisterProduct}
                disabled={!isAllValid || isSubmitting}
                style={{ minWidth: 160 }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={14} className="v2-spin" /> Registering...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Register Product
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Discard Confirmation Modal ────────────────────────────────────── */}
      {showDiscardConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "grid",
            placeItems: "center",
            zIndex: 1100,
          }}
        >
          <div
            className="v2-card"
            style={{
              width: 380,
              padding: "1.25rem",
              background: "var(--surface)",
              border: "1px solid var(--surface-border)",
            }}
          >
            <div className="v2-flex v2-items-center v2-gap-2 v2-mb-2" style={{ color: "var(--warning)" }}>
              <AlertTriangle size={18} />
              <h3 className="v2-text-sm v2-font-black" style={{ margin: 0 }}>
                Discard Product Registration?
              </h3>
            </div>
            <p className="v2-text-xs v2-text-muted v2-mb-4">
              You have uncommitted product details in this wizard. Discarding will clear all entered information.
            </p>
            <div className="v2-flex v2-justify-end v2-gap-2">
              <button
                type="button"
                className="v2-btn v2-btn-ghost v2-btn-xs"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-secondary v2-btn-xs"
                style={{ color: "var(--danger)" }}
                onClick={confirmDiscard}
              >
                Discard Draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
