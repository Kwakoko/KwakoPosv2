import { describe, it, expect } from "vitest";
import { evaluateCommercialPortfolio } from "../../scripts/certification/commercial-portfolio-engine.js";
import { runCommercialCertification } from "../../scripts/certification/runCommercialCertification.js";
import { renderKpcpCommercialDashboard } from "../../apps/web/src/kpcpCommercialDashboard.js";
import { globalReleaseService } from "../../apps/api/src/services/releaseService.js";

describe("Phase 16 — Commercial Product Readiness Test Suite", () => {
  it("should evaluate 3-tier commercial portfolio with 15 Tier 1 Flagship verticals", async () => {
    const res = await evaluateCommercialPortfolio();
    expect(res.allGatesPassed).toBe(true);
    expect(res.overallScore).toBe(100);
    expect(res.portfolio.tier1Count).toBe(15);
    expect(res.portfolio.tier2Count).toBe(2);
    expect(res.portfolio.tier3Count).toBe(1);
    expect(res.portfolio.unitEconomics.grossMarginPct).toBe(88.5);
  });


  it("should verify Readiness Gates A-D for all Tier 1 Flagship verticals", async () => {
    const res = await evaluateCommercialPortfolio();
    for (const flagship of res.portfolio.flagshipVerticals) {
      expect(flagship.gates.length).toBe(4);
      expect(flagship.gates.every((g) => g.passed)).toBe(true);
      expect(flagship.activationEvent).toBeDefined();
      expect(flagship.primaryCommercialPromise).toBeDefined();
    }
  });

  it("should run full commercial certification CLI engine and output evidence artifact", async () => {
    const cert = await runCommercialCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.digest).toBeDefined();
    expect(cert.evidencePackage.digest.length).toBe(64);
  });

  it("should render Super Admin Commercial visual dashboard HTML", () => {
    const html = renderKpcpCommercialDashboard();
    expect(html).toContain("KwakoPos Commercial Command Center");
    expect(html).toContain("TIER 1 FLAGSHIP VERTICALS");
    expect(html).toContain("Retail");
  });

  it("should expose commercial certification in ReleaseService", async () => {
    const cert = await globalReleaseService.runCommercialCertification();
    expect(cert.evidencePackage.overallScore).toBe(100);
    expect(cert.evidencePackage.portfolio.tier1Count).toBe(15);

  });
});
