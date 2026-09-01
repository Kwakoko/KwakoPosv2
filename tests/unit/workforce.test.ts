import { describe, it, expect, beforeEach } from "vitest";
import { WorkforceEngine } from "@kwakopos2/domain";

describe("Phase 37 — Workforce Operating Layer (KWOL v1.0.0)", () => {
  let engine: WorkforceEngine;

  beforeEach(() => {
    engine = new WorkforceEngine();
  });

  it("should register employees, separate user identity, and manage status transition", () => {
    const reg = engine.registerEmployee({
      employeeId: "EMP-TEST-01", tenantId: "TEN-01", employeeCode: "EC100",
      firstName: "David", lastName: "Miller", employmentType: "FULL_TIME", status: "ACTIVE",
      positionTitle: "Pharmacy Dispenser", startDate: "2026-01-01", userId: "USR-ACCOUNT-88",
    });

    expect(reg.success).toBe(true);
    expect(reg.employee?.userId).toBe("USR-ACCOUNT-88");
    expect(reg.employee?.employeeId).toBe("EMP-TEST-01");

    const tr = engine.transitionEmployeeStatus("EMP-TEST-01", "ON_LEAVE", "Medical leave", "USR-HR");
    expect(tr.success).toBe(true);
    expect(tr.employee?.status).toBe("ON_LEAVE");
  });

  it("should manage shift creation, conflict detection, and attendance integrity", () => {
    engine.registerEmployee({
      employeeId: "EMP-TEST-02", tenantId: "TEN-01", employeeCode: "EC101",
      firstName: "Sarah", lastName: "Connor", employmentType: "FULL_TIME", status: "ACTIVE",
      positionTitle: "Cashier", startDate: "2026-01-01",
    });

    const shf = engine.createShift({
      shiftId: "SHF-TEST-01", tenantId: "TEN-01", branchId: "BR-01",
      employeeId: "EMP-TEST-02", roleTitle: "Cashier", startTime: "2026-09-01T08:00:00Z",
      endTime: "2026-09-01T16:00:00Z", status: "PUBLISHED", assignedBy: "USR-MGR",
    });

    expect(shf.success).toBe(true);

    const chkIn = engine.recordCheckIn({
      tenantId: "TEN-01", branchId: "BR-01", employeeId: "EMP-TEST-02",
      shiftId: "SHF-TEST-01", source: "APP_CHECKIN",
    });

    expect(chkIn.success).toBe(true);
    expect(chkIn.attendance?.status).toBe("CHECKED_IN");

    // Block duplicate check-in
    const dupChk = engine.recordCheckIn({
      tenantId: "TEN-01", branchId: "BR-01", employeeId: "EMP-TEST-02",
      source: "MANAGER_ENTRY",
    });
    expect(dupChk.success).toBe(false);

    const chkOut = engine.recordCheckOut({ attendanceId: chkIn.attendance!.attendanceId });
    expect(chkOut.success).toBe(true);
    expect(chkOut.attendance?.status).toBe("CHECKED_OUT");
  });

  it("should process timesheets, leave approvals, and generate payroll inputs", () => {
    engine.registerEmployee({
      employeeId: "EMP-TEST-03", tenantId: "TEN-01", employeeCode: "EC102",
      firstName: "Alex", lastName: "Mercer", employmentType: "FULL_TIME", status: "ACTIVE",
      positionTitle: "Lead Technician", startDate: "2026-01-01",
    });

    const ts = engine.submitTimesheet({
      tenantId: "TEN-01", employeeId: "EMP-TEST-03", periodStart: "2026-09-01",
      periodEnd: "2026-09-07", regularHours: 40, overtimeHours: 8,
    });
    expect(ts.success).toBe(true);

    const appTs = engine.approveTimesheet(ts.timesheet!.timesheetId, "USR-MGR");
    expect(appTs.success).toBe(true);

    const payInput = engine.generatePayrollInput("TEN-01", "EMP-TEST-03", "2026-09-01", "2026-09-07");
    expect(payInput.success).toBe(true);
    expect(payInput.payrollInput?.regularHours).toBe(40);
    expect(payInput.payrollInput?.overtimeHours).toBe(8);
  });

  it("should enforce AI Governance, expense finance bridge, and health summary", () => {
    engine.registerEmployee({
      employeeId: "EMP-TEST-04", tenantId: "TEN-01", employeeCode: "EC103",
      firstName: "Bob", lastName: "Builder", employmentType: "FULL_TIME", status: "ACTIVE",
      positionTitle: "Engineer", startDate: "2026-01-01",
    });

    const exp = engine.submitExpense({
      expenseId: "EXP-TEST-01", tenantId: "TEN-01", employeeId: "EMP-TEST-04",
      category: "Travel", amount: 150000, currency: "TZS", description: "Site inspection",
    });
    expect(exp.success).toBe(true);

    const appExp = engine.approveExpense("EXP-TEST-01", "APR-EXP-88", "USR-FINANCE");
    expect(appExp.success).toBe(true);
    expect(appExp.expense?.postedToFinance).toBe(true);

    const govTerm = engine.validateAIGovernance("TERMINATION");
    expect(govTerm.isAutonomousAllowed).toBe(false);
    expect(govTerm.requiresHumanReview).toBe(true);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.activeEmployees).toBeGreaterThanOrEqual(1);
  });
});
