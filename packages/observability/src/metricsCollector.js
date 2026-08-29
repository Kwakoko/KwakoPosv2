"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalMetrics = exports.MetricsCollector = void 0;
class MetricsCollector {
    httpRequests = [];
    rumEvents = [];
    businessCounters = new Map();
    maxHistorySize = 10000;
    recordHttpRequest(metric) {
        this.httpRequests.push(metric);
        if (this.httpRequests.length > this.maxHistorySize) {
            this.httpRequests.shift();
        }
    }
    recordRumEvent(event) {
        this.rumEvents.push(event);
        if (this.rumEvents.length > this.maxHistorySize) {
            this.rumEvents.shift();
        }
    }
    incrementCounter(name, delta = 1) {
        const current = this.businessCounters.get(name) || 0;
        this.businessCounters.set(name, current + delta);
    }
    getCounter(name) {
        return this.businessCounters.get(name) || 0;
    }
    getHttpMetricsSummary(sinceMs = 300000) {
        const cutoff = Date.now() - sinceMs;
        const recent = this.httpRequests.filter((r) => r.timestamp >= cutoff);
        if (recent.length === 0) {
            return {
                totalRequests: 0,
                errorCount4xx: 0,
                errorCount5xx: 0,
                errorRate: 0,
                successRate: 100,
                p50LatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
            };
        }
        let errorCount4xx = 0;
        let errorCount5xx = 0;
        const latencies = [];
        for (const req of recent) {
            latencies.push(req.durationMs);
            if (req.statusCode >= 500)
                errorCount5xx++;
            else if (req.statusCode >= 400)
                errorCount4xx++;
        }
        latencies.sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
        const totalErrors = errorCount4xx + errorCount5xx;
        const errorRate = (totalErrors / recent.length) * 100;
        const successRate = ((recent.length - errorCount5xx) / recent.length) * 100;
        return {
            totalRequests: recent.length,
            errorCount4xx,
            errorCount5xx,
            errorRate: Number(errorRate.toFixed(2)),
            successRate: Number(successRate.toFixed(2)),
            p50LatencyMs: Number(p50.toFixed(2)),
            p95LatencyMs: Number(p95.toFixed(2)),
            p99LatencyMs: Number(p99.toFixed(2)),
        };
    }
    getRumMetricsSummary(sinceMs = 300000) {
        const cutoff = Date.now() - sinceMs;
        const recent = this.rumEvents.filter((e) => e.timestamp >= cutoff);
        let errorCount = 0;
        let offlineTransitions = 0;
        const fcpList = [];
        const lcpList = [];
        for (const e of recent) {
            if (e.eventType === "js-error")
                errorCount++;
            if (e.eventType === "offline-transition")
                offlineTransitions++;
            if (e.eventType === "web-vitals") {
                if (typeof e.data.fcp === "number")
                    fcpList.push(e.data.fcp);
                if (typeof e.data.lcp === "number")
                    lcpList.push(e.data.lcp);
            }
        }
        fcpList.sort((a, b) => a - b);
        lcpList.sort((a, b) => a - b);
        const medianFcp = fcpList.length > 0 ? fcpList[Math.floor(fcpList.length * 0.5)] : 0;
        const medianLcp = lcpList.length > 0 ? lcpList[Math.floor(lcpList.length * 0.5)] : 0;
        return {
            totalEvents: recent.length,
            errorCount,
            offlineTransitions,
            medianFcpMs: medianFcp,
            medianLcpMs: medianLcp,
        };
    }
    getTenantHttpMetricsSummary(tenantId, sinceMs = 300000) {
        const cutoff = Date.now() - sinceMs;
        const recent = this.httpRequests.filter((r) => r.timestamp >= cutoff && r.tenantId === tenantId);
        if (recent.length === 0) {
            return {
                tenantId,
                totalRequests: 0,
                errorCount4xx: 0,
                errorCount5xx: 0,
                errorRate: 0,
                successRate: 100,
                p50LatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
            };
        }
        let errorCount4xx = 0;
        let errorCount5xx = 0;
        const latencies = [];
        for (const req of recent) {
            latencies.push(req.durationMs);
            if (req.statusCode >= 500)
                errorCount5xx++;
            else if (req.statusCode >= 400)
                errorCount4xx++;
        }
        latencies.sort((a, b) => a - b);
        const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
        const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
        const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
        const totalErrors = errorCount4xx + errorCount5xx;
        const errorRate = (totalErrors / recent.length) * 100;
        const successRate = ((recent.length - errorCount5xx) / recent.length) * 100;
        return {
            tenantId,
            totalRequests: recent.length,
            errorCount4xx,
            errorCount5xx,
            errorRate: Number(errorRate.toFixed(2)),
            successRate: Number(successRate.toFixed(2)),
            p50LatencyMs: Number(p50.toFixed(2)),
            p95LatencyMs: Number(p95.toFixed(2)),
            p99LatencyMs: Number(p99.toFixed(2)),
        };
    }
    getTenantRumMetricsSummary(tenantId, sinceMs = 300000) {
        const cutoff = Date.now() - sinceMs;
        const recent = this.rumEvents.filter((e) => e.timestamp >= cutoff && e.tenantId === tenantId);
        let errorCount = 0;
        let offlineTransitions = 0;
        const fcpList = [];
        const lcpList = [];
        for (const e of recent) {
            if (e.eventType === "js-error")
                errorCount++;
            if (e.eventType === "offline-transition")
                offlineTransitions++;
            if (e.eventType === "web-vitals") {
                if (typeof e.data.fcp === "number")
                    fcpList.push(e.data.fcp);
                if (typeof e.data.lcp === "number")
                    lcpList.push(e.data.lcp);
            }
        }
        fcpList.sort((a, b) => a - b);
        lcpList.sort((a, b) => a - b);
        const medianFcp = fcpList.length > 0 ? fcpList[Math.floor(fcpList.length * 0.5)] : 0;
        const medianLcp = lcpList.length > 0 ? lcpList[Math.floor(lcpList.length * 0.5)] : 0;
        return {
            tenantId,
            totalEvents: recent.length,
            errorCount,
            offlineTransitions,
            medianFcpMs: medianFcp,
            medianLcpMs: medianLcp,
        };
    }
    clear() {
        this.httpRequests = [];
        this.rumEvents = [];
        this.businessCounters.clear();
    }
}
exports.MetricsCollector = MetricsCollector;
exports.globalMetrics = new MetricsCollector();
//# sourceMappingURL=metricsCollector.js.map