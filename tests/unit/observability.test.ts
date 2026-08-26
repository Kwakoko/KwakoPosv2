import { describe, it, expect, beforeEach } from "vitest";
import {
  createTraceContext,
  sanitizeTelemetryData,
  defaultLogger,
  globalMetrics,
  globalIncidentEngine,
  globalReconciliationEngine,
  globalSyncMonitor,
  globalTenantHealthScorer,
  globalSloEvaluator,
  globalRegressionAnalyzer,
} from "@kwakopos2/observability";

describe("KwakoPos Production Observability Platform Suite", () => {
  beforeEach(() => {
    globalMetrics.clear();
    globalIncidentEngine.clear();
    globalSyncMonitor.clear();
  });

  describe("1. Distributed Tracing & Sensitive Data Sanitization", () => {
    it("creates a standardized trace context and generates cryptographic trace/span IDs", () => {
      const ctx = createTraceContext({
        tenantId: "tenant-trace-01",
        branchId: "branch-trace-01",
        userId: "user-trace-01",
        operationId: "op-trace-01",
      });

      expect(ctx.traceId).toBeDefined();
      expect(ctx.spanId).toBeDefined();
      expect(ctx.requestId).toBeDefined();
      expect(ctx.tenantId).toBe("tenant-trace-01");
      expect(ctx.appVersion).toBe("2.0.0");
    });

    it("strictly sanitizes sensitive fields (passwords, tokens, keys, card numbers) from telemetry payloads", () => {
      const rawPayload = {
        email: "merchant@kwakopos.com",
        password: "super-secret-password-123",
        accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive",
        refreshToken: "refresh-token-plain",
        creditCard: "4111-2222-3333-4444",
        nested: {
          apiKey: "sk_live_secretkey999",
          normalField: "safe value",
        },
      };

      const sanitized = sanitizeTelemetryData(rawPayload);
      expect(sanitized.email).toBe("merchant@kwakopos.com");
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.refreshToken).toBe("[REDACTED]");
      expect(sanitized.creditCard).toBe("[REDACTED]");
      expect(sanitized.nested.apiKey).toBe("[REDACTED]");
      expect(sanitized.nested.normalField).toBe("safe value");
    });
  });

  describe("2. Real-Time Metrics Aggregator & Latency Percentiles", () => {
    it("computes p50, p95, and p99 latency percentiles and error rates", () => {
      // Simulate 100 requests with varied durations
      for (let i = 1; i <= 100; i++) {
        globalMetrics.recordHttpRequest({
          route: "/products",
          method: "GET",
          statusCode: i === 99 || i === 100 ? 500 : 200,
          durationMs: i * 2, // 2ms to 200ms
          timestamp: Date.now(),
        });
      }

      const summary = globalMetrics.getHttpMetricsSummary();
      expect(summary.totalRequests).toBe(100);
      expect(summary.errorCount5xx).toBe(2);
      expect(summary.errorRate).toBe(2);
      expect(summary.successRate).toBe(98);
      expect(summary.p50LatencyMs).toBeGreaterThanOrEqual(98);
      expect(summary.p95LatencyMs).toBeGreaterThanOrEqual(188);
      expect(summary.p99LatencyMs).toBeGreaterThanOrEqual(196);
    });
  });

  describe("3. Automated Inventory Reconciler & Incident Generation", () => {
    it("automatically creates a CRITICAL incident when stock ledger anomalies or orphan adjustments are detected", async () => {
      const result = await globalReconciliationEngine.reconcileTenantBranch(
        "tenant-recon-01",
        "branch-recon-01",
        [
          {
            id: "var-1",
            tenantId: "tenant-recon-01",
            branchId: "branch-recon-01",
            productId: "p1",
            name: "V1",
            sku: "SKU-1",
            barcode: null,
            price: 10,
            costPrice: 5,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        [], // Empty ledger -> 0 stock
        [
          {
            id: "adj-orphan-01",
            tenantId: "tenant-recon-01",
            branchId: "branch-recon-01",
            variantId: "var-1",
            adjustmentType: "INCREASE",
            quantityChange: 50,
            reason: "Orphaned",
            referenceNote: null,
            status: "COMPLETED",
            createdByUserId: "u1",
            deviceId: "d1",
            operationId: "op-1",
            idempotencyKey: "orphan-key-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        new Map([["var-1", 50]]) // Reported 50, ledger 0
      );

      expect(result.status).toBe("ANOMALIES_DETECTED");
      expect(result.orphanAdjustments).toContain("adj-orphan-01");
      expect(result.discrepancies).toHaveLength(1);

      const activeIncidents = globalIncidentEngine.getActiveIncidents("tenant-recon-01");
      expect(activeIncidents).toHaveLength(1);
      expect(activeIncidents[0].severity).toBe("CRITICAL");
      expect(activeIncidents[0].title).toContain("Inventory Ledger Discrepancy");
    });
  });

  describe("4. Sync Operations & Dead-Letter Health Monitor", () => {
    it("flags WARNING or CRITICAL when sync failure rates or outbox age exceed thresholds", () => {
      // 10 failures out of 10 events -> 100% failure rate
      for (let i = 0; i < 10; i++) {
        globalSyncMonitor.recordSyncEvent({
          tenantId: "tenant-sync-01",
          branchId: "branch-sync-01",
          deviceId: "dev-01",
          operationId: `op-sync-${i}`,
          entityType: "Product",
          status: "FAILED",
          durationMs: 120,
          errorReason: "Schema mismatch",
          timestamp: Date.now(),
        });
      }

      const summary = globalSyncMonitor.getSummary();
      expect(summary.totalFailed).toBe(10);
      expect(summary.failureRate).toBe(100);
      expect(summary.healthStatus).toBe("CRITICAL");
      expect(globalSyncMonitor.getDeadLetters("tenant-sync-01")).toHaveLength(10);
    });
  });

  describe("5. Tenant Reliability Scoring Engine", () => {
    it("calculates Tenant Reliability Score and categorizes tiers accurately", () => {
      const healthy = globalTenantHealthScorer.computeTenantScore({
        tenantId: "tenant-healthy",
        apiSuccessRate: 100,
        syncSuccessRate: 100,
        inventoryIntegrity: 100,
        medianLatencyMs: 35,
        activeIncidentCount: 0,
      });
      expect(healthy.reliabilityScore).toBe(100);
      expect(healthy.healthTier).toBe("HEALTHY");

      const degraded = globalTenantHealthScorer.computeTenantScore({
        tenantId: "tenant-degraded",
        apiSuccessRate: 98,
        syncSuccessRate: 99,
        inventoryIntegrity: 100,
        medianLatencyMs: 400,
        activeIncidentCount: 0,
      });
      expect(degraded.healthTier).toBe("DEGRADED");

      const critical = globalTenantHealthScorer.computeTenantScore({
        tenantId: "tenant-critical",
        apiSuccessRate: 90,
        syncSuccessRate: 85,
        inventoryIntegrity: 90,
        medianLatencyMs: 800,
        activeIncidentCount: 2,
      });
      expect(critical.healthTier).toBe("CRITICAL");
      expect(critical.reliabilityScore).toBeLessThan(60);
    });
  });

  describe("6. Production SLO & Release Regression Analyzer", () => {
    it("evaluates comprehensive production SLOs", () => {
      const slo = globalSloEvaluator.evaluateProductionSlos({
        availabilityPercent: 99.95,
        apiSuccessPercent: 99.9,
        syncSuccessPercent: 100,
        currentP95LatencyMs: 120,
        inventoryIntegrityPercent: 100,
        tenantIsolationViolationCount: 0,
        dataLossIncidentCount: 0,
      });

      expect(slo.overallCompliance).toBe("PASS");
      expect(slo.targets.availability.status).toBe("COMPLIANT");
      expect(slo.targets.inventoryIntegrity.status).toBe("COMPLIANT");
      expect(slo.targets.tenantIsolationViolations.status).toBe("COMPLIANT");
    });

    it("triggers RED status and ROLLBACK decision when critical regressions are detected", () => {
      const report = globalRegressionAnalyzer.analyzeReleaseRegression(
        {
          revisionName: "kwakopos-rev-current",
          gitSha: "current-sha-999",
          errorRatePercent: 8.5,
          p95LatencyMs: 650,
          syncFailureRatePercent: 4.2,
          incidentCount: 1,
        },
        {
          revisionName: "kwakopos-rev-previous",
          gitSha: "prev-sha-888",
          errorRatePercent: 0.2,
          p95LatencyMs: 45,
          syncFailureRatePercent: 0.1,
          incidentCount: 0,
        }
      );

      expect(report.status).toBe("RED");
      expect(report.decision).toBe("TRIGGER_ROLLBACK");
      expect(report.reasons.length).toBeGreaterThan(0);
    });
  });

  describe("7. Tenant-Level Metrics & Incident Resolution Lifecycle", () => {
    it("filters HTTP and RUM telemetry by tenant correctly", () => {
      globalMetrics.recordHttpRequest({
        route: "/products",
        method: "GET",
        statusCode: 200,
        durationMs: 40,
        tenantId: "tenant-alpha",
        timestamp: Date.now(),
      });
      globalMetrics.recordHttpRequest({
        route: "/products",
        method: "GET",
        statusCode: 500,
        durationMs: 90,
        tenantId: "tenant-beta",
        timestamp: Date.now(),
      });

      const alphaHttp = globalMetrics.getTenantHttpMetricsSummary("tenant-alpha");
      expect(alphaHttp.totalRequests).toBe(1);
      expect(alphaHttp.errorCount5xx).toBe(0);
      expect(alphaHttp.successRate).toBe(100);

      const betaHttp = globalMetrics.getTenantHttpMetricsSummary("tenant-beta");
      expect(betaHttp.totalRequests).toBe(1);
      expect(betaHttp.errorCount5xx).toBe(1);
      expect(betaHttp.successRate).toBe(0);
    });

    it("creates, searches, and resolves incidents with full audit trail", async () => {
      const inc = await globalIncidentEngine.createIncident({
        title: "High Latency Warning",
        description: "P95 latency exceeded 600ms",
        severity: "WARNING",
        tenantId: "tenant-alpha",
        service: "api-gateway",
      });

      expect(inc.id).toBeDefined();
      expect(inc.status).toBe("DETECTED");

      const found = globalIncidentEngine.searchIncidents({
        tenantId: "tenant-alpha",
        severity: "WARNING",
      });
      expect(found).toHaveLength(1);

      const resolved = globalIncidentEngine.resolveIncident(
        inc.id,
        "Scaled up Cloud Run instances to resolve contention",
        "ops-admin"
      );
      expect(resolved).not.toBeNull();
      expect(resolved?.status).toBe("RESOLVED");
      expect(resolved?.resolvedAt).toBeDefined();
      expect(resolved?.timeline.length).toBe(2);
      expect(resolved?.timeline[1].actor).toBe("ops-admin");
    });
  });
});