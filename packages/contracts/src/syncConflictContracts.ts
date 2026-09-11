import { z } from "zod";

export const SyncConflictTypeEnum = z.enum([
  "STALE_VERSION",
  "CONCURRENT_UPDATE",
  "IDEMPOTENCY_MISMATCH",
  "INVARIANT_REJECTED",
]);
export type SyncConflictType = z.infer<typeof SyncConflictTypeEnum>;

export const SyncResolutionStrategyEnum = z.enum([
  "SERVER_WINS",
  "CLIENT_WINS",
  "MERGED",
  "QUARANTINED",
]);
export type SyncResolutionStrategy = z.infer<typeof SyncResolutionStrategyEnum>;

export const SyncConflictRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  deviceId: z.string().min(1),
  operationId: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  conflictType: SyncConflictTypeEnum,
  clientPayload: z.record(z.unknown()),
  serverState: z.record(z.unknown()).nullable(),
  resolutionStrategy: SyncResolutionStrategyEnum,
  resolvedPayload: z.record(z.unknown()).nullable(),
  reason: z.string(),
  occurredAt: z.string(),
});
export type SyncConflictRecord = z.infer<typeof SyncConflictRecordSchema>;
