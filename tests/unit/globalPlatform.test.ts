import { describe, it, expect, beforeEach } from "vitest";
import { GlobalPlatformEngine } from "@kwakopos2/domain";

describe("Phase 41 — KwakoPos Global Platform OS (KGPA v1.0.0)", () => {
  let engine: GlobalPlatformEngine;

  beforeEach(() => {
    engine = new GlobalPlatformEngine();
  });

  it("should register country packs, convert currencies, and enforce data residency policies", () => {
    const cp = engine.registerCountryPack({
      countryCode: "RW", countryName: "Rwanda", region: "EAST_AFRICA",
      defaultCurrency: "RWF", defaultLanguage: "rw", taxEngineVersion: "RRA_EBM_v2",
      fiscalComplianceCode: "RRA_EBM", supportedPaymentGateways: ["BK_MONEY"],
    });
    expect(cp.success).toBe(true);

    engine.setCurrencyRate({
      rateId: "R-TZS-USD", baseCurrency: "USD", targetCurrency: "TZS", exchangeRate: 2600.0,
    });
    const c = engine.convertCurrency(50, "USD", "TZS");
    expect(c.convertedAmount).toBe(130000);

    engine.configureResidencyPolicy({
      policyId: "POL-1", tenantId: "TEN-01", dataCategory: "PII",
      primaryRegion: "EAST_AFRICA", allowCrossBorderTransfer: false, complianceStandard: "STRICT",
    });

    const res = engine.evaluateCrossBorderTransfer("TEN-01", "PII", "NORTH_AMERICA");
    expect(res.allowed).toBe(false);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.activeCountryPacksCount).toBe(3);
  });
});
