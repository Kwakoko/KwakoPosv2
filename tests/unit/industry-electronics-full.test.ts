import { describe, it, expect } from "vitest";
import { ElectronicsOperatingEngine } from "../../packages/domain/src/electronicsEngine.js";
import { runElectronicsCertification } from "../../scripts/certification/runElectronicsCertification.js";
import { renderElectronicsDashboard } from "../../apps/web/src/electronicsDashboard.js";
import { globalElectronicsService } from "../../apps/api/src/services/electronicsService.js";
import type { TenantContext, SerializedDevice } from "@kwakopos2/contracts";

describe("Advanced Electronics Business Operating System Full 49-Pillar Test Suite", () => {
  const engine = new ElectronicsOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["ELECTRONICS_MANAGER"],
    permissions: ["ELECTRONICS_SERIAL_MANAGE"],
  };

  it("should return valid Electronics manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("electronics_operating_system");
    expect(manifest.supportedCategories).toContain("SMARTPHONES");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.enforceUniqueImeiRegistration).toBe(true);
    expect(settings.defaultWarrantyMonths).toBe(12);
  });

  it("should transition serialized device state machine legally and block invalid transitions", () => {
    const device: SerializedDevice = {
      id: "dev-01",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      productId: "p1",
      variantId: "v1",
      serialNumber: "SN-IPHONE15-881920",
      imei1: "359182094819201",
      currentWarehouseId: "w1",
      state: "RECEIVED",
      purchaseCostTzs: 2100000,
      retailPriceTzs: 2800000,
    };

    // Valid transition: RECEIVED -> INSPECTION -> AVAILABLE -> SOLD -> REPAIR_INTAKE
    const s1 = engine.transitionDeviceState(device, "INSPECTION");
    expect(s1.state).toBe("INSPECTION");

    const s2 = engine.transitionDeviceState(s1, "AVAILABLE");
    expect(s2.state).toBe("AVAILABLE");

    const s3 = engine.transitionDeviceState(s2, "SOLD");
    expect(s3.state).toBe("SOLD");

    const s4 = engine.transitionDeviceState(s3, "CUSTOMER_OWNED");
    expect(s4.state).toBe("CUSTOMER_OWNED");

    const s5 = engine.transitionDeviceState(s4, "REPAIR_INTAKE");
    expect(s5.state).toBe("REPAIR_INTAKE");

    // Invalid transition: RECEIVED directly to REPAIR_INTAKE -> Exception thrown
    expect(() => engine.transitionDeviceState(device, "REPAIR_INTAKE")).toThrow(
      "Invalid Serialized Device State Transition!"
    );
  });

  it("should verify warranty validity and calculate remaining coverage days", () => {
    const refDate = new Date("2026-08-28T00:00:00Z");
    // Sold 2026-01-01 with 12 months warranty -> Expiry 2027-01-01 -> Valid (126 days remaining)
    const valid = engine.verifyWarrantyValidity("2026-01-01", 12, refDate);
    expect(valid.isValid).toBe(true);
    expect(valid.daysRemaining).toBeGreaterThan(0);

    // Sold 2025-01-01 with 12 months warranty -> Expiry 2026-01-01 -> Expired (-239 days)
    const expired = engine.verifyWarrantyValidity("2025-01-01", 12, refDate);
    expect(expired.isValid).toBe(false);
  });

  it("should calculate technical repair job bill and labor ratio %", () => {
    // Parts: 120,000 TZS. Labor: 80,000 TZS -> Total: 200,000 TZS (40.0% labor ratio)
    const repair = engine.calculateRepairBill(120000, 80000);
    expect(repair.totalRepairCostTzs).toBe(200000);
    expect(repair.laborRatioPct).toBe(40.0);
  });

  it("should run 49-Point Electronics OS Certification Campaign", async () => {
    const cert = await runElectronicsCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(49);
  });

  it("should render Super Admin & Electronics Command Center HTML Dashboard", () => {
    const html = renderElectronicsDashboard();
    expect(html).toContain("KwakoPos Device Lifecycle & Technical Service Center");
    expect(html).toContain("SERIALIZED DEVICES & REPAIR SERVICE TICKETS");
  });

  it("should register serialized device and create repair job through globalElectronicsService", () => {
    const dev = globalElectronicsService.registerSerializedDevice(dummyCtx, {
      productId: "00000000-0000-0000-0000-000000000101",
      variantId: "00000000-0000-0000-0000-000000000201",
      serialNumber: "SN-IPHONE15-881920",
      imei1: "359182094819201",
      currentWarehouseId: "00000000-0000-0000-0000-000000000301",
      purchaseCostTzs: 2100000,
      retailPriceTzs: 2800000,
    });

    expect(dev.state).toBe("RECEIVED");

    // First transition device to AVAILABLE then SOLD then CUSTOMER_OWNED so it can enter REPAIR_INTAKE
    const s1 = engine.transitionDeviceState(dev, "INSPECTION");
    const s2 = engine.transitionDeviceState(s1, "AVAILABLE");
    const s3 = engine.transitionDeviceState(s2, "SOLD");
    const s4 = engine.transitionDeviceState(s3, "CUSTOMER_OWNED");

    // Replace in service map for test consistency
    (globalElectronicsService as any).deviceMap.set(dev.id, s4);

    const repair = globalElectronicsService.createRepairJob(dummyCtx, {
      serializedDeviceId: dev.id,
      customerId: "00000000-0000-0000-0000-000000000401",
      reportedIssue: "OLED Screen crack & battery replacement",
      assignedTechnicianUserId: "00000000-0000-0000-0000-000000000501",
      productId: dev.productId,
      variantId: dev.variantId,
      serialNumber: dev.serialNumber,
      currentWarehouseId: dev.currentWarehouseId,
      purchaseCostTzs: dev.purchaseCostTzs,
      retailPriceTzs: dev.retailPriceTzs,
    });

    expect(repair.repairTicketNumber).toBeDefined();
    expect(repair.status).toBe("INTAKE");

    const updatedDev = globalElectronicsService.getSerializedDevices(dummyCtx).find((d) => d.id === dev.id);
    expect(updatedDev?.state).toBe("REPAIR_INTAKE");
  });
});
