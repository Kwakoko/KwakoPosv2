import { z } from "zod";

// ============================================================
// KWAKOPOS V2 — LEGAL, PRIVACY, DATA PROTECTION & GOVERNANCE CONTRACTS
// ============================================================

export const LegalDocumentTypeEnum = z.enum([
  "PRIVACY_POLICY",
  "DATA_PROTECTION_POLICY",
  "TERMS_OF_USE",
  "TERMS_OF_SERVICE",
  "EULA",
  "SOFTWARE_LICENSE",
  "ACCEPTABLE_USE_POLICY",
  "COOKIE_POLICY",
  "DATA_RETENTION_POLICY",
  "DPA",
  "SUBPROCESSORS",
  "SECURITY_POLICY",
  "VULNERABILITY_DISCLOSURE",
  "REFUND_CANCELLATION",
  "BILLING_TERMS",
  "SLA",
  "IP_POLICY",
  "TRADEMARK_NOTICE",
  "AI_POLICY",
  "API_TERMS",
  "BETA_TERMS",
  "DISASTER_RECOVERY",
]);
export type LegalDocumentType = z.infer<typeof LegalDocumentTypeEnum>;

export const LegalDocumentStatusEnum = z.enum([
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "SUPERSEDED",
  "ARCHIVED",
]);
export type LegalDocumentStatus = z.infer<typeof LegalDocumentStatusEnum>;

export const LegalLanguageEnum = z.enum(["en", "sw"]);
export type LegalLanguage = z.infer<typeof LegalLanguageEnum>;

export const LegalDocumentVersionSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  version: z.string(), // SemVer string e.g. "1.0.0", "2.1.0"
  status: LegalDocumentStatusEnum,
  language: LegalLanguageEnum.default("en"),
  title: z.string().min(1),
  content: z.string().min(1),
  summaryOfChanges: z.string().default("Initial published version"),
  jurisdiction: z.string().default("Tanzania (Data Protection Act 2022) / East Africa & Global"),
  effectiveAt: z.string().datetime(),
  publishedAt: z.string().datetime().nullable().default(null),
  supersedesVersion: z.string().nullable().default(null),
  isMandatoryAcceptance: z.boolean().default(true),
  cryptographicIntegrityHash: z.string(), // SHA-256 hash of (documentId + version + language + content)
  createdBy: z.string(),
  approvedBy: z.string().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LegalDocumentVersion = z.infer<typeof LegalDocumentVersionSchema>;

export const LegalDocumentSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  documentType: LegalDocumentTypeEnum,
  canonicalTitle: z.string(),
  description: z.string(),
  currentVersion: z.string(),
  isMandatory: z.boolean().default(true),
  applicableAudiences: z.array(z.string()).default(["TENANT_OWNER", "USER", "SUPER_ADMIN", "PUBLIC"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  activeVersion: LegalDocumentVersionSchema.optional(),
  history: z.array(LegalDocumentVersionSchema).optional(),
});
export type LegalDocument = z.infer<typeof LegalDocumentSchema>;

// Acceptance & Consent
export const AcceptanceMethodEnum = z.enum([
  "CLICK_WRAP",
  "REGISTRATION",
  "LOGIN_MANDATORY",
  "RE_ACCEPTANCE",
  "API",
]);
export type AcceptanceMethod = z.infer<typeof AcceptanceMethodEnum>;

export const ConsentStatusEnum = z.enum(["ACCEPTED", "WITHDRAWN"]);
export type ConsentStatus = z.infer<typeof ConsentStatusEnum>;

export const LegalAcceptanceRecordSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  tenantId: z.string(),
  documentId: z.string().uuid(),
  documentType: LegalDocumentTypeEnum,
  documentVersion: z.string(),
  language: LegalLanguageEnum,
  acceptedAt: z.string().datetime(),
  acceptanceMethod: AcceptanceMethodEnum,
  ipAddress: z.string().nullable().default(null),
  userAgent: z.string().nullable().default(null),
  sessionDeviceRef: z.string().nullable().default(null),
  locale: z.string().default("en-TZ"),
  consentStatus: ConsentStatusEnum.default("ACCEPTED"),
  consentSource: z.string().default("KWAKOPOS_WEB_PORTAL"),
  evidenceHash: z.string(), // SHA-256 of the acceptance metadata + document hash
  withdrawnAt: z.string().datetime().nullable().default(null),
  withdrawalReason: z.string().nullable().default(null),
});
export type LegalAcceptanceRecord = z.infer<typeof LegalAcceptanceRecordSchema>;

export const SubmitAcceptanceRequestSchema = z.object({
  documentId: z.string().uuid(),
  documentVersion: z.string(),
  language: LegalLanguageEnum.default("en"),
  acceptanceMethod: AcceptanceMethodEnum.default("CLICK_WRAP"),
  sessionDeviceRef: z.string().optional(),
});
export type SubmitAcceptanceRequest = z.infer<typeof SubmitAcceptanceRequestSchema>;

export const WithdrawConsentRequestSchema = z.object({
  documentId: z.string().uuid(),
  documentVersion: z.string(),
  reason: z.string().min(5),
});
export type WithdrawConsentRequest = z.infer<typeof WithdrawConsentRequestSchema>;

