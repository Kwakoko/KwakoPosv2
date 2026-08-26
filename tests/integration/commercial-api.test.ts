import { describe, it, expect, beforeAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import type { FastifyInstance } from "fastify";

describe("Commercial Core REST API Routes (/api/v1/*)", () => {
  let server: FastifyInstance;
  const tenantHeaders = {
    "x-tenant-id": "11111111-1111-1111-1111-111111111111",
    "x-branch-id": "22222222-2222-2222-2222-222222222222",
    "x-user-id": "33333333-3333-3333-3333-333333333333",
  };

  beforeAll(async () => {
    server = buildServer();
    await server.ready();
  });

  it("creates customer and retrieves customer list", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/customers",
      headers: tenantHeaders,
      payload: {
        name: "Acme Retailers",
        phone: "+255 754 111 222",
        creditLimit: 500000,
      },
    });

    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Acme Retailers");

    const listRes = await server.inject({
      method: "GET",
      url: "/api/v1/customers",
      headers: tenantHeaders,
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBeGreaterThan(0);
  });

  it("creates supplier and retrieves supplier list", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/suppliers",
      headers: tenantHeaders,
      payload: {
        name: "Tanzania Distilleries Ltd",
        taxPin: "999-888-777",
      },
    });

    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.name).toBe("Tanzania Distilleries Ltd");
  });

  it("executes product creation, PO, goods receipt, and POS sale", async () => {
    // 1. Create Product & Variant
    const prodRes = await server.inject({
      method: "POST",
      url: "/products",
      headers: tenantHeaders,
      payload: {
        name: "Konyagi 500ml",
        sku: "KONYAGI-500",
        variants: [{ name: "500ml Bottle", sku: "KONYAGI-500ML", price: 7000, costPrice: 5000 }],
      },
    });
    const prod = prodRes.json().data;
    const variantId = prod.variants[0].id;

    // 2. Create Supplier
    const supRes = await server.inject({
      method: "POST",
      url: "/api/v1/suppliers",
      headers: tenantHeaders,
      payload: { name: "Distributor X" },
    });
    const supplierId = supRes.json().data.id;

    // 3. Create Goods Receipt (Adds 50 bottles to stock)
    const recRes = await server.inject({
      method: "POST",
      url: "/api/v1/purchases/receipts",
      headers: tenantHeaders,
      payload: {
        supplierId,
        deviceId: "dev-1",
        operationId: "op-rec-konyagi",
        idempotencyKey: "idem-rec-konyagi",
        items: [{ variantId, quantityReceived: 50, unitCost: 5000 }],
      },
    });
    expect(recRes.statusCode).toBe(201);

    // 4. POS Sale (Sell 2 bottles for 14,000 TZS)
    const saleRes = await server.inject({
      method: "POST",
      url: "/api/v1/pos/sales",
      headers: tenantHeaders,
      payload: {
        items: [{ productId: prod.id, variantId, quantity: 2, unitPrice: 7000, unitCost: 5000 }],
        payments: [{ amount: 14000, paymentMethod: "CASH" }],
        deviceId: "pos-dev-1",
        operationId: "op-sale-konyagi",
        idempotencyKey: "idem-sale-konyagi",
      },
    });
    expect(saleRes.statusCode).toBe(201);
    expect(saleRes.json().data.sale.grandTotal).toBe(14000);

    // 5. Query Dashboard Summary
    const dashRes = await server.inject({
      method: "GET",
      url: "/api/v1/dashboard/executive",
      headers: tenantHeaders,
    });
    expect(dashRes.statusCode).toBe(200);
    expect(dashRes.json().data.todayRevenue).toBeGreaterThanOrEqual(14000);
  });
});