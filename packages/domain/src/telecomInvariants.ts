import type {
  TenantContext,
  TelecomSite,
  TelecomRanSector,
  TelecomMicrowaveLink,
  TelecomWorkOrder,
  TelecomTestRecord,
  TelecomAcceptanceRecord,
  KmlImportRecord,
  StockLedger,
} from "@kwakopos2/contracts";

/**
 * INVARIANT T001: Every site belongs to exactly one tenant.
 */
export function assertSiteTenantOwnership(ctx: TenantContext, site: { tenantId: string }): void {
  if (ctx.tenantId !== site.tenantId) {
    throw new Error(
      `INVARIANT_T001_VIOLATION: Cross-tenant site violation! Context tenant ${ctx.tenantId} attempted operation on site of tenant ${site.tenantId}.`
    );
  }
}

/**
 * INVARIANT T002: Every equipment asset belongs to one tenant.
 */
export function assertEquipmentTenantOwnership(ctx: TenantContext, asset: { tenantId: string }): void {
  if (ctx.tenantId !== asset.tenantId) {
    throw new Error(
      `INVARIANT_T002_VIOLATION: Equipment asset cross-tenant violation! Context tenant ${ctx.tenantId} != Asset tenant ${asset.tenantId}.`
    );
  }
}

/**
 * INVARIANT T003: Serialized equipment has unique serial identity within the tenant.
 */
export function assertUniqueSerialNumber(serialNumber: string, existingSerials: Set<string>): void {
  if (!serialNumber || serialNumber.trim() === "") {
    throw new Error(`INVARIANT_T003_VIOLATION: Serial number cannot be empty.`);
  }
  if (existingSerials.has(serialNumber.trim().toUpperCase())) {
    throw new Error(
      `INVARIANT_T003_VIOLATION: Duplicate serial number '${serialNumber}' already registered in tenant.`
    );
  }
}

/**
 * INVARIANT T004: Every installation references valid project/site/work-order records.
 */
export function assertValidInstallationReferences(
  installation: { siteId: string; workOrderId?: string | null; projectId?: string | null },
  validSiteIds: Set<string>,
  validWorkOrderIds: Set<string>
): void {
  if (!validSiteIds.has(installation.siteId)) {
    throw new Error(`INVARIANT_T004_VIOLATION: Installation references unknown siteId '${installation.siteId}'.`);
  }
  if (installation.workOrderId && !validWorkOrderIds.has(installation.workOrderId)) {
    throw new Error(
      `INVARIANT_T004_VIOLATION: Installation references unknown workOrderId '${installation.workOrderId}'.`
    );
  }
}

/**
 * INVARIANT T005: Every installed asset has inventory evidence.
 */
export function assertInstalledAssetHasInventoryEvidence(
  assetId: string,
  inventoryItems: { variantId: string; quantityOnHand: number }[]
): void {
  const hasInventory = inventoryItems.some((i) => i.quantityOnHand > 0);
  if (!hasInventory) {
    throw new Error(
      `INVARIANT_T005_VIOLATION: Asset '${assetId}' cannot be installed without available stock inventory evidence.`
    );
  }
}

/**
 * INVARIANT T006: Every stock issue to a site has ledger evidence.
 */
export function assertStockIssueHasLedgerRecord(
  movementId: string,
  stockLedgerRecords: StockLedger[]
): void {
  const record = stockLedgerRecords.find((r) => r.id === movementId || r.referenceId === movementId);
  if (!record || record.movementType !== "TRANSFER_OUT" && record.movementType !== "ADJUSTMENT") {
    throw new Error(
      `INVARIANT_T006_VIOLATION: Site stock issue '${movementId}' lacks corresponding authoritative stock ledger movement.`
    );
  }
}

/**
 * INVARIANT T007: Every completed work order has required checklist evidence.
 */
export function assertWorkOrderChecklistComplete(workOrder: TelecomWorkOrder): void {
  if (workOrder.status === "COMPLETED" || workOrder.status === "VERIFIED") {
    const unpassedRequired = workOrder.checklistItems.filter((i) => i.isRequired && !i.passed);
    if (unpassedRequired.length > 0) {
      throw new Error(
        `INVARIANT_T007_VIOLATION: Work order ${workOrder.workOrderNumber} cannot be marked completed. Unmet checklist items: ${unpassedRequired.map((i) => i.title).join(", ")}.`
      );
    }
  }
}

/**
 * INVARIANT T008: Every accepted site has passing mandatory tests.
 */
export function assertSiteAcceptanceRequiresPassingTests(
  acceptance: TelecomAcceptanceRecord,
  testRecords: TelecomTestRecord[]
): void {
  if (acceptance.status === "ACCEPTED") {
    const siteTests = testRecords.filter((t) => t.siteId === acceptance.siteId);
    if (siteTests.length === 0) {
      throw new Error(
        `INVARIANT_T008_VIOLATION: Site ${acceptance.siteId} acceptance rejected: No technical test records found.`
      );
    }
    const failedTests = siteTests.filter((t) => !t.passed);
    if (failedTests.length > 0) {
      throw new Error(
        `INVARIANT_T008_VIOLATION: Site ${acceptance.siteId} acceptance rejected: ${failedTests.length} mandatory tests failed.`
      );
    }
  }
}

