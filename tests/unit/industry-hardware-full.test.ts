import { describe, it, expect } from "vitest";
import { HardwareOperatingEngine } from "../../packages/domain/src/hardwareEngine.js";
import { runHardwareCertification } from "../../scripts/certification/runHardwareCertification.js";
import { renderHardwareDashboard } from "../../apps/web/src/hardwareDashboard.js";
import { globalHardwareService } from "../../apps/api/src/services/hardwareService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Hardware Business Operating System Full 55-Pillar Test Suite", () => {
  const engine = new HardwareOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["HARDWARE_MANAGER"],
    permissions: ["HARDWARE_PRODUCT_MANAGE"],
  };

  it("should return valid Hardware manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("hardware_operating_system");
    expect(manifest.supportedCategories).toContain("CONSTRUCTION_MATERIALS");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.enforceMinimumMarginPct).toBe(10.0);
    expect(settings.autoAlertOnStockoutDays).toBe(7);
  });

  it("should perform unit conversions accurately (Box -> Piece, Bag -> Kg)", () => {
    // 5 Boxes of PVC fittings -> 50 Pieces
    const pieces = engine.convertUnitQuantity(5, "Box", "Piece");
    expect(pieces).toBe(50);

    // 10 Bags of Cement -> 500 Kg
    const kgs = engine.convertUnitQuantity(10, "Bag", "Kg");
    expect(kgs).toBe(500);
  });

  it("should calculate retail margin % and enforce minimum threshold", () => {
    // Cost: 16,000 TZS. Retail: 20,000 TZS -> Margin: 4,000 TZS (20.0% -> meets >= 10% threshold)
    const margin = engine.calculateMarginPct(16000, 20000);
    expect(margin.marginTzs).toBe(4000);
    expect(margin.marginPct).toBe(20.0);
    expect(margin.meetsMinimumThreshold).toBe(true);

    // Cost: 19,500 TZS. Retail: 20,000 TZS -> Margin: 500 TZS (2.5% -> fails threshold)
    const lowMargin = engine.calculateMarginPct(19500, 20000);
    expect(lowMargin.meetsMinimumThreshold).toBe(false);
  });

  it("should calculate project material spend variance and overrun flags", () => {
    // Quoted 100M TZS, Actual 115M TZS -> 15M TZS variance (15.0% overrun)
    const project = engine.reconcileProjectMaterials(100000000, 115000000);
    expect(project.varianceTzs).toBe(15000000);
    expect(project.overrunPct).toBe(15.0);
    expect(project.hasOverrun).toBe(true);
  });

  it("should run 55-Point Hardware OS Certification Campaign", async () => {
    const cert = await runHardwareCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(55);
  });

  it("should render Super Admin & Hardware Command Center HTML Dashboard", () => {
    const html = renderHardwareDashboard();
    expect(html).toContain("KwakoPos Hardware Store & Project Command Center");
    expect(html).toContain("BUILDING MATERIALS & CONSTRUCTIONS CATALOG");
  });

  it("should create hardware product and project through globalHardwareService", () => {
    const prod = globalHardwareService.createProduct(dummyCtx, {
      name: "Dangote 42.5N Portland Cement 50kg",
      category: "CONSTRUCTION_MATERIALS",
      primaryUnit: "Bag",
      costPriceTzs: 17500,
      retailPriceTzs: 21500,
      contractorPriceTzs: 19500,
      currentStock: 450,
    });

    expect(prod.sku).toBeDefined();

    const proj = globalHardwareService.createProjectRequirement(dummyCtx, {
      projectName: "Kijitonyama Residential Complex Block A",
      contractorCustomerName: "Mbowe Builders Ltd",
      quotedCostTzs: 45000000,
    });

    expect(proj.status).toBe("QUOTED");
    expect(proj.quotedCostTzs).toBe(45000000);
  });
});
