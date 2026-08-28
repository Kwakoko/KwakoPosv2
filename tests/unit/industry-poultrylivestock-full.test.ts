import { describe, it, expect } from "vitest";
import { PoultryLivestockOperatingEngine } from "../../packages/domain/src/poultryLivestockEngine.js";
import { runPoultryLivestockCertification } from "../../scripts/certification/runPoultryLivestockCertification.js";
import { renderPoultryLivestockDashboard } from "../../apps/web/src/poultryLivestockDashboard.js";
import { globalPoultryLivestockService } from "../../apps/api/src/services/poultryLivestockService.js";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Poultry & Livestock Operating System Full 52-Pillar Test Suite", () => {
  const engine = new PoultryLivestockOperatingEngine();
  const dummyCtx: TenantContext = {
    tenantId: "00000000-0000-0000-0000-000000000001",
    branchId: "00000000-0000-0000-0000-000000000002",
    userId: "00000000-0000-0000-0000-000000000003",
    roles: ["FARM_MANAGER"],
    permissions: ["FARM_FLOCK_MANAGE"],
  };

  it("should return valid Poultry & Livestock manifest & default settings", () => {
    const manifest = engine.getModuleManifest();
    expect(manifest.moduleId).toBe("poultry_livestock_operating_system");
    expect(manifest.supportedSpecies).toContain("POULTRY_LAYERS");

    const settings = engine.getDefaultSettings(dummyCtx.tenantId, dummyCtx.branchId);
    expect(settings.currency).toBe("TZS");
    expect(settings.requireVaccinationReminders).toBe(true);
    expect(settings.autoAlertOnHighMortalityPct).toBe(2.0);
  });

  it("should reconcile flock population: Current Birds = Opening + Additions - Mortality - Culls - TransfersOut", () => {
    // Opening 5,000 birds. Add 0, Mortality 50, Culls 10, Transfers 0 -> Current: 4,940
    const rec = engine.reconcileFlockPopulation(5000, 0, 50, 10, 0);
    expect(rec.currentBirds).toBe(4940);
    expect(rec.mortalityRatePct).toBe(1.0); // 50 / 5000 * 100 = 1.0%

    // Negative population attempt -> Exception thrown
    expect(() => engine.reconcileFlockPopulation(100, 0, 150, 0)).toThrow("Population Invariant Violation!");
  });

  it("should calculate Feed Conversion Ratio (FCR) and Lay Rate %", () => {
    // 3,000 kg feed consumed for 1,800 kg weight gain -> FCR = 1.67
    const fcr = engine.calculateFeedConversionRatio(3000, 1800);
    expect(fcr).toBe(1.67);

    // 5,400 good eggs collected from 6,000 eligible layers -> Lay Rate = 90.0%
    const layRate = engine.calculateLayRatePct(5400, 6000);
    expect(layRate).toBe(90.0);
  });

  it("should run 52-Point Poultry & Livestock OS Certification Campaign", async () => {
    const cert = await runPoultryLivestockCertification();
    expect(cert.passed).toBe(true);
    expect(cert.evidencePackage.status).toBe("CERTIFIED");
    expect(cert.evidencePackage.evaluations.length).toBe(52);
  });

  it("should render Super Admin & Farm Command Center HTML Dashboard", () => {
    const html = renderPoultryLivestockDashboard();
    expect(html).toContain("KwakoPos Digital Farm & Livestock Command Center");
    expect(html).toContain("FLOCK BATCHES & EGG LAYING PERFORMANCE");
  });

  it("should record egg collections through globalPoultryLivestockService", () => {
    const flock = globalPoultryLivestockService.createFlockBatch(dummyCtx, {
      farmName: "Main Farm Site A",
      houseNumber: "House 01",
      species: "POULTRY_LAYERS",
      breed: "Lohmann Brown",
      placementDate: "2025-06-01",
      openingQuantity: 6000,
    });

    const eggRec = globalPoultryLivestockService.recordEggCollection(dummyCtx, {
      flockId: flock.id,
      totalGoodEggs: 5400,
      totalBrokenEggs: 30,
      totalDirtyEggs: 20,
    });

    expect(eggRec.totalGoodEggs).toBe(5400);
    expect(eggRec.layRatePct).toBe(90.0);
    expect(eggRec.recordedByUserId).toBe(dummyCtx.userId);
  });
});
