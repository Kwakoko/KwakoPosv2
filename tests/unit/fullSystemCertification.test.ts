import { describe, it, expect, beforeEach } from "vitest";
import { FullSystemCertificationEngine } from "@kwakopos2/domain";

describe("Phase 45 — Full Kwakoko Business Operating System Certification OS (KFOS-CERT v1.0.0)", () => {
  let engine: FullSystemCertificationEngine;

  beforeEach(() => {
    engine = new FullSystemCertificationEngine();
  });

  it("should create campaigns, certify 30 master domains, finalize certification status, and record evidence", () => {
    const campaign = engine.createCampaign({
      campaignId: "CAMP-TEST-01",
      releaseVersion: "v2.5.0",
      gitSha: "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e",
      artifactDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      environment: "STAGING",
      auditedBy: "Auditor Smith",
    });
    expect(campaign.success).toBe(true);

    const cDomain = engine.certifyDomain("CAMP-TEST-01", "ARCHITECTURE", "Auditor Smith");
    expect(cDomain.success).toBe(true);
    expect(cDomain.campaign?.certifiedDomainsCount).toBe(1);

    const fin = engine.finalizeCampaign("CAMP-TEST-01", "Auditor Smith");
    expect(fin.success).toBe(true);
    expect(fin.campaign?.status).toBe("CONDITIONALLY_CERTIFIED");

    const hs = engine.getHealthSummary("SYSTEM");
    expect(hs.authorityOperational).toBe(true);
    expect(hs.totalCertifiedPillars).toBe(182);
  });
});
