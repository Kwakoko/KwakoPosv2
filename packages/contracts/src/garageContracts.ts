import { z } from "zod";

export const VehicleClassSchema = z.enum([
  "CAR",
  "MOTORCYCLE",
  "VAN",
  "PICKUP",
  "TRUCK",
  "BUS",
  "SPECIALIZED",
]);
export type VehicleClass = z.infer<typeof VehicleClassSchema>;

export const FuelTypeSchema = z.enum([
  "PETROL",
  "DIESEL",
  "HYBRID",
  "ELECTRIC",
  "LPG",
  "CNG",
]);
export type FuelType = z.infer<typeof FuelTypeSchema>;

export const TransmissionTypeSchema = z.enum([
  "MANUAL",
  "AUTOMATIC",
  "CVT",
  "DUAL_CLUTCH",
]);
export type TransmissionType = z.infer<typeof TransmissionTypeSchema>;

export const JobCardStatusSchema = z.enum([
  "CREATED",
  "CHECKED_IN",
  "INSPECTED",
  "DIAGNOSED",
  "ESTIMATED",
  "AWAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "TESTING",
  "QC_PENDING",
  "QC_PASSED",
  "READY_FOR_RELEASE",
  "RELEASED",
  "CLOSED",
  "CANCELLED",
]);
export type JobCardStatus = z.infer<typeof JobCardStatusSchema>;

export const InspectionSeveritySchema = z.enum([
  "PASS",
  "WARNING",
  "FAIL",
  "REPAIR_RECOMMENDED",
]);
export type InspectionSeverity = z.infer<typeof InspectionSeveritySchema>;

export const VehicleMasterRecordSchema = z.object({
  id: z.string().uuid(),
  registrationNumber: z.string(),
  vinChassisNumber: z.string(),
  engineNumber: z.string().optional(),
  make: z.string(),
  model: z.string(),
  year: z.number().int().min(1900).max(2100),
  variant: z.string().optional(),
  vehicleClass: VehicleClassSchema,
  fuelType: FuelTypeSchema,
  transmission: TransmissionTypeSchema,
  currentMileageKm: z.number().nonnegative(),
  color: z.string().optional(),
  customerId: z.string().uuid(),
  fleetReferenceId: z.string().optional(),
  serviceIntervalKm: z.number().int().default(10000),
  warrantyStatus: z.enum(["UNDER_WARRANTY", "EXPIRED", "WORKSHOP_WARRANTY"]),
  createdAt: z.string(),
});
export type VehicleMasterRecord = z.infer<typeof VehicleMasterRecordSchema>;

export const CheckInIntakeRecordSchema = z.object({
  id: z.string().uuid(),
  jobCardId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  intakeTimestamp: z.string(),
  mileageKm: z.number().nonnegative(),
  fuelLevelPct: z.number().min(0).max(100),
  existingScratchesMap: z.array(z.string()), // e.g. ["Front Bumper Scratch", "Rear Left Door Dent"]
  customerComplaints: z.array(z.string()),
  accessoriesReceived: z.array(z.string()), // e.g. ["Spare Tyre", "Jack", "Toolkit"]
  intakePhotosUrl: z.array(z.string()),
  keysReceived: z.boolean().default(true),
  customerSignatureUrl: z.string().optional(),
});
export type CheckInIntakeRecord = z.infer<typeof CheckInIntakeRecordSchema>;

export const InspectionItemResultSchema = z.object({
  componentName: z.string(), // e.g. "Front Brake Pads", "Battery Voltage"
  category: z.enum(["BRAKES", "TYRES", "SUSPENSION", "ENGINE", "TRANSMISSION", "BATTERY", "LIGHTS", "FLUIDS", "ELECTRICAL", "BODY"]),
  status: InspectionSeveritySchema,
  measuredValue: z.string().optional(), // e.g. "3mm", "12.4V"
  findingsNote: z.string().optional(),
  photoUrls: z.array(z.string()).default([]),
});
export type InspectionItemResult = z.infer<typeof InspectionItemResultSchema>;

