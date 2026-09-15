import { randomUUID } from "crypto";
import type {
  TenantContext,
  Plan,
  PlanLimit,
  Subscription,
  SubscriptionStatus,
  EntitlementResultCode,
  EntitlementCheckResponse,
  MeterEvent,
  UsageAggregate,
  MeterType,
  BillingInvoice,
  BillingInvoiceLine,
  InvoiceStatus,
  BillingPayment,
  PaymentProvider,
  PaymentStatus,
  ProcessPaymentRequest,
  SaaSKpiMetrics,
  Coupon,
} from "@kwakopos2/contracts";
import { TransactionNumbering } from "./transactionNumbering.js";

// =========================================================================
// 1. Entitlement Engine

// =========================================================================

export class EntitlementEngine {
  /**
   * Authoritative server-side feature access and usage limit evaluation.
   * Never relies on client-side state.
   */
  static evaluateEntitlement(
    subscription: Subscription | null,
    plan: Plan | null,
    featureKey: string,
    currentUsage?: number
  ): EntitlementCheckResponse {
    const tenantId = subscription?.tenantId || "00000000-0000-0000-0000-000000000000";

    // 1. Check if subscription exists
    if (!subscription) {
      return {
        allowed: false,
        resultCode: "SUBSCRIPTION_INACTIVE",
        featureKey,
        tenantId,
        message: "No active subscription found for tenant.",
      };
    }

    // 2. Check subscription lifecycle status
    if (subscription.status === "CANCELLED" || subscription.status === "SUSPENDED" || subscription.status === "EXPIRED") {
      return {
        allowed: false,
        resultCode: "SUBSCRIPTION_INACTIVE",
        featureKey,
        tenantId,
        message: `Subscription is ${subscription.status}. Access denied.`,
      };
    }

    if (subscription.status === "TRIAL") {
      if (subscription.trialEnd && new Date(subscription.trialEnd) < new Date()) {
        return {
          allowed: false,
          resultCode: "TRIAL_EXPIRED",
          featureKey,
          tenantId,
          message: "Free trial period has expired. Please choose a paid plan.",
        };
      }
    }

    // 3. Evaluate Plan Feature Entitlements
    if (!plan) {
      return {
        allowed: false,
        resultCode: "DENIED",
        featureKey,
        tenantId,
        message: "Subscription plan definition unavailable.",
      };
    }

    // 4. Evaluate Quantitative Resource Limits
    let limit: number | undefined;
    if (featureKey === "core.users" || featureKey === "users") {
      limit = plan.limits.userLimit;
    } else if (featureKey === "core.branches" || featureKey === "branches") {
      limit = plan.limits.branchLimit;
    } else if (featureKey === "core.transactions" || featureKey === "transactions") {
      limit = plan.limits.transactionLimit;
    } else if (featureKey === "storage" || featureKey === "storage.mb") {
      limit = plan.limits.storageMbLimit;
    } else if (featureKey === "api.access" || featureKey === "api") {
      limit = plan.limits.apiCallsLimit;
    }

    const hasFeature =
      limit !== undefined ||
      plan.featureEntitlements.includes(featureKey) ||
      plan.featureEntitlements.includes("all") ||
      plan.industryEntitlements.includes(featureKey) ||
      (subscription.items || []).some((item) => item.code === featureKey);

    if (!hasFeature) {
      return {
        allowed: false,
        resultCode: "DENIED",
        featureKey,
        tenantId,
        message: `Feature '${featureKey}' is not included in plan '${plan.name}'.`,
      };
    }

    if (limit !== undefined && currentUsage !== undefined && currentUsage >= limit) {
      return {
        allowed: false,
        resultCode: "LIMIT_REACHED",
        featureKey,
        tenantId,
        currentUsage,
        limit,
        message: `Usage limit reached for '${featureKey}' (${currentUsage}/${limit}). Upgrade plan to increase limits.`,
      };
    }

    return {
      allowed: true,
      resultCode: "ALLOWED",
      featureKey,
      tenantId,
      currentUsage,
      limit,
      message: "Entitlement verified and granted.",
    };
  }

}

