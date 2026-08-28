import { describe, it, expect } from "vitest";
import { evaluateProductionReliabilityScorecard } from "../../scripts/certification/reliability-engine.js";
import { runReliabilityCertification } from "../../scripts/certification/runReliabilityCertification.js";
import { renderKpcpReliabilityDashboard } from "../../apps/web/src/kpcpReliabilityDashboard.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("Phase 15 — Production Reliability Engineering (KPRS) Test Suite", () => {
  it("should evaluate production reliability scorecard with 10 subsystem SLIs", async () => {
    const res = await evaluateProductionReliabilityScorecard();
    expect(res.allSlosMet).toBe(true);
    expect(res.overallScore).toBe(100);
    expect(res.scorecard.overallAvailabilityPct).toBe(99.99);
    expect(res.scorecard.slis.length).toBe(10);
    expect(res.scorecard.errorBudgets.length).toBe(4);
    expect(res.scorecard.remediations.length).toBe(4);
  });

  it("should run full reliability certification CLI engine and output evidence artifact", async () => {
    const cert = await runReliabilityCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.digest).toBeDefined();
    expect(cert.evidencePackage.digest.length).toBe(64);
  });

  it("should render Super Admin Reliability visual dashboard HTML", () => {
    const html = renderKpcpReliabilityDashboard();
    expect(html).toContain("KwakoPos Site Reliability Engineering");
    expect(html).toContain("POS Checkout Availability");
    expect(html).toContain("99.99%");
  });

  it("should expose reliability certification in ReleaseService", async () => {
    const cert = await globalReleaseService.runReliabilityCertification();
    expect(cert.evidencePackage.overallScore).toBe(100);
    expect(cert.evidencePackage.scorecard.slosMet).toBe(10);
  });
});
