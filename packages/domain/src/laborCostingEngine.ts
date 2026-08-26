import type {
  Timesheet,
  Employee,
  TenantContext,
  JournalEntry,
  JournalLine,
} from "@kwakopos2/contracts";
import { assertLaborCostReconciliation } from "./workforceInvariants.js";
import { randomUUID } from "crypto";

export interface LaborCostAllocation {
  employeeId: string;
  departmentId?: string | null;
  branchId: string;
  approvedHours: number;
  laborRate: number;
  totalLaborCost: number;
}

export class LaborCostingEngine {
  /**
   * Calculates labor cost for a timesheet.
   */
  static calculateTimesheetLaborCost(
    timesheet: Timesheet,
    employee: Employee
  ): LaborCostAllocation {
    const approvedHours = Math.round((timesheet.totalApprovedMinutes / 60) * 100) / 100;
    const rate = Number(employee.hourlyRate) || (Number(employee.baseSalary) ? Number(employee.baseSalary) / 160 : 0);
    const totalLaborCost = Math.round(approvedHours * rate * 100) / 100;

    assertLaborCostReconciliation(approvedHours, rate, totalLaborCost);

    return {
      employeeId: employee.id,
      departmentId: employee.departmentId,
      branchId: timesheet.branchId,
      approvedHours,
      laborRate: rate,
      totalLaborCost,
    };
  }

  /**
   * Generates double-entry GL Journal lines for labor expense:
   * Debit: 6200 (Salaries & Wages Expense)
   * Credit: 2120 (Accrued Payroll Payable)
   */
  static mapLaborCostToJournal(
    ctx: TenantContext,
    allocation: LaborCostAllocation,
    salariesExpenseAccountId: string,
    payrollPayableAccountId: string,
    journalNumber: string
  ): { journal: JournalEntry; lines: JournalLine[] } {
    const journalId = randomUUID();
    const now = new Date().toISOString();
    const cost = allocation.totalLaborCost;

    const lines: JournalLine[] = [
      {
        id: randomUUID(),
        journalEntryId: journalId,
        accountId: salariesExpenseAccountId,
        costCenterId: null,
        description: `Labor Cost Allocation - Emp ${allocation.employeeId} (${allocation.approvedHours} hrs)`,
        debit: cost,
        credit: 0,
        currency: "TZS",
        exchangeRate: 1,
      },
      {
        id: randomUUID(),
        journalEntryId: journalId,
        accountId: payrollPayableAccountId,
        costCenterId: null,
        description: `Accrued Payroll Liability - Emp ${allocation.employeeId}`,
        debit: 0,
        credit: cost,
        currency: "TZS",
        exchangeRate: 1,
      },
    ];

    const journal: JournalEntry = {
      id: journalId,
      tenantId: ctx.tenantId,
      branchId: allocation.branchId,
      accountingPeriodId: null,
      journalNumber,
      entryDate: now,
      postingDate: now,
      sourceType: "EXPENSE",
      sourceId: allocation.employeeId,
      description: `Labor Cost Accrual for Employee ${allocation.employeeId}`,
      currency: "TZS",
      exchangeRate: 1,
      totalDebit: cost,
      totalCredit: cost,
      status: "POSTED",
      isReversal: false,
      reversalOfJournalId: null,
      reversalReason: null,
      createdById: ctx.userId,
      postedById: ctx.userId,
      postedAt: now,
      idempotencyKey: `labor-cost-${journalId}`,
      createdAt: now,
      updatedAt: now,
    };

    return { journal, lines };
  }
}
