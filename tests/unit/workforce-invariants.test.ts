import { describe, it, expect } from "vitest";
import {
  assertEmployeeTenantOwnership,
  assertEmployeeBranchTenantConsistency,
  assertAttendanceEmployeeValid,
  assertAttendanceIdempotency,
  assertChronologicalClockSequence,
  assertLeaveScheduleNonConflict,
  assertTimesheetImmutableIfApproved,
  assertPayrollInputApprovedOrigin,
  assertTaskTenantBoundary,
  assertCertificationExpiryCalculated,
  assertLaborCostReconciliation,
  assertWorkforceSyncConvergence,
} from "@kwakopos2/domain";
import type {
  Employee,
  TenantContext,
  WorkforceSchedule,
  LeaveRequest,
  Timesheet,
  EmployeeCertification,
} from "@kwakopos2/contracts";

describe("Workforce Invariants W001 - W012", () => {
  const ctx: TenantContext = {
    tenantId: "11111111-1111-1111-1111-111111111111",
    branchId: "22222222-2222-2222-2222-222222222222",
    userId: "33333333-3333-3333-3333-333333333333",
    roles: ["MANAGER"],
    permissions: ["WORKFORCE_VIEW", "EMPLOYEE_CREATE"],
  };

  const sampleEmployee: Employee = {
    id: "44444444-4444-4444-4444-444444444444",
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    userId: null,
    employeeNumber: "EMP-0001",
    firstName: "Sarah",
    lastName: "Mwangi",
    preferredName: null,
    phone: "+255700000001",
    email: "sarah@example.com",
    address: null,
    emergencyContact: null,
    dateOfBirth: null,
    status: "ACTIVE",
    hireDate: new Date().toISOString(),
    terminationDate: null,
    departmentId: null,
    positionId: null,
    managerId: null,
    workType: "FULL_TIME",
    contractType: "PERMANENT",
    baseSalary: 1500000,
    hourlyRate: 0,
    commissionRate: 5,
    pinCodeHash: null,
    profilePhotoUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("W001: Every employee belongs to exactly one tenant", () => {
    expect(() => assertEmployeeTenantOwnership(ctx, sampleEmployee)).not.toThrow();
    expect(() =>
      assertEmployeeTenantOwnership(ctx, { tenantId: "wrong-tenant-id" })
    ).toThrow(/INVARIANT_W001_VIOLATION/);
  });

  it("W002: Branch-scoped employee belongs to the same tenant as the branch", () => {
    expect(() =>
      assertEmployeeBranchTenantConsistency(ctx.tenantId, ctx.tenantId)
    ).not.toThrow();
    expect(() =>
      assertEmployeeBranchTenantConsistency(ctx.tenantId, "different-tenant")
    ).toThrow(/INVARIANT_W002_VIOLATION/);
  });

  it("W003: Attendance events reference valid employees in that tenant", () => {
    expect(() => assertAttendanceEmployeeValid(sampleEmployee, ctx)).not.toThrow();
    expect(() => assertAttendanceEmployeeValid(null, ctx)).toThrow(/INVARIANT_W003_VIOLATION/);
    expect(() =>
      assertAttendanceEmployeeValid({ ...sampleEmployee, tenantId: "foreign-tenant" }, ctx)
    ).toThrow(/INVARIANT_W003_VIOLATION/);
  });

  it("W004: Attendance events are idempotent", () => {
    const keys = new Set(["key-1", "key-2"]);
    expect(() => assertAttendanceIdempotency("key-3", keys)).not.toThrow();
    expect(() => assertAttendanceIdempotency("key-1", keys)).toThrow(/INVARIANT_W004_VIOLATION/);
  });

  it("W005: Clock-in/out sequences are strictly chronological", () => {
    const tIn = "2026-08-26T08:00:00.000Z";
    const tOut = "2026-08-26T17:00:00.000Z";
    const tEarlyOut = "2026-08-26T07:00:00.000Z";

    expect(() => assertChronologicalClockSequence(tIn, tOut)).not.toThrow();
    expect(() => assertChronologicalClockSequence(tIn, tEarlyOut)).toThrow(/INVARIANT_W005_VIOLATION/);
  });

  it("W006: Approved leave cannot overlap with active scheduled shifts", () => {
    const leave: LeaveRequest = {
      id: "leave-1",
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: sampleEmployee.id,
      leaveTypeId: "lt-1",
      startDate: "2026-09-01T00:00:00.000Z",
      endDate: "2026-09-05T00:00:00.000Z",
      totalDays: 5,
      partialDay: "FULL",
      reason: "Annual leave",
      status: "APPROVED",
      documentUrl: null,
      approvedById: ctx.userId,
      approvedAt: new Date().toISOString(),
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const conflictingShift: WorkforceSchedule = {
      id: "sched-1",
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: sampleEmployee.id,
      shiftTemplateId: null,
      date: "2026-09-02T00:00:00.000Z",
      startTime: "08:00",
      endTime: "17:00",
      status: "ACTIVE",
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertLeaveScheduleNonConflict(leave, [conflictingShift])).toThrow(
      /INVARIANT_W006_VIOLATION/
    );
  });

  it("W007: Approved timesheets cannot silently mutate", () => {
    const draftTimesheet: Timesheet = {
      id: "ts-1",
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: sampleEmployee.id,
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: "2026-08-31T00:00:00.000Z",
      totalScheduledMinutes: 9600,
      totalWorkedMinutes: 9600,
      totalRegularMinutes: 9600,
      totalOvertimeMinutes: 0,
      totalBreakMinutes: 1200,
      totalAbsentMinutes: 0,
      totalApprovedMinutes: 9600,
      status: "DRAFT",
      submittedAt: null,
      approvedAt: null,
      approvedById: null,
      rejectionReason: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    expect(() => assertTimesheetImmutableIfApproved(draftTimesheet)).not.toThrow();
    expect(() =>
      assertTimesheetImmutableIfApproved({ ...draftTimesheet, status: "APPROVED" })
    ).toThrow(/INVARIANT_W007_VIOLATION/);
  });

  it("W008: Payroll inputs originate strictly from approved workforce records", () => {
    expect(() => assertPayrollInputApprovedOrigin("APPROVED", "APPROVED")).not.toThrow();
    expect(() => assertPayrollInputApprovedOrigin("DRAFT")).toThrow(/INVARIANT_W008_VIOLATION/);
    expect(() => assertPayrollInputApprovedOrigin("APPROVED", "PENDING")).toThrow(/INVARIANT_W008_VIOLATION/);
  });

  it("W009: Workforce tasks cannot cross tenant boundaries", () => {
    expect(() => assertTaskTenantBoundary(ctx, { tenantId: ctx.tenantId })).not.toThrow();
    expect(() => assertTaskTenantBoundary(ctx, { tenantId: "foreign-tenant" })).toThrow(
      /INVARIANT_W009_VIOLATION/
    );
  });

  it("W010: Certification expiration is accurately calculated", () => {
    const cert: EmployeeCertification = {
      id: "cert-1",
      tenantId: ctx.tenantId,
      employeeId: sampleEmployee.id,
      certificationName: "Food Safety Level 2",
      issuingBody: "OSHA",
      certificateNumber: "FS-101",
      issueDate: "2025-01-01T00:00:00.000Z",
      expiryDate: "2026-09-01T00:00:00.000Z",
      isVerified: true,
      verifiedById: ctx.userId,
      verifiedAt: new Date().toISOString(),
      documentUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const refDate = new Date("2026-08-26T00:00:00.000Z");
    const { isExpired, daysRemaining } = assertCertificationExpiryCalculated(cert, refDate);
    expect(isExpired).toBe(false);
    expect(daysRemaining).toBe(6);
  });

  it("W011: Labor cost allocations reconcile to approved hours * labor rate", () => {
    expect(() => assertLaborCostReconciliation(10, 15000, 150000)).not.toThrow();
    expect(() => assertLaborCostReconciliation(10, 15000, 120000)).toThrow(/INVARIANT_W011_VIOLATION/);
  });

  it("W012: Multi-device sync convergence for workforce mutations", () => {
    expect(assertWorkforceSyncConvergence(5, 5)).toBe(true);
    expect(assertWorkforceSyncConvergence(5, 4)).toBe(false);
  });
});
