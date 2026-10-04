import type { SyncStatusSnapshot } from "./syncStatusService.js";

export type ConflictCenterReplicaState = "VERIFIED" | "DIVERGENT" | "NOT_VERIFIED";

export function countUniqueLocalConflictIds(entries: Iterable<[string, unknown]>): number {
  const ids = new Set<string>();

  for (const [key, value] of entries) {
    if (!key.startsWith("sync_conflict_")) continue;

    let id = "";
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as { conflictId?: unknown };
        id = String(parsed?.conflictId ?? "").trim();
      } catch {
        // Fall back to the metadata key below.
      }
    } else if (value && typeof value === "object") {
      const parsed = value as { conflictId?: unknown };
      id = String(parsed?.conflictId ?? "").trim();
    }

    ids.add(id || key.replace("sync_conflict_", ""));
  }

  return ids.size;
}

export function getConflictCenterReplicaState(
  snapshot: Pick<
    SyncStatusSnapshot,
    "reconciliationStatus" | "openConflictCount" | "pendingOutboxCount" | "failedOutboxCount" | "abandonedOutboxCount"
  >,
): ConflictCenterReplicaState {
  if (snapshot.reconciliationStatus === "DIVERGENT") return "DIVERGENT";
  if (snapshot.openConflictCount !== 0) return "NOT_VERIFIED";

  if (
    snapshot.reconciliationStatus === "IN_SYNC" &&
    snapshot.pendingOutboxCount === 0 &&
    snapshot.failedOutboxCount === 0 &&
    snapshot.abandonedOutboxCount === 0
  ) {
    return "VERIFIED";
  }

  return "NOT_VERIFIED";
}
