import { randomUUID } from "crypto";
import type {
  TenantContext,
  SyncConflictRecord,
  SyncConflictType,
  SyncResolutionStrategy,
} from "@kwakopos2/contracts";

export class SyncConflictLogger {
  private static instance: SyncConflictLogger | null = null;
  private conflicts = new Map<string, SyncConflictRecord>();

  public static getInstance(): SyncConflictLogger {
    if (!SyncConflictLogger.instance) {
      SyncConflictLogger.instance = new SyncConflictLogger();
    }
    return SyncConflictLogger.instance;
  }

  public static resetInstance(): void {
    SyncConflictLogger.instance = new SyncConflictLogger();
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access sync conflicts of tenant '${tenantId}'.`
      );
    }
  }

  /**
   * Record a sync conflict event with resolution details
   */
  public logConflict(
    ctx: TenantContext,
    params: {
      deviceId: string;
      operationId: string;
      entityType: string;
      entityId: string;
      conflictType: SyncConflictType;
      clientPayload: Record<string, unknown>;
      serverState: Record<string, unknown> | null;
      resolutionStrategy: SyncResolutionStrategy;
      resolvedPayload: Record<string, unknown> | null;
      reason: string;
    }
  ): SyncConflictRecord {
    const record: SyncConflictRecord = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      deviceId: params.deviceId,
      operationId: params.operationId,
      entityType: params.entityType,
      entityId: params.entityId,
      conflictType: params.conflictType,
      clientPayload: params.clientPayload,
      serverState: params.serverState,
      resolutionStrategy: params.resolutionStrategy,
      resolvedPayload: params.resolvedPayload,
      reason: params.reason,
      occurredAt: new Date().toISOString(),
    };

    this.conflicts.set(record.id, record);
    return { ...record };
  }

  /**
   * List sync conflicts for a tenant
   */
  public listConflicts(
    ctx: TenantContext,
    filter?: { entityType?: string; deviceId?: string; limit?: number }
  ): SyncConflictRecord[] {
    this.assertIsolation(ctx, ctx.tenantId);
    let items = Array.from(this.conflicts.values()).filter(
      (c) => c.tenantId === ctx.tenantId && c.branchId === ctx.branchId
    );

    if (filter?.entityType) items = items.filter((c) => c.entityType === filter.entityType);
    if (filter?.deviceId) items = items.filter((c) => c.deviceId === filter.deviceId);

    items.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
    return items.slice(0, filter?.limit || 100);
  }

  /**
   * Get conflict by ID
   */
  public getConflictById(ctx: TenantContext, id: string): SyncConflictRecord | null {
    const record = this.conflicts.get(id);
    if (!record) return null;
    this.assertIsolation(ctx, record.tenantId);
    return { ...record };
  }
}

export const globalSyncConflictLogger = SyncConflictLogger.getInstance();
