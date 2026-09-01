import { describe, it, expect } from "vitest";
import { PlatformGovernanceEngine } from "@kwakopos2/domain";
import { runPlatformGovernanceCertification } from "../../scripts/certification/platform-governance-certification-engine.js";

describe("Phase 24 — Platform Governance (KPGA) Test Suite", () => {
  const engine = new PlatformGovernanceEngine();

  it("should create version-controlled Architecture Decision Record (ADR)", () => {
    const adr = engine.createAdr({
      title: "ADR-001: Enforce Monorepo Architecture",
      context: "Prevent codebase fragmentation across regions.",
      decision: "All country packs extend single core KwakoPos SaaS.",
      consequences: ["Improves maintainability", "Reduces security risks"],
      owner: "Chief Architect",
    });

    expect(adr.adrId.startsWith("ADR-")).toBe(true);
    expect(adr.status).toBe("ACCEPTED");
  });

  it("should evaluate API contract governance and block unannounced breaking changes", () => {
    const compliantRes = engine.evaluateApiContract({
      path: "/api/v1/sales/quotes",
      method: "POST",
      version: "v1.0.0",
      ownerDomain: "Commercial",
      hasRequestSchema: true,
      hasResponseSchema: true,
      hasDocumentation: true,
      isBreakingChange: false,
    });
    expect(compliantRes.isCompliant).toBe(true);

    const breakingRes = engine.evaluateApiContract({
      path: "/api/v1/sales/quotes",
      method: "DELETE",
      version: "v1.0.0",
      ownerDomain: "Commercial",
      hasRequestSchema: true,
      hasResponseSchema: true,
      hasDocumentation: true,
      isBreakingChange: true,
    });
    expect(breakingRes.isCompliant).toBe(false);
    expect(breakingRes.errorReason).toBe("API breaking changes require formal Deprecation Notice and Impact Analysis prior to deployment.");
  });

  it("should evaluate architecture fitness rules and detect violations", () => {
    const cleanFitness = engine.evaluateFitnessRules({
      hasUnauthorizedRawDbAccess: false,
      hasCrossTenantDataPaths: false,
      hasUndocumentedPublicApis: false,
      hasDuplicateFinancialLedgers: false,
      hasDuplicateInventoryBalances: false,
      hasUnmanagedSecrets: false,
    });
    expect(cleanFitness.passed).toBe(true);

    const violatedFitness = engine.evaluateFitnessRules({
      hasUnauthorizedRawDbAccess: true,
      hasCrossTenantDataPaths: false,
      hasUndocumentedPublicApis: false,
      hasDuplicateFinancialLedgers: false,
      hasDuplicateInventoryBalances: false,
      hasUnmanagedSecrets: false,
    });
    expect(violatedFitness.passed).toBe(false);
    expect(violatedFitness.violations.length).toBeGreaterThan(0);
  });

  it("should register feature and API deprecations in 6-stage deprecation registry", () => {
    const dep = engine.registerDeprecation({
      subjectName: "Legacy XML Gateway",
      subjectType: "SYNC_PROTOCOL",
      replacementSubject: "JSON Gateway v2",
      migrationGuideUrl: "https://docs.kwakopos.com/sync",
      owner: "Sync Team",
    });
    expect(dep.deprecationId.startsWith("DEP-")).toBe(true);
    expect(dep.deprecationStage).toBe("DEPRECATION_ANNOUNCED");
  });

  it("should pass 100% of the 58-Pillar Platform Governance certification campaign", () => {
    const cert = runPlatformGovernanceCertification();
    expect(cert.totalPillars).toBe(58);
    expect(cert.passedPillars).toBe(58);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
