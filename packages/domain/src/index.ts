import type {
  StockLedger,
  StockMovementType,
  ProductVariant,
  StockAdjustment,
  TenantContext,
} from "@kwakopos2/contracts";

/**
 * Calculates stock balance strictly from append-only StockLedger records.
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
        return total + qty;
      default:
        return total;
    }
  }, 0);
}

/**
 * INVARIANT 001: Product cannot lose variants during product update.
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
 * Validates strict 40-character Git SHA format.
 * Rejects truncated, zero-padded, or simulated SHAs.
 */
export function assertValidGitSha(gitSha: string): void {
  if (!gitSha || typeof gitSha !== "string" || !/^[0-9a-f]{40}$/i.test(gitSha)) {
    throw new Error(
      `SECURITY_VIOLATION: Invalid Git SHA '${gitSha}'. Must be an exact 40-character hexadecimal string.`
    );
  }
  if (gitSha === "0000000000000000000000000000000000000000" || gitSha.includes("MOCK")) {
    throw new Error(`SECURITY_VIOLATION: Zero-padded or synthetic Git SHA '${gitSha}' is forbidden in production.`);
  }
}

/**
 * Validates strict SHA-256 Container Digest format.
 * Rejects 'latest', mutable tags, or fake digests.
 */
export function assertValidContainerDigest(containerDigest: string): void {
  if (!containerDigest || typeof containerDigest !== "string" || !/^sha256:[0-9a-f]{64}$/i.test(containerDigest)) {
    throw new Error(
      `SECURITY_VIOLATION: Invalid Container Digest '${containerDigest}'. Must match sha256:<64-hex-chars>. Mutable tags like ':latest' are forbidden.`
    );
  }
}

/**
 * Validates Cloud Run Revision format.
 */
export function assertValidCloudRunRevision(revision: string): void {
  if (!revision || typeof revision !== "string" || revision.length < 5 || revision.includes("MOCK") || revision.includes("SIMULATED")) {
    throw new Error(
      `SECURITY_VIOLATION: Invalid or synthetic Cloud Run Revision '${revision}'.`
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
  assertValidGitSha(actual.gitSha);
  assertValidGitSha(expected.gitSha);
  assertValidContainerDigest(actual.containerDigest);
  assertValidContainerDigest(expected.containerDigest);
  assertValidCloudRunRevision(actual.cloudRunRevision);
  assertValidCloudRunRevision(expected.cloudRunRevision);

  if (
    actual.gitSha.toLowerCase() !== expected.gitSha.toLowerCase() ||
    actual.containerDigest.toLowerCase() !== expected.containerDigest.toLowerCase() ||
    actual.cloudRunRevision !== expected.cloudRunRevision ||
    actual.appVersion !== expected.appVersion
  ) {
    throw new Error(
      `INVARIANT_009_VIOLATION: Production release identity mismatch!\n` +
      `Deployed: ${JSON.stringify(actual)}\n` +
      `Expected: ${JSON.stringify(expected)}`
    );
  }
}
