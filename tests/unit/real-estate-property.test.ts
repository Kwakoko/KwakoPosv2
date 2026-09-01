import { describe, it, expect } from "vitest";
import { RealEstateEngine } from "@kwakopos2/domain";
import { runRealEstateCertification } from "../../scripts/certification/real-estate-certification-engine.js";

describe("Advanced Real Estate & Property Management Engine Tests", () => {
  const engine = new RealEstateEngine();

  it("should validate unit status state machine transitions correctly", () => {
    expect(engine.validateUnitStatusTransition("AVAILABLE", "RESERVED")).toBe(true);
    expect(engine.validateUnitStatusTransition("AVAILABLE", "NOTICE_GIVEN")).toBe(false);
  });

  it("should calculate rent escalation accurately", () => {
    expect(engine.calculateRentEscalation(2000, 5)).toBe(2100);
  });

  it("should generate idempotent rent invoice with correct key", () => {
    const mockLease = {
      id: "l-100",
      leaseNumber: "L-100",
      tenantId: "t-1",
      unitId: "u-1",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      monthlyBaseRentUsd: 1500,
      annualEscalationPct: 5,
      securityDepositHeldUsd: 1500,
      billingFrequencyMonths: 1,
      status: "ACTIVE" as const,
      versionNumber: 1,
      executedAt: "2026-01-01T00:00:00Z",
    };
    const inv = engine.generateIdempotentRentInvoice(mockLease, "2026-09", 100, 50);
    expect(inv.idempotencyKey).toBe("RENT-l-100-2026-09");
    expect(inv.totalInvoiceUsd).toBe(1650);
  });

  it("should reconcile security deposit balance deterministically", () => {
    const dep = engine.reconcileSecurityDeposit(3000, 500, 1000);
    expect(dep.currentBalanceUsd).toBe(1500);
  });

  it("should pass 100% of the 61-Pillar Real Estate certification campaign", () => {
    const cert = runRealEstateCertification();
    expect(cert.totalPillars).toBe(61);
    expect(cert.passedPillars).toBe(61);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
