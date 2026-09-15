import { describe, expect, it } from "vitest";
import { KWAKOKO_AI_AGENT_GOVERNANCE } from "../../packages/config/src/aiAgentGovernance.js";

describe("Kwakoko AI product-agent governance", () => {
  it("defines the required governance authorities", () => {
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.version).toBe("1.0.0");
    expect(Object.keys(KWAKOKO_AI_AGENT_GOVERNANCE.canonicalAuthorities)).toEqual([
      "brandHierarchy", "positioning", "visualIdentity", "voice", "koko", "experience", "designSystem", "workflow", "aiAgent",
    ]);
  });

  it("requires closed-loop product and security rules", () => {
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.mandatoryRules).toEqual(expect.arrayContaining([
      expect.stringContaining("UI → Action → Route → Service → Persistence → Permission → Outcome"),
      expect.stringContaining("tenant isolation"),
      expect.stringContaining("permission boundary"),
      expect.stringContaining("offline outbox"),
    ]));
  });

  it("requires fail-closed release convergence", () => {
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.certification.failClosed).toBe(true);
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.certification.certificate).toBe("KWAKOKO-AI-AGENT-CERTIFICATE-v1.0");
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.requiredReleaseGates).toEqual([
      "brand:verify", "design:verify", "experience:verify", "workflow:verify", "ai-governance:verify", "test:unit", "build",
    ]);
  });

  it("defines browser runtime boundaries", () => {
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.prohibitedBrowserImports).toContain("node:fs");
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.prohibitedBrowserImports).toContain("node:child_process");
  });

  it("prohibits governance bypass markers", () => {
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.prohibitedGovernanceBypasses).toContain("SKIP_GOVERNANCE");
    expect(KWAKOKO_AI_AGENT_GOVERNANCE.prohibitedGovernanceBypasses).toContain("DISABLE_GOVERNANCE");
  });
});
