import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { ScopedTelecomRepository, InMemoryStore } from "@kwakopos2/database";
import { TelecomWorkflowEngine, TelecomCostingEngine } from "@kwakopos2/domain";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Phase 5 Telecom Operational Workflows & Lifecycle", () => {
  const ctx: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ENGINEER", "ADMIN"],
    permissions: ["ALL"],
  };

  const store = new InMemoryStore();
  const repo = new ScopedTelecomRepository(store);

  it("executes End-to-End: Site Creation -> RAN Sector -> Work Order -> Tests -> SAT Acceptance -> Handover", () => {
    // 1. Create Site
    const site = repo.createSite(ctx, {
      siteCode: "TZ-KWA-001",
      name: "Kwako Tower Alpha",
      siteType: "GREENFIELD_TOWER",
      status: "SURVEYED",
      latitude: -6.7725,
      longitude: 39.2241,
      elevationMeters: 30,
      towerHeightMeters: 45,
      region: "Dar es Salaam",
      district: "Kinondoni",
      address: "Mwai Kibaki Road",
      powerSource: "GRID_COMMERCIAL",
      securityRestrictions: "Secure Compound",
      photos: [],
      documents: [],
    });
    expect(site.id).toBeDefined();
    expect(site.status).toBe("SURVEYED");

    // 2. Create RAN Sector
    const sector = repo.createRanSector(ctx, {
      siteId: site.id,
      sectorName: "Sector Alpha 1",
      sectorIndex: 1,
      technology: "4G_LTE",
      frequencyBandMhz: 1800,
      carrierBandwidthMhz: 20,
      antennaModel: "KATHREIN-80010622",
      antennaGainDbi: 18,
      azimuthDegrees: 0,
      mechanicalTiltDegrees: 0,
      electricalTiltDegrees: 2,
      antennaHeightMeters: 40,
      radioUnitModel: "ERICSSON-RRU-4415",
      radioUnitSerialNumber: "RRU-SN-100234",
      txPowerWatts: 40,
      status: "INSTALLED",
    });
    expect(sector.id).toBeDefined();

    // 3. Create Work Order with default Checklist
    const wo = repo.createWorkOrder(ctx, {
      siteId: site.id,
      workOrderNumber: "WO-2026-001",
      title: "RAN Sector 1 Installation & Commissioning",
      workType: "RAN_INSTALLATION",
      status: "IN_PROGRESS",
      priority: "HIGH",
      assignedTeam: "Rigging Team A",
      leadTechnicianId: ctx.userId,
      technicianIds: [ctx.userId],
      scheduledStartDate: new Date().toISOString(),
      scheduledEndDate: new Date().toISOString(),
      actualStartTime: new Date().toISOString(),
      actualEndTime: null,
      totalLaborHours: 8,
      laborCost: 200000,
      checklistVersion: 1,
      completionNotes: null,
      idempotencyKey: "wo-key-101",
    });
    expect(wo.checklistItems.length).toBeGreaterThan(0);

    // Pass all required checklist items
    for (const item of wo.checklistItems) {
      item.passed = true;
    }

    // Complete Work Order
    const completedWo = repo.completeWorkOrder(ctx, wo.id, "All sectors mounted and torqued to specification.");
    expect(completedWo.status).toBe("COMPLETED");

    // 4. Record Technical Commissioning Tests
    repo.recordTest(ctx, {
      siteId: site.id,
      workOrderId: wo.id,
      testType: "VSWR_SWEEP",
      parameterName: "Antenna Port 1 VSWR",
      expectedValue: "< 1.30",
      measuredValue: "1.15",
      unit: "ratio",
      passed: true,
      testedById: ctx.userId,
      testedAt: new Date().toISOString(),
      testEquipmentSerialNumber: "SITE-MASTER-S331E",
      traceAttachmentUrl: "https://files.kwakopos.com/vswr/trace-001.dat",
    });

    repo.recordTest(ctx, {
      siteId: site.id,
      workOrderId: wo.id,
      testType: "EARTHING_RESISTANCE_OHM",
      parameterName: "Tower Ground Ring",
      expectedValue: "< 5.0",
      measuredValue: "2.1",
      unit: "Ohms",
      passed: true,
      testedById: ctx.userId,
      testedAt: new Date().toISOString(),
      testEquipmentSerialNumber: "MEGGER-DET4TC2",
      traceAttachmentUrl: null,
    });

    // 5. Authoritative Site Acceptance Test (SAT)
    const acceptance = repo.createSiteAcceptance(ctx, {
      projectId: randomUUID(),
      siteId: site.id,
      satNumber: "SAT-KWA-001",
      acceptanceType: "FINAL_ACCEPTANCE",
      status: "ACCEPTED",
      leadEngineerId: ctx.userId,
      customerRepresentativeName: "Eng. Baraka Mwita",
      customerSignatureUrl: "https://files.kwakopos.com/sigs/baraka.png",
      mandatoryTestsPassed: true,
      openPunchlistItemsCount: 0,
      triggersBillingMilestone: true,
      billingInvoiceId: null,
      acceptedAt: new Date().toISOString(),
      remarks: "Fully compliant with telecom specifications.",
      handoverPackageSummary: {},
    });

    expect(acceptance.status).toBe("ACCEPTED");

    // Verify Site status updated to ACCEPTED
    const acceptedSite = repo.getSiteById(ctx, site.id);
    expect(acceptedSite?.status).toBe("ACCEPTED");

    // 6. Generate Handover Documentation Package
    const tests = Array.from(repo.testRecords.values()).filter((t) => t.siteId === site.id);
    const sectors = repo.getRanSectorsBySite(ctx, site.id);
    const handoverPackage = TelecomWorkflowEngine.compileHandoverPackage(acceptedSite!, sectors, tests, acceptance);

    expect(handoverPackage.siteCode).toBe("TZ-KWA-001");
    expect(handoverPackage.testSummary.totalTests).toBe(2);
    expect(handoverPackage.testSummary.passedCount).toBe(2);
    expect(handoverPackage.acceptanceRecord.status).toBe("ACCEPTED");
  });

  it("calculates Telecom Quotation and Project Budget variance", () => {
    const quotation = TelecomCostingEngine.calculateQuotation(
      ctx,
      randomUUID(),
      "Q-TEL-2026-001",
      "5G Upgrade - 10 Sites",
      [
        { category: "EQUIPMENT", description: "5G AAU Radios", quantity: 30, unitCost: 2500000 },
        { category: "MATERIALS", description: "Optical Fiber & Power Cables", quantity: 300, unitCost: 15000 },
        { category: "LABOR", description: "Rigging & Commissioning Engineers", quantity: 120, unitCost: 50000 },
        { category: "TRAVEL_LOGISTICS", description: "Fleet Transport & Crane Hire", quantity: 10, unitCost: 350000 },
        { category: "OVERHEAD", description: "Project Management & Supervision", quantity: 1, unitCost: 2000000 },
        { category: "CONTINGENCY", description: "Unforeseen Weather / Tower Repairs", quantity: 1, unitCost: 3000000 },
      ],
      25.0 // 25% margin
    );

    expect(quotation.totalProjectCost).toBeGreaterThan(0);
    expect(quotation.customerPrice).toBeGreaterThan(quotation.totalProjectCost);
    expect(quotation.customerPrice).toBeCloseTo(quotation.totalProjectCost * 1.25, 1);
  });
});
