import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { loadConfig } from "../../packages/config/src/index.js";

describe("Runtime Version & Release Endpoints Integration Tests", () => {
  let server: any;

  beforeAll(async () => {
    const config = loadConfig({
      APP_VERSION: "2.1.0",
      NODE_ENV: "test",
      PORT: "3003",
    });
    server = buildServer({ config, productionPersistence: false });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it("GET /api/system/version returns non-sensitive canonical release metadata", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/system/version",
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.version).toBe("2.1.0");
    expect(json.gitTag).toBe("v2.1.0");
    expect(json.gitSha).toBeDefined();
    expect(json.compatibility).toBeDefined();
    expect(json.compatibility.databaseSchemaVersion).toBeGreaterThan(0);
    expect(json.compatibility.syncProtocolVersion).toBeGreaterThan(0);

    // Ensure zero sensitive data leakage
    expect(json.DATABASE_URL).toBeUndefined();
    expect(json.JWT_SECRET).toBeUndefined();
    expect(json.password).toBeUndefined();
  });

  it("GET /version provides backward-compatible alias", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/version",
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.version).toBe("2.1.0");
    expect(json.gitTag).toBe("v2.1.0");
  });

  it("GET /admin/releases/compatibility returns client & protocol compatibility requirements", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/admin/releases/compatibility",
      headers: {
        "x-tenant-id": "test-tenant",
        "x-branch-id": "test-branch",
        "x-user-id": "test-admin",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.minSupportedClientVersion).toBe("2.0.0");
    expect(json.data.syncProtocolVersion).toBe(2);
    expect(json.data.pwaSchemaVersion).toBe(7);
  });

  it("GET /admin/releases/history returns auditable release history and active revision", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/admin/releases/history",
      headers: {
        "x-tenant-id": "test-tenant",
        "x-branch-id": "test-branch",
        "x-user-id": "test-admin",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.success).toBe(true);
    expect(json.data.currentVersion).toBe("2.1.0");
    expect(json.data.history.length).toBeGreaterThan(0);
    expect(json.data.history[0].certification).toBe("PASS");
  });
});