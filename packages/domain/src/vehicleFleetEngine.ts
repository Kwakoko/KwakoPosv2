import { randomUUID } from "crypto";
import type {
  TenantContext,
  VehicleFleetModuleManifest,
  VehicleFleetSettings,
  FleetVehicle,
  FleetDriver,
  FleetTrip,
  FuelLogRecord,
  VehicleFleetAiRecommendation,
} from "@kwakopos2/contracts";

export class VehicleFleetOperatingEngine {
  getModuleManifest(): VehicleFleetModuleManifest {
    return {
      moduleId: "vehicle_fleet_operating_system",
      name: "KwakoPos Enterprise Vehicle & Fleet Management Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedVehicleTypes: ["CAR", "VAN", "PICKUP", "TRUCK", "BUS", "TRAILER", "TANKER", "MOTORCYCLE", "HEAVY_EQUIPMENT"],
      permissions: [
        "FLEET_VEHICLE_VIEW",
        "FLEET_VEHICLE_MANAGE",
        "FLEET_DRIVER_MANAGE",
        "FLEET_DISPATCH_EXECUTE",
        "FLEET_TRIP_MANAGE",
        "FLEET_FUEL_LOG",
        "FLEET_MAINTENANCE_MANAGE",
        "FLEET_PARTS_MANAGE",
        "FLEET_INSPECTION_MANAGE",
        "FLEET_AI_ANALYTICS_VIEW",
      ],
      navigationRoutes: [
        "/fleet/vehicles",
        "/fleet/drivers",
        "/fleet/dispatch",
        "/fleet/trips",
        "/fleet/fuel",
        "/fleet/maintenance",
        "/fleet/inspections",
        "/fleet/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_total_vehicles",
        "widget_fleet_utilization_pct",
        "widget_active_trips",
        "widget_fuel_cost_today",
        "widget_cost_per_km",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): VehicleFleetSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requireDriverComplianceCheckBeforeDispatch: true,
      preventiveMaintenanceIntervalKm: 10000,
      autoAlertOnFuelAnomalyPct: 15.0,
    };
  }

  calculateFuelEfficiency(
    distanceKm: number,
    litres: number,
    totalCostTzs: number
  ): {
    kmPerLitre: number;
    costPerKmTzs: number;
  } {
    if (litres <= 0 || distanceKm <= 0) return { kmPerLitre: 0, costPerKmTzs: 0 };

    const kmPerLitre = distanceKm / litres;
    const costPerKmTzs = totalCostTzs / distanceKm;

    return {
      kmPerLitre: parseFloat(kmPerLitre.toFixed(2)),
      costPerKmTzs: parseFloat(costPerKmTzs.toFixed(2)),
    };
  }

  evaluateDriverCompliance(driver: FleetDriver): {
    compliant: boolean;
    status: "ACTIVE_COMPLIANT" | "WARNING_EXPIRING" | "EXPIRED_RESTRICTED" | "SUSPENDED";
    reason?: string;
  } {
    if (driver.status === "SUSPENDED") {
      return { compliant: false, status: "SUSPENDED", reason: "Driver profile is suspended." };
    }

    const now = new Date();
    const expiry = new Date(driver.licenseExpiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { compliant: false, status: "EXPIRED_RESTRICTED", reason: "Driver driving license is EXPIRED!" };
    }
    if (diffDays <= 30) {
      return { compliant: true, status: "WARNING_EXPIRING", reason: `Driver license expires in ${diffDays} days.` };
    }

    return { compliant: true, status: "ACTIVE_COMPLIANT" };
  }

  calculateTripProfitability(
    revenueTzs: number,
    fuelCostTzs: number,
    maintenanceCostTzs: number,
    driverCostTzs: number,
    tollsTzs: number = 0
  ): {
    totalCostsTzs: number;
    tripMarginTzs: number;
    marginPct: number;
  } {
    const totalCostsTzs = fuelCostTzs + maintenanceCostTzs + driverCostTzs + tollsTzs;
    const tripMarginTzs = revenueTzs - totalCostsTzs;
    const marginPct = revenueTzs > 0 ? (tripMarginTzs / revenueTzs) * 100 : 0;

    return {
      totalCostsTzs: Math.round(totalCostsTzs),
      tripMarginTzs: Math.round(tripMarginTzs),
      marginPct: parseFloat(marginPct.toFixed(2)),
    };
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    vehicles: FleetVehicle[],
    drivers: FleetDriver[],
    trips: FleetTrip[],
    fuelLogs: FuelLogRecord[]
  ): VehicleFleetAiRecommendation[] {
    const recs: VehicleFleetAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Fuel Anomaly Warning
    if (fuelLogs.length > 0) {
      const avgEfficiency = 8.5; // Benchmark 8.5 km/L for trucks
      const anomalousLogs = fuelLogs.filter((f) => f.fuelConsumptionKmLitre && f.fuelConsumptionKmLitre < avgEfficiency * 0.7);

      if (anomalousLogs.length > 0) {
        recs.push({
          id: `REC-FLEET-FUEL-${randomUUID().slice(0, 6)}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          category: "FUEL_ANOMALY_WARNING",
          observation: `${anomalousLogs.length} fuel logs showed abnormal fuel consumption below benchmark.`,
          evidence: `Vehicle #${anomalousLogs[0].vehicleId} logged ${anomalousLogs[0].fuelConsumptionKmLitre} km/L vs benchmark ${avgEfficiency} km/L.`,
          recommendation: "Inspect fuel injector line and verify fuel station receipt vs telematics GPS location.",
          expectedImpact: "Saves up to 15% in fleet fuel leakage.",
          confidenceScore: 94,
          createdAt: now,
        });
      }
    }

    return recs;
  }
}

export const globalVehicleFleetOperatingEngine = new VehicleFleetOperatingEngine();
export const globalVehicleFleetEngine = globalVehicleFleetOperatingEngine;
export { VehicleFleetOperatingEngine as VehicleFleetEngine };
