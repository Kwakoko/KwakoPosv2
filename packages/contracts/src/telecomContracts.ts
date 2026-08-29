import { z } from "zod";

export const TechnicalAssetLifecycleSchema = z.enum([
  "PROCURED",
  "RECEIVED",
  "INSPECTED",
  "IN_STOCK",
  "RESERVED",
  "INSTALLED",
  "ACTIVE",
  "MAINTENANCE",
  "FAULTED",
  "REPAIRED",
  "RETIRED",
]);
export type TechnicalAssetLifecycle = z.infer<typeof TechnicalAssetLifecycleSchema>;

export const SiteHierarchyRecordSchema = z.object({
  id: z.string().uuid(),
  siteCode: z.string(),
  siteName: z.string().optional(),
  customerId: z.string().uuid().optional(),
  address: z.string().optional(),
  gpsLatitude: z.number().optional(),
  gpsLongitude: z.number().optional(),
  siteType: z.enum([
    "CELL_TOWER",
    "FIBER_POP",
    "DATA_CENTER",
    "ENTERPRISE_BUILDING",
    "CUSTOMER_PREMISE",
    "GREENFIELD_TOWER",
    "ROOFTOP_TOWER",
  ]),
  powerBackupType: z.enum(["GENERATOR", "SOLAR", "BATTERY_UPS", "GRID_ONLY", "GRID_COMMERCIAL"]).optional(),
  createdAt: z.string(),
});
export type SiteHierarchyRecord = z.infer<typeof SiteHierarchyRecordSchema>;
export type TelecomSite = SiteHierarchyRecord & {
  tenantId: string;
  branchId?: string | null;
  updatedAt?: string;

  name?: string;
  status?: string;
  latitude?: number;
  longitude?: number;
  elevationMeters?: number;
  towerHeightMeters?: number;
  region?: string;
  district?: string;
  powerSource?: string;
  photos?: string[];
  documents?: string[];
};

export const TechnicalAssetRecordSchema = z.object({
  id: z.string().uuid(),
  assetTag: z.string(),
  serialNumber: z.string(),
  macAddress: z.string().optional(),
  deviceModel: z.string(),
  manufacturer: z.string(),
  siteId: z.string().uuid(),
  rackLocation: z.string().optional(),
  status: TechnicalAssetLifecycleSchema,
  installationDate: z.string().optional(),
  warrantyExpiryDate: z.string().optional(),
});
export type TechnicalAssetRecord = z.infer<typeof TechnicalAssetRecordSchema>;

