import { describe, expect, it } from "vitest";
import { BI_ANALYTICS_GOVERNANCE as G } from "@kwakopos2/config";

describe("Step 20 — Advanced Analytics & BI Governance", () => {
  it("defines the canonical BI lifecycle", () => expect(G.lifecycle).toEqual(["PROPOSED","VALIDATED","PUBLISHED","MONITORED","DEPRECATED","RETIRED"]));
  it("defines all freshness tiers", () => expect(G.freshness).toHaveLength(4));
  it("classifies AI insight certainty", () => expect(G.insightClasses).toContain("PREDICTED"));
  it("requires evidence and tenant controls", () => {
    expect(G.requiredControls).toContain("source-lineage");
    expect(G.requiredControls).toContain("tenant-isolation");
    expect(G.requiredControls).toContain("authoritative-reconciliation");
    expect(G.requiredControls).toContain("ai-evidence");
  });
  it("binds the existing 85-pillar BI certification", () => expect(G.authorities).toContain("scripts/certification/bi-analytics-certification-engine.ts"));
  it("uses a fail-closed certificate identity", () => expect(G.certificateId).toBe("KWAKOKO-BI-ANALYTICS-CERTIFICATE-v1.0"));
});
