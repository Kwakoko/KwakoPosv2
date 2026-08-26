import { describe, it, expect, beforeEach } from "vitest";
import { SchedulingEngine } from "@kwakopos2/domain";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Workforce Scheduling & Roster Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["SCHEDULER"],
    permissions: ["SCHEDULE_VIEW", "SCHEDULE_CREATE", "SCHEDULE_PUBLISH"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("creates a ShiftTemplate and generates schedules across selected dates", () => {
    const template = repo.createShiftTemplate(ctx, {
      name: "Morning Cashier Shift",
      startTime: "07:00",
      endTime: "15:00",
      breakDurationMinutes: 45,
      workdays: [1, 2, 3, 4, 5], // Monday through Friday
    });

    expect(template.name).toBe("Morning Cashier Shift");

    // Aug 24, 2026 is Monday, Aug 25 is Tuesday, Aug 29 is Saturday
    const dates = [
      new Date("2026-08-24T00:00:00.000Z"),
      new Date("2026-08-25T00:00:00.000Z"),
      new Date("2026-08-29T00:00:00.000Z"), // Weekend
    ];

    const generated = SchedulingEngine.generateSchedulesFromTemplate(ctx, template, ["emp-1"], dates);
    expect(generated.length).toBe(2); // Monday & Tuesday only
  });

  it("rejects overlapping shift schedules for the same employee", () => {
    repo.createSchedule(ctx, {
      employeeId: "emp-1",
      date: "2026-08-26",
      startTime: "08:00",
      endTime: "16:00",
    });

    expect(() =>
      repo.createSchedule(ctx, {
        employeeId: "emp-1",
        date: "2026-08-26",
        startTime: "12:00",
        endTime: "20:00",
      })
    ).toThrow(/Schedule conflict detected/);
  });
});
