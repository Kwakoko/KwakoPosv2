import type {
  StockLedger,
  StockMovementType,
  ProductVariant,
  StockAdjustment,
  TenantContext,
} from "@kwakopos2/contracts";

export function calculateAvailableStock(ledgerEntries: StockLedger[]): number {
  return ledgerEntries.reduce((total, entry) => {
    const qty = Number(entry.quantity);
    switch (entry.movementType) {
      case "OPENING":
      case "PURCHASE":
      case "TRANSFER_IN":
      case "RETURN":
        return total + qty;
      case "SALE":
      case "TRANSFER_OUT":
      case "DAMAGE":
        return total - Math.abs(qty);
      case "ADJUSTMENT":
        return total + qty;
      default:
        return total;
    }
  }, 0);
}

export function assertProductVariantImmutability(existingVariants: ProductVariant[], retainedVariantIds: string[]): void {
  for (const v of existingVariants) {
    if (!retainedVariantIds.includes(v.id)) {
      throw new Error(`INVARIANT_001_VIOLATION: Product update attempted to implicitly delete variant ${v.id}. Variant deletion must be explicit.`);
    }
  }
}

export function assertVariantIdentityPersistence(existingVariantId: string, incomingVariantId: string): void {
  if (existingVariantId !== incomingVariantId) {
    throw new Error(`INVARIANT_002_VIOLATION: Variant identity mismatch! Expected persistent ID ${existingVariantId}, but received ${incomingVariantId}.`);
  }
}

export function assertLedgerRequiredForStockMutation(movementType: StockMovementType, quantity: number): void {
  if (!movementType) {
    throw new Error(`INVARIANT_003_VIOLATION: Stock mutation missing movementType. All inventory changes must be recorded in StockLedger.`);
  }
  if (isNaN(quantity)) {
    throw new Error(`INVARIANT_003_VIOLATION: Invalid quantity ${quantity} for stock movement.`);
  }
}

export function assertAdjustmentAuditable(adjustment: Partial<StockAdjustment>): void {
  if (!adjustment.createdByUserId || !adjustment.reason || !adjustment.deviceId || !adjustment.operationId || !adjustment.idempotencyKey) {
    throw new Error(`INVARIANT_004_VIOLATION: Stock adjustment missing audit metadata (createdByUserId, reason, deviceId, operationId, idempotencyKey).`);
  }
}

export function assertTenantIsolation(requestContext: TenantContext, resourceTenantId: string, resourceBranchId?: string): void {
  if (requestContext.tenantId !== resourceTenantId) {
    throw new Error(`INVARIANT_007_VIOLATION: Cross-tenant access denied! Context tenant ${requestContext.tenantId} cannot access resource tenant ${resourceTenantId}.`);
  }
  if (resourceBranchId && requestContext.branchId !== resourceBranchId) {
    throw new Error(`INVARIANT_007_VIOLATION: Cross-branch access denied! Context branch ${requestContext.branchId} cannot access resource branch ${resourceBranchId}.`);
  }
}

export function assertVerifiedTrafficPromotion(isCertified: boolean, trafficPercent: number): void {
  if (!isCertified && trafficPercent > 0) {
    throw new Error(`INVARIANT_008_VIOLATION: Unverified Cloud Run candidate revision cannot receive ${trafficPercent}% production traffic prior to zero-traffic certification.`);
  }
}

export function assertValidGitSha(gitSha: string): void {
  if (!gitSha || typeof gitSha !== "string" || !/^[0-9a-f]{40}$/i.test(gitSha)) {
    throw new Error(`SECURITY_VIOLATION: Invalid Git SHA '${gitSha}'. Must be an exact 40-character hexadecimal string.`);
  }
  if (gitSha === "0000000000000000000000000000000000000000" || gitSha.includes("MOCK")) {
    throw new Error(`SECURITY_VIOLATION: Zero-padded or synthetic Git SHA '${gitSha}' is forbidden in production.`);
  }
}

export function assertValidContainerDigest(containerDigest: string): void {
  if (!containerDigest || typeof containerDigest !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(containerDigest)) {
    throw new Error(`SECURITY_VIOLATION: Invalid Container Digest '${containerDigest}'. Must match sha256:<64-hex-chars>. Mutable tags like ':latest' are forbidden.`);
  }
}

export function assertValidCloudRunRevision(revision: string): void {
  if (!revision || typeof revision !== "string" || revision.length < 5 || revision.includes("MOCK") || revision.includes("SIMULATED")) {
    throw new Error(`SECURITY_VIOLATION: Invalid or synthetic Cloud Run Revision '${revision}'.`);
  }
}

