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
import {
  globalVehicleFleetOperatingEngine,
  VehicleFleetOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class VehicleFleetService {
  private engine: VehicleFleetOperatingEngine;
  private store: InMemoryStore;

  private vehicleMap: Map<string, FleetVehicle> = new Map();
  private driverMap: Map<string, FleetDriver> = new Map();
  private tripMap: Map<string, FleetTrip> = new Map();
  private fuelMap: Map<string, FuelLogRecord[]> = new Map();

  constructor(engine?: VehicleFleetOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalVehicleFleetOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): VehicleFleetModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): VehicleFleetSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  registerVehicle(
    ctx: TenantContext,
    vehicleData: Omit<FleetVehicle, "id" | "tenantId" | "branchId" | "status">
  ): FleetVehicle {
    const id = randomUUID();
    const vehicle: FleetVehicle = {
      ...vehicleData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      status: "AVAILABLE",
    };
    this.vehicleMap.set(id, vehicle);
    return vehicle;
  }

  getVehicles(ctx: TenantContext): FleetVehicle[] {
    return Array.from(this.vehicleMap.values()).filter(
      (v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId
    );
  }

  registerDriver(
    ctx: TenantContext,
    driverData: Omit<FleetDriver, "id" | "tenantId" | "branchId" | "driverCode" | "status">
  ): FleetDriver {
    const id = randomUUID();
    const driverCode = `DRV-${Math.floor(1000 + Math.random() * 9000)}`;
    const driver: FleetDriver = {
      ...driverData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      driverCode,
      status: "ACTIVE_COMPLIANT",
    };
    const compliance = this.engine.evaluateDriverCompliance(driver);
    driver.status = compliance.status;

    this.driverMap.set(id, driver);
    return driver;
  }

  dispatchTrip(
    ctx: TenantContext,
    tripData: { vehicleId: string; driverId: string; origin: string; destination: string; plannedDistanceKm: number }
  ): FleetTrip {
    const driver = this.driverMap.get(tripData.driverId);
    if (driver) {
      const compliance = this.engine.evaluateDriverCompliance(driver);
      if (!compliance.compliant) {
        throw new Error(`Driver Dispatch Violation! ${compliance.reason}`);
      }
    }

    const vehicle = this.vehicleMap.get(tripData.vehicleId);
    if (!vehicle) throw new Error(`Vehicle with ID '${tripData.vehicleId}' not found.`);

    const id = randomUUID();
    const tripNumber = `TRIP-${Math.floor(10000 + Math.random() * 90000)}`;
    const trip: FleetTrip = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      tripNumber,
      vehicleId: vehicle.id,
      driverId: tripData.driverId,
      origin: tripData.origin,
      destination: tripData.destination,
      plannedDistanceKm: tripData.plannedDistanceKm,
      startOdometerKm: vehicle.currentOdometerKm,
      tripCostTzs: 0,
      tripRevenueTzs: 0,
      status: "DISPATCHED",
      dispatchedAt: new Date().toISOString(),
    };

    vehicle.status = "ASSIGNED_TRIP";
    this.tripMap.set(id, trip);
    return trip;
  }

  getTrips(ctx: TenantContext): FleetTrip[] {
    return Array.from(this.tripMap.values()).filter(
      (t) => t.tenantId === ctx.tenantId && t.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): VehicleFleetAiRecommendation[] {
    const vehicles = this.getVehicles(ctx);
    const drivers = Array.from(this.driverMap.values()).filter((d) => d.tenantId === ctx.tenantId);
    const trips = this.getTrips(ctx);
    const fuelLogs = Array.from(this.fuelMap.values()).flat().filter((f) => f.tenantId === ctx.tenantId);

    return this.engine.generateExplainableAiRecommendations(ctx, vehicles, drivers, trips, fuelLogs);
  }
}

export const globalVehicleFleetService = new VehicleFleetService();
