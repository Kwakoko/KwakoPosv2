import type {
  CommissionRecord,
  CreateCommissionRecordRequest,
  TenantContext,
} from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export class CommissionEngine {
  /**
   * Calculates sales commission for an employee.
   */
  static calculateCommission(
    salesAmount: number,
    commissionRatePct: number
  ): number {
    return Math.round((salesAmount * (commissionRatePct / 100)) * 100) / 100;
  }

  /**
   * Creates a CommissionRecord from sales or service volume.
   */
  static createCommissionRecord(
    ctx: TenantContext,
    req: CreateCommissionRecordRequest
  ): CommissionRecord {
    const commissionAmount = this.calculateCommission(req.salesAmount, req.commissionRate);
    const now = new Date().toISOString();

    return {
      id: req.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      saleId: req.saleId || null,
      workOrderId: req.workOrderId || null,
      period: req.period,
      salesAmount: req.salesAmount,
      commissionRate: req.commissionRate,
      commissionAmount,
      status: "PENDING",
      approvedById: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Approves a commission record for payroll input inclusion.
   */
  static approveCommission(
    record: CommissionRecord,
    approverUserId: string
  ): CommissionRecord {
    const now = new Date().toISOString();
    return {
      ...record,
      status: "APPROVED",
      approvedById: approverUserId,
      approvedAt: now,
      updatedAt: now,
    };
  }
}
