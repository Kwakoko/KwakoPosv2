import { describe, it, expect, beforeEach } from "vitest";
import { SecurityEngine } from "@kwakopos2/domain";

describe("Phase 41 — KwakoPos Security OS (KSROL v1.0.0)", () => {
  let engine: SecurityEngine;

  beforeEach(() => {
    engine = new SecurityEngine();
  });

  it("should configure policy, detect threat, mitigate threat, and block malicious IP", () => {
    const p = engine.configurePolicy({
      policyId: "POL-T1", tenantId: "TEN-01", policyName: "HQ Policy",
      requireMfa: true, ipWhitelist: ["192.168.1.50"], maxLoginAttempts: 5,
      sessionTimeoutMinutes: 30, passwordMinLength: 12,
    });
    expect(p.success).toBe(true);

    const t = engine.logThreatEvent({
      eventId: "EVT-SEC-1", tenantId: "TEN-01", threatType: "BRUTE_FORCE",
      riskLevel: "HIGH", sourceIp: "198.51.100.4", details: "Failed password attempts",
    });
    expect(t.success).toBe(true);

    const m = engine.mitigateThreat("EVT-SEC-1", "USR-SOC");
    expect(m.event?.isMitigated).toBe(true);

    engine.blockIp("TEN-01", "198.51.100.4", "USR-SOC");
    expect(engine.isIpBlocked("TEN-01", "198.51.100.4")).toBe(true);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
  });
});
