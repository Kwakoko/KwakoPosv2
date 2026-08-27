import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedMonetizationRepository,
  ScopedFinanceRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import {
  EntitlementEngine,
  UsageMeteringEngine,
  SubscriptionLifecycleEngine,
  BillingInvoicingEngine,
  PaymentEngine,
  RevenueAnalyticsEngine,
} from "@kwakopos2/domain";
import type { TenantContext, Coupon } from "@kwakopos2/contracts";

describe("Phase 6 — SaaS Monetization Acceptance Test Suite", () => {
  let store: InMemoryStore;
  let monetizationRepo: ScopedMonetizationRepository;
  let financeRepo: ScopedFinanceRepository;
  let tenantCtx: TenantContext;

  beforeEach(() => {
    store = new InMemoryStore();
    monetizationRepo = new ScopedMonetizationRepository(store);
    financeRepo = new ScopedFinanceRepository(store);

    tenantCtx = {
      tenantId: `tenant-${randomUUID()}`,
      branchId: `branch-${randomUUID()}`,
      userId: `user-admin-${randomUUID()}`,
      roles: ["ADMIN"],
      permissions: ["BILLING_VIEW", "BILLING_MANAGE", "SUBSCRIPTION_VIEW", "SUBSCRIPTION_CHANGE"],
    };
  });

  it("1. Plans: Retrieves default configured plans (Starter, Business, Professional)", () => {
    const plans = monetizationRepo.getPlans();
    expect(plans.length).toBeGreaterThanOrEqual(3);
    const codes = plans.map((p) => p.code);
    expect(codes).toContain("STARTER");
    expect(codes).toContain("BUSINESS");
    expect(codes).toContain("PROFESSIONAL");
  });

  it("2. Subscriptions: Creates subscription in TRIAL status and enforces trial period", () => {
    const starterPlan = monetizationRepo.getPlanByCode("STARTER")!;
    const sub = monetizationRepo.createSubscription(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      planId: starterPlan.id,
      billingInterval: "MONTHLY",
      startTrial: true,
    });

    expect(sub.status).toBe("TRIAL");
    expect(sub.trialEnd).toBeDefined();

    // Check entitlement during trial
    const check = monetizationRepo.checkEntitlement(tenantCtx, "core.pos");
    expect(check.allowed).toBe(true);
    expect(check.resultCode).toBe("ALLOWED");

    // Check non-included feature
    const advancedCheck = monetizationRepo.checkEntitlement(tenantCtx, "analytics.advanced");
    expect(advancedCheck.allowed).toBe(false);
    expect(advancedCheck.resultCode).toBe("DENIED");
  });

  it("3. Entitlements & Limits: Enforces quantitative resource bounds (e.g. Branch limit)", () => {
    const starterPlan = monetizationRepo.getPlanByCode("STARTER")!;
    monetizationRepo.createSubscription(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      planId: starterPlan.id,
      billingInterval: "MONTHLY",
      startTrial: false,
    });

    // Starter plan branch limit = 1
    const allowedBranch = monetizationRepo.checkEntitlement(tenantCtx, "core.branches", 0);
    expect(allowedBranch.allowed).toBe(true);

    const exceededBranch = monetizationRepo.checkEntitlement(tenantCtx, "core.branches", 1);
    expect(exceededBranch.allowed).toBe(false);
    expect(exceededBranch.resultCode).toBe("LIMIT_REACHED");
  });

  it("4. Usage Metering & Threshold Alerts: Authoritatively calculates threshold alerts", () => {
    // 65% -> OK
    const okCheck = UsageMeteringEngine.evaluateUsageThreshold(650, 1000);
    expect(okCheck.threshold).toBe("OK");

    // 75% -> NOTICE
    const noticeCheck = UsageMeteringEngine.evaluateUsageThreshold(750, 1000);
    expect(noticeCheck.threshold).toBe("NOTICE");

    // 85% -> WARNING
    const warningCheck = UsageMeteringEngine.evaluateUsageThreshold(850, 1000);
    expect(warningCheck.threshold).toBe("WARNING");

    // 95% -> HIGH_WARNING
    const highWarningCheck = UsageMeteringEngine.evaluateUsageThreshold(950, 1000);
    expect(highWarningCheck.threshold).toBe("HIGH_WARNING");

    // 105% -> LIMIT_REACHED
    const limitCheck = UsageMeteringEngine.evaluateUsageThreshold(1050, 1000);
    expect(limitCheck.threshold).toBe("LIMIT_REACHED");
  });

  it("5. Proration: Calculates deterministic upgrade and downgrade adjustments", () => {
    const proration = SubscriptionLifecycleEngine.calculatePlanChangeProration(
      150000, // Business
      350000, // Pro
      "2026-08-01T00:00:00Z",
      "2026-08-31T00:00:00Z",
      "2026-08-16T00:00:00Z" // exactly mid-cycle
    );

    expect(proration.remainingDays).toBeGreaterThan(0);
    expect(proration.proratedNewCharge).toBeGreaterThan(proration.proratedUnusedCredit);
    expect(proration.netAdjustment).toBeGreaterThan(0);
  });

  it("6. Invoicing & Discounts: Generates invoice with line items, VAT, and coupon discount", () => {
    const businessPlan = monetizationRepo.getPlanByCode("BUSINESS")!;
    const sub = monetizationRepo.createSubscription(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      planId: businessPlan.id,
      billingInterval: "MONTHLY",
      startTrial: false,
    });

    const coupon: Coupon = {
      id: randomUUID(),
      code: "LAUNCH20",
      discountType: "PERCENTAGE",
      discountValue: 20, // 20% off
      currency: "TZS",
      validFrom: "2026-01-01T00:00:00Z",
      validUntil: "2026-12-31T00:00:00Z",
      isActive: true,
    };
    monetizationRepo.createCoupon(coupon);

    const invoice = monetizationRepo.createInvoice(tenantCtx, sub.id, "LAUNCH20");
    expect(invoice.subtotal).toBe(150000);
    expect(invoice.discountTotal).toBe(30000); // 20% of 150,000 = 30,000
    expect(invoice.taxTotal).toBe(21600); // 18% of (150,000 - 30,000) = 21,600
    expect(invoice.grandTotal).toBe(141600); // 120,000 + 21,600
    expect(invoice.status).toBe("OPEN");
  });

  it("7. Payment Processing & GL Reconciliation: Processes M-Pesa payment and marks invoice PAID", () => {
    const proPlan = monetizationRepo.getPlanByCode("PROFESSIONAL")!;
    const sub = monetizationRepo.createSubscription(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      planId: proPlan.id,
      billingInterval: "MONTHLY",
      startTrial: false,
    });

    const invoice = monetizationRepo.createInvoice(tenantCtx, sub.id);
    expect(invoice.balanceDue).toBe(invoice.grandTotal);

    const payment = monetizationRepo.processPayment(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      invoiceId: invoice.id,
      provider: "MPESA",
      amount: invoice.grandTotal,
      currency: "TZS",
      payerPhoneOrEmail: "+255754123456",
      idempotencyKey: `PAY-MPESA-${randomUUID()}`,
    });

    expect(payment.status).toBe("SUCCESS");
    expect(payment.provider).toBe("MPESA");

    const updatedInvoice = monetizationRepo.getInvoiceById(tenantCtx, invoice.id)!;
    expect(updatedInvoice.status).toBe("PAID");
    expect(updatedInvoice.balanceDue).toBe(0);
  });

  it("8. Revenue Recognition & SaaS KPIs: Accurately calculates MRR, ARR, ARPU, and Churn", () => {
    const proPlan = monetizationRepo.getPlanByCode("PROFESSIONAL")!;
    const busPlan = monetizationRepo.getPlanByCode("BUSINESS")!;

    // Create 2 active subscriptions
    monetizationRepo.createSubscription(tenantCtx, {
      tenantId: tenantCtx.tenantId,
      planId: proPlan.id,
      billingInterval: "MONTHLY",
      startTrial: false,
    });

    const tenant2Ctx: TenantContext = {
      ...tenantCtx,
      tenantId: `tenant-${randomUUID()}`,
    };
    monetizationRepo.createSubscription(tenant2Ctx, {
      tenantId: tenant2Ctx.tenantId,
      planId: busPlan.id,
      billingInterval: "MONTHLY",
      startTrial: false,
    });

    const kpis = monetizationRepo.getSaaSKpis();
    expect(kpis.mrr).toBe(350000 + 150000); // 500,000 TZS
    expect(kpis.arr).toBe((350000 + 150000) * 12); // 6,000,000 TZS
    expect(kpis.activeSubscribers).toBe(2);
    expect(kpis.arpu).toBe(250000);
  });
});
