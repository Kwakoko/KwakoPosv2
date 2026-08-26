export interface OperationalRunbook {
  id: string;
  title: string;
  category: "INFRASTRUCTURE" | "DATA_INTEGRITY" | "SYNC" | "RELEASE" | "SECURITY";
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  diagnosticSteps: string[];
  mitigationSteps: string[];
  verificationCommand: string;
  slaMinutes: number;
}

export class RunbookEngine {
  private static RUNBOOKS: OperationalRunbook[] = [
    {
      id: "RB-001-CLOUDRUN-OUTAGE",
      title: "Google Cloud Run Service Unavailable / Cold Start Timeout",
      category: "INFRASTRUCTURE",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Check Cloud Run container readiness endpoint /readiness",
        "Inspect Cloud Logging for container fatal crashes or OOM events",
        "Verify min-instances setting in Cloud Run configuration",
      ],
      mitigationSteps: [
        "Restart unhealthy Cloud Run revision",
        "Temporarily increase Cloud Run memory allocation to 2Gi",
        "Roll back traffic to previous stable revision if newly deployed",
      ],
      verificationCommand: "curl -I https://kwakopos-production-service-75x6obw55q-uc.a.run.app/health",
      slaMinutes: 10,
    },
    {
      id: "RB-002-POSTGRES-OUTAGE",
      title: "PostgreSQL Database Connection Pool Exhaustion or Unreachable",
      category: "INFRASTRUCTURE",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Verify Cloud SQL / PostgreSQL active connections count",
        "Check for long-running transactions and lock contention in pg_stat_activity",
        "Verify Prisma connection pooling timeout parameters",
      ],
      mitigationSteps: [
        "Terminate orphaned idle-in-transaction client connections",
        "Scale Prisma connection pool limits in DATABASE_URL",
        "Engage standby replica if primary node hardware failure",
      ],
      verificationCommand: "npm run test:integration",
      slaMinutes: 15,
    },
    {
      id: "RB-003-SYNC-BACKLOG",
      title: "Sync Engine Backlog / Elevated Outbox Age (> 15 Minutes)",
      category: "SYNC",
      severity: "HIGH",
      diagnosticSteps: [
        "Query pending outbox mutations count and oldest mutation timestamp",
        "Inspect Sync Engine server logs for batch serialization deadlock",
        "Verify tenant WebSocket connection liveness",
      ],
      mitigationSteps: [
        "Increase Sync Engine worker batch concurrency",
        "Trigger immediate client outbox flush retry",
        "Isolate problematic single mutation causing batch serialization error",
      ],
      verificationCommand: "npm run test:sync",
      slaMinutes: 20,
    },
    {
      id: "RB-004-STOCK-DIVERGENCE",
      title: "Inventory Stock Divergence Detected (Available Stock != Sum Ledger)",
      category: "DATA_INTEGRITY",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Run reconciliation engine across affected tenant / branch",
        "Locate variant records where availableStock != sum(StockLedger.quantityDelta)",
        "Audit recent stock adjustments for missing transaction ledger entries",
      ],
      mitigationSteps: [
        "Halt automated inventory decrements on affected branch",
        "Replay ledger deltas to recalculate authentic available stock balance",
        "Record audited reconciliation event into Production Audit Stream",
      ],
      verificationCommand: "npx tsx scripts/ops/synthetic-monitor.ts",
      slaMinutes: 15,
    },
    {
      id: "RB-005-VARIANT-LOSS",
      title: "Orphaned Variant or Parent Product Disassociation",
      category: "DATA_INTEGRITY",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Check invariant 002 (All variants must reference active parent product)",
        "Inspect foreign key constraints on ProductVariant table",
      ],
      mitigationSteps: [
        "Restore parent product reference from audit log",
        "Block hard delete on product entities with active variant records",
      ],
      verificationCommand: "npm run test:unit",
      slaMinutes: 15,
    },
    {
      id: "RB-006-PWA-UPGRADE-FAILURE",
      title: "PWA Client IndexedDB Schema Upgrade Failure / Outbox Preservation",
      category: "SYNC",
      severity: "HIGH",
      diagnosticSteps: [
        "Inspect client console logs for IndexedDB VersionChangeEvent",
        "Verify outbox mutation records were preserved in transaction",
      ],
      mitigationSteps: [
        "Deploy client hotfix preserving existing object stores without wipe",
        "Trigger PwaVersionManager.safeUpgradeSchema recovery routine",
      ],
      verificationCommand: "npx vitest run tests/unit/pwa-version.test.ts",
      slaMinutes: 30,
    },
    {
      id: "RB-007-AUTH-OUTAGE",
      title: "Authentication Token Verification Failure / Mass 401s",
      category: "SECURITY",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Verify JWT_SECRET consistency between Cloud Run instances",
        "Inspect refresh token rotation logs for premature expiration",
      ],
      mitigationSteps: [
        "Synchronize JWT_SECRET secret in Google Secret Manager",
        "Flush revoked session blacklist cache if corrupted",
      ],
      verificationCommand: "npm run test:integration",
      slaMinutes: 10,
    },
    {
      id: "RB-008-ELEVATED-API-ERRORS",
      title: "Elevated HTTP 5xx Error Rate (> 1%) on Core Endpoints",
      category: "INFRASTRUCTURE",
      severity: "HIGH",
      diagnosticSteps: [
        "Inspect Fastify error logs and trace context correlations",
        "Check downstream PostgreSQL and external dependency latency",
      ],
      mitigationSteps: [
        "Apply rate limiting to abusive IP addresses or rogue clients",
        "Enable circuit breaker on failing sub-modules",
      ],
      verificationCommand: "curl -I https://kwakopos-production-service-75x6obw55q-uc.a.run.app/health",
      slaMinutes: 15,
    },
    {
      id: "RB-009-FAILED-RELEASE",
      title: "Release Candidate Fails Automated Certification or Health Check",
      category: "RELEASE",
      severity: "HIGH",
      diagnosticSteps: [
        "Inspect release gate report in artifacts/release-evidence/",
        "Verify candidate revision identity against main Git SHA",
      ],
      mitigationSteps: [
        "Keep 0% traffic on candidate revision",
        "Mark release state as CERTIFICATION_FAILED in release state machine",
        "Author fix commit and re-trigger pipeline",
      ],
      verificationCommand: "npx tsx scripts/release/observability-release-gate.ts",
      slaMinutes: 15,
    },
    {
      id: "RB-010-ROLLBACK-PROCEDURE",
      title: "Emergency Production Rollback to Previous Stable Revision",
      category: "RELEASE",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Execute RollbackController.checkRollbackCompatibility pre-flight",
        "Verify target stable revision exists and is healthy in Cloud Run",
      ],
      mitigationSteps: [
        "Execute gcloud run services update-traffic --to-revisions=STABLE_REVISION=100",
        "Verify post-rollback health at /health and /version",
        "Open incident INC-ROLLBACK and archive rollback evidence",
      ],
      verificationCommand: "npx tsx scripts/release/version-consistency-gate.ts",
      slaMinutes: 5,
    },
    {
      id: "RB-011-PARTIAL-DEPLOYMENT",
      title: "Canary Traffic Split Anomaly / Stalled Progression",
      category: "RELEASE",
      severity: "MEDIUM",
      diagnosticSteps: [
        "Inspect CanaryController stage metrics snapshot",
        "Check traffic split percentages in Cloud Run service specification",
      ],
      mitigationSteps: [
        "Hold canary stage at current percentage until metrics stabilize",
        "Roll back to 0% if error budget burns rapidly",
      ],
      verificationCommand: "npx tsx scripts/release/observability-release-gate.ts",
      slaMinutes: 20,
    },
    {
      id: "RB-012-DATABASE-RECOVERY",
      title: "Disaster Recovery Point-In-Time Restore Execution",
      category: "INFRASTRUCTURE",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Verify timestamp of target PITR point before data corruption event",
        "Check available storage on target recovery instance",
      ],
      mitigationSteps: [
        "Execute Cloud SQL clone to temporary verification instance",
        "Verify data integrity on cloned database before promoting to primary",
        "Update DATABASE_URL secret and restart Cloud Run",
      ],
      verificationCommand: "npm run test:integration",
      slaMinutes: 60,
    },
    {
      id: "RB-013-TENANT-ISOLATION-INCIDENT",
      title: "Cross-Tenant Query or Data Leakage Detected",
      category: "SECURITY",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Inspect Fastify request trace and tenant context header",
        "Audit repository query filters for missing where: { tenantId }",
      ],
      mitigationSteps: [
        "Immediately block affected user session",
        "Deploy patch enforcing fail-closed repository query filter",
        "Notify Super Admin and security compliance team",
      ],
      verificationCommand: "npx vitest run tests/integration/tenant-isolation.test.ts",
      slaMinutes: 10,
    },
    {
      id: "RB-014-SECURITY-INCIDENT",
      title: "Suspicious API Activity / Credential Stuffing Attack",
      category: "SECURITY",
      severity: "CRITICAL",
      diagnosticSteps: [
        "Inspect IP failure rates on /auth/login and /auth/refresh",
        "Check for unauthorized attempts against /admin/* endpoints",
      ],
      mitigationSteps: [
        "Enable Cloud Armor rate limiting rule on authentication endpoints",
        "Revoke compromised tokens and enforce password reset",
      ],
      verificationCommand: "npm run test:integration",
      slaMinutes: 15,
    },
  ];

  public static getAllRunbooks(): OperationalRunbook[] {
    return [...this.RUNBOOKS];
  }

  public static getRunbookById(id: string): OperationalRunbook | undefined {
    return this.RUNBOOKS.find((r) => r.id === id);
  }
}