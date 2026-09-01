import { z } from "zod";

// ============================================================
// Phase 38 — KwakoPos CRM Contracts (KCRML v1.0.0)
// ============================================================

// ─── 1. Enumerations ─────────────────────────────────────────

export const CustomerTypeEnum = z.enum(["INDIVIDUAL", "BUSINESS"]);
export type CustomerType = z.infer<typeof CustomerTypeEnum>;

export const CustomerStatusEnum = z.enum([
  "LEAD", "PROSPECT", "QUALIFIED", "OPPORTUNITY", "CUSTOMER", "ACTIVE", "AT_RISK", "CHURNED", "REACTIVATED",
]);
export type CustomerStatus = z.infer<typeof CustomerStatusEnum>;

export const LeadSourceEnum = z.enum([
  "WEBSITE", "REFERRAL", "PARTNER", "MARKETPLACE", "SALESPERSON", "SOCIAL", "CAMPAIGN", "EVENT", "WALK_IN", "IMPORTED", "API",
]);
export type LeadSource = z.infer<typeof LeadSourceEnum>;

export const LeadStatusEnum = z.enum([
  "NEW", "CONTACTED", "QUALIFYING", "QUALIFIED", "CONVERTED", "DISQUALIFIED",
]);
export type LeadStatus = z.infer<typeof LeadStatusEnum>;

export const OpportunityStageEnum = z.enum([
  "NEW", "QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST",
]);
export type OpportunityStage = z.infer<typeof OpportunityStageEnum>;

export const ActivityTypeEnum = z.enum([
  "CALL", "MEETING", "EMAIL", "MESSAGE", "VISIT", "DEMO", "PROPOSAL", "TASK", "TRANSACTION", "SUPPORT",
]);
export type ActivityType = z.infer<typeof ActivityTypeEnum>;

export const CaseStatusEnum = z.enum([
  "NEW", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED",
]);
export type CaseStatus = z.infer<typeof CaseStatusEnum>;

export const CasePriorityEnum = z.enum([
  "LOW", "MEDIUM", "HIGH", "URGENT",
]);
export type CasePriority = z.infer<typeof CasePriorityEnum>;

export const CaseCategoryEnum = z.enum([
  "TECHNICAL", "BILLING", "PRODUCT", "SERVICE", "COMPLAINT", "FEATURE_REQUEST",
]);
export type CaseCategory = z.infer<typeof CaseCategoryEnum>;

export const CommunicationChannelEnum = z.enum([
  "EMAIL", "SMS", "PUSH", "IN_APP", "WHATSAPP", "PHONE",
]);
export type CommunicationChannel = z.infer<typeof CommunicationChannelEnum>;

export const CustomerHealthStateEnum = z.enum([
  "HEALTHY", "WATCH", "AT_RISK", "CHURNED",
]);
export type CustomerHealthState = z.infer<typeof CustomerHealthStateEnum>;

export const DuplicateMergeStatusEnum = z.enum([
  "DETECTED", "UNDER_REVIEW", "MERGED", "DISMISSED",
]);
export type DuplicateMergeStatus = z.infer<typeof DuplicateMergeStatusEnum>;

// ─── 2. Customer Master & Contact Schemas ─────────────────────

