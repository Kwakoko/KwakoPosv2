import { describe, it, expect } from "vitest";
import {
  RollbackAuthorizationEngine,
  assertRollbackAuthorized,
  assertSeparationOfDuties,
  assertRollbackApprovalNotExpired,
  assertConfirmationPhrase,
  assertNonDestructiveFinancialRollback,
  assertStockLedgerRecalculationPasses,
  assertRollbackTenantIsolation,
  computeRollbackAuditHash,
} from "@kwakopos2/domain";
import type {
  TenantContext,
  RollbackAuditEvent,
} from "@kwakopos2/contracts";

describe("KwakoPos Rollback Authorization Engine - Domain Invariants", () => {
  it("classifies risk dynamically based on scope, exposure, and record counts", () => {
    // Level 0: Record, small impact -> LOW
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "RECORD",
        targetType: "TRANSACTION",
        financialExposure: 40_000,
        recordsCount: 2,
      })
    ).toBe("LOW");

    // Level 1: Module -> MEDIUM
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "MODULE",
        targetType: "MODULE_DATA",
        financialExposure: 100_000,
        recordsCount: 10,
      })
    ).toBe("MEDIUM");

    // Level 2: Branch -> HIGH
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "BRANCH",
        targetType: "BRANCH_STATE",
        financialExposure: 500_000,
        recordsCount: 50,
      })
    ).toBe("HIGH");

    // Financial impact > 1,000,000 TZS escalates to HIGH
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "RECORD",
        targetType: "TRANSACTION",
        financialExposure: 2_500_000,
        recordsCount: 1,
      })
    ).toBe("HIGH");

    // Level 4: Platform -> CRITICAL
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "PLATFORM",
        targetType: "GLOBAL_SYSTEM",
      })
    ).toBe("CRITICAL");

    // Level 5: Emergency -> CRITICAL
    expect(
      RollbackAuthorizationEngine.classifyRisk({
        scope: "EMERGENCY",
        targetType: "GLOBAL_SYSTEM",
        isEmergency: true,
      })
    ).toBe("CRITICAL");
  });

  it("enforces four-eyes separation of duties: requester cannot approve their own request", () => {
    // Requester attempting to self-approve MUST throw
    expect(() => {
      assertSeparationOfDuties("user-manager-01", "user-manager-01");
    }).toThrow(/Four-Eyes Control Violation/);

    // Different authorized operator MUST pass
    expect(() => {
      assertSeparationOfDuties("user-manager-01", "user-auditor-99");
    }).not.toThrow();

    // In emergency bypass mode, self-approval is permitted
    expect(() => {
      assertSeparationOfDuties("user-manager-01", "user-manager-01", true);
    }).not.toThrow();
  });

  it("enforces role-based rollback authorization permissions", () => {
    const adminCtx: TenantContext = {
      tenantId: "tenant-alpha",
      branchId: "branch-01",
      userId: "u1",
      roles: ["SUPER_ADMIN"],
      permissions: [],
    };

    // SUPER_ADMIN has platform-wide wildcard authorization
    expect(() => {
      assertRollbackAuthorized(adminCtx, "BRANCH", "approve");
      assertRollbackAuthorized(adminCtx, "PLATFORM", "execute");
    }).not.toThrow();

    // Standard operator with explicit permission
    const opCtx: TenantContext = {
      tenantId: "tenant-alpha",
      branchId: "branch-01",
      userId: "u2",
      roles: ["BRANCH_MANAGER"],
      permissions: ["rollback.request"],
    };

    expect(() => {
      assertRollbackAuthorized(opCtx, "RECORD", "request");
    }).not.toThrow();

    // Missing permission throws
    expect(() => {
      assertRollbackAuthorized(opCtx, "RECORD", "execute");
    }).toThrow(/lacks required permission/);
  });

  it("validates approval expiration windows according to risk level", () => {
    const recentDate = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 mins ago
    const expiredLowDate = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25 hours ago (>24h)
    const expiredCriticalDate = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2 hours ago (>1h)

    // Valid recent approval
    expect(() => {
      assertRollbackApprovalNotExpired(recentDate, "HIGH");
    }).not.toThrow();

    // Expired LOW risk (>24h)
    expect(() => {
      assertRollbackApprovalNotExpired(expiredLowDate, "LOW");
    }).toThrow(/expired after 24 hours/);

    // Expired CRITICAL risk (>1h)
    expect(() => {
      assertRollbackApprovalNotExpired(expiredCriticalDate, "CRITICAL");
    }).toThrow(/expired after 1 hours/);

    // Unapproved throws NOT_APPROVED
    expect(() => {
      assertRollbackApprovalNotExpired(null, "LOW");
    }).toThrow(/has not been approved/);
  });

  it("strictly validates the confirmation phrase 'AUTHORIZE ROLLBACK' for sensitive rollbacks", () => {
    // CRITICAL with exact phrase passes
    expect(() => {
      assertConfirmationPhrase("AUTHORIZE ROLLBACK", "CRITICAL");
    }).not.toThrow();

    // CRITICAL with missing or wrong phrase throws
    expect(() => {
      assertConfirmationPhrase(undefined, "CRITICAL");
    }).toThrow(/explicit confirmation phrase/);

    expect(() => {
      assertConfirmationPhrase("confirm please", "CRITICAL");
    }).toThrow(/explicit confirmation phrase/);

    // Non-critical risk levels do not require phrase
    expect(() => {
      assertConfirmationPhrase(undefined, "LOW");
      assertConfirmationPhrase(undefined, "MEDIUM");
    }).not.toThrow();
  });

  it("enforces tenant isolation and prevents cross-tenant access", () => {
    const tenantCtx: TenantContext = {
      tenantId: "tenant-alpha",
      branchId: "branch-01",
      userId: "u-tenant-01",
      roles: ["BRANCH_MANAGER"],
      permissions: ["*"],
    };

    // Same tenant passes
    expect(() => {
      assertRollbackTenantIsolation(tenantCtx, "tenant-alpha");
    }).not.toThrow();

    // Cross-tenant without Super Admin role throws
    expect(() => {
      assertRollbackTenantIsolation(tenantCtx, "tenant-beta");
    }).toThrow(/Tenant boundary violation/);

    // Super Admin bypass passes
    const superAdminCtx: TenantContext = {
      ...tenantCtx,
      roles: ["SUPER_ADMIN"],
    };
    expect(() => {
      assertRollbackTenantIsolation(superAdminCtx, "tenant-beta");
    }).not.toThrow();
  });

  it("enforces non-destructive financial ledger compensation rules", () => {
    // Valid compensating reversal linkage passes
    expect(() => {
      assertNonDestructiveFinancialRollback("tx-original-001", "tx-reversal-001", 45000);
    }).not.toThrow();

    // Missing reversal reference throws
    expect(() => {
      assertNonDestructiveFinancialRollback("tx-original-001", "", 45000);
    }).toThrow(/Financial rollback requires explicit linkage/);

    // Identity collision (reversal has same ID as original) throws
    expect(() => {
      assertNonDestructiveFinancialRollback("tx-001", "tx-001", 45000);
    }).toThrow(/cannot share ID/);
  });

  it("enforces stock ledger recalculation invariant across all movement vectors", () => {
    // Opening(10) + Purchases(50) + AdjIn(5) - Sales(20) - AdjOut(3) - XferOut(7) + XferIn(0) = Closing(35)
    // 10 + 50 + 5 - 20 - 3 - 7 + 0 = 35. Correct!
    expect(() => {
      assertStockLedgerRecalculationPasses(10, 50, 5, 20, 3, 7, 0, 35);
    }).not.toThrow();

    // Tampered or inconsistent closing balance (reported 30 instead of 35) throws
    expect(() => {
      assertStockLedgerRecalculationPasses(10, 50, 5, 20, 3, 7, 0, 30);
    }).toThrow(/Stock ledger balance mismatch/);
  });

  it("maintains cryptographic SHA-256 tamper-evident audit chaining", () => {
    const timestamp1 = new Date().toISOString();
    const event1Payload = {
      id: "a0000000-0000-0000-0000-000000000001",
      eventType: "ROLLBACK_REQUESTED" as const,
      rollbackRequestId: "b0000000-0000-0000-0000-000000000001",
      tenantId: "tenant-alpha",
      actorId: "user-1",
      newState: "REQUESTED",
      result: "SUCCESS" as const,
    };

    const event1Hash = computeRollbackAuditHash("GENESIS_ROLLBACK_HASH", event1Payload, timestamp1);
    expect(event1Hash).toMatch(/^[a-f0-9]{64}$/);

    const event1: RollbackAuditEvent = {
      ...event1Payload,
      branchId: null,
      actorEmail: "user1@kwakopos.com",
      actorRole: "MANAGER",
      scope: "BRANCH",
      target: "branch-01",
      reason: "Stock discrepancy correction",
      riskLevel: "HIGH",
      previousState: null,
      approvalReference: null,
      executionReference: null,
      errorCode: null,
      clientIp: "127.0.0.1",
      deviceId: "system",
      timestamp: timestamp1,
      previousHash: "GENESIS_ROLLBACK_HASH",
      eventHash: event1Hash,
    };

    const timestamp2 = new Date(Date.now() + 1000).toISOString();
    const event2Payload = {
      id: "a0000000-0000-0000-0000-000000000002",
      eventType: "ROLLBACK_APPROVED" as const,
      rollbackRequestId: "b0000000-0000-0000-0000-000000000001",
      tenantId: "tenant-alpha",
      actorId: "user-2",
      newState: "APPROVED",
      result: "SUCCESS" as const,
    };

    const event2Hash = computeRollbackAuditHash(event1Hash, event2Payload, timestamp2);
    expect(event2Hash).toMatch(/^[a-f0-9]{64}$/);

    const event2: RollbackAuditEvent = {
      ...event2Payload,
      branchId: null,
      actorEmail: "auditor@kwakopos.com",
      actorRole: "SUPER_ADMIN",
      scope: "BRANCH",
      target: "branch-01",
      reason: "Approved after ledger review",
      riskLevel: "HIGH",
      previousState: "REQUESTED",
      approvalReference: "APPR-001",
      executionReference: null,
      errorCode: null,
      clientIp: "127.0.0.1",
      deviceId: "system",
      timestamp: timestamp2,
      previousHash: event1Hash,
      eventHash: event2Hash,
    };

    // Verify valid chain
    const chainVerification = RollbackAuthorizationEngine.verifyAuditChain([event1, event2]);
    expect(chainVerification.isValid).toBe(true);

    // Tampering test: tamper event 1
    const tamperedEvent1 = {
      ...event1,
      eventHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    };
    const tamperedVerification = RollbackAuthorizationEngine.verifyAuditChain([tamperedEvent1, event2]);
    expect(tamperedVerification.isValid).toBe(false);
    expect(tamperedVerification.tamperedEventId).toBe(event1.id);
  });
});
