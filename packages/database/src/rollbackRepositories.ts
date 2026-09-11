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
// KWAKOPOS V2 — SCOPED ROLLBACK REPOSITORY
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

export const globalRollbackRepository = new ScopedRollbackRepository(globalInMemoryStore);
