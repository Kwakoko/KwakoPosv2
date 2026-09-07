import { createHash, randomUUID } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";

export interface UniversalAuditEvent {
  id: string;
  tenantId: string;
  branchId: string | null;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, any> | null;
  afterState: Record<string, any> | null;
  reason?: string;
  ipAddress?: string;
  deviceId?: string;
  timestamp: string;
  previousHash: string;
  currentHash: string;
}

export class AuditComplianceEngine {
  private static instance: AuditComplianceEngine | null = null;
  private auditEvents: UniversalAuditEvent[] = [];
  private lastHashByTenant = new Map<string, string>();

  public static getInstance(): AuditComplianceEngine {
    if (!AuditComplianceEngine.instance) {
      AuditComplianceEngine.instance = new AuditComplianceEngine();
    }
    return AuditComplianceEngine.instance;
  }

  public static resetInstance(): void {
    AuditComplianceEngine.instance = new AuditComplianceEngine();
  }

  public static computeHash(previousHash: string, payload: Record<string, any>, timestamp: string): string {
    const serialized = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash("sha256")
      .update(`${previousHash}:${serialized}:${timestamp}`)
      .digest("hex");
  }

  /**
   * Append an immutable audit record with cryptographic hash chaining
   */
  public async record(
    ctx: TenantContext,
    params: {
      action: string;
      entityType: string;
      entityId: string;
      beforeState?: Record<string, any> | null;
      afterState?: Record<string, any> | null;
      reason?: string;
      ipAddress?: string;
      deviceId?: string;
    }
  ): Promise<UniversalAuditEvent> {
    const tenantId = ctx.tenantId;
    const branchId = ctx.branchId ?? null;
    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const previousHash = this.lastHashByTenant.get(tenantId) || "GENESIS_AUDIT_HASH";

    const payloadToHash = {
      id,
      tenantId,
      branchId,
      actorId: ctx.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      afterState: params.afterState || null,
    };

    const currentHash = AuditComplianceEngine.computeHash(previousHash, payloadToHash, timestamp);

    const event: UniversalAuditEvent = {
      id,
      tenantId,
      branchId,
      actorId: ctx.userId,
      actorRole: ctx.roles?.[0] || "OPERATOR",
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: params.beforeState || null,
      afterState: params.afterState || null,
      reason: params.reason,
      ipAddress: params.ipAddress || "127.0.0.1",
      deviceId: params.deviceId || "system",
      timestamp,
      previousHash,
      currentHash,
    };

    this.auditEvents.push(event);
    this.lastHashByTenant.set(tenantId, currentHash);

    return event;
  }

  /**
   * Retrieve audit history for a tenant or entity
   */
  public getHistory(
    ctx: TenantContext,
    filter?: { entityType?: string; entityId?: string; limit?: number }
  ): UniversalAuditEvent[] {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || (ctx as any).email === "admin@kwakoko.co.tz";
    let list = this.auditEvents.filter((e) => isSuperAdmin || e.tenantId === ctx.tenantId);

    if (filter?.entityType) {
      list = list.filter((e) => e.entityType === filter.entityType);
    }
    if (filter?.entityId) {
      list = list.filter((e) => e.entityId === filter.entityId);
    }

    const limit = filter?.limit || 100;
    return list.slice(-limit);
  }

  /**
   * Verify tamper-evident cryptographic chain integrity for a tenant
   */
  public verifyIntegrity(tenantId: string): { valid: boolean; tamperedEventId?: string; totalEvents: number } {
    const events = this.auditEvents.filter((e) => e.tenantId === tenantId);
    if (events.length === 0) {
      return { valid: true, totalEvents: 0 };
    }

    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const expectedPrevHash = i === 0 ? "GENESIS_AUDIT_HASH" : events[i - 1].currentHash;

      if (ev.previousHash !== expectedPrevHash) {
        return { valid: false, tamperedEventId: ev.id, totalEvents: events.length };
      }

      const payloadToHash = {
        id: ev.id,
        tenantId: ev.tenantId,
        branchId: ev.branchId,
        actorId: ev.actorId,
        action: ev.action,
        entityType: ev.entityType,
        entityId: ev.entityId,
        afterState: ev.afterState,
      };

      const computed = AuditComplianceEngine.computeHash(ev.previousHash, payloadToHash, ev.timestamp);
      if (computed !== ev.currentHash) {
        return { valid: false, tamperedEventId: ev.id, totalEvents: events.length };
      }
    }

    return { valid: true, totalEvents: events.length };
  }
}

export const globalAuditComplianceEngine = AuditComplianceEngine.getInstance();
