import { describe, it, expect } from "vitest";
import { MicrofinanceOperatingEngine } from "../../packages/domain/src/microfinanceEngine.js";
import { runMicrofinanceCertification } from "../../scripts/certification/runMicrofinanceCertification.js";
import { renderMicrofinanceDashboard } from "../../apps/web/src/microfinanceDashboard.js";
import { globalMicrofinanceService } from "../../apps/api/src/services/microfinanceService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Microfinance & Lending Operating System Full 48-Pillar Test Suite", () => {
  const engine = new MicrofinanceOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["CREDIT_OFFICER"],
    permissions: ["MICROFINANCE_LOAN_APPLY"],
  };

  it("should return valid Microfinance manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("microfinance_lending_operating_system");
    expect(manifest.supportedLendingModels).toContain("SME_LENDING");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.requireKycBeforeDisbursement).toBe(true);
    expect(settings.defaultInterestMethod).toBe("REDUCING_BALANCE");
  });

  it("should calculate affordability & credit score: DSR and risk band", () => {
    // Monthly Income 2M TZS, Expenses 600k TZS -> Disposable: 1.4M TZS. Requested installment: 400k TZS (DSR: 20%)
    const aff = engine.calculateAffordabilityAndCreditScore(2000000, 600000, 400000);
    expect(aff.disposableIncomeTzs).toBe(1400000);
    expect(aff.debtServiceRatioPct).toBe(20.0);
    expect(aff.isAffordable).toBe(true);
    expect(aff.riskCategory).toBe("LOW_RISK");
    expect(aff.creditScore).toBe(700);

    // Over-indebted borrower: Income 1M TZS, Expenses 800k TZS. Requested installment 600k TZS -> Not affordable
    const affUnaffordable = engine.calculateAffordabilityAndCreditScore(1000000, 800000, 600000);
    expect(affUnaffordable.isAffordable).toBe(false);
    expect(affUnaffordable.debtServiceRatioPct).toBe(60.0);
    expect(affUnaffordable.creditScore).toBe(580);
  });

  it("should allocate repayment using deterministic waterfall: Penalty -> Interest -> Principal", () => {
    // Paid: 300,000 TZS. Due: Penalty 20,000, Interest 80,000, Principal 500,000
    const alloc = engine.allocateRepaymentWaterfall(300000, 20000, 80000, 500000);
    expect(alloc.allocatedPenaltyTzs).toBe(20000);
    expect(alloc.allocatedInterestTzs).toBe(80000);
    expect(alloc.allocatedPrincipalTzs).toBe(200000); // Remaining 200,000 applied to principal
    expect(alloc.overpaymentTzs).toBe(0);
  });

  it("should classify portfolio arrears correctly based on days past due (DPD)", () => {
    expect(engine.classifyPortfolioArrears(0)).toBe("CURRENT");
    expect(engine.classifyPortfolioArrears(15)).toBe("WATCH");
    expect(engine.classifyPortfolioArrears(45)).toBe("PAR_30");
    expect(engine.classifyPortfolioArrears(75)).toBe("PAR_60");
    expect(engine.classifyPortfolioArrears(120)).toBe("PAR_90");
    expect(engine.classifyPortfolioArrears(200)).toBe("DEFAULT");
  });

  it("should run 48-Point Microfinance OS Certification Campaign", async () => {
    const cert = await runMicrofinanceCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(48);
  });

  it("should render Super Admin & Credit Command Center HTML Dashboard", () => {
    const html = renderMicrofinanceDashboard();
    expect(html).toContain("KwakoPos Digital Microfinance & Credit Command Center");
    expect(html).toContain("DISBURSED LOAN PORTFOLIO & REPAYMENT TRACKER");
  });

  it("should assess affordability and disburse loan through globalMicrofinanceService", () => {
    const borrower = globalMicrofinanceService.registerBorrower(dummyCtx, {
      fullName: "Kilio Agribusiness Ltd",
      phone: "+255655112233",
      nationalIdNumber: "19850303-98765-00003-88",
      borrowerType: "SME_BUSINESS",
      creditScore: 720,
    });

    const result = globalMicrofinanceService.assessAndDisburseLoan(dummyCtx, {
      borrowerId: borrower.id,
      productName: "SME Working Capital Loan",
      principalTzs: 12000000,
      interestRatePct: 15.0,
      termMonths: 12,
      monthlyIncomeTzs: 5000000,
      existingExpensesTzs: 1500000,
    });

    expect(result.affordability.isAffordable).toBe(true);
    expect(result.loan).toBeDefined();
    expect(result.loan?.principalTzs).toBe(12000000);
    expect(result.loan?.status).toBe("DISBURSED");

    const loans = globalMicrofinanceService.getLoans(dummyCtx);
    expect(loans.length).toBeGreaterThan(0);
  });
});
