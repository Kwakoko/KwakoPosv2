import { describe, it, expect, beforeEach } from "vitest";
import { AutonomousOperationsEngine } from "@kwakopos2/domain";

describe("Phase 43 — KwakoPos Autonomous Operations Platform OS (KAOL v2.0.0)", () => {
  let engine: AutonomousOperationsEngine;

  beforeEach(() => {
    engine = new AutonomousOperationsEngine();
  });

  it("should register agent capabilities, execute bounded requests, handle human escalation, and verify action results", () => {
    const reg = engine.registerAgentCapability({
      agentId: "AGT-FIN-01", tenantId: "TEN-01", agentRole: "Finance Agent",
      autonomyLevel: "LEVEL_4_CERTIFIED", riskClass: "MEDIUM", financialLimitTzs: 1000000,
    });
    expect(reg.success).toBe(true);

    const req1 = engine.executeAutonomousRequest({
      requestId: "REQ-101", tenantId: "TEN-01", agentId: "AGT-FIN-01",
      capability: "payment.prepare", financialCostTzs: 500000,
    });
    expect(req1.request?.state).toBe("AUTHORIZED");

    engine.verifyActionResult("REQ-101", true);

    const req2 = engine.executeAutonomousRequest({
      requestId: "REQ-102", tenantId: "TEN-01", agentId: "AGT-FIN-01",
      capability: "payment.execute", financialCostTzs: 2500000,
    });
    expect(req2.request?.state).toBe("ESCALATED");

    engine.activateAgentKillSwitch("TEN-01", "AGT-FIN-01", "USR-ADMIN");
    const req3 = engine.executeAutonomousRequest({
      requestId: "REQ-103", tenantId: "TEN-01", agentId: "AGT-FIN-01",
      capability: "payment.prepare", financialCostTzs: 100000,
    });
    expect(req3.success).toBe(false);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.verifiedActionsCount).toBe(1);
    expect(hs.escalatedCount).toBe(1);
  });
});
