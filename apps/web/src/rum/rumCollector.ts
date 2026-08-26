export interface RumPayload {
  eventType: "web-vitals" | "api-latency" | "js-error" | "pwa-state" | "offline-transition" | "sync-metrics" | "outbox-depth";
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  sessionId?: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export class FrontendRumCollector {
  private queue: RumPayload[] = [];
  private endpoint = "/telemetry/rum";
  private tenantId?: string;
  private branchId?: string;
  private deviceId?: string;
  private sessionId?: string;
  private isOnline = true;

  constructor(config?: {
    endpoint?: string;
    tenantId?: string;
    branchId?: string;
    deviceId?: string;
    sessionId?: string;
  }) {
    if (config?.endpoint) this.endpoint = config.endpoint;
    this.tenantId = config?.tenantId;
    this.branchId = config?.branchId;
    this.deviceId = config?.deviceId;
    this.sessionId = config?.sessionId;
  }

  setContext(context: { tenantId?: string; branchId?: string; deviceId?: string; sessionId?: string }) {
    if (context.tenantId) this.tenantId = context.tenantId;
    if (context.branchId) this.branchId = context.branchId;
    if (context.deviceId) this.deviceId = context.deviceId;
    if (context.sessionId) this.sessionId = context.sessionId;
  }

  recordWebVitals(metrics: { fcp?: number; lcp?: number; inp?: number; cls?: number; tti?: number }) {
    this.enqueue({
      eventType: "web-vitals",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: metrics,
      timestamp: Date.now(),
    });
  }

  recordApiLatency(route: string, durationMs: number, statusCode: number) {
    this.enqueue({
      eventType: "api-latency",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: { route, durationMs, statusCode },
      timestamp: Date.now(),
    });
  }

  recordError(error: Error | string, componentStack?: string) {
    const message = typeof error === "string" ? error : error.message;
    const stack = typeof error === "string" ? undefined : error.stack;
    this.enqueue({
      eventType: "js-error",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: { message, stack, componentStack },
      timestamp: Date.now(),
    });
  }

  recordPwaState(state: "installed" | "update-ready" | "service-worker-registered" | "activated") {
    this.enqueue({
      eventType: "pwa-state",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: { state },
      timestamp: Date.now(),
    });
  }

  recordConnectionState(online: boolean) {
    this.isOnline = online;
    this.enqueue({
      eventType: "offline-transition",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: { online },
      timestamp: Date.now(),
    });
  }

  recordSyncMetrics(metrics: {
    durationMs: number;
    pushedCount: number;
    deltaCount: number;
    success: boolean;
    outboxDepth: number;
  }) {
    this.enqueue({
      eventType: "sync-metrics",
      tenantId: this.tenantId,
      branchId: this.branchId,
      deviceId: this.deviceId,
      sessionId: this.sessionId,
      data: metrics,
      timestamp: Date.now(),
    });
  }

  private enqueue(event: RumPayload) {
    this.queue.push(event);
    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  async flush(): Promise<boolean> {
    if (this.queue.length === 0) return true;
    const batch = [...this.queue];
    this.queue = [];

    try {
      if (typeof fetch !== "undefined") {
        await fetch(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: batch }),
        });
      }
      return true;
    } catch {
      // Re-queue on failure if not exceeding buffer limit
      if (this.queue.length < 100) {
        this.queue.unshift(...batch);
      }
      return false;
    }
  }

  private flushTimer?: any;

  startAutoFlush(intervalMs = 10000) {
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (typeof setInterval !== "undefined") {
      this.flushTimer = setInterval(() => {
        if (this.queue.length > 0) {
          this.flush().catch(() => {});
        }
      }, intervalMs);
    }
  }

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  installBrowserHooks() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => this.recordConnectionState(true));
      window.addEventListener("offline", () => this.recordConnectionState(false));
      window.addEventListener("error", (ev) => {
        this.recordError(ev.error || ev.message);
      });
      window.addEventListener("unhandledrejection", (ev) => {
        this.recordError(ev.reason instanceof Error ? ev.reason : String(ev.reason));
      });
    }
  }

  getQueuedEvents(): RumPayload[] {
    return [...this.queue];
  }
}

export const globalRumCollector = new FrontendRumCollector();