export const WorkOrderIncidentRecordSchema = z.object({
  id: z.string().uuid(),
  workOrderNumber: z.string(),
  customerId: z.string().uuid().optional(),
  siteId: z.string().uuid(),
  assetId: z.string().uuid().optional(),
  issueCategory: z.enum(["FIBER_CUT", "RADIO_FAULT", "POWER_OUTAGE", "ROUTER_CONFIG", "EQUIPMENT_FAIL"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  slaResponseTargetHours: z.number().positive().default(2).optional(),
  slaResolutionTargetHours: z.number().positive().default(4).optional(),
  assignedTechnicianId: z.string().uuid().optional(),
  actualResponseHours: z.number().nonnegative().optional(),
  actualResolutionHours: z.number().nonnegative().optional(),
  slaBreached: z.boolean().default(false).optional(),
  status: z.enum(["LOGGED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "VERIFIED", "CLOSED", "COMPLETED"]),
  createdAt: z.string(),
});
export type WorkOrderIncidentRecord = z.infer<typeof WorkOrderIncidentRecordSchema>;
export type TelecomWorkOrder = WorkOrderIncidentRecord & {
  tenantId: string;
  branchId?: string | null;
  updatedAt?: string;
  title?: string;
  workType?: string;
  assignedTeam?: string;
  leadTechnicianId?: string;
  technicianIds?: string[];
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  actualStartTime?: string | null;
  actualEndTime?: string | null;
  totalLaborHours?: number;
  laborCost?: number;
  checklistVersion?: number;
  checklistItems?: any[];
  completionNotes?: string | null;
  idempotencyKey?: string;
};

export const FiberTestResultRecordSchema = z.object({
  id: z.string().uuid(),
  workOrderId: z.string().uuid().optional(),
  cableId: z.string().optional(),
  coreNumber: z.number().int().positive().optional(),
  otdrLossDb: z.number().nonnegative().optional(),
  spliceLossDb: z.number().nonnegative().optional(),
  maxAllowedLossDb: z.number().nonnegative().default(0.5).optional(),
  passed: z.boolean(),
  testedAt: z.string(),
});
export type FiberTestResultRecord = z.infer<typeof FiberTestResultRecordSchema>;
export type TelecomTestRecord = FiberTestResultRecord & {
  tenantId: string;
  createdAt?: string;
  siteId?: string;
  testType?: string;
  parameterName?: string;
  expectedValue?: string;
  measuredValue?: string;
  unit?: string;
  testedById?: string;
  testEquipmentSerialNumber?: string;
  traceAttachmentUrl?: string | null;
};

export const CustomerAcceptanceRecordSchema = z.object({
  workOrderId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  acceptedByRepresentative: z.string().optional(),
  signatureUrl: z.string().optional(),
  acceptedAt: z.string(),
});
export type CustomerAcceptanceRecord = z.infer<typeof CustomerAcceptanceRecordSchema>;
export type TelecomAcceptanceRecord = CustomerAcceptanceRecord & {
  id?: string;
  tenantId: string;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string;
  siteId?: string;
  satNumber?: string;
  acceptanceType?: string;
  status?: string;
  leadEngineerId?: string;
  customerRepresentativeName?: string;
  customerSignatureUrl?: string;
  mandatoryTestsPassed?: boolean;
  openPunchlistItemsCount?: number;
  triggersBillingMilestone?: boolean;
  billingInvoiceId?: string | null;
  remarks?: string;
  handoverPackageSummary?: any;
};

export const TelecomFinancialSummarySchema = z.object({
  totalWorkOrdersCount: z.number().int().nonnegative(),
  totalEquipmentRevenueUsd: z.number().nonnegative(),
  totalLaborRevenueUsd: z.number().nonnegative(),
  totalMaterialCostUsd: z.number().nonnegative(),
  totalSlaPenaltyDeductionsUsd: z.number().nonnegative().default(0),
  grossMarginUsd: z.number(),
  grossMarginPct: z.number(),
});
export type TelecomFinancialSummary = z.infer<typeof TelecomFinancialSummarySchema>;

// =========================================================================
// Legacy Telecom & Field Service Contract Aliases for Monorepo Compatibility
// =========================================================================

export interface TelecomSurvey {
  id: string;
  siteId: string;
  surveyNumber: string;
  powerRequirementsKva: number;
  rackSpaceUnits: number;
  fiberPathLengthMeters: number;
  surveyorName: string;
  photos: string[];
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
}

export interface TelecomRanSector {
  id: string;
  tenantId: string;
  siteId: string;
  sectorName: string;
  sectorIndex: number;
  technology: string;
  frequencyBandMhz: number;
  carrierBandwidthMhz: number;
  antennaModel: string;
  antennaGainDbi: number;
  azimuthDegrees: number;
  mechanicalTiltDegrees: number;
  electricalTiltDegrees: number;
  antennaHeightMeters: number;
  radioUnitModel: string;
  radioUnitSerialNumber: string;
  txPowerWatts: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelecomMicrowaveLink {
  id: string;
  tenantId: string;
  status: string;
  linkCode: string;
  name: string;
  siteAId: string;
  siteBId: string;
  frequencyGhz: number;
  channelBandwidthMhz: number;
  txPowerDbm: number;
  antennaDiameterMetersSiteA: number;
  antennaDiameterMetersSiteB: number;
  antennaGainDbiSiteA: number;
  antennaGainDbiSiteB: number;
  polarization: string;
  feederLossSiteADb: number;
  feederLossSiteBDb: number;
  siteAAntennaHeightMeters: number;
  siteBAntennaHeightMeters: number;
  expectedThroughputMbps: number;
  availabilityTargetPct: number;
  calculation?: any;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelecomMaintenanceTicket {
  id: string;
  ticketNumber: string;
  tenantId: string;
  branchId?: string | null;
  siteId: string;
  assetId?: string;
  severity: string;
  status: string;
  slaResponseDeadline?: string;
  slaResolutionDeadline?: string;
  respondedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelecomCustomerContract {
  id: string;
  contractNumber: string;
  customerId: string;
  slaResponseHours: number;
  slaResolutionHours: number;
  status: string;
  tenantId: string;
  branchId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelecomProject {
  id: string;
  projectCode: string;
  customerId: string;
  totalBudgetUsd: number;
  budgetAmount?: number;
  status: string;
  tenantId: string;
  branchId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TelecomQuotation {
  id: string;
  quotationNumber: string;
  totalProjectCost: number;
  customerPrice: number;
  marginPct: number;
  tenantId?: string;
  customerId?: string;
  title?: string;
  items?: any[];
  directCost?: number;
  laborCost?: number;
  logisticsCost?: number;
  overheadCost?: number;
  contingencyCost?: number;
  targetMarginPct?: number;
  status?: string;
  convertedProjectId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}



export interface TelecomQuotationCostItem {
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
}

export interface TelecomChecklistItem {
  id: string;
  title?: string;
  category?: string;
  description?: string;
  passed: boolean;
  isRequired?: boolean;
}

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
  elevationMeters?: number;
}

export interface GeoPlacemark {
  id: string;
  name: string;
  coordinate?: GeoCoordinate;
  coordinates?: GeoCoordinate[] | GeoCoordinate;
  description?: string | null;
  geometryType?: string;
  layerName?: string;
  extendedData?: Record<string, any>;
}

export interface KmlImportRecord {
  id: string;
  tenantId?: string;
  fileName: string;
  parsedPlacemarks: GeoPlacemark[];
  status: "PARSED" | "IMPORTED" | "FAILED" | "PARSED_PREVIEW";
  sha256Hash?: string;
  fileSizeBytes?: number;
  fileType?: string;
  totalPlacemarksParsed?: number;
  sitesCreated?: number;
  importedById?: string;
  importedAt?: string;
  errorMessage?: string | null;
}
