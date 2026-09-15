/**
 * KwakoPos V2 — Real-Time Sync Telemetry & Health Monitoring Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Tracks sync latency, outbox queue depth, network topology,
 * monotonic HLC state, and computed Edge Health Score.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { hlcEngine } from "./hlcEngine.js";
import { type LocalIndexedDbStore } from "../indexedDb.js";

export interface SyncTelemetryMetrics {
  pendingOutboxCount: number;
  failedOutboxCount: number;
  syncStatus: "IDLE" | "SYNCING" | "ERROR" | "OFFLINE";
  lastSyncDurationMs: number;
  lastSuccessfulSyncAt: number;
  healthScore: number; // 0 - 100%
  currentHlc: string;
  networkLatencyMs: number;
  isOnline: boolean;
  isSimulatedOffline: boolean;
  storageQuotaUsedBytes?: number;
  storageQuotaTotalBytes?: number;
}

export type TelemetryListener = (metrics: SyncTelemetryMetrics) => void;

export class SyncTelemetryService {
  private static instance: SyncTelemetryService;
  private localDb: LocalIndexedDbStore | null = null;
  private metrics: SyncTelemetryMetrics = {
    pendingOutboxCount: 0,
    failedOutboxCount: 0,
    syncStatus: "IDLE",
    lastSyncDurationMs: 0,
    lastSuccessfulSyncAt: Date.now(),
    healthScore: 100,
    currentHlc: hlcEngine.now(),
    networkLatencyMs: 32,
    isOnline: true,
    isSimulatedOffline: false,
  };
  private listeners: Set<TelemetryListener> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startPolling();
  }

  public static getInstance(): SyncTelemetryService {
    if (!SyncTelemetryService.instance) {
      SyncTelemetryService.instance = new SyncTelemetryService();
    }
    return SyncTelemetryService.instance;
  }

  public registerStore(db: LocalIndexedDbStore): void {
    this.localDb = db;
    void this.refreshOutboxCount();
  }

  public getMetrics(): SyncTelemetryMetrics {
    return { ...this.metrics };
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.metrics);
    return () => this.listeners.delete(listener);
  }

  public setNetworkStatus(isOnline: boolean, isSimulatedOffline: boolean = false): void {
    const changed = this.metrics.isOnline !== isOnline || this.metrics.isSimulatedOffline !== isSimulatedOffline;
    if (changed) {
      this.metrics.isOnline = isOnline;
      this.metrics.isSimulatedOffline = isSimulatedOffline;
      if (!isOnline) {
        this.metrics.syncStatus = "OFFLINE";
      } else if (this.metrics.syncStatus === "OFFLINE") {
        this.metrics.syncStatus = "IDLE";
      }
      this.recalculateHealthScore();
      this.notify();
    }
  }

  public recordSyncStart(): void {
    this.metrics.syncStatus = "SYNCING";
    this.notify();
  }

  public recordSyncComplete(durationMs: number, success: boolean): void {
    const isOnline = this.metrics.isOnline;
    this.metrics.syncStatus = isOnline ? (success ? "IDLE" : "ERROR") : "OFFLINE";
    this.metrics.lastSyncDurationMs = durationMs;
    if (success) {
      this.metrics.lastSuccessfulSyncAt = Date.now();
    }
    this.metrics.currentHlc = hlcEngine.now();
    this.recalculateHealthScore();
    this.notify();
  }

  public async refreshOutboxCount(): Promise<number> {
    try {
      if (this.localDb) {
        const pending = this.localDb.getPendingOutbox().length;
        const failed = this.localDb.getFailedOutbox ? this.localDb.getFailedOutbox().length : 0;
        this.metrics.pendingOutboxCount = pending;
        this.metrics.failedOutboxCount = failed;
      }
      this.metrics.currentHlc = hlcEngine.now();

      if (typeof navigator !== "undefined" && "storage" in navigator && navigator.storage && "estimate" in navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          this.metrics.storageQuotaUsedBytes = estimate.usage;
          this.metrics.storageQuotaTotalBytes = estimate.quota;
        } catch {
          /* ignore */
        }
      }

      this.recalculateHealthScore();
      this.notify();
      return this.metrics.pendingOutboxCount;
    } catch {
      return 0;
    }
  }

  private recalculateHealthScore(): void {
    let score = 100;
    if (!this.metrics.isOnline) score -= 20;
    if (this.metrics.pendingOutboxCount > 50) score -= 30;
    else if (this.metrics.pendingOutboxCount > 10) score -= 15;
    else if (this.metrics.pendingOutboxCount > 0) score -= 5;
    if (this.metrics.failedOutboxCount > 0) score -= 20;
    if (this.metrics.syncStatus === "ERROR") score -= 25;
    this.metrics.healthScore = Math.max(0, Math.min(100, score));
  }

  private notify(): void {
    this.listeners.forEach((l) => {
      try {
        l(this.metrics);
      } catch {
        /* ignore */
      }
    });
  }

  public stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private startPolling(): void {
    if (typeof window === "undefined") return;
    this.pollTimer = setInterval(() => {
      void this.refreshOutboxCount();
    }, 30000);
  }
}

export const syncTelemetryService = SyncTelemetryService.getInstance();
