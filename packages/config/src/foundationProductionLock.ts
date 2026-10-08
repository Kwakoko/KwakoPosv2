export const FOUNDATION_PRODUCTION_LOCK_VERSION = "1.0.0" as const;
export const FOUNDATION_PRODUCTION_LOCK_CERTIFICATE =
  "KWAKOKOS-FOUNDATION-PRODUCTION-LOCK-CERTIFICATE-v1.0" as const;

export const FOUNDATION_PILLARS = [
  "A01_RELEASE_IDENTITY",
  "A02_AUTH_TRANSPORT",
  "A03_RBAC_TENANT_ISOLATION",
  "A04_NAVIGATION",
  "A05_PERSISTENCE_INDEXEDDB",
  "A06_SYNC_CONVERGENCE",
  "A07_CONFLICT_CENTER",
  "A08_DASHBOARD_ANALYTICS",
  "A09_RUNTIME",
  "A10_SECURITY",
  "A11_RELEASE_AUTHORITY",
  "A12_GOVERNANCE",
] as const;

export const FOUNDATION_REQUIRED_AUTHORITIES = {
  releaseIdentity: "packages/config/src/authoritativeRelease.ts",
  authTransportLock: "scripts/release/auth-transport-lock.mjs",
  rbacContracts: "packages/contracts/src/rbacContracts.ts",
  indexedDb: "apps/web/src/indexedDb.ts",
  syncEngine: "packages/sync/src/worldStandardPrismaSyncEngine.ts",
  conflictLock: "scripts/certification/conflict-center-production-lock.ts",
  dashboardLock: "scripts/certification/dashboard-analytics-production-lock.ts",
  navigationLock: "scripts/certification/navigation-production-lock.ts",
  runtimeGate: "scripts/certification/strict-runtime-certification.ts",
  securityGate: "scripts/certification/strict-security-runtime-gate.ts",
  releaseGovernance: "packages/config/src/releaseCertificationGovernance.ts",
  platformGovernance: "packages/config/src/platformGovernanceControlPlane.ts",
  liveProductionEvidence: "packages/config/src/liveProductionEvidenceGovernance.ts",
  aiAgentGovernance: "packages/config/src/aiAgentGovernance.ts",
} as const;

export const FOUNDATION_REQUIRED_GATES = [
  "certify:foundation",
  "release:auth-lock",
  "certify:navigation-lock",
  "certify:reports",
  "certify:dashboard-lock",
  "certify:semver-lock",
  "certify:inventory-lock",
  "certify:sales-lock",
  "certify:pricing-lock",
  "certify:receipts-lock",
  "certify:notifications-lock",
  "certify:cash-lock",
  "certify:finance-lock",
  "certify:tax-fiscal-lock",
  "certify:backdated-lock",
  "certify:security",
  "production:evidence:verify",
  "platform-governance:verify",
] as const;
