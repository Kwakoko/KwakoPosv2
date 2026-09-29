/**
 * Payload Validation & Normalization Service for Offline Queue Convergence
 *
 * Guarantees that complex payloads (such as Parent-Variant Stock Conversion/Reconciliation,
 * Stock Adjustments, Products, ProductVariants, and POS Sales) are formatted and validated
 * to match exact backend schemas (contracts & worldStandardPrismaSyncEngine) before they are
 * dispatched to `/sync/push` or direct commercial endpoints.
 */

import type { PaymentMethod, PaymentProvider } from "@kwakopos2/contracts";

export interface NormalizedConversionPayload {
  id?: string;
  tenantId?: string;
  branchId?: string;
  parentVariantId: string;
  childVariantId: string;
  parentUnitsDeducted: number;
  childUnitsProduced: number;
  conversionRatio: number;
  conversionFactor?: number;
  reason?: string;
  saleId?: string;
  idempotencyKey?: string;
  createdAt?: string;
}

export interface NormalizedStockAdjustmentPayload {
  variantId: string;
  productId?: string;
  sku?: string;
  adjustmentType: "INCREASE" | "DECREASE" | "SET";
  movementType?: string;
  quantityChange: number;
  reason: string;
  referenceNote?: string | null;
  unitCost?: number;
  deviceId?: string;
  operationId?: string;
  idempotencyKey?: string;
}

/**
 * Normalizes payment methods and providers into the authoritative contract enums.
 * Prevents invalid enum rejections (e.g. "M-PESA" -> "MOBILE_MONEY" with provider "MPESA").
 */
export function normalizePaymentMethod(rawMethod?: string): {
  paymentMethod: PaymentMethod;
  provider?: PaymentProvider;
} {
  const method = String(rawMethod || "").trim().toUpperCase();

  if (
    method.includes("MPESA") ||
    method.includes("M-PESA") ||
    method.includes("VODACOM") ||
    method.includes("HALOPESA") ||
    method.includes("AIRTEL") ||
    method.includes("TIGO") ||
    method.includes("MOBILE")
  ) {
    let provider: PaymentProvider = "MPESA";
    if (method.includes("AIRTEL")) provider = "AIRTEL_MONEY";
    else if (method.includes("TIGO")) provider = "TIGO_PESA";
    else if (method.includes("HALOPESA")) provider = "HALOPESA";
    return { paymentMethod: "MOBILE_MONEY", provider };
  }

  if (method === "CARD" || method.includes("VISA") || method.includes("MASTER")) {
    return { paymentMethod: "CARD" };
  }

  if (method === "BANK" || method.includes("CRDB") || method.includes("NMB")) {
    let provider: PaymentProvider = "OTHER";
    if (method.includes("CRDB")) provider = "CRDB";
    else if (method.includes("NMB")) provider = "NMB";
    return { paymentMethod: "BANK", provider };
  }

  if (method === "CREDIT") {
    return { paymentMethod: "CREDIT" };
  }

  if (method === "CASH" || method === "SPLIT") {
    return { paymentMethod: "CASH", provider: "CASH" };
  }

  return { paymentMethod: "CASH", provider: "CASH" };
}

/**
 * Normalizes Parent-Variant Unit Conversion / Stock Reconciliation payloads.
 */