// =========================================================================
// 2. Usage Metering Engine
// =========================================================================

export class UsageMeteringEngine {
  /**
   * Evaluates usage alert thresholds (Notice: 70%, Warning: 80%, High Warning: 90%, Limit: 100%)
   */
  static evaluateUsageThreshold(current: number, limit: number): {
    threshold: "OK" | "NOTICE" | "WARNING" | "HIGH_WARNING" | "LIMIT_REACHED";
    percent: number;
    warningMessage?: string;
  } {
    if (limit <= 0) return { threshold: "OK", percent: 0 };
    const pct = Math.round((current / limit) * 100);

    if (pct >= 100) {
      return {
        threshold: "LIMIT_REACHED",
        percent: pct,
        warningMessage: `CRITICAL: Resource limit reached (${current}/${limit}). Further operations may be restricted or billed at overage rates.`,
      };
    } else if (pct >= 90) {
      return {
        threshold: "HIGH_WARNING",
        percent: pct,
        warningMessage: `HIGH WARNING: Usage at ${pct}% of plan limit (${current}/${limit}).`,
      };
    } else if (pct >= 80) {
      return {
        threshold: "WARNING",
        percent: pct,
        warningMessage: `WARNING: Usage at ${pct}% of plan limit (${current}/${limit}).`,
      };
    } else if (pct >= 70) {
      return {
        threshold: "NOTICE",
        percent: pct,
        warningMessage: `NOTICE: Usage has reached ${pct}% of plan limit (${current}/${limit}).`,
      };
    }
    return { threshold: "OK", percent: pct };
  }

  /**
   * Calculates overage charge for usage exceeding plan allowance
   */
  static calculateOverageCharge(
    actualUsage: number,
    planLimit: number,
    unitOverageRate: number
  ): {
    overageQuantity: number;
    unitOverageRate: number;
    overageChargeTotal: number;
  } {
    const overageQuantity = Math.max(0, actualUsage - planLimit);
    const overageChargeTotal = overageQuantity * unitOverageRate;
    return {
      overageQuantity,
      unitOverageRate,
      overageChargeTotal,
    };
  }
}

// =========================================================================
// 3. Subscription Lifecycle & Proration Engine
// =========================================================================

export class SubscriptionLifecycleEngine {
  /**
   * Validates state machine transition according to invariant M008.
   */
  static validateStateTransition(
    current: SubscriptionStatus,
    target: SubscriptionStatus
  ): boolean {
    const allowedTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
      TRIAL: ["ACTIVE", "EXPIRED", "CANCELLED"],
      ACTIVE: ["PAST_DUE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "ACTIVE"],
      PAST_DUE: ["ACTIVE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED"],
      GRACE_PERIOD: ["ACTIVE", "SUSPENDED", "CANCELLED"],
      SUSPENDED: ["ACTIVE", "CANCELLED"],
      CANCELLED: ["ACTIVE"], // Reactivation
      EXPIRED: ["ACTIVE"],
    };

    const allowed = allowedTransitions[current] || [];
    return allowed.includes(target);
  }

  /**
   * Calculates deterministic proration for mid-cycle plan changes.
   */
  static calculatePlanChangeProration(
    currentPlanPrice: number,
    newPlanPrice: number,
    periodStartDate: string,
    periodEndDate: string,
    changeDate: string = new Date().toISOString()
  ): {
    totalDaysInPeriod: number;
    remainingDays: number;
    proratedUnusedCredit: number;
    proratedNewCharge: number;
    netAdjustment: number;
  } {
    const start = new Date(periodStartDate).getTime();
    const end = new Date(periodEndDate).getTime();
    const change = new Date(changeDate).getTime();

    const totalDurationMs = Math.max(1, end - start);
    const remainingDurationMs = Math.max(0, Math.min(totalDurationMs, end - change));

    const totalDaysInPeriod = Math.max(1, Math.round(totalDurationMs / 86400000));
    const remainingDays = Math.max(0, Math.round(remainingDurationMs / 86400000));

    const remainingFraction = remainingDurationMs / totalDurationMs;

    const proratedUnusedCredit = Math.round(currentPlanPrice * remainingFraction);
    const proratedNewCharge = Math.round(newPlanPrice * remainingFraction);
    const netAdjustment = proratedNewCharge - proratedUnusedCredit;

    return {
      totalDaysInPeriod,
      remainingDays,
      proratedUnusedCredit,
      proratedNewCharge,
      netAdjustment,
    };
  }
}

