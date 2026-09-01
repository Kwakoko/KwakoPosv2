import { describe, it, expect } from "vitest";
import { GlobalExpansionEngine } from "@kwakopos2/domain";
import { runGlobalExpansionCertification } from "../../scripts/certification/global-expansion-certification-engine.js";

describe("Phase 20 — Global Expansion (KGF) Test Suite", () => {
  const engine = new GlobalExpansionEngine();

  it("should resolve reference country pack for Tanzania (TZ) and expansion packs (KE, UG)", () => {
    const tzPack = engine.getCountryPack("TZ");
    expect(tzPack.countryCode).toBe("TZ");
    expect(tzPack.isReferenceMarket).toBe(true);
    expect(tzPack.currencyCode).toBe("TZS");
    expect(tzPack.vatRatePct).toBe(18.0);

    const kePack = engine.getCountryPack("KE");
    expect(kePack.currencyCode).toBe("KES");
    expect(kePack.vatRatePct).toBe(16.0);
  });

  it("should perform historical rate-preserving currency conversion", () => {
    const record = engine.convertCurrency({
      transactionId: "TX-101",
      tenantBaseCurrency: "TZS",
      transactionCurrency: "USD",
      transactionAmount: 50,
      exchangeRateUsed: 2600.0,
    });
    expect(record.convertedAmountBaseCurrency).toBe(130000);
    expect(record.exchangeRateUsed).toBe(2600.0);
  });

  it("should calculate parameterized country tax for tax-inclusive pricing", () => {
    const tzTax = engine.calculateCountryTax({
      amount: 11800,
      countryCode: "TZ",
      taxCategory: "STANDARD_VAT",
    });
    expect(tzTax.taxAmount).toBe(1800);
    expect(tzTax.netAmount).toBe(10000);
    expect(tzTax.grossAmount).toBe(11800);
  });

  it("should evaluate 15-criteria Country Market Readiness Gate", () => {
    const gate = engine.evaluateCountryMarketReadiness({
      legalReviewPassed: true,
      taxReviewPassed: true,
      paymentReadinessPassed: true,
      currencyReadinessPassed: true,
      languageReadinessPassed: true,
      privacyDataReviewPassed: true,
      hostingResidencyPassed: true,
      industryAssessmentPassed: true,
      securityAssessmentPassed: true,
      operationalReadinessPassed: true,
      supportReadinessPassed: true,
      partnerReadinessPassed: true,
      pilotValidationPassed: true,
      commercialValidationPassed: true,
      zeroCodeForkVerified: true,
    });
    expect(gate.all15CriteriaPassed).toBe(true);
  });

  it("should pass 100% of the 55-Pillar Global Expansion certification campaign", () => {
    const cert = runGlobalExpansionCertification();
    expect(cert.totalPillars).toBe(55);
    expect(cert.passedPillars).toBe(55);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
