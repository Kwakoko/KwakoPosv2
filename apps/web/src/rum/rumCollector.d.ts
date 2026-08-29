export interface RumPayload {
    eventType: "web-vitals" | "api-latency" | "js-error" | "pwa-state" | "offline-transition" | "sync-metrics" | "outbox-depth";
    tenantId?: string;
    branchId?: string;
    deviceId?: string;
    sessionId?: string;
    data: Record<string, unknown>;
    timestamp: number;
}
export declare class FrontendRumCollector {
    private queue;
    private endpoint;
    private tenantId?;
    private branchId?;
    private deviceId?;
    private sessionId?;
    private isOnline;
    constructor(config?: {
        endpoint?: string;
        tenantId?: string;
        branchId?: string;
        deviceId?: string;
        sessionId?: string;
    });
    setContext(context: {
        tenantId?: string;
        branchId?: string;
        deviceId?: string;
        sessionId?: string;
    }): void;
    recordWebVitals(metrics: {
        fcp?: number;
        lcp?: number;
        inp?: number;
        cls?: number;
        tti?: number;
    }): void;
    recordApiLatency(route: string, durationMs: number, statusCode: number): void;
    recordError(error: Error | string, componentStack?: string): void;
    recordPwaState(state: "installed" | "update-ready" | "service-worker-registered" | "activated"): void;
    recordConnectionState(online: boolean): void;
    recordSyncMetrics(metrics: {
        durationMs: number;
        pushedCount: number;
        deltaCount: number;
        success: boolean;
        outboxDepth: number;
    }): void;
    private enqueue;
    flush(): Promise<boolean>;
    private flushTimer?;
    startAutoFlush(intervalMs?: number): void;
    stopAutoFlush(): void;
    installBrowserHooks(): void;
    getQueuedEvents(): RumPayload[];
}
export declare const globalRumCollector: FrontendRumCollector;
//# sourceMappingURL=rumCollector.d.ts.map