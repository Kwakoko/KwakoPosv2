import { describe, it, expect } from "vitest";
import { VehicleFleetOperatingEngine } from "../../packages/domain/src/vehicleFleetEngine.js";
import { runVehicleFleetCertification } from "../../scripts/certification/runVehicleFleetCertification.js";
import { renderVehicleFleetDashboard } from "../../apps/web/src/vehicleFleetDashboard.js";
import { globalVehicleFleetService } from "../../apps/api/src/services/vehicleFleetService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Vehicle & Fleet Management Operating System Full 50-Pillar Test Suite", () => {
  const engine = new VehicleFleetOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["FLEET_MANAGER"],
    permissions: ["FLEET_DISPATCH_EXECUTE"],
  };

  it("should return valid Vehicle & Fleet manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("vehicle_fleet_operating_system");
    expect(manifest.supportedVehicleTypes).toContain("TRUCK");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.requireDriverComplianceCheckBeforeDispatch).toBe(true);
    expect(settings.preventiveMaintenanceIntervalKm).toBe(10000);
  });

  it("should calculate fuel efficiency (km/L) and cost per kilometer", () => {
    // 500 km distance on 50 Litres costing 150,000 TZS -> 10.0 km/L, 300 TZS/km
    const fuel = engine.calculateFuelEfficiency(500, 50, 150000);
    expect(fuel.kmPerLitre).toBe(10.0);
    expect(fuel.costPerKmTzs).toBe(300.0);
  });

  it("should evaluate driver compliance and block expired license dispatches", () => {
    const validDriver = {
      id: "d1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      driverCode: "DRV-001",
      fullName: "Juma Kibona",
      licenseNumber: "TZ-DL-99182",
      licenseClasses: ["CLASS_C", "CLASS_E"],
      licenseExpiryDate: "2027-12-31",
      status: "ACTIVE_COMPLIANT" as const,
    };
    expect(engine.evaluateDriverCompliance(validDriver).compliant).toBe(true);

    const expiredDriver = {
      ...validDriver,
      licenseExpiryDate: "2025-01-01",
    };
    const checkExpired = engine.evaluateDriverCompliance(expiredDriver);
    expect(checkExpired.compliant).toBe(false);
    expect(checkExpired.status).toBe("EXPIRED_RESTRICTED");
  });

  it("should calculate trip profitability and margin %: Revenue - Costs", () => {
    // Revenue: 2,500,000 TZS. Costs: Fuel 800k, Maintenance 200k, Driver 300k, Tolls 50k -> Total Cost: 1.35M. Margin: 1.15M (46.0%)
    const profit = engine.calculateTripProfitability(2500000, 800000, 200000, 300000, 50000);
    expect(profit.totalCostsTzs).toBe(1350000);
    expect(profit.tripMarginTzs).toBe(1150000);
    expect(profit.marginPct).toBe(46.0);
  });

  it("should run 50-Point Vehicle & Fleet OS Certification Campaign", async () => {
    const cert = await runVehicleFleetCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(50);
  });

  it("should render Super Admin & Fleet Operations HTML Dashboard", () => {
    const html = renderVehicleFleetDashboard();
    expect(html).toContain("KwakoPos Digital Fleet Operations & GPS Dispatch");
    expect(html).toContain("ACTIVE DISPATCH TRIPS & FLEET LOGISTICS");
  });

  it("should register vehicle and dispatch trip through globalVehicleFleetService", () => {
    const veh = globalVehicleFleetService.registerVehicle(dummyCtx, {
      registrationNumber: "T 882 DKL",
      vinChassisNumber: "VIN-SCANIA-991823",
      make: "Scania",
      model: "R450 Semi-Trailer",
      year: 2023,
      vehicleType: "TRUCK",
      fuelType: "DIESEL",
      currentOdometerKm: 95000,
    });

    const driver = globalVehicleFleetService.registerDriver(dummyCtx, {
      fullName: "Juma Kibona",
      licenseNumber: "TZ-DL-99182",
      licenseClasses: ["CLASS_C", "CLASS_E"],
      licenseExpiryDate: "2027-12-31",
    });

    const trip = globalVehicleFleetService.dispatchTrip(dummyCtx, {
      vehicleId: veh.id,
      driverId: driver.id,
      origin: "Dar es Salaam",
      destination: "Mwanza",
      plannedDistanceKm: 1150,
    });

    expect(trip.tripNumber).toBeDefined();
    expect(trip.status).toBe("DISPATCHED");
    expect(veh.status).toBe("ASSIGNED_TRIP");

    const trips = globalVehicleFleetService.getTrips(dummyCtx);
    expect(trips.length).toBeGreaterThan(0);
  });
});
