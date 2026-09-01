import { describe, it, expect, beforeEach } from "vitest";
import { PlatformSecurityEngine } from "@kwakopos2/domain";

describe("Phase 42 — KwakoPos Security Operating Layer OS (KSOL v2.0.0)", () => {
  let engine: PlatformSecurityEngine;

  beforeEach(() => {
    engine = new PlatformSecurityEngine();
  });

  it("should trigger threat alerts, enforce cross-tenant boundaries, handle containment, and manage kill switches", () => {
    const alt = engine.triggerThreatAlert({
      alertId: "ALT-1", tenantId: "TEN-01", threatType: "API_ABUSE_ANOMALY",
      severity: "HIGH", targetResource: "/api/v1/finance/export",
    });
    expect(alt.success).toBe(true);

    const iso = engine.evaluateTenantIsolationBoundary("TEN-01", "TEN-02");
    expect(iso.isIsolated).toBe(false);
    expect(iso.violationAlertId).toBeDefined();

    const cont = engine.containIncident("ALT-1", "USR-SOC");
    expect(cont.alert?.state).toBe("CONTAINED");

    engine.activateKillSwitch("TEN-01", "GLOBAL", "USR-CISO");

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.isKillSwitchActive).toBe(true);
  });
});
