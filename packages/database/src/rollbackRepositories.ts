import { randomUUID } from "node:crypto";
import type {
  TenantContext,
  RollbackRequest,
  RollbackRecoveryPoint,
  RollbackExecutionLock,
  RollbackAuditEvent,
  RollbackScope,
} from "@kwakopos2/contracts";
import { assertRollbackTenantIsolation } from "@kwakopos2/domain";
import { InMemoryStore, globalInMemoryStore } from "./inMemoryStore.js";

// ============================================================
// KWAKOPOS V2 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SCOPED ROLLBACK REPOSITORY
// ============================================================

export class ScopedRollbackRepository {
  constructor(private readonly store: InMemoryStore = globalInMemoryStore) {}

  public async createRequest(ctx: TenantContext, req: RollbackRequest): Promise<RollbackRequest> {
    assertRollbackTenantIsolation(ctx, req.tenantId);
    this.store.rollbackRequests.set(req.id, { ...req });
    return req;
  }

  public async getRequest(ctx: TenantContext, id: string): Promise<RollbackRequest | null> {
    const found = this.store.rollbackRequests.get(id);
    if (!found) return null;
    assertRollbackTenantIsolation(ctx, found.tenantId);
    return { ...found };
  }

  public async updateRequest(
    ctx: TenantContext,
    id: string,
    updates: Partial<RollbackRequest>
  ): Promise<RollbackRequest> {
    const existing = await this.getRequest(ctx, id);
    if (!existing) {
      throw new Error(`Rollback request ${id} not found.`);
    }
    assertRollbackTenantIsolation(ctx, existing.tenantId);

    const updated: RollbackRequest = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.store.rollbackRequests.set(id, updated);
    return updated;
  }

