import { useEffect, useState } from "react";
import type { LocalIndexedDbStore } from "../indexedDb.js";
import { apiFetch } from "./applicationApiService.js";

export const SYNC_STATUS_STATES = [
  "IDLE",
  "SYNCING",
  "SUCCESS",
  "ERROR",
  "OFFLINE",
] as const;
export type SyncStatusState = (typeof SYNC_STATUS_STATES)[number];

export interface SyncStatusScope {
  tenantId: string | null;
  branchId: string | null;
}

export interface SyncStatusSnapshot extends SyncStatusScope {
  state: SyncStatusState;
  /** Client's durable sync cursor for the active tenant/branch scope. */
  localRevision: string;
  /** Latest authoritative server revision observed for the active scope. */
  serverRevision: string | null;
  /** Durable sync epoch observed by the existing sync engine. */
  syncEpoch: string | null;
  /** Last authoritative reconciliation result persisted by the sync engine. */
  reconciliationStatus: "IN_SYNC" | "DIVERGENT" | "UNKNOWN";
  /** Number of OPEN conflicts reported by authoritative PostgreSQL. null means not verified. */
  openConflictCount: number | null;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  /** Items permanently abandoned after exceeding the server-rejection retry cap. */
  abandonedOutboxCount: number;
  lastSyncedAt: number | null;
  lastSyncDurationMs: number;
  lastError: string | null;
  lastResult: { pushed: number; pulled: number } | null;
  updatedAt: number;
}

export type SyncStatusListener = (snapshot: SyncStatusSnapshot) => void;

const emptySnapshot = (): SyncStatusSnapshot => ({
  tenantId: null,
  branchId: null,
  state: "IDLE",
  localRevision: "0",
  serverRevision: null,
  syncEpoch: null,
  reconciliationStatus: "UNKNOWN",
  openConflictCount: null,
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  abandonedOutboxCount: 0,
  lastSyncedAt: null,
  lastSyncDurationMs: 0,
  lastError: null,
  lastResult: null,
  updatedAt: Date.now(),
});

