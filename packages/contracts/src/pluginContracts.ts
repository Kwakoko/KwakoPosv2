import { z } from "zod";

// ==========================================
// Plugin Framework & Lifecycle
// ==========================================

export const PluginTypeEnum = z.enum(["INDUSTRY", "ADDON", "INTEGRATION"]);
export type PluginType = z.infer<typeof PluginTypeEnum>;

export const PluginLifecycleStateEnum = z.enum([
  "DISCOVERED",
  "VALIDATED",
  "INSTALLED",
  "CONFIGURED",
  "ENABLED",
  "ACTIVE",
  "SUSPENDED",
  "UPGRADED",
  "DISABLED",
  "UNINSTALLED",
]);
export type PluginLifecycleState = z.infer<typeof PluginLifecycleStateEnum>;

export const OfflineCapabilityEnum = z.enum([
  "FULLY_OFFLINE",
  "OFFLINE_WITH_PENDING_VALIDATION",
  "ONLINE_REQUIRED",
]);
export type OfflineCapability = z.infer<typeof OfflineCapabilityEnum>;

export const PluginCapabilityEnum = z.enum([
  "inventory.read",
  "inventory.write",
  "pos.read",
  "pos.write",
  "finance.read",
  "finance.post",
  "workforce.read",
  "workforce.assign",
  "customer.read",
  "customer.write",
  "supplier.read",
  "supplier.write",
  "notification.send",
  "file.store",
  "report.create",
]);
export type PluginCapability = z.infer<typeof PluginCapabilityEnum>;

// ==========================================
// Plugin Manifest
// ==========================================

export const PluginRouteSchema = z.object({
  path: z.string(),
  name: z.string(),
  icon: z.string().optional(),
  requiredPermissions: z.array(z.string()).default([]),
  offlineSupport: OfflineCapabilityEnum.default("FULLY_OFFLINE"),
});
export type PluginRoute = z.infer<typeof PluginRouteSchema>;

export const PluginEntityDefinitionSchema = z.object({
  name: z.string(),
  tableName: z.string(),
  isTenantScoped: z.boolean().default(true),
  isBranchScoped: z.boolean().default(false),
  syncEnabled: z.boolean().default(true),
  searchFields: z.array(z.string()).default([]),
});
export type PluginEntityDefinition = z.infer<typeof PluginEntityDefinitionSchema>;

export const PluginWorkflowStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  name: z.string(),
  action: z.string(),
  requiredRoles: z.array(z.string()).default([]),
});
export type PluginWorkflowStep = z.infer<typeof PluginWorkflowStepSchema>;

export const PluginWorkflowDefinitionSchema = z.object({
  workflowId: z.string(),
  name: z.string(),
  triggerEvent: z.string(),
  steps: z.array(PluginWorkflowStepSchema),
});
export type PluginWorkflowDefinition = z.infer<typeof PluginWorkflowDefinitionSchema>;

export const PluginReportDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  requiredPermissions: z.array(z.string()).default([]),
  exportFormats: z.array(z.string()).default(["JSON", "CSV", "PDF"]),
});
export type PluginReportDefinition = z.infer<typeof PluginReportDefinitionSchema>;

export const PluginDashboardWidgetSchema = z.object({
  widgetId: z.string(),
  title: z.string(),
  type: z.enum(["STAT_CARD", "CHART", "LIST", "ALERT"]),
  queryKey: z.string(),
});
export type PluginDashboardWidget = z.infer<typeof PluginDashboardWidgetSchema>;

export const PluginDashboardDefinitionSchema = z.object({
  dashboardId: z.string(),
  title: z.string(),
  targetRole: z.string().default("MANAGER"),
  widgets: z.array(PluginDashboardWidgetSchema),
});
export type PluginDashboardDefinition = z.infer<typeof PluginDashboardDefinitionSchema>;

export const PluginManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  platformVersion: z.string().default("2.2.0"),
  schemaVersion: z.number().int().positive().default(1),
  syncProtocolVersion: z.number().int().positive().default(1),
  minimumPlatformVersion: z.string().default("2.1.0"),
  type: PluginTypeEnum.default("INDUSTRY"),
  status: z.enum(["stable", "beta", "deprecated"]).default("stable"),
  industry: z.string(),
  description: z.string().default(""),
  author: z.string().default("KwakoPos Team"),
  dependencies: z.array(z.string()).default([]),
  capabilities: z.array(PluginCapabilityEnum).default([]),
  permissions: z.array(z.string()).default([]),
  routes: z.array(PluginRouteSchema).default([]),
  entities: z.array(PluginEntityDefinitionSchema).default([]),
  workflows: z.array(PluginWorkflowDefinitionSchema).default([]),
  reports: z.array(PluginReportDefinitionSchema).default([]),
  dashboards: z.array(PluginDashboardDefinitionSchema).default([]),
  featureFlags: z.array(z.string()).default([]),
  offlineCapability: OfflineCapabilityEnum.default("FULLY_OFFLINE"),
  pricing: z
    .object({
      basePriceMonthly: z.number().default(0),
      currency: z.string().default("TZS"),
      includedInPlans: z.array(z.string()).default(["ENTERPRISE"]),
    })
    .default({ basePriceMonthly: 0, currency: "TZS", includedInPlans: ["ENTERPRISE"] }),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ==========================================
