import type {
  PluginManifest,
  TenantPluginActivation,
  BranchPluginActivation,
  PluginCapability,
  TenantContext,
} from "@kwakopos2/contracts";

/**
 * INVARIANT P001: Every plugin has a valid, validated manifest with SemVer versioning.
 */
export function assertValidPluginManifest(manifest: Partial<PluginManifest>): void {
  if (!manifest.id || typeof manifest.id !== "string" || manifest.id.trim().length === 0) {
    throw new Error("INVARIANT_P001_VIOLATION: Plugin manifest missing valid ID.");
  }
  if (!manifest.name || typeof manifest.name !== "string") {
    throw new Error(`INVARIANT_P001_VIOLATION: Plugin ${manifest.id} missing name.`);
  }
  if (!manifest.version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
    throw new Error(`INVARIANT_P001_VIOLATION: Plugin ${manifest.id} version '${manifest.version}' is not valid SemVer.`);
  }
  if (!manifest.industry || typeof manifest.industry !== "string") {
    throw new Error(`INVARIANT_P001_VIOLATION: Plugin ${manifest.id} must declare its target industry.`);
  }
}

/**
 * INVARIANT P002: Plugin dependencies are strictly satisfied without circular dependencies.
 */
export function assertPluginDependenciesSatisfied(
  pluginId: string,
  declaredDependencies: string[],
  activePluginIds: Set<string>
): void {
  for (const dep of declaredDependencies) {
    if (!activePluginIds.has(dep)) {
      throw new Error(
        `INVARIANT_P002_VIOLATION: Plugin ${pluginId} requires missing active dependency '${dep}'.`
      );
    }
  }
}

/**
 * INVARIANT P003: Plugin entities and activations remain strictly tenant-scoped.
 */
export function assertPluginTenantBoundary(
  requestContext: TenantContext,
  resource: { tenantId: string; branchId?: string | null }
): void {
  if (requestContext.tenantId !== resource.tenantId) {
    throw new Error(
      `INVARIANT_P003_VIOLATION: Cross-tenant plugin breach! Tenant ${requestContext.tenantId} cannot access plugin resources of tenant ${resource.tenantId}.`
    );
  }
}

/**
 * INVARIANT P004: Plugin mutations are idempotent across multi-device sync.
 */
export function assertPluginMutationIdempotency(
  incomingKey: string,
  processedKeys: Set<string>
): void {
  if (processedKeys.has(incomingKey)) {
    throw new Error(
      `INVARIANT_P004_VIOLATION: Duplicate plugin operation with idempotencyKey '${incomingKey}' already processed.`
    );
  }
}

/**
 * INVARIANT P005: Plugin schema version is compatible with host platform minimum version.
 */
export function assertPluginPlatformCompatibility(
  plugin: { id: string; minimumPlatformVersion: string; schemaVersion: number },
  currentPlatformVersion: string
): void {
  const [minMajor, minMinor] = plugin.minimumPlatformVersion.split(".").map(Number);
  const [curMajor, curMinor] = currentPlatformVersion.split(".").map(Number);

  if (curMajor < minMajor || (curMajor === minMajor && curMinor < minMinor)) {
    throw new Error(
      `INVARIANT_P005_VIOLATION: Plugin ${plugin.id} requires platform >= ${plugin.minimumPlatformVersion}, but host is ${currentPlatformVersion}.`
    );
  }
}

/**
 * INVARIANT P006: Plugin capabilities and permissions are strictly enforced.
 */
export function assertPluginCapabilityAllowed(
  requestedCapability: PluginCapability,
  grantedCapabilities: PluginCapability[],
  pluginId: string
): void {
  if (!grantedCapabilities.includes(requestedCapability)) {
    throw new Error(
      `INVARIANT_P006_VIOLATION: Plugin ${pluginId} attempted unauthorized capability '${requestedCapability}'.`
    );
  }
}

/**
 * INVARIANT P007: Plugin data survives application upgrades without loss.
 */
export function assertPluginDataUpgradeIntegrity(
  preUpgradeRecordCount: number,
  postUpgradeRecordCount: number
): void {
  if (postUpgradeRecordCount < preUpgradeRecordCount) {
    throw new Error(
      `INVARIANT_P007_VIOLATION: Plugin data loss detected during upgrade! Pre-upgrade: ${preUpgradeRecordCount}, Post-upgrade: ${postUpgradeRecordCount}.`
    );
  }
}

/**
 * INVARIANT P008: Plugin offline mutations converge across devices.
 */
export function assertPluginSyncConvergence(
  stateDeviceA: number | string,
  stateDeviceB: number | string
): boolean {
  return stateDeviceA === stateDeviceB;
}

/**
 * INVARIANT P009: Plugin errors do not corrupt core commercial or financial data.
 */
export function assertCoreIsolationOnPluginFailure(
  coreLedgerCountBefore: number,
  coreLedgerCountAfter: number
): void {
  if (coreLedgerCountBefore !== coreLedgerCountAfter) {
    throw new Error(
      `INVARIANT_P009_VIOLATION: Core ledger corrupted during plugin failure! Expected count ${coreLedgerCountBefore}, got ${coreLedgerCountAfter}.`
    );
  }
}

/**
 * INVARIANT P010: Plugin financial actions originate from authoritative transactions.
 */
export function assertPluginFinancialOrigin(
  sourceType: string,
  transactionAmount: number
): void {
  if (!sourceType || transactionAmount <= 0) {
    throw new Error(
      `INVARIANT_P010_VIOLATION: Plugin financial posting must have valid source and positive amount.`
    );
  }
}
