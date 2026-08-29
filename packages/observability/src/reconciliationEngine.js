"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalReconciliationEngine = exports.ContinuousReconciliationEngine = void 0;
const domain_1 = require("@kwakopos2/domain");
const incidentEngine_js_1 = require("./incidentEngine.js");
class ContinuousReconciliationEngine {
    async reconcileTenantBranch(tenantId, branchId, variants, ledgers, adjustments, reportedStockMap) {
        const discrepancies = [];
        const negativeStockVariants = [];
        const orphanAdjustments = [];
        const ledgerByVariant = new Map();
        for (const l of ledgers) {
            if (l.tenantId === tenantId && l.branchId === branchId) {
                const list = ledgerByVariant.get(l.variantId) || [];
                list.push(l);
                ledgerByVariant.set(l.variantId, list);
            }
        }
        for (const v of variants) {
            if (v.tenantId === tenantId && v.branchId === branchId) {
                const variantLedgers = ledgerByVariant.get(v.id) || [];
                const calculated = (0, domain_1.calculateAvailableStock)(variantLedgers);
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
        const ledgerKeys = new Set(ledgers.filter((l) => l.tenantId === tenantId && l.branchId === branchId).map((l) => l.idempotencyKey));
        for (const a of adjustments) {
            if (a.tenantId === tenantId && a.branchId === branchId) {
                if (!ledgerKeys.has(a.idempotencyKey)) {
                    orphanAdjustments.push(a.id);
                }
            }
        }
        const hasAnomalies = discrepancies.length > 0 || negativeStockVariants.length > 0 || orphanAdjustments.length > 0;
        const result = {
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
            await incidentEngine_js_1.globalIncidentEngine.createIncident({
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
exports.ContinuousReconciliationEngine = ContinuousReconciliationEngine;
exports.globalReconciliationEngine = new ContinuousReconciliationEngine();
//# sourceMappingURL=reconciliationEngine.js.map