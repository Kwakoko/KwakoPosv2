import { z } from "zod";

// =========================================================================
// 1. Telecom Manifest & Capability Schemas
// =========================================================================

export const TelecomCapabilitySchema = z.enum([
  "sites",
  "ran",
  "microwave",
  "equipment",
  "work-orders",
  "kml-kmz",
  "engineering",
  "surveys",
  "acceptance",
  "maintenance",
]);
export type TelecomCapability = z.infer<typeof TelecomCapabilitySchema>;

// =========================================================================
// 2. Customer & Contract Schemas
// =========================================================================

export const TelecomCustomerContractSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid(),
  contractNumber: z.string().min(1),
  title: z.string().min(1),
  startDate: z.string(),
  endDate: z.string(),
  slaResponseHours: z.number().nonnegative().default(4),
  slaResolutionHours: z.number().nonnegative().default(24),
  availabilityTargetPct: z.number().min(0).max(100).default(99.9),
  contractValue: z.number().nonnegative().default(0),
  currency: z.string().default("TZS"),
  billingTerms: z.enum(["MILESTONE", "MONTHLY_RECURRING", "TIME_AND_MATERIALS", "UPFRONT"]).default("MILESTONE"),
  serviceScope: z.string().nullable().optional(),
  supportPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("HIGH"),
  status: z.enum(["DRAFT", "ACTIVE", "UNDER_REVIEW", "EXPIRED", "TERMINATED"]).default("ACTIVE"),
  renewalDate: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomCustomerContract = z.infer<typeof TelecomCustomerContractSchema>;

// =========================================================================
// 3. Project Management Schemas
// =========================================================================

export const TelecomProjectStatusSchema = z.enum([
  "PLANNING",
  "SURVEY",
  "DESIGN",
  "PROCUREMENT",
  "INSTALLATION",
  "INTEGRATION",
  "TESTING",
  "ACCEPTANCE",
  "HANDOVER",
  "MAINTENANCE",
  "CLOSED",
]);
export type TelecomProjectStatus = z.infer<typeof TelecomProjectStatusSchema>;

export const TelecomProjectSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  contractId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid(),
  projectCode: z.string().min(1),
  name: z.string().min(1),
  projectManagerId: z.string().uuid().nullable().optional(),
  status: TelecomProjectStatusSchema.default("PLANNING"),
  startDate: z.string(),
  targetEndDate: z.string(),
  actualEndDate: z.string().nullable().optional(),
  budgetAmount: z.number().nonnegative().default(0),
  actualCost: z.number().nonnegative().default(0),
  progressPct: z.number().min(0).max(100).default(0),
  siteIds: z.array(z.string().uuid()).default([]),
  billingStatus: z.enum(["PENDING", "PARTIALLY_INVOICED", "FULLY_INVOICED", "PAID"]).default("PENDING"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomProject = z.infer<typeof TelecomProjectSchema>;

// =========================================================================
// 4. Site Management Schemas
// =========================================================================

export const TelecomSiteStatusSchema = z.enum([
  "PLANNED",
  "SURVEYED",
  "APPROVED",
  "UNDER_CONSTRUCTION",
  "INSTALLED",
  "INTEGRATED",
  "ACCEPTED",
  "ACTIVE",
  "DECOMMISSIONED",
]);
export type TelecomSiteStatus = z.infer<typeof TelecomSiteStatusSchema>;

export const TelecomSiteTypeSchema = z.enum([
  "GREENFIELD_TOWER",
  "ROOFTOP_TOWER",
  "MONOPOLE",
  "GUYED_TOWER",
  "STREET_FURNITURE",
  "INDOOR_DAS",
  "POP_CONTAINER",
]);
export type TelecomSiteType = z.infer<typeof TelecomSiteTypeSchema>;

export const TelecomSiteSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  siteCode: z.string().min(1),
  name: z.string().min(1),
  siteType: TelecomSiteTypeSchema.default("GREENFIELD_TOWER"),
  status: TelecomSiteStatusSchema.default("PLANNED"),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMeters: z.number().default(0),
  towerHeightMeters: z.number().nonnegative().default(0),
  address: z.string().nullable().optional(),
  region: z.string().min(1),
  district: z.string().nullable().optional(),
  siteOwner: z.string().nullable().optional(),
  accessDetails: z.string().nullable().optional(),
  powerSource: z.enum(["GRID_COMMERCIAL", "SOLAR_HYBRID", "DIESEL_GENERATOR", "BATTERY_BACKUP", "DUAL_GRID"]).default("GRID_COMMERCIAL"),
  securityRestrictions: z.string().nullable().optional(),
  photos: z.array(z.string()).default([]),
  documents: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomSite = z.infer<typeof TelecomSiteSchema>;

// =========================================================================
// 5. Geographic & KML/KMZ Schemas
// =========================================================================

export const GeoCoordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevationMeters: z.number().optional().default(0),
});
export type GeoCoordinate = z.infer<typeof GeoCoordinateSchema>;

