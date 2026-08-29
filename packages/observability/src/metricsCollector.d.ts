export interface HttpRequestMetric {
    route: string;
    method: string;
    statusCode: number;
    durationMs: number;
    tenantId?: string;
    timestamp: number;
}
export interface RumEventMetric {
    eventType: "web-vitals" | "api-latency" | "js-error" | "pwa-state" | "offline-transition" | "sync-metrics" | "outbox-depth";
    tenantId?: string;
    branchId?: string;
    deviceId?: string;
    data: Record<string, unknown>;
    timestamp: number;
}
export declare class MetricsCollector {
    private httpRequests;
    private rumEvents;
    private businessCounters;
    private maxHistorySize;
    recordHttpRequest(metric: HttpRequestMetric): void;
    recordRumEvent(event: RumEventMetric): void;
    incrementCounter(name: string, delta?: number): void;
    getCounter(name: string): number;
    getHttpMetricsSummary(sinceMs?: number): {
        totalRequests: number;
        errorCount4xx: number;
        errorCount5xx: number;
        errorRate: number;
        successRate: number;
        p50LatencyMs: number;
        p95LatencyMs: number;
        p99LatencyMs: number;
    };
    getRumMetricsSummary(sinceMs?: number): {
        totalEvents: number;
        errorCount: number;
        offlineTransitions: number;
        medianFcpMs: number;
        medianLcpMs: number;
    };
    getTenantHttpMetricsSummary(tenantId: string, sinceMs?: number): {
        tenantId: string;
        totalRequests: number;
        errorCount4xx: number;
        errorCount5xx: number;
        errorRate: number;
        successRate: number;
        p50LatencyMs: number;
        p95LatencyMs: number;
        p99LatencyMs: number;
    };
    getTenantRumMetricsSummary(tenantId: string, sinceMs?: number): {
        tenantId: string;
        totalEvents: number;
        errorCount: number;
        offlineTransitions: number;
        medianFcpMs: number;
        medianLcpMs: number;
    };
    clear(): void;
}
export declare const globalMetrics: MetricsCollector;
//# sourceMappingURL=metricsCollector.d.ts.map