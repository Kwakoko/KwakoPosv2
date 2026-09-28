export const PERSISTENCE_STATES = [
  "LOCAL_COMMITTED",
  "SYNC_PENDING",
  "SERVER_CONFIRMED",
  "FAILED",
  "CONFLICT",
  "TOMBSTONED",
] as const;

export type PersistenceState = (typeof PERSISTENCE_STATES)[number];
export type PersistenceOperationType = "CREATE" | "UPDATE" | "DELETE";

export interface PersistenceStatusRecord {
  tenantId: string;
  branchId?: string;
  entityType: string;
  entityId: string;
  operationId: string;
  operationType: PersistenceOperationType;
  state: PersistenceState;
  changedAt: string;
  localCommittedAt?: string;
  syncPendingAt?: string;
  serverConfirmedAt?: string;
  failedAt?: string;
  conflictAt?: string;
  tombstonedAt?: string;
  error?: string;
  conflictId?: string;
  serverRevision?: string;
}

export type PersistenceStatusCounts = Record<PersistenceState, number>;

export interface PersistenceStatusSnapshot {
  tenantId: string | null;
  branchId: string | null;
  counts: PersistenceStatusCounts;
  total: number;
  latest: PersistenceStatusRecord | null;
  records: PersistenceStatusRecord[];
}

export const PERSISTENCE_STATUS_KEY_PREFIX = "persistenceStatus";

export function persistenceStatusKey(
  tenantId: string,
  branchId: string | undefined,
  entityType: string,
  entityId: string,
): string {
  return [
    PERSISTENCE_STATUS_KEY_PREFIX,
    encodeURIComponent(tenantId),
    encodeURIComponent(branchId || "_"),
    encodeURIComponent(entityType),
    encodeURIComponent(entityId),
  ].join(":");
}

export function emptyPersistenceStatusCounts(): PersistenceStatusCounts {
  return {
    LOCAL_COMMITTED: 0,
    SYNC_PENDING: 0,
    SERVER_CONFIRMED: 0,
    FAILED: 0,
    CONFLICT: 0,
    TOMBSTONED: 0,
  };
}

export function createPersistenceStatus(
  input: Pick<PersistenceStatusRecord, "tenantId" | "branchId" | "entityType" | "entityId" | "operationId" | "operationType">,
  state: PersistenceState,
  previous?: Partial<PersistenceStatusRecord>,
  details?: Pick<PersistenceStatusRecord, "error" | "conflictId" | "serverRevision">,
): PersistenceStatusRecord {
  const now = new Date().toISOString();
  const record: PersistenceStatusRecord = {
    ...(previous || {}),
    ...input,
    state,
    changedAt: now,
    ...details,
  };
  if (state !== "FAILED") delete record.error;
  if (state !== "CONFLICT") delete record.conflictId;
  if (state === "LOCAL_COMMITTED") record.localCommittedAt = now;
  if (state === "SYNC_PENDING") record.syncPendingAt = now;
  if (state === "SERVER_CONFIRMED") record.serverConfirmedAt = now;
  if (state === "FAILED") record.failedAt = now;
  if (state === "CONFLICT") record.conflictAt = now;
  if (state === "TOMBSTONED") record.tombstonedAt = now;
  return record;
}

export function isPersistenceState(value: unknown): value is PersistenceState {
  return typeof value === "string" && (PERSISTENCE_STATES as readonly string[]).includes(value);
}

export function emitPersistenceStatusChanged(status: PersistenceStatusRecord): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("kwakopos:persistence-status-changed", { detail: { status } }));
  } catch {
    /* observability must never break a durable mutation */
  }
}