export const GeoPlacemarkSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable().optional(),
  layerName: z.string().default("Default"),
  geometryType: z.enum(["Point", "LineString", "Polygon", "MultiGeometry"]).default("Point"),
  coordinates: z.array(GeoCoordinateSchema),
  extendedData: z.record(z.string(), z.string()).optional().default({}),
});
export type GeoPlacemark = z.infer<typeof GeoPlacemarkSchema>;

export const KmlImportRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  fileName: z.string().min(1),
  fileType: z.enum(["KML", "KMZ"]),
  fileSizeBytes: z.number().nonnegative(),
  sha256Hash: z.string().min(32),
  totalPlacemarksParsed: z.number().nonnegative().default(0),
  sitesCreated: z.number().nonnegative().default(0),
  parsedPlacemarks: z.array(GeoPlacemarkSchema).default([]),
  importedById: z.string().uuid(),
  importedAt: z.string(),
  status: z.enum(["PARSED_PREVIEW", "IMPORTED", "FAILED"]).default("PARSED_PREVIEW"),
  errorMessage: z.string().nullable().optional(),
});
export type KmlImportRecord = z.infer<typeof KmlImportRecordSchema>;

// =========================================================================
// 6. Site Survey Schemas
// =========================================================================

export const TelecomSurveySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  surveyorId: z.string().uuid(),
  surveyDate: z.string(),
  measuredLatitude: z.number().min(-90).max(90),
  measuredLongitude: z.number().min(-180).max(180),
  measuredElevationMeters: z.number(),
  gpsAccuracyMeters: z.number().nonnegative().default(1.5),
  towerType: TelecomSiteTypeSchema,
  towerHeightMeters: z.number().nonnegative(),
  shelterSpaceAvailable: z.boolean().default(true),
  groundingSystemCondition: z.enum(["EXCELLENT", "GOOD", "NEEDS_UPGRADE", "ABSENT"]).default("GOOD"),
  availablePowerKw: z.number().nonnegative().default(5.0),
  cableRouteLengthMeters: z.number().nonnegative().default(30),
  environmentalConstraints: z.string().nullable().optional(),
  photos: z.array(z.string()).default([]),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).default("SUBMITTED"),
  approvedById: z.string().uuid().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomSurvey = z.infer<typeof TelecomSurveySchema>;

// =========================================================================
// 7. RAN (Radio Access Network) Schemas
// =========================================================================

export const RanTechnologySchema = z.enum(["2G", "3G", "4G_LTE", "5G_NR"]);
export type RanTechnology = z.infer<typeof RanTechnologySchema>;

