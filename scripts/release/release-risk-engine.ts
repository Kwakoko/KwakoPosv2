export interface RiskAssessmentInput {
  filesChanged?: number;
  modulesChanged?: string[];
  hasDatabaseMigration?: boolean;
  hasApiChanges?: boolean;
  hasAuthChanges?: boolean;
  hasBillingChanges?: boolean;
  hasSyncChanges?: boolean;
  hasInventoryChanges?: boolean;
  securityFindingsCount?: number;
  testCoverageDelta?: number;
}

export interface RiskAssessmentResult {
  score: number; // 0 - 100
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: Array<{ factor: string; points: number; description: string }>;
  recommendedMitigations: string[];
  requiresManualApproval: boolean;
  canaryStrategy: string;
}

export function evaluateReleaseRisk(input: RiskAssessmentInput = {}): RiskAssessmentResult {
  let score = 10;
  const factors: Array<{ factor: string; points: number; description: string }> = [];
  const mitigations: string[] = [];

  const files = input.filesChanged ?? 12;
  if (files > 50) {
    score += 25;
    factors.push({ factor: "Large File Delta", points: 25, description: `${files} files modified` });
  } else if (files > 20) {
    score += 15;
    factors.push({ factor: "Moderate File Delta", points: 15, description: `${files} files modified` });
  }

  const modules = input.modulesChanged ?? ["POS", "Inventory", "Sync"];
  if (modules.includes("Auth") || input.hasAuthChanges) {
    score += 30;
    factors.push({ factor: "Authentication Vector Changed", points: 30, description: "Core auth engine modified" });
    mitigations.push("Require OAuth2/JWT regression audit before promotion");
  }

  if (modules.includes("Sync") || input.hasSyncChanges) {
    score += 20;
    factors.push({ factor: "Offline Sync Engine Modified", points: 20, description: "IndexedDB delta outbox synchronization modified" });
    mitigations.push("Run multi-device browser convergence synthetic verification");
  }

  if (modules.includes("Billing") || input.hasBillingChanges) {
    score += 25;
    factors.push({ factor: "SaaS Monetization / Billing Touch", points: 25, description: "Subscription metering or payment flow modified" });
    mitigations.push("Execute idempotency gateway trial transactions");
  }

  if (input.hasDatabaseMigration) {
    score += 25;
    factors.push({ factor: "Database Migration Required", points: 25, description: "Prisma schema structural change detected" });
    mitigations.push("Create pre-migration schema snapshot and verify point-in-time recovery");
  }

  if (input.hasApiChanges) {
    score += 15;
    factors.push({ factor: "REST API Contracts Modified", points: 15, description: "API request/response schema updated" });
    mitigations.push("Verify backwards-compatibility with PWA & mobile clients");
  }

  score = Math.min(100, Math.max(0, score));

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let requiresManualApproval = false;
  let canaryStrategy = "100% Immediate Rollout";

  if (score >= 75) {
    riskLevel = "CRITICAL";
    requiresManualApproval = true;
    canaryStrategy = "Canary Tenant → 1% → 5% → 25% → 50% → 100% (24-hour observation window)";
  } else if (score >= 50) {
    riskLevel = "HIGH";
    requiresManualApproval = true;
    canaryStrategy = "Canary Tenant → 5% → 25% → 100% (6-hour observation window)";
  } else if (score >= 25) {
    riskLevel = "MEDIUM";
    canaryStrategy = "Canary Tenant → 10% → 50% → 100% (1-hour observation window)";
  }

  if (mitigations.length === 0) {
    mitigations.push("Standard post-deployment synthetic health check suite");
  }

  return {
    score,
    riskLevel,
    factors,
    recommendedMitigations: mitigations,
    requiresManualApproval,
    canaryStrategy,
  };
}

if (process.argv[1]?.endsWith("release-risk-engine.ts")) {
  console.log(evaluateReleaseRisk());
}
