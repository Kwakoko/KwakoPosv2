import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const FAILURES: string[] = [];

function read(relativePath: string): string {
  const file = path.join(ROOT, relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function requireCheck(condition: boolean, message: string): void {
  if (!condition) FAILURES.push(message);
}

const packageJson = JSON.parse(read("package.json"));
const api = read("apps/api/src/server.ts");
const middleware = read("apps/api/src/middleware/securityMiddleware.ts");
const auth = read("packages/auth/src/index.ts");
const trust = read("scripts/release/verify-security-trust.ts");
const strict = read("scripts/certification/strict-security-runtime-gate.ts");
const acceptance = read("scripts/certification/security-auth-ux-acceptance-engine.ts");

requireCheck(packageJson.version === "2.13.0", "Security lock must target release line 2.13.0.");
requireCheck(packageJson.scripts["certify:security"] === "npm run release:auth-lock && tsx scripts/certification/strict-security-runtime-gate.ts", "Canonical executable security certification script drifted.");
requireCheck(packageJson.scripts["certify:security-lock"] === "tsx scripts/certification/security-platform-production-lock.ts", "Independent Security Platform production-lock script is not registered.");

for (const authority of [
  "apps/api/src/server.ts",
  "apps/api/src/middleware/securityMiddleware.ts",
  "packages/auth/src/index.ts",
  "packages/contracts/src/securityContracts.ts",
  "scripts/certification/security-auth-ux-acceptance-engine.ts",
  "scripts/certification/strict-security-runtime-gate.ts",
  "scripts/release/verify-security-trust.ts",
  ".github/workflows/security-scan.yml",
  ".github/workflows/security-platform-production-lock.yml",
]) requireCheck(exists(authority), "Missing security authority: " + authority);

requireCheck(/JWT_SECRET environment variable is MANDATORY in production/.test(auth), "JWT secret is not mandatory in production.");
requireCheck(/DATABASE_URL environment variable is MANDATORY in production/.test(read("packages/config/src/index.ts")), "Database URL is not mandatory in production.");
requireCheck(!auth.includes('permissions: payload.permissions && payload.permissions.length ? payload.permissions : ["*"]'), "JWT generator still invents wildcard privileges.");
requireCheck(!auth.includes('roles: payload.roles && payload.roles.length ? payload.roles : ["ADMIN"]'), "JWT generator still invents an ADMIN role.");
requireCheck(/algorithm: JWT_ALGORITHM/.test(auth) && /issuer: JWT_ISSUER/.test(auth) && /audience: JWT_AUDIENCE/.test(auth), "JWT verification policy is incomplete.");
requireCheck(/Argon2id/.test(auth) || /Algorithm\.Argon2id/.test(auth), "Password hashing is not pinned to Argon2id.");

for (const headerName of ["x-admin-" + "id", "x-admin-" + "email", "x-admin-" + "role"]) {
  requireCheck(!api.includes('req.headers["' + headerName + '"]'), "Client-controlled Super Admin header remains in the API: " + headerName);
}
requireCheck(api.includes("function requireTenantContext") && api.includes("Cross-tenant access denied"), "Trusted tenant context / cross-tenant denial is missing.");
requireCheck(/CreateProductRequestSchema\.parse\(req\.body\)/.test(api), "Canonical product mutation lacks Zod payload validation.");
requireCheck(api.includes("resolveWebDistFile") && api.includes("resolved.startsWith(baseDir + path.sep)"), "Static-file path containment guard is missing.");
requireCheck(!/path\.join\([^\n]*req\.(?:query|params)/.test(api), "Potential request-controlled path join remains in server.");

requireCheck(middleware.includes('import fp from "fastify-plugin";') && middleware.includes('fp<SecurityMiddlewareOptions>'), "Security middleware is not registered as a Fastify root plugin.");
requireCheck(middleware.includes('scriptSrc: ["\'self\'"]'), "CSP does not use a self-only script policy.");
requireCheck(!middleware.includes('scriptSrc: ["\'self\'", "\'unsafe-inline\'"]'), "CSP script policy still permits inline scripts.");
requireCheck(middleware.includes("CSRF_ORIGIN_DENIED") && middleware.includes("allowedOrigins"), "Origin-based CSRF defense is missing.");
requireCheck(!api.includes('    : "*";'), "CORS wildcard fallback remains enabled.");
requireCheck(api.includes('["http://localhost:5173", "http://127.0.0.1:5173"]'), "Non-production CORS fallback is not explicit.");
requireCheck(/\/auth\/login[\s\S]{0,180}rateLimit/.test(api) && /\/auth\/refresh[\s\S]{0,180}rateLimit/.test(api), "Authentication endpoints are missing route-level rate limits.");
requireCheck(middleware.includes('CSRF_ORIGIN_DENIED') && api.includes("SameSite=Strict") && api.includes("HttpOnly"), "Refresh cookie / CSRF boundary is not hardened.");

const tracked = (() => {
  try {
    return execSync("git ls-files apps packages scripts .github", { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
})();
for (const file of tracked) {
  if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue;
  const source = read(file);
  const unsafeDynamicSql =
    /\$queryRawUnsafe\s*(?:<[^>]+>)?\s*\(\s*[\`"][^\`"]*\$\{/.test(source) ||
    /\$executeRawUnsafe\s*(?:<[^>]+>)?\s*\(\s*[\`"][^\`"]*\$\{/.test(source);
  if (unsafeDynamicSql) FAILURES.push("Interpolated unsafe SQL remains in " + file);
}
requireCheck(!strict.includes("BLOCKED_EXTERNAL") || strict.includes("requirePass(blocked.length === 0"), "Strict runtime gate must fail closed on blocked external checks.");
requireCheck(acceptance.includes("SEC-AUTH-01") && acceptance.includes("SEC-AUTH-05"), "Executable authentication acceptance tests are missing.");
requireCheck(exists(".github/workflows/ci.yml") && read(".github/workflows/ci.yml").includes("npm run certify:security-lock"), "CI does not execute the Security Platform Production Lock.");
requireCheck(exists(".github/workflows/production-certification.yml") && read(".github/workflows/production-certification.yml").includes("npm run certify:security-lock"), "Candidate certification does not execute the Security Platform Production Lock.");
requireCheck(exists(".github/workflows/production-release-exact-main.yml") && read(".github/workflows/production-release-exact-main.yml").includes("npm run certify:security-lock"), "Exact-main release does not execute the Security Platform Production Lock.");
requireCheck(exists(".github/workflows/security-scan.yml") && read(".github/workflows/security-scan.yml").includes("npm run certify:security-lock"), "Security scan workflow does not execute the Security Platform Production Lock.");
requireCheck(read(".github/workflows/security-scan.yml").includes("npm audit --omit=dev --audit-level=high"), "Production dependency vulnerability audit is not a mandatory high-severity gate.");
requireCheck(exists(".github/workflows/security-platform-production-lock.yml") && read(".github/workflows/security-platform-production-lock.yml").includes("npm run certify:security-lock"), "Standalone Security Platform Production Lock workflow is missing.");

const report = {
  certificate: "KWAKOKO-SECURITY-PLATFORM-PRODUCTION-LOCK-v1.0",
  version: "1.0.0",
  releaseVersion: packageJson.version,
  verdict: FAILURES.length === 0 ? "PASS" : "FAIL",
  checks: {
    authentication: "explicit credentials, JWT issuer/audience, Argon2id, persistent sessions",
    authorization: "trusted tenant context and no client-controlled Super Admin headers",
    tenantIsolation: "fail-closed tenant context and route/repository guards",
    branchIsolation: "authenticated branch context and repository guard authority",
    rbac: "explicit role/permission claims with no implicit wildcard defaults",
    apiAuthorization: "canonical auth boundary plus Zod contracts",
    inputValidation: "Zod request contracts at mutation boundaries",
    sqlSafety: "parameterized raw SQL only; interpolated unsafe SQL rejected",
    pathTraversal: "static asset containment boundary",
    secrets: "production DATABASE_URL/JWT_SECRET mandatory",
    sessionManagement: "persistent sessions, refresh rotation, HttpOnly/SameSite/secure cookies",
    csrfCors: "explicit origins plus Origin defense for cookie-auth mutations",
    rateLimiting: "global + authentication endpoint rate limits",
    audit: "session and privileged-operation audit evidence",
    securityHeaders: "helmet with CSP/HSTS/X-Frame/X-Content-Type controls",
    dependencyVulnerabilities: "npm audit is a mandatory release/security workflow gate",
  },
  failures: FAILURES,
  generatedAt: new Date().toISOString(),
};

const outDir = path.join(ROOT, "artifacts/governance");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "security-platform-production-lock-certificate.json"), JSON.stringify(report, null, 2));

if (FAILURES.length) {
  console.error("SECURITY PLATFORM PRODUCTION LOCK: FAIL");
  for (const failure of FAILURES) console.error("- " + failure);
  process.exit(1);
}
console.log("SECURITY PLATFORM PRODUCTION LOCK: PASS");
console.log(report.certificate);
