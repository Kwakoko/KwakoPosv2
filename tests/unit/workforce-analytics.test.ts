import { describe, it, expect, beforeEach } from "vitest";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Workforce Analytics & Dashboard Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["SUPER_ADMIN"],
    permissions: ["WORKFORCE_VIEW", "REPORT_VIEW"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("calculates real-time Workforce Dashboard KPIs and Health Status", () => {
    const { employee: emp1 } = repo.createEmployee(ctx, { firstName: "Dev1", lastName: "A" });
    const { employee: emp2 } = repo.createEmployee(ctx, { firstName: "Dev2", lastName: "B" });

    // emp1 clocked in on time
    repo.clockIn(ctx, {
      employeeId: emp1.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clk-emp1",
    });

    const summary = repo.getDashboardSummary(ctx);
    expect(summary.totalEmployees).toBe(2);
    expect(summary.activeEmployees).toBe(2);
    expect(summary.presentToday).toBe(1);
    expect(summary.absentToday).toBe(1);
    expect(summary.workforceHealth).toBe("RED"); // 1 out of 2 absent is 50% (> 25% threshold)
  });


  it("generates comprehensive analytics report for period", () => {
    const { employee } = repo.createEmployee(ctx, { firstName: "Leader", lastName: "X" });

    const clk = repo.clockIn(ctx, {
      employeeId: employee.id,
      clockInTime: "2026-08-26T08:00:00.000Z",
      idempotencyKey: "clk-leader",
    });
    repo.clockOut(ctx, clk.id, {
      clockOutTime: "2026-08-26T16:00:00.000Z",
      breakMinutes: 0,
    });

    const report = repo.getAnalyticsReport(ctx, "2026-08");
    expect(report.headcount).toBe(1);
    expect(report.totalHoursWorked).toBe(8);
    expect(report.averagePunctualityPct).toBe(100);
  });
});
