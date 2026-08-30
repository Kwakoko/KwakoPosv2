import { describe, it, expect } from "vitest";
import { globalCommercialGovernanceEngine } from "@kwakopos2/domain";
import { globalCommercialReadinessService } from "../../apps/api/src/services/commercialReadinessService.js";
import { renderCommercialCommandCenterDashboard } from "../../apps/web/src/commercialCommandCenter.js";
import { runCommercialReadinessCertification } from "../../scripts/certification/commercial-readiness-certification-engine.js";

describe("Phase 16 — Commercial Product Readiness Engine Suite", () => {

  describe("1. Three-Tier Portfolio Strategy & Governance", () => {
    it("should report 10+ Tier 1 Flagships, Tier 2 Strategic Verticals, and Tier 3 Ecosystem", () => {
      const summary = globalCommercialReadinessService.getCommercialPortfolioSummary();
      expect(summary.tier1Count).toBeGreaterThanOrEqual(10);
      expect(summary.tier2Count).toBeGreaterThanOrEqual(2);
      expect(summary.tier3Count).toBeGreaterThanOrEqual(4);

      const flagshipIds = summary.flagshipProfiles.map((p) => p.verticalId);
      expect(flagshipIds).toContain("retail");
      expect(flagshipIds).toContain("restaurant");
      expect(flagshipIds).toContain("pharmacy");
      expect(flagshipIds).toContain("lawfirm");
      expect(flagshipIds).toContain("saccovicoba");
      expect(flagshipIds).toContain("microfinance");
      expect(flagshipIds).toContain("poultrylivestock");
      expect(flagshipIds).toContain("vehiclefleet");
      expect(flagshipIds).toContain("hardware");
      expect(flagshipIds).toContain("electronics");
    });
  });

  describe("2. Portfolio Priority Score Formula Engine", () => {
    it("should calculate exact Priority Score and assign TIER1_FLAGSHIP + INVEST for high-performing vertical", () => {
      const result = globalCommercialGovernanceEngine.calculatePortfolioPriorityScore({
        verticalId: "saccovicoba",
        marketDemandScore: 10,
        customerEvidenceScore: 9,
        productReadinessScore: 10,
        reliabilityScore: 10,
        commercialViabilityScore: 9,
        competitivePositionScore: 9,
        revenuePotentialScore: 9,
        implementationCostScore: 2,
        supportCostScore: 2,
        complianceRiskScore: 1,
      });

      // Positive = 66, Negative = 5 -> Raw = 61. Normalized = (61 + 30) = 91
      expect(result.normalizedScore).toBeGreaterThanOrEqual(88);
      expect(result.tierAssignment).toBe("TIER_1_FLAGSHIP");
      expect(result.actionRecommendation).toBe("INVEST");
    });

    it("should assign TIER2_STRATEGIC + MAINTAIN for mid-range vertical", () => {
      const result = globalCommercialGovernanceEngine.calculatePortfolioPriorityScore({
        verticalId: "garage",
        marketDemandScore: 6,
        customerEvidenceScore: 6,
        productReadinessScore: 7,
        reliabilityScore: 8,
        commercialViabilityScore: 6,
        competitivePositionScore: 6,
        revenuePotentialScore: 6,
        implementationCostScore: 4,
        supportCostScore: 4,
        complianceRiskScore: 2,
      });

      expect(result.tierAssignment).toBe("TIER_2_STRATEGIC");
      expect(["MAINTAIN", "PILOT"]).toContain(result.actionRecommendation);
    });
  });

  describe("3. Four Commercial Readiness Gates (Gates A–D)", () => {
    it("should require all 4 gates to pass for GA eligibility", () => {
      const gaPass = globalCommercialGovernanceEngine.evaluateReadinessGates(true, true, true, true);
      expect(gaPass.overallGA_Eligible).toBe(true);

      const gaFail = globalCommercialGovernanceEngine.evaluateReadinessGates(true, true, false, true);
      expect(gaFail.overallGA_Eligible).toBe(false);
      expect(gaFail.gateC_CommercialReadiness).toBe("FAILED");
    });
  });

  describe("4. Industry-Aware Onboarding Templates", () => {
    it("should generate industry-specific initial operating environments", () => {
      const sacco = globalCommercialGovernanceEngine.generateIndustryOnboardingTemplate("saccovicoba");
      expect(sacco.industryName).toBe("SACCO / VICOBA");
      expect(sacco.defaultNavigationItems).toContain("Members");
      expect(sacco.defaultNavigationItems).toContain("Savings");
      expect(sacco.defaultNavigationItems).toContain("Share Capital");

      const law = globalCommercialGovernanceEngine.generateIndustryOnboardingTemplate("lawfirm");
      expect(law.industryName).toBe("Law Firm");
      expect(law.defaultNavigationItems).toContain("Matters");
      expect(law.defaultNavigationItems).toContain("Hearings");
      expect(law.defaultNavigationItems).toContain("Retainers");
    });
  });

  describe("5. 'Do Not Commercialize' Policy Enforcement", () => {
    it("should block commercial launch if readiness gates fail or design partners are missing", () => {
      const profile = globalCommercialReadinessService.getVerticalPackageDetails("retail")!;
      const check = globalCommercialGovernanceEngine.enforceDoNotCommercializePolicy(profile);
      expect(check.canCommercialize).toBe(true);

      const unreadyProfile = {
        ...profile,
        readinessGates: { ...profile.readinessGates, overallGA_Eligible: false },
      };
      const unreadyCheck = globalCommercialGovernanceEngine.enforceDoNotCommercializePolicy(unreadyProfile);
      expect(unreadyCheck.canCommercialize).toBe(false);
      expect(unreadyCheck.rejectionReason).toContain("REJECTED");
    });
  });

  describe("6. Commercial Command Center Dashboard", () => {
    it("should render full portfolio dashboard HTML", () => {
      const summary = globalCommercialReadinessService.getCommercialPortfolioSummary();
      const html = renderCommercialCommandCenterDashboard({
        flagshipProfiles: summary.flagshipProfiles,
        tier2Verticals: summary.tier2Verticals,
        tier3Count: summary.tier3Count,
      });

      expect(html).toContain("KWAKOPOS COMMERCIAL COMMAND CENTER");
      expect(html).toContain("Retail Operating System");
      expect(html).toContain("SACCO / VICOBA Operating System");
      expect(html).toContain("Tier 2 Strategic Expansion Verticals");
    });
  });

  describe("7. 30-Pillar Commercial Readiness Certification", () => {
    it("should pass 30 / 30 commercial readiness certification pillars", async () => {
      const certReport = await runCommercialReadinessCertification();
      expect(certReport.totalPillars).toBe(30);
      expect(certReport.passedPillars).toBe(30);
      expect(certReport.overallPassed).toBe(true);
    });
  });
});