export function assertReleaseIdentityMatch(actual: { gitSha: string; containerDigest: string; cloudRunRevision: string; appVersion: string }, expected: { gitSha: string; containerDigest: string; cloudRunRevision: string; appVersion: string }): void {
  assertValidGitSha(actual.gitSha);
  assertValidGitSha(expected.gitSha);
  assertValidContainerDigest(actual.containerDigest);
  assertValidContainerDigest(expected.containerDigest);
  assertValidCloudRunRevision(actual.cloudRunRevision);
  assertValidCloudRunRevision(expected.cloudRunRevision);
  if (actual.gitSha.toLowerCase() !== expected.gitSha.toLowerCase() || actual.containerDigest.toLowerCase() !== expected.containerDigest.toLowerCase() || actual.cloudRunRevision !== expected.cloudRunRevision || actual.appVersion !== expected.appVersion) {
    throw new Error(`INVARIANT_009_VIOLATION: Production release identity mismatch!\nDeployed: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`);
  }
}

export function assertInventoryLedgerIntegrity(variantId: string, reportedStock: number, ledgerEntries: StockLedger[]): void {
  const calculated = calculateAvailableStock(ledgerEntries);
  if (reportedStock !== calculated) {
    throw new Error(`INVARIANT_010_VIOLATION: Inventory integrity mismatch for variant ${variantId}. Reported: ${reportedStock}, Calculated from ledger: ${calculated}`);
  }
}

export function assertNoOrphanAdjustments(adjustments: StockAdjustment[], ledgers: StockLedger[]): void {
  const ledgerMap = new Set(ledgers.map((l) => l.idempotencyKey));
  for (const adj of adjustments) {
    if (!ledgerMap.has(adj.idempotencyKey)) {
      throw new Error(`INVARIANT_011_VIOLATION: Orphaned adjustment ${adj.id} (key: ${adj.idempotencyKey}) has no matching ledger entry.`);
    }
  }
}

export interface FeatureFlagRule { key: string; enabled: boolean; tenantId?: string | null; branchId?: string | null; }

export function evaluateFeatureFlag(flags: FeatureFlagRule[], key: string, context?: { tenantId?: string; branchId?: string }): boolean {
  if (context?.tenantId && context?.branchId) {
    const branchMatch = flags.find((f) => f.key === key && f.tenantId === context.tenantId && f.branchId === context.branchId);
    if (branchMatch !== undefined) return branchMatch.enabled;
  }
  if (context?.tenantId) {
    const tenantMatch = flags.find((f) => f.key === key && f.tenantId === context.tenantId && !f.branchId);
    if (tenantMatch !== undefined) return tenantMatch.enabled;
  }
  const globalMatch = flags.find((f) => f.key === key && !f.tenantId && !f.branchId);
  return globalMatch ? globalMatch.enabled : false;
}

export * from "./commercialInvariants.js";
export * from "./pricingTaxEngine.js";
export * from "./paymentEngine.js";
export * from "./cashSessionEngine.js";
export * from "./transactionNumbering.js";
export * from "./financeInvariants.js";
export * from "./accountingEngine.js";
export * from "./financialBridge.js";
export * from "./receivablesPayablesEngine.js";
export * from "./inventoryValuationEngine.js";
export * from "./financialReportingEngine.js";
export * from "./profitabilityEngine.js";
export * from "./budgetEngine.js";
export * from "./anomalyDetectionEngine.js";
export * from "./workforceInvariants.js";
export * from "./employeeEngine.js";
export * from "./attendanceEngine.js";
export * from "./schedulingEngine.js";
export * from "./leaveEngine.js";
export * from "./taskWorkOrderEngine.js";
export * from "./commissionEngine.js";
export * from "./payrollInputEngine.js";
export * from "./laborCostingEngine.js";
export * from "./workforceAnalyticsEngine.js";
export * from "./pluginInvariants.js";
export * from "./pluginRegistryEngine.js";
export * from "./pluginConfigEngine.js";
export * from "./pluginWorkflowEngine.js";
export * from "./pluginNavigationEngine.js";
export * from "./pluginDashboardEngine.js";
export * from "./pluginCatalog.js";
export * from "./restaurantEngine.js";
export * from "./pharmacyEngine.js";
export * from "./garageEngine.js";
export * from "./constructionEngine.js";
export * from "./telecomEngine.js";
export * from "./wholesaleEngine.js";
export * from "./hardwareEngine.js";
export * from "./electronicsEngine.js";
export * from "./industryExpansionCatalog.js";
export * from "./telecomInvariants.js";
export * from "./kmlKmzParserEngine.js";
export * from "./telecomWorkflowEngine.js";
export * from "./telecomCostingEngine.js";
export * from "./monetizationEngine.js";
