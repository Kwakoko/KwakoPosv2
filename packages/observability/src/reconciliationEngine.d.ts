import type { StockLedger, StockAdjustment, ProductVariant } from "@kwakopos2/contracts";
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
export declare class ContinuousReconciliationEngine {
    reconcileTenantBranch(tenantId: string, branchId: string, variants: ProductVariant[], ledgers: StockLedger[], adjustments: StockAdjustment[], reportedStockMap?: Map<string, number>): Promise<ReconciliationResult>;
}
export declare const globalReconciliationEngine: ContinuousReconciliationEngine;
//# sourceMappingURL=reconciliationEngine.d.ts.map