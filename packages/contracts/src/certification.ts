import { z } from "zod";

// =========================================================================
// KWAKOPOS PLATFORM CERTIFICATION PROGRAM (KPCP) CONTRACTS & SCHEMAS
// =========================================================================

export const MasterCertificationDomainEnum = z.enum([
  "P1",
  "P2",
  "P3",
  "P4",
  "P5",
  "P6",
  "P7",
  "P8",
  "P9",
  "P10",
  "Security",
  "Multi-Tenancy",
  "Finance",
  "Inventory",
  "Sync",
  "PWA",
  "Marketplace",
  "Billing",
  "Analytics",
  "AI",
  "Enterprise",
  "DR",
]);
export type MasterCertificationDomain = z.infer<typeof MasterCertificationDomainEnum>;

export const CertificationLayerEnum = z.enum([
  "Layer1_Static",
  "Layer2_Unit",
  "Layer3_Integration",
  "Layer4_EndToEnd",
  "Layer5_Production",
  "Layer6_Continuous",
]);
export type CertificationLayer = z.infer<typeof CertificationLayerEnum>;

export const CertificationLifecycleStateEnum = z.enum([
  "DISCOVERED",
  "TESTED",
  "VERIFIED",
  "CERTIFICATION_READY",
  "CERTIFIED",
  "MONITORED",
  "REVALIDATION_REQUIRED",
  "RE_CERTIFIED",
]);
export type CertificationLifecycleState = z.infer<typeof CertificationLifecycleStateEnum>;

export const CertificationRiskClassificationEnum = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
]);
export type CertificationRiskClassification = z.infer<typeof CertificationRiskClassificationEnum>;

export const BusinessFlowJourneyEnum = z.enum([
  "Retail",
  "Wholesale",
  "Restaurant",
  "Pharmacy",
  "Hardware",
  "Electronics",
]);
export type BusinessFlowJourney = z.infer<typeof BusinessFlowJourneyEnum>;

export const CrossDomainProbeEnum = z.enum([
  "Security_Finance",
  "MultiTenancy_Sync",
  "Inventory_Finance",
  "Billing_Authorization",
  "PWA_Sync_Inventory",
  "Marketplace_Security",
  "AI_TenantIsolation",
]);
export type CrossDomainProbe = z.infer<typeof CrossDomainProbeEnum>;

export const CertificationItemResultSchema = z.object({
  domain: MasterCertificationDomainEnum,
  scope: z.string(),
  layer: CertificationLayerEnum.default("Layer5_Production"),
  status: z.enum(["PASS", "FAIL"]),
  details: z.string(),
  owner: z.string().default("KPCP Certification Engine"),
  remediation: z.string().optional(),
  lastEvaluatedAt: z.string(),
});
export type CertificationItemResult = z.infer<typeof CertificationItemResultSchema>;

export const KPCPMasterScorecardSchema = z.object({
  certificationId: z.string(),
  version: z.string(),
  gitSha: z.string(),
  containerDigest: z.string().optional(),
  cloudRunRevision: z.string().optional(),
  evaluatedAt: z.string(),
  overallStatus: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED", "REVALIDATION_REQUIRED"]),
  certificationScore: z.number().min(0).max(100),
  domainsPassedCount: z.number(),
  totalDomainsCount: z.number().default(22),
  lifecycleState: CertificationLifecycleStateEnum,
  domainResults: z.record(MasterCertificationDomainEnum, CertificationItemResultSchema),
  businessFlows: z.record(BusinessFlowJourneyEnum, z.object({ passed: z.boolean(), details: z.string() })),
  crossDomainProbes: z.record(CrossDomainProbeEnum, z.object({ passed: z.boolean(), details: z.string() })),
});
export type KPCPMasterScorecard = z.infer<typeof KPCPMasterScorecardSchema>;

export const RevalidationTriggerRequestSchema = z.object({
  triggerType: z.enum([
    "CODE_CHANGE",
    "SCHEMA_MIGRATION",
    "DEPENDENCY_UPDATE",
    "INFRASTRUCTURE_CHANGE",
    "SECURITY_ALERT",
    "DISASTER_RECOVERY_TEST",
    "MANUAL_SUPER_ADMIN",
  ]),
  reason: z.string().min(1),
  affectedDomains: z.array(MasterCertificationDomainEnum).optional(),
});
export type RevalidationTriggerRequest = z.infer<typeof RevalidationTriggerRequestSchema>;
