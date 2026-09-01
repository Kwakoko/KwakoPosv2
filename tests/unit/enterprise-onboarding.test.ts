import { describe, it, expect } from "vitest";
import { EnterpriseOnboardingEngine } from "@kwakopos2/domain";
import { runEnterpriseOnboardingCertification } from "../../scripts/certification/enterprise-onboarding-certification-engine.js";

describe("Phase 18 — Enterprise Customer Onboarding (KEIF) Test Suite", () => {
  const engine = new EnterpriseOnboardingEngine();

  it("should validate sequential onboarding stage transitions and enforce gating rules", () => {
    const dummyProject: any = {
      projectId: "P1",
      discoveryProfile: { approvedByCustomer: false },
    };

    // Transition directly from SALES_HANDOFF to SOLUTION_DESIGN should fail
    const invalidSkip = engine.validateStageTransition("SALES_HANDOFF", "SOLUTION_DESIGN", dummyProject);
    expect(invalidSkip.valid).toBe(false);

    // Sequential transition from SALES_HANDOFF to DISCOVERY
    const validNext = engine.validateStageTransition("SALES_HANDOFF", "DISCOVERY", dummyProject);
    expect(validNext.valid).toBe(true);
  });

  it("should calculate Data Readiness Score and block migration if score < 70", () => {
    const poorQuality = engine.calculateDataReadinessScore({
      totalSourceRows: 1000,
      validRows: 600,
      duplicateRows: 200,
      invalidIdentifierRows: 150,
      inconsistentUomRows: 100,
    });
    expect(poorQuality.dataReadinessScore).toBeLessThan(70);
    expect(poorQuality.classification).toBe("MIGRATION_BLOCKED");
    expect(poorQuality.cleansingActionRequired.length).toBeGreaterThan(0);
  });

  it("should perform business-level migration reconciliation for row count and financial balances", () => {
    const recon = engine.reconcileMigrationData(
      { rowCount: 1000, inventoryValueUsd: 50000, openingBalanceUsd: 120000 },
      { rowCount: 1000, inventoryValueUsd: 50000, openingBalanceUsd: 120000 }
    );
    expect(recon.reconciliationStatus).toBe("MATCHED");
    expect(recon.inventoryValueVarianceUsd).toBe(0);
  });

  it("should certify 10-point enterprise integrations", () => {
    const cert = engine.certifyIntegration("SAP ERP", "SAP S/4HANA");
    expect(cert.all10TestsPassed).toBe(true);
    expect(cert.certificationStatus).toBe("CERTIFIED");
  });

  it("should pass 100% of the 40-Pillar Enterprise Onboarding certification campaign", () => {
    const cert = runEnterpriseOnboardingCertification();
    expect(cert.totalPillars).toBe(40);
    expect(cert.passedPillars).toBe(40);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
