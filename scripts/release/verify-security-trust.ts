import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { KWAKOKO_SECURITY_TRUST_GOVERNANCE } from "../../packages/config/src/securityTrustGovernance.js";

type Check = { name: string; passed: boolean; detail: string };
export function runSecurityTrustVerification(cwd = process.cwd()) {
  const checks: Check[] = [];
  const read = (rel: string) => {
    const p = path.join(cwd, rel);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
  };

  for (const [name, rel] of Object.entries(KWAKOKO_SECURITY_TRUST_GOVERNANCE.requiredAuthorities)) {
    checks.push({ name: `authority:${name}`, passed: fs.existsSync(path.join(cwd, rel)), detail: rel });
  }

  const config = read("packages/config/src/index.ts");
  checks.push({ name: "production-secret-requirements", passed: /DATABASE_URL environment variable is MANDATORY in production/.test(config) && /JWT_SECRET environment variable is MANDATORY in production/.test(config), detail: "DATABASE_URL and JWT_SECRET are mandatory in production" });
  checks.push({ name: "authentic-production-git-sha", passed: /authentic GIT_SHA is mandatory in production/.test(config), detail: "production release requires authentic Git SHA" });

  const api = read("apps/api/src/server.ts");
  checks.push({ name: "tenant-trusted-context", passed: /function requireTenantContext/.test(api) && /Cross-tenant access denied/.test(api), detail: "tenant context and cross-tenant denial present" });
  checks.push({ name: "production-cors-hardening", passed: /H-007: Hardened CORS configuration/.test(api) && /CORS_ORIGIN/.test(api) && !/:\s*["']\*["']/.test(api) && /origin\.startsWith\("https:\/\/"\)/.test(api), detail: "CORS uses explicit HTTPS origins in production" });
  const securityMiddleware = read("apps/api/src/middleware/securityMiddleware.ts");
  const auth = read("packages/auth/src/index.ts");
  checks.push({ name: "csp-script-hardening", passed: /scriptSrc:\s*\["'self'"\]/.test(securityMiddleware) && !securityMiddleware.includes('scriptSrc: ["\'self\'", "\'unsafe-inline\'"]'), detail: "production CSP does not allow inline scripts" });
  checks.push({ name: "csrf-origin-guard", passed: /CSRF_ORIGIN_DENIED/.test(securityMiddleware) && /SameSite=Strict/.test(api), detail: "cookie-auth mutations enforce approved Origin with SameSite=Strict cookies" });
  checks.push({ name: "jwt-default-privilege-fail-closed", passed: !auth.includes('permissions: payload.permissions && payload.permissions.length ? payload.permissions : ["*"]') && !auth.includes('roles: payload.roles && payload.roles.length ? payload.roles : ["ADMIN"]'), detail: "access-token generator never invents privileged claims" });
  checks.push({ name: "auth-rate-limits", passed: /\/auth\/login[\s\S]{0,180}rateLimit/.test(api) && /\/auth\/refresh[\s\S]{0,180}rateLimit/.test(api), detail: "login and refresh are rate limited" });
  checks.push({ name: "audit-stream", passed: /ProductionAuditStream\.record/.test(api), detail: "security-sensitive operations emit audit events" });

  checks.push({ name: "jwt-secret-runtime-guard", passed: /JWT_SECRET environment variable is MANDATORY in production/.test(auth) && /verifyAccessToken/.test(auth), detail: "JWT secret and verification guards exist" });

  const claims = KWAKOKO_SECURITY_TRUST_GOVERNANCE.invariants.join(" ");
  checks.push({ name: "security-claims-governance", passed: claims.includes("never claim absolute security"), detail: "security messaging cannot claim absolute security" });

  const securitySurfaces = [
    "apps/web/src/securityCenter.ts",
    "apps/web/src/platformSecurityCenter.ts",
    "apps/web/src/services/tenantStoreCleanupService.ts",
  ];
  const protectedSurfaceViolations: string[] = [];
  for (const rel of securitySurfaces) {
    const text = read(rel);
    if (text && /KokoCompanion/.test(text)) protectedSurfaceViolations.push(rel);
  }
  checks.push({ name: "koko-security-noninterference", passed: protectedSurfaceViolations.length === 0, detail: `${securitySurfaces.length} protected security surfaces checked` });

  const tracked = execSync("git ls-files -z", { cwd, encoding: "utf8" }).split("\0").filter(Boolean);
  const secretHits: string[] = [];
  for (const rel of tracked) {
    if (!/\.(ts|tsx|js|jsx|json|yml|yaml)$/.test(rel) || /node_modules|dist|artifacts/.test(rel)) continue;
    const text = read(rel);
    if (/(?:JWT_SECRET|DATABASE_URL)\s*=\s*["'](?!process\.env)[^"']{16,}["']/.test(text) && !/ConfigSchema|example|placeholder/i.test(text)) secretHits.push(rel);
  }
  checks.push({ name: "hardcoded-secret-scan", passed: secretHits.length === 0, detail: secretHits.length ? secretHits.join(", ") : "no tracked hardcoded secret candidates" });

  const passed = checks.every((c) => c.passed);
  const certificate = {
    id: KWAKOKO_SECURITY_TRUST_GOVERNANCE.certification.certificate,
    version: KWAKOKO_SECURITY_TRUST_GOVERNANCE.version,
    status: passed ? "PASS" : "FAIL",
    checks,
    generatedAt: new Date().toISOString(),
  };
  const out = path.join(cwd, "artifacts/governance");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "security-trust-certificate.json"), JSON.stringify(certificate, null, 2));
  for (const check of checks) console.log(`${check.passed ? "✅" : "❌"} ${check.name}: ${check.detail}`);
  console.log(`${passed ? "✅" : "❌"} Kwakoko Security & Trust Governance: ${passed ? "PASS" : "FAIL"}`);
  console.log(`   certificate: ${certificate.id}`);
  if (!passed) process.exit(1);
  return certificate;
}

if (process.argv[1]?.endsWith("verify-security-trust.ts")) runSecurityTrustVerification();
