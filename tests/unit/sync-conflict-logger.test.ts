import { describe, it, expect, beforeEach } from "vitest";
import type { TenantContext } from "@kwakopos2/contracts";
import { SyncConflictLogger } from "@kwakopos2/sync";

describe("H-020: SyncConflictLogger Suite", () => {
  let logger: SyncConflictLogger;
  const ctxA: TenantContext = {
    tenantId: "TENANT_SYNC_A",
    branchId: "BRANCH_MAIN",
    userId: "USER_A",
    roles: ["ADMIN"],
    permissions: ["*"],
  };
  const ctxB: TenantContext = {
    tenantId: "TENANT_SYNC_B",
    branchId: "BRANCH_MAIN",
    userId: "USER_B",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  beforeEach(() => {
    SyncConflictLogger.resetInstance();
    logger = SyncConflictLogger.getInstance();
  });

  it("should record sync conflict event with resolution details", () => {
    const record = logger.logConflict(ctxA, {
      deviceId: "TABLET-01",
      operationId: "OP-901",
      entityType: "Product",
      entityId: "PROD-101",
      conflictType: "CONCURRENT_UPDATE",
      clientPayload: { price: 4500, version: 2 },
      serverState: { price: 5000, version: 3 },
      resolutionStrategy: "SERVER_WINS",
      resolvedPayload: { price: 5000, version: 3 },
      reason: "Server state has newer version timestamp",
    });

    expect(record.id).toBeDefined();
    expect(record.conflictType).toBe("CONCURRENT_UPDATE");
    expect(record.resolutionStrategy).toBe("SERVER_WINS");

    const list = logger.listConflicts(ctxA);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(record.id);
  });

  it("should enforce tenant boundary on conflict logs", () => {
    const recordA = logger.logConflict(ctxA, {
      deviceId: "DEV-A",
      operationId: "OP-A",
      entityType: "Sale",
      entityId: "SALE-01",
      conflictType: "IDEMPOTENCY_MISMATCH",
      clientPayload: { total: 100 },
      serverState: null,
      resolutionStrategy: "QUARANTINED",
      resolvedPayload: null,
      reason: "Payload mismatch for identical operationId",
    });

    // Tenant B cannot see Tenant A's conflict log
    expect(() => logger.getConflictById(ctxB, recordA.id)).toThrowError("TENANT_BOUNDARY_VIOLATION");
    expect(logger.listConflicts(ctxB)).toEqual([]);
  });
});
