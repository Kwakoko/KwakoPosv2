import { z } from "zod";

// ============================================================
// Phase 39 — KwakoPos Integration Center Contracts (KIOL v1.0.0)
// ============================================================

// ─── 1. Enumerations ─────────────────────────────────────────

export const IntegrationCategoryEnum = z.enum([
  "FINANCE_BANKING", "CRM_MESSAGING", "ERP_LOGISTICS", "HR_PAYROLL", "AI_INTELLIGENCE", "INDUSTRY_SPECIFIC", "CUSTOM",
]);
export type IntegrationCategory = z.infer<typeof IntegrationCategoryEnum>;

export const IntegrationStatusEnum = z.enum([
  "ACTIVE", "INACTIVE", "DEGRADED", "DISCONNECTED", "ERROR",
]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusEnum>;

export const SyncModeEnum = z.enum([
  "FULL_SYNC", "INCREMENTAL_SYNC", "EVENT_DRIVEN", "SCHEDULED", "ON_DEMAND",
]);
export type SyncMode = z.infer<typeof SyncModeEnum>;

export const SyncDirectionEnum = z.enum([
  "INBOUND", "OUTBOUND", "BIDIRECTIONAL",
]);
export type SyncDirection = z.infer<typeof SyncDirectionEnum>;

export const ConflictPolicyEnum = z.enum([
  "LOCAL_WINS", "REMOTE_WINS", "LATEST_TIMESTAMP_WINS", "MANUAL_REVIEW",
]);
export type ConflictPolicy = z.infer<typeof ConflictPolicyEnum>;

export const WebhookDeliveryStatusEnum = z.enum([
  "RECEIVED", "PROCESSED", "FAILED", "RETRYING", "DEAD_LETTER",
]);
export type WebhookDeliveryStatus = z.infer<typeof WebhookDeliveryStatusEnum>;

export const CircuitBreakerStateEnum = z.enum([
  "CLOSED", "OPEN", "HALF_OPEN",
]);
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateEnum>;

export const CredentialRotationStateEnum = z.enum([
  "ACTIVE", "VALIDATING", "SWITCHING", "VERIFYING", "REVOKED",
]);
export type CredentialRotationState = z.infer<typeof CredentialRotationStateEnum>;

// ─── 2. Connectors & Configurations ─────────────────────────

export const IntegrationConnectorSchema = z.object({
  connectorId: z.string(),
  name: z.string(),
  category: IntegrationCategoryEnum,
  provider: z.string(),
  version: z.string().default("1.0.0"),
  description: z.string(),
  iconUrl: z.string().optional(),
  docUrl: z.string().optional(),
  supportedSyncModes: z.array(SyncModeEnum),
  authType: z.enum(["API_KEY", "OAUTH2", "BASIC", "MUTUAL_TLS"]),
  isOfficial: z.boolean().default(true),
});
export type IntegrationConnector = z.infer<typeof IntegrationConnectorSchema>;

export const IntegrationConfigSchema = z.object({
  integrationId: z.string(),
  tenantId: z.string(),
  connectorId: z.string(),
  status: IntegrationStatusEnum.default("ACTIVE"),
  displayName: z.string(),
  baseUrl: z.string(),
  environment: z.enum(["PRODUCTION", "SANDBOX"]).default("PRODUCTION"),
  conflictPolicy: ConflictPolicyEnum.default("LATEST_TIMESTAMP_WINS"),
  autoSyncIntervalMinutes: z.number().int().nonnegative().default(60),
  enabledScopes: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

export const IntegrationCredentialSchema = z.object({
  credentialId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  authType: z.enum(["API_KEY", "OAUTH2", "BASIC", "MUTUAL_TLS"]),
  encryptedSecret: z.string(),
  scopes: z.array(z.string()),
  expiresAt: z.string().optional(),
  rotationState: CredentialRotationStateEnum.default("ACTIVE"),
  lastRotatedAt: z.string(),
  createdAt: z.string(),
});
export type IntegrationCredential = z.infer<typeof IntegrationCredentialSchema>;

// ─── 3. Webhook Center Schemas ───────────────────────────────

export const WebhookSubscriptionSchema = z.object({
  subscriptionId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  endpointUrl: z.string(),
  eventTypes: z.array(z.string()),
  hmacSecret: z.string(),
  maxRetries: z.number().int().nonnegative().default(5),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
});
export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

export const WebhookEventLogSchema = z.object({
  eventId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  eventType: z.string(),
  payload: z.record(z.any()),
  rawSignature: z.string(),
  signatureVerified: z.boolean(),
  status: WebhookDeliveryStatusEnum.default("RECEIVED"),
  attemptCount: z.number().int().nonnegative().default(1),
  errorMessage: z.string().optional(),
  processedAt: z.string().optional(),
  receivedAt: z.string(),
});
export type WebhookEventLog = z.infer<typeof WebhookEventLogSchema>;

// ─── 4. Field Mapping & Entity Mapping ───────────────────────

export const FieldMappingRuleSchema = z.object({
  ruleId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  entityType: z.string(),
  sourceField: z.string(),
  targetField: z.string(),
  transformRule: z.enum(["DIRECT", "UPPERCASE", "LOWERCASE", "TO_NUMBER", "TO_BOOLEAN", "STRING_TRIM"]).default("DIRECT"),
  defaultValue: z.string().optional(),
});
export type FieldMappingRule = z.infer<typeof FieldMappingRuleSchema>;

export const EntityMappingRecordSchema = z.object({
  mappingId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  entityType: z.string(),
  localEntityId: z.string(),
  externalEntityId: z.string(),
  lastSyncedAt: z.string(),
});
export type EntityMappingRecord = z.infer<typeof EntityMappingRecordSchema>;

// ─── 5. Sync Jobs & Health Metrics ────────────────────────────

export const SyncJobRecordSchema = z.object({
  jobId: z.string(),
  tenantId: z.string(),
  integrationId: z.string(),
  mode: SyncModeEnum,
  direction: SyncDirectionEnum,
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"]).default("PENDING"),
  itemsProcessed: z.number().int().nonnegative().default(0),
  itemsFailed: z.number().int().nonnegative().default(0),
  conflictCount: z.number().int().nonnegative().default(0),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});
export type SyncJobRecord = z.infer<typeof SyncJobRecordSchema>;

export const IntegrationHealthMetricSchema = z.object({
  tenantId: z.string(),
  integrationId: z.string(),
  latencyMs: z.number().nonnegative(),
  uptimePct: z.number().min(0).max(100),
  errorRatePct: z.number().min(0).max(100),
  activeConnectionsCount: z.number().int().nonnegative(),
  circuitState: CircuitBreakerStateEnum,
  evaluatedAt: z.string(),
});
export type IntegrationHealthMetric = z.infer<typeof IntegrationHealthMetricSchema>;

export const IntegrationHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeIntegrationsCount: z.number().int().nonnegative(),
  healthyIntegrationsCount: z.number().int().nonnegative(),
  degradedIntegrationsCount: z.number().int().nonnegative(),
  circuitBreakersOpenCount: z.number().int().nonnegative(),
  pendingWebhooksCount: z.number().int().nonnegative(),
  deadLetterEventsCount: z.number().int().nonnegative(),
  totalSyncJobsToday: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type IntegrationHealthSummary = z.infer<typeof IntegrationHealthSummarySchema>;

export const IntegrationAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "INTEGRATION_INSTALLED", "INTEGRATION_UPDATED", "CREDENTIAL_ROTATED", "CREDENTIAL_REVOKED",
    "WEBHOOK_REGISTERED", "WEBHOOK_VERIFIED", "WEBHOOK_RETRIED", "SYNC_STARTED",
    "SYNC_COMPLETED", "SYNC_FAILED", "CIRCUIT_BREAKER_TRIGGERED", "AI_DIAGNOSTIC",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type IntegrationAuditEntry = z.infer<typeof IntegrationAuditEntrySchema>;
