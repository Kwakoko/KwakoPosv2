import { randomUUID } from "node:crypto";

export const INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER =
  "INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER";

export function rejectAbsoluteInventoryMutation(payload: unknown): void {
  const value = payload as Record<string, unknown> | null | undefined;
  if (!value) return;
  if (value.inventoryQuantity !== undefined || value.stock !== undefined) {
    throw new Error(INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER);
  }
}

export function rejectNonZeroAbsoluteInventoryMutation(payload: unknown): void {
  const value = payload as Record<string, unknown> | null | undefined;
  if (!value) return;
  for (const key of ["inventoryQuantity", "stock"]) {
    if (value[key] !== undefined && Number(value[key]) !== 0) {
      throw new Error(INVENTORY_MUTATION_REQUIRES_STOCK_LEDGER);
    }
  }
}

export async function calculateAuthoritativeStock(tx: any, tenantId: string, branchId: string, variantId: string): Promise<number> {
  const result = await tx.stockLedger.aggregate({
    _sum: { quantityChange: true },
    where: { tenantId, branchId, variantId },
  });
  return Number(result._sum.quantityChange ?? 0);
}

/** Materialize the authoritative StockLedger aggregate without a recursive trigger. */
export async function projectProductVariantBalance(tx: any, tenantId: string, branchId: string, variantId: string): Promise<void> {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, tenantId, branchId },
    select: { productId: true },
  });
  if (!variant) throw new Error("STOCK_VARIANT_NOT_FOUND");

  const projectionId = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "product_variant_balances" (
      "id", "tenantId", "branchId", "productId", "variantId",
      "currentQuantity", "averageCost", "stockValue", "updatedAt"
    )
    SELECT
      $1,
      "tenantId", "branchId", "productId", "variantId",
      COALESCE(SUM("quantityChange"), 0)::numeric(15,4),
      COALESCE(
        SUM(CASE WHEN "quantityChange" > 0 THEN "quantityChange" * "unitCost" ELSE 0 END)
        / NULLIF(SUM(CASE WHEN "quantityChange" > 0 THEN "quantityChange" ELSE 0 END), 0),
        0
      )::numeric(15,2),
      (
        COALESCE(SUM("quantityChange"), 0) * COALESCE(
          SUM(CASE WHEN "quantityChange" > 0 THEN "quantityChange" * "unitCost" ELSE 0 END)
          / NULLIF(SUM(CASE WHEN "quantityChange" > 0 THEN "quantityChange" ELSE 0 END), 0),
          0
        )
      )::numeric(15,2),
      CURRENT_TIMESTAMP
    FROM "stock_ledgers"
    WHERE "tenantId" = $2
      AND "branchId" = $3
      AND "variantId" = $4
    GROUP BY "tenantId", "branchId", "productId", "variantId"
    ON CONFLICT ("tenantId", "branchId", "variantId") DO UPDATE SET
      "productId" = EXCLUDED."productId",
      "currentQuantity" = EXCLUDED."currentQuantity",
      "averageCost" = EXCLUDED."averageCost",
      "stockValue" = EXCLUDED."stockValue",
      "updatedAt" = CURRENT_TIMESTAMP`,
    projectionId, tenantId, branchId, variantId,
  );
}

export async function projectVariantInventory(tx: any, tenantId: string, branchId: string, variantId: string): Promise<number> {
  const quantity = await calculateAuthoritativeStock(tx, tenantId, branchId, variantId);
  await tx.productVariant.updateMany({
    where: { id: variantId, tenantId, branchId },
    // StockLedger remains the source of truth; projections must never expose a
    // negative operational balance even when the ledger records an oversell.
    data: { inventoryQuantity: Math.max(0, quantity) },
  });
  return quantity;
}

export async function projectProductStockSummary(tx: any, tenantId: string, branchId: string, productId: string): Promise<void> {
  const variants = await tx.productVariant.findMany({
    where: { tenantId, branchId, productId },
    select: { id: true, isActive: true, reservedQuantity: true, reorderLevel: true },
  });
  let totalStock = 0;
  let reservedStock = 0;
  let lowStockVariantsCount = 0;
  for (const variant of variants) {
    const ledgerQuantity = await calculateAuthoritativeStock(tx, tenantId, branchId, variant.id);
    const quantity = Math.max(0, ledgerQuantity);
    if (!variant.isActive) continue;
    totalStock += quantity;
    reservedStock += Number(variant.reservedQuantity ?? 0);
    if (quantity <= Number(variant.reorderLevel ?? 0)) lowStockVariantsCount += 1;
  }
  await tx.product.updateMany({
    where: { id: productId, tenantId, branchId },
    data: {
      totalStock,
      reservedStock,
      availableStock: Math.max(0, totalStock - reservedStock),
      lowStockVariantsCount,
    },
  });
}

function calculateMovingWeightedAverage(
  ledgerRows: Array<{ quantityChange: unknown; unitCost: unknown }>,
  fallbackCost: number,
): { quantity: number; averageCost: number; stockValue: number } {
  let quantity = 0;
  let averageCost = 0;

  for (const row of ledgerRows) {
    const change = Number(row.quantityChange ?? 0);
    if (!Number.isFinite(change) || change === 0) continue;

    if (change > 0) {
      const incomingCostRaw = Number(row.unitCost ?? 0);
      const incomingCost = Number.isFinite(incomingCostRaw) && incomingCostRaw > 0
        ? incomingCostRaw
        : (quantity > 0 ? averageCost : fallbackCost);

      if (quantity <= 0) {
        quantity = change;
        averageCost = Math.max(0, incomingCost);
      } else {
        const totalCost = (quantity * averageCost) + (change * Math.max(0, incomingCost));
        quantity += change;
        averageCost = totalCost / quantity;
      }
    } else {
      // Issues, sales, supplier returns, transfers out and losses consume stock
      // at the current carrying cost; they do not change the weighted-average
      // unit cost of the units that remain.
      quantity = Math.max(0, quantity + change);
      if (quantity === 0) averageCost = 0;
    }
  }

  quantity = Math.max(0, quantity);
  averageCost = quantity > 0 ? Math.max(0, averageCost) : 0;
  return {
    quantity,
    averageCost,
    stockValue: quantity * averageCost,
  };
}

async function upsertProductBranchStock(
  tx: any,
  tenantId: string,
  branchId: string,
  productId: string,
  variantId: string,
  warehouseId: string | null,
  ledgerRows: Array<{ quantityChange: unknown; unitCost: unknown }>,
  fallbackCost: number,
): Promise<void> {
  const valuation = calculateMovingWeightedAverage(ledgerRows, fallbackCost);
  const existing = await tx.productBranchStock.findFirst({
    where: { tenantId, branchId, productId, variantId, warehouseId },
  });

  if (existing) {
    await tx.productBranchStock.update({
      where: { id: existing.id },
      data: {
        currentQuantity: valuation.quantity,
        averageCost: valuation.averageCost,
        stockValue: valuation.stockValue,
      },
    });
    return;
  }

  await tx.productBranchStock.create({
    data: {
      id: randomUUID(),
      tenantId,
      branchId,
      warehouseId,
      productId,
      variantId,
      currentQuantity: valuation.quantity,
      averageCost: valuation.averageCost,
      stockValue: valuation.stockValue,
    },
  });
}

export async function projectProductBranchStock(
  tx: any,
  tenantId: string,
  branchId: string,
  variantId: string,
  warehouseId: string | null = null,
): Promise<void> {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, tenantId, branchId },
    select: { productId: true, costPrice: true },
  });
  if (!variant) return;

  const orderBy = [{ occurredAt: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }];

  // A warehouse-specific projection is useful for warehouse views, while the
  // null-warehouse row is the authoritative branch aggregate consumed by the
  // dashboard KPI. Always refresh the branch aggregate from all branch ledger
  // movements so the KPI cannot double-count warehouse rows.
  if (warehouseId !== null) {
    const warehouseRows = await tx.stockLedger.findMany({
      where: { tenantId, branchId, variantId, warehouseId },
      select: { quantityChange: true, unitCost: true },
      orderBy,
    });
    await upsertProductBranchStock(
      tx,
      tenantId,
      branchId,
      variant.productId,
      variantId,
      warehouseId,
      warehouseRows,
      Number(variant.costPrice ?? 0),
    );
  }

  const branchRows = await tx.stockLedger.findMany({
    where: { tenantId, branchId, variantId },
    select: { quantityChange: true, unitCost: true },
    orderBy,
  });
  await upsertProductBranchStock(
    tx,
    tenantId,
    branchId,
    variant.productId,
    variantId,
    null,
    branchRows,
    Number(variant.costPrice ?? 0),
  );
}
