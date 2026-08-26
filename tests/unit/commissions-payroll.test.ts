import { describe, it, expect, beforeEach } from "vitest";
import { LaborCostingEngine } from "@kwakopos2/domain";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Commissions, Payroll Inputs & Labor Costing", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["FINANCE_MANAGER"],
    permissions: ["PAYROLL_INPUT_VIEW", "PAYROLL_INPUT_APPROVE", "FINANCE_CREATE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("calculates sales commission and approves it for payroll input", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Amina",
      lastName: "Said",
      baseSalary: 800000,
    });

    const comm = repo.recordCommission(ctx, {
      employeeId: employee.id,
      period: "2026-08",
      salesAmount: 5000000,
      commissionRate: 3, // 3% of 5,000,000 = 150,000
    });

    expect(comm.commissionAmount).toBe(150000);
    expect(comm.status).toBe("PENDING");

    const approvedComm = repo.approveCommission(ctx, comm.id);
    expect(approvedComm.status).toBe("APPROVED");
  });

  it("generates a PayrollInput from an approved timesheet + approved commission", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Baraka",
      lastName: "Rashid",
      workType: "PART_TIME",
      hourlyRate: 10000,
    });


    // Approved commission
    const comm = repo.recordCommission(ctx, {
      employeeId: employee.id,
      period: "2026-08",
      salesAmount: 2000000,
      commissionRate: 5, // 100,000
    });
    repo.approveCommission(ctx, comm.id);

    // Clock in/out
    const clockIn = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clock-in-baraka",
    });
    repo.clockOut(ctx, clockIn.id, {
      clockOutTime: "2026-08-26T18:00:00.000Z", // 10 hours -> 8 regular + 2 overtime
      breakMinutes: 0,
    });

    const timesheet = repo.generateTimesheet(ctx, {
      employeeId: employee.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    repo.approveTimesheet(ctx, timesheet.id);

    // Generate PayrollInput
    const payrollInput = repo.generatePayrollInputFromTimesheet(ctx, employee.id, timesheet.id);

    // Basic: 8 hrs * 10,000 = 80,000
    // Overtime: 2 hrs * 10,000 * 1.5 = 30,000
    // Commission: 100,000
    // Gross Pay: 80,000 + 30,000 + 100,000 = 210,000
    expect(payrollInput.basicHours).toBe(8);
    expect(payrollInput.overtimeHours).toBe(2);
    expect(payrollInput.regularPay).toBe(80000);
    expect(payrollInput.overtimePay).toBe(30000);
    expect(payrollInput.commissionsTotal).toBe(100000);
    expect(payrollInput.grossPay).toBe(210000);

    const approvedPayroll = repo.approvePayrollInput(ctx, payrollInput.id);
    expect(approvedPayroll.status).toBe("APPROVED");
  });

  it("maps approved timesheet labor cost to double-entry general ledger journal", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Hassan",
      lastName: "Mwinyi",
      hourlyRate: 15000,
    });

    const clockIn = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clock-in-hassan",
    });
    repo.clockOut(ctx, clockIn.id, {
      clockOutTime: "2026-08-26T16:00:00.000Z", // 8 hours
      breakMinutes: 0,
    });

    const timesheet = repo.generateTimesheet(ctx, {
      employeeId: employee.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    repo.approveTimesheet(ctx, timesheet.id);

    const allocation = LaborCostingEngine.calculateTimesheetLaborCost(timesheet, employee);
    expect(allocation.approvedHours).toBe(8);
    expect(allocation.totalLaborCost).toBe(120000);

    const { journal, lines } = LaborCostingEngine.mapLaborCostToJournal(
      ctx,
      allocation,
      "acc-6200-salaries-expense",
      "acc-2120-payroll-payable",
      "JRN-2026-0099"
    );

    expect(journal.totalDebit).toBe(120000);
    expect(journal.totalCredit).toBe(120000);
    expect(lines.length).toBe(2);
    expect(lines[0].debit).toBe(120000);
    expect(lines[1].credit).toBe(120000);
  });
});
