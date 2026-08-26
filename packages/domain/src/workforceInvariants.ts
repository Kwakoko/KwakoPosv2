import type {
  Employee,
  AttendanceRecord,
  Timesheet,
  LeaveRequest,
  WorkforceSchedule,
  WorkforceTask,
  WorkOrder,
  EmployeeCertification,
  PayrollInput,
  TenantContext,
} from "@kwakopos2/contracts";

/**
 * INVARIANT W001: Every employee belongs to exactly one tenant.
 */
export function assertEmployeeTenantOwnership(ctx: TenantContext, employee: { tenantId: string }): void {
  if (employee.tenantId !== ctx.tenantId) {
    throw new Error(
      `INVARIANT_W001_VIOLATION: Cross-tenant employee access denied. Expected tenant ${ctx.tenantId}, got ${employee.tenantId}.`
    );
  }
}

/**
 * INVARIANT W002: Branch-scoped employee belongs to the same tenant as the branch.
 */
export function assertEmployeeBranchTenantConsistency(
  employeeTenantId: string,
  branchTenantId: string
): void {
  if (employeeTenantId !== branchTenantId) {
    throw new Error(
      `INVARIANT_W002_VIOLATION: Employee tenant (${employeeTenantId}) does not match branch tenant (${branchTenantId}).`
    );
  }
}

/**
 * INVARIANT W003: Attendance events reference valid employees in that tenant.
 */
export function assertAttendanceEmployeeValid(
  employee: Employee | null,
  ctx: TenantContext
): void {
  if (!employee) {
    throw new Error(`INVARIANT_W003_VIOLATION: Attendance record references non-existent employee.`);
  }
  if (employee.tenantId !== ctx.tenantId) {
    throw new Error(
      `INVARIANT_W003_VIOLATION: Attendance record employee belongs to different tenant (${employee.tenantId} vs ${ctx.tenantId}).`
    );
  }
}

/**
 * INVARIANT W004: Attendance events are idempotent.
 */
export function assertAttendanceIdempotency(
  idempotencyKey: string,
  existingKeys: Set<string>
): void {
  if (existingKeys.has(idempotencyKey)) {
    throw new Error(
      `INVARIANT_W004_VIOLATION: Duplicate attendance event detected with idempotency key ${idempotencyKey}.`
    );
  }
}

/**
 * INVARIANT W005: Clock-in/out sequences are strictly chronological.
 */
export function assertChronologicalClockSequence(
  clockIn: string | Date,
  clockOut?: string | Date | null
): void {
  if (!clockOut) return;
  const inMs = new Date(clockIn).getTime();
  const outMs = new Date(clockOut).getTime();
  if (outMs < inMs) {
    throw new Error(
      `INVARIANT_W005_VIOLATION: Clock-out time (${new Date(clockOut).toISOString()}) cannot precede clock-in time (${new Date(clockIn).toISOString()}).`
    );
  }
}

/**
 * INVARIANT W006: Approved leave cannot overlap with scheduled shifts.
 */
export function assertLeaveScheduleNonConflict(
  leave: LeaveRequest,
  schedules: WorkforceSchedule[]
): void {
  if (leave.status !== "APPROVED") return;
  const leaveStart = new Date(leave.startDate).getTime();
  const leaveEnd = new Date(leave.endDate).getTime();

  for (const s of schedules) {
    const schedTime = new Date(s.date).getTime();
    if (schedTime >= leaveStart && schedTime <= leaveEnd && s.status === "ACTIVE") {
      throw new Error(
        `INVARIANT_W006_VIOLATION: Employee ${leave.employeeId} has an active shift on ${new Date(s.date).toISOString()} during approved leave.`
      );
    }
  }
}

/**
 * INVARIANT W007: Approved timesheets cannot silently mutate.
 */
export function assertTimesheetImmutableIfApproved(timesheet: Timesheet): void {
  if (timesheet.status === "APPROVED" || timesheet.status === "LOCKED") {
    throw new Error(
      `INVARIANT_W007_VIOLATION: Timesheet ${timesheet.id} is ${timesheet.status} and cannot be directly updated without audited correction.`
    );
  }
}

/**
 * INVARIANT W008: Payroll inputs originate strictly from approved workforce records.
 */
export function assertPayrollInputApprovedOrigin(timesheetStatus?: string, commissionStatus?: string): void {
  if (timesheetStatus && timesheetStatus !== "APPROVED" && timesheetStatus !== "LOCKED") {
    throw new Error(
      `INVARIANT_W008_VIOLATION: Payroll input cannot be generated from unapproved timesheet status: ${timesheetStatus}.`
    );
  }
  if (commissionStatus && commissionStatus !== "APPROVED" && commissionStatus !== "PAID") {
    throw new Error(
      `INVARIANT_W008_VIOLATION: Payroll input cannot include unapproved commission status: ${commissionStatus}.`
    );
  }
}

/**
 * INVARIANT W009: Workforce tasks and work orders cannot cross tenant boundaries.
 */
export function assertTaskTenantBoundary(ctx: TenantContext, task: { tenantId: string }): void {
  if (task.tenantId !== ctx.tenantId) {
    throw new Error(
      `INVARIANT_W009_VIOLATION: Task tenant ${task.tenantId} does not match caller tenant ${ctx.tenantId}.`
    );
  }
}

/**
 * INVARIANT W010: Certification expiration is accurately calculated.
 */
export function assertCertificationExpiryCalculated(
  cert: EmployeeCertification,
  referenceDate = new Date()
): { isExpired: boolean; daysRemaining: number } {
  if (!cert.expiryDate) {
    return { isExpired: false, daysRemaining: 9999 };
  }
  const expiryMs = new Date(cert.expiryDate).getTime();
  const refMs = referenceDate.getTime();
  const diffDays = Math.ceil((expiryMs - refMs) / (1000 * 60 * 60 * 24));
  return {
    isExpired: diffDays <= 0,
    daysRemaining: diffDays,
  };
}

/**
 * INVARIANT W011: Labor cost allocations reconcile to approved hours * labor rate.
 */
export function assertLaborCostReconciliation(
  approvedHours: number,
  laborRate: number,
  calculatedCost: number
): void {
  const expectedCost = Math.round(approvedHours * laborRate * 100) / 100;
  const actualCost = Math.round(calculatedCost * 100) / 100;
  if (Math.abs(expectedCost - actualCost) > 0.05) {
    throw new Error(
      `INVARIANT_W011_VIOLATION: Labor cost allocation (${actualCost}) does not reconcile with hours * rate (${expectedCost}).`
    );
  }
}

/**
 * INVARIANT W012: Multi-device workforce mutation sync convergence.
 */
export function assertWorkforceSyncConvergence(
  localVersionCount: number,
  remoteVersionCount: number
): boolean {
  return localVersionCount === remoteVersionCount;
}
