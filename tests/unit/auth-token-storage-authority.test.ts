import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Authentication credential authority", () => {
  it("does not persist bearer access tokens in browser storage", () => {
    const client = read("apps/web/src/services/apiClient.ts");
    expect(client).not.toContain('localStorage.setItem(LEGACY_TOKEN_KEY');
    expect(client).not.toContain('localStorage.getItem(LEGACY_TOKEN_KEY');
    expect(client).not.toContain('session.accessToken');
    expect(client).toContain("Access tokens are memory-only");
    expect(client).toContain('"/auth/refresh"');
  });

  it("does not hardcode wildcard RBAC claims during production token issuance", () => {
    const server = read("apps/api/src/server.ts");
    const refreshStart = server.indexOf('server.post("/auth/refresh"');
    const refreshEnd = server.indexOf("// Logout / revoke session", refreshStart);
    expect(refreshStart).toBeGreaterThanOrEqual(0);
    expect(refreshEnd).toBeGreaterThan(refreshStart);
    const refresh = server.slice(refreshStart, refreshEnd);

    expect(refresh).toContain("prisma.user.findFirst");
    expect(refresh).toContain("sessionUser.role?.permissions");
    expect(refresh).toContain('const roles = [String(sessionUser.role?.name || "ADMIN")]');
    expect(refresh).toContain("const permissions = productionPersistence && Array.isArray(sessionUser.role?.permissions)");
    expect(refresh).toContain("roles,");
    expect(refresh).toContain("permissions,");
    expect(refresh).not.toContain('roles: ["ADMIN"]');
    expect(refresh).not.toContain('permissions: ["*"]');
  });

  it("uses the authoritative role permissions on production login", () => {
    const server = read("apps/api/src/server.ts");
    expect(server).toContain("userPermissions = Array.isArray(existingUser.role?.permissions)");
    expect(server).toContain("permissions: userPermissions");
  });

  it("uses the HttpOnly refresh cookie contract", () => {
    const server = read("apps/api/src/server.ts");
    const client = read("apps/web/src/services/apiClient.ts");
    const refreshStart = server.indexOf('if (routePath === "/auth/refresh"');
    const refreshEnd = server.indexOf('if (routePath === "/auth/logout"', refreshStart);
    const refresh = server.slice(refreshStart, refreshEnd);
    const clientStart = client.indexOf('async function refreshAccessToken()');
    const clientEnd = client.indexOf('export async function login', clientStart);
    const clientRefresh = client.slice(clientStart, clientEnd);

    expect(refresh).toContain('parseCookies(req.headers?.cookie)[REFRESH_COOKIE]');
    expect(server).toContain('HttpOnly; SameSite=Strict; Max-Age=');
    expect(server).toContain('(secure ? "; Secure" : "")');
    expect(server).toContain('const secureCookies = isProductionEnv(config);');
    expect(refresh).toContain('setRefreshCookie(reply, rotated.refreshToken');
    expect(refresh).not.toContain('body.refreshToken');
    expect(refresh).not.toContain('refreshToken?: unknown');
    expect(clientRefresh).toContain('body: JSON.stringify({');
    expect(clientRefresh).toContain('sessionId: stored.sessionId');
    expect(clientRefresh).not.toContain('refreshToken');
    expect(clientRefresh).not.toContain('deviceId: getDeviceId()');
    expect(clientRefresh).not.toContain('tenantId: stored.user.tenantId');
  });


  it("registers the canonical authentication boundary before production routes", () => {
    const server = read("apps/api/src/server.ts");
    const buildStart = server.indexOf("export function buildServer");
    const buildSection = server.slice(buildStart);
    const hookRelative = buildSection.indexOf('server.addHook("onRequest"');
    const firstRouteRelative = buildSection.search(/server\.(?:get|post|put|patch|delete)\(\s*"/);
    const hookStart = buildStart + hookRelative;
    const firstRouteStart = buildStart + firstRouteRelative;
    const canonicalRegistration = buildStart + buildSection.indexOf("registerCanonicalProductionAuthentication(server, config, productionPersistence)");

    expect(buildStart).toBeGreaterThanOrEqual(0);
    expect(hookStart).toBeGreaterThan(buildStart);
    expect(firstRouteStart).toBeGreaterThan(hookStart);
    expect(canonicalRegistration).toBeGreaterThan(hookStart);
    expect(server).toContain("const payload = verifyAccessToken(token)");
  });

  it("does not retain the superseded serverFixed authentication implementation", () => {
    expect(fs.existsSync(path.join(root, "apps/api/src/serverFixed.ts"))).toBe(false);
    expect(fs.existsSync(path.join(root, "apps/api/src/testServerFixed.ts"))).toBe(false);
  });

});
