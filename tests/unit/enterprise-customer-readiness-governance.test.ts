import { describe, expect, it } from "vitest";
import { KWAKOKO_ENTERPRISE_CUSTOMER_READINESS_GOVERNANCE as G } from "../../packages/config/src/enterpriseCustomerReadinessGovernance.js";

describe("Kwakoko Enterprise Customer Readiness Governance", () => {
  it("defines the governed enterprise lifecycle", () => {
    expect(G.lifecycle).toContain("DISCOVER");
    expect(G.lifecycle).toContain("MIGRATE");
    expect(G.lifecycle).toContain("GO_LIVE");
    expect(G.lifecycle).toContain("HYPERCARE");
    expect(G.lifecycle).toContain("EXPAND");
  });

  it("requires the existing 40-pillar onboarding campaign", () => {
    expect(G.thresholds.onboardingPillarsRequired).toBe(40);
    expect(G.thresholds.migrationReadinessMinPct).toBe(70);
    expect(G.thresholds.integrationCertificationPoints).toBe(10);
    expect(G.thresholds.goLiveCriteriaRequired).toBe(10);
  });

  it("requires zero tolerance for critical go-live defects and tenant isolation violations", () => {
    expect(G.thresholds.criticalDefectsAllowedAtGoLive).toBe(0);
    expect(G.thresholds.tenantIsolationViolationsAllowed).toBe(0);
    expect(G.thresholds.unresolvedP0IncidentsAllowed).toBe(0);
  });

  it("binds enterprise readiness to prior governance authorities", () => {
    expect(G.authorities.securityGovernance).toContain("securityTrustGovernance");
    expect(G.authorities.privacyGovernance).toContain("privacyDataGovernance");
    expect(G.authorities.reliabilityGovernance).toContain("productionReliabilityGovernance");
    expect(G.authorities.performanceGovernance).toContain("performanceScaleGovernance");
    expect(G.authorities.commercialGovernance).toContain("commercialProductReadinessGovernance");
  });

  it("requires the enterprise certificate to fail closed", () => {
    expect(G.certification.requiredChecks).toBe(39);
    expect(G.certification.failClosed).toBe(true);
    expect(G.certification.certificate).toBe("KWAKOKO-ENTERPRISE-CUSTOMER-READINESS-CERTIFICATE-v1.0");
  });

  it("requires real evidence rather than simulated customer claims", () => {
    expect(G.invariants.some((x) => /controlled exercises.*real customer production evidence/i.test(x))).toBe(true);
    expect(G.invariants.some((x) => /success metrics.*evidence/i.test(x))).toBe(true);
  });
});
