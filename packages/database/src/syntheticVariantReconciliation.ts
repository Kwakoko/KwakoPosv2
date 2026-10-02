import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";
import { projectProductBranchStock, projectProductStockSummary, projectVariantInventory } from "./inventoryAuthority.js";

export interface SyntheticReconciliationReport {
  scanned: number;
  merged: number;
  details: Array<{
    syntheticVariantId: string;
    canonicalVariantId: string;
    productId: string;
    salesUpdated: number;
    ledgersUpdated: number;
  }>;
}

export async function reconcileSyntheticVariants(
  ctx: TenantContext,
  db: any = prisma,
): Promise<SyntheticReconciliationReport> {
  return db.$transaction(async (tx: any) => {
    const syntheticVariants = await tx.productVariant.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        OR: [
          { sku: { endsWith: "-STD" } },
          { id: { endsWith: "-default" } },
        ],
      },
    });

    const report: SyntheticReconciliationReport = {
      scanned: syntheticVariants.length,
      merged: 0,
      details: [],
    };

    for (const synVar of syntheticVariants) {
      const isSyn = Boolean((synVar.attributes as any)?.isSynthetic) || synVar.id.endsWith("-default");
      if (!isSyn) continue;

      // Look for a canonical variant for the same product that is not synthetic
      const canonical = await tx.productVariant.findFirst({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          productId: synVar.productId,
          id: { not: synVar.id },
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!canonical) continue;

      // Reassign sale lines
      const salesResult = await tx.saleLine.updateMany({
        where: { variantId: synVar.id },
        data: { variantId: canonical.id },
      });

      // Reassign stock ledger records
      const ledgersResult = await tx.stockLedger.updateMany({
        where: { variantId: synVar.id },
        data: { variantId: canonical.id },
      });

      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, canonical.id);
      await projectVariantInventory(tx, ctx.tenantId, ctx.branchId, synVar.id);
      await projectProductBranchStock(tx, ctx.tenantId, ctx.branchId, canonical.id, null);
      await tx.productVariant.update({ where: { id: synVar.id }, data: { isActive: false } });
      await projectProductStockSummary(tx, ctx.tenantId, ctx.branchId, synVar.productId);

      report.merged += 1;
      report.details.push({
        syntheticVariantId: synVar.id,
        canonicalVariantId: canonical.id,
        productId: synVar.productId,
        salesUpdated: salesResult.count,
        ledgersUpdated: ledgersResult.count,
      });
    }

    return report;
  });
}
