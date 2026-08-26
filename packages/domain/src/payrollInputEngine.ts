import type {
  PayrollInput,
  Timesheet,
  CommissionRecord,
  Employee,
  TenantContext,
} from "@kwakopos2/contracts";
import { assertPayrollInputApprovedOrigin } from "./workforceInvariants.js";
import { randomUUID } from "crypto";

export class PayrollInputEngine {
  /**
   * Generates a validated, approved-origin PayrollInput from an approved Timesheet, Employee compensation rates, and approved Commissions.
   */
  static generatePayrollInput(
    ctx: TenantContext,
    employee: Employee,
    timesheet: Timesheet,
    approvedCommissions: CommissionRecord[] = [],
    overtimeMultiplier = 1.5,
    bonuses = 0,
    allowances = 0,
    deductions = 0
  ): PayrollInput {
    assertPayrollInputApprovedOrigin(timesheet.status);

    const basicHours = Math.round((timesheet.totalRegularMinutes / 60) * 100) / 100;
    const overtimeHours = Math.round((timesheet.totalOvertimeMinutes / 60) * 100) / 100;

    let regularPay = 0;
    let overtimePay = 0;

    if (Number(employee.hourlyRate) > 0) {
      regularPay = Math.round(basicHours * Number(employee.hourlyRate) * 100) / 100;
      overtimePay = Math.round(overtimeHours * Number(employee.hourlyRate) * overtimeMultiplier * 100) / 100;
    } else {

      // Monthly salaried employee
      regularPay = Number(employee.baseSalary) || 0;
      const hourlyEquivalent = regularPay / 160; // 160 standard working hours in a month
      overtimePay = Math.round(overtimeHours * hourlyEquivalent * overtimeMultiplier * 100) / 100;
    }

    const commissionsTotal = approvedCommissions
      .filter((c) => c.status === "APPROVED" || c.status === "PAID")
      .reduce((sum, c) => sum + Number(c.commissionAmount), 0);

    const grossPay = Math.round(
      (regularPay + overtimePay + commissionsTotal + bonuses + allowances - deductions) * 100
    ) / 100;

    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: employee.id,
      periodStart: timesheet.periodStart,
      periodEnd: timesheet.periodEnd,
      basicHours,
      overtimeHours,
      regularPay,
      overtimePay,
      commissionsTotal,
      bonusesTotal: bonuses,
      allowancesTotal: allowances,
      deductionsTotal: deductions,
      grossPay,
      status: "CALCULATED",
      approvedById: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Approves a PayrollInput record.
   */
  static approvePayrollInput(
    payrollInput: PayrollInput,
    approverUserId: string
  ): PayrollInput {
    const now = new Date().toISOString();
    return {
      ...payrollInput,
      status: "APPROVED",
      approvedById: approverUserId,
      approvedAt: now,
      updatedAt: now,
    };
  }
}
