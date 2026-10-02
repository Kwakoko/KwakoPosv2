import { ComplianceEngine } from "@kwakopos2/domain";

export interface ComplianceCertificationPillar {
  id: string;
  description: string;
  test: (engine: ComplianceEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: ComplianceEngine) => boolean): ComplianceCertificationPillar {
  return { id, description, test };
}

export const COMPLIANCE_CERTIFICATION_PILLARS: ComplianceCertificationPillar[] = [
  makePillar("CMP-01", "KwakoPos Compliance Operating Layer (KCAOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("CMP-02", "Evaluating TRA EFDms rule registers COMPLIANT status", e => {
    const r = e.evaluateRule({
      ruleId: "R-CERT-01", tenantId: "CERT", framework: "TRA_EFDMS_TZ",
      ruleName: "Fiscal Receipt Signing", description: "All receipts signed with TRA EFDms key",
      status: "COMPLIANT",
    });
    return Boolean(r.success && r.rule?.status === "COMPLIANT");
  }),
  makePillar("CMP-03", "Appending audit records builds cryptographic hash chain", e => {
    e.appendAuditRecord("CERT", "FINANCE", "INVOICE_CREATE", "USR-01", "INV-100");
    e.appendAuditRecord("CERT", "FINANCE", "PAYMENT_ALLOCATE", "USR-01", "PAY-200");
    return Boolean(e.verifyAuditChain("CERT") === true);
  }),
  makePillar("CMP-04", "Health summary reports verified audit log chain status", e => {
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.auditLogChainVerified === true && hs.totalAuditRecordsCount >= 2);
  }),
  makePillar("CMP-05", "Health summary tracks total evaluated compliance rules", e => {
    return e.getHealthSummary("CERT").totalRulesCount >= 1;
  })
];
