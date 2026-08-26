import type {
  LeaveRequest,
  LeaveType,
  CreateLeaveRequest,
  TenantContext,
} from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export class LeaveEngine {
  /**
   * Calculates remaining leave balance for an employee.
   */
  static calculateRemainingBalance(
    leaveType: LeaveType,
    approvedRequests: LeaveRequest[]
  ): { totalAllowance: number; usedDays: number; remainingDays: number } {
    const usedDays = approvedRequests
      .filter((r) => r.leaveTypeId === leaveType.id && r.status === "APPROVED")
      .reduce((sum, r) => sum + Number(r.totalDays), 0);

    const remainingDays = Math.max(0, leaveType.defaultAllowanceDays - usedDays);
    return {
      totalAllowance: leaveType.defaultAllowanceDays,
      usedDays,
      remainingDays,
    };
  }

  /**
   * Creates a LeaveRequest entity in PENDING state.
   */
  static createLeaveRequest(
    ctx: TenantContext,
    req: CreateLeaveRequest
  ): LeaveRequest {
    const startMs = new Date(req.startDate).getTime();
    const endMs = new Date(req.endDate).getTime();
    if (endMs < startMs) {
      throw new Error("Leave end date cannot be earlier than start date.");
    }

    const now = new Date().toISOString();
    return {
      id: req.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      leaveTypeId: req.leaveTypeId,
      startDate: new Date(req.startDate).toISOString(),
      endDate: new Date(req.endDate).toISOString(),
      totalDays: req.totalDays,
      partialDay: req.partialDay || "FULL",
      reason: req.reason || null,
      status: "PENDING",
      documentUrl: req.documentUrl || null,
      approvedById: null,
      approvedAt: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Approves or rejects a LeaveRequest.
   */
  static processLeaveApproval(
    leaveRequest: LeaveRequest,
    approved: boolean,
    approverUserId: string,
    rejectionReason?: string
  ): LeaveRequest {
    const now = new Date().toISOString();
    if (approved) {
      return {
        ...leaveRequest,
        status: "APPROVED",
        approvedById: approverUserId,
        approvedAt: now,
        rejectionReason: null,
        updatedAt: now,
      };
    } else {
      return {
        ...leaveRequest,
        status: "REJECTED",
        approvedById: approverUserId,
        approvedAt: now,
        rejectionReason: rejectionReason || "Rejected by supervisor",
        updatedAt: now,
      };
    }
  }
}
