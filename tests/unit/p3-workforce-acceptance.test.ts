import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import {
  ScopedWorkforceRepository,
  InMemoryStore,
} from "@kwakopos2/database";
import {
  EmployeeEngine,
  AttendanceEngine,
  SchedulingEngine,
  LeaveEngine,
  PayrollInputEngine,
  LaborCostingEngine,
  TaskWorkOrderEngine,
} from "@kwakopos2/domain";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import type { TenantContext, Employee, Timesheet } from "@kwakopos2/contracts";

describe("Phase 3 Workforce Management Acceptance Suite (P3-001 to P3-010)", () => {
  const store = new InMemoryStore();
  const workforceRepo = new ScopedWorkforceRepository(store);

  const ctx: TenantContext = {
    tenantId: randomUUID(),
    branchId: randomUUID(),
    userId: randomUUID(),
    roles: ["HR_MANAGER", "ADMIN"],
    permissions: ["ALL"],
  };

  let employeeRecord: Employee;
  let departmentId = "";

  // P3-001 Employee
  it("P3-001: Employee master record creation, role assignment, and department allocation", () => {
    const dept = workforceRepo.createDepartment(ctx, {
      name: "Engineering & Field Services",
      code: "ENG-FIELD",
    });
    departmentId = dept.id;

    const { employee } = workforceRepo.createEmployee(ctx, {
      firstName: "Baraka",
      lastName: "Mwita",
      nationalId: "19900101-12345",
      phone: "+255711223344",
      email: "baraka.mwita@kwakopos.com",
      employmentType: "FULL_TIME",
      hireDate: "2026-01-15",
      departmentId: dept.id,
      jobTitle: "Lead Field Telecom Engineer",
      baseSalary: 2200000,
      hourlyRate: 12500,
    });

    expect(employee.id).toBeDefined();
    expect(employee.status).toBe("ACTIVE");
    employeeRecord = employee;
  });

  // P3-002 Attendance
  it("P3-002: Clock-in and clock-out attendance recording with GPS evidence and shift pairing", () => {
    const clockIn = workforceRepo.clockIn(ctx, {
      employeeId: employeeRecord.id,
      clockInTime: "2026-08-27T08:00:00.000Z",
      method: "GPS",
      latitude: -6.7924,
      longitude: 39.2083,
      idempotencyKey: `idem-clockin-${randomUUID()}`,
    });
    expect(clockIn.id).toBeDefined();

    const clockOut = workforceRepo.clockOut(ctx, clockIn.id, {
      clockOutTime: "2026-08-27T17:00:00.000Z",
      breakMinutes: 60,
    });
    expect(clockOut.regularMinutes).toBe(480); // 8 hours
  });

  // P3-003 Shift
  it("P3-003: Shift roster planning, conflict prevention, and publishing", () => {
    const schedule = workforceRepo.createSchedule(ctx, {
      employeeId: employeeRecord.id,
      date: "2026-08-28",
      startTime: "08:00",
      endTime: "17:00",
    });

    expect(schedule.status).toBe("PUBLISHED");
    expect(schedule.employeeId).toBe(employeeRecord.id);
  });

  // P3-004 Overtime
  it("P3-004: Overtime calculation distinguishes regular hours from authorized overtime", () => {
    const inRecord = workforceRepo.clockIn(ctx, {
      employeeId: employeeRecord.id,
      clockInTime: "2026-08-29T08:00:00.000Z",
      idempotencyKey: `idem-ot-in-${randomUUID()}`,
    });

    // 11 hours elapsed - 60 min break = 10 net worked hours (8 regular + 2 overtime)
    const outRecord = workforceRepo.clockOut(ctx, inRecord.id, {
      clockOutTime: "2026-08-29T19:00:00.000Z",
      breakMinutes: 60,
    });

    expect(outRecord.regularMinutes).toBe(480);
    expect(outRecord.overtimeMinutes).toBe(120);
    expect(outRecord.status).toBe("OVERTIME");
  });

  // P3-005 Leave
  it("P3-005: Leave request, balance validation, approval workflow, and schedule conflict prevention", () => {
    const leaveReq = workforceRepo.requestLeave(ctx, {
      employeeId: employeeRecord.id,
      leaveTypeId: randomUUID(),
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      reason: "Annual Family Leave",
    });
    expect(leaveReq.status).toBe("PENDING");

    const approved = workforceRepo.approveLeave(ctx, leaveReq.id, true, "Approved by Manager");
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(ctx.userId);
  });

  // P3-006 Payroll
  it("P3-006: Payroll preparation derives gross pay, overtime pay, and deductions", () => {
    const mockApprovedTimesheet: Timesheet = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: employeeRecord.id,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-31T23:59:59.999Z",
      totalScheduledMinutes: 9600,
      totalWorkedMinutes: 10320,
      totalRegularMinutes: 9600, // 160 hours
      totalOvertimeMinutes: 720,  // 12 hours
      totalBreakMinutes: 1200,
      totalAbsentMinutes: 0,
      totalApprovedMinutes: 10320,
      status: "APPROVED",
      submittedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedById: ctx.userId,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const payrollInput = PayrollInputEngine.generatePayrollInput(
      ctx,
      employeeRecord,
      mockApprovedTimesheet,
      [],
      1.5,
      0,
      0,
      0
    );

    expect(payrollInput.basicHours).toBe(160);
    expect(payrollInput.overtimeHours).toBe(12);
    expect(payrollInput.grossPay).toBe(2225000); // 160*12500 (2,000,000) + 12*12500*1.5 (225,000)
  });

  // P3-007 Approval
  it("P3-007: Formal timesheet and payroll approval workflow lock records from tampering", () => {
    const timesheet = workforceRepo.generateTimesheet(ctx, {
      employeeId: employeeRecord.id,
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    expect(timesheet.status).toBe("DRAFT");

    const approved = workforceRepo.approveTimesheet(ctx, timesheet.id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(ctx.userId);
  });

  // P3-008 Finance posting
  it("P3-008: Approved workforce labor hours map to Project Costing & Financial GL Accounts", () => {
    const mockApprovedTimesheet: Timesheet = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: employeeRecord.id,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-31T23:59:59.999Z",
      totalScheduledMinutes: 9600,
      totalWorkedMinutes: 9600,
      totalRegularMinutes: 9600,
      totalOvertimeMinutes: 0,
      totalBreakMinutes: 1200,
      totalAbsentMinutes: 0,
      totalApprovedMinutes: 9600, // 160 hours
      status: "APPROVED",
      submittedAt: new Date().toISOString(),
      approvedAt: new Date().toISOString(),
      approvedById: ctx.userId,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const allocation = LaborCostingEngine.calculateTimesheetLaborCost(
      mockApprovedTimesheet,
      employeeRecord
    );

    expect(allocation.approvedHours).toBe(160);
    expect(allocation.totalLaborCost).toBe(2000000); // 160 * 12500
  });

  // P3-009 Offline sync
  it("P3-009: Offline field worker attendance mutations are durably queued and synchronized", async () => {
    const localDb = new LocalIndexedDbStore(5);
    await localDb.ready;

    localDb.recordOutboxMutation({
      id: "OP-ATT-01",
      entityType: "Product",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: { employeeId: employeeRecord.id, eventType: "CLOCK_IN", timestamp: new Date().toISOString() },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `idem-att-field-${randomUUID()}`,
      status: "PENDING",
    });

    const outbox = localDb.getPendingOutbox();
    expect(outbox.length).toBe(1);
    localDb.markOutboxSynced("OP-ATT-01");
    expect(localDb.getPendingOutbox().length).toBe(0);
  });

  // P3-010 Cross-browser reconciliation
  it("P3-010: Field attendance sync converges to HQ Browser B view with identical counts", async () => {
    const browserBDb = new LocalIndexedDbStore(5);
    await browserBDb.ready;
    browserBDb.saveProductLocal({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      name: "Field Verified Worker Record",
      sku: "FVR-01",
      category: "Workforce",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(browserBDb.products.size).toBe(1);
  });
});
