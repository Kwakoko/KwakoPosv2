import { describe, it, expect, beforeEach } from "vitest";
import { LicensingEngine } from "@kwakopos2/domain";

describe("Phase 45 — KwakoPos Licensing OS (KPLOL v1.0.0)", () => {
  let engine: LicensingEngine;

  beforeEach(() => {
    engine = new LicensingEngine();
  });

  it("should issue license, check feature entitlement, and track quota utilization", () => {
    const l = engine.issueLicense({
      licenseId: "LIC-T1", tenantId: "TEN-01", tier: "ENTERPRISE",
      validFrom: "2026-01-01", validUntil: "2026-12-31",
    });
    expect(l.success).toBe(true);

    expect(engine.checkEntitlement("TEN-01", "CUSTOM_ANALYTICS")).toBe(true);

    engine.setUsageQuota({
      tenantId: "TEN-01", metricName: "ACTIVE_USERS", currentUsage: 45, limitQuota: 50, unitName: "users",
    });

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.activeLicenseTier).toBe("ENTERPRISE");
    expect(hs.quotaUtilizationPercent).toBe(90);
  });
});