  public async listRequests(
    ctx: TenantContext,
    filters?: {
      status?: string;
      riskLevel?: string;
      scope?: string;
      branchId?: string;
      tenantId?: string;
    }
  ): Promise<RollbackRequest[]> {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    const targetTenant = isSuperAdmin ? filters?.tenantId || null : ctx.tenantId;

    let items = Array.from(this.store.rollbackRequests.values()) as RollbackRequest[];

    if (targetTenant) {
      items = items.filter((r) => r.tenantId === targetTenant);
    }

    if (filters?.branchId) {
      items = items.filter((r) => r.branchId === filters.branchId);
    }

    if (filters?.status) {
      items = items.filter((r) => r.status === filters.status);
    }

    if (filters?.riskLevel) {
      items = items.filter((r) => r.riskLevel === filters.riskLevel);
    }

    if (filters?.scope) {
      items = items.filter((r) => r.rollbackScope === filters.scope);
    }

    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async acquireLock(lock: RollbackExecutionLock): Promise<boolean> {
    const lockKey = `${lock.tenantId}:${lock.rollbackScope}`;
    const existing = this.store.rollbackLocks.get(lockKey) as RollbackExecutionLock | undefined;

    if (existing) {
      const isExpired = new Date(existing.expiresAt).getTime() < Date.now();
      if (!isExpired) {
        return false;
      }
    }

    this.store.rollbackLocks.set(lockKey, { ...lock });
    return true;
  }

  public async releaseLock(tenantId: string, scope: RollbackScope): Promise<void> {
    const lockKey = `${tenantId}:${scope}`;
    this.store.rollbackLocks.delete(lockKey);
  }

  public async getActiveLock(tenantId: string, scope: RollbackScope): Promise<RollbackExecutionLock | null> {
    const lockKey = `${tenantId}:${scope}`;
    const existing = this.store.rollbackLocks.get(lockKey) as RollbackExecutionLock | undefined;
    if (!existing) return null;
    if (new Date(existing.expiresAt).getTime() < Date.now()) {
      this.store.rollbackLocks.delete(lockKey);
      return null;
    }
    return { ...existing };
  }

  public async createRecoveryPoint(point: RollbackRecoveryPoint): Promise<RollbackRecoveryPoint> {
    this.store.rollbackRecoveryPoints.set(point.id, { ...point });
    return point;
  }

  public async getRecoveryPoint(id: string): Promise<RollbackRecoveryPoint | null> {
    const found = this.store.rollbackRecoveryPoints.get(id);
    return found ? { ...found } : null;
  }

  public async appendAuditEvent(event: RollbackAuditEvent): Promise<RollbackAuditEvent> {
    this.store.rollbackAuditEvents.set(event.id, { ...event });
    return event;
  }

  public async getAuditEvents(requestId?: string, tenantId?: string): Promise<RollbackAuditEvent[]> {
    let items = Array.from(this.store.rollbackAuditEvents.values()) as RollbackAuditEvent[];
    if (requestId) {
      items = items.filter((e) => e.rollbackRequestId === requestId);
    }
    if (tenantId) {
      items = items.filter((e) => e.tenantId === tenantId);
    }
    return items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async setSyncBarrier(tenantId: string, branchId: string | null, active: boolean): Promise<void> {
    const key = branchId ? `${tenantId}:${branchId}` : tenantId;
    if (active) {
      this.store.rollbackSyncBarriers.set(key, { tenantId, branchId, active: true, engagedAt: new Date().toISOString() });
    } else {
      this.store.rollbackSyncBarriers.delete(key);
    }
  }

  public async isSyncBarrierActive(tenantId: string, branchId: string | null): Promise<boolean> {
    const tenantKey = tenantId;
    const branchKey = branchId ? `${tenantId}:${branchId}` : null;
    return Boolean(
      this.store.rollbackSyncBarriers.has(tenantKey) ||
      (branchKey && this.store.rollbackSyncBarriers.has(branchKey))
    );
  }

  public async getCurrentSyncEpoch(tenantId: string, branchId: string | null): Promise<number> {
    const key = branchId ? `${tenantId}:${branchId}` : tenantId;
    return this.store.syncEpochs.get(key) || 1000;
  }

  public async incrementSyncEpoch(tenantId: string, branchId: string | null): Promise<number> {
    const key = branchId ? `${tenantId}:${branchId}` : tenantId;
    const current = this.store.syncEpochs.get(key) || 1000;
    const next = current + 1;
    this.store.syncEpochs.set(key, next);
    // Also update tenant-wide key if branch is specified
    if (branchId) {
      const tenantCurrent = this.store.syncEpochs.get(tenantId) || 1000;
      this.store.syncEpochs.set(tenantId, tenantCurrent + 1);
    }
    return next;
  }
}
import { prisma } from "./client.js";

export class PrismaRollbackRepository extends ScopedRollbackRepository {
  constructor(private readonly db = prisma) { super(); }

  override async createRequest(ctx: TenantContext, req: RollbackRequest): Promise<RollbackRequest> {
    assertRollbackTenantIsolation(ctx, req.tenantId);
    const row = await this.db.rollbackRequest.create({ data: {
      id: req.id, tenantId: req.tenantId, branchId: req.branchId, requestedBy: req.requestedBy, requesterEmail: req.requesterEmail, requesterRole: req.requesterRole,
      approvedBy: req.approvedBy, approverEmail: req.approverEmail, executedBy: req.executedBy, rollbackScope: req.rollbackScope, targetType: req.targetType, targetId: req.targetId,
      targetVersion: req.targetVersion, sourceVersion: req.sourceVersion, reason: req.reason, incidentId: req.incidentId, businessImpact: req.businessImpact,
      riskLevel: req.riskLevel, status: req.status, authorizationState: req.authorizationState, approvalTimestamp: req.approvalTimestamp ? new Date(req.approvalTimestamp) : null,
      executionTimestamp: req.executionTimestamp ? new Date(req.executionTimestamp) : null, verificationTimestamp: req.verificationTimestamp ? new Date(req.verificationTimestamp) : null,
      createdAt: new Date(req.createdAt), updatedAt: new Date(req.updatedAt), expiresAt: new Date(req.expiresAt), requestHash: req.requestHash, executionHash: req.executionHash,
      recoveryPointId: req.recoveryPointId, snapshotReference: req.snapshotReference, syncEpochBefore: req.syncEpochBefore, syncEpochAfter: req.syncEpochAfter,
      policyVersion: req.policyVersion, impactReport: req.impactReport as any, isEmergency: req.isEmergency, postIncidentReviewTaskId: req.postIncidentReviewTaskId,
    } });
    return this.mapRequest(row);
  }

  override async getRequest(ctx: TenantContext, id: string): Promise<RollbackRequest | null> {
    const row = await this.db.rollbackRequest.findUnique({ where: { id } });
    if (!row) return null;
    assertRollbackTenantIsolation(ctx, row.tenantId);
    return this.mapRequest(row);
  }

  override async updateRequest(ctx: TenantContext, id: string, updates: Partial<RollbackRequest>): Promise<RollbackRequest> {
    const existing = await this.getRequest(ctx, id);
    if (!existing) throw new Error("Rollback request " + id + " not found.");
    assertRollbackTenantIsolation(ctx, existing.tenantId);
    const row = await this.db.rollbackRequest.update({ where: { id }, data: {
      requestedBy: updates.requestedBy, requesterEmail: updates.requesterEmail, requesterRole: updates.requesterRole, approvedBy: updates.approvedBy, approverEmail: updates.approverEmail,
      executedBy: updates.executedBy, rollbackScope: updates.rollbackScope, targetType: updates.targetType, targetId: updates.targetId, targetVersion: updates.targetVersion,
      sourceVersion: updates.sourceVersion, reason: updates.reason, incidentId: updates.incidentId, businessImpact: updates.businessImpact, riskLevel: updates.riskLevel,
      status: updates.status, authorizationState: updates.authorizationState, approvalTimestamp: updates.approvalTimestamp ? new Date(updates.approvalTimestamp) : undefined,
      executionTimestamp: updates.executionTimestamp ? new Date(updates.executionTimestamp) : undefined, verificationTimestamp: updates.verificationTimestamp ? new Date(updates.verificationTimestamp) : undefined,
      expiresAt: updates.expiresAt ? new Date(updates.expiresAt) : undefined, requestHash: updates.requestHash, executionHash: updates.executionHash, recoveryPointId: updates.recoveryPointId,
      snapshotReference: updates.snapshotReference, syncEpochBefore: updates.syncEpochBefore, syncEpochAfter: updates.syncEpochAfter, policyVersion: updates.policyVersion,
      impactReport: updates.impactReport as any, isEmergency: updates.isEmergency, postIncidentReviewTaskId: updates.postIncidentReviewTaskId, updatedAt: new Date(),
    } });
    return this.mapRequest(row);
  }

  override async listRequests(ctx: TenantContext, filters?: { status?: string; riskLevel?: string; scope?: string; branchId?: string; tenantId?: string }): Promise<RollbackRequest[]> {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    const where: any = isSuperAdmin && filters?.tenantId ? { tenantId: filters.tenantId } : { tenantId: ctx.tenantId };
    if (filters?.branchId) where.branchId = filters.branchId;
    if (filters?.status) where.status = filters.status;
    if (filters?.riskLevel) where.riskLevel = filters.riskLevel;
    if (filters?.scope) where.rollbackScope = filters.scope;
    const rows = await this.db.rollbackRequest.findMany({ where, orderBy: { createdAt: "desc" } });
    return rows.map((row: any) => this.mapRequest(row));
  }

  override async acquireLock(lock: RollbackExecutionLock): Promise<boolean> {
    const scopeKey = lock.tenantId + ":" + lock.rollbackScope;
    try {
      const existing = await this.db.rollbackExecutionLock.findUnique({ where: { scopeKey } });
      if (existing && !existing.isExpired && existing.expiresAt.getTime() > Date.now()) return false;
      const data: any = { tenantId: lock.tenantId, branchId: null, rollbackRequestId: lock.rollbackRequestId, rollbackScope: lock.rollbackScope, scopeKey, lockOwner: lock.lockOwner, acquiredAt: new Date(lock.acquiredAt), expiresAt: new Date(lock.expiresAt), isExpired: false };
      if (existing) {
        await this.db.rollbackExecutionLock.update({ where: { id: existing.id }, data: { branchId: data.branchId, rollbackRequestId: data.rollbackRequestId, rollbackScope: data.rollbackScope, lockOwner: data.lockOwner, acquiredAt: data.acquiredAt, expiresAt: data.expiresAt, releasedAt: null, isExpired: false } });
      } else {
        await this.db.rollbackExecutionLock.create({ data: { id: (lock as any).id || randomUUID(), ...data } });
      }
      return true;
    } catch (error: any) {
      if (error?.code === "P2002") return false;
      throw error;
    }
  }

  override async releaseLock(tenantId: string, scope: RollbackScope): Promise<void> {
    await this.db.rollbackExecutionLock.updateMany({ where: { tenantId, rollbackScope: scope, isExpired: false }, data: { isExpired: true, releasedAt: new Date() } });
  }

  override async getActiveLock(tenantId: string, scope: RollbackScope): Promise<RollbackExecutionLock | null> {
    const row = await this.db.rollbackExecutionLock.findFirst({ where: { tenantId, rollbackScope: scope, isExpired: false, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: "desc" } });
    return row ? this.mapLock(row) : null;
  }

  override async createRecoveryPoint(point: RollbackRecoveryPoint): Promise<RollbackRecoveryPoint> {
    const row = await this.db.rollbackRecoveryPoint.create({ data: { id: point.id, tenantId: point.tenantId, branchId: point.branchId, rollbackRequestId: point.rollbackRequestId, databaseVersion: point.databaseVersion, schemaVersion: point.schemaVersion, applicationVersion: point.applicationVersion, syncEpoch: point.syncEpoch, checksum: point.checksum, integrityStatus: point.integrityStatus, createdAt: new Date(point.createdAt), verifiedAt: point.verifiedAt ? new Date(point.verifiedAt) : null } });
    return this.mapRecovery(row);
  }

  override async getRecoveryPoint(id: string): Promise<RollbackRecoveryPoint | null> { const row = await this.db.rollbackRecoveryPoint.findUnique({ where: { id } }); return row ? this.mapRecovery(row) : null; }

  override async appendAuditEvent(event: RollbackAuditEvent): Promise<RollbackAuditEvent> {
    const row = await this.db.rollbackAuditEvent.create({ data: { id: event.id, eventType: event.eventType, rollbackRequestId: event.rollbackRequestId, tenantId: event.tenantId, branchId: event.branchId, actorId: event.actorId, actorEmail: event.actorEmail, actorRole: event.actorRole, scope: event.scope, target: event.target, reason: event.reason, riskLevel: event.riskLevel, previousState: event.previousState, newState: event.newState, approvalReference: event.approvalReference, executionReference: event.executionReference, result: event.result, errorCode: event.errorCode, clientIp: event.clientIp, deviceId: event.deviceId, timestamp: new Date(event.timestamp), previousHash: event.previousHash, eventHash: event.eventHash } });
    return this.mapAudit(row);
  }

  override async getAuditEvents(requestId?: string, tenantId?: string): Promise<RollbackAuditEvent[]> {
    const rows = await this.db.rollbackAuditEvent.findMany({ where: { rollbackRequestId: requestId, tenantId }, orderBy: { timestamp: "asc" } });
    return rows.map((row: any) => this.mapAudit(row));
  }

  override async setSyncBarrier(tenantId: string, branchId: string | null, active: boolean): Promise<void> {
    const scopeKey = branchId ? tenantId + ":" + branchId : tenantId + ":__TENANT__";
    await this.db.rollbackSyncState.upsert({ where: { scopeKey }, update: active ? { barrierActive: true, barrierEngagedAt: new Date(), barrierReleasedAt: null } : { barrierActive: false, barrierReleasedAt: new Date() }, create: { id: randomUUID(), tenantId, branchId, scopeKey, syncEpoch: 1000, barrierActive: active, barrierEngagedAt: active ? new Date() : null, barrierReleasedAt: active ? null : new Date() } });
  }

  override async isSyncBarrierActive(tenantId: string, branchId: string | null): Promise<boolean> {
    const keys = branchId ? [tenantId + ":__TENANT__", tenantId + ":" + branchId] : [tenantId + ":__TENANT__"];
    const rows = await this.db.rollbackSyncState.findMany({ where: { tenantId, scopeKey: { in: keys }, barrierActive: true }, take: 1 });
    return rows.length > 0;
  }

  override async getCurrentSyncEpoch(tenantId: string, branchId: string | null): Promise<number> {
    const scopeKey = branchId ? tenantId + ":" + branchId : tenantId + ":__TENANT__";
    const row = await this.db.rollbackSyncState.findUnique({ where: { scopeKey } });
    return row?.syncEpoch ?? 1000;
  }

  override async incrementSyncEpoch(tenantId: string, branchId: string | null): Promise<number> {
    const increment = async (scopeKey: string, branch: string | null) => {
      try {
        const row = await this.db.rollbackSyncState.upsert({ where: { scopeKey }, update: { syncEpoch: { increment: 1 } }, create: { id: randomUUID(), tenantId, branchId: branch, scopeKey, syncEpoch: 1001 } });
        return row.syncEpoch;
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
        const found = await this.db.rollbackSyncState.findUnique({ where: { scopeKey } });
        if (!found) throw error;
        const updated = await this.db.rollbackSyncState.update({ where: { id: found.id }, data: { syncEpoch: { increment: 1 } } });
        return updated.syncEpoch;
      }
    };
    return this.db.$transaction(async () => { const next = await increment(branchId ? tenantId + ":" + branchId : tenantId + ":__TENANT__", branchId); if (branchId) await increment(tenantId + ":__TENANT__", null); return next; });
  }

  private mapRequest(row: any): RollbackRequest { return { ...row, branchId: row.branchId ?? null, approvedBy: row.approvedBy ?? null, approverEmail: row.approverEmail ?? null, executedBy: row.executedBy ?? null, incidentId: row.incidentId ?? null, approvalTimestamp: row.approvalTimestamp?.toISOString() ?? null, executionTimestamp: row.executionTimestamp?.toISOString() ?? null, verificationTimestamp: row.verificationTimestamp?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), expiresAt: row.expiresAt.toISOString(), executionHash: row.executionHash ?? null, recoveryPointId: row.recoveryPointId ?? null, snapshotReference: row.snapshotReference ?? null, syncEpochAfter: row.syncEpochAfter ?? null, impactReport: row.impactReport ?? null, postIncidentReviewTaskId: row.postIncidentReviewTaskId ?? null } as RollbackRequest; }
  private mapLock(row: any): RollbackExecutionLock { return { tenantId: row.tenantId, rollbackScope: row.rollbackScope, lockOwner: row.lockOwner, rollbackRequestId: row.rollbackRequestId, acquiredAt: row.acquiredAt.toISOString(), expiresAt: row.expiresAt.toISOString() }; }
  private mapRecovery(row: any): RollbackRecoveryPoint { return { id: row.id, tenantId: row.tenantId, branchId: row.branchId ?? null, rollbackRequestId: row.rollbackRequestId, databaseVersion: row.databaseVersion, schemaVersion: row.schemaVersion, applicationVersion: row.applicationVersion, syncEpoch: row.syncEpoch, checksum: row.checksum, integrityStatus: row.integrityStatus, createdAt: row.createdAt.toISOString(), verifiedAt: row.verifiedAt?.toISOString() ?? null }; }
  private mapAudit(row: any): RollbackAuditEvent { return { id: row.id, eventType: row.eventType, rollbackRequestId: row.rollbackRequestId, tenantId: row.tenantId, branchId: row.branchId ?? null, actorId: row.actorId, actorEmail: row.actorEmail, actorRole: row.actorRole, scope: row.scope, target: row.target, reason: row.reason, riskLevel: row.riskLevel, previousState: row.previousState ?? null, newState: row.newState, approvalReference: row.approvalReference ?? null, executionReference: row.executionReference ?? null, result: row.result, errorCode: row.errorCode ?? null, clientIp: row.clientIp, deviceId: row.deviceId, timestamp: row.timestamp.toISOString(), previousHash: row.previousHash, eventHash: row.eventHash }; }
}

export const globalInMemoryRollbackRepository = new ScopedRollbackRepository(globalInMemoryStore);
export const globalRollbackRepository = new PrismaRollbackRepository();
