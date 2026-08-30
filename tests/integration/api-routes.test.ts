import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../../apps/api/src/server";
import { globalInMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";
import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";

describe("KwakoPos 2.0 Fastify REST API Integration Suite", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  beforeEach(() => {
    globalInMemoryStore.clear();
  });

  it("GET /health returns 200 OK with system status", async () => {
    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
  });

  it("GET /readiness returns 200 OK", async () => {
    const res = await server.inject({ method: "GET", url: "/readiness" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ready");
  });

  it("GET /version returns release identity matching config", async () => {
    const res = await server.inject({ method: "GET", url: "/version" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.gitSha).toBeDefined();
    expect(body.containerDigest).toBeDefined();
    expect(body.cloudRunRevision).toBeDefined();
  });


  it("POST /auth/login returns JWT access token and user credentials", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@kwakopos.com", password: "securepassword123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.user.email).toBe("admin@kwakopos.com");
  });

  it("Rejects unauthenticated requests to protected endpoints", async () => {
    const res = await server.inject({ method: "GET", url: "/products" });
    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it("Creates product and variant, records inventory adjustment, and queries stock via API", async () => {
    const tenantHeaders = {
      "x-tenant-id": "tenant-http-001",
      "x-branch-id": "branch-http-001",
      "x-user-id": "user-http-001",
    };

    // 1. Create Product
    const createProductRes = await server.inject({
      method: "POST",
      url: "/products",
      headers: tenantHeaders,
      payload: {
        name: "Espresso Coffee",
        sku: "COFFEE-ESP",
        category: "Beverages",
      },
    });

    expect(createProductRes.statusCode).toBe(201);
    const product = createProductRes.json().data;
    expect(product.name).toBe("Espresso Coffee");

    // 2. Add Variant
    const variantId = randomUUID();
    const addVariantRes = await server.inject({
      method: "POST",
      url: `/products/${product.id}/variants`,
      headers: tenantHeaders,
      payload: {
        id: variantId,
        name: "Double Shot",
        sku: "COFFEE-ESP-DBL",
        price: 3.5,
        costPrice: 1.0,
      },
    });

    expect(addVariantRes.statusCode).toBe(201);

    // 3. Record Stock Adjustment (Opening Stock +50)
    const adjRes = await server.inject({
      method: "POST",
      url: "/inventory/adjustments",
      headers: tenantHeaders,
      payload: {
        variantId,
        adjustmentType: "INCREASE",
        quantityChange: 50,
        reason: "Initial Stock",
        deviceId: "device-pos-01",
        operationId: "op-adj-001",
        idempotencyKey: "DEV-01/OP-ADJ-001",
      },
    });

    expect(adjRes.statusCode).toBe(201);

    // 4. Query Stock
    const stockRes = await server.inject({
      method: "GET",
      url: `/inventory/stock/${variantId}`,
      headers: tenantHeaders,
    });

    expect(stockRes.statusCode).toBe(200);
    expect(stockRes.json().data.availableStock).toBe(50);
  });

  it("Enforces Tenant Boundary Isolation: Tenant A cannot read Tenant B products", async () => {
    const tenantAHeaders = {
      "x-tenant-id": "tenant-A-uuid",
      "x-branch-id": "branch-A-uuid",
      "x-user-id": "user-A-uuid",
    };

    const tenantBHeaders = {
      "x-tenant-id": "tenant-B-uuid",
      "x-branch-id": "branch-B-uuid",
      "x-user-id": "user-B-uuid",
    };

    // Tenant A creates product
    await server.inject({
      method: "POST",
      url: "/products",
      headers: tenantAHeaders,
      payload: { name: "Tenant A Item", sku: "SKU-A" },
    });

    // Tenant B queries products
    const resB = await server.inject({
      method: "GET",
      url: "/products",
      headers: tenantBHeaders,
    });

    expect(resB.statusCode).toBe(200);
    expect(resB.json().data).toHaveLength(0); // Tenant B sees 0 products
  });
});