// Plugin Activation & Configuration
// ==========================================

export const TenantPluginActivationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  pluginId: z.string(),
  pluginVersion: z.string(),
  state: PluginLifecycleStateEnum,
  enabledAt: z.string().datetime().nullable(),
  installedAt: z.string().datetime(),
  disabledAt: z.string().datetime().nullable(),
  configuration: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TenantPluginActivation = z.infer<typeof TenantPluginActivationSchema>;

export const BranchPluginActivationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  pluginId: z.string(),
  isEnabled: z.boolean().default(true),
  configuration: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type BranchPluginActivation = z.infer<typeof BranchPluginActivationSchema>;

export const PluginConfigScopeEnum = z.enum(["GLOBAL", "TENANT", "BRANCH", "USER"]);
export type PluginConfigScope = z.infer<typeof PluginConfigScopeEnum>;

export const PluginConfigurationEntrySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  pluginId: z.string(),
  scope: PluginConfigScopeEnum,
  key: z.string(),
  value: z.unknown(),
  version: z.number().int().positive().default(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PluginConfigurationEntry = z.infer<typeof PluginConfigurationEntrySchema>;

export const PluginEventSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  pluginId: z.string(),
  eventType: z.string(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  operationId: z.string(),
  idempotencyKey: z.string(),
  payload: z.record(z.unknown()).default({}),
  actorId: z.string(),
  timestamp: z.string().datetime(),
});
export type PluginEvent = z.infer<typeof PluginEventSchema>;

export const PluginUsageRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(),
  pluginId: z.string(),
  metricName: z.string(),
  quantity: z.number(),
  period: z.string(), // "2026-08"
  timestamp: z.string().datetime(),
});
export type PluginUsageRecord = z.infer<typeof PluginUsageRecordSchema>;

export const PluginHealthCheckSchema = z.object({
  checkName: z.string(),
  status: z.enum(["HEALTHY", "DEGRADED", "FAILED"]),
  message: z.string().optional(),
  latencyMs: z.number().optional(),
});
export type PluginHealthCheck = z.infer<typeof PluginHealthCheckSchema>;

export const PluginHealthReportSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  status: z.enum(["HEALTHY", "DEGRADED", "FAILED"]),
  checks: z.array(PluginHealthCheckSchema),
  timestamp: z.string().datetime(),
});
export type PluginHealthReport = z.infer<typeof PluginHealthReportSchema>;

// ==========================================
// Specialized Industry Domain Entities
// ==========================================

// 1. RESTAURANT
export const RestaurantTableStatusEnum = z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "CLEANING", "OUT_OF_SERVICE"]);
export type RestaurantTableStatus = z.infer<typeof RestaurantTableStatusEnum>;

export const RestaurantTableSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  tableNumber: z.string(),
  capacity: z.number().int().positive(),
  status: RestaurantTableStatusEnum.default("AVAILABLE"),
  floorArea: z.string().default("MAIN"),
  currentOrderId: z.string().uuid().nullable().default(null),
  assignedStaffId: z.string().uuid().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RestaurantTable = z.infer<typeof RestaurantTableSchema>;

export const KitchenTicketStatusEnum = z.enum(["PENDING", "PREPARING", "READY", "SERVED", "CANCELLED"]);
export type KitchenTicketStatus = z.infer<typeof KitchenTicketStatusEnum>;

export const KitchenTicketItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quantity: z.number().positive(),
  notes: z.string().nullable().default(null),
  course: z.enum(["STARTER", "MAIN", "DESSERT", "BEVERAGE"]).default("MAIN"),
  modifiers: z.array(z.string()).default([]),
});
export type KitchenTicketItem = z.infer<typeof KitchenTicketItemSchema>;

