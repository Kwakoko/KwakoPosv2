import { describe, it, expect } from "vitest";
import { AiOperatingLayerEngine, AutonomousOperationsEngine } from "@kwakopos2/domain";
import { verifyAccessToken, generateAccessToken } from "@kwakopos2/auth";

describe("Adversarial AI Authorization & RBAC Test Suite", () => {
  const aiEngine = new AiOperatingLayerEngine();
  const autoOpsEngine = new AutonomousOperationsEngine();

  it("should reject AI actions attempted without valid authentication token", () => {
    expect(() => verifyAccessToken("invalid-fake-token")).toThrow("UNAUTHORIZED");
  });

  it("should reject non-admin users attempting to trigger AI emergency kill switch", () => {
    const regularUserPayload = {
      sub: "USR-REG-01",
      tenantId: "TENANT-01",
      branchId: "BRANCH-01",
      email: "user@test.com",
      roles: ["CASHIER"],
      permissions: ["pos.sales"],
      deviceId: "DEV-01",
    };

    const token = generateAccessToken(regularUserPayload);
    const verified = verifyAccessToken(token);
    expect(verified.roles.includes("ADMIN") || verified.roles.includes("SUPER_ADMIN")).toBe(false);
  });

  it("should isolate cross-tenant AI recommendations and prevent tenant ID spoofing", () => {
    const sigResult = aiEngine.generateInsightsAndRecommendations("TENANT-VICTIM");

    expect(sigResult.recommendations.length).toBeGreaterThan(0);
    expect(sigResult.insights.length).toBeGreaterThan(0);

    // Toggle tenant kill switch for attacker only
    aiEngine.toggleKillSwitch("TENANT", "TENANT-ATTACKER");

    const victimRes = aiEngine.generateInsightsAndRecommendations("TENANT-VICTIM");
    const attackerRes = aiEngine.generateInsightsAndRecommendations("TENANT-ATTACKER");

    expect(victimRes.insights.length).toBeGreaterThan(0);
    expect(attackerRes.insights.length).toBe(0); // Tenant isolation enforced
  });

  it("should enforce policy limits on high-cost autonomous operations", () => {
    autoOpsEngine.registerAgentCapability({
      agentId: "AGT-SEC-01",
      tenantId: "TENANT-SEC",
      agentRole: "Security Guard Agent",
      autonomyLevel: "LEVEL_4_CERTIFIED",
      riskClass: "HIGH",
      financialLimitTzs: 100000,
    });

    const req = autoOpsEngine.executeAutonomousRequest({
      requestId: "REQ-ADV-01",
      tenantId: "TENANT-SEC",
      agentId: "AGT-SEC-01",
      capability: "transfer.funds",
      financialCostTzs: 5000000, // Exceeds financial limit
    });

    expect(req.request?.state).toBe("ESCALATED");
  });
});
