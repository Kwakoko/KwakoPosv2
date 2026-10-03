import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaRollbackRepository } from "@kwakopos2/database";

describe("Prisma rollback persistence", () => {
  it("persists request, lock lifecycle, barrier/epoch state, and audit event", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const requestId = randomUUID();
    const repo = new PrismaRollbackRepository();
    const ctx = { tenantId, branchId, userId: "ROLLBACK-TEST", roles: ["ADMIN"], permissions: ["*"] };
    const now = Date.now();
    try {
      await prisma.tenant.create({ data: { id: tenantId, name: "Rollback Test", slug: `rollback-${tenantId.slice(0, 8)}` } });
      await prisma.branch.create({ data: { id: branchId, tenantId, name: "Main", code: `RB-${tenantId.slice(0, 6)}`, isMain: true } });
      const request = await repo.createRequest(ctx, {
        id: requestId, tenantId, branchId, requestedBy: "ROLLBACK-TEST", requesterEmail: "rollback@test.local",
        requesterRole: "ADMIN", approvedBy: null, approverEmail: null, executedBy: null, rollbackScope: "TENANT",
        targetType: "TENANT_DATA", targetId: tenantId, targetVersion: "HEAD", sourceVersion: "PREVIOUS",
        reason: "Persistence gate", incidentId: null, businessImpact: "Test", riskLevel: "LOW", status: "REQUESTED",
        authorizationState: "PENDING", approvalTimestamp: null, executionTimestamp: null, verificationTimestamp: null,
        createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 60_000).toISOString(), requestHash: randomUUID(), executionHash: null,
        recoveryPointId: null, snapshotReference: null, syncEpochBefore: 1000, syncEpochAfter: null,
        policyVersion: "1.0.0", impactReport: null, isEmergency: false, postIncidentReviewTaskId: null,
      } as any);
      expect(request.id).toBe(requestId);
      expect((await repo.getRequest(ctx, requestId))?.tenantId).toBe(tenantId);
      const lock = { tenantId, rollbackScope: "TENANT", lockOwner: "node-a", rollbackRequestId: requestId,
        acquiredAt: new Date(now).toISOString(), expiresAt: new Date(now + 60_000).toISOString() } as any;
      expect(await repo.acquireLock(lock)).toBe(true);
      expect((await repo.getActiveLock(tenantId, "TENANT"))?.lockOwner).toBe("node-a");
      expect(await repo.acquireLock({ ...lock, lockOwner: "node-b" })).toBe(false);
      await prisma.rollbackExecutionLock.updateMany({
        where: { tenantId, rollbackScope: "TENANT" },
        data: { expiresAt: new Date(now - 1), isExpired: false },
      });
      expect(await repo.getActiveLock(tenantId, "TENANT")).toBeNull();
      expect(await repo.acquireLock({ ...lock, lockOwner: "node-expired", expiresAt: new Date(now + 60_000).toISOString() })).toBe(true);
      expect((await repo.getActiveLock(tenantId, "TENANT"))?.lockOwner).toBe("node-expired");
      await repo.releaseLock(tenantId, "TENANT");
      expect(await repo.getActiveLock(tenantId, "TENANT")).toBeNull();
      await repo.setSyncBarrier(tenantId, branchId, true);
      expect(await repo.isSyncBarrierActive(tenantId, branchId)).toBe(true);
      await repo.setSyncBarrier(tenantId, branchId, false);
      expect(await repo.isSyncBarrierActive(tenantId, branchId)).toBe(false);
      expect(await repo.getCurrentSyncEpoch(tenantId, branchId)).toBe(1000);
      expect(await repo.incrementSyncEpoch(tenantId, branchId)).toBe(1001);
      expect(await repo.getCurrentSyncEpoch(tenantId, branchId)).toBe(1001);
      const audit = await repo.appendAuditEvent({
        id: randomUUID(), eventType: "ROLLBACK_REQUESTED", rollbackRequestId: requestId, tenantId, branchId,
        actorId: "ROLLBACK-TEST", actorEmail: "rollback@test.local", actorRole: "ADMIN", scope: "TENANT",
        target: tenantId, reason: "Persistence gate", riskLevel: "LOW", previousState: null,
        newState: "REQUESTED", approvalReference: null, executionReference: null, result: "SUCCESS",
        errorCode: null, clientIp: "127.0.0.1", deviceId: "rollback-test", timestamp: new Date().toISOString(),
        previousHash: "GENESIS_ROLLBACK_HASH", eventHash: randomUUID(),
      } as any);
      expect(audit.rollbackRequestId).toBe(requestId);
      expect((await repo.getAuditEvents(requestId, tenantId)).some((e) => e.eventHash === audit.eventHash)).toBe(true);
    } finally {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
