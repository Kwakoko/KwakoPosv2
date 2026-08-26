import { describe, it, expect, beforeEach } from "vitest";
import { AttendanceEngine } from "@kwakopos2/domain";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Attendance & Timesheets Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["BRANCH_MANAGER"],
    permissions: ["WORKFORCE_VIEW", "ATTENDANCE_RECORD", "ATTENDANCE_APPROVE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("handles clock-in with PIN authentication and marks LATE if past schedule start", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Michael",
      lastName: "Kato",
      pinCode: "5566",
    });

    const schedule = repo.createSchedule(ctx, {
      employeeId: employee.id,
      date: "2026-08-26",
      startTime: "08:00",
      endTime: "17:00",
    });

    // Clock in at 08:30 (30 mins late)
    const record = repo.clockIn(ctx, {
      employeeId: employee.id,
      scheduleId: schedule.id,
      clockInTime: "2026-08-26T08:30:00.000Z",
      method: "PIN",
      pinCode: "5566",
      idempotencyKey: "clock-in-michael-01",
    });

    expect(record.status).toBe("LATE");
    expect(record.pinVerified).toBe(true);
  });

  it("handles clock-out, calculates 8 regular hours + 1 overtime hour after 60 mins break deduction", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Grace",
      lastName: "Temba",
    });

    const clockInRecord = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clock-in-grace-01",
    });

    // Total 10 hours elapsed (08:00 to 18:00) with 60 mins break -> 9 net worked hours -> 8 regular + 1 overtime
    const clockOutRecord = repo.clockOut(ctx, clockInRecord.id, {
      clockOutTime: "2026-08-26T18:00:00.000Z",
      breakMinutes: 60,
    });

    expect(clockOutRecord.regularMinutes).toBe(480); // 8 hours
    expect(clockOutRecord.overtimeMinutes).toBe(60); // 1 hour
    expect(clockOutRecord.status).toBe("OVERTIME");
  });

  it("generates a Timesheet and allows supervisor approval", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "David",
      lastName: "Lyimo",
    });

    const clockIn = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clock-in-david-01",
    });

    repo.clockOut(ctx, clockIn.id, {
      clockOutTime: "2026-08-26T17:00:00.000Z",
      breakMinutes: 60,
    });

    const timesheet = repo.generateTimesheet(ctx, {
      employeeId: employee.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(timesheet.totalRegularMinutes).toBe(480);
    expect(timesheet.status).toBe("DRAFT");

    const approved = repo.approveTimesheet(ctx, timesheet.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(ctx.userId);
  });

  it("detects missing clock-out anomaly when employee is still clocked in past max shift duration", () => {
    const { employee } = repo.createEmployee(ctx, {
      firstName: "Peter",
      lastName: "Massawe",
    });

    const record = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(), // 16 hours ago
      idempotencyKey: "clock-in-peter-old",
    });

    const anomalies = AttendanceEngine.detectAnomalies([record], 12);
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].anomalyType).toBe("MISSING_CLOCK_OUT");
  });
});
