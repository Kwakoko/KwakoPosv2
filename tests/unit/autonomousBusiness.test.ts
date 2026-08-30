import { describe, it, expect, beforeEach } from "vitest";
import { AutonomousBusinessEngine } from "@kwakopos2/domain";

describe("Phase 42 — KwakoPos Autonomous Business OS (KABO v1.0.0)", () => {
  let engine: AutonomousBusinessEngine;

  beforeEach(() => {
    engine = new AutonomousBusinessEngine();
  });

  it("should configure policy, trigger actions under limits, handle approval gating, and enforce kill switch", () => {
    const p = engine.configurePolicy({
      policyId: "POL-T1", tenantId: "TEN-01", agentRole: "FRAUD_CONTAINER",
      maxFinancialLimitTzs: 5000000, requiresHumanApprovalAboveTzs: 1000000,
    });
    expect(p.success).toBe(true);

    const act1 = engine.triggerAutonomousAction({
      actionId: "ACT-1", tenantId: "TEN-01", agentRole: "FRAUD_CONTAINER",
      targetEntityId: "USR-BAD", actionDescription: "Isolate suspicious login user",
      financialImpactTzs: 0,
    });
    expect(act1.action?.state).toBe("EXECUTED");

    const act2 = engine.triggerAutonomousAction({
      actionId: "ACT-2", tenantId: "TEN-01", agentRole: "FRAUD_CONTAINER",
      targetEntityId: "PAY-99", actionDescription: "Refund fraudulent transaction",
      financialImpactTzs: 2000000,
    });
    expect(act2.action?.state).toBe("PROPOSED");

    engine.approveAction("ACT-2", "USR-SOC");

    engine.activateTenantKillSwitch("TEN-01", "USR-SOC");
    const act3 = engine.triggerAutonomousAction({
      actionId: "ACT-3", tenantId: "TEN-01", agentRole: "FRAUD_CONTAINER",
      targetEntityId: "ACC-1", actionDescription: "Freeze account",
      financialImpactTzs: 100000,
    });
    expect(act3.success).toBe(false);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.isGlobalKillSwitchActive).toBe(true);
  });
});
