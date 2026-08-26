import type { Sale, CashSession, Payment, TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export interface AnomalyReport {
  id: string;
  tenantId: string;
  branchId: string;
  anomalyType:
    | "UNUSUAL_DISCOUNT"
    | "CASH_VARIANCE_SPIKE"
    | "DUPLICATE_PAYMENT"
    | "NEGATIVE_MARGIN"
    | "EXPENSE_SPIKE";
  severity: "INFO" | "WARNING" | "CRITICAL";
  description: string;
  entityType: string;
  entityId: string;
  detectedAt: string;
}

export class AnomalyDetectionEngine {
  /**
   * Evaluates a POS Sale for unusual discount percentage or negative gross profit margin.
   */
  static evaluateSale(ctx: TenantContext, sale: Sale): AnomalyReport[] {
    const anomalies: AnomalyReport[] = [];
    const grandTotal = Number(sale.grandTotal);
    const discountTotal = Number(sale.discountTotal) || 0;
    const subtotal = Number(sale.subtotal) || grandTotal;
    const grossProfit = Number(sale.grossProfit);

    // Check 1: Unusual Discount (> 25% of subtotal)
    if (subtotal > 0 && discountTotal / subtotal > 0.25) {
      anomalies.push({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        anomalyType: "UNUSUAL_DISCOUNT",
        severity: "WARNING",
        description: `Unusual discount of ${discountTotal} TZS (${Math.round((discountTotal / subtotal) * 100)}%) granted on Sale ${sale.saleNumber}.`,
        entityType: "Sale",
        entityId: sale.id,
        detectedAt: new Date().toISOString(),
      });
    }

    // Check 2: Negative Gross Profit Margin (Selling below cost)
    if (grossProfit < 0) {
      anomalies.push({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        anomalyType: "NEGATIVE_MARGIN",
        severity: "CRITICAL",
        description: `Sale ${sale.saleNumber} has negative gross profit (${grossProfit} TZS). Items sold below unit cost.`,
        entityType: "Sale",
        entityId: sale.id,
        detectedAt: new Date().toISOString(),
      });
    }

    return anomalies;
  }

  /**
   * Evaluates a closed Cash Session for excessive drawer variance.
   */
  static evaluateCashSession(ctx: TenantContext, session: CashSession, thresholdAmount = 10000): AnomalyReport[] {
    const anomalies: AnomalyReport[] = [];
    const variance = Math.abs(Number(session.variance) || 0);

    if (variance >= thresholdAmount) {
      anomalies.push({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        anomalyType: "CASH_VARIANCE_SPIKE",
        severity: variance >= 50000 ? "CRITICAL" : "WARNING",
        description: `Cash session ${session.sessionNumber} closed with material drawer variance of ${session.variance} TZS (Threshold: ${thresholdAmount} TZS).`,
        entityType: "CashSession",
        entityId: session.id,
        detectedAt: new Date().toISOString(),
      });
    }

    return anomalies;
  }

  /**
   * Checks for potential duplicate payments.
   */
  static evaluateDuplicatePayment(
    ctx: TenantContext,
    newPayment: Payment,
    recentPayments: Payment[],
    timeWindowMs = 60000
  ): AnomalyReport | null {
    const newTime = new Date(newPayment.paidAt).getTime();
    const duplicate = recentPayments.find(
      (p) =>
        p.id !== newPayment.id &&
        p.customerId === newPayment.customerId &&
        Number(p.amount) === Number(newPayment.amount) &&
        p.paymentMethod === newPayment.paymentMethod &&
        Math.abs(newTime - new Date(p.paidAt).getTime()) <= timeWindowMs
    );

    if (duplicate) {
      return {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        anomalyType: "DUPLICATE_PAYMENT",
        severity: "WARNING",
        description: `Potential duplicate payment detected! Payment ${newPayment.paymentNumber} (${newPayment.amount} TZS) closely matches Payment ${duplicate.paymentNumber} within ${timeWindowMs / 1000}s.`,
        entityType: "Payment",
        entityId: newPayment.id,
        detectedAt: new Date().toISOString(),
      };
    }

    return null;
  }
}
