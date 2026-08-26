import { describe, it, expect, beforeEach } from "vitest";
import { LeaveEngine } from "@kwakopos2/domain";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Workforce Leave Management Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["MANAGER"],
    permissions: ["LEAVE_VIEW", "LEAVE_REQUEST", "LEAVE_APPROVE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("calculates remaining leave balance and handles approval workflow", () => {
    const annualLeave = repo.createLeaveType(ctx, {
      name: "Annual Leave",
      code: "ANNUAL",
      defaultAllowanceDays: 28,
    });

    const leaveRequest = repo.requestLeave(ctx, {
      employeeId: "emp-101",
      leaveTypeId: annualLeave.id,
      startDate: "2026-09-01",
      endDate: "2026-09-07",
      totalDays: 5,
      reason: "Family vacation",
    });

    expect(leaveRequest.status).toBe("PENDING");

    // Approve the leave
    const approved = repo.approveLeave(ctx, leaveRequest.id, true);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(ctx.userId);

    // Calculate balance
    const balance = LeaveEngine.calculateRemainingBalance(annualLeave, [approved]);
    expect(balance.totalAllowance).toBe(28);
    expect(balance.usedDays).toBe(5);
    expect(balance.remainingDays).toBe(23);
  });
});
