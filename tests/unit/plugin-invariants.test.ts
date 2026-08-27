import { describe, it, expect } from "vitest";
import {
  assertValidPluginManifest,
  assertPluginDependenciesSatisfied,
  assertPluginTenantBoundary,
  assertPluginMutationIdempotency,
  assertPluginPlatformCompatibility,
  assertPluginCapabilityAllowed,
  assertPluginDataUpgradeIntegrity,
  assertPluginSyncConvergence,
  assertCoreIsolationOnPluginFailure,
  assertPluginFinancialOrigin,
} from "@kwakopos2/domain";
import type { TenantContext, PluginManifest } from "@kwakopos2/contracts";

describe("Plugin Invariants P001 - P010", () => {
  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  const sampleManifest: PluginManifest = {
    id: "sample-plugin",
    name: "Sample Industry Plugin",
    version: "1.0.0",
    platformVersion: "2.2.0",
    schemaVersion: 1,
    syncProtocolVersion: 1,
    minimumPlatformVersion: "2.1.0",
    type: "INDUSTRY",
    status: "stable",
    industry: "Sample",
    description: "Sample",
    author: "KwakoPos",
    dependencies: ["commercial-core"],
    capabilities: ["inventory.read", "finance.post"],
    permissions: [],
    routes: [],
    entities: [],
    workflows: [],
    reports: [],
    dashboards: [],
    featureFlags: [],
    offlineCapability: "FULLY_OFFLINE",
    pricing: { basePriceMonthly: 0, currency: "TZS", includedInPlans: ["ENTERPRISE"] },
  };

  it("P001: Every plugin has a valid manifest with SemVer", () => {
    expect(() => assertValidPluginManifest(sampleManifest)).not.toThrow();
    expect(() => assertValidPluginManifest({ ...sampleManifest, version: "not-semver" })).toThrow(
      /INVARIANT_P001_VIOLATION/
    );
  });

  it("P002: Plugin dependencies are strictly satisfied", () => {
    const active = new Set(["commercial-core", "inventory"]);
    expect(() =>
      assertPluginDependenciesSatisfied("sample-plugin", ["commercial-core"], active)
    ).not.toThrow();
    expect(() =>
      assertPluginDependenciesSatisfied("sample-plugin", ["missing-dep"], active)
    ).toThrow(/INVARIANT_P002_VIOLATION/);
  });

  it("P003: Plugin resources remain tenant-scoped", () => {
    expect(() =>
      assertPluginTenantBoundary(ctx, { tenantId: ctx.tenantId })
    ).not.toThrow();
    expect(() =>
      assertPluginTenantBoundary(ctx, { tenantId: "foreign-tenant" })
    ).toThrow(/INVARIANT_P003_VIOLATION/);
  });

  it("P004: Plugin mutations are idempotent", () => {
    const processed = new Set(["key-1"]);
    expect(() => assertPluginMutationIdempotency("key-2", processed)).not.toThrow();
    expect(() => assertPluginMutationIdempotency("key-1", processed)).toThrow(
      /INVARIANT_P004_VIOLATION/
    );
  });

  it("P005: Plugin schema version is compatible with host platform", () => {
    expect(() =>
      assertPluginPlatformCompatibility(
        { id: "sample", minimumPlatformVersion: "2.1.0", schemaVersion: 1 },
        "2.2.0"
      )
    ).not.toThrow();
    expect(() =>
      assertPluginPlatformCompatibility(
        { id: "sample", minimumPlatformVersion: "3.0.0", schemaVersion: 1 },
        "2.2.0"
      )
    ).toThrow(/INVARIANT_P005_VIOLATION/);
  });

  it("P006: Plugin capabilities are strictly checked", () => {
    expect(() =>
      assertPluginCapabilityAllowed("finance.post", sampleManifest.capabilities, "sample")
    ).not.toThrow();
    expect(() =>
      assertPluginCapabilityAllowed("workforce.assign", sampleManifest.capabilities, "sample")
    ).toThrow(/INVARIANT_P006_VIOLATION/);
  });

  it("P007: Plugin data survives application upgrades without loss", () => {
    expect(() => assertPluginDataUpgradeIntegrity(100, 100)).not.toThrow();
    expect(() => assertPluginDataUpgradeIntegrity(100, 95)).toThrow(
      /INVARIANT_P007_VIOLATION/
    );
  });

  it("P008: Plugin offline mutations converge across devices", () => {
    expect(assertPluginSyncConvergence("STATE_CONVERGED", "STATE_CONVERGED")).toBe(true);
    expect(assertPluginSyncConvergence("STATE_A", "STATE_B")).toBe(false);
  });

  it("P009: Plugin errors do not corrupt core data", () => {
    expect(() => assertCoreIsolationOnPluginFailure(50, 50)).not.toThrow();
    expect(() => assertCoreIsolationOnPluginFailure(50, 48)).toThrow(
      /INVARIANT_P009_VIOLATION/
    );
  });

  it("P010: Plugin financial actions originate from authoritative transactions", () => {
    expect(() => assertPluginFinancialOrigin("RESTAURANT_SALE", 25000)).not.toThrow();
    expect(() => assertPluginFinancialOrigin("", 25000)).toThrow(
      /INVARIANT_P010_VIOLATION/
    );
  });
});
