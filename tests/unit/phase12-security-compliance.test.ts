import { describe, it, expect } from "vitest";
import { getKwakoPosSecurityBaseline } from "../../scripts/security/kisb-security-baseline.js";
import { getComplianceControlMatrix } from "../../scripts/security/compliance-control-matrix.js";
import { getEnterpriseSecurityRiskRegister } from "../../scripts/security/enterprise-risk-register.js";
import { runIncidentResponseTabletopDrills } from "../../scripts/security/incident-response-runner.js";
import { runAuditIntegrityCheck, AuditLogIntegrityEngine } from "../../scripts/security/audit-log-integrity-engine.js";
import { runVulnerabilityManagementScan } from "../../scripts/security/vulnerability-management-engine.js";
import { runPrivilegedAccessRecertification } from "../../scripts/security/privileged-access-manager.js";
import { runSecurityCertificationEngine } from "../../scripts/security/security-certification-engine.js";

describe("KwakoPos Phase 12 Security & Compliance Certification Suite", () => {
  it("1. validates KwakoPos Information Security Baseline (KISB) controls", () => {
    const baseline = getKwakoPosSecurityBaseline();
    expect(baseline.totalControls).toBe(15);
    expect(baseline.evidencedControlsCount).toBe(15);
    expect(baseline.controls.every((c) => c.status === "IMPLEMENTED_AND_EVIDENCED")).toBe(true);
  });

  it("2. verifies Compliance Control Matrix & assessment readiness governance state", () => {
    const matrix = getComplianceControlMatrix();
    expect(matrix.assessmentReadinessState).toBe("Security Controls Implemented and Assessment-Ready");
    expect(matrix.prohibitedClaimsNotice).toContain("Prohibited from asserting ISO 27001 Certified or SOC 2 Certified");
    expect(matrix.mappings.length).toBeGreaterThanOrEqual(15);
  });

  it("3. checks Enterprise Risk Register mitigations", () => {
    const risks = getEnterpriseSecurityRiskRegister();
    expect(risks.totalMaterialRisks).toBe(7);
    expect(risks.criticalRisksMitigated).toBe(7);
  });

  it("4. executes Incident Response tabletop drills", () => {
    const ir = runIncidentResponseTabletopDrills();
    expect(ir.simulatedDrillsCount).toBe(6);
    expect(ir.overallPassed).toBe(true);
  });

  it("5. validates cryptographic SHA-256 audit log hash chaining and tampering detection", () => {
    const auditCheck = runAuditIntegrityCheck();
    expect(auditCheck.verified).toBe(true);
    expect(auditCheck.totalAuditRecords).toBe(2);
    expect(auditCheck.chainDigest).toContain("sha256:");

    // Test tamper detection
    const engine = new AuditLogIntegrityEngine();
    const rec1 = engine.appendEvent({
      tenantId: "T1", branchId: "B1", actorId: "U1", role: "ADMIN",
      timestamp: new Date().toISOString(), action: "TEST", resource: "RES",
      deviceId: "D1", operationId: "O1", idempotencyKey: "I1", outcome: "SUCCESS", securityClassification: "CONFIDENTIAL",
    });

    // Deliberately tamper record
    (rec1 as any).action = "TAMPERED_ACTION";
    const verification = engine.verifyChainIntegrity();
    expect(verification.chainIntact).toBe(false);
  });

  it("6. checks Vulnerability Management SLAs", () => {
    const vuln = runVulnerabilityManagementScan();
    expect(vuln.openCriticalCount).toBe(0);
    expect(vuln.openHighCount).toBe(0);
    expect(vuln.overallPassed).toBe(true);
  });

  it("7. verifies Privileged Access Management (PAM) recertification", () => {
    const pam = runPrivilegedAccessRecertification();
    expect(pam.orphanedOrExcessiveCount).toBe(0);
    expect(pam.overallPassed).toBe(true);
  });

  it("8. executes full Phase 12 Security Certification Engine (100% Assessment-Ready)", async () => {
    const res = await runSecurityCertificationEngine();
    expect(res.passed).toBe(true);
    expect(res.package.scorePercentage).toBe(100);
    expect(res.package.assessmentReadinessState).toBe("Security Controls Implemented and Assessment-Ready");
  });
});
