import { describe, expect, it } from "vitest";
import { KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE, KWAKOKO_PLATFORM_GOVERNANCE_VERSION, PLATFORM_AUTHORITY_HIERARCHY, PLATFORM_GOVERNANCE_INVARIANTS, PLATFORM_GOVERNANCE_LIFECYCLE, PLATFORM_GOVERNANCE_RELEASE_GATES, platformGovernanceRegistry } from "@kwakopos2/config";

describe("Step 23 â€” Platform Governance Control Plane", () => {
  it("exposes the canonical lifecycle and authority hierarchy", () => {
    expect(PLATFORM_GOVERNANCE_LIFECYCLE.join("â†’")).toBe("PROPOSEâ†’ASSESSâ†’AUTHORIZEâ†’IMPLEMENTâ†’VERIFYâ†’PUBLISHâ†’MONITORâ†’EXCEPTâ†’REVIEWâ†’RETIRE");
    expect(PLATFORM_AUTHORITY_HIERARCHY.join("â†’")).toBe("GLOBAL_PLATFORMâ†’COUNTRYâ†’TENANTâ†’BRANCHâ†’USER");
  });
  it("requires permanent governance safety invariants", () => {
    expect(PLATFORM_GOVERNANCE_INVARIANTS).toContain("tenant-isolation");
    expect(PLATFORM_GOVERNANCE_INVARIANTS).toContain("segregation-of-duties");
    expect(PLATFORM_GOVERNANCE_INVARIANTS).toContain("platform-kill-switch");
    expect(PLATFORM_GOVERNANCE_INVARIANTS).toContain("evidence-bound-certification");
    expect(PLATFORM_GOVERNANCE_INVARIANTS).toContain("no-hardcoded-health-claims");
  });
  it("binds release gates to the canonical registry and certificate", () => {
    expect(KWAKOKO_PLATFORM_GOVERNANCE_VERSION).toBe("1.0.0");
    expect(KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE).toBe("KWAKOKO-PLATFORM-GOVERNANCE-CERTIFICATE-v1.0");
    expect(PLATFORM_GOVERNANCE_RELEASE_GATES.length).toBe(15);
    expect(platformGovernanceRegistry.certificateId).toBe(KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE);
  });
  it("does not allow the control plane to publish synthetic health values", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("apps/web/src/platformGovernanceCommandCenter.ts", "utf8");
    for (const claim of ["100% PASSING", "1,240 Endpoints", "48 ADRs", "25 / 100", "100.0 %"]) expect(source).not.toContain(claim);
  });
});
