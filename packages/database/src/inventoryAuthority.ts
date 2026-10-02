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

export async function projectProductBranchStock(tx: any, tenantId: string, branchId: string, variantId: string, warehouseId: string | null = null): Promise<void> {
  const variant = await tx.productVariant.findFirst({
    where: { id: variantId, tenantId, branchId },
    select: { productId: true },
  });
  if (!variant) return;
  const ledgerRows = await tx.stockLedger.findMany({
    where: {
      tenantId,
      branchId,
      variantId,
      ...(warehouseId === null ? {} : { warehouseId }),
    },
    orderBy: { occurredAt: "asc" },
  });
  let quantity = 0;
  let value = 0;
  for (const row of ledgerRows) {
    const change = Number(row.quantityChange ?? 0);
    quantity += change;
    if (change > 0) value += change * Number(row.unitCost ?? 0);
  }
  quantity = Math.max(0, quantity);
  const averageCost = quantity > 0 ? value / quantity : 0;
  const stockValue = quantity * averageCost;
  const existing = await tx.productBranchStock.findFirst({
    where: { tenantId, branchId, productId: variant.productId, variantId, warehouseId },
  });
  if (existing) {
    await tx.productBranchStock.update({
      where: { id: existing.id },
      data: { currentQuantity: quantity, averageCost, stockValue },
    });
  } else {
    await tx.productBranchStock.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        warehouseId,
        productId: variant.productId,
        variantId,
        currentQuantity: quantity,
        averageCost,
        stockValue,
      },
    });
  }
}
