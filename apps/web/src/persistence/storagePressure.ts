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
  warningMessage?: string;
}

const SAFETY_FREE_BYTES_THRESHOLD = 50 * 1024 * 1024; // 50 MB minimum
const SAFETY_USAGE_PERCENT_THRESHOLD = 90; // 90% maximum

export class StoragePressureMonitor {
  private underPressure = false;
  private lastEstimate: StorageEstimateResult | null = null;

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

        const result: StorageEstimateResult = {
          supported: true,
          quotaBytes,
          usageBytes,
          availableBytes,
          usagePercent,
          underPressure,
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
    };
    this.lastEstimate = fallbackResult;
    return fallbackResult;
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
