export const KWAKOKO_PLATFORM_GOVERNANCE_VERSION = "1.0.0" as const;
export const KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE = "KWAKOKO-PLATFORM-GOVERNANCE-CERTIFICATE-v1.0" as const;

export const PLATFORM_GOVERNANCE_LIFECYCLE = ["PROPOSE", "ASSESS", "AUTHORIZE", "IMPLEMENT", "VERIFY", "PUBLISH", "MONITOR", "EXCEPT", "REVIEW", "RETIRE"] as const;
export const PLATFORM_AUTHORITY_HIERARCHY = ["GLOBAL_PLATFORM", "COUNTRY", "TENANT", "BRANCH", "USER"] as const;
export const PLATFORM_GOVERNANCE_INVARIANTS = [
  "single-governance-authority", "global-country-tenant-branch-user-precedence", "tenant-isolation", "delegated-administration", "segregation-of-duties", "least-privilege-platform-access", "immutable-governance-audit", "versioned-policy-registry", "versioned-configuration", "feature-flag-precedence", "module-registry-authority", "release-authority", "governance-exception-expiry", "platform-kill-switch", "fail-closed-governance", "no-hardcoded-health-claims", "evidence-bound-certification", "no-uncontrolled-platform-forks", "truthful-governance-claims"
] as const;
export const PLATFORM_GOVERNANCE_AUTHORITIES = {
  contracts: "packages/contracts/src/platformGovernanceContracts.ts",
  platformEngine: "packages/domain/src/platformGovernanceEngine.ts",
  platformService: "apps/api/src/services/platformGovernanceService.ts",
  platformCertification: "scripts/certification/platform-governance-certification-engine.ts",
  superAdminContracts: "packages/contracts/src/superAdminPlatformContracts.ts",
  superAdminEngine: "packages/domain/src/superAdminPlatformEngine.ts",
  globalPlatformContracts: "packages/contracts/src/globalPlatformContracts.ts",
  globalPlatformEngine: "packages/domain/src/globalPlatformEngine.ts",
  tenantOrganization: "packages/domain/src/foundation/tenantOrganizationEngine.ts",
  moduleRegistry: "apps/web/src/modules/moduleRegistry.ts",
  authoritativeRelease: "packages/config/src/authoritativeRelease.ts",
  releasePolicy: "scripts/release/release-policy-engine.ts",
  releaseState: "scripts/release/release-state-machine.ts",
  releaseCandidate: "scripts/release/release-candidate-engine.ts",
  releaseIdentity: "scripts/release/releaseIdentity.ts",
  aiAgentGovernance: "packages/config/src/aiAgentGovernance.ts",
  aiOperatingLayer: "packages/config/src/aiOperatingLayerGovernance.ts",
  autonomousOperations: "packages/config/src/autonomousOperationsGovernance.ts",
  securityTrust: "packages/config/src/securityTrustGovernance.ts",
  privacyData: "packages/config/src/privacyDataGovernance.ts",
  reliability: "packages/config/src/productionReliabilityGovernance.ts",
  performance: "packages/config/src/performanceScaleGovernance.ts",
  lifecycleDr: "packages/config/src/dataLifecycleDrGovernance.ts",
  biAnalytics: "packages/config/src/biAnalyticsGovernance.ts",
  commercial: "packages/config/src/commercialProductReadinessGovernance.ts",
  enterprise: "packages/config/src/enterpriseCustomerReadinessGovernance.ts",
  integrations: "packages/config/src/integrationApiEcosystemGovernance.ts",
  marketplace: "packages/config/src/marketplacePartnerGovernance.ts"
} as const;
export const PLATFORM_GOVERNANCE_EXCEPTION_RULES = { requiresOwner: true, requiresRisk: true, requiresMitigation: true, requiresExpiry: true, requiresApproval: true, expiredExceptionsMustBlock: true } as const;
export const PLATFORM_GOVERNANCE_RELEASE_GATES = [
  "authority-present", "hierarchy-present", "separation-of-duties-present", "tenant-isolation-present", "policy-registry-present", "configuration-precedence-present", "feature-flag-precedence-present", "module-registry-present", "release-authority-present", "exception-expiry-present", "platform-kill-switch-present", "delegated-governance-present", "evidence-convergence-present", "no-hardcoded-governance-metrics", "prior-governance-convergence-present"
] as const;
export type PlatformGovernanceLifecycle = (typeof PLATFORM_GOVERNANCE_LIFECYCLE)[number];
export type PlatformAuthorityLevel = (typeof PLATFORM_AUTHORITY_HIERARCHY)[number];
export interface PlatformGovernanceRegistry { version: string; certificateId: string; lifecycle: readonly PlatformGovernanceLifecycle[]; authorityHierarchy: readonly PlatformAuthorityLevel[]; invariants: readonly string[]; releaseGates: readonly string[]; authorities: Record<string, string>; exceptionRules: typeof PLATFORM_GOVERNANCE_EXCEPTION_RULES; }
export const platformGovernanceRegistry: PlatformGovernanceRegistry = { version: KWAKOKO_PLATFORM_GOVERNANCE_VERSION, certificateId: KWAKOKO_PLATFORM_GOVERNANCE_CERTIFICATE, lifecycle: PLATFORM_GOVERNANCE_LIFECYCLE, authorityHierarchy: PLATFORM_AUTHORITY_HIERARCHY, invariants: PLATFORM_GOVERNANCE_INVARIANTS, releaseGates: PLATFORM_GOVERNANCE_RELEASE_GATES, authorities: PLATFORM_GOVERNANCE_AUTHORITIES, exceptionRules: PLATFORM_GOVERNANCE_EXCEPTION_RULES };