// Data Classification & Ownership
export const DataClassificationEnum = z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"]);
export type DataClassification = z.infer<typeof DataClassificationEnum>;

export const DataOwnershipEnum = z.enum(["PLATFORM_OWNED", "TENANT_CONTROLLED", "USER_GENERATED", "THIRD_PARTY"]);
export type DataOwnership = z.infer<typeof DataOwnershipEnum>;

export const EntityDataPolicySchema = z.object({
  entityName: z.string(),
  classification: DataClassificationEnum,
  ownership: DataOwnershipEnum,
  defaultRetentionDays: z.number().int().positive(),
  legalBasis: z.string(),
  containsPii: z.boolean(),
  exportable: z.boolean(),
  deletable: z.boolean(),
});
export type EntityDataPolicy = z.infer<typeof EntityDataPolicySchema>;

// Data Subject Rights (DSR)
export const DsrTypeEnum = z.enum([
  "ACCESS",
  "EXPORT",
  "CORRECTION",
  "DELETION",
  "RESTRICTION",
  "OBJECTION",
  "CONSENT_WITHDRAWAL",
]);
export type DsrType = z.infer<typeof DsrTypeEnum>;

export const DsrStatusEnum = z.enum([
  "SUBMITTED",
  "VERIFYING",
  "IN_REVIEW",
  "PROCESSING",
  "COMPLETED",
  "REJECTED",
]);
export type DsrStatus = z.infer<typeof DsrStatusEnum>;

export const DataSubjectRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  requesterUserId: z.string(),
  requesterEmail: z.string().email(),
  requestType: DsrTypeEnum,
  status: DsrStatusEnum.default("SUBMITTED"),
  details: z.string().default(""),
  submittedAt: z.string().datetime(),
  verificationState: z.enum(["PENDING", "VERIFIED", "FAILED"]).default("PENDING"),
  assignedTo: z.string().nullable().default(null),
  dueAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  resolution: z.string().nullable().default(null),
  exportDownloadUrl: z.string().nullable().default(null),
  exportExpiresAt: z.string().datetime().nullable().default(null),
  auditTrail: z.array(z.object({
    timestamp: z.string().datetime(),
    action: z.string(),
    actor: z.string(),
    notes: z.string(),
  })).default([]),
});
export type DataSubjectRequest = z.infer<typeof DataSubjectRequestSchema>;

export const SubmitDsrRequestSchema = z.object({
  requestType: DsrTypeEnum,
  details: z.string().max(2000).default(""),
});
export type SubmitDsrRequest = z.infer<typeof SubmitDsrRequestSchema>;

// Data Export
export const ExportFormatEnum = z.enum(["JSON", "CSV"]);
export type ExportFormat = z.infer<typeof ExportFormatEnum>;

export const DataExportJobSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  requesterUserId: z.string(),
  scope: z.enum(["TENANT_WIDE", "USER_SPECIFIC", "CUSTOMER_SPECIFIC"]),
  targetId: z.string(), // userId or customerId or tenantId
  format: ExportFormatEnum.default("JSON"),
  status: z.enum(["PENDING", "PROCESSING", "READY", "EXPIRED", "FAILED"]).default("PENDING"),
  checksumSha256: z.string().nullable().default(null),
  fileSizeBytes: z.number().int().nonnegative().default(0),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().default(null),
  downloadToken: z.string().nullable().default(null),
});
export type DataExportJob = z.infer<typeof DataExportJobSchema>;

// Data Deletion & Legal Holds
export const DeletionModeEnum = z.enum(["SOFT_DELETE", "ANONYMIZATION", "HARD_DELETE"]);
export type DeletionMode = z.infer<typeof DeletionModeEnum>;

export const LegalHoldSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  reason: z.string(),
  authority: z.string(),
  targetEntityType: z.string(),
  targetEntityId: z.string(),
  status: z.enum(["ACTIVE", "RELEASED"]).default("ACTIVE"),
  placedBy: z.string(),
  placedAt: z.string().datetime(),
  releasedAt: z.string().datetime().nullable().default(null),
  releaseNotes: z.string().nullable().default(null),
});
export type LegalHold = z.infer<typeof LegalHoldSchema>;

// Retention Policy & Job Execution
export const RetentionPolicySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().default("GLOBAL"),
  dataType: z.string(),
  retentionDays: z.number().int().positive(),
  retentionBasis: z.string(),
  archivePeriodDays: z.number().int().nonnegative().default(0),
  deletionAction: DeletionModeEnum.default("ANONYMIZATION"),
  overrideByLegalHold: z.boolean().default(true),
  jurisdiction: z.string().default("TZ_EAST_AFRICA"),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>;

export const RetentionExecutionSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  executedAt: z.string().datetime(),
  scannedCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  processedCount: z.number().int().nonnegative(),
  heldCount: z.number().int().nonnegative(),
  status: z.enum(["SUCCESS", "PARTIAL", "FAILED"]),
  evidenceSha256: z.string(),
  errorLog: z.string().nullable().default(null),
});
export type RetentionExecution = z.infer<typeof RetentionExecutionSchema>;

