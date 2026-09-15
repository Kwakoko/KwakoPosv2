import { describe, expect, it } from "vitest";
import { KWAKOKO_INTEGRATION_API_ECOSYSTEM_GOVERNANCE as G } from "@kwakopos2/config";

describe("Step 18 — Integration & API Ecosystem Governance", () => {
  it("defines a versioned ecosystem lifecycle", () => {
    expect(G.version).toBe("1.0.0");
    expect(G.lifecycle).toContain("PUBLISH");
    expect(G.lifecycle).toContain("DEPRECATE");
  });
  it("requires tenant-safe integration and credential boundaries", () => {
    expect(G.invariants.some((x) => /tenant identity/i.test(x))).toBe(true);
    expect(G.invariants.some((x) => /Credentials MUST never/i.test(x))).toBe(true);
  });
  it("requires webhook and retry safety", () => {
    expect(G.invariants.some((x) => /Webhook signatures/i.test(x))).toBe(true);
    expect(G.invariants.some((x) => /idempotent/i.test(x))).toBe(true);
  });
  it("defines API performance and compatibility budgets", () => {
    expect(G.budgets.apiP95Ms).toBe(500);
    expect(G.budgets.apiP99Ms).toBe(1000);
    expect(G.budgets.compatibilityWindowMajorVersions).toBeGreaterThanOrEqual(1);
  });
  it("converges with prior enterprise and commercial governance", () => {
    expect(G.authorities.enterprise).toContain("enterpriseCustomerReadinessGovernance");
    expect(G.authorities.commercial).toContain("commercialProductReadinessGovernance");
  });
  it("is fail-closed with a canonical certificate", () => {
    expect(G.certification.failClosed).toBe(true);
    expect(G.certification.certificate).toBe("KWAKOKO-INTEGRATION-API-ECOSYSTEM-CERTIFICATE-v1.0");
  });
});
