import { describe, it, expect } from "vitest";
import { LawFirmOperatingEngine } from "../../packages/domain/src/lawFirmEngine.js";
import { runLawFirmCertification } from "../../scripts/certification/runLawFirmCertification.js";
import { renderLawFirmDashboard } from "../../apps/web/src/lawFirmDashboard.js";
import { globalLawFirmService } from "../../apps/api/src/services/lawFirmService.js";
import type { TenantContext, LegalMatter } from "@kwakopos2/contracts";

describe("Law Firm Operating System Full 41-Pillar Test Suite", () => {
  const engine = new LawFirmOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["PARTNER"],
    permissions: ["LAWFIRM_MATTER_MANAGE"],
  };

  it("should return valid Law Firm manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("law_firm_operating_system");
    expect(manifest.supportedPracticeAreas).toContain("LITIGATION");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.requireConflictCheckBeforeMatterOpen).toBe(true);
    expect(settings.segregateClientTrustFunds).toBe(true);
  });

  it("should perform conflict of interest checks across existing clients and opposing parties", () => {
    const existingMatters: LegalMatter[] = [
      {
        id: "m1",
        tenantId: dummyCtx.tenantId,
        branchId: dummyCtx.branchId,
        matterNumber: "MAT-001",
        title: "Tanzania Bank Dispute",
        clientId: "c1",
        clientName: "Tanzania National Bank",
        practiceArea: "LITIGATION",
        responsiblePartnerId: dummyCtx.userId,
        opposingParty: "Acrobat Logistics Ltd",
        billingArrangement: "HOURLY",
        status: "ACTIVE",
        openDate: "2026-01-01",
        confidentialityLevel: "STANDARD",
      },
    ];

    // Check existing opposing party -> Conflict
    const check1 = engine.performConflictCheck(dummyCtx, "Acrobat Logistics", existingMatters);
    expect(check1.hasConflict).toBe(true);
    expect(check1.decision).toBe("DECLINED_CONFLICT_EXISTS");

    // Check clean entity -> No conflict
    const check2 = engine.performConflictCheck(dummyCtx, "Safari Minerals Co", existingMatters);
    expect(check2.hasConflict).toBe(false);
    expect(check2.decision).toBe("APPROVED_NO_CONFLICT");
  });

  it("should calculate attorney time entry billing accurately: duration * rate", () => {
    const billable = engine.calculateTimeEntryBilling(3.5, 250000, true);
    expect(billable.totalBillableTzs).toBe(875000); // 3.5 * 250,000 = 875,000 TZS

    const nonBillable = engine.calculateTimeEntryBilling(3.5, 250000, false);
    expect(nonBillable.totalBillableTzs).toBe(0);
  });

  it("should enforce strict Client Trust Account segregation and prevent negative balances", () => {
    // Deposit 10,000,000, Withdraw 2,000,000, Fees 1,000,000 -> Balance: 7,000,000 TZS
    const trustRec = engine.reconcileTrustAccount(10000000, 2000000, 1000000);
    expect(trustRec.trustBalance).toBe(7000000);
    expect(trustRec.segregated).toBe(true);

    // Negative trust attempt -> Error thrown
    expect(() => engine.reconcileTrustAccount(1000000, 2000000, 0)).toThrow("Trust Account Violation!");
  });

  it("should run 41-Point Law Firm OS Certification Campaign", async () => {
    const cert = await runLawFirmCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(41);
  });

  it("should render Super Admin & Legal Practice HTML Dashboard", () => {
    const html = renderLawFirmDashboard();
    expect(html).toContain("KwakoPos Legal Practice Command Center");
    expect(html).toContain("ACTIVE LEGAL MATTERS & COURT HEARINGS");
  });

  it("should record time entries through globalLawFirmService", () => {
    const matter = globalLawFirmService.createMatter(dummyCtx, {
      title: "Commercial Arbitration Case",
      clientId: "c-100",
      clientName: "Global Trade Corp",
      practiceArea: "ARBITRATION",
      responsiblePartnerId: dummyCtx.userId,
      billingArrangement: "HOURLY",
      confidentialityLevel: "STANDARD",
    });

    const entry = globalLawFirmService.recordTimeEntry(dummyCtx, {
      matterId: matter.id,
      attorneyName: "Advocate M. K. Lyimo",
      activityDescription: "Drafted arbitration claim statement",
      durationHours: 4.0,
      hourlyRateTzs: 300000,
      isBillable: true,
    });

    expect(entry.totalBillableTzs).toBe(1200000); // 4.0 * 300,000 = 1,200,000 TZS
    expect(entry.status).toBe("APPROVED");

    const entries = globalLawFirmService.getTimeEntries(dummyCtx);
    expect(entries.length).toBeGreaterThan(0);
  });
});