export const CustomerMasterRecordSchema = z.object({
  customerId: z.string(),
  tenantId: z.string(),
  customerType: CustomerTypeEnum.default("INDIVIDUAL"),
  displayName: z.string(),
  companyName: z.string().optional(),
  taxId: z.string().optional(),
  regNumber: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  regionId: z.string().optional(),
  countryId: z.string().default("TZ"),
  segment: z.string().default("STANDARD"),
  source: LeadSourceEnum.default("WALK_IN"),
  status: CustomerStatusEnum.default("ACTIVE"),
  assignedOwnerId: z.string().optional(),
  branchId: z.string().optional(),
  creditLimit: z.number().nonnegative().default(0),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  industryType: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerMasterRecord = z.infer<typeof CustomerMasterRecordSchema>;

export const CustomerContactSchema = z.object({
  contactId: z.string(),
  tenantId: z.string(),
  customerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().optional(),
  role: z.string().optional(),
  department: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean().default(false),
  decisionInfluence: z.enum(["DECISION_MAKER", "INFLUENCER", "USER", "CHAMPION", "BLOCKER"]).default("INFLUENCER"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerContact = z.infer<typeof CustomerContactSchema>;

// ─── 3. Lead & Opportunity Schemas ───────────────────────────

export const LeadRecordSchema = z.object({
  leadId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  source: LeadSourceEnum,
  status: LeadStatusEnum.default("NEW"),
  contactName: z.string(),
  companyName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  productInterest: z.string().optional(),
  expectedValue: z.number().nonnegative().default(0),
  assignedOwnerId: z.string().optional(),
  qualificationScore: z.number().min(0).max(100).default(0),
  convertedCustomerId: z.string().optional(),
  convertedOpportunityId: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LeadRecord = z.infer<typeof LeadRecordSchema>;

export const LeadQualificationSchema = z.object({
  budgetCriteriaMet: z.boolean(),
  authorityCriteriaMet: z.boolean(),
  needCriteriaMet: z.boolean(),
  timingCriteriaMet: z.boolean(),
  score: z.number().min(0).max(100),
  isQualified: z.boolean(),
});
export type LeadQualification = z.infer<typeof LeadQualificationSchema>;

export const OpportunityRecordSchema = z.object({
  opportunityId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  customerId: z.string(),
  contactId: z.string().optional(),
  title: z.string(),
  stage: OpportunityStageEnum.default("NEW"),
  value: z.number().nonnegative().default(0),
  probabilityPct: z.number().min(0).max(100).default(20),
  expectedCloseDate: z.string(),
  assignedOwnerId: z.string(),
  competitorName: z.string().optional(),
  lostReason: z.enum(["PRICE", "COMPETITOR", "TIMING", "MISSING_FEATURE", "BUDGET", "NO_DECISION", "BUSINESS_CHANGE"]).optional(),
  nextAction: z.string().optional(),
  nextActionDueDate: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OpportunityRecord = z.infer<typeof OpportunityRecordSchema>;

// ─── 4. Customer Activity & Communication Schemas ───────────

export const CustomerActivitySchema = z.object({
  activityId: z.string(),
  tenantId: z.string(),
  customerId: z.string(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  caseId: z.string().optional(),
  type: ActivityTypeEnum,
  subject: z.string(),
  description: z.string().optional(),
  performedBy: z.string(),
  outcome: z.string().optional(),
  performedAt: z.string(),
});
export type CustomerActivity = z.infer<typeof CustomerActivitySchema>;

export const CustomerCommunicationSchema = z.object({
  communicationId: z.string(),
  tenantId: z.string(),
  customerId: z.string(),
  channel: CommunicationChannelEnum,
  recipient: z.string(),
  templateId: z.string().optional(),
  subject: z.string(),
  body: z.string(),
  sentBy: z.string(),
  deliveryState: z.enum(["PENDING", "SENT", "DELIVERED", "FAILED", "BOUNCED"]).default("SENT"),
  sentAt: z.string(),
});
export type CustomerCommunication = z.infer<typeof CustomerCommunicationSchema>;

export const CommunicationTemplateSchema = z.object({
  templateId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  category: z.string(),
  channel: CommunicationChannelEnum,
  subjectPattern: z.string(),
  bodyPattern: z.string(),
  language: z.string().default("en"),
  createdAt: z.string(),
});
export type CommunicationTemplate = z.infer<typeof CommunicationTemplateSchema>;

export const CustomerConsentSchema = z.object({
  consentId: z.string(),
  tenantId: z.string(),
  customerId: z.string(),
  channel: CommunicationChannelEnum,
  isConsented: z.boolean().default(true),
  optedOutAt: z.string().optional(),
  optInSource: z.string().optional(),
});
export type CustomerConsent = z.infer<typeof CustomerConsentSchema>;

// ─── 5. Customer Cases & Escalations Schemas ───────────────

export const CustomerCaseSchema = z.object({
  caseId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  customerId: z.string(),
  contactId: z.string().optional(),
  caseNumber: z.string(),
  title: z.string(),
  description: z.string(),
  category: CaseCategoryEnum.default("SERVICE"),
  priority: CasePriorityEnum.default("MEDIUM"),
  status: CaseStatusEnum.default("NEW"),
  assignedAgentId: z.string().optional(),
  slaHours: z.number().int().positive().default(24),
  responseDueDate: z.string(),
  resolutionDueDate: z.string(),
  resolvedAt: z.string().optional(),
  closedAt: z.string().optional(),
  satisfactionRating: z.number().min(1).max(5).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerCase = z.infer<typeof CustomerCaseSchema>;

export const CustomerCaseEscalationSchema = z.object({
  escalationId: z.string(),
  tenantId: z.string(),
  caseId: z.string(),
  fromLevel: z.enum(["AGENT", "SUPERVISOR", "MANAGER", "SPECIALIST"]),
  toLevel: z.enum(["AGENT", "SUPERVISOR", "MANAGER", "SPECIALIST"]),
  reason: z.string(),
  escalatedBy: z.string(),
  escalatedAt: z.string(),
});
export type CustomerCaseEscalation = z.infer<typeof CustomerCaseEscalationSchema>;

// ─── 6. Segmentation, Health & Duplicate Schemas ─────────────

export const CrmCustomerSegmentSchema = z.object({
  segmentId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string(),
  criteria: z.record(z.any()),
  customerCount: z.number().int().nonnegative().default(0),
});
export type CrmCustomerSegment = z.infer<typeof CrmCustomerSegmentSchema>;

export const CustomerHealthScoreSchema = z.object({
  customerId: z.string(),
  tenantId: z.string(),
  healthState: CustomerHealthStateEnum.default("HEALTHY"),
  score: z.number().min(0).max(100).default(100),
  activityRecencyDays: z.number().int().nonnegative().default(0),
  openCasesCount: z.number().int().nonnegative().default(0),
  overdueBalance: z.number().nonnegative().default(0),
  predictedChurnRiskPct: z.number().min(0).max(100).default(0),
  recommendedIntervention: z.string().optional(),
  evaluatedAt: z.string(),
});
export type CustomerHealthScore = z.infer<typeof CustomerHealthScoreSchema>;

export const CustomerValueMetricsSchema = z.object({
  customerId: z.string(),
  tenantId: z.string(),
  totalLifetimeRevenue: z.number().nonnegative().default(0),
  totalOrdersCount: z.number().int().nonnegative().default(0),
  averageOrderValue: z.number().nonnegative().default(0),
  lifetimeValue: z.number().nonnegative().default(0),
  lastPurchaseDate: z.string().optional(),
});
export type CustomerValueMetrics = z.infer<typeof CustomerValueMetricsSchema>;

export const DuplicateCustomerCandidateSchema = z.object({
  candidateId: z.string(),
  tenantId: z.string(),
  primaryCustomerId: z.string(),
  duplicateCustomerId: z.string(),
  matchConfidencePct: z.number().min(0).max(100),
  matchingFields: z.array(z.string()),
  status: DuplicateMergeStatusEnum.default("DETECTED"),
  detectedAt: z.string(),
});
export type DuplicateCustomerCandidate = z.infer<typeof DuplicateCustomerCandidateSchema>;

export const IndustryCrmProfileSchema = z.object({
  profileId: z.string(),
  tenantId: z.string(),
  industryType: z.string(),
  customFields: z.record(z.any()).default({}),
  requiredContactRoles: z.array(z.string()).default([]),
  createdAt: z.string(),
});
export type IndustryCrmProfile = z.infer<typeof IndustryCrmProfileSchema>;

export const CrmAnalyticsSummarySchema = z.object({
  tenantId: z.string(),
  calculatedAt: z.string(),
  totalCustomers: z.number().int().nonnegative(),
  activeCustomers: z.number().int().nonnegative(),
  atRiskCustomers: z.number().int().nonnegative(),
  openLeadsCount: z.number().int().nonnegative(),
  leadConversionRatePct: z.number().min(0).max(100),
  pipelineTotalValue: z.number().nonnegative(),
  pipelineWeightedValue: z.number().nonnegative(),
  winRatePct: z.number().min(0).max(100),
  openCasesCount: z.number().int().nonnegative(),
  slaBreachRatePct: z.number().min(0).max(100),
  avgCustomerHealthScore: z.number().min(0).max(100),
});
export type CrmAnalyticsSummary = z.infer<typeof CrmAnalyticsSummarySchema>;

export const CrmHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeCustomersCount: z.number().int().nonnegative(),
  openLeadsCount: z.number().int().nonnegative(),
  openOpportunitiesCount: z.number().int().nonnegative(),
  weightedPipelineValue: z.number().nonnegative(),
  openCasesCount: z.number().int().nonnegative(),
  atRiskCustomersCount: z.number().int().nonnegative(),
  pendingDuplicateReviews: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type CrmHealthSummary = z.infer<typeof CrmHealthSummarySchema>;

export const CrmAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "CUSTOMER_CREATED", "CUSTOMER_UPDATED", "CUSTOMER_MERGED", "LEAD_CREATED",
    "LEAD_QUALIFIED", "LEAD_CONVERTED", "OPPORTUNITY_CREATED", "OPPORTUNITY_STAGE_CHANGED",
    "OPPORTUNITY_WON", "OPPORTUNITY_LOST", "ACTIVITY_LOGGED", "COMMUNICATION_SENT",
    "CASE_CREATED", "CASE_ASSIGNED", "CASE_RESOLVED", "CASE_ESCALATED", "AI_RECOMMENDATION",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type CrmAuditEntry = z.infer<typeof CrmAuditEntrySchema>;
