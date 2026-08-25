import {
  StockLedger,
  StockMovementType,
  ProductVariant,
  StockAdjustment,
  TenantContext,
} from "@kwakopos2/contracts";

/**
 * Calculates stock balance strictly from append-only StockLedger records.
 *
 * OPENING: +
 * PURCHASE: +
 * SALE: -
 * ADJUSTMENT: + or - (quantity is already signed in movement)
 * TRANSFER_IN: +
 * TRANSFER_OUT: -
 * RETURN: +
 * DAMAGE: -
 */
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
        return total + qty; // Signed (+/-)
      default:
        return total;
    }
  }, 0);
}

/**
 * INVARIANT 001: Product cannot lose variants during product update.
 * Updating a product must never overwrite or erase existing variants.
 */
export function assertProductVariantImmutability(
  existingVariants: ProductVariant[],
  retainedVariantIds: string[]
): void {
  for (const v of existingVariants) {
    if (!retainedVariantIds.includes(v.id)) {
      throw new Error(
        `INVARIANT_001_VIOLATION: Product update attempted to implicitly delete variant ${v.id}. Variant deletion must be explicit.`
      );
    }
  }
}

/**
 * INVARIANT 002: Variant identity survives synchronization.
 * Variant IDs must never be changed or regenerated upon sync or reconnect.
 */
export function assertVariantIdentityPersistence(
  existingVariantId: string,
  incomingVariantId: string
): void {
  if (existingVariantId !== incomingVariantId) {
    throw new Error(
      `INVARIANT_002_VIOLATION: Variant identity mismatch! Expected persistent ID ${existingVariantId}, but received ${incomingVariantId}.`
    );
  }
}

/**
 * INVARIANT 003: Stock changes require ledger movements.
 * Mutable direct stock columns are forbidden.
 */
export function assertLedgerRequiredForStockMutation(
  movementType: StockMovementType,
  quantity: number
): void {
  if (!movementType) {
    throw new Error(
      `INVARIANT_003_VIOLATION: Stock mutation missing movementType. All inventory changes must be recorded in StockLedger.`
    );
  }
  if (isNaN(quantity)) {
    throw new Error(
      `INVARIANT_003_VIOLATION: Invalid quantity ${quantity} for stock movement.`
    );
  }
}

/**
 * INVARIANT 004: Every stock adjustment is auditable.
 */
export function assertAdjustmentAuditable(adjustment: Partial<StockAdjustment>): void {
  if (!adjustment.createdByUserId || !adjustment.reason || !adjustment.deviceId || !adjustment.operationId || !adjustment.idempotencyKey) {
    throw new Error(
      `INVARIANT_004_VIOLATION: Stock adjustment missing audit metadata (createdByUserId, reason, deviceId, operationId, idempotencyKey).`
    );
  }
}

/**
 * INVARIANT 007: Tenant isolation is mandatory.
 */
export function assertTenantIsolation(
  requestContext: TenantContext,
  resourceTenantId: string,
  resourceBranchId?: string
): void {
  if (requestContext.tenantId !== resourceTenantId) {
    throw new Error(
      `INVARIANT_007_VIOLATION: Cross-tenant access denied! Context tenant ${requestContext.tenantId} cannot access resource tenant ${resourceTenantId}.`
    );
  }
  if (resourceBranchId && requestContext.branchId !== resourceBranchId) {
    throw new Error(
      `INVARIANT_007_VIOLATION: Cross-branch access denied! Context branch ${requestContext.branchId} cannot access resource branch ${resourceBranchId}.`
    );
  }
}

/**
 * INVARIANT 008: Unverified Cloud Run revisions cannot receive production traffic.
 */
export function assertVerifiedTrafficPromotion(
  isCertified: boolean,
  trafficPercent: number
): void {
  if (!isCertified && trafficPercent > 0) {
    throw new Error(
      `INVARIANT_008_VIOLATION: Unverified Cloud Run candidate revision cannot receive ${trafficPercent}% production traffic prior to zero-traffic certification.`
    );
  }
}

/**
 * INVARIANT 009: Production release identity must match Git SHA + digest + revision.
 */
export function assertReleaseIdentityMatch(
  actual: { gitSha: string; containerDigest: string; cloudRunRevision: string; appVersion: string },
  expected: { gitSha: string; containerDigest: string; cloudRunRevision: string; appVersion: string }
): void {
  if (
    actual.gitSha !== expected.gitSha ||
    actual.containerDigest !== expected.containerDigest ||
    actual.cloudRunRevision !== expected.cloudRunRevision ||
    actual.appVersion !== expected.appVersion
  ) {
    throw new Error(
      `INVARIANT_009_VIOLATION: Production release identity mismatch! Deployed: ${JSON.stringify(actual)}, Expected: ${JSON.stringify(expected)}`
    );
  }
}
