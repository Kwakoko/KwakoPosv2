import { describe, it, expect, beforeEach } from "vitest";
import { ScopedWorkforceRepository, InMemoryStore } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

describe("Workforce Tasks & Work Orders Engine", () => {
  let store: InMemoryStore;
  let repo: ScopedWorkforceRepository;

  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["OPERATIONS_LEAD"],
    permissions: ["TASK_VIEW", "TASK_CREATE", "TASK_ASSIGN", "TASK_VERIFY", "WORK_ORDER_VIEW", "WORK_ORDER_CREATE"],
  };

  beforeEach(() => {
    store = new InMemoryStore();
    repo = new ScopedWorkforceRepository(store);
  });

  it("handles Task lifecycle from BACKLOG to ASSIGNED, COMPLETED, and VERIFIED", () => {
    const task = repo.createTask(ctx, {
      title: "Monthly Stock Count - Beverage Aisle",
      taskType: "STOCK_COUNT",
      priority: "HIGH",
      checklist: [{ item: "Count soda crates", done: false }],
    });

    expect(task.status).toBe("BACKLOG");

    // Assign to employee
    const assigned = repo.updateTask(ctx, task.id, {
      assignedEmployeeId: "emp-201",
      status: "ASSIGNED",
    });
    expect(assigned.status).toBe("ASSIGNED");

    // Complete task
    const completed = repo.updateTask(ctx, task.id, {
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.completedAt).toBeTruthy();

    // Verify task
    const verified = repo.updateTask(ctx, task.id, {
      status: "VERIFIED",
    });
    expect(verified.status).toBe("VERIFIED");
    expect(verified.verifiedById).toBe(ctx.userId);
  });

  it("creates a Work Order and accurately calculates labor cost and grand total", () => {
    const wo = repo.createWorkOrder(ctx, {
      title: "Engine Diagnostics & Brake Pad Replacement",
      priority: "URGENT",
      assignedEmployeeId: "emp-technician-1",
      laborHours: 4.5,
      laborRate: 25000,
      materialsCostTotal: 150000, // Brake pads + brake fluid
    });

    // 4.5 * 25,000 = 112,500 labor cost
    // Grand Total = 112,500 + 150,000 = 262,500
    expect(wo.laborCostTotal).toBe(112500);
    expect(wo.materialsCostTotal).toBe(150000);
    expect(wo.grandTotal).toBe(262500);
    expect(wo.workOrderNumber).toMatch(/^WO-/);
  });
});
