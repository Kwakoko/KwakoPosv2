import { useEffect, useState } from "react";
import type { LocalIndexedDbStore } from "../indexedDb.js";

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
      this.update({ pendingOutboxCount: pending, failedOutboxCount: failed, abandonedOutboxCount: abandoned });
    } catch (error) {
      this.failSync(error);
    }
    return this.getSnapshot();
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

export function syncStatusLabel(snapshot: SyncStatusSnapshot): string {
  if (snapshot.state === "OFFLINE") return "OFFLINE";
  if (snapshot.state === "SYNCING") return "SYNCING";
  if (snapshot.abandonedOutboxCount > 0) return "CONFLICT";
  if (snapshot.failedOutboxCount > 0) return "ERROR";
  if (snapshot.pendingOutboxCount > 0) return "PENDING";
  return snapshot.state === "SUCCESS" ? "SYNCED" : "IDLE";
}