// =========================================================================
// 4. Billing & Invoicing Engine
// =========================================================================

export class BillingInvoicingEngine {
  /**
   * Generates a complete recurring subscription invoice with line items, tax, and discounts.
   */
  static generateSubscriptionInvoice(
    ctx: TenantContext,
    subscription: Subscription,
    plan: Plan,
    options: {
      sequence?: number;
      coupon?: Coupon | null;
      taxRatePct?: number;
      overageCharges?: { description: string; amount: number }[];
    } = {}
  ): BillingInvoice {
    const sequence = options.sequence || 1;
    const invoiceNumber = TransactionNumbering.formatNumber("INV", "MAIN", sequence);
    const lines: BillingInvoiceLine[] = [];


    // 1. Base Subscription Line Item
    const baseAmount = subscription.currentPeriodPrice || plan.basePrice;
    lines.push({
      id: randomUUID(),
      description: `${plan.name} Subscription (${subscription.billingInterval})`,
      itemType: "PLAN_SUBSCRIPTION",
      quantity: 1,
      unitPrice: baseAmount,
      amount: baseAmount,
      discountAmount: 0,
      taxAmount: 0,
      total: baseAmount,
    });

    // 2. Add-on and Plugin Items
    for (const item of subscription.items || []) {
      const itemAmount = item.quantity * item.unitPrice;
      lines.push({
        id: randomUUID(),
        description: `Add-on: ${item.code} (x${item.quantity})`,
        itemType: item.itemType === "PLUGIN" ? "PLUGIN" : "ADDON",
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: itemAmount,
        discountAmount: 0,
        taxAmount: 0,
        total: itemAmount,
      });
    }

    // 3. Usage Overage Items
    for (const overage of options.overageCharges || []) {
      lines.push({
        id: randomUUID(),
        description: overage.description,
        itemType: "USAGE_OVERAGE",
        quantity: 1,
        unitPrice: overage.amount,
        amount: overage.amount,
        discountAmount: 0,
        taxAmount: 0,
        total: overage.amount,
      });
    }

    // Subtotal
    const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);

    // 4. Apply Coupon / Discount
    let discountTotal = 0;
    if (options.coupon && options.coupon.isActive) {
      if (options.coupon.discountType === "PERCENTAGE") {
        discountTotal = Math.round((subtotal * options.coupon.discountValue) / 100);
      } else {
        discountTotal = Math.min(subtotal, options.coupon.discountValue);
      }

      if (discountTotal > 0) {
        lines.push({
          id: randomUUID(),
          description: `Discount (${options.coupon.code})`,
          itemType: "DISCOUNT",
          quantity: 1,
          unitPrice: -discountTotal,
          amount: -discountTotal,
          discountAmount: 0,
          taxAmount: 0,
          total: -discountTotal,
        });
      }
    }

    const taxableAmount = Math.max(0, subtotal - discountTotal);
    const taxRatePct = options.taxRatePct !== undefined ? options.taxRatePct : 18; // Default 18% VAT in East Africa
    const taxTotal = Math.round((taxableAmount * taxRatePct) / 100);

    const grandTotal = taxableAmount + taxTotal;
    const now = new Date().toISOString();
    const dueDate = new Date(Date.now() + 14 * 86400000).toISOString();

