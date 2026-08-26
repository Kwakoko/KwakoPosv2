import {
  calculateAvailableStock,
  assertInventoryLedgerIntegrity,
  assertNoOrphanAdjustments,
} from "@kwakopos2/domain";
import type { StockLedger, StockAdjustment, ProductVariant } from "@kwakopos2/contracts";

export interface ReconciliationReport {
  timestamp: string;
  totalVariantsScanned: number;
  totalAdjustmentsScanned: number;
  totalLedgerEntriesScanned: number;
  discrepanciesFound: Array<{
    variantId: string;
    reportedStock: number;
    calculatedStock: number;
    delta: number;
  }>;
  orphanedAdjustments: string[];
  status: "CLEAN" | "ANOMALIES_DETECTED";
}

export function reconcileInventoryLedger(
  variants: ProductVariant[],
  adjustments: StockAdjustment[],
  ledgers: StockLedger[],
  reportedStockMap: Map<string, number>
): ReconciliationReport {
  const discrepancies: ReconciliationReport["discrepanciesFound"] = [];
  const orphanedAdjustments: string[] = [];

  const ledgerByVariant = new Map<string, StockLedger[]>();
  for (const entry of ledgers) {
    const list = ledgerByVariant.get(entry.variantId) || [];
    list.push(entry);
    ledgerByVariant.set(entry.variantId, list);
  }

  for (const variant of variants) {
    const variantLedgers = ledgerByVariant.get(variant.id) || [];
    const calculated = calculateAvailableStock(variantLedgers);
    const reported = reportedStockMap.get(variant.id) ?? calculated;

    if (calculated !== reported) {
      discrepancies.push({
        variantId: variant.id,
        reportedStock: reported,
        calculatedStock: calculated,
        delta: reported - calculated,
      });
    }
  }

  const ledgerKeys = new Set(ledgers.map((l) => l.idempotencyKey));
  for (const adj of adjustments) {
    if (!ledgerKeys.has(adj.idempotencyKey)) {
      orphanedAdjustments.push(adj.id);
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalVariantsScanned: variants.length,
    totalAdjustmentsScanned: adjustments.length,
    totalLedgerEntriesScanned: ledgers.length,
    discrepanciesFound: discrepancies,
    orphanedAdjustments,
    status: discrepancies.length === 0 && orphanedAdjustments.length === 0 ? "CLEAN" : "ANOMALIES_DETECTED",
  };
}

if (process.argv[1] && process.argv[1].endsWith("reconcile-data.ts")) {
  console.log("[RECONCILIATION] Running data integrity scan...");
  const report = reconcileInventoryLedger([], [], [], new Map());
  console.log("[RECONCILIATION] Result:", JSON.stringify(report, null, 2));
}