// Security & Privacy Incidents
export const LegalIncidentSeverityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type LegalIncidentSeverity = z.infer<typeof LegalIncidentSeverityEnum>;

export const IncidentStatusEnum = z.enum([
  "DETECTED",
  "INVESTIGATING",
  "CONTAINED",
  "REMEDIATING",
  "RESOLVED",
  "CLOSED",
]);
export type IncidentStatus = z.infer<typeof IncidentStatusEnum>;

export const SecurityPrivacyIncidentSchema = z.object({
  id: z.string().uuid(),
  incidentNumber: z.string(), // e.g. "INC-SEC-2026-001"
  incidentType: z.enum([
    "UNAUTHORIZED_ACCESS",
    "ACCIDENTAL_DISCLOSURE",
    "TENANT_ISOLATION_ANOMALY",
    "CREDENTIAL_COMPROMISE",
    "DATA_LOSS",
    "SYNCHRONIZATION_LEAKAGE",
    "MALICIOUS_ACTIVITY",
    "SUBPROCESSOR_BREACH",
    "BACKUP_EXPOSURE",
    "OTHER",
  ]),
  severity: LegalIncidentSeverityEnum,
  status: IncidentStatusEnum.default("DETECTED"),
  title: z.string(),
  summary: z.string(),
  affectedTenantId: z.string().nullable().default(null),
  affectedRecordsCount: z.number().int().nonnegative().default(0),
  affectedUsersCount: z.number().int().nonnegative().default(0),
  detectionSource: z.string(),
  detectedAt: z.string().datetime(),
  containedAt: z.string().datetime().nullable().default(null),
  remediatedAt: z.string().datetime().nullable().default(null),
  closedAt: z.string().datetime().nullable().default(null),
  containmentStrategy: z.string().default(""),
  remediationActions: z.string().default(""),
  notificationRequired: z.boolean().default(false),
  notificationSentAt: z.string().datetime().nullable().default(null),
  evidenceArtifactHash: z.string().nullable().default(null),
  auditLog: z.array(z.object({
    timestamp: z.string().datetime(),
    actor: z.string(),
    fromStatus: z.string(),
    toStatus: z.string(),
    notes: z.string(),
  })).default([]),
});
export type SecurityPrivacyIncident = z.infer<typeof SecurityPrivacyIncidentSchema>;

// Subprocessor / Third-Party Registry
export const SubprocessorSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  serviceName: z.string(),
  purpose: z.string(),
  dataCategories: z.array(z.string()),
  dataRegion: z.string(),
  dpaStatus: z.enum(["EXECUTED", "STANDARD_TERMS", "NOT_APPLICABLE"]).default("EXECUTED"),
  privacyPolicyUrl: z.string().url(),
  securityCertifications: z.array(z.string()).default(["SOC 2", "ISO 27001"]),
  isActive: z.boolean().default(true),
  notes: z.string().default(""),
});
export type Subprocessor = z.infer<typeof SubprocessorSchema>;

// OSS License Notice
export const OssLicenseNoticeSchema = z.object({
  packageName: z.string(),
  version: z.string(),
  license: z.string(),
  copyright: z.string(),
  repositoryUrl: z.string().url(),
  noticeRequirement: z.string(),
  isCompatible: z.boolean().default(true),
});
export type OssLicenseNotice = z.infer<typeof OssLicenseNoticeSchema>;

// Tenant Legal Document Customization
export const TenantLegalDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  documentType: z.enum([
    "CUSTOMER_TERMS",
    "REFUND_POLICY",
    "RETURN_POLICY",
    "DELIVERY_POLICY",
    "BUSINESS_DISCLAIMER",
    "PRIVACY_NOTICE",
  ]),
  title: z.string(),
  content: z.string(),
  version: z.string().default("1.0.0"),
  isActive: z.boolean().default(true),
  updatedAt: z.string().datetime(),
  updatedBy: z.string(),
});
export type TenantLegalDocument = z.infer<typeof TenantLegalDocumentSchema>;

// Super Admin Governance Dashboard
export const LegalGovernanceOverviewSchema = z.object({
  totalDocuments: z.number().int().nonnegative(),
  publishedDocuments: z.number().int().nonnegative(),
  draftDocuments: z.number().int().nonnegative(),
  totalAcceptances: z.number().int().nonnegative(),
  acceptanceComplianceRate: z.number().min(0).max(100),
  activeIncidents: z.number().int().nonnegative(),
  pendingDsrRequests: z.number().int().nonnegative(),
  activeLegalHolds: z.number().int().nonnegative(),
  subprocessorsCount: z.number().int().nonnegative(),
  lastRetentionRunAt: z.string().datetime().nullable(),
  cryptographicHealth: z.object({
    allHashesValid: z.boolean(),
    verifiedDocumentsCount: z.number().int().nonnegative(),
    tamperedDocumentsCount: z.number().int().nonnegative(),
  }),
});
export type LegalGovernanceOverview = z.infer<typeof LegalGovernanceOverviewSchema>;
