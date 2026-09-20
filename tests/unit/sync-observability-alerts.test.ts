import { describe, it, expect, beforeEach } from "vitest";
import {
  SyncHealthMonitor,
  ContinuousReconciliationEngine,
  globalIncidentEngine,
} from "@kwakopos2/observability";
import type { ProductVariant, StockLedger, StockAdjustment } from "@kwakopos2/contracts";

describe("Pillar 6 — Monitoring & Observability: Dashboards & Alert Engine", () => {
  let syncMonitor: SyncHealthMonitor;
  let reconciler: ContinuousReconciliationEngine;

  beforeEach(() => {
    syncMonitor = new SyncHealthMonitor();
    reconciler = new ContinuousReconciliationEngine();
  });

  describe("Sync Operation Telemetry & Outbox Stall Alerts", () => {
    it("tracks FAILED vs SUCCESS sync operations and calculates failure rates", () => {
      const now = Date.now();

      // Record 8 successful sync operations
      for (let i = 0; i < 8; i++) {
        syncMonitor.recordSyncEvent({
          tenantId: "tenant-obs-01",
          branchId: "branch-obs-01",
          deviceId: "pos-01",
          operationId: `OP-OK-${i}`,
          entityType: "Sale",
          status: "SUCCESS",
          durationMs: 45,
          timestamp: now - 5000,
        });
      }

      // Record 2 failed sync operations
      for (let i = 0; i < 2; i++) {
        syncMonitor.recordSyncEvent({
          tenantId: "tenant-obs-01",
          branchId: "branch-obs-01",
          deviceId: "pos-01",
          operationId: `OP-FAIL-${i}`,
          entityType: "Sale",
          status: "FAILED",
          errorReason: "HTTP 500 Internal Server Error",
          durationMs: 120,
          timestamp: now - 3000,
        });
      }

      const summary = syncMonitor.getSummary();
      expect(summary.totalSuccess).toBe(8);
      expect(summary.totalFailed).toBe(2);
      expect(summary.failureRate).toBe(20.0); // 2 / 10 = 20%
      expect(summary.healthStatus).toBe("CRITICAL"); // failure rate > 5% triggers CRITICAL alert
    });

    it("triggers alert when outbox items remain unsynced beyond threshold (> 15 minutes)", () => {
      const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
      syncMonitor.updateOldestPendingOutbox(twentyMinutesAgo);

      // Record 10 healthy events
      for (let i = 0; i < 10; i++) {
        syncMonitor.recordSyncEvent({
          tenantId: "tenant-obs-01",
          branchId: "branch-obs-01",
          deviceId: "pos-01",
          operationId: `OP-HEALTHY-${i}`,
          entityType: "Sale",
          status: "SUCCESS",
          durationMs: 30,
          timestamp: Date.now(),
        });
      }

      const summary = syncMonitor.getSummary();
      expect(summary.oldestPendingOutboxAgeMinutes).toBeGreaterThanOrEqual(20);
      expect(summary.healthStatus).toBe("CRITICAL");
    });
  });

  describe("Continuous Ledger & Inventory Reconciliation Engine", () => {
    const tenantId = "tenant-audit-001";
    const branchId = "branch-audit-001";

    it("identifies matching clean state when variant stock and ledger are in sync", async () => {
      const variantId = "VAR-CLEAN-01";
      const variants: ProductVariant[] = [
        {
          id: variantId,
          tenantId,
          branchId,
          productId: "PROD-01",
          name: "Standard Pack",
          sku: "PACK-01",
          price: 10,
          costPrice: 6,
          inventoryQuantity: 50,
          isActive: true,
        } as any,
      ];

      const ledgers: StockLedger[] = [
        {
          id: "LEDGER-01",
          tenantId,
          branchId,
          productId: "PROD-01",
          variantId,
          movementType: "PURCHASE_RECEIPT",
          quantity: 50,
          quantityChange: 50,
          idempotencyKey: "KEY-01",
          occurredAt: new Date().toISOString(),
        } as any,
      ];

      const reportedStockMap = new Map<string, number>([[variantId, 50]]);
      const result = await reconciler.reconcileTenantBranch(
        tenantId,
        branchId,
        variants,
        ledgers,
        [],
        reportedStockMap
      );

      expect(result.status).toBe("CLEAN");
      expect(result.discrepancies.length).toBe(0);
      expect(result.negativeStockVariants.length).toBe(0);
    });

    it("triggers incident alert when inventoryQuantity < 0 or ledger mismatch is detected", async () => {
      const variantId = "VAR-ANOMALY-02";
      const variants: ProductVariant[] = [
        {
          id: variantId,
          tenantId,
          branchId,
          productId: "PROD-02",
          name: "Faulty Pack",
          sku: "PACK-02",
          price: 10,
          costPrice: 6,
          inventoryQuantity: 20, // Reported 20 in database table
          isActive: true,
        } as any,
      ];

      // But ledger records sum to -5 (negative stock anomaly + mismatch)
      const ledgers: StockLedger[] = [
        {
          id: "LEDGER-A",
          tenantId,
          branchId,
          productId: "PROD-02",
          variantId,
          movementType: "SALE",
          quantity: -5,
          quantityChange: -5,
          idempotencyKey: "KEY-SALE-NEG",
          occurredAt: new Date().toISOString(),
        } as any,
      ];

      const reportedStockMap = new Map<string, number>([[variantId, 20]]);
      const result = await reconciler.reconcileTenantBranch(
        tenantId,
        branchId,
        variants,
        ledgers,
        [],
        reportedStockMap
      );

      // Assert anomalies detected
      expect(result.status).toBe("ANOMALIES_DETECTED");

      // 1. Ledger mismatch: reported (20) vs calculated (-5)
      expect(result.discrepancies.length).toBe(1);
      expect(result.discrepancies[0].variantId).toBe(variantId);
      expect(result.discrepancies[0].delta).toBe(25);

      // 2. Negative stock anomaly: calculated < 0
      expect(result.negativeStockVariants.length).toBe(1);
      expect(result.negativeStockVariants[0].stock).toBe(-5);
    });
  });
});
