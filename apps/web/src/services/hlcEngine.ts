/**
 * KwakoPos V2 — Hybrid Logical Clock (HLC) & Hardware Clock Skew Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements Kulkarni et al. Hybrid Logical Clock specification with
 * Monotonic Causality and Server Offset Calibration.
 *
 * Timestamp format: `<millis>:<4-digit-counter>:<nodeId>`
 * Example: `1786940000000:0001:dev-3f9b2a`
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HlcTimestamp {
  millis: number;
  counter: number;
  nodeId: string;
}

const CLOCK_OFFSET_STORAGE_KEY = "kwakopos:v2:server-clock-offset-ms";
const DEVICE_ID_STORAGE_KEY = "kwakopos:v2:device-id";
const MAX_ALLOWED_FORWARD_DRIFT_MS = 60 * 1000;

export class HlcEngine {
  private static instance: HlcEngine;
  private latestMillis: number = 0;
  private counter: number = 0;
  private nodeId: string = "node-default";
  private clockOffsetMs: number = 0;

  private constructor() {
    if (typeof localStorage !== "undefined") {
      let devId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
      if (!devId) {
        devId = `dev-${Math.random().toString(36).substring(2, 8)}`;
        try {
          localStorage.setItem(DEVICE_ID_STORAGE_KEY, devId);
        } catch {
          /* ignore */
        }
      }
      this.nodeId = devId;

      const savedOffset = localStorage.getItem(CLOCK_OFFSET_STORAGE_KEY);
      if (savedOffset) {
        const parsed = Number(savedOffset);
        if (!isNaN(parsed)) {
          this.clockOffsetMs = parsed;
        }
      }
    }

    this.latestMillis = this.getCalibratedPhysicalTime();
  }

  public static getInstance(): HlcEngine {
    if (!HlcEngine.instance) {
      HlcEngine.instance = new HlcEngine();
    }
    return HlcEngine.instance;
  }

  public calibrateOffset(serverTimeMs: number, roundTripMs: number = 0): void {
    if (!serverTimeMs || typeof serverTimeMs !== "number" || isNaN(serverTimeMs)) return;
    const clientPhysicalNow = Date.now();
    const estimatedServerArrival = serverTimeMs + Math.floor(roundTripMs / 2);
    const newOffset = estimatedServerArrival - clientPhysicalNow;

    if (Math.abs(newOffset - this.clockOffsetMs) > 50) {
      this.clockOffsetMs = newOffset;
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(CLOCK_OFFSET_STORAGE_KEY, String(this.clockOffsetMs));
        } catch {
          /* ignore */
        }
      }
    }
  }

  public getCalibratedPhysicalTime(): number {
    return Date.now() + this.clockOffsetMs;
  }

  public getClockOffsetMs(): number {
    return this.clockOffsetMs;
  }

  public getNodeId(): string {
    return this.nodeId;
  }

  public now(): string {
    const calibratedPhysicalNow = this.getCalibratedPhysicalTime();

    if (calibratedPhysicalNow > this.latestMillis) {
      if (calibratedPhysicalNow - this.latestMillis > MAX_ALLOWED_FORWARD_DRIFT_MS && this.latestMillis > 0) {
        this.latestMillis = this.latestMillis + 1000;
        this.counter = 0;
      } else {
        this.latestMillis = calibratedPhysicalNow;
        this.counter = 0;
      }
    } else {
      this.counter++;
    }

    const counterStr = String(this.counter).padStart(4, "0");
    return `${this.latestMillis}:${counterStr}:${this.nodeId}`;
  }

  public parse(hlcString: string): HlcTimestamp | null {
    const parts = hlcString.split(":");
    if (parts.length !== 3) return null;
    const millis = Number(parts[0]);
    const counter = Number(parts[1]);
    const nodeId = parts[2];
    if (isNaN(millis) || isNaN(counter) || !nodeId) return null;
    return { millis, counter, nodeId };
  }
}

export const hlcEngine = HlcEngine.getInstance();