export function normalizeUnitConversionPayload(
  raw: any,
  context?: {
    entityId?: string;
    operationId?: string;
    idempotencyKey?: string;
    tenantId?: string;
    branchId?: string;
  }
): NormalizedConversionPayload {
  const payload = raw || {};
  const parentVariantId = String(
    payload.parentVariantId || payload.parent_variant_id || payload.fromVariantId || payload.parentVariant?.id || ""
  ).trim();
  const childVariantId = String(
    payload.childVariantId || payload.child_variant_id || payload.toVariantId || payload.childVariant?.id || ""
  ).trim();

  const parentUnitsDeducted = Math.max(
    1,
    Number(payload.parentUnitsDeducted ?? payload.parentQuantity ?? payload.deductedUnits ?? payload.quantityDeducted ?? payload.quantity ?? 1)
  );

  const conversionRatio = Math.max(
    0.0001,
    Number(payload.conversionRatio ?? payload.conversionFactor ?? 1)
  );

  const childUnitsProduced = Math.max(
    1,
    Number(
      payload.childUnitsProduced ??
        payload.childQuantity ??
        payload.producedUnits ??
        payload.quantityProduced ??
        Math.round(parentUnitsDeducted * conversionRatio)
    )
  );

  const rawRatio = Number(payload.conversionRatio ?? payload.conversionFactor ?? (childUnitsProduced / parentUnitsDeducted));
  const effectiveRatio = Number((Number.isFinite(rawRatio) ? rawRatio : 1).toFixed(4));

  const tenantId = String(payload.tenantId || context?.tenantId || "tenant-default");
  const branchId = String(payload.branchId || context?.branchId || "branch-default");

  return {
    id: context?.entityId || payload.id || context?.operationId || `conv-${Date.now()}`,
    tenantId,
    branchId,
    parentVariantId,
    childVariantId,
    parentUnitsDeducted,
    childUnitsProduced,
    conversionRatio: effectiveRatio,
    conversionFactor: effectiveRatio,
    reason: String(payload.reason || "PARENT_VARIANT_CONVERSION"),
    saleId: payload.saleId ? String(payload.saleId) : undefined,
    idempotencyKey: String(payload.idempotencyKey || context?.idempotencyKey || context?.operationId || `idem-conv-${Date.now()}`),
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

/**
 * Normalizes Stock Adjustment / Reconciliation payloads.
 */
export function normalizeStockAdjustmentPayload(
  raw: any,
  context?: { entityId?: string; operationId?: string; idempotencyKey?: string; deviceId?: string }
): NormalizedStockAdjustmentPayload {
  const payload = raw || {};
  const variantId = String(payload.variantId || payload.variant_id || payload.variant?.id || "").trim();
  const productId = payload.productId || payload.product_id || payload.product?.id ? String(payload.productId || payload.product_id || payload.product?.id) : undefined;
  const sku = String(payload.sku || payload.variantSku || payload.variant?.sku || "").trim();

  let adjustmentType: "INCREASE" | "DECREASE" | "SET" = "INCREASE";
  const rawType = String(payload.adjustmentType || payload.type || payload.movementType || "").toUpperCase();
  if (rawType.includes("DEC") || rawType.includes("SUB") || rawType.includes("LOSS") || rawType.includes("SHRINK") || rawType.includes("OUT")) {
    adjustmentType = "DECREASE";
  } else if (rawType.includes("SET") || rawType.includes("RECON") || rawType.includes("COUNT") || rawType.includes("ABS")) {
    adjustmentType = "SET";
  } else {
    adjustmentType = "INCREASE";
  }

  const rawQty = Number(payload.quantityChange ?? payload.quantity ?? payload.changeQty ?? payload.vStock ?? 0);
  const quantityChange = adjustmentType === "SET" ? rawQty : Math.abs(rawQty);

  return {
    variantId,
    productId,
    sku,
    adjustmentType,
    movementType: payload.movementType ? String(payload.movementType) : "ADJUSTMENT",
    quantityChange,
    reason: String(payload.reason || "LOCAL_INVENTORY_RECONCILIATION"),
    referenceNote: payload.referenceNote ? String(payload.referenceNote) : null,
    unitCost: Number(payload.unitCost ?? payload.costPrice ?? 0),
    deviceId: String(payload.deviceId || context?.deviceId || "web-client"),
    operationId: String(payload.operationId || context?.operationId || ""),
    idempotencyKey: String(payload.idempotencyKey || context?.idempotencyKey || context?.operationId || ""),
  };
}

/**
 * Normalizes standalone Product payloads and their nested variants.
 */
export function normalizeProductPayload(
  raw: any,
  context?: { entityId?: string }
): Record<string, unknown> {
  const payload = raw || {};
  const prodId = String(context?.entityId || payload.id || "").trim();
  const buyingPrice = Number(payload.buyingPrice ?? payload.costPrice ?? 0);
  const sellingPrice = Number(payload.sellingPrice ?? payload.price ?? 0);

  const rawVariants = Array.isArray(payload.variants) ? payload.variants : [];
  const normalizedVariants = rawVariants.map((v: any, index: number) => {
    const vId = String(v.id || (index === 0 ? `${prodId}-default` : `${prodId}-var-${index}`));
    return {
      id: vId,
      productId: prodId,
      name: String(v.name || "Standard"),
      sku: String(v.sku || `${payload.sku || prodId}-STD`),
      barcode: v.barcode ? String(v.barcode) : null,
      price: Number(v.price ?? v.sellingPrice ?? sellingPrice),
      costPrice: Number(v.costPrice ?? v.buyingPrice ?? buyingPrice),
      inventoryQuantity: Number(v.inventoryQuantity ?? v.stock ?? 0),
      stock: Number(v.stock ?? v.inventoryQuantity ?? 0),
      reorderLevel: Number(v.reorderLevel ?? 5),
      attributes: typeof v.attributes === "object" && v.attributes !== null ? v.attributes : {},
      isActive: v.isActive !== false,
    };
  });

  return {
    ...payload,
    id: prodId,
    name: String(payload.name || "Unnamed Product"),
    sku: String(payload.sku || `SKU-${prodId.slice(0, 6).toUpperCase()}`),
    category: String(payload.category || "General"),
    categoryId: payload.categoryId ? String(payload.categoryId) : null,
    brand: payload.brand ? String(payload.brand) : null,
    brandId: payload.brandId ?? payload.brand_id ? String(payload.brandId ?? payload.brand_id) : null,
    supplierId: payload.supplierId ? String(payload.supplierId) : null,
    taxId: payload.taxId ? String(payload.taxId) : null,
    buyingPrice,
    sellingPrice,
    hasVariants: normalizedVariants.length > 1,
    variants: normalizedVariants,
    isActive: payload.isActive !== false,
  };
}

/**
 * Normalizes standalone ProductVariant payloads.
 */
export function normalizeProductVariantPayload(
  raw: any,
  context?: { entityId?: string }
): Record<string, unknown> {
  const payload = raw || {};
  const id = String(context?.entityId || payload.id || "").trim();
  const productId = String(payload.productId || payload.product_id || payload.prodId || "").trim();
  const price = Number(payload.price ?? payload.sellingPrice ?? 0);
  const costPrice = Number(payload.costPrice ?? payload.buyingPrice ?? 0);
  const inventoryQuantity = Number(payload.inventoryQuantity ?? payload.stock ?? 0);

  return {
    ...payload,
    id,
    productId,
    name: String(payload.name || "Standard"),
    sku: String(payload.sku || "SKU-STD"),
    barcode: payload.barcode ? String(payload.barcode) : null,
    price,
    costPrice,
    inventoryQuantity,
    stock: inventoryQuantity,
    reservedQuantity: Number(payload.reservedQuantity ?? 0),
    reorderLevel: Number(payload.reorderLevel ?? 5),
    attributes: typeof payload.attributes === "object" && payload.attributes !== null ? payload.attributes : {},
    isActive: payload.isActive !== false,
  };
}

/**
 * Normalizes Sale payloads for both direct /api/v1/pos/sales and sync /sync/push.
 */
export function normalizeSalePayload(
  raw: any,
  context?: { entityId?: string; operationId?: string; idempotencyKey?: string; deviceId?: string }
): Record<string, unknown> {
  const payload = raw || {};
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.cart)
    ? payload.cart
    : [];

  const items = rawItems.map((it: any) => ({
    productId: String(it.productId || it.product?.id || it.id || "prod_unknown"),
    variantId: String(it.variantId || `${it.productId || it.product?.id || it.id || "prod"}-default`),
    quantity: Number(it.quantity || it.qty || 1),
    unitPrice: Number(it.unitPrice ?? it.price ?? it.product?.price ?? 0),
    unitCost: Number(it.unitCost ?? it.costPrice ?? (it.product as any)?.costPrice ?? (it.product as any)?.buyingPrice ?? 0),
    discountAmount: Number(it.discountAmount || 0),
    taxAmount: Number(it.taxAmount || 0),
  }));

  const grandTotal = Number(payload.grandTotal || payload.totalAmount || payload.total || 0);

  const rawPayments = Array.isArray(payload.payments) && payload.payments.length > 0
    ? payload.payments
    : [{ amount: grandTotal, paymentMethod: payload.paymentMethod || "CASH" }];

  const payments = rawPayments.map((p: any) => {
    const { paymentMethod, provider } = normalizePaymentMethod(p.paymentMethod);
    return {
      amount: Number(p.amount ?? grandTotal),
      paymentMethod,
      provider: p.provider || provider,
      providerReference: p.providerReference || p.reference || p.providerRef || p.mpesaRef || undefined,
    };
  });

  return {
    ...payload,
    id: String(context?.entityId || payload.id || ""),
    deviceId: String(context?.deviceId || payload.deviceId || "pos-terminal"),
    operationId: String(context?.operationId || payload.operationId || payload.id || ""),
    idempotencyKey: String(context?.idempotencyKey || payload.idempotencyKey || payload.id || ""),
    items,
    payments,
    subtotal: Number(payload.subtotal || 0),
    discountTotal: Number(payload.discountTotal || payload.discount || 0),
    taxTotal: Number(payload.taxTotal || payload.tax || payload.taxAmount || 0),
    grandTotal,
    totalAmount: grandTotal,
  };
}

/**
 * Universal payload normalizer: ensures any offline mutation payload conforms to the backend schema.
 */
export function normalizeSyncPayload(
  entityType: string,
  operationType: string,
  rawPayload: any,
  context?: { deviceId?: string; operationId?: string; idempotencyKey?: string; entityId?: string }
): Record<string, unknown> {
  if (!rawPayload || typeof rawPayload !== "object") {
    return {};
  }

  switch (entityType) {
    case "UnitConversionTransaction":
      return normalizeUnitConversionPayload(rawPayload, context) as unknown as Record<string, unknown>;

    case "StockAdjustment":
      return normalizeStockAdjustmentPayload(rawPayload, context) as unknown as Record<string, unknown>;

    case "Product":
      if (operationType === "CREATE") {
        return normalizeProductPayload(rawPayload, context);
      }
      return rawPayload;

    case "ProductVariant":
      if (operationType === "CREATE" || operationType === "UPDATE") {
        return normalizeProductVariantPayload(rawPayload, context);
      }
      return rawPayload;

    case "Sale":
      if (operationType === "CREATE") {
        return normalizeSalePayload(rawPayload, context);
      }
      return rawPayload;

    default:
      return rawPayload;
  }
}
