import { describe, it, expect } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { generateAccessToken } from "@kwakopos2/auth";

describe("H-026: GDPR & Enterprise Tenant Data Export Endpoint", () => {
  it("should reject unauthenticated request", async () => {
    const server = buildServer();
    await server.ready();

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/tenants/export",
    });

    expect(res.statusCode).toBe(401);
    await server.close();
  });

  it("should reject non-admin tenant user", async () => {
    const server = buildServer();
    await server.ready();

    const token = generateAccessToken({
      sub: "USER_CASHIER",
      tenantId: "TENANT_EXPORT_TEST",
      branchId: "BRANCH_MAIN",
      email: "cashier@test.com",
      roles: ["CASHIER"],
      permissions: ["POS_SALE_CREATE"],
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/tenants/export",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(403);
    await server.close();
  });

  it("should allow tenant admin to export bundle with checksum", async () => {
    const server = buildServer();
    await server.ready();

    const token = generateAccessToken({
      sub: "USER_ADMIN",
      tenantId: "TENANT_EXPORT_TEST",
      branchId: "BRANCH_MAIN",
      email: "admin@test.com",
      roles: ["ADMIN"],
      permissions: ["*"],
    });

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/tenants/export",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.exportVersion).toBe("1.0.0");
    expect(body.data.tenantId).toBe("TENANT_EXPORT_TEST");
    expect(body.data.integrityChecksum).toMatch(/^[0-9a-f]{64}$/);
    expect(res.headers["content-disposition"]).toContain("attachment; filename=");
    await server.close();
  });
});
