import { z } from "zod";

export const VehicleFleetModuleManifestSchema = z.object({
  moduleId: z.literal("vehicle_fleet_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedVehicleTypes: z.array(
    z.enum(["CAR", "VAN", "PICKUP", "TRUCK", "BUS", "TRAILER", "TANKER", "MOTORCYCLE", "HEAVY_EQUIPMENT"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type VehicleFleetModuleManifest = z.infer<typeof VehicleFleetModuleManifestSchema>;

export const VehicleFleetSettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requireDriverComplianceCheckBeforeDispatch: z.boolean().default(true),
  preventiveMaintenanceIntervalKm: z.number().default(10000),
  autoAlertOnFuelAnomalyPct: z.number().default(15.0),
});
export type VehicleFleetSettings = z.infer<typeof VehicleFleetSettingsSchema>;

export const FleetVehicleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  registrationNumber: z.string(),
  vinChassisNumber: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number(),
  vehicleType: z.string(),
  fuelType: z.enum(["DIESEL", "PETROL", "HYBRID", "ELECTRIC"]),
  currentOdometerKm: z.number(),
  status: z.enum(["AVAILABLE", "ASSIGNED_TRIP", "UNDER_MAINTENANCE", "OUT_OF_SERVICE", "DISPOSED"]),
});
export type FleetVehicle = z.infer<typeof FleetVehicleSchema>;

export const FleetDriverSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  driverCode: z.string(),
  fullName: z.string(),
  licenseNumber: z.string(),
  licenseClasses: z.array(z.string()),
  licenseExpiryDate: z.string().or(z.date()),
  status: z.enum(["ACTIVE_COMPLIANT", "WARNING_EXPIRING", "EXPIRED_RESTRICTED", "SUSPENDED"]),
});
export type FleetDriver = z.infer<typeof FleetDriverSchema>;

export const FleetTripSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  tripNumber: z.string(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  origin: z.string(),
  destination: z.string(),
  plannedDistanceKm: z.number(),
  actualDistanceKm: z.number().optional(),
  startOdometerKm: z.number(),
  endOdometerKm: z.number().optional(),
  tripCostTzs: z.number().default(0),
  tripRevenueTzs: z.number().default(0),
  status: z.enum(["DISPATCHED", "IN_TRANSIT", "COMPLETED", "CANCELLED"]),
  dispatchedAt: z.string().or(z.date()),
  completedAt: z.string().or(z.date()).optional(),
});
export type FleetTrip = z.infer<typeof FleetTripSchema>;

export const FuelLogRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
  litres: z.number(),
  pricePerLitreTzs: z.number(),
  totalCostTzs: z.number(),
  odometerKm: z.number(),
  fuelStation: z.string(),
  fuelConsumptionKmLitre: z.number().optional(),
  timestamp: z.string().or(z.date()),
});
export type FuelLogRecord = z.infer<typeof FuelLogRecordSchema>;

export const VehicleFleetAiRecommendationSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  category: z.enum([
    "FUEL_ANOMALY_WARNING",
    "PREDICTIVE_MAINTENANCE_DUE",
    "DRIVER_SAFETY_COACHING",
    "VEHICLE_UNDERUTILIZATION",
    "REPLACEMENT_RECOMMENDATION",
  ]),
  observation: z.string(),
  evidence: z.string(),
  recommendation: z.string(),
  expectedImpact: z.string(),
  confidenceScore: z.number().min(0).max(100),
  createdAt: z.string().or(z.date()),
});
export type VehicleFleetAiRecommendation = z.infer<typeof VehicleFleetAiRecommendationSchema>;

export const VehicleFleetEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(
    z.object({
      pillarId: z.number(),
      pillarName: z.string(),
      passed: z.boolean(),
      details: z.string(),
    })
  ),
  digest: z.string(),
});
export type VehicleFleetEvidencePackage = z.infer<typeof VehicleFleetEvidencePackageSchema>;