export class SyncStatusService {
  private static instance: SyncStatusService;
  private db: LocalIndexedDbStore | null = null;
  private snapshot: SyncStatusSnapshot = emptySnapshot();
  private listeners = new Set<SyncStatusListener>();
  private startedAt = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      this.refreshTimer = setInterval(() => void this.refreshCounts(), 30000);
    }
  }

  static getInstance(): SyncStatusService {
    if (!SyncStatusService.instance) SyncStatusService.instance = new SyncStatusService();
    return SyncStatusService.instance;
  }

  registerStore(db: LocalIndexedDbStore): void {
    this.db = db;
    void this.refreshCounts();
  }

  getSnapshot(scope?: Partial<SyncStatusScope>): SyncStatusSnapshot {
    if (!scope?.tenantId && !scope?.branchId) return { ...this.snapshot };
    if (scope.tenantId === this.snapshot.tenantId && scope.branchId === this.snapshot.branchId) return { ...this.snapshot };
    return { ...emptySnapshot(), ...scope };
  }
  subscribe(listener: SyncStatusListener, scope?: Partial<SyncStatusScope>): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot(scope));
    return () => this.listeners.delete(listener);
  }

  setScope(scope: SyncStatusScope): void {
    if (this.snapshot.tenantId === scope.tenantId && this.snapshot.branchId === scope.branchId) return;
    const previous = this.snapshot;
    this.snapshot = {
      ...emptySnapshot(),
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      state: previous.state === "SYNCING" ? "SYNCING" : "IDLE",
      reconciliationStatus: "UNKNOWN",
      openConflictCount: null,
      lastSyncedAt: previous.lastSyncedAt,
      lastSyncDurationMs: previous.lastSyncDurationMs,
    };
    this.notify();
    void this.refreshCounts();
  }

  setNetworkStatus(isOnline: boolean): void {
    if (!isOnline) {
      this.update({ state: "OFFLINE" });
      return;
    }
    if (this.snapshot.state === "OFFLINE") this.update({ state: "IDLE", lastError: null });
  }

  startSync(scope: SyncStatusScope): void {
    this.setScope(scope);
    this.startedAt = Date.now();
    this.update({ state: "SYNCING", lastError: null });
  }

  completeSync(result: { pushed: number; pulled: number }, success = true): void {
    const now = Date.now();
    this.update({
      state: success ? "SUCCESS" : "ERROR",
      lastSyncedAt: success ? now : this.snapshot.lastSyncedAt,
      lastSyncDurationMs: this.startedAt ? now - this.startedAt : this.snapshot.lastSyncDurationMs,
      lastResult: { pushed: Number(result.pushed || 0), pulled: Number(result.pulled || 0) },
      lastError: success ? null : this.snapshot.lastError,
    });
    if (success) void this.refreshCounts();
  }

  failSync(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error || "Synchronization failed");
    this.update({
      state: this.snapshot.state === "OFFLINE" ? "OFFLINE" : "ERROR",
      lastError: message,
      lastSyncDurationMs: this.startedAt ? Date.now() - this.startedAt : this.snapshot.lastSyncDurationMs,
    });
    void this.refreshCounts();
  }

  async refreshCounts(scope?: Partial<SyncStatusScope>): Promise<SyncStatusSnapshot> {
    if (scope) this.setScope(scope as SyncStatusScope);
    if (!this.db) return this.getSnapshot();
    try {
      await this.db.ready;
      const tenantId = scope?.tenantId ?? this.snapshot.tenantId ?? undefined;
      const branchId = scope?.branchId ?? this.snapshot.branchId ?? undefined;
      const pending = this.db.getPendingOutbox(tenantId, branchId).length;
      const localRevision = tenantId && branchId
        ? String(this.db.syncMetadata.get(`syncScope:${tenantId}:${branchId}:lastSyncRevision`) ?? "0")
        : "0";
      const scopePrefix = tenantId && branchId ? `syncScope:${tenantId}:${branchId}:` : null;
      const syncEpoch = scopePrefix
        ? (() => {
            const value = this.db.syncMetadata.get(scopePrefix + "syncEpoch");
            return value == null ? null : String(value);
          })()
        : null;
      const rawReconciliationStatus = scopePrefix
        ? String(this.db.syncMetadata.get(scopePrefix + "reconciliationStatus") ?? "UNKNOWN")
        : "UNKNOWN";
      const reconciliationStatus =
        rawReconciliationStatus === "IN_SYNC" || rawReconciliationStatus === "DIVERGENT"
          ? rawReconciliationStatus
          : "UNKNOWN";
      const authoritativeServerRevision = scopePrefix
        ? (() => {
            const value = this.db!.syncMetadata.get(scopePrefix + "lastServerRevision");
            return value == null ? null : String(value);
          })()
        : null;
      const durableLastSync = scopePrefix ? this.db.syncMetadata.get(scopePrefix + "lastSyncTime") : null;
      const durableLastSyncedAt = (() => {
        if (typeof durableLastSync === "number" && Number.isFinite(durableLastSync)) return durableLastSync;
        if (typeof durableLastSync === "string") {
          const parsed = Date.parse(durableLastSync);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      })();
      // Retriable failures (will be re-queued on next heartbeat)
      const failed = this.db.getRetriableFailedOutbox
        ? this.db.getRetriableFailedOutbox(tenantId, branchId).length
        : this.db.getFailedOutbox
          ? this.db.getFailedOutbox(tenantId, branchId).length
          : 0;
      // Permanently abandoned (exceeded retry cap — shown as conflicts, not pending)
      const abandoned = this.db.getAbandonedOutbox
        ? this.db.getAbandonedOutbox(tenantId, branchId).length
        : 0;

      // The conflict count is authoritative only when the server confirms it.
      // Network failure must never turn an unknown conflict state into zero.
      let openConflictCount = this.snapshot.openConflictCount;
      if (tenantId && branchId && typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const response = await apiFetch<any>("/sync/conflicts?status=OPEN");
          openConflictCount = Array.isArray(response?.data) ? response.data.length : 0;
        } catch {
          // Preserve the previous value (or null) so an unreachable server is
          // never presented as a verified zero-conflict state.
        }
      }

      this.update({
        pendingOutboxCount: pending,
        failedOutboxCount: failed,
        abandonedOutboxCount: abandoned,
        reconciliationStatus,
        ...(openConflictCount !== undefined ? { openConflictCount } : {}),
        localRevision,
        syncEpoch,
        ...(authoritativeServerRevision !== null ? { serverRevision: authoritativeServerRevision } : {}),
        ...(durableLastSyncedAt !== null ? { lastSyncedAt: durableLastSyncedAt } : {}),
      });
    } catch (error) {
      this.failSync(error);
    }
    return this.getSnapshot();
  }

  /**
   * Record the latest server revision observed by an authoritative consumer.
   * This is status metadata only; all synchronization remains owned by the existing sync engine.
   */
  recordAuthoritativeServerRevision(
    scope: SyncStatusScope,
    serverRevision: string,
    syncEpoch?: string | null,
  ): void {
    if (!scope.tenantId || !scope.branchId || !serverRevision) return;
    if (this.snapshot.tenantId !== scope.tenantId || this.snapshot.branchId !== scope.branchId) {
      this.setScope(scope);
    }
    this.update({
      serverRevision: String(serverRevision),
      ...(syncEpoch !== undefined ? { syncEpoch: syncEpoch ? String(syncEpoch) : null } : {}),
    });
  }

  dispose(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.listeners.clear();
  }

  private update(patch: Partial<SyncStatusSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, updatedAt: Date.now() };
    this.notify();
  }

  private notify(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch { /* diagnostics must never break sync */ }
    }
  }
}

