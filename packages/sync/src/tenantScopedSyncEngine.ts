import type { SyncDeltaRequest, SyncDeltaResponse, TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";
import { WorldStandardPrismaSyncEngine } from "./worldStandardPrismaSyncEngine.js";

export class TenantScopedSyncEngine extends WorldStandardPrismaSyncEngine {
  async processDelta(ctx: TenantContext, req: SyncDeltaRequest): Promise<SyncDeltaResponse> {
    const response = await super.processDelta(ctx, req);
    if (!(req.since || "rev:0").startsWith("rev:")) return response;

    const changes = Array.isArray((response as any).changes) ? (response as any).changes as Array<{ revision?: string }> : [];
    const prior = BigInt((req.since || "rev:0").slice(4) || "0");

    // The cursor belongs to the tenant/branch replica, never to the global journal.
    // Advance only to the last revision actually delivered in this page. This also
    // prevents a 501st change from being skipped when MAX_DELTA is reached.
    const deliveredHead = changes.length > 0
      ? BigInt(changes[changes.length - 1].revision || prior.toString())
      : prior;

    const scopedHeadRows = await prisma.$queryRawUnsafe<Array<{ revision: bigint | number | string | null }>>(
      `SELECT MAX(revision) AS revision
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2`,
      ctx.tenantId,
      ctx.branchId,
    );
    const scopedHead = BigInt(scopedHeadRows[0]?.revision ?? prior);
    const safeRevision = deliveredHead < scopedHead && changes.length === 0 ? prior : deliveredHead;

    return {
      ...response,
      serverRevision: safeRevision.toString(),
    } as SyncDeltaResponse;
  }
}