/**
 * INVARIANT T009: Every microwave link has valid distinct endpoint sites.
 */
export function assertValidMicrowaveEndpoints(
  link: { siteAId: string; siteBId: string },
  siteMap: Map<string, TelecomSite>
): void {
  if (link.siteAId === link.siteBId) {
    throw new Error(`INVARIANT_T009_VIOLATION: Microwave link cannot have identical Site A and Site B (${link.siteAId}).`);
  }
  if (!siteMap.has(link.siteAId)) {
    throw new Error(`INVARIANT_T009_VIOLATION: Microwave link references nonexistent Site A (${link.siteAId}).`);
  }
  if (!siteMap.has(link.siteBId)) {
    throw new Error(`INVARIANT_T009_VIOLATION: Microwave link references nonexistent Site B (${link.siteBId}).`);
  }
}

/**
 * INVARIANT T010: Microwave calculated distance/azimuth values remain reproducible.
 */
export function assertMicrowaveCalculationReproducibility(
  originalCalc: { distanceKm: number; trueAzimuthDegreesSiteAToB: number },
  recalculated: { distanceKm: number; trueAzimuthDegreesSiteAToB: number }
): void {
  const distDiff = Math.abs(originalCalc.distanceKm - recalculated.distanceKm);
  const azDiff = Math.abs(originalCalc.trueAzimuthDegreesSiteAToB - recalculated.trueAzimuthDegreesSiteAToB);
  if (distDiff > 0.001 || azDiff > 0.01) {
    throw new Error(
      `INVARIANT_T010_VIOLATION: Microwave calculation reproducibility drift! Distance diff: ${distDiff} km, Azimuth diff: ${azDiff} deg.`
    );
  }
}

/**
 * INVARIANT T011: Every KML/KMZ import has immutable source evidence.
 */
export function assertKmlImportSourceEvidence(importRecord: KmlImportRecord): void {
  if (!importRecord.sha256Hash || importRecord.sha256Hash.length < 32 || importRecord.fileSizeBytes <= 0) {
    throw new Error(
      `INVARIANT_T011_VIOLATION: KML/KMZ import '${importRecord.id}' lacks immutable SHA-256 hash or valid file size.`
    );
  }
}

/**
 * INVARIANT T012: Field-device changes converge to server state.
 */
export function assertFieldDeviceSyncConvergence(
  localVersion: number,
  serverVersion: number
): void {
  if (localVersion > serverVersion + 1) {
    throw new Error(
      `INVARIANT_T012_VIOLATION: Field sync divergence: Local sequence ${localVersion} skipped server sequence ${serverVersion}.`
    );
  }
}

/**
 * INVARIANT T013: Tenant boundaries cannot be crossed through geographic or technical APIs.
 */
export function assertGeographicTenantBoundary(
  ctx: TenantContext,
  resourceTenantId: string
): void {
  if (ctx.tenantId !== resourceTenantId) {
    throw new Error(
      `INVARIANT_T013_VIOLATION: Geographic boundary breach: Context tenant ${ctx.tenantId} cannot access technical objects of tenant ${resourceTenantId}.`
    );
  }
}

/**
 * INVARIANT T014: Project financial cost reconciles with material and labor records.
 */
export function assertProjectCostReconciliation(
  reportedActualCost: number,
  calculatedMaterialsCost: number,
  calculatedLaborCost: number,
  otherCosts: number = 0
): void {
  const expectedTotal = Math.round((calculatedMaterialsCost + calculatedLaborCost + otherCosts) * 100) / 100;
  const reported = Math.round(reportedActualCost * 100) / 100;
  if (Math.abs(expectedTotal - reported) > 0.05) {
    throw new Error(
      `INVARIANT_T014_VIOLATION: Project financial cost divergence! Reported: ${reported}, Sum of material (${calculatedMaterialsCost}) + labor (${calculatedLaborCost}) + other (${otherCosts}) = ${expectedTotal}.`
    );
  }
}

/**
 * INVARIANT T015: Billing-triggering acceptance events have authoritative acceptance evidence.
 */
export function assertBillingTriggerHasAcceptanceEvidence(acceptance: TelecomAcceptanceRecord): void {
  if (acceptance.triggersBillingMilestone) {
    if (acceptance.status !== "ACCEPTED") {
      throw new Error(
        `INVARIANT_T015_VIOLATION: Cannot trigger billing milestone on unaccepted SAT record (status: '${acceptance.status}').`
      );
    }
    if (!acceptance.customerRepresentativeName || acceptance.customerRepresentativeName.trim() === "") {
      throw new Error(
        `INVARIANT_T015_VIOLATION: Cannot trigger billing without customer representative signoff.`
      );
    }
  }
}
