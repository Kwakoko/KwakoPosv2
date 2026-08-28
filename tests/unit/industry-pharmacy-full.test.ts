import { describe, it, expect } from "vitest";
import { PharmacyOperatingEngine } from "../../packages/domain/src/pharmacyEngine.js";
import { runPharmacyCertification } from "../../scripts/certification/runPharmacyCertification.js";
import { renderPharmacyDashboard } from "../../apps/web/src/pharmacyDashboard.js";
import { globalPharmacyService } from "../../apps/api/src/services/pharmacyService.js";
import type { TenantContext, BatchRecord, MedicineMaster } from "@kwakopos2/contracts";

describe("Pharmacy Operating System Full 28-Pillar Test Suite", () => {
  const engine = new PharmacyOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["PHARMACIST"],
    permissions: ["PHARMACY_DISPENSE_EXECUTE"],
  };

  it("should return valid Pharmacy manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("pharmacy_operating_system");
    expect(manifest.supportedFormats).toContain("RETAIL_PHARMACY");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.defaultDispensingStrategy).toBe("FEFO");
    expect(settings.allowExpiredDispensing).toBe(false);
  });

  it("should select batches strictly using FEFO (First Expiry, First Out) and exclude expired batches", () => {
    const batches: BatchRecord[] = [
      { id: "b-later", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, medicineId: "m1", batchNumber: "BAT-002", supplierId: "sup-1", manufacturingDate: "2025-01-01", expiryDate: "2027-12-31", initialQuantity: 100, currentQuantity: 100, unitCost: 200, status: "AVAILABLE" },
      { id: "b-sooner", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, medicineId: "m1", batchNumber: "BAT-001", supplierId: "sup-1", manufacturingDate: "2025-01-01", expiryDate: "2026-10-15", initialQuantity: 30, currentQuantity: 30, unitCost: 200, status: "AVAILABLE" },
      { id: "b-expired", tenantId: dummyCtx.tenantId, branchId: dummyCtx.branchId, medicineId: "m1", batchNumber: "BAT-EXPIRED", supplierId: "sup-1", manufacturingDate: "2024-01-01", expiryDate: "2025-01-01", initialQuantity: 50, currentQuantity: 50, unitCost: 200, status: "EXPIRED" },
    ];

    const fefo = engine.selectBatchFEFO(batches, 40);
    expect(fefo.fulfilled).toBe(true);
    expect(fefo.selectedBatches).toHaveLength(2);
    // Should take all 30 from BAT-001 (sooner expiry) first, then 10 from BAT-002
    expect(fefo.selectedBatches[0].batchNumber).toBe("BAT-001");
    expect(fefo.selectedBatches[0].quantityToTake).toBe(30);
    expect(fefo.selectedBatches[1].batchNumber).toBe("BAT-002");
    expect(fefo.selectedBatches[1].quantityToTake).toBe(10);
  });

  it("should classify expiry status accurately based on days remaining", () => {
    const now = new Date();
    const dateExpired = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const dateCritical = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
    const dateNear = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const dateSafe = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

    expect(engine.classifyExpiryStatus(dateExpired)).toBe("EXPIRED");
    expect(engine.classifyExpiryStatus(dateCritical)).toBe("CRITICAL");
    expect(engine.classifyExpiryStatus(dateNear, 90)).toBe("APPROACHING_EXPIRY");
    expect(engine.classifyExpiryStatus(dateSafe)).toBe("SAFE");
  });

  it("should detect AI drug safety alerts (duplicate active ingredients and patient allergy conflicts)", () => {
    const medicine: MedicineMaster = {
      id: "m1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      genericName: "Amoxicillin",
      brandName: "Amoxil",
      activeIngredients: [{ name: "Amoxicillin", strength: "500mg" }],
      dosageForm: "CAPSULE",
      strength: "500mg",
      routeOfAdministration: "ORAL",
      packSize: 10,
      unitOfMeasure: "Capsule",
      sku: "MED-AMO-500",
      requiresPrescription: true,
      isControlledSubstance: false,
      purchasePrice: 200,
      sellingPrice: 500,
      reorderLevel: 20,
    };

    const patient = {
      id: "pat-1",
      tenantId: dummyCtx.tenantId,
      branchId: dummyCtx.branchId,
      patientCode: "PAT-001",
      name: "Juma Rashid",
      knownAllergies: ["Amoxicillin", "Penicillin"],
      chronicConditions: [],
    };

    const alerts = engine.evaluateDrugSafety(dummyCtx, medicine, patient, ["Amoxicillin"]);
    expect(alerts.length).toBeGreaterThanOrEqual(2);
    expect(alerts.some((a) => a.alertType === "DUPLICATE_ACTIVE_INGREDIENT")).toBe(true);
    expect(alerts.some((a) => a.alertType === "ALLERGY_CONFLICT")).toBe(true);
  });

  it("should run 28-Point Pharmacy OS Certification Campaign", async () => {
    const cert = await runPharmacyCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(28);
  });

  it("should render Super Admin & FEFO Pharmacy HTML Dashboard", () => {
    const html = renderPharmacyDashboard();
    expect(html).toContain("KwakoPos Clinical Pharmacy & FEFO Dispensing");
    expect(html).toContain("DISPENSING & BATCH TRACEABILITY");
  });

  it("should execute FEFO dispensing through globalPharmacyService", () => {
    const med = globalPharmacyService.createMedicine(dummyCtx, {
      genericName: "Paracetamol",
      brandName: "Panadol",
      activeIngredients: [{ name: "Paracetamol", strength: "500mg" }],
      dosageForm: "TABLET",
      strength: "500mg",
      routeOfAdministration: "ORAL",
      packSize: 100,
      unitOfMeasure: "Tablet",
      sku: "MED-PARA-500",
      requiresPrescription: false,
      isControlledSubstance: false,
      purchasePrice: 50,
      sellingPrice: 150,
      reorderLevel: 100,
    });

    const batch = globalPharmacyService.receiveBatch(dummyCtx, {
      medicineId: med.id,
      batchNumber: "BAT-PARA-001",
      supplierId: "sup-100",
      manufacturingDate: "2025-01-01",
      expiryDate: "2027-12-31",
      initialQuantity: 500,
      unitCost: 50,
    });

    const disp = globalPharmacyService.dispenseMedicineFEFO(dummyCtx, {
      medicineId: med.id,
      quantityRequired: 50,
    });

    expect(disp.fulfilled).toBe(true);
    expect(disp.dispensingRecords).toHaveLength(1);
    expect(disp.dispensingRecords[0].batchNumber).toBe("BAT-PARA-001");
    expect(disp.dispensingRecords[0].quantityDispensed).toBe(50);
  });
});