    return {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      subscriptionId: subscription.id,
      invoiceNumber,
      billingPeriodStart: subscription.currentPeriodStart,
      billingPeriodEnd: subscription.currentPeriodEnd,
      currency: subscription.currency || "TZS",
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      amountPaid: 0,
      balanceDue: grandTotal,
      status: "OPEN",
      dueDate,
      lines,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Maps subscription billing invoice to Phase 2 General Ledger double-entry accounts.
   */
  static mapInvoiceToFinanceJournal(
    ctx: TenantContext,
    invoice: BillingInvoice,
    accounts: {
      receivableAccountId: string;
      subscriptionRevenueAccountId: string;
      deferredRevenueAccountId?: string;
      taxPayableAccountId: string;
    },
    journalSequence = 1
  ) {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    const lines = [];


    // Dr Accounts Receivable
    lines.push({
      accountId: accounts.receivableAccountId,
      description: `SaaS Subscription Invoice ${invoice.invoiceNumber}`,
      debit: invoice.grandTotal,
      credit: 0,
    });

    // Cr Subscription Revenue (or Deferred Revenue)
    const netRevenue = invoice.grandTotal - invoice.taxTotal;
    lines.push({
      accountId: accounts.subscriptionRevenueAccountId,
      description: `Subscription Revenue - Invoice ${invoice.invoiceNumber}`,
      debit: 0,
      credit: netRevenue,
    });

    // Cr VAT Output Payable (if tax > 0)
    if (invoice.taxTotal > 0) {
      lines.push({
        accountId: accounts.taxPayableAccountId,
        description: `VAT Output Tax - Invoice ${invoice.invoiceNumber}`,
        debit: 0,
        credit: invoice.taxTotal,
      });
    }

    return {
      journalNumber,
      entryDate: new Date().toISOString(),
      sourceType: "SUBSCRIPTION_INVOICE",
      description: `Subscription Billing Invoice ${invoice.invoiceNumber}`,
      totalDebit: invoice.grandTotal,
      totalCredit: invoice.grandTotal,
      lines,
    };
  }
}

// =========================================================================
// 5. Payment Engine & Reconciliation
// =========================================================================

export class SaaSPaymentEngine {
  /**
   * Simulates provider-independent payment processing (M-Pesa, Airtel, Tigo, Halo, Stripe, PayPal).

   */
  static processPayment(
    ctx: TenantContext,
    req: ProcessPaymentRequest,
    subscriptionId: string
  ): BillingPayment {
    const now = new Date().toISOString();
    const providerReference = req.providerReference || `TXN-${req.provider}-${randomUUID().substring(0, 8).toUpperCase()}`;

    return {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      invoiceId: req.invoiceId,
      subscriptionId,
      provider: req.provider,
      providerReference,
      amount: req.amount,
      currency: req.currency,
      status: "SUCCESS",
      idempotencyKey: req.idempotencyKey,
      payerPhoneOrEmail: req.payerPhoneOrEmail,
      reconciledAt: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Maps completed payment to General Ledger journal (Dr Cash/Bank, Cr Accounts Receivable).
   */
  static mapPaymentToFinanceJournal(
    ctx: TenantContext,
    payment: BillingPayment,
    accounts: {
      bankOrCashAccountId: string;
      receivableAccountId: string;
    },
    journalSequence = 1
  ) {
    const journalNumber = TransactionNumbering.formatNumber("JRN", "MAIN", journalSequence);
    return {

      journalNumber,
      entryDate: new Date().toISOString(),
      sourceType: "SUBSCRIPTION_PAYMENT",
      description: `SaaS Subscription Payment ${payment.providerReference}`,
      totalDebit: payment.amount,
      totalCredit: payment.amount,
      lines: [
        {
          accountId: accounts.bankOrCashAccountId,
          description: `Bank Deposit - Payment ${payment.providerReference} (${payment.provider})`,
          debit: payment.amount,
          credit: 0,
        },
        {
          accountId: accounts.receivableAccountId,
          description: `Clear AR - Payment ${payment.providerReference}`,
          debit: 0,
          credit: payment.amount,
        },
      ],
    };
  }
}

// =========================================================================
// 6. SaaS Revenue Analytics & Metrics Engine
// =========================================================================

export class RevenueAnalyticsEngine {
  /**
   * Calculates standard SaaS metrics: MRR, ARR, ARPU, Churn, LTV, Payment Success Rate.
   */
  static calculateSaaSKpis(
    activeSubscriptions: Subscription[],
    trialSubscriptions: Subscription[],
    cancelledSubscriptionsCount: number,
    payments: BillingPayment[],
    pluginRevenueMonthly = 0,
    usageRevenueMonthly = 0
  ): SaaSKpiMetrics {
    // 1. Calculate MRR
    let mrr = 0;
    for (const sub of activeSubscriptions) {
      if (sub.status === "ACTIVE" || sub.status === "GRACE_PERIOD" || sub.status === "PAST_DUE") {
        const price = sub.currentPeriodPrice || sub.basePrice;
        if (sub.billingInterval === "ANNUAL") {
          mrr += Math.round(price / 12);
        } else if (sub.billingInterval === "QUARTERLY") {
          mrr += Math.round(price / 3);
        } else {
          mrr += price;
        }
      }
    }

    const arr = mrr * 12;
    const activeSubscribers = activeSubscriptions.length;
    const trialTenants = trialSubscriptions.length;
    const totalTenants = activeSubscribers + trialTenants;

    const arpu = activeSubscribers > 0 ? Math.round(mrr / activeSubscribers) : 0;

    // Gross Churn Rate
    const totalBase = activeSubscribers + cancelledSubscriptionsCount;
    const grossChurnRatePct = totalBase > 0 ? Number(((cancelledSubscriptionsCount / totalBase) * 100).toFixed(2)) : 0;

    // Trial Conversion Rate
    const totalTrialsHistorical = trialTenants + activeSubscribers;
    const trialConversionRatePct =
      totalTrialsHistorical > 0 ? Number(((activeSubscribers / totalTrialsHistorical) * 100).toFixed(2)) : 0;

    // Payment Success Rate
    const totalPayments = payments.length;
    const successfulPayments = payments.filter((p) => p.status === "SUCCESS").length;
    const paymentSuccessRatePct =
      totalPayments > 0 ? Number(((successfulPayments / totalPayments) * 100).toFixed(2)) : 100;

    const beginningRecurringRevenue = Math.max(0, mrr);
    const retainedBase = Math.max(0, beginningRecurringRevenue - cancelledSubscriptionsCount);
    const netRevenueRetentionPct = beginningRecurringRevenue > 0
      ? Number(((retainedBase / beginningRecurringRevenue) * 100).toFixed(2))
      : 0;

    return {
      mrr,
      arr,
      arpu,
      totalTenants,
      activeSubscribers,
      trialTenants,
      trialConversionRatePct,
      grossChurnRatePct,
      netRevenueRetentionPct,
      paymentSuccessRatePct,
      pluginRevenueMonthly,
      usageRevenueMonthly,
    };
  }
}

// =========================================================================
// 7. Monetization Invariants (M001 - M015)
// =========================================================================

export function assertSubscriptionTenantValidity(sub: Subscription, tenantId: string): void {
  if (sub.tenantId !== tenantId) {
    throw new Error(`INVARIANT M001 VIOLATION: Subscription tenantId ${sub.tenantId} mismatch ${tenantId}`);
  }
}

export function assertSubscriptionPlanVersionValidity(sub: Subscription, plan: Plan): void {
  if (sub.planId !== plan.id || sub.planVersion < 1) {
    throw new Error(`INVARIANT M002 VIOLATION: Invalid plan or plan version on subscription ${sub.id}`);
  }
}

export function assertInvoiceTenantIsolation(invoice: BillingInvoice, tenantId: string): void {
  if (invoice.tenantId !== tenantId) {
    throw new Error(`INVARIANT M003 VIOLATION: Invoice tenant ${invoice.tenantId} cross-tenant breach for ${tenantId}`);
  }
}

export function assertInvoiceReproducibility(invoice: BillingInvoice, expectedGrandTotal: number): void {
  if (Math.abs(invoice.grandTotal - expectedGrandTotal) > 0.01) {
    throw new Error(`INVARIANT M004 VIOLATION: Finalized invoice total ${invoice.grandTotal} != expected ${expectedGrandTotal}`);
  }
}

export function assertInvoiceLineItemTotalEquality(invoice: BillingInvoice): void {
  const sum = invoice.lines.reduce((acc, l) => acc + l.total, 0) + invoice.taxTotal;
  if (Math.abs(sum - invoice.grandTotal) > 0.01) {
    throw new Error(`INVARIANT M005 VIOLATION: Invoice total ${invoice.grandTotal} does not match sum of lines ${sum}`);
  }
}

export function assertPaymentIdempotency(existingPayments: BillingPayment[], idempotencyKey: string): void {
  const duplicate = existingPayments.find((p) => p.idempotencyKey === idempotencyKey);
  if (duplicate) {
    throw new Error(`INVARIANT M006 VIOLATION: Duplicate payment idempotencyKey detected: ${idempotencyKey}`);
  }
}

export function assertPaymentAllocationLimit(paymentAmount: number, invoiceBalance: number): void {
  if (paymentAmount > invoiceBalance) {
    throw new Error(`INVARIANT M007 VIOLATION: Payment amount ${paymentAmount} exceeds invoice balance ${invoiceBalance}`);
  }
}

export function assertSubscriptionStateTransition(current: SubscriptionStatus, target: SubscriptionStatus): void {
  if (!SubscriptionLifecycleEngine.validateStateTransition(current, target)) {
    throw new Error(`INVARIANT M008 VIOLATION: Illegal subscription transition from ${current} to ${target}`);
  }
}

export function assertEntitlementMatchesSubscription(sub: Subscription, result: EntitlementCheckResponse): void {
  if ((sub.status === "CANCELLED" || sub.status === "EXPIRED") && result.allowed) {
    throw new Error(`INVARIANT M009 VIOLATION: Entitlement granted on inactive/cancelled subscription`);
  }
}

export function assertUsageTenantBoundary(event: MeterEvent, tenantId: string): void {
  if (event.tenantId !== tenantId) {
    throw new Error(`INVARIANT M010 VIOLATION: Usage event tenant ${event.tenantId} breaches boundary for ${tenantId}`);
  }
}

export function assertHistoricalInvoicePriceImmutability(originalGrandTotal: number, currentGrandTotal: number): void {
  if (originalGrandTotal !== currentGrandTotal) {
    throw new Error(`INVARIANT M011 VIOLATION: Historical finalized invoice price was altered!`);
  }
}

export function assertFinancialBillingEventTraceability(journal: { sourceType: string; description: string }): void {
  if (!journal.sourceType || !journal.description) {
    throw new Error(`INVARIANT M012 VIOLATION: Financial billing event missing traceable source`);
  }
}

export function assertRefundAuditEvidence(refund: { id: string; reason: string; approvedBy: string }): void {
  if (!refund.reason || !refund.approvedBy) {
    throw new Error(`INVARIANT M013 VIOLATION: Refund missing required authorization and reason audit trail`);
  }
}

export function assertDuplicateWebhookSingleEffect(eventsProcessed: number, expectedEvents: number): void {
  if (eventsProcessed !== expectedEvents) {
    throw new Error(`INVARIANT M014 VIOLATION: Duplicate webhook resulted in duplicate execution count: ${eventsProcessed}`);
  }
}

export function assertDataPreservationOnCancellation(beforeEntityCount: number, afterEntityCount: number): void {
  if (beforeEntityCount !== afterEntityCount) {
    throw new Error(`INVARIANT M015 VIOLATION: Tenant business data was purged on subscription cancellation`);
  }
}