export const TelecomRanSectorSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  siteId: z.string().uuid(),
  sectorName: z.string().min(1), // e.g. "Alpha", "Beta", "Gamma" or "Sec 1"
  sectorIndex: z.number().int().min(1).max(12),
  technology: RanTechnologySchema.default("4G_LTE"),
  frequencyBandMhz: z.number().positive(), // e.g. 700, 800, 1800, 2100, 2600, 3500
  carrierBandwidthMhz: z.number().positive().default(20),
  antennaModel: z.string().min(1),
  antennaGainDbi: z.number().default(18),
  azimuthDegrees: z.number().min(0).max(360),
  mechanicalTiltDegrees: z.number().min(-10).max(25).default(0),
  electricalTiltDegrees: z.number().min(0).max(15).default(2),
  antennaHeightMeters: z.number().nonnegative().default(30),
  radioUnitModel: z.string().nullable().optional(),
  radioUnitSerialNumber: z.string().nullable().optional(),
  txPowerWatts: z.number().positive().default(40),
  status: z.enum(["PLANNED", "INSTALLED", "INTEGRATED", "ON_AIR", "DECOMMISSIONED"]).default("PLANNED"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomRanSector = z.infer<typeof TelecomRanSectorSchema>;

// =========================================================================
// 8. Microwave Link Engineering Schemas
// =========================================================================

export const MicrowaveLinkCalculationSchema = z.object({
  distanceKm: z.number().nonnegative(),
  trueAzimuthDegreesSiteAToB: z.number().min(0).max(360),
  reverseAzimuthDegreesSiteBToA: z.number().min(0).max(360),
  elevationAngleDegreesSiteAToB: z.number(),
  freeSpacePathLossDb: z.number().nonnegative(),
  fresnelZoneRadiusMeters: z.number().nonnegative(),
  receivedSignalLevelDbm: z.number(),
  fadeMarginDb: z.number(),
  linkBudgetValid: z.boolean(),
  calculationVersion: z.number().int().default(1),
  calculatedAt: z.string(),
});
export type MicrowaveLinkCalculation = z.infer<typeof MicrowaveLinkCalculationSchema>;

export const TelecomMicrowaveLinkSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  linkCode: z.string().min(1),
  name: z.string().min(1),
  siteAId: z.string().uuid(),
  siteBId: z.string().uuid(),
  frequencyGhz: z.number().positive().default(13.0),
  channelBandwidthMhz: z.number().positive().default(28.0),
  txPowerDbm: z.number().default(24.0),
  antennaDiameterMetersSiteA: z.number().positive().default(0.6),
  antennaDiameterMetersSiteB: z.number().positive().default(0.6),
  antennaGainDbiSiteA: z.number().positive().default(35.5),
  antennaGainDbiSiteB: z.number().positive().default(35.5),
  polarization: z.enum(["VERTICAL", "HORIZONTAL", "DUAL_XPIC"]).default("VERTICAL"),
  feederLossSiteADb: z.number().nonnegative().default(1.5),
  feederLossSiteBDb: z.number().nonnegative().default(1.5),
  siteAAntennaHeightMeters: z.number().nonnegative().default(30),
  siteBAntennaHeightMeters: z.number().nonnegative().default(30),
  expectedThroughputMbps: z.number().positive().default(400),
  availabilityTargetPct: z.number().min(90).max(100).default(99.995),
  calculation: MicrowaveLinkCalculationSchema.nullable().optional(),
  status: z.enum(["DESIGN", "REVIEWED", "APPROVED", "INSTALLED", "ALIGNED", "COMMISSIONED", "DECOMMISSIONED"]).default("DESIGN"),
  approvedById: z.string().uuid().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomMicrowaveLink = z.infer<typeof TelecomMicrowaveLinkSchema>;

// =========================================================================
// 9. Technical Work Orders & Checklists
// =========================================================================

export const TelecomChecklistItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  category: z.enum(["TOWER_SAFETY", "ANTENNA_MOUNTING", "RADIO_INSTALLATION", "GROUNDING_POWER", "CABLE_ROUTING", "ALIGNMENT", "TESTING", "HOUSEKEEPING"]),
  isRequired: z.boolean().default(true),
  passed: z.boolean().default(false),
  measuredValue: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type TelecomChecklistItem = z.infer<typeof TelecomChecklistItemSchema>;

export const TelecomWorkOrderSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid(),
  workOrderNumber: z.string().min(1),
  title: z.string().min(1),
  workType: z.enum(["SITE_SURVEY", "RAN_INSTALLATION", "MICROWAVE_INSTALLATION", "FIBER_DEPLOYMENT", "PREVENTIVE_MAINTENANCE", "CORRECTIVE_MAINTENANCE", "DECOMMISSIONING"]).default("RAN_INSTALLATION"),
  status: z.enum(["PLANNED", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "CANCELLED"]).default("PLANNED"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "EMERGENCY"]).default("MEDIUM"),
  assignedTeam: z.string().nullable().optional(),
  leadTechnicianId: z.string().uuid().nullable().optional(),
  technicianIds: z.array(z.string().uuid()).default([]),
  scheduledStartDate: z.string(),
  scheduledEndDate: z.string(),
  actualStartTime: z.string().nullable().optional(),
  actualEndTime: z.string().nullable().optional(),
  totalLaborHours: z.number().nonnegative().default(0),
  laborCost: z.number().nonnegative().default(0),
  checklistVersion: z.number().int().default(1),
  checklistItems: z.array(TelecomChecklistItemSchema).default([]),
  completionNotes: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomWorkOrder = z.infer<typeof TelecomWorkOrderSchema>;

// =========================================================================
// 10. Technical Testing, Commissioning & Site Acceptance Test (SAT)
// =========================================================================

