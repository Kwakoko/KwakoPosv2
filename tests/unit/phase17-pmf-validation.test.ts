import { describe, it, expect } from "vitest";
import { evaluatePmfFramework } from "../../scripts/certification/pmf-validation-engine.js";
import { runPmfValidation } from "../../scripts/certification/runPmfValidation.js";
import { renderKpcpValidationDashboard } from "../../apps/web/src/kpcpValidationDashboard.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("Phase 17 — Product-Market Validation Framework Test Suite", () => {
  it("should evaluate KwakoPos PMF Framework across priority verticals", async () => {
    const res = await evaluatePmfFramework();
    expect(res.allCriteriaPassed).toBe(true);
    expect(res.overallPmfScore).toBe(100);
    expect(res.framework.totalEvaluatedVerticals).toBeGreaterThanOrEqual(10);
    expect(res.framework.provenCount).toBeGreaterThanOrEqual(7);
  });

  it("should verify scorecard indicators and hypotheses for Tier 1 verticals", async () => {
    const res = await evaluatePmfFramework();
    const flagships = res.framework.scorecards.filter((s) => s.tier === "TIER_1_FLAGSHIP");
    expect(flagships.length).toBe(10);

    for (const scorecard of flagships) {
      expect(scorecard.activation.activationRatePct).toBeGreaterThan(80);
      expect(scorecard.firstTransaction.ttfvMinutes).toBeLessThan(60);
      expect(scorecard.retention.day30Pct).toBeGreaterThan(75);
      expect(scorecard.northStarMetric).toBeDefined();
      expect(scorecard.hypotheses.problemHypothesis).toBeDefined();
    }
  });

  it("should run full PMF Validation CLI engine and compile evidence artifact", async () => {
    const cert = await runPmfValidation();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.digest).toBeDefined();
    expect(cert.evidencePackage.digest.length).toBe(64);
  });

  it("should render Super Admin PMF Command Center visual dashboard HTML", () => {
    const html = renderKpcpValidationDashboard();
    expect(html).toContain("KwakoPos PMF Intelligence");
    expect(html).toContain("PROVEN VERTICALS");
    expect(html).toContain("Retail");
  });

  it("should expose PMF validation campaign in ReleaseService", async () => {
    const cert = await globalReleaseService.runPmfValidation();
    expect(cert.evidencePackage.overallPmfScore).toBe(100);
    expect(cert.evidencePackage.framework.scorecards.length).toBeGreaterThanOrEqual(10);
  });
});
