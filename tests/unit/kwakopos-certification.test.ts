import { describe, it, expect } from "vitest";
import { KwakoPosCertificationEngine } from "@kwakopos2/domain";
import { runKwakoPosCertificationProgram } from "../../scripts/certification/kwakopos-certification-program-engine.js";

describe("Phase 23 — KwakoPos Certification Program (KCA) Test Suite", () => {
  const engine = new KwakoPosCertificationEngine();

  it("should issue evidence-backed certification record when all mandatory evidence passes", () => {
    const cert = engine.issueCertification({
      category: "KWAKOPOS_CERTIFIED_RELEASE",
      level: "VERIFIED",
      subjectName: "KwakoPos Release v2.5.0",
      subjectVersion: "v2.5.0",
      scopeDescription: "Core POS + Monorepo",
      gitSha: "285a98b",
      artifactDigest: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      evidenceSet: [
        {
          evidenceId: "EVI-01",
          evidenceType: "TEST_SUITE",
          summary: "1,139 Control Pillars Certified",
          passed: true,
          evidenceHash: "HASH-01",
          recordedAt: new Date().toISOString(),
        },
      ],
      approvedBy: "Lead Auditor",
    });

    expect(cert.certificationId.startsWith("KCA-CERT-")).toBe(true);
    expect(cert.status).toBe("ACTIVE");
  });

  it("should reject certification when evidence is missing or contains failed evidence items", () => {
    expect(() => {
      engine.issueCertification({
        category: "KWAKOPOS_CERTIFIED_PLUGIN",
        level: "FOUNDATION",
        subjectName: "Unverified Plugin",
        subjectVersion: "v0.1.0",
        scopeDescription: "Test",
        evidenceSet: [],
        approvedBy: "Auditor",
      });
    }).toThrow("Certification rejected: Missing mandatory evidence set.");

    expect(() => {
      engine.issueCertification({
        category: "KWAKOPOS_CERTIFIED_PLUGIN",
        level: "FOUNDATION",
        subjectName: "Failing Plugin",
        subjectVersion: "v0.1.0",
        scopeDescription: "Test",
        evidenceSet: [
          {
            evidenceId: "EVI-FAIL",
            evidenceType: "TENANT_ISOLATION",
            summary: "Cross-tenant leakage detected",
            passed: false,
            evidenceHash: "HASH-FAIL",
            recordedAt: new Date().toISOString(),
          },
        ],
        approvedBy: "Auditor",
      });
    }).toThrow("Certification rejected due to failed evidence");
  });

  it("should generate verifiable cryptographic badge for active certification", () => {
    const cert = engine.issueCertification({
      category: "KWAKOPOS_CERTIFIED_INTEGRATION",
      level: "ENTERPRISE",
      subjectName: "Tax Gateway Adapter",
      subjectVersion: "v1.0.0",
      scopeDescription: "EFDMS Tax Integration",
      evidenceSet: [
        {
          evidenceId: "EVI-TAX",
          evidenceType: "FINANCIAL_RECONCILIATION",
          summary: "Zero drift tax reconciliation",
          passed: true,
          evidenceHash: "HASH-TAX",
          recordedAt: new Date().toISOString(),
        },
      ],
      approvedBy: "Ecosystem Lead",
    });

    const badge = engine.generateBadge(cert.certificationId);
    expect(badge.badgeId.startsWith("BADGE-")).toBe(true);
    expect(badge.cryptographicSignature.startsWith("SIG-KCA-")).toBe(true);
  });

  it("should perform certification impact analysis on code/schema changes", () => {
    const impact = engine.analyzeImpact({ changedComponent: "TenantIsolationPolicy", changeRiskLevel: "CRITICAL" });
    expect(impact.requiredRecertificationScope).toBe("FULL");
  });

  it("should pass 100% of the 48-Pillar KwakoPos Certification Program campaign", () => {
    const cert = runKwakoPosCertificationProgram();
    expect(cert.totalPillars).toBe(48);
    expect(cert.passedPillars).toBe(48);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
