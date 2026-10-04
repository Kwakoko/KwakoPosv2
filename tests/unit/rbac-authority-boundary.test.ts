import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());

function read(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("P0 privileged User/Role authority boundary", () => {
  it("routes all User/Role mutations through the privileged PostgreSQL RBAC service", () => {
    const routes = read("apps/api/src/routes/rbacRoutes.ts");
    const service = read("apps/api/src/services/rbacMutationService.ts");
    const server = read("apps/api/src/server.ts");

    expect(server).toContain('import { rbacRoutes } from "./routes/rbacRoutes.js";');
    expect(server).toContain("rbacRoutes(server, { service: rbacMutationService });");
    expect(routes).toContain('server.post("/api/v1/users"');
    expect(routes).toContain('server.delete("/api/v1/users/:id"');
    expect(routes).toContain('server.post("/api/v1/roles"');
    expect(routes).toContain('server.put("/api/v1/roles/:id"');
    expect(routes).toContain('server.delete("/api/v1/roles/:id"');
    expect(routes).toContain("service.createUser");
    expect(routes).toContain("service.createRole");
    expect(routes).toContain("service.updateRole");
    expect(routes).toContain("service.deleteRole");
    expect(service).toContain("this.prisma.$transaction");
    expect(service).toContain('this.audit(tx, actor, actorResolved, "USER_CREATED"');
    expect(service).toContain('this.audit(tx, actor, actorResolved, "ROLE_CREATED"');
  });

  it("forbids User/Role fallback writes from the Users & Roles UI", () => {
    const ui = read("apps/web/src/pages/UsersRolesPage.tsx");
    expect(ui).not.toContain("commitLocalOutbox");
    expect(ui).not.toContain('entityType: "User"');
    expect(ui).not.toContain('entityType: "Role"');
    expect(ui).toContain('"/api/v1/users"');
    expect(ui).toContain('"/api/v1/roles"');
  });

  it("keeps privileged entities outside the ordinary sync protocol", () => {
    const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
    expect(sync).toContain('"Role", "User", "Employee", "PlatformSecurity", "SuperAdmin"');
    expect(sync).toContain("PRIVILEGE_ESCALATION_ATTEMPT_DENIED");
  });
});
