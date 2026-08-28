import { describe, it, expect } from "vitest";
import { SaccoVicobaOperatingEngine } from "../../packages/domain/src/saccoVicobaEngine.js";
import { runSaccoVicobaCertification } from "../../scripts/certification/runSaccoVicobaCertification.js";
import { renderSaccoVicobaDashboard } from "../../apps/web/src/saccoVicobaDashboard.js";
import { globalSaccoVicobaService } from "../../apps/api/src/services/saccoVicobaService.js";
import type { TenantContext, SaccoMember } from "@kwakopos2/contracts";

describe("SACCO & VICOBA Operating System Full 46-Pillar Test Suite", () => {
  const engine = new SaccoVicobaOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["LOAN_OFFICER"],
    permissions: ["SACCO_LOAN_APPLY"],
  };

  it("should return valid SACCO & VICOBA manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("sacco_vicoba_operating_system");
    expect(manifest.orgType).toBe("HYBRID");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.requireKycBeforeLoan).toBe(true);
    expect(settings.defaultMaxLoanMultiplierOfSavings).toBe(3.0);
  });

  it("should evaluate loan eligibility strictly: Active status, Share Capital & 3.0x Savings Multiplier", () => {
    const activeMember: SaccoMember = {
      id: "m1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      memberNumber: "MBR-001",
      fullName: "Subira Hamisi",
      phone: "+255712345678",
      idType: "NIDA",
      idNumber: "19900101-12345-00001-12",
      shareBalanceTzs: 100000,
      savingsBalanceTzs: 1000000,
      status: "ACTIVE",
      registeredAt: "2025-01-01",
    };

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);

    // Eligible: Requested 2.5M TZS (within 3.0M limit)
    const res1 = engine.evaluateLoanEligibility(activeMember, 2500000, settings);
    expect(res1.eligible).toBe(true);
    expect(res1.maxAllowedAmountTzs).toBe(3000000);

    // Ineligible: Requested 4.0M TZS (exceeds 3.0M limit)
    const res2 = engine.evaluateLoanEligibility(activeMember, 4000000, settings);
    expect(res2.eligible).toBe(false);
    expect(res2.reasons[0]).toContain("exceeds max allowed limit");
  });

  it("should allocate repayment using deterministic waterfall: Penalty -> Interest -> Principal", () => {
    // Paid: 150,000 TZS. Due: Penalty 10,000, Interest 40,000, Principal 200,000
    const alloc = engine.allocateRepayment(150000, 10000, 40000, 200000);
    expect(alloc.penaltyAllocationTzs).toBe(10000);
    expect(alloc.interestAllocationTzs).toBe(40000);
    expect(alloc.principalAllocationTzs).toBe(100000); // Remaining 100,000 applied to principal
    expect(alloc.overpaymentTzs).toBe(0);
  });

  it("should reconcile VICOBA meeting cash in hand: Inflows - Outflows", () => {
    // Contributions 500k, Social Fund 50k, Fines 10k, Repayments 200k, Loans Issued 400k -> Net Cash: 360k
    const rec = engine.reconcileVicobaMeeting(500000, 50000, 10000, 200000, 400000);
    expect(rec.totalInflowsTzs).toBe(760000);
    expect(rec.totalOutflowsTzs).toBe(400000);
    expect(rec.netCashInHandTzs).toBe(360000);

    // Deficit attempt -> Exception thrown
    expect(() => engine.reconcileVicobaMeeting(100000, 0, 0, 0, 500000)).toThrow("VICOBA Reconciliation Deficit!");
  });

  it("should run 46-Point SACCO & VICOBA OS Certification Campaign", async () => {
    const cert = await runSaccoVicobaCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(46);
  });

  it("should render Super Admin & Member SACCO HTML Dashboard", () => {
    const html = renderSaccoVicobaDashboard();
    expect(html).toContain("KwakoPos Digital SACCO & VICOBA Command Center");
    expect(html).toContain("MEMBER LOAN PORTFOLIO & REPAYMENT STATUS");
  });

  it("should process loan application through globalSaccoVicobaService", () => {
    const member = globalSaccoVicobaService.registerMember(dummyCtx, {
      fullName: "Juma Bakari",
      phone: "+255789123456",
      idType: "NIDA",
      idNumber: "19880505-54321-00002-99",
      shareBalanceTzs: 100000,
      savingsBalanceTzs: 2000000,
    });

    const result = globalSaccoVicobaService.applyLoan(dummyCtx, {
      memberId: member.id,
      productName: "Business Development Loan",
      principalTzs: 4000000, // 4.0M TZS (within 3.0x savings = 6.0M TZS)
      interestRatePct: 12.0,
      termMonths: 12,
    });

    expect(result.eligibility.eligible).toBe(true);
    expect(result.loan).toBeDefined();
    expect(result.loan?.principalTzs).toBe(4000000);
    expect(result.loan?.status).toBe("DISBURSED");

    const loans = globalSaccoVicobaService.getLoans(dummyCtx);
    expect(loans.length).toBeGreaterThan(0);
  });
});