export const EstimateLineItemSchema = z.object({
  id: z.string().uuid(),
  itemType: z.enum(["PART", "LABOR", "EXTERNAL_SERVICE", "CONSUMABLE"]),
  description: z.string(),
  partId: z.string().optional(),
  quantity: z.number().positive(),
  unitCostUsd: z.number().nonnegative(),
  unitPriceUsd: z.number().nonnegative(),
  taxPct: z.number().min(0).default(0),
  discountUsd: z.number().min(0).default(0),
  totalUsd: z.number().nonnegative(),
});
export type EstimateLineItem = z.infer<typeof EstimateLineItemSchema>;

export const EstimateRecordSchema = z.object({
  id: z.string().uuid(),
  jobCardId: z.string().uuid(),
  versionNumber: z.number().int().default(1),
  items: z.array(EstimateLineItemSchema),
  subtotalPartsUsd: z.number().nonnegative(),
  subtotalLaborUsd: z.number().nonnegative(),
  totalTaxUsd: z.number().nonnegative(),
  totalDiscountUsd: z.number().nonnegative(),
  grandTotalUsd: z.number().nonnegative(),
  approvalStatus: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]),
  approvedByCustomerAt: z.string().optional(),
  customerApprovalChannel: z.enum(["DIGITAL_SIGNATURE", "SMS_OTP", "IN_PERSON", "PHONE_RECORD"]).optional(),
});
export type EstimateRecord = z.infer<typeof EstimateRecordSchema>;

export const JobCardRecordSchema = z.object({
  id: z.string().uuid(),
  jobNumber: z.string(),
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  status: JobCardStatusSchema,
  assignedTechnicianId: z.string().uuid().optional(),
  assignedBayId: z.string().uuid().optional(),
  checkInMileageKm: z.number().nonnegative(),
  customerComplaints: z.array(z.string()),
  activeEstimateId: z.string().uuid().optional(),
  approvedCostUsd: z.number().nonnegative().default(0),
  actualCostUsd: z.number().nonnegative().default(0),
  qcPassedByTechnicianId: z.string().uuid().optional(),
  isReleased: z.boolean().default(false),
  releasedAt: z.string().optional(),
  createdAt: z.string(),
});
export type JobCardRecord = z.infer<typeof JobCardRecordSchema>;

export const PartsReservationItemSchema = z.object({
  jobCardId: z.string().uuid(),
  partId: z.string().uuid(),
  partSku: z.string(),
  quantityReserved: z.number().positive(),
  quantityIssued: z.number().nonnegative().default(0),
  quantityReturned: z.number().nonnegative().default(0),
  stockLedgerEventId: z.string().optional(),
});
export type PartsReservationItem = z.infer<typeof PartsReservationItemSchema>;

export const LaborTimeRecordSchema = z.object({
  id: z.string().uuid(),
  jobCardId: z.string().uuid(),
  technicianId: z.string().uuid(),
  taskDescription: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  hoursSpent: z.number().nonnegative(),
  costRateUsdPerHour: z.number().nonnegative(),
  billingRateUsdPerHour: z.number().nonnegative(),
  laborCostUsd: z.number().nonnegative(),
  laborRevenueUsd: z.number().nonnegative(),
});
export type LaborTimeRecord = z.infer<typeof LaborTimeRecordSchema>;

export const PredictiveMaintenanceAlertSchema = z.object({
  vehicleId: z.string().uuid(),
  componentName: z.string(),
  failureRiskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  evidenceReason: z.string(),
  recommendedServiceWindowKm: z.number().int(),
  estimatedRepairCostUsd: z.number().nonnegative(),
});
export type PredictiveMaintenanceAlert = z.infer<typeof PredictiveMaintenanceAlertSchema>;

export const GarageFinancialSummarySchema = z.object({
  totalJobCardsCount: z.number().int().nonnegative(),
  totalPartsRevenueUsd: z.number().nonnegative(),
  totalPartsCostUsd: z.number().nonnegative(),
  totalLaborRevenueUsd: z.number().nonnegative(),
  totalLaborCostUsd: z.number().nonnegative(),
  grossMarginUsd: z.number(),
  marginPct: z.number(),
});
export type GarageFinancialSummary = z.infer<typeof GarageFinancialSummarySchema>;