export const syncStatusService = SyncStatusService.getInstance();

export function useAuthoritativeSyncStatus(scope?: Partial<SyncStatusScope>): SyncStatusSnapshot {
  const [snapshot, setSnapshot] = useState<SyncStatusSnapshot>(() => syncStatusService.getSnapshot(scope));

  useEffect(() => {
    if (scope?.tenantId || scope?.branchId) {
      syncStatusService.setScope({
        tenantId: scope.tenantId ?? null,
        branchId: scope.branchId ?? null,
      });
    }
    const unsubscribe = syncStatusService.subscribe(setSnapshot, scope);
    void syncStatusService.refreshCounts(scope);
    return unsubscribe;
  }, [scope?.tenantId, scope?.branchId]);

  return snapshot;
}

export function isReplicaConverged(snapshot: SyncStatusSnapshot): boolean {
  return (
    snapshot.state === "SUCCESS" &&
    snapshot.reconciliationStatus === "IN_SYNC" &&
    snapshot.pendingOutboxCount === 0 &&
    snapshot.failedOutboxCount === 0 &&
    snapshot.abandonedOutboxCount === 0 &&
    snapshot.openConflictCount === 0 &&
    snapshot.serverRevision !== null &&
    snapshot.localRevision === snapshot.serverRevision
  );
}

export function syncStatusLabel(snapshot: SyncStatusSnapshot): string {
  if (snapshot.state === "OFFLINE") return "OFFLINE";
  if (snapshot.state === "SYNCING") return "SYNCING";
  if (snapshot.abandonedOutboxCount > 0) return "CONFLICT";
  if (snapshot.failedOutboxCount > 0) return "ERROR";
  if (snapshot.pendingOutboxCount > 0) return "PENDING";
  if (snapshot.state === "ERROR") return "ERROR";
  if (snapshot.state === "SUCCESS" && snapshot.reconciliationStatus === "DIVERGENT") return "CONFLICT";
  if (snapshot.state === "SUCCESS" && snapshot.reconciliationStatus !== "IN_SYNC") return "VERIFYING";
  if (snapshot.state === "SUCCESS" && snapshot.openConflictCount === null) return "VERIFYING";
  if (snapshot.state === "SUCCESS" && snapshot.openConflictCount > 0) return "CONFLICT";
  return snapshot.state === "SUCCESS" ? "SYNCED" : "IDLE";
}