export const KitchenTicketSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  orderId: z.string().uuid(),
  tableNumber: z.string().nullable().default(null),
  status: KitchenTicketStatusEnum.default("PENDING"),
  items: z.array(KitchenTicketItemSchema),
  prepTimeMinutes: z.number().int().default(15),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type KitchenTicket = z.infer<typeof KitchenTicketSchema>;

// 2. PHARMACY
export const PharmacyPrescriptionStatusEnum = z.enum(["PENDING", "VALIDATED", "DISPENSED", "CANCELLED"]);
export type PharmacyPrescriptionStatus = z.infer<typeof PharmacyPrescriptionStatusEnum>;

export const PharmacyPrescriptionItemSchema = z.object({
  id: z.string().uuid(),
  medicineName: z.string(),
  activeIngredient: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  durationDays: z.number().int().positive(),
  quantity: z.number().int().positive(),
  batchNumber: z.string(),
  expiryDate: z.string(),
});
export type PharmacyPrescriptionItem = z.infer<typeof PharmacyPrescriptionItemSchema>;

export const PharmacyPrescriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  prescriptionNumber: z.string(),
  patientName: z.string(),
  patientAge: z.number().int().nullable().default(null),
  doctorName: z.string(),
  doctorLicenseNumber: z.string(),
  status: PharmacyPrescriptionStatusEnum.default("PENDING"),
  items: z.array(PharmacyPrescriptionItemSchema),
  dispensedByUserId: z.string().uuid().nullable().default(null),
  dispensedAt: z.string().datetime().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PharmacyPrescription = z.infer<typeof PharmacyPrescriptionSchema>;

// 3. GARAGE
export const GarageVehicleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  registrationNumber: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number().int().nullable().default(null),
  vin: z.string().nullable().default(null),
  mileage: z.number().int().default(0),
  customerId: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GarageVehicle = z.infer<typeof GarageVehicleSchema>;

export const GarageWorkOrderStatusEnum = z.enum(["INTAKE", "DIAGNOSIS", "IN_PROGRESS", "QA_REVIEW", "COMPLETED", "DELIVERED"]);
export type GarageWorkOrderStatus = z.infer<typeof GarageWorkOrderStatusEnum>;

export const GarageWorkOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  workOrderNumber: z.string(),
  vehicleId: z.string().uuid(),
  customerId: z.string().uuid(),
  assignedTechnicianId: z.string().uuid().nullable().default(null),
  status: GarageWorkOrderStatusEnum.default("INTAKE"),
  issueDescription: z.string(),
  diagnosis: z.string().nullable().default(null),
  partsCostTotal: z.number().default(0),
  laborHours: z.number().default(0),
  laborRate: z.number().default(0),
  laborCostTotal: z.number().default(0),
  grandTotal: z.number().default(0),
  qaPassed: z.boolean().default(false),
  qaInspectorId: z.string().uuid().nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type GarageWorkOrder = z.infer<typeof GarageWorkOrderSchema>;

// 4. CONSTRUCTION
export const ConstructionProjectStatusEnum = z.enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CLOSED"]);
export type ConstructionProjectStatus = z.infer<typeof ConstructionProjectStatusEnum>;

export const ConstructionWorkPackageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  budget: z.number().positive(),
  laborCost: z.number().default(0),
  materialsCost: z.number().default(0),
  progressPercent: z.number().min(0).max(100).default(0),
  isCompleted: z.boolean().default(false),
});
export type ConstructionWorkPackage = z.infer<typeof ConstructionWorkPackageSchema>;

export const ConstructionProjectSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  projectCode: z.string(),
  name: z.string(),
  siteLocation: z.string(),
  status: ConstructionProjectStatusEnum.default("PLANNING"),
  budgetTotal: z.number().positive(),
  actualCostTotal: z.number().default(0),
  progressPercent: z.number().min(0).max(100).default(0),
  workPackages: z.array(ConstructionWorkPackageSchema).default([]),
  startDate: z.string(),
  estimatedCompletionDate: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ConstructionProject = z.infer<typeof ConstructionProjectSchema>;

// 5. WHOLESALE

export const WholesaleQuantityTierSchema = z.object({
  minQuantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discountPercent: z.number().min(0).max(100).default(0),
});
export type WholesaleQuantityTier = z.infer<typeof WholesaleQuantityTierSchema>;

export const WholesaleProductTierRuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  variantId: z.string().uuid(),
  minimumOrderQuantity: z.number().int().positive().default(1),
  unitsPerCase: z.number().int().positive().default(12),
  casesPerPallet: z.number().int().positive().default(50),
  tiers: z.array(WholesaleQuantityTierSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type WholesaleProductTierRule = z.infer<typeof WholesaleProductTierRuleSchema>;
