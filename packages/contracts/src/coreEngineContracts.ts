import { z } from "zod";

// =========================================================================
// KWAKOPOS V2 — PLATFORM CORE BUSINESS ENGINE CONTRACTS
// =========================================================================

export const EngineLayerEnum = z.enum([
  "FOUNDATION",
  "BUSINESS_CORE",
  "OPERATIONS",
  "INTELLIGENCE",
  "SAAS",
]);
export type EngineLayer = z.infer<typeof EngineLayerEnum>;

export const EngineStatusEnum = z.enum([
  "ACTIVE",
  "DEGRADED",
  "MAINTENANCE",
  "DISABLED",
]);
export type EngineStatus = z.infer<typeof EngineStatusEnum>;

export const EngineDescriptorSchema = z.object({
  engineId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  layer: EngineLayerEnum,
  status: EngineStatusEnum.default("ACTIVE"),
  dependencies: z.array(z.string()).default([]),
  extensionPoints: z.array(z.string()).default([]),
  permissionsRequired: z.array(z.string()).default([]),
  supportedCommands: z.array(z.string()).default([]),
  supportedQueries: z.array(z.string()).default([]),
  publishedEvents: z.array(z.string()).default([]),
  healthStatus: z.enum(["HEALTHY", "DEGRADED", "UNHEALTHY"]).default("HEALTHY"),
});
export type EngineDescriptor = z.infer<typeof EngineDescriptorSchema>;

// -------------------------------------------------------------------------
// CQRS Command & Query Envelopes
// -------------------------------------------------------------------------

export const EngineCommandEnvelopeSchema = z.object({
  commandId: z.string().uuid(),
  engineId: z.string().min(1),
  commandName: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  actorId: z.string().min(1),
  actorRole: z.string().default("OPERATOR"),
  payload: z.record(z.unknown()),
  timestamp: z.string().datetime(),
  idempotencyKey: z.string().min(1),
  offlineCapable: z.boolean().default(false),
  correlationId: z.string().nullable().default(null),
});
export type EngineCommandEnvelope = z.infer<typeof EngineCommandEnvelopeSchema>;

export const EngineCommandResultSchema = z.object({
  commandId: z.string().uuid(),
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  eventsPublished: z.array(z.string()).default([]),
  executionDurationMs: z.number().nonnegative().default(0),
});
export type EngineCommandResult = z.infer<typeof EngineCommandResultSchema>;

export const EngineQueryEnvelopeSchema = z.object({
  queryId: z.string().uuid(),
  engineId: z.string().min(1),
  queryName: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  actorId: z.string().min(1),
  parameters: z.record(z.unknown()).default({}),
  timestamp: z.string().datetime(),
});
export type EngineQueryEnvelope = z.infer<typeof EngineQueryEnvelopeSchema>;

// -------------------------------------------------------------------------
// Centralized Domain Event Bus Contract
// -------------------------------------------------------------------------

export const DomainEventEnvelopeSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string().min(1),
  engineId: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  tenantId: z.string().min(1),
  branchId: z.string().nullable().default(null),
  actorId: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
  version: z.number().int().positive().default(1),
  correlationId: z.string().nullable().default(null),
  causationId: z.string().nullable().default(null),
});
export type DomainEventEnvelope = z.infer<typeof DomainEventEnvelopeSchema>;

// -------------------------------------------------------------------------
// Universal Party / Contact Model (Section 7)
// -------------------------------------------------------------------------

export const PartyTypeEnum = z.enum(["INDIVIDUAL", "ORGANIZATION"]);
export type PartyType = z.infer<typeof PartyTypeEnum>;

export const PartyRoleEnum = z.enum([
  "CUSTOMER",
  "SUPPLIER",
  "EMPLOYEE",
  "AGENT",
  "CONTRACTOR",
  "PARTNER",
]);
export type PartyRole = z.infer<typeof PartyRoleEnum>;

export const UniversalPartySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  partyType: PartyTypeEnum,
  roles: z.array(PartyRoleEnum).min(1),
  name: z.string().min(1),
  email: z.string().email().nullable().default(null),
  phone: z.string().nullable().default(null),
  taxIdNumber: z.string().nullable().default(null), // TIN / VRN
  nationalIdNumber: z.string().nullable().default(null), // NIDA / Passport
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).default("ACTIVE"),
  address: z
    .object({
      street: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      country: z.string().default("Tanzania"),
    })
    .default({}),
  creditLimit: z.number().nonnegative().default(0),
  currentCreditBalance: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UniversalParty = z.infer<typeof UniversalPartySchema>;

// -------------------------------------------------------------------------
// Universal Inventory Movement Types (Section 10)
// -------------------------------------------------------------------------

export const StockLedgerMovementTypeEnum = z.enum([
  "PURCHASE_RECEIPT",
  "SALE",
  "SALE_RETURN",
  "PURCHASE_RETURN",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "OPENING_BALANCE",
  "STOCK_CORRECTION",
  "WASTE",
  "DAMAGE",
  "INTERNAL_CONSUMPTION",
]);
export type StockLedgerMovementType = z.infer<typeof StockLedgerMovementTypeEnum>;

export const UniversalStockMovementRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  movementType: StockLedgerMovementTypeEnum,
  productId: z.string().min(1),
  variantId: z.string().min(1),
  batchId: z.string().nullable().default(null),
  batchNumber: z.string().nullable().default(null),
  quantityDelta: z.number(), // positive for intake, negative for decrement
  unitCost: z.number().nonnegative(),
  totalCostValue: z.number(),
  referenceType: z.enum(["SALE", "PURCHASE", "ADJUSTMENT", "TRANSFER", "PLUGIN_DISPENSE", "RECIPE_PRODUCTION", "MANUAL"]),
  referenceId: z.string().min(1),
  actorId: z.string().min(1),
  deviceId: z.string().default("system"),
  clientCreatedAt: z.string().datetime(),
  serverRecordedAt: z.string().datetime(),
  runningBalanceAfter: z.number(),
  notes: z.string().default(""),
});
export type UniversalStockMovementRecord = z.infer<typeof UniversalStockMovementRecordSchema>;

// -------------------------------------------------------------------------
// Industry Plugin Contract (Section 50)
// -------------------------------------------------------------------------

export const PluginDeclarationSchema = z.object({
  pluginId: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sector: z.string().min(1),
  requiredEngines: z.array(z.string()).min(1),
  optionalEngines: z.array(z.string()).default([]),
  permissionsDeclared: z.array(z.string()).default([]),
  routesDeclared: z.array(z.string()).default([]),
  extensionEntities: z.array(z.string()).default([]),
  status: z.enum(["AVAILABLE", "ENABLED", "DISABLED", "MAINTENANCE"]).default("AVAILABLE"),
});
export type PluginDeclaration = z.infer<typeof PluginDeclarationSchema>;
