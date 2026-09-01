import { z } from "zod";

// ============================================================
// Phase 43 — KwakoPos Certification Authority Contracts (KCAOL v2.0.0)
// ============================================================

export const CertificationTypeEnum = z.enum([
  "MODULE_CERTIFICATION", "PARTNER_CERTIFICATION", "HARDWARE_CERTIFICATION",
  "SECURITY_AUDIT_CERTIFICATION", "COMPLIANCE_CERTIFICATION",
]);
export type CertificationType = z.infer<typeof CertificationTypeEnum>;

export const CertificationStatusEnum = z.enum(["ISSUED", "RENEWED", "REVOKED", "EXPIRED", "UNDER_REVIEW"]);
export type CertificationStatus = z.infer<typeof CertificationStatusEnum>;

export const CertificationCertificateSchema = z.object({
  certificateId: z.string(),
  tenantId: z.string(),
  subjectEntityId: z.string(),
  certificationType: CertificationTypeEnum,
  versionScope: z.string().default("v1.0.0"),
  evidenceHash: z.string(),
  issuerId: z.string().default("KWAKO_CA_AUTHORITY"),
  issuedAt: z.string(),
  validUntil: z.string(),
  status: CertificationStatusEnum.default("ISSUED"),
});
export type CertificationCertificate = z.infer<typeof CertificationCertificateSchema>;

export const CertificationAuditProofSchema = z.object({
  proofId: z.string(),
  certificateId: z.string(),
  evidencePillarId: z.string(),
  testResult: z.enum(["PASS", "FAIL", "SKIPPED"]),
  evidencePayloadJson: z.string().default("{}"),
  timestamp: z.string(),
});
export type CertificationAuditProof = z.infer<typeof CertificationAuditProofSchema>;

export const CertificationAuthorityHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeCertificatesCount: z.number().int().nonnegative(),
  revokedCertificatesCount: z.number().int().nonnegative(),
  verifiedProofsCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type CertificationAuthorityHealthSummary = z.infer<typeof CertificationAuthorityHealthSummarySchema>;

export const CertificationAuthorityAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "CERTIFICATE_ISSUED", "CERTIFICATE_RENEWED", "CERTIFICATE_REVOKED", "PROOF_VERIFIED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type CertificationAuthorityAuditEntry = z.infer<typeof CertificationAuthorityAuditEntrySchema>;
