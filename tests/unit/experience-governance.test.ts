import { describe, expect, it } from "vitest";
import { KWAKOKO_EXPERIENCE_GOVERNANCE, getExperienceGovernance } from "../../packages/config/src/experienceGovernance.js";

describe("Kwakoko experience governance", () => {
  it("defines the canonical governance authority", () => {
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.authority).toBe("Kwakoko Experience Integrity Registry");
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.version).toBe("1.0.0");
  });

  it("covers all required experience layers", () => {
    for (const layer of ["brand", "voice", "visual", "ui", "interaction", "function", "localization", "ai-agent"]) {
      expect(KWAKOKO_EXPERIENCE_GOVERNANCE.governedLayers).toContain(layer);
    }
  });

  it("requires all canonical brand authorities", () => {
    expect(Object.keys(KWAKOKO_EXPERIENCE_GOVERNANCE.requiredAuthorities)).toHaveLength(5);
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.requiredAuthorities.voice).toContain("brandVoice.ts");
  });

  it("fails closed for explicit interaction integrity violations", () => {
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.uiFunctionIntegrity.failClosedForExplicitViolations).toBe(true);
  });

  it("protects future AI implementations", () => {
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.aiRules.length).toBeGreaterThanOrEqual(5);
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.aiRules.join(" ")).toMatch(/roadmap capability/i);
  });

  it("defines a release certificate", () => {
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.releaseCertificate.id).toBe("KWAKOKO-EXPERIENCE-CERTIFICATE-v1.0");
    expect(KWAKOKO_EXPERIENCE_GOVERNANCE.releaseCertificate.requiredGates).toContain("experience-governance");
  });

  it("returns the authoritative registry", () => {
    expect(getExperienceGovernance()).toBe(KWAKOKO_EXPERIENCE_GOVERNANCE);
  });
});
