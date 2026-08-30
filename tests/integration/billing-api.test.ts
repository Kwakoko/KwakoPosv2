import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { generateAccessToken } from "@kwakopos2/auth";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";

describe("Phase 6 — SaaS Monetization REST API Integration Suite", () => {
  let app: FastifyInstance;
  let authToken: string;
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    app = buildServer();
    await app.ready();

    authToken = generateAccessToken({
      tenantId,
      branchId,
      userId,
      roles: ["ADMIN"],
      permissions: [
        "BILLING_VIEW",
        "BILLING_MANAGE",
        "SUBSCRIPTION_VIEW",
        "SUBSCRIPTION_CHANGE",
        "PLAN_MANAGE",
        "INVOICE_VIEW",
        "INVOICE_MANAGE",
        "PAYMENT_VIEW",
        "PAYMENT_RECONCILE",
      ],
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("GET /api/v1/billing/plans returns list of active SaaS plans", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/billing/plans",
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /api/v1/billing/subscriptions creates a new subscription", async () => {
    // 1. Get starter plan ID
    const plansRes = await app.inject({
      method: "GET",
      url: "/api/v1/billing/plans",
      headers: { authorization: `Bearer ${authToken}` },
    });
    const starterPlan = JSON.parse(plansRes.body).data.find((p: any) => p.code === "STARTER");

    // 2. Create subscription
    const subRes = await app.inject({
      method: "POST",
      url: "/api/v1/billing/subscriptions",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        planId: starterPlan.id,
        billingInterval: "MONTHLY",
        startTrial: true,
      },
    });

    expect(subRes.statusCode).toBe(201);
    const subBody = JSON.parse(subRes.body);
    expect(subBody.success).toBe(true);
    expect(subBody.data.status).toBe("TRIAL");
    expect(subBody.data.planCode).toBe("STARTER");
  });

  it("GET /api/v1/billing/entitlements/check evaluates feature entitlement", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/billing/entitlements/check?featureKey=core.pos",
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.allowed).toBe(true);
    expect(body.data.resultCode).toBe("ALLOWED");
  });

  it("POST /api/v1/billing/usage/record registers idempotent usage events", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/billing/usage/record",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        tenantId,
        meterType: "SALES_TRANSACTIONS",
        quantity: 5,
        source: "POS_SALES_CHECKOUT",
        operationId: "OP-SALES-001",
        idempotencyKey: `IDEMP-USAGE-${randomUUID()}`,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.quantity).toBe(5);
  });

  it("POST /api/v1/billing/invoices/generate generates invoice and processes payment", async () => {
    // 1. Get current subscription
    const subRes = await app.inject({
      method: "GET",
      url: "/api/v1/billing/subscriptions/current",
      headers: { authorization: `Bearer ${authToken}` },
    });
    const sub = JSON.parse(subRes.body).data;

    // 2. Generate invoice
    const invRes = await app.inject({
      method: "POST",
      url: "/api/v1/billing/invoices/generate",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        subscriptionId: sub.id,
      },
    });
    expect(invRes.statusCode).toBe(201);
    const invoice = JSON.parse(invRes.body).data;
    expect(invoice.status).toBe("OPEN");
    expect(invoice.grandTotal).toBeGreaterThan(0);

    // 3. Process payment
    const payRes = await app.inject({
      method: "POST",
      url: "/api/v1/billing/payments/process",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        tenantId,
        invoiceId: invoice.id,
        provider: "MPESA",
        amount: invoice.grandTotal,
        currency: "TZS",
        payerPhoneOrEmail: "+255754000111",
        idempotencyKey: `IDEMP-PAY-${randomUUID()}`,
      },
    });
    expect(payRes.statusCode).toBe(201);
    const payment = JSON.parse(payRes.body).data;
    expect(payment.status).toBe("SUCCESS");
    expect(payment.provider).toBe("MPESA");
  });

  it("GET /api/v1/billing/reports/kpis returns executive SaaS KPI summary", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/billing/reports/kpis",
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.mrr).toBeDefined();
    expect(body.data.arr).toBeDefined();
    expect(body.data.activeSubscribers).toBeDefined();
  });
});
