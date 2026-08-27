import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import type {
  TenantContext,
  TelecomSite,
  TelecomWorkOrder,
  TelecomAcceptanceRecord,
  TelecomTestRecord,
  KmlImportRecord,
  StockLedger,
} from "@kwakopos2/contracts";
import {
  assertSiteTenantOwnership,
  assertEquipmentTenantOwnership,
  assertUniqueSerialNumber,
  assertValidInstallationReferences,
  assertInstalledAssetHasInventoryEvidence,
  assertStockIssueHasLedgerRecord,
  assertWorkOrderChecklistComplete,
  assertSiteAcceptanceRequiresPassingTests,
  assertValidMicrowaveEndpoints,
  assertMicrowaveCalculationReproducibility,
  assertKmlImportSourceEvidence,
  assertFieldDeviceSyncConvergence,
  assertGeographicTenantBoundary,
  assertProjectCostReconciliation,
  assertBillingTriggerHasAcceptanceEvidence,
  TelecomEngine,
} from "@kwakopos2/domain";

describe("Phase 5 Telecom Invariants (T001 - T015)", () => {
  const tenantA: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };

  const tenantB: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["ALL"],
  };

  it("T001: Every site belongs to exactly one tenant and blocks cross-tenant access", () => {
    const siteA: TelecomSite = {
      id: randomUUID(),
      tenantId: tenantA.tenantId,
      branchId: null,
      siteCode: "TZ-DAR-001",
      name: "Dar Es Salaam Main",
      siteType: "GREENFIELD_TOWER",
      status: "ACTIVE",
      latitude: -6.7924,
      longitude: 39.2083,
      elevationMeters: 25,
      towerHeightMeters: 45,
      address: "Dar es Salaam",
      region: "Dar es Salaam",
      district: "Ilala",
      siteOwner: "Kwako Telecom",
      accessDetails: "24/7 guard",
      powerSource: "GRID_COMMERCIAL",
      securityRestrictions: null,
      photos: [],
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertSiteTenantOwnership(tenantA, siteA)).not.toThrow();
    expect(() => assertSiteTenantOwnership(tenantB, siteA)).toThrow(/INVARIANT_T001_VIOLATION/);
  });

  it("T002: Equipment asset belongs to one tenant and rejects cross-tenant reference", () => {
    const assetA = { id: randomUUID(), tenantId: tenantA.tenantId, serialNumber: "RRU-9901-TZ" };
    expect(() => assertEquipmentTenantOwnership(tenantA, assetA)).not.toThrow();
    expect(() => assertEquipmentTenantOwnership(tenantB, assetA)).toThrow(/INVARIANT_T002_VIOLATION/);
  });

  it("T003: Serialized equipment has unique serial identity within the tenant", () => {
    const existing = new Set<string>(["RRU-9901", "BBU-5216"]);
    expect(() => assertUniqueSerialNumber("ODU-8800", existing)).not.toThrow();
    expect(() => assertUniqueSerialNumber("rru-9901", existing)).toThrow(/INVARIANT_T003_VIOLATION/);
  });

  it("T004: Every installation references valid project/site/work-order records", () => {
    const validSites = new Set(["site-101", "site-102"]);
    const validWorkOrders = new Set(["wo-501"]);

    expect(() =>
      assertValidInstallationReferences({ siteId: "site-101", workOrderId: "wo-501" }, validSites, validWorkOrders)
    ).not.toThrow();

    expect(() =>
      assertValidInstallationReferences({ siteId: "site-999", workOrderId: "wo-501" }, validSites, validWorkOrders)
    ).toThrow(/INVARIANT_T004_VIOLATION/);
  });

  it("T005: Every installed asset has inventory evidence", () => {
    const inventory = [{ variantId: "rru-var-1", quantityOnHand: 5 }];
    expect(() => assertInstalledAssetHasInventoryEvidence("asset-1", inventory)).not.toThrow();

    const emptyInventory = [{ variantId: "rru-var-1", quantityOnHand: 0 }];
    expect(() => assertInstalledAssetHasInventoryEvidence("asset-2", emptyInventory)).toThrow(/INVARIANT_T005_VIOLATION/);
  });

  it("T006: Every stock issue to a site has ledger evidence", () => {
    const movementId = randomUUID();
    const ledgers: StockLedger[] = [
      {
        id: randomUUID(),
        tenantId: tenantA.tenantId,
        branchId: tenantA.branchId,
        productId: randomUUID(),
        variantId: randomUUID(),
        movementType: "TRANSFER_OUT",
        quantity: -2,
        referenceType: "SiteIssue",
        referenceId: movementId,
        occurredAt: new Date().toISOString(),
        deviceId: "dev-1",
        operationId: "op-1",
        idempotencyKey: "key-1",
        createdAt: new Date().toISOString(),
      },
    ];

    expect(() => assertStockIssueHasLedgerRecord(movementId, ledgers)).not.toThrow();
    expect(() => assertStockIssueHasLedgerRecord("nonexistent-movement", ledgers)).toThrow(/INVARIANT_T006_VIOLATION/);
  });

  it("T007: Every completed work order has required checklist evidence", () => {
    const wo: TelecomWorkOrder = {
      id: randomUUID(),
      tenantId: tenantA.tenantId,
      branchId: null,
      projectId: null,
      siteId: randomUUID(),
      workOrderNumber: "WO-TEL-001",
      title: "Antenna Alignment",
      workType: "MICROWAVE_INSTALLATION",
      status: "COMPLETED",
      priority: "HIGH",
      assignedTeam: "Alpha Riggers",
      leadTechnicianId: randomUUID(),
      technicianIds: [],
      scheduledStartDate: new Date().toISOString(),
      scheduledEndDate: new Date().toISOString(),
      actualStartTime: new Date().toISOString(),
      actualEndTime: new Date().toISOString(),
      totalLaborHours: 6,
      laborCost: 150000,
      checklistVersion: 1,
      checklistItems: [
        { id: randomUUID(), title: "Safety harness check", category: "TOWER_SAFETY", isRequired: true, passed: true },
        { id: randomUUID(), title: "Torque check", category: "ANTENNA_MOUNTING", isRequired: true, passed: false },
      ],
      completionNotes: "Finished",
      idempotencyKey: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertWorkOrderChecklistComplete(wo)).toThrow(/INVARIANT_T007_VIOLATION/);

    wo.checklistItems[1].passed = true;
    expect(() => assertWorkOrderChecklistComplete(wo)).not.toThrow();
  });

  it("T008: Every accepted site has passing mandatory tests", () => {
    const siteId = randomUUID();
    const acceptance: TelecomAcceptanceRecord = {
      id: randomUUID(),
      tenantId: tenantA.tenantId,
      projectId: randomUUID(),
      siteId,
      satNumber: "SAT-2026-001",
      acceptanceType: "FINAL_ACCEPTANCE",
      status: "ACCEPTED",
      leadEngineerId: randomUUID(),
      customerRepresentativeName: "Eng. Juma Rashid",
      customerSignatureUrl: "https://files.kwakopos.com/sigs/juma.png",
      mandatoryTestsPassed: true,
      openPunchlistItemsCount: 0,
      triggersBillingMilestone: true,
      billingInvoiceId: null,
      acceptedAt: new Date().toISOString(),
      remarks: "Site passes all commissioning criteria",
      handoverPackageSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const failingTests: TelecomTestRecord[] = [
      {
        id: randomUUID(),
        tenantId: tenantA.tenantId,
        siteId,
        workOrderId: null,
        testType: "VSWR_SWEEP",
        parameterName: "VSWR Port 1",
        expectedValue: "< 1.30",
        measuredValue: "1.45",
        unit: "ratio",
        passed: false,
        testedById: randomUUID(),
        testedAt: new Date().toISOString(),
        testEquipmentSerialNumber: "ANRITSU-882",
        traceAttachmentUrl: null,
        createdAt: new Date().toISOString(),
      },
    ];

    expect(() => assertSiteAcceptanceRequiresPassingTests(acceptance, failingTests)).toThrow(/INVARIANT_T008_VIOLATION/);

    const passingTests: TelecomTestRecord[] = [
      {
        ...failingTests[0],
        measuredValue: "1.18",
        passed: true,
      },
    ];
    expect(() => assertSiteAcceptanceRequiresPassingTests(acceptance, passingTests)).not.toThrow();
  });

  it("T009: Every microwave link has valid distinct endpoint sites", () => {
    const site1: TelecomSite = {
      id: "site-a",
      tenantId: tenantA.tenantId,
      branchId: null,
      siteCode: "S1",
      name: "Site 1",
      siteType: "GREENFIELD_TOWER",
      status: "ACTIVE",
      latitude: -6.8,
      longitude: 39.2,
      elevationMeters: 20,
      towerHeightMeters: 45,
      address: null,
      region: "Coast",
      district: null,
      siteOwner: null,
      accessDetails: null,
      powerSource: "GRID_COMMERCIAL",
      securityRestrictions: null,
      photos: [],
      documents: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const site2 = { ...site1, id: "site-b", siteCode: "S2", name: "Site 2" };

    const siteMap = new Map<string, TelecomSite>([
      ["site-a", site1],
      ["site-b", site2],
    ]);

    expect(() => assertValidMicrowaveEndpoints({ siteAId: "site-a", siteBId: "site-b" }, siteMap)).not.toThrow();
    expect(() => assertValidMicrowaveEndpoints({ siteAId: "site-a", siteBId: "site-a" }, siteMap)).toThrow(
      /INVARIANT_T009_VIOLATION/
    );
  });

  it("T010: Microwave calculated distance/azimuth values remain reproducible", () => {
    const calc1 = TelecomEngine.executeLinkBudgetCalculation({
      siteA: { latitude: -6.7924, longitude: 39.2083, elevationMeters: 20, antennaHeightMeters: 30 },
      siteB: { latitude: -6.8321, longitude: 39.2811, elevationMeters: 15, antennaHeightMeters: 30 },
      frequencyGhz: 13.0,
      txPowerDbm: 24.0,
      antennaGainDbiSiteA: 35.5,
      antennaGainDbiSiteB: 35.5,
    });

    const calc2 = TelecomEngine.executeLinkBudgetCalculation({
      siteA: { latitude: -6.7924, longitude: 39.2083, elevationMeters: 20, antennaHeightMeters: 30 },
      siteB: { latitude: -6.8321, longitude: 39.2811, elevationMeters: 15, antennaHeightMeters: 30 },
      frequencyGhz: 13.0,
      txPowerDbm: 24.0,
      antennaGainDbiSiteA: 35.5,
      antennaGainDbiSiteB: 35.5,
    });

    expect(() => assertMicrowaveCalculationReproducibility(calc1, calc2)).not.toThrow();
  });

  it("T011: Every KML/KMZ import has immutable source evidence", () => {
    const validImport: KmlImportRecord = {
      id: randomUUID(),
      tenantId: tenantA.tenantId,
      fileName: "dar_sites.kml",
      fileType: "KML",
      fileSizeBytes: 104520,
      sha256Hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      totalPlacemarksParsed: 12,
      sitesCreated: 12,
      parsedPlacemarks: [],
      importedById: tenantA.userId,
      importedAt: new Date().toISOString(),
      status: "IMPORTED",
      errorMessage: null,
    };

    expect(() => assertKmlImportSourceEvidence(validImport)).not.toThrow();

    const invalidImport = { ...validImport, sha256Hash: "" };
    expect(() => assertKmlImportSourceEvidence(invalidImport)).toThrow(/INVARIANT_T011_VIOLATION/);
  });

  it("T012: Field-device changes converge to server state", () => {
    expect(() => assertFieldDeviceSyncConvergence(5, 5)).not.toThrow();
    expect(() => assertFieldDeviceSyncConvergence(5, 4)).not.toThrow();
    expect(() => assertFieldDeviceSyncConvergence(8, 4)).toThrow(/INVARIANT_T012_VIOLATION/);
  });

  it("T013: Tenant boundaries cannot be crossed through geographic or technical APIs", () => {
    expect(() => assertGeographicTenantBoundary(tenantA, tenantA.tenantId)).not.toThrow();
    expect(() => assertGeographicTenantBoundary(tenantA, tenantB.tenantId)).toThrow(/INVARIANT_T013_VIOLATION/);
  });

  it("T014: Project financial cost reconciles with material and labor records", () => {
    expect(() => assertProjectCostReconciliation(500000, 300000, 150000, 50000)).not.toThrow();
    expect(() => assertProjectCostReconciliation(600000, 300000, 150000, 50000)).toThrow(/INVARIANT_T014_VIOLATION/);
  });

  it("T015: Billing-triggering acceptance events have authoritative acceptance evidence", () => {
    const acceptance: TelecomAcceptanceRecord = {
      id: randomUUID(),
      tenantId: tenantA.tenantId,
      projectId: randomUUID(),
      siteId: randomUUID(),
      satNumber: "SAT-101",
      acceptanceType: "FINAL_ACCEPTANCE",
      status: "ACCEPTED",
      leadEngineerId: randomUUID(),
      customerRepresentativeName: "Eng. Sarah Mwangi",
      customerSignatureUrl: null,
      mandatoryTestsPassed: true,
      openPunchlistItemsCount: 0,
      triggersBillingMilestone: true,
      billingInvoiceId: null,
      acceptedAt: new Date().toISOString(),
      remarks: null,
      handoverPackageSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertBillingTriggerHasAcceptanceEvidence(acceptance)).not.toThrow();

    const unsignedAcceptance = { ...acceptance, customerRepresentativeName: "" };
    expect(() => assertBillingTriggerHasAcceptanceEvidence(unsignedAcceptance)).toThrow(/INVARIANT_T015_VIOLATION/);
  });
});
