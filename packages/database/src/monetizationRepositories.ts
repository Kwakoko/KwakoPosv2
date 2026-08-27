import { randomUUID } from "crypto";
import type {
  TenantContext,
  Plan,
  CreatePlanRequest,
  UpdatePlanRequest,
  Subscription,
  CreateSubscriptionRequest,
  ChangePlanRequest,
  MeterEvent,
  RecordUsageRequest,
  UsageAggregate,
  MeterType,
  BillingInvoice,
  BillingPayment,
  ProcessPaymentRequest,
  Coupon,
  SaaSKpiMetrics,
  EntitlementCheckResponse,
} from "@kwakopos2/contracts";
import {
  EntitlementEngine,
  UsageMeteringEngine,
  SubscriptionLifecycleEngine,
  BillingInvoicingEngine,
  SaaSPaymentEngine,
  RevenueAnalyticsEngine,

  assertSubscriptionTenantValidity,
  assertSubscriptionPlanVersionValidity,
  assertInvoiceTenantIsolation,
  assertPaymentIdempotency,
  assertPaymentAllocationLimit,
  assertSubscriptionStateTransition,
  assertUsageTenantBoundary,
} from "@kwakopos2/domain";
import { InMemoryStore, globalInMemoryStore } from "./index.js";

export class ScopedMonetizationRepository {
  private store: InMemoryStore;

  constructor(store?: InMemoryStore) {
    this.store = store as any;
  }

  // =========================================================================
  // Plan Catalog Management
  // =========================================================================

