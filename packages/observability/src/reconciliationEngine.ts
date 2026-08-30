import { calculateAvailableStock } from "@kwakopos2/domain";
import type { StockLedger, StockAdjustment, ProductVariant } from "@kwakopos2/contracts";
import { globalIncidentEngine } from "./incidentEngine.js";

export interface ReconciliationResult {
  tenantId: string;
  branchId: string;
  timestamp: string;
  totalVariantsScanned: number;
  totalLedgersScanned: number;
  totalAdjustmentsScanned: number;
  discrepancies: Array<{
    variantId: string;
    reportedStock: number;
    calculatedStock: number;
    delta: number;
  }>;
  negativeStockVariants: Array<{
    variantId: string;
    stock: number;
  }>;
  orphanAdjustments: string[];
  status: "CLEAN" | "ANOMALIES_DETECTED";
}

export class ContinuousReconciliationEngine {
  async reconcileTenantBranch(
    tenantId: string,
    branchId: string,
    variants: ProductVariant[],
    ledgers: StockLedger[],
    adjustments: StockAdjustment[],
    reportedStockMap?: Map<string, number>
  ): Promise<ReconciliationResult> {
    const discrepancies: ReconciliationResult["discrepancies"] = [];
    const negativeStockVariants: ReconciliationResult["negativeStockVariants"] = [];
    const orphanAdjustments: string[] = [];

    const ledgerByVariant = new Map<string, StockLedger[]>();
    for (const l of ledgers) {
      if (l.tenantId === tenantId && l.branchId === branchId) {
        const list = ledgerByVariant.get(l.variantId) || [];
        list.push(l);
        ledgerByVariant.set(l.variantId, list);
      }
    }

    for (const v of variants) {
      if (v.tenantId === tenantId && (!v.branchId || v.branchId === branchId)) {
        const variantLedgers = ledgerByVariant.get(v.id) || [];
        const calculated = calculateAvailableStock(variantLedgers);
        const reported = reportedStockMap?.get(v.id) ?? calculated;

        if (calculated !== reported) {
          discrepancies.push({
            variantId: v.id,
            reportedStock: reported,
            calculatedStock: calculated,
            delta: reported - calculated,
          });
        }

        if (calculated < 0) {
          negativeStockVariants.push({
            variantId: v.id,
            stock: calculated,
          });
        }
      }
    }

    const ledgerKeys = new Set(
      ledgers.filter((l) => l.tenantId === tenantId && l.branchId === branchId).map((l) => l.idempotencyKey)
    );
    for (const a of adjustments) {
      if (a.tenantId === tenantId && a.branchId === branchId) {
        if (!ledgerKeys.has(a.idempotencyKey)) {
          orphanAdjustments.push(a.id);
        }
      }
    }

    const hasAnomalies = discrepancies.length > 0 || negativeStockVariants.length > 0 || orphanAdjustments.length > 0;
    const result: ReconciliationResult = {
      tenantId,
      branchId,
      timestamp: new Date().toISOString(),
      totalVariantsScanned: variants.length,
      totalLedgersScanned: ledgers.length,
      totalAdjustmentsScanned: adjustments.length,
      discrepancies,
      negativeStockVariants,
      orphanAdjustments,
      status: hasAnomalies ? "ANOMALIES_DETECTED" : "CLEAN",
    };

    if (hasAnomalies) {
      await globalIncidentEngine.createIncident({
        title: `Inventory Ledger Discrepancy in Tenant ${tenantId}`,
        description: `Automated reconciler detected ${discrepancies.length} ledger balance mismatch(es), ${negativeStockVariants.length} negative stock anomaly(ies), and ${orphanAdjustments.length} orphan adjustment(s).`,
        severity: "CRITICAL",
        tenantId,
        branchId,
        service: "inventory-reconciliation-engine",
        affectedOperationIds: orphanAdjustments,
        metadata: {
          discrepancies,
          negativeStockVariants,
          orphanAdjustments,
        },
      });
    }

    return result;
  }
}

export const globalReconciliationEngine = new ContinuousReconciliationEngine();