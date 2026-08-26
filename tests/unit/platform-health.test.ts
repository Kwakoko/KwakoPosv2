import { describe, it, expect } from "vitest";
import { PlatformHealthEvaluator } from "../../packages/observability/src/platformHealthEvaluator.js";

describe("KwakoPos Platform Health Evaluator & Zero-Tolerance Engine", () => {
  it("calculates GREEN healthy platform status when all metrics meet SLO", () => {
    const health = PlatformHealthEvaluator.evaluateGlobalPlatformHealth({
      appVersion: "2.1.0",
      cloudRunRevision: "kwakopos-production-service-00036-qux",
      availabilityPct: 99.98,
      apiSuccessPct: 99.95,
      syncSuccessPct: 99.99,
      inventoryDivergencesCount: 0,
      orphanAdjustmentsCount: 0,
      tenantIsolationViolationsCount: 0,
      p95LatencyMs: 42,
      rumLcpMs: 820,
      dbConnectionHealth: "HEALTHY",
      syntheticTestsPassed: true,
      activeIncidentsCount: 0,
    });

    expect(health.overallStatus).toBe("GREEN");
    expect(health.overallScore).toBeGreaterThanOrEqual(95);
    expect(health.zeroToleranceBreach).toBe(false);
    expect(health.components.inventoryIntegrity.status).toBe("GREEN");
    expect(health.components.securityHealth.status).toBe("GREEN");
  });

  it("ZERO-TOLERANCE RULE: forces CRITICAL RED status on inventory stock divergence regardless of high uptime", () => {
    const health = PlatformHealthEvaluator.evaluateGlobalPlatformHealth({
      appVersion: "2.1.0",
      cloudRunRevision: "kwakopos-production-service-00036-qux",
      availabilityPct: 100.0, // perfect uptime
      apiSuccessPct: 100.0,
      syncSuccessPct: 100.0,
      inventoryDivergencesCount: 1, // CRITICAL DIVERGENCE
      orphanAdjustmentsCount: 0,
      tenantIsolationViolationsCount: 0,
      p95LatencyMs: 25,
      rumLcpMs: 500,
      dbConnectionHealth: "HEALTHY",
      syntheticTestsPassed: true,
      activeIncidentsCount: 1,
    });

    expect(health.overallStatus).toBe("RED");
    expect(health.zeroToleranceBreach).toBe(true);
    expect(health.breachReason).toContain("INVENTORY_INTEGRITY_BREACH");
    expect(health.components.inventoryIntegrity.status).toBe("RED");
  });

  it("ZERO-TOLERANCE RULE: forces CRITICAL RED status on tenant isolation violation", () => {
    const health = PlatformHealthEvaluator.evaluateGlobalPlatformHealth({
      appVersion: "2.1.0",
      cloudRunRevision: "kwakopos-production-service-00036-qux",
      availabilityPct: 100.0,
      apiSuccessPct: 99.9,
      syncSuccessPct: 99.9,
      inventoryDivergencesCount: 0,
      orphanAdjustmentsCount: 0,
      tenantIsolationViolationsCount: 1, // TENANT BREACH
      p95LatencyMs: 30,
      rumLcpMs: 600,
      dbConnectionHealth: "HEALTHY",
      syntheticTestsPassed: true,
      activeIncidentsCount: 1,
    });

    expect(health.overallStatus).toBe("RED");
    expect(health.zeroToleranceBreach).toBe(true);
    expect(health.breachReason).toContain("SECURITY_ISOLATION_BREACH");
    expect(health.components.securityHealth.status).toBe("RED");
  });
});