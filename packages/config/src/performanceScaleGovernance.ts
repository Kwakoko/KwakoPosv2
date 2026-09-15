/**
 * Kwakoko Performance & Global Scale Governance
 * Step 15 - canonical, fail-closed performance authority.
 */
export const KWAKOKO_PERFORMANCE_SCALE_GOVERNANCE = {
  version: "1.0.0",
  authority: "Kwakoko Performance & Global Scale Governance Registry",
  certificate: "KWAKOKO-PERFORMANCE-SCALE-CERTIFICATE-v1.0",
  failClosed: true,
  performanceBudgets: {
    apiP95Ms: 500,
    apiP99Ms: 1000,
    posCheckoutP95Ms: 400,
    bootstrapP95Ms: 1500,
    syncCycleP95Ms: 1000,
    pwaLcpMs: 2500,
    errorRatePct: 0.5,
  },
  capacityBudgets: {
    maxTenantProducts: 100000,
    maxTenantVariants: 250000,
    maxBranches: 1000,
    dailyTransactions: 50000,
    dailySyncEvents: 250000,
  },
  workloadProfiles: ["BASELINE_1X", "MULTIPLIER_10X", "MULTIPLIER_50X", "STRESS_100X"],
  regionalInvariants: [
    "Tenant data MUST remain isolated across every region and replica.",
    "All authoritative writes MUST converge through the same persistence and sync contracts regardless of region.",
    "Regional degradation MUST not silently convert to a healthy release state.",
    "Offline-first clients MUST continue local operation during transient regional network loss.",
    "Cross-region evidence MUST identify region, revision, workload, timestamp, and release identity.",
  ],
  optimizationControls: [
    "API latency and throughput MUST be measured with percentile evidence.",
    "Database query pressure and connection saturation MUST be observable before promotion.",
    "PWA bundle and critical-path performance MUST remain within governed budgets.",
    "Capacity projections MUST be tied to measured workload profiles and explicit assumptions.",
    "Load tests MUST distinguish simulation evidence from real multi-region production evidence.",
  ],
  releaseGate: {
    requiredEvidence: [
      "performanceBenchmark",
      "capacityModel",
      "bundleBudget",
      "databasePressure",
      "regionalIsolation",
      "delegatedReliabilityGovernance",
    ],
    delegatedGates: [
      "brand:verify",
      "design:verify",
      "workflow:verify",
      "ai-governance:verify",
      "security-trust:verify",
      "privacy-data:verify",
      "lifecycle-dr:verify",
      "production-reliability:verify",
    ],
  },
  authorities: {
    benchmark: "scripts/certification/performance-benchmark-engine.ts",
    capacityModel: "scripts/certification/capacity-model-generator.ts",
    certification: "scripts/certification/runPerformanceCertification.ts",
    dashboard: "apps/web/src/kpcpPerformanceDashboard.ts",
    releaseService: "apps/api/src/services/releaseService.ts",
    observability: "packages/observability/src/metricsCollector.ts",
    webBuild: "apps/web/package.json",
    database: "packages/database/src/prismaRepositories.ts",
    reliabilityGovernance: "packages/config/src/productionReliabilityGovernance.ts",
  },
} as const;

export type KwakokoPerformanceScaleGovernance = typeof KWAKOKO_PERFORMANCE_SCALE_GOVERNANCE;
