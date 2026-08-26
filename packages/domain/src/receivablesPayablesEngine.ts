import type {
  CustomerInvoice,
  SupplierInvoice,
  PaymentAllocation,
  AgingBucket,
  AgingReportItem,
  AgingReport,
  TenantContext,
} from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export class ReceivablesPayablesEngine {
  /**
   * Calculates the aging bucket classification for an outstanding invoice.
   */
  static calculateDaysOverdue(dueDate: string | Date, asOfDate: string | Date = new Date()): number {
    const due = new Date(dueDate).getTime();
    const asOf = new Date(asOfDate).getTime();
    const diffMs = asOf - due;
    if (diffMs <= 0) return 0; // Not overdue yet
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Aggregates invoices into Standard Aging Buckets:
   * Current (not due), 1-30 days, 31-60 days, 61-90 days, 90+ days.
   */
  static categorizeAgingBuckets(
    invoices: { dueDate: string | Date; balanceDue: number }[],
    asOfDate: string | Date = new Date()
  ): AgingBucket {
    const bucket: AgingBucket = {
      current: 0,
      days1To30: 0,
      days31To60: 0,
      days61To90: 0,
      days90Plus: 0,
      total: 0,
    };

    for (const inv of invoices) {
      const balance = Math.max(0, Number(inv.balanceDue));
      if (balance <= 0) continue;

      const days = this.calculateDaysOverdue(inv.dueDate, asOfDate);
      if (days === 0) {
        bucket.current += balance;
      } else if (days <= 30) {
        bucket.days1To30 += balance;
      } else if (days <= 60) {
        bucket.days31To60 += balance;
      } else if (days <= 90) {
        bucket.days61To90 += balance;
      } else {
        bucket.days90Plus += balance;
      }
      bucket.total += balance;
    }

    bucket.current = Math.round(bucket.current * 100) / 100;
    bucket.days1To30 = Math.round(bucket.days1To30 * 100) / 100;
    bucket.days31To60 = Math.round(bucket.days31To60 * 100) / 100;
    bucket.days61To90 = Math.round(bucket.days61To90 * 100) / 100;
    bucket.days90Plus = Math.round(bucket.days90Plus * 100) / 100;
    bucket.total = Math.round(bucket.total * 100) / 100;

    return bucket;
  }

  /**
   * Generates a complete AR Aging Report grouped by customer.
   */
  static generateReceivablesAgingReport(
    ctx: TenantContext,
    customers: { id: string; name: string; customerCode: string }[],
    invoices: CustomerInvoice[],
    asOfDate: string | Date = new Date()
  ): AgingReport {
    const asOfStr = typeof asOfDate === "string" ? asOfDate : asOfDate.toISOString();
    const items: AgingReportItem[] = [];

    for (const customer of customers) {
      const customerInvoices = invoices.filter(
        (inv) => inv.customerId === customer.id && inv.status !== "PAID" && inv.status !== "CANCELLED"
      );
      const buckets = this.categorizeAgingBuckets(customerInvoices, asOfDate);
      if (buckets.total > 0) {
        items.push({
          entityId: customer.id,
          entityName: customer.name,
          entityCode: customer.customerCode,
          buckets,
        });
      }
    }

    const summary = this.categorizeAgingBuckets(
      invoices.filter((i) => i.status !== "PAID" && i.status !== "CANCELLED"),
      asOfDate
    );

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      reportType: "ACCOUNTS_RECEIVABLE",
      asOfDate: asOfStr,
      totalOutstanding: summary.total,
      summary,
      items,
    };
  }

  /**
   * Generates a complete AP Aging Report grouped by supplier.
   */
  static generatePayablesAgingReport(
    ctx: TenantContext,
    suppliers: { id: string; name: string; supplierCode: string }[],
    invoices: SupplierInvoice[],
    asOfDate: string | Date = new Date()
  ): AgingReport {
    const asOfStr = typeof asOfDate === "string" ? asOfDate : asOfDate.toISOString();
    const items: AgingReportItem[] = [];

    for (const supplier of suppliers) {
      const supplierInvoices = invoices.filter(
        (inv) => inv.supplierId === supplier.id && inv.status !== "PAID" && inv.status !== "REJECTED"
      );
      const buckets = this.categorizeAgingBuckets(supplierInvoices, asOfDate);
      if (buckets.total > 0) {
        items.push({
          entityId: supplier.id,
          entityName: supplier.name,
          entityCode: supplier.supplierCode,
          buckets,
        });
      }
    }

    const summary = this.categorizeAgingBuckets(
      invoices.filter((i) => i.status !== "PAID" && i.status !== "REJECTED"),
      asOfDate
    );

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      reportType: "ACCOUNTS_PAYABLE",
      asOfDate: asOfStr,
      totalOutstanding: summary.total,
      summary,
      items,
    };
  }

  /**
   * Allocates a payment against an invoice and updates remaining balance.
   */
  static allocatePayment(
    ctx: TenantContext,
    input: {
      paymentId: string;
      invoice: CustomerInvoice | SupplierInvoice;
      amountToAllocate: number;
    }
  ): {
    updatedInvoice: CustomerInvoice | SupplierInvoice;
    allocation: PaymentAllocation;
    remainingUnallocated: number;
  } {
    const currentBalance = Number(input.invoice.balanceDue);
    const allocationAmount = Math.min(currentBalance, Number(input.amountToAllocate));
    const newAmountPaid = Number(input.invoice.amountPaid) + allocationAmount;
    const newBalanceDue = Math.max(0, currentBalance - allocationAmount);
    const remainingUnallocated = Number(input.amountToAllocate) - allocationAmount;

    let newStatus = input.invoice.status;
    if (newBalanceDue === 0) {
      newStatus = "PAID";
    } else if (newAmountPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    }

    const updatedInvoice = {
      ...input.invoice,
      amountPaid: Math.round(newAmountPaid * 100) / 100,
      balanceDue: Math.round(newBalanceDue * 100) / 100,
      status: newStatus as any,
      updatedAt: new Date().toISOString(),
    };

    const isCustomer = "customerId" in input.invoice;
    const allocation: PaymentAllocation = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      paymentId: input.paymentId,
      customerInvoiceId: isCustomer ? input.invoice.id : null,
      supplierInvoiceId: !isCustomer ? input.invoice.id : null,
      allocatedAmount: Math.round(allocationAmount * 100) / 100,
      allocatedAt: new Date().toISOString(),
      createdById: ctx.userId,
      createdAt: new Date().toISOString(),
    };

    return { updatedInvoice, allocation, remainingUnallocated };
  }
}