  private initializeDefaultPlans() {
    if (!this.store) {
      this.store = globalInMemoryStore;
    }
    if (!this.store || !this.store.plans) return;
    if (this.store.plans.size > 0) return;



    const defaultPlans: Plan[] = [
      {
        id: "plan-starter-001",
        code: "STARTER",
        name: "Starter Plan",
        tier: "STARTER",
        version: 1,
        description: "Essential POS and inventory for single-branch businesses",
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currency: "TZS",
        basePrice: 50000,
        annualDiscountPct: 15,
        trialEligibility: true,
        trialDays: 14,
        limits: {
          userLimit: 3,
          branchLimit: 1,
          transactionLimit: 1000,
          storageMbLimit: 500,
          apiCallsLimit: 500,
        },
        featureEntitlements: ["core.pos", "core.inventory", "core.customers", "core.suppliers"],
        industryEntitlements: ["industry.retail"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "plan-business-002",
        code: "BUSINESS",
        name: "Business Plan",
        tier: "BUSINESS",
        version: 1,
        description: "Advanced POS, finance, and multi-branch control",
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currency: "TZS",
        basePrice: 150000,
        annualDiscountPct: 20,
        trialEligibility: true,
        trialDays: 14,
        limits: {
          userLimit: 10,
          branchLimit: 5,
          transactionLimit: 10000,
          storageMbLimit: 5000,
          apiCallsLimit: 10000,
        },
        featureEntitlements: [
          "core.pos",
          "core.inventory",
          "core.customers",
          "core.suppliers",
          "core.finance",
          "core.reports",
        ],
        industryEntitlements: ["industry.retail", "industry.restaurant", "industry.wholesale"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: "plan-pro-003",
        code: "PROFESSIONAL",
        name: "Professional Plan",
        tier: "PROFESSIONAL",
        version: 1,
        description: "Complete operations with Workforce, Analytics, and Industry verticals",
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        currency: "TZS",
        basePrice: 350000,
        annualDiscountPct: 25,
        trialEligibility: true,
        trialDays: 14,
        limits: {
          userLimit: 50,
          branchLimit: 20,
          transactionLimit: 100000,
          storageMbLimit: 50000,
          apiCallsLimit: 100000,
        },
        featureEntitlements: [
          "core.pos",
          "core.inventory",
          "core.customers",
          "core.suppliers",
          "core.finance",
          "core.workforce",
          "core.reports",
          "analytics.advanced",
          "api.access",
        ],
        industryEntitlements: [
          "industry.retail",
          "industry.restaurant",
          "industry.pharmacy",
          "industry.garage",
          "industry.wholesale",
          "industry.construction",
          "industry.telecom",
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const p of defaultPlans) {
      this.store.plans.set(p.id, p);
    }
  }

  createPlan(req: CreatePlanRequest): Plan {
    this.initializeDefaultPlans();
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const plan: Plan = {
      id,
      code: req.code.toUpperCase(),
      name: req.name,
      tier: req.tier,
      version: 1,
      description: req.description || null,
      status: "ACTIVE",
      billingInterval: req.billingInterval || "MONTHLY",
      currency: req.currency || "TZS",
      basePrice: req.basePrice,
      annualDiscountPct: req.annualDiscountPct || 0,
      trialEligibility: req.trialEligibility !== undefined ? req.trialEligibility : true,
      trialDays: req.trialDays !== undefined ? req.trialDays : 14,
      limits: req.limits,
      featureEntitlements: req.featureEntitlements,
      industryEntitlements: req.industryEntitlements,
      createdAt: now,
      updatedAt: now,
    };
    this.store.plans.set(id, plan);
    return plan;
  }

  getPlans(): Plan[] {
    this.initializeDefaultPlans();
    return Array.from(this.store.plans.values()).filter((p) => p.status === "ACTIVE");
  }

  getPlanById(planId: string): Plan | null {
    this.initializeDefaultPlans();
    return this.store.plans.get(planId) || null;
  }

  getPlanByCode(code: string): Plan | null {
    this.initializeDefaultPlans();
    return (
      Array.from(this.store.plans.values()).find(
        (p) => p.code.toUpperCase() === code.toUpperCase() && p.status === "ACTIVE"
      ) || null
    );
  }

  // =========================================================================
  // Subscription Lifecycle Management
  // =========================================================================

  createSubscription(ctx: TenantContext, req: CreateSubscriptionRequest): Subscription {
    this.initializeDefaultPlans();
    const plan = this.getPlanById(req.planId);
    if (!plan) throw new Error(`Plan ${req.planId} not found`);

    const now = new Date();
    const startIso = now.toISOString();

    const periodDays = req.billingInterval === "ANNUAL" ? 365 : req.billingInterval === "QUARTERLY" ? 90 : 30;
    const periodEnd = new Date(now.getTime() + periodDays * 86400000).toISOString();

    const isTrial = req.startTrial && plan.trialEligibility;
    const trialDays = req.customTrialDays !== undefined ? req.customTrialDays : plan.trialDays;
    const trialEnd = isTrial ? new Date(now.getTime() + trialDays * 86400000).toISOString() : null;

    const subscriptionId = randomUUID();
    const subscription: Subscription = {
      id: subscriptionId,
      tenantId: ctx.tenantId,
      planId: plan.id,
      planCode: plan.code,
      planVersion: plan.version,
      status: isTrial ? "TRIAL" : "ACTIVE",
      currency: req.currency || plan.currency,
      basePrice: plan.basePrice,
      currentPeriodPrice: plan.basePrice,
      billingInterval: req.billingInterval,
      items: req.items || [],
      startDate: startIso,
      currentPeriodStart: startIso,
      currentPeriodEnd: periodEnd,
      trialEnd,
      gracePeriodEnd: null,
      cancelledAt: null,
      cancelReason: null,
      autoRenew: req.autoRenew !== undefined ? req.autoRenew : true,
      createdAt: startIso,
      updatedAt: startIso,
    };

    assertSubscriptionTenantValidity(subscription, ctx.tenantId);
    assertSubscriptionPlanVersionValidity(subscription, plan);

    this.store.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  getSubscription(ctx: TenantContext): Subscription | null {
    this.initializeDefaultPlans();
    const sub = Array.from(this.store.subscriptions.values()).find((s) => s.tenantId === ctx.tenantId);
    return sub || null;
  }

  changePlan(ctx: TenantContext, subscriptionId: string, req: ChangePlanRequest): Subscription {
    const sub = this.store.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    assertSubscriptionTenantValidity(sub, ctx.tenantId);

    const targetPlan = this.getPlanById(req.targetPlanId);
    if (!targetPlan) throw new Error(`Target Plan ${req.targetPlanId} not found`);

    assertSubscriptionStateTransition(sub.status, "ACTIVE");

    sub.planId = targetPlan.id;
    sub.planCode = targetPlan.code;
    sub.planVersion = targetPlan.version;
    sub.basePrice = targetPlan.basePrice;
    sub.currentPeriodPrice = targetPlan.basePrice;
    sub.status = "ACTIVE";
    sub.updatedAt = new Date().toISOString();

    this.store.subscriptions.set(subscriptionId, sub);
    return sub;
  }

  cancelSubscription(ctx: TenantContext, subscriptionId: string, reason: string): Subscription {
    const sub = this.store.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    assertSubscriptionTenantValidity(sub, ctx.tenantId);

    assertSubscriptionStateTransition(sub.status, "CANCELLED");

    sub.status = "CANCELLED";
    sub.cancelledAt = new Date().toISOString();
    sub.cancelReason = reason;
    sub.updatedAt = new Date().toISOString();

    this.store.subscriptions.set(subscriptionId, sub);
    return sub;
  }

  // =========================================================================
  // Server-Side Entitlement Check
  // =========================================================================

  checkEntitlement(ctx: TenantContext, featureKey: string, currentUsage?: number): EntitlementCheckResponse {
    const sub = this.getSubscription(ctx);
    const plan = sub ? this.getPlanById(sub.planId) : null;
    return EntitlementEngine.evaluateEntitlement(sub, plan, featureKey, currentUsage);
  }

  // =========================================================================
  // Usage Metering
  // =========================================================================

  recordUsage(ctx: TenantContext, req: RecordUsageRequest): MeterEvent {
    this.initializeDefaultPlans();
    const existing = Array.from(this.store.meterEvents.values()).find(
      (m) => m.tenantId === ctx.tenantId && m.idempotencyKey === req.idempotencyKey
    );
    if (existing) return existing;

    const sub = this.getSubscription(ctx);
    const now = new Date().toISOString();
    const event: MeterEvent = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      subscriptionId: sub?.id,
      meterType: req.meterType,
      quantity: req.quantity,
      source: req.source,
      operationId: req.operationId,
      idempotencyKey: req.idempotencyKey,
      occurredAt: req.occurredAt || now,
      createdAt: now,
    };

    assertUsageTenantBoundary(event, ctx.tenantId);
    this.store.meterEvents.set(event.id, event);
    return event;
  }

  getUsageAggregate(ctx: TenantContext, meterType: MeterType): UsageAggregate {
    this.initializeDefaultPlans();
    const events = Array.from(this.store.meterEvents.values()).filter(
      (m) => m.tenantId === ctx.tenantId && m.meterType === meterType
    );
    const totalQuantity = events.reduce((acc, e) => acc + e.quantity, 0);

    const sub = this.getSubscription(ctx);
    const plan = sub ? this.getPlanById(sub.planId) : null;

    let limit: number | undefined;
    if (plan) {
      if (meterType === "USERS") limit = plan.limits.userLimit;
      else if (meterType === "BRANCHES") limit = plan.limits.branchLimit;
      else if (meterType === "SALES_TRANSACTIONS") limit = plan.limits.transactionLimit;
      else if (meterType === "STORAGE_MB") limit = plan.limits.storageMbLimit;
      else if (meterType === "API_CALLS") limit = plan.limits.apiCallsLimit;
    }

    const remaining = limit !== undefined ? Math.max(0, limit - totalQuantity) : undefined;
    const overage = limit !== undefined ? UsageMeteringEngine.calculateOverageCharge(totalQuantity, limit, 10) : { overageQuantity: 0, unitOverageRate: 0, overageChargeTotal: 0 };

    return {
      tenantId: ctx.tenantId,
      meterType,
      periodKey: new Date().toISOString().substring(0, 7),
      totalQuantity,
      limit,
      remaining,
      overageQuantity: overage.overageQuantity,
      overageRate: overage.unitOverageRate,
      overageChargeTotal: overage.overageChargeTotal,
    };
  }

  // =========================================================================
  // Invoicing & Payments
  // =========================================================================

  createInvoice(ctx: TenantContext, subscriptionId: string, couponCode?: string): BillingInvoice {
    this.initializeDefaultPlans();
    const sub = this.store.subscriptions.get(subscriptionId);
    if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
    assertSubscriptionTenantValidity(sub, ctx.tenantId);

    const plan = this.getPlanById(sub.planId);
    if (!plan) throw new Error(`Plan ${sub.planId} not found`);

    let coupon: Coupon | null = null;
    if (couponCode) {
      coupon = Array.from(this.store.coupons.values()).find((c) => c.code === couponCode && c.isActive) || null;
    }

    const invoiceCount = Array.from(this.store.billingInvoices.values()).filter((i) => i.tenantId === ctx.tenantId).length;
    const invoice = BillingInvoicingEngine.generateSubscriptionInvoice(ctx, sub, plan, {
      sequence: invoiceCount + 1,
      coupon,
    });

    assertInvoiceTenantIsolation(invoice, ctx.tenantId);
    this.store.billingInvoices.set(invoice.id, invoice);
    return invoice;
  }

  getInvoices(ctx: TenantContext): BillingInvoice[] {
    this.initializeDefaultPlans();
    return Array.from(this.store.billingInvoices.values()).filter((i) => i.tenantId === ctx.tenantId);
  }

  getInvoiceById(ctx: TenantContext, invoiceId: string): BillingInvoice | null {
    this.initializeDefaultPlans();
    const inv = this.store.billingInvoices.get(invoiceId);
    if (!inv) return null;
    assertInvoiceTenantIsolation(inv, ctx.tenantId);
    return inv;
  }

  processPayment(ctx: TenantContext, req: ProcessPaymentRequest): BillingPayment {
    this.initializeDefaultPlans();
    const invoice = this.getInvoiceById(ctx, req.invoiceId);
    if (!invoice) throw new Error(`Invoice ${req.invoiceId} not found`);

    assertPaymentAllocationLimit(req.amount, invoice.balanceDue);

    const existingPayments = Array.from(this.store.billingPayments.values()).filter((p) => p.tenantId === ctx.tenantId);
    assertPaymentIdempotency(existingPayments, req.idempotencyKey);

    const payment = SaaSPaymentEngine.processPayment(ctx, req, invoice.subscriptionId);
    this.store.billingPayments.set(payment.id, payment);


    // Update Invoice Status
    invoice.amountPaid += payment.amount;
    invoice.balanceDue = Math.max(0, invoice.grandTotal - invoice.amountPaid);
    if (invoice.balanceDue === 0) {
      invoice.status = "PAID";
      invoice.paidAt = new Date().toISOString();
    }
    this.store.billingInvoices.set(invoice.id, invoice);

    // Update Subscription status to ACTIVE if it was TRIAL or PAST_DUE
    const sub = this.store.subscriptions.get(invoice.subscriptionId);
    if (sub && (sub.status === "TRIAL" || sub.status === "PAST_DUE" || sub.status === "GRACE_PERIOD")) {
      sub.status = "ACTIVE";
      this.store.subscriptions.set(sub.id, sub);
    }

    return payment;
  }

  getPayments(ctx: TenantContext): BillingPayment[] {
    this.initializeDefaultPlans();
    return Array.from(this.store.billingPayments.values()).filter((p) => p.tenantId === ctx.tenantId);
  }

  // =========================================================================
  // Coupons & Promotions
  // =========================================================================

  createCoupon(coupon: Coupon): Coupon {
    this.initializeDefaultPlans();
    this.store.coupons.set(coupon.id, coupon);
    return coupon;
  }

  // =========================================================================
  // SaaS Analytics & KPIs
  // =========================================================================

  getSaaSKpis(): SaaSKpiMetrics {
    this.initializeDefaultPlans();
    const allSubs = Array.from(this.store.subscriptions.values());
    const activeSubs = allSubs.filter((s) => s.status === "ACTIVE" || s.status === "GRACE_PERIOD");
    const trialSubs = allSubs.filter((s) => s.status === "TRIAL");
    const cancelledCount = allSubs.filter((s) => s.status === "CANCELLED").length;
    const allPayments = Array.from(this.store.billingPayments.values());

    return RevenueAnalyticsEngine.calculateSaaSKpis(activeSubs, trialSubs, cancelledCount, allPayments);
  }
}

