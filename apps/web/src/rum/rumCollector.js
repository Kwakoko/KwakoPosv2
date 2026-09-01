"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRumCollector = exports.FrontendRumCollector = void 0;
class FrontendRumCollector {
    queue = [];
    endpoint = "/telemetry/rum";
    tenantId;
    branchId;
    deviceId;
    sessionId;
    isOnline = true;
    constructor(config) {
        if (config?.endpoint)
            this.endpoint = config.endpoint;
        this.tenantId = config?.tenantId;
        this.branchId = config?.branchId;
        this.deviceId = config?.deviceId;
        this.sessionId = config?.sessionId;
    }
    setContext(context) {
        if (context.tenantId)
            this.tenantId = context.tenantId;
        if (context.branchId)
            this.branchId = context.branchId;
        if (context.deviceId)
            this.deviceId = context.deviceId;
        if (context.sessionId)
            this.sessionId = context.sessionId;
    }
    recordWebVitals(metrics) {
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
    recordApiLatency(route, durationMs, statusCode) {
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
    recordError(error, componentStack) {
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
    recordPwaState(state) {
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
    recordConnectionState(online) {
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
    recordSyncMetrics(metrics) {
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
    enqueue(event) {
        this.queue.push(event);
        if (this.queue.length >= 10) {
            this.flush();
        }
    }
    async flush() {
        if (this.queue.length === 0)
            return true;
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
        }
        catch {
            // Re-queue on failure if not exceeding buffer limit
            if (this.queue.length < 100) {
                this.queue.unshift(...batch);
            }
            return false;
        }
    }
    flushTimer;
    startAutoFlush(intervalMs = 10000) {
        if (this.flushTimer)
            clearInterval(this.flushTimer);
        if (typeof setInterval !== "undefined") {
            this.flushTimer = setInterval(() => {
                if (this.queue.length > 0) {
                    this.flush().catch(() => { });
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
    getQueuedEvents() {
        return [...this.queue];
    }
}
const globalRumCollector = new FrontendRumCollector();
exports.FrontendRumCollector = FrontendRumCollector;
exports.globalRumCollector = globalRumCollector;
export { globalRumCollector, FrontendRumCollector };
//# sourceMappingURL=rumCollector.js.map