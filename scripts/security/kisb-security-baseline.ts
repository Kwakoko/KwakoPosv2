export interface KISBControl {
  controlId: string;
  category: string;
  requirement: string;
  implementation: string;
  evidencePath: string;
  owner: string;
  testMethod: string;
  testFrequency: "CONTINUOUS" | "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
  status: "IMPLEMENTED_AND_EVIDENCED" | "IN_PROGRESS" | "EXCEPTION_GRANTED";
  remediationPlan?: string;
  approvalStatus: "APPROVED" | "PENDING_REVIEW";
}

export function getKwakoPosSecurityBaseline(): {
  version: string;
  lastUpdated: string;
  totalControls: number;
  evidencedControlsCount: number;
  controls: KISBControl[];
} {
  const controls: KISBControl[] = [
    {
      controlId: "KISB-IAM-001",
      category: "Identity & Access Management",
      requirement: "Enforce Argon2id / bcrypt password hashing, min 12 chars, rate limiting",
      implementation: "@kwakopos2/auth AuthModule argon2/bcrypt hash engine + Fastify rate-limiter",
      evidencePath: "packages/auth/src/index.ts",
      owner: "SecOps / Platform Lead",
      testMethod: "Automated Unit & Integration Test",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-AUTH-002",
      category: "Authentication & Session Security",
      requirement: "Short-lived JWT tokens (15m), refresh-token rotation, stateless revocation",
      implementation: "JwtService token revocation list & token rotation handler",
      evidencePath: "packages/auth/src/tokenService.ts",
      owner: "Lead Backend Engineer",
      testMethod: "Integration Test",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-RBAC-003",
      category: "Authorization & RBAC",
      requirement: "Declarative permission checks on all protected API endpoints",
      implementation: "Fastify auth hook & assertTenantIsolation / assertRolePermission guards",
      evidencePath: "apps/api/src/server.ts",
      owner: "API Security Lead",
      testMethod: "Automated API Contract Test",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-TENANT-004",
      category: "Tenant & Branch Isolation",
      requirement: "Strict multi-tenant boundary checks on every DB query & sync outbox replay",
      implementation: "ScopedRepository pattern in @kwakopos2/database enforcing tenantId filter",
      evidencePath: "packages/database/src/index.ts",
      owner: "Lead Architect",
      testMethod: "Cross-Tenant Attack Simulator",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-PAM-005",
      category: "Privileged Access Management",
      requirement: "Least privilege for Super Admin, zero orphaned or excessive accounts",
      implementation: "Privileged Access Manager & quarterly recertification scanner",
      evidencePath: "scripts/security/privileged-access-manager.ts",
      owner: "CISO / Security Committee",
      testMethod: "Automated PAM Scanner",
      testFrequency: "QUARTERLY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-CRYPTO-006",
      category: "Encryption in Transit & at Rest",
      requirement: "TLS 1.3 in transit, AES-256 for offline IndexedDB & DB storage",
      implementation: "Cloud Run TLS termination & LocalIndexedDbStore client encryption",
      evidencePath: "apps/web/src/indexedDb.ts",
      owner: "DevOps Engineer",
      testMethod: "SSL Labs / Cipher Suite Scanner",
      testFrequency: "WEEKLY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-API-007",
      category: "Application & API Security",
      requirement: "Strict schema validation via Zod, input sanitization against XSS/SQLi",
      implementation: "Zod contract schemas in @kwakopos2/contracts & Prisma ORM parameterized queries",
      evidencePath: "packages/contracts/src/index.ts",
      owner: "API Tech Lead",
      testMethod: "SAST & PenTest API Fuzzer",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-SYNC-008",
      category: "Offline & Synchronization Security",
      requirement: "Cryptographic idempotency keys, replay prevention, outbox integrity check",
      implementation: "SyncEngine duplicate operation filter & IndexedDB migration safety",
      evidencePath: "packages/sync/src/index.ts",
      owner: "Distributed Systems Lead",
      testMethod: "Chaos Failure Injector",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-AUDIT-009",
      category: "Audit Logging & Integrity",
      requirement: "Tamper-evident audit trails with cryptographic SHA-256 hash chaining",
      implementation: "AuditLogIntegrityEngine generating immutable chain hashes",
      evidencePath: "scripts/security/audit-log-integrity-engine.ts",
      owner: "Security Architect",
      testMethod: "Audit Verification Scanner",
      testFrequency: "DAILY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-SUPPLY-010",
      category: "Supply Chain & SBOM",
      requirement: "SLSA Level 3 provenance statements and SPDX 2.3 SBOM generation",
      implementation: "ArtifactAttestor & SBOMGenerator executed in CI/CD pipeline",
      evidencePath: "scripts/release/artifact-attestor.ts",
      owner: "DevSecOps Lead",
      testMethod: "SBOM Verification Scanner",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-VULN-011",
      category: "Vulnerability Management",
      requirement: "Severity-based remediation SLAs: Critical < 24h, High < 7d, Med < 30d",
      implementation: "VulnerabilityManagementEngine tracking automated findings",
      evidencePath: "scripts/security/vulnerability-management-engine.ts",
      owner: "SecOps Lead",
      testMethod: "Dependabot / Trivy / Snyk Scanner",
      testFrequency: "DAILY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-SECRETS-012",
      category: "Secrets Management",
      requirement: "Zero hardcoded secrets, GCP Secret Manager integration, secret scanning",
      implementation: "Centralized environment variable loader & secret scanner gate",
      evidencePath: "packages/config/src/index.ts",
      owner: "DevOps Engineer",
      testMethod: "TruffleHog / GitGuardian SAST",
      testFrequency: "CONTINUOUS",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-PRIVACY-013",
      category: "Privacy & Data Protection",
      requirement: "GDPR & Tanzania PDPA compliance, data minimization, deletion workflows",
      implementation: "Data Minimization Filter & Customer Right-To-Be-Forgotten API",
      evidencePath: "packages/domain/src/commercialInvariants.ts",
      owner: "Data Protection Officer (DPO)",
      testMethod: "Privacy Impact Assessment Audit",
      testFrequency: "QUARTERLY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-IR-014",
      category: "Incident Response",
      requirement: "Formally documented IR playbooks and tabletop exercise drill runner",
      implementation: "IncidentResponseRunner executing 6 major breach scenarios",
      evidencePath: "scripts/security/incident-response-runner.ts",
      owner: "Incident Response Commander",
      testMethod: "Tabletop Simulation Drill",
      testFrequency: "QUARTERLY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
    {
      controlId: "KISB-BCDR-015",
      category: "Disaster Recovery & Business Continuity",
      requirement: "Point-in-time database snapshot restoration with RPO < 5m, RTO < 15m",
      implementation: "DatabaseMigrationGate pre-migration snapshot backup runner",
      evidencePath: "scripts/release/database-migration-gate.ts",
      owner: "Infrastructure Lead",
      testMethod: "Automated PITR Drill",
      testFrequency: "WEEKLY",
      status: "IMPLEMENTED_AND_EVIDENCED",
      approvalStatus: "APPROVED",
    },
  ];

  const totalControls = controls.length;
  const evidencedControlsCount = controls.filter((c) => c.status === "IMPLEMENTED_AND_EVIDENCED").length;

  return {
    version: "2.2.0",
    lastUpdated: new Date().toISOString(),
    totalControls,
    evidencedControlsCount,
    controls,
  };
}

if (process.argv[1]?.endsWith("kisb-security-baseline.ts")) {
  console.log(getKwakoPosSecurityBaseline());
}
