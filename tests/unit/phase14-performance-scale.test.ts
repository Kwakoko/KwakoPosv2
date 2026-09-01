import { describe, it, expect } from "vitest";
import { runPerformanceBenchmarkSuite } from "../../scripts/certification/performance-benchmark-engine.js";
import { generateKwakoPosCapacityModel } from "../../scripts/certification/capacity-model-generator.js";
import { runPerformanceCertification } from "../../scripts/certification/runPerformanceCertification.js";
import { renderKpcpPerformanceDashboard } from "../../apps/web/src/kpcpPerformanceDashboard.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("Phase 14 — Performance & Global Scale Certification Test Suite", () => {
  it("should execute performance benchmark suite across 1x, 10x, 50x, and 100x multipliers", async () => {
    const res = await runPerformanceBenchmarkSuite();
    expect(res.allPassed).toBe(true);
    expect(res.score).toBe(100);
    expect(res.baselineMetrics.length).toBeGreaterThanOrEqual(4);
    expect(res.workload10x.length).toBeGreaterThanOrEqual(3);
    expect(res.workload50x.length).toBeGreaterThanOrEqual(3);
    expect(res.workload100x.length).toBeGreaterThanOrEqual(3);
  });

  it("should generate KwakoPos Capacity Model (KCM) with 12m-60m growth projections", () => {
    const model = generateKwakoPosCapacityModel();
    expect(model.profile.maxProducts).toBe(100000);
    expect(model.projections12m.tenants).toBe(2500);
    expect(model.projections36m.estCostPerTenantTzs).toBe(8200);
    expect(model.projections60m.tenants).toBe(150000);
    expect(model.rankedBottlenecks.length).toBe(5);
  });

  it("should run full performance certification CLI engine and output evidence artifact", async () => {
    const cert = await runPerformanceCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.digest).toBeDefined();
    expect(cert.evidencePackage.digest.length).toBe(64);
  });

  it("should render Super Admin Performance Engineering visual dashboard HTML", () => {
    const html = renderKpcpPerformanceDashboard();
    expect(html).toContain("KwakoPos Capacity & Performance Engineering Center");
    expect(html).toContain("POS CHECKOUT LATENCY");
    expect(html).toContain("100× STRESS");
  });

  it("should expose performance certification & capacity model in ReleaseService", async () => {
    const model = await globalReleaseService.getCapacityModel();
    expect(model.profile.maxBranches).toBe(1000);

    const cert = await globalReleaseService.runPerformanceCertification();
    expect(cert.evidencePackage.overallScore).toBe(100);
  });
});
