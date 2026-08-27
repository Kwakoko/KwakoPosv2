import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import type {
  TenantContext,
  Plan,
  Subscription,
  MeterEvent,
  BillingInvoice,
  BillingPayment,
  EntitlementCheckResponse,
} from "@kwakopos2/contracts";
import {
  assertSubscriptionTenantValidity,
  assertSubscriptionPlanVersionValidity,
  assertInvoiceTenantIsolation,
  assertInvoiceReproducibility,
  assertInvoiceLineItemTotalEquality,
  assertPaymentIdempotency,
  assertPaymentAllocationLimit,
  assertSubscriptionStateTransition,
  assertEntitlementMatchesSubscription,
  assertUsageTenantBoundary,
  assertHistoricalInvoicePriceImmutability,
  assertFinancialBillingEventTraceability,
  assertRefundAuditEvidence,
  assertDuplicateWebhookSingleEffect,
  assertDataPreservationOnCancellation,
  EntitlementEngine,
  UsageMeteringEngine,
  SubscriptionLifecycleEngine,
  BillingInvoicingEngine,
} from "@kwakopos2/domain";

describe("Phase 6 — SaaS Monetization Invariants (M001 to M015)", () => {
  const tenantId = `tenant-${randomUUID()}`;
  const planId = `plan-${randomUUID()}`;

  const samplePlan: Plan = {
    id: planId,
    code: "PRO",
    name: "Professional Plan",
    tier: "PROFESSIONAL",
    version: 1,
    status: "ACTIVE",
    billingInterval: "MONTHLY",
    currency: "TZS",
    basePrice: 350000,
    annualDiscountPct: 20,
    trialEligibility: true,
    trialDays: 14,
    limits: {
      userLimit: 50,
      branchLimit: 10,
      transactionLimit: 50000,
      storageMbLimit: 10000,
      apiCallsLimit: 25000,
    },
    featureEntitlements: ["core.pos", "core.finance", "core.workforce", "analytics.advanced"],
    industryEntitlements: ["industry.telecom", "industry.restaurant"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleSub: Subscription = {
    id: `sub-${randomUUID()}`,
    tenantId,
    planId,
    planCode: "PRO",
    planVersion: 1,
    status: "ACTIVE",
    currency: "TZS",
    basePrice: 350000,
    currentPeriodPrice: 350000,
    billingInterval: "MONTHLY",
    items: [],
    startDate: new Date().toISOString(),
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    trialEnd: null,
    gracePeriodEnd: null,
    cancelledAt: null,
    cancelReason: null,
    autoRenew: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("M001: Every active subscription references a valid tenant", () => {
    expect(() => assertSubscriptionTenantValidity(sampleSub, tenantId)).not.toThrow();
    expect(() => assertSubscriptionTenantValidity(sampleSub, "wrong-tenant")).toThrow(/M001/);
  });

  it("M002: Every subscription uses a valid plan version", () => {
    expect(() => assertSubscriptionPlanVersionValidity(sampleSub, samplePlan)).not.toThrow();
    const badSub = { ...sampleSub, planVersion: 0 };
    expect(() => assertSubscriptionPlanVersionValidity(badSub, samplePlan)).toThrow(/M002/);
  });

  it("M003: Every invoice belongs to exactly one tenant", () => {
    const inv: BillingInvoice = {
      id: randomUUID(),
      tenantId,
      subscriptionId: sampleSub.id,
      invoiceNumber: "INV-SUB-001",
      billingPeriodStart: sampleSub.currentPeriodStart,
      billingPeriodEnd: sampleSub.currentPeriodEnd,
      currency: "TZS",
      subtotal: 350000,
      discountTotal: 0,
      taxTotal: 63000,
      grandTotal: 413000,
      amountPaid: 0,
      balanceDue: 413000,
      status: "OPEN",
      dueDate: new Date().toISOString(),
      lines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => assertInvoiceTenantIsolation(inv, tenantId)).not.toThrow();
    expect(() => assertInvoiceTenantIsolation(inv, "other-tenant")).toThrow(/M003/);
  });

  it("M004: Every finalized invoice is reproducible", () => {
    const inv: BillingInvoice = {
      id: randomUUID(),
      tenantId,
      subscriptionId: sampleSub.id,
      invoiceNumber: "INV-SUB-001",
      billingPeriodStart: sampleSub.currentPeriodStart,
      billingPeriodEnd: sampleSub.currentPeriodEnd,
      currency: "TZS",
      subtotal: 350000,
      discountTotal: 0,
      taxTotal: 63000,
      grandTotal: 413000,
      amountPaid: 0,
      balanceDue: 413000,
      status: "OPEN",
      dueDate: new Date().toISOString(),
      lines: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => assertInvoiceReproducibility(inv, 413000)).not.toThrow();
    expect(() => assertInvoiceReproducibility(inv, 400000)).toThrow(/M004/);
  });

  it("M005: Invoice totals equal line-item calculations", () => {
    const inv: BillingInvoice = {
      id: randomUUID(),
      tenantId,
      subscriptionId: sampleSub.id,
      invoiceNumber: "INV-SUB-001",
      billingPeriodStart: sampleSub.currentPeriodStart,
      billingPeriodEnd: sampleSub.currentPeriodEnd,
      currency: "TZS",
      subtotal: 350000,
      discountTotal: 0,
      taxTotal: 63000,
      grandTotal: 413000,
      amountPaid: 0,
      balanceDue: 413000,
      status: "OPEN",
      dueDate: new Date().toISOString(),
      lines: [
        {
          id: randomUUID(),
          description: "Base Pro Plan",
          itemType: "PLAN_SUBSCRIPTION",
          quantity: 1,
          unitPrice: 350000,
          amount: 350000,
          discountAmount: 0,
          taxAmount: 0,
          total: 350000,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => assertInvoiceLineItemTotalEquality(inv)).not.toThrow();
  });

  it("M006: Every payment is idempotent", () => {
    const payments: BillingPayment[] = [
      {
        id: randomUUID(),
        tenantId,
        invoiceId: randomUUID(),
        subscriptionId: sampleSub.id,
        provider: "MPESA",
        providerReference: "TXN-MPESA-1234",
        amount: 413000,
        currency: "TZS",
        status: "SUCCESS",
        idempotencyKey: "IDEMP-PAY-001",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    expect(() => assertPaymentIdempotency(payments, "IDEMP-PAY-NEW")).not.toThrow();
    expect(() => assertPaymentIdempotency(payments, "IDEMP-PAY-001")).toThrow(/M006/);
  });

  it("M007: No payment is allocated above invoice balance", () => {
    expect(() => assertPaymentAllocationLimit(400000, 413000)).not.toThrow();
    expect(() => assertPaymentAllocationLimit(500000, 413000)).toThrow(/M007/);
  });

  it("M008: Subscription state transitions follow the defined state machine", () => {
    expect(() => assertSubscriptionStateTransition("TRIAL", "ACTIVE")).not.toThrow();
    expect(() => assertSubscriptionStateTransition("ACTIVE", "PAST_DUE")).not.toThrow();
    expect(() => assertSubscriptionStateTransition("TRIAL", "PAST_DUE")).toThrow(/M008/);
  });

  it("M009: Entitlements correspond to subscription state", () => {
    const expiredSub = { ...sampleSub, status: "CANCELLED" as const };
    const allowedResult: EntitlementCheckResponse = {
      allowed: true,
      resultCode: "ALLOWED",
      featureKey: "core.pos",
      tenantId,
      message: "Allowed",
    };
    expect(() => assertEntitlementMatchesSubscription(expiredSub, allowedResult)).toThrow(/M009/);
  });

  it("M010: Usage cannot cross tenant boundaries", () => {
    const event: MeterEvent = {
      id: randomUUID(),
      tenantId,
      meterType: "SALES_TRANSACTIONS",
      quantity: 1,
      source: "POS_CHECKOUT",
      operationId: "OP-01",
      idempotencyKey: "IDEMP-01",
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    expect(() => assertUsageTenantBoundary(event, tenantId)).not.toThrow();
    expect(() => assertUsageTenantBoundary(event, "rogue-tenant")).toThrow(/M010/);
  });

  it("M011: Historical invoice prices remain unchanged", () => {
    expect(() => assertHistoricalInvoicePriceImmutability(413000, 413000)).not.toThrow();
    expect(() => assertHistoricalInvoicePriceImmutability(413000, 500000)).toThrow(/M011/);
  });

  it("M012: Every financial billing event has a traceable source", () => {
    expect(() =>
      assertFinancialBillingEventTraceability({
        sourceType: "SUBSCRIPTION_INVOICE",
        description: "Invoice INV-SUB-001",
      })
    ).not.toThrow();
    expect(() =>
      assertFinancialBillingEventTraceability({
        sourceType: "",
        description: "",
      })
    ).toThrow(/M012/);
  });

  it("M013: Refunds and credits have corresponding audit evidence", () => {
    expect(() =>
      assertRefundAuditEvidence({
        id: randomUUID(),
        reason: "Customer accidental duplicate payment",
        approvedBy: "admin-user",
      })
    ).not.toThrow();
    expect(() =>
      assertRefundAuditEvidence({
        id: randomUUID(),
        reason: "",
        approvedBy: "",
      })
    ).toThrow(/M013/);
  });

  it("M014: Duplicate payment callbacks produce single financial result", () => {
    expect(() => assertDuplicateWebhookSingleEffect(1, 1)).not.toThrow();
    expect(() => assertDuplicateWebhookSingleEffect(2, 1)).toThrow(/M014/);
  });

  it("M015: Customer data survives subscription cancellation according to retention policy", () => {
    const beforeCount = 1500; // e.g. 1500 products / sales
    const afterCount = 1500; // preserved
    expect(() => assertDataPreservationOnCancellation(beforeCount, afterCount)).not.toThrow();
    expect(() => assertDataPreservationOnCancellation(beforeCount, 0)).toThrow(/M015/);
  });
});
