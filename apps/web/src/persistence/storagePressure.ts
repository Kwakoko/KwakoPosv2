/**
 * KwakoPos Storage Pressure Protection Engine
 *
 * Monitors IndexedDB quota and available browser storage.
 * Proactively surfaces storage pressure warnings and refuses unsafe
 * destructive operations or unverified bulk cache fills when persistence
 * cannot be guaranteed, safeguarding all business and outbox data.
 */

export interface StorageEstimateResult {
  supported: boolean;
  quotaBytes: number;
  usageBytes: number;
  availableBytes: number;
  usagePercent: number;
  underPressure: boolean;
  persisted: boolean;
  warningMessage?: string;
}

const SAFETY_FREE_BYTES_THRESHOLD = 50 * 1024 * 1024; // 50 MB minimum
const SAFETY_USAGE_PERCENT_THRESHOLD = 90; // 90% maximum

export class StoragePressureMonitor {
  private underPressure = false;
  private lastEstimate: StorageEstimateResult | null = null;
  private persistentStorageGranted = false;

  /**
   * Check current storage quota, usage, and durable persistence status.
   */
  async checkStorage(): Promise<StorageEstimateResult> {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        const quotaBytes = estimate.quota || 0;
        const usageBytes = estimate.usage || 0;
        const availableBytes = Math.max(0, quotaBytes - usageBytes);
        const usagePercent = quotaBytes > 0 ? (usageBytes / quotaBytes) * 100 : 0;

        const underPressure =
          (quotaBytes > 0 && availableBytes < SAFETY_FREE_BYTES_THRESHOLD) ||
          usagePercent >= SAFETY_USAGE_PERCENT_THRESHOLD;

        let warningMessage: string | undefined;
        if (underPressure) {
          warningMessage = `STORAGE_PRESSURE_ALERT: Browser storage is ${usagePercent.toFixed(1)}% full (${(availableBytes / 1024 / 1024).toFixed(1)}MB remaining). Destructive operations are blocked to safeguard pending business mutations.`;
        }

        let persisted = this.persistentStorageGranted;
        if (typeof navigator.storage.persisted === "function") {
          try {
            persisted = await navigator.storage.persisted();
            this.persistentStorageGranted = persisted;
          } catch { /* ignore */ }
        }

        const result: StorageEstimateResult = {
          supported: true,
          quotaBytes,
          usageBytes,
          availableBytes,
          usagePercent,
          underPressure,
          persisted,
          warningMessage,
        };

        this.underPressure = underPressure;
        this.lastEstimate = result;
        return result;
      } catch {
        /* ignore */
      }
    }

    const fallbackResult: StorageEstimateResult = {
      supported: false,
      quotaBytes: 1024 * 1024 * 1024,
      usageBytes: 0,
      availableBytes: 1024 * 1024 * 1024,
      usagePercent: 0,
      underPressure: false,
      persisted: true,
    };
    this.lastEstimate = fallbackResult;
    return fallbackResult;
  }

  /**
   * Check if the browser has promoted the origin storage to durable/persistent.
   */
  async isPersisted(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persisted === "function") {
      try {
        const persisted = await navigator.storage.persisted();
        this.persistentStorageGranted = persisted;
        return persisted;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Explicitly request durable storage from the browser via navigator.storage.persist().
   * Promotes storage from "best-effort" (evictable under disk pressure) to "persistent".
   */
  async requestPersistence(): Promise<{ supported: boolean; persisted: boolean }> {
    if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
      try {
        const persisted = await navigator.storage.persist();
        this.persistentStorageGranted = persisted;
        console.log(`[Storage] navigator.storage.persist() -> ${persisted ? "GRANTED (Persistent)" : "BEST-EFFORT"}`);
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("kwakopos:storage-persisted", {
              detail: { persisted, timestamp: new Date().toISOString() },
            }),
          );
        }
        return { supported: true, persisted };
      } catch (err) {
        console.warn("[Storage] navigator.storage.persist() error:", err);
        return { supported: true, persisted: false };
      }
    }
    return { supported: false, persisted: false };
  }

  /**
   * Automatically ensure persistent storage is enabled during client boot or session start.
   */
  async ensurePersistentStorage(): Promise<{ supported: boolean; persisted: boolean }> {
    const alreadyPersisted = await this.isPersisted();
    if (alreadyPersisted) {
      return { supported: true, persisted: true };
    }
    return this.requestPersistence();
  }

  isUnderPressure(): boolean {
    return this.underPressure;
  }

  getLastEstimate(): StorageEstimateResult | null {
    return this.lastEstimate;
  }

  assertSafeForDestructiveOperation(operationName: string): void {
    if (this.underPressure) {
      throw new Error(
        `STORAGE_PRESSURE_BLOCKED: Refusing to perform ${operationName} because available browser storage is critically low. Business records are preserved.`,
      );
    }
  }
}

export const globalStoragePressureMonitor = new StoragePressureMonitor();
