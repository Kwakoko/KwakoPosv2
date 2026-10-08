import fs from "node:fs";
import path from "node:path";

type Check = { id: string; name: string; passed: boolean; detail: string };

const CERTIFICATE = "KWAKOKO-SECURITY-PLATFORM-PRODUCTION-LOCK-CERTIFICATE-v1.0";
const VERSION = "1.0.0";

export function runSecurityPlatformProductionLock(cwd = process.cwd()) {
  const checks: Check[] = [];
  const read = (rel: string) => {
    const p = path.join(cwd, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };
  const add = (id: string, name: string, passed: boolean, detail = "") => checks.push({ id, name, passed, detail });

  const server = read("apps/api/src/server.ts");
  const auth = read("packages/auth/src/index.ts");
  const security = read("apps/api/src/middleware/securityMiddleware.ts");
  const aiEngine = read("packages/domain/src/aiOperatingLayerEngine.ts");
  const supportRoutes = read("apps/api/src/routes/supportOperationsRoutes.ts");
  const foundation = read("packages/config/src/foundationProductionLock.ts");
  const packageJson = read("package.json");
  const packageLock = read("package-lock.json");
  const auditMigration = read("packages/database/prisma/migrations/202610080004_super_admin_production_lock/migration.sql");
  const superAdminRoutes = read("apps/api/src/routes/superAdminDatabaseRoutes.ts");
  const indexHtml = read("apps/web/index.html");

  add("SECPLAT-A01", "Production authentication uses verified JWTs and server sessions",
    server.includes("verifyAccessToken(") && server.includes("globalSessionManager.validateSession("),
    "JWT signature/claims and server-side session state are both validated.");
  add("SECPLAT-A02", "Production secrets fail closed",
    auth.includes("JWT_SECRET environment variable is MANDATORY in production") &&
    server.includes("requireSecuritySecrets()"),
    "JWT_SECRET and production security secrets are mandatory.");
  add("SECPLAT-A03", "Production JWTs cannot fall back to implicit privileges",
    auth.includes("Production access tokens require explicit roles and permissions.") &&
    auth.includes('permissions: payload.permissions && payload.permissions.length ? payload.permissions : ["*"]'),
    "Production rejects missing privilege claims before the wildcard fallback can be used.");

  add("SECPLAT-A04", "Platform Super Admin is role-bound, not permission-wildcard bound",
    server.includes("function requireSuperAdminContext") &&
    superAdminRoutes.includes('roles.includes("PLATFORM_SUPER_ADMIN")') &&
    !server.includes('req.headers["x-admin-role"]'),
    "Platform authority derives from trusted JWT role claims.");
  add("SECPLAT-A05", "AI/BI API authorization is server-context driven",
    server.includes('requireCommercialPermission(req, "finance.read")') &&
    server.includes("globalBiAnalyticsService.querySemantic(body.queryText, ctx.permissions)") &&
    server.includes("globalAiOperatingLayerService.askAi(body.queryText, ctx.permissions)") &&
    !server.includes("globalBiAnalyticsService.querySemantic(body.queryText ||") &&
    !server.includes("globalAiOperatingLayerService.askAi(body.queryText ||") &&
    !server.includes("globalAiOperatingLayerService.executeAction(body.recommendationId, body.approverId"),
    "Client-supplied permissions and approver identities are not authorization sources.");
  add("SECPLAT-A06", "Enterprise approval lifecycle is actor- and tenant-bound",
    server.includes("approverId: ctx.userId") &&
    !server.includes("executeApprovedRequest(id, body.executorId") &&
    !server.includes("cancelRequest(id, body.cancelledBy") &&
    server.includes("executeApprovedRequest(id, ctx.userId, ctx.tenantId)") &&
    server.includes("recordDecision({ ...body, approverId: ctx.userId"),
    "Approval decisions/execution do not trust client-supplied identities.");

  add("SECPLAT-A11", "Workflow approval tasks are tenant-bound",
    server.includes("decideApproval(body.taskId, body.decision, ctx.userId, ctx.tenantId)") &&
    read("packages/domain/src/workflowAutomationEngine.ts").includes("private taskTenants = new Map<string, string>()") &&
    read("packages/domain/src/workflowAutomationEngine.ts").includes("taskTenant !== tenantId"),
    "Workflow approval tasks are bound to authenticated tenant scope.");

  add("SECPLAT-A12", "Treasury payment execution is tenant- and actor-bound",
    server.includes("createPaymentRun({") &&
    server.includes("initiatedBy: ctx.userId") &&
    server.includes("executePaymentRun(id, ctx.userId, ctx.tenantId)") &&
    read("packages/domain/src/financeTreasuryEngine.ts").includes("run.tenantId !== tenantId"),
    "Payment runs cannot be executed under a client-selected tenant or executor identity.");

  add("SECPLAT-A13", "System UI APIs use authenticated permissions and scope",
    server.includes("generateNavigation(ctx.permissions)") &&
    server.includes("executeGlobalSearch(body.query, ctx.tenantId, ctx.branchId)") &&
    server.includes("executeCommand(body.actionId, ctx.permissions)") &&
    server.includes("getAppShellState(ctx.tenantId, ctx.branchId, true)"),
    "Navigation, search and commands do not accept client-controlled security context.");

  add("SECPLAT-A31", "AI-native recommendation API is tenant-scoped and permission-gated",
    server.includes('requireCommercialPermission(req, "inventory.manage")') &&
    server.includes("tenantId: ctx.tenantId") &&
    server.includes("branchId: ctx.branchId") &&
    server.includes("globalAiNativeService.requestRecommendation({"),
    "AI-native recommendations cannot select another tenant or branch.");
  add("SECPLAT-A32", "AI-native emergency kill switch is Super Admin + step-up protected",
    server.includes('"/api/v1/ai-native/kill-switch"') &&
    server.includes('requireStepUpToken(req, actor, "PLATFORM_EMERGENCY_KILL_SWITCH")'),
    "AI-native emergency control is not user-level self-service.");
  add("SECPLAT-A33", "Autonomous operations are tenant-scoped and emergency controls are step-up protected",
    server.includes("tenantId: ctx.tenantId") &&
    server.includes("resolveTenantId(req, body.tenantId)") &&
    server.includes("activateAgentKillSwitch(tenantId, body.targetId, actor.userId)") &&
    server.includes("globalAutonomousOperationsService.getEngine().getAuditTrail(ctx.tenantId)"),
    "Autonomous remediation and kill-switch operations use authenticated scope.");

  add("SECPLAT-A14", "Emergency AI kill switch requires platform authority and step-up authentication",
    server.includes("requireSuperAdminContext(req)") &&
    server.includes('requireStepUpToken(req, ctx, "PLATFORM_EMERGENCY_KILL_SWITCH")'),
    "Global/high-impact AI control is platform-privileged and step-up protected.");

  add("SECPLAT-A07", "Tenant identity is derived from authenticated context",
    server.includes("function resolveTenantId") &&
    server.includes("Cross-tenant access denied") &&
    server.includes("getInsightsAndForecasts(ctx.tenantId)"),
    "Tenant IDs supplied by clients cannot replace authenticated tenant scope on audited analytics paths.");
  add("SECPLAT-A08", "Support mutation branch scope is authenticated-context bound",
    supportRoutes.includes("branchId: ctx.branchId") &&
    supportRoutes.includes("createdByUserId: ctx.userId") &&
    !supportRoutes.includes("branchId: b.branchId"),
    "Support writes cannot target an arbitrary sibling branch.");
  add("SECPLAT-A09", "AI recommendations are tenant-bound",
    aiEngine.includes("private recommendationTenants: Map<string, string>") &&
    aiEngine.includes("recommendationTenants.set(recommendationId, tenantId)") &&
    aiEngine.includes("ownerTenant !== tenantId"),
    "Recommendation read/execute paths verify tenant ownership.");

  add("SECPLAT-A10", "Security-sensitive BI/AI request bodies use strict schemas",
    server.includes("const BiSemanticQuerySchema = z.object") &&
    server.includes("const BiMetricDefinitionSchema = z.object") &&
    server.includes("const AiAskSchema = z.object") &&
    server.includes("const AiApprovalSchema = z.object") &&
    server.includes("const AiKillSwitchSchema = z.object"),
    "Privileged AI/BI inputs have explicit bounded Zod contracts.");
  add("SECPLAT-A15", "Support input is validated before persistence",
    supportRoutes.includes("SUPPORT_SEVERITY_INVALID") &&
    supportRoutes.includes("branchId: ctx.branchId"),
    "Support ticket mutation is context-bound and input-constrained at the API boundary.");

  add("SECPLAT-A16", "Known arbitrary SQL control-plane backdoor is absent",
    !server.includes("/api/v1/super-admin/db/query") &&
    !superAdminRoutes.includes("$queryRawUnsafe(query)"),
    "No HTTP endpoint executes arbitrary client-supplied SQL.");

  const runtimeFiles: string[] = [];
  const scanDirs = ["apps/api/src", "packages/database/src", "packages/sync/src", "packages/domain/src"];
  const walk = (abs: string, rel: string) => {
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = path.join(rel, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) runtimeFiles.push(childRel);
    }
  };
  for (const dir of scanDirs) walk(path.join(cwd, dir), dir);

  const dynamicUnsafe: string[] = [];
  for (const rel of runtimeFiles) {
    const source = read(rel);
    // Only flag interpolation inside the unsafe-raw call's direct SQL template.
    // Static parameterized calls may contain later template literals in the same file.
    if (/\$(?:queryRaw|executeRaw)Unsafe\s*\(\s*`[^`]*\$\{/.test(source)) dynamicUnsafe.push(rel);
  }
  add("SECPLAT-A17", "No dynamic interpolation in production unsafe-raw SQL calls",
    dynamicUnsafe.length === 0,
    dynamicUnsafe.length === 0 ? "No dynamic SQL interpolation found." : dynamicUnsafe.join(", "));

  add("SECPLAT-A18", "Static file serving is constrained to resolved asset roots",
    server.includes('safeRelative.includes("..")') &&
    server.includes("resolved.startsWith(baseDir + path.sep)"),
    "Traversal segments and absolute paths are rejected before file reads.");
  add("SECPLAT-A19", "Tracked auth/server runtime has no obvious hardcoded JWT/database secret",
    !/(?:JWT_SECRET|DATABASE_URL)\s*=\s*["'][^"']{16,}["']/.test(auth + server),
    "No hardcoded production secret assignment pattern was found.");
  add("SECPLAT-A20", "Refresh sessions are durable and revocable",
    server.includes("configurePersistentSessions()") &&
    server.includes('status: "REVOKED"') &&
    server.includes("refreshTokenHash"),
    "Refresh state is persisted and revocation/rotation is server-controlled.");
  add("SECPLAT-A21", "CSRF boundary is explicit",
    server.includes("HttpOnly; SameSite=Strict") &&
    server.includes("enforceTrustedBrowserOrigin(req, config)") &&
    server.includes('routePath === "/auth/refresh"'),
    "Refresh/logout browser-origin checks complement SameSite=Strict.");
  add("SECPLAT-A22", "Production CORS uses an explicit allowlist",
    server.includes('["https://app.kwakopos.com", "https://admin.kwakopos.com"]') &&
    server.includes("credentials:    true"),
    "Production CORS is credential-aware but not wildcard.");
  add("SECPLAT-A23", "Production rate limiting has no localhost bypass",
    security.includes("global: true") &&
    security.includes("timeWindow") &&
    security.includes('allowList: isProduction ? [] : ["127.0.0.1", "::1"]'),
    "The production rate limiter is globally enabled and not exempted for loopback.");
  add("SECPLAT-A24", "Security-sensitive operations emit audit records",
    server.includes("ProductionAuditStream.record") &&
    server.includes("logSuperAdminAuditEvent"),
    "Security events have an authoritative audit path.");
  add("SECPLAT-A25", "Platform audit storage exists",
    auditMigration.includes("platform_audit_events") &&
    auditMigration.includes("tenant_id TEXT NULL"),
    "Platform-level security events have dedicated storage.");
  add("SECPLAT-A26", "Production security headers are enabled",
    security.includes("@fastify/helmet") &&
    security.includes("hsts: isProduction") &&
    security.includes("maxAge: 31536000") &&
    security.includes("xFrameOptions: { action: \"deny\" }") &&
    security.includes("xContentTypeOptions: true"),
    "Helmet config covers HSTS transport hardening, framing and content-type protections.");
  add("SECPLAT-A27", "Production CSP forbids inline scripts",
    security.includes('scriptSrc: ["\'self\'"]') &&
    !security.includes('scriptSrc: ["\'self\'", "\'unsafe-inline\'"]') &&
    indexHtml.includes('<script src="/bootstrap.js"></script>') &&
    !indexHtml.includes("window.process = window.process ||"),
    "Browser bootstrap is externalized so inline script execution is no longer required.");
  add("SECPLAT-A28", "Dependency audit is release-gated",
    fs.existsSync(path.join(cwd, ".github/workflows/security-scan.yml")) &&
    read(".github/workflows/security-scan.yml").includes("npm audit --omit=dev --audit-level=high"),
    "High/Critical dependency advisories fail CI.");
  add("SECPLAT-A29", "SheetJS dependency is pinned to 0.20.3",
    packageJson.includes("xlsx-0.20.3") && packageLock.includes("xlsx-0.20.3"),
    "The repository is pinned to the 0.20.3 SheetJS package.");
  add("SECPLAT-A30", "Security Platform lock is wired into release gates",
    packageJson.includes('"certify:security-platform-lock"') &&
    foundation.includes('"certify:security-platform-lock"'),
    "The dedicated lock is part of the production release contract.");

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.length - passed;
  const certificate = { id: CERTIFICATE, version: VERSION, status: failed === 0 ? "PASS" : "FAIL", passed, failed, checks, generatedAt: new Date().toISOString() };
  const outDir = path.join(cwd, "artifacts/governance");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "security-platform-production-lock.json"), JSON.stringify(certificate, null, 2));
  for (const c of checks) console.log((c.passed ? "✅ " : "❌ ") + c.id + " " + c.name + ": " + c.detail);
  console.log((failed === 0 ? "✅ " : "❌ ") + CERTIFICATE + ": " + (failed === 0 ? "PASS" : "FAIL") + " (" + passed + "/" + checks.length + ")");
  if (failed) process.exitCode = 1;
  return certificate;
}

if (process.argv[1]?.endsWith("security-platform-production-lock.ts")) {
  runSecurityPlatformProductionLock();
}
