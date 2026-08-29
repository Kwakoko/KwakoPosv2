import { z } from "zod";

export const PropertyTypeSchema = z.enum([
  "RESIDENTIAL_APARTMENT",
  "RESIDENTIAL_VILLA",
  "COMMERCIAL_OFFICE",
  "RETAIL_SPACE",
  "WAREHOUSE",
  "INDUSTRIAL",
  "MIXED_USE",
  "LAND_PARCEL",
  "STUDENT_HOUSING",
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const UnitStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "APPLICATION",
  "OCCUPIED",
  "NOTICE_GIVEN",
  "VACANT",
  "MAINTENANCE",
]);
export type UnitStatus = z.infer<typeof UnitStatusSchema>;

export const PropertyMasterRecordSchema = z.object({
  id: z.string().uuid(),
  propertyCode: z.string(),
  propertyName: z.string(),
  propertyType: PropertyTypeSchema,
  address: z.string(),
  portfolioId: z.string().uuid(),
  propertyManagerId: z.string().uuid(),
  totalUnitsCount: z.number().int().positive(),
  occupiedUnitsCount: z.number().int().nonnegative(),
  occupancyRatePct: z.number().min(0).max(100),
  acquisitionCostUsd: z.number().nonnegative(),
  currentBookValueUsd: z.number().nonnegative(),
  createdAt: z.string(),
});
export type PropertyMasterRecord = z.infer<typeof PropertyMasterRecordSchema>;

export const RentableUnitRecordSchema = z.object({
  id: z.string().uuid(),
  unitNumber: z.string(),
  propertyId: z.string().uuid(),
  buildingName: z.string().optional(),
  floorNumber: z.number().int().default(1),
  areaSqFt: z.number().positive(),
  askingRentUsdPerMonth: z.number().nonnegative(),
  contractRentUsdPerMonth: z.number().nonnegative().optional(),
  status: UnitStatusSchema,
  currentLeaseId: z.string().uuid().optional(),
  currentTenantId: z.string().uuid().optional(),
});
export type RentableUnitRecord = z.infer<typeof RentableUnitRecordSchema>;

export const LeaseRecordSchema = z.object({
  id: z.string().uuid(),
  leaseNumber: z.string(),
  tenantId: z.string().uuid(),
  unitId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  monthlyBaseRentUsd: z.number().nonnegative(),
  annualEscalationPct: z.number().min(0).default(5),
  securityDepositHeldUsd: z.number().nonnegative(),
  billingFrequencyMonths: z.number().int().default(1), // 1 = monthly, 3 = quarterly, 12 = annual
  status: z.enum(["DRAFT", "ACTIVE", "NOTICE_GIVEN", "EXPIRED", "TERMINATED"]),
  versionNumber: z.number().int().default(1),
  executedAt: z.string(),
});
export type LeaseRecord = z.infer<typeof LeaseRecordSchema>;

export const RentInvoiceRecordSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string(),
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  unitId: z.string().uuid(),
  billingPeriod: z.string(), // e.g. "2026-09"
  baseRentUsd: z.number().nonnegative(),
  utilityChargesUsd: z.number().nonnegative().default(0),
  serviceChargesUsd: z.number().nonnegative().default(0),
  lateFeesUsd: z.number().nonnegative().default(0),
  totalInvoiceUsd: z.number().nonnegative(),
  amountPaidUsd: z.number().nonnegative().default(0),
  balanceDueUsd: z.number().nonnegative(),
  idempotencyKey: z.string(),
  status: z.enum(["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"]),
});
export type RentInvoiceRecord = z.infer<typeof RentInvoiceRecordSchema>;

export const SecurityDepositAccountSchema = z.object({
  tenantId: z.string().uuid(),
  leaseId: z.string().uuid(),
  unitId: z.string().uuid(),
  depositHeldUsd: z.number().nonnegative(),
  deductionsUsd: z.number().nonnegative().default(0),
  refundsUsd: z.number().nonnegative().default(0),
  currentBalanceUsd: z.number().nonnegative(),
});
export type SecurityDepositAccount = z.infer<typeof SecurityDepositAccountSchema>;

export const MaintenanceWorkOrderSchema = z.object({
  id: z.string().uuid(),
  workOrderNumber: z.string(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  category: z.enum(["PLUMBING", "ELECTRICAL", "HVAC", "STRUCTURAL", "APPLIANCE", "CLEANING", "SECURITY"]),
  priority: z.enum(["ROUTINE", "URGENT", "EMERGENCY"]),
  partsCostUsd: z.number().nonnegative().default(0),
  laborCostUsd: z.number().nonnegative().default(0),
  vendorCostUsd: z.number().nonnegative().default(0),
  totalWorkOrderCostUsd: z.number().nonnegative(),
  status: z.enum(["SUBMITTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "INSPECTED", "COMPLETED", "CANCELLED"]),
});
export type MaintenanceWorkOrder = z.infer<typeof MaintenanceWorkOrderSchema>;

export const RealEstateFinancialSummarySchema = z.object({
  totalPropertiesCount: z.number().int().nonnegative(),
  totalUnitsCount: z.number().int().nonnegative(),
  averageOccupancyRatePct: z.number().min(0).max(100),
  totalRentalRevenueUsd: z.number().nonnegative(),
  totalOperatingExpensesUsd: z.number().nonnegative(),
  totalMaintenanceCostUsd: z.number().nonnegative(),
  netOperatingIncomeNoiUsd: z.number(),
  grossMarginPct: z.number(),
  totalDepositsHeldUsd: z.number().nonnegative(),
  totalOverdueRentUsd: z.number().nonnegative(),
});
export type RealEstateFinancialSummary = z.infer<typeof RealEstateFinancialSummarySchema>;