export const TelecomTestRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  siteId: z.string().uuid(),
  workOrderId: z.string().uuid().nullable().optional(),
  testType: z.enum(["VSWR_SWEEP", "OPTICAL_POWER_DBM", "RSL_SIGNAL_LEVEL_DBM", "BER_ERROR_RATE", "THROUGHPUT_SPEED_MBPS", "EARTHING_RESISTANCE_OHM", "BATTERY_DISCHARGE_TEST"]),
  parameterName: z.string().min(1),
  expectedValue: z.string().min(1),
  measuredValue: z.string().min(1),
  unit: z.string().default("dBm"),
  passed: z.boolean(),
  testedById: z.string().uuid(),
  testedAt: z.string(),
  testEquipmentSerialNumber: z.string().nullable().optional(),
  traceAttachmentUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type TelecomTestRecord = z.infer<typeof TelecomTestRecordSchema>;

export const TelecomAcceptanceRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  projectId: z.string().uuid(),
  siteId: z.string().uuid(),
  satNumber: z.string().min(1),
  acceptanceType: z.enum(["PROVISIONAL_ACCEPTANCE", "FINAL_ACCEPTANCE", "MILESTONE_ACCEPTANCE"]).default("PROVISIONAL_ACCEPTANCE"),
  status: z.enum(["PENDING_REVIEW", "ACCEPTED", "PUNCHLIST_OPEN", "REJECTED"]).default("ACCEPTED"),
  leadEngineerId: z.string().uuid(),
  customerRepresentativeName: z.string().min(1),
  customerSignatureUrl: z.string().nullable().optional(),
  mandatoryTestsPassed: z.boolean().default(true),
  openPunchlistItemsCount: z.number().int().nonnegative().default(0),
  triggersBillingMilestone: z.boolean().default(true),
  billingInvoiceId: z.string().uuid().nullable().optional(),
  acceptedAt: z.string(),
  remarks: z.string().nullable().optional(),
  handoverPackageSummary: z.record(z.string(), z.any()).optional().default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomAcceptanceRecord = z.infer<typeof TelecomAcceptanceRecordSchema>;

// =========================================================================
// 11. Maintenance, Incidents & SLA Schemas
// =========================================================================

export const TelecomMaintenanceTicketSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid(),
  ticketNumber: z.string().min(1),
  ticketType: z.enum(["PREVENTIVE_MAINTENANCE", "CORRECTIVE_BREAKFIX", "ALARM_OUTAGE", "POWER_FAILURE", "CUSTOMER_SERVICE_REQUEST"]),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "WARNING"]).default("MAJOR"),
  status: z.enum(["REPORTED", "DIAGNOSED", "ASSIGNED", "IN_PROGRESS", "TESTED", "RESOLVED", "CLOSED"]).default("REPORTED"),
  title: z.string().min(1),
  reportedIssue: z.string().min(1),
  assignedTechnicianId: z.string().uuid().nullable().optional(),
  reportedAt: z.string(),
  slaResponseDeadline: z.string(),
  slaResolutionDeadline: z.string(),
  respondedAt: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  slaBreached: z.boolean().default(false),
  rootCause: z.string().nullable().optional(),
  resolutionSummary: z.string().nullable().optional(),
  sparePartsUsed: z.array(z.object({
    inventoryVariantId: z.string().uuid(),
    quantity: z.number().positive(),
    unitCost: z.number().nonnegative(),
  })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomMaintenanceTicket = z.infer<typeof TelecomMaintenanceTicketSchema>;

// =========================================================================
// 12. Quotation & Costing Schemas
// =========================================================================

export const TelecomQuotationCostItemSchema = z.object({
  category: z.enum(["EQUIPMENT", "MATERIALS", "LABOR", "TRAVEL_LOGISTICS", "SUBCONTRACTOR", "OVERHEAD", "CONTINGENCY"]),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  totalCost: z.number().nonnegative(),
});
export type TelecomQuotationCostItem = z.infer<typeof TelecomQuotationCostItemSchema>;

export const TelecomQuotationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  customerId: z.string().uuid(),
  quotationNumber: z.string().min(1),
  title: z.string().min(1),
  items: z.array(TelecomQuotationCostItemSchema),
  directCost: z.number().nonnegative(),
  laborCost: z.number().nonnegative(),
  logisticsCost: z.number().nonnegative(),
  overheadCost: z.number().nonnegative(),
  contingencyCost: z.number().nonnegative(),
  totalProjectCost: z.number().nonnegative(),
  targetMarginPct: z.number().nonnegative().default(25.0),
  customerPrice: z.number().nonnegative(),
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "CONVERTED_TO_PROJECT"]).default("DRAFT"),
  convertedProjectId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TelecomQuotation = z.infer<typeof TelecomQuotationSchema>;
