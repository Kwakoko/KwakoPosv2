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
    expect(refresh).toContain("roles: [effectiveRole]");
    expect(refresh).toContain("permissions: effectivePermissions");
    expect(refresh).not.toContain('roles: ["ADMIN"]');
    expect(refresh).not.toContain('permissions: ["*"]');
  });

  it("uses the authoritative role permissions on production login", () => {
    const server = read("apps/api/src/server.ts");
    expect(server).toContain("userPermissions = Array.isArray(existingUser.role?.permissions)");
    expect(server).toContain("permissions: userPermissions");
  });
});
