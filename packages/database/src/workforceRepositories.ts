import type {
  TenantContext,
  Department,
  JobPosition,
  Employee,
  EmploymentRecord,
  ShiftTemplate,
  WorkforceSchedule,
  AttendanceRecord,
  Timesheet,
  LeaveType,
  LeaveRequest,
  WorkforceTask,
  WorkOrder,
  EmployeeSkill,
  EmployeeCertification,
  PerformanceReview,
  CommissionRecord,
  PayrollInput,
  CreateDepartmentRequest,
  CreateJobPositionRequest,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
  CreateEmploymentRecordRequest,
  CreateShiftTemplateRequest,
  CreateWorkforceScheduleRequest,
  ClockInRequest,
  ClockOutRequest,
  CreateTimesheetRequest,
  CreateLeaveRequest,
  CreateWorkforceTaskRequest,
  UpdateWorkforceTaskRequest,
  CreateWorkOrderRequest,
  UpdateWorkOrderRequest,
  CreateEmployeeSkillRequest,
  CreateEmployeeCertificationRequest,
  CreatePerformanceReviewRequest,
  CreateCommissionRecordRequest,
  CreatePayrollInputRequest,
  WorkforceDashboardSummary,
  WorkforceAnalyticsReport,
} from "@kwakopos2/contracts";
import {
  assertEmployeeTenantOwnership,
  assertEmployeeBranchTenantConsistency,
  assertAttendanceEmployeeValid,
  assertAttendanceIdempotency,
  assertChronologicalClockSequence,
  assertTimesheetImmutableIfApproved,
  assertTaskTenantBoundary,
  EmployeeEngine,
  AttendanceEngine,
  SchedulingEngine,
  LeaveEngine,
  TaskWorkOrderEngine,
  CommissionEngine,
  PayrollInputEngine,
  LaborCostingEngine,
  WorkforceAnalyticsEngine,
} from "@kwakopos2/domain";
import type { InMemoryStore } from "./index.js";
import { randomUUID } from "crypto";

export class ScopedWorkforceRepository {
  private store: InMemoryStore;

  // In-Memory collections for Workforce
  departments: Map<string, Department> = new Map();
  jobPositions: Map<string, JobPosition> = new Map();
  employees: Map<string, Employee> = new Map();
  employmentRecords: Map<string, EmploymentRecord> = new Map();
  shiftTemplates: Map<string, ShiftTemplate> = new Map();
  workforceSchedules: Map<string, WorkforceSchedule> = new Map();
  attendanceRecords: Map<string, AttendanceRecord> = new Map();
  timesheets: Map<string, Timesheet> = new Map();
  leaveTypes: Map<string, LeaveType> = new Map();
  leaveRequests: Map<string, LeaveRequest> = new Map();
  workforceTasks: Map<string, WorkforceTask> = new Map();
  workOrders: Map<string, WorkOrder> = new Map();
  employeeSkills: Map<string, EmployeeSkill> = new Map();
  employeeCertifications: Map<string, EmployeeCertification> = new Map();
  performanceReviews: Map<string, PerformanceReview> = new Map();
  commissionRecords: Map<string, CommissionRecord> = new Map();
  payrollInputs: Map<string, PayrollInput> = new Map();

  constructor(store: InMemoryStore) {
    this.store = store;
  }

  // =========================================================================
  // Department Management
  // =========================================================================

  createDepartment(ctx: TenantContext, req: CreateDepartmentRequest): Department {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const department: Department = {
      id,
      tenantId: ctx.tenantId,
      branchId: req.branchId || ctx.branchId,
      name: req.name,
      code: req.code.toUpperCase(),
      description: req.description || null,
      managerId: req.managerId || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.departments.set(id, department);
    return department;
  }

  getDepartments(ctx: TenantContext): Department[] {
    return Array.from(this.departments.values()).filter((d) => d.tenantId === ctx.tenantId);
  }

  // =========================================================================
  // Job Position Management
  // =========================================================================

  createJobPosition(ctx: TenantContext, req: CreateJobPositionRequest): JobPosition {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const position: JobPosition = {
      id,
      tenantId: ctx.tenantId,
      departmentId: req.departmentId || null,
      title: req.title,
      positionCode: req.positionCode.toUpperCase(),
      jobDescription: req.jobDescription || null,
      payClassification: req.payClassification || "SALARY",
      defaultSalary: req.defaultSalary || 0,
      defaultHourlyRate: req.defaultHourlyRate || 0,
      defaultCommissionRate: req.defaultCommissionRate || 0,
      schedulePolicy: req.schedulePolicy || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.jobPositions.set(id, position);
    return position;
  }

  getJobPositions(ctx: TenantContext): JobPosition[] {
    return Array.from(this.jobPositions.values()).filter((p) => p.tenantId === ctx.tenantId);
  }

  // =========================================================================
  // Employee Master & Employment Records
  // =========================================================================

  createEmployee(ctx: TenantContext, req: CreateEmployeeRequest): { employee: Employee; initialRecord: EmploymentRecord } {
    const sequence = this.getEmployees(ctx).length + 1;
    const { employee, initialRecord } = EmployeeEngine.createEmployee(ctx, req, sequence);

    this.employees.set(employee.id, employee);
    this.employmentRecords.set(initialRecord.id, initialRecord);
    return { employee, initialRecord };
  }

  getEmployees(ctx: TenantContext): Employee[] {
    return Array.from(this.employees.values()).filter((e) => e.tenantId === ctx.tenantId);
  }

  getEmployeeById(ctx: TenantContext, employeeId: string): Employee | null {
    const emp = this.employees.get(employeeId);
    if (!emp || emp.tenantId !== ctx.tenantId) return null;
    return emp;
  }

  updateEmployee(ctx: TenantContext, employeeId: string, req: UpdateEmployeeRequest, reason?: string): Employee {
    const existing = this.getEmployeeById(ctx, employeeId);
    if (!existing) throw new Error(`Employee ${employeeId} not found`);

    const { updatedEmployee, historyRecord } = EmployeeEngine.updateEmployee(ctx, existing, req, reason);
    this.employees.set(updatedEmployee.id, updatedEmployee);
    if (historyRecord) {
      this.employmentRecords.set(historyRecord.id, historyRecord);
    }
    return updatedEmployee;
  }

  getEmploymentHistory(ctx: TenantContext, employeeId: string): EmploymentRecord[] {
    return Array.from(this.employmentRecords.values()).filter(
      (r) => r.tenantId === ctx.tenantId && r.employeeId === employeeId
    );
  }

  // =========================================================================
  // Shift Templates & Workforce Scheduling
  // =========================================================================

  createShiftTemplate(ctx: TenantContext, req: CreateShiftTemplateRequest): ShiftTemplate {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const template: ShiftTemplate = {
      id,
      tenantId: ctx.tenantId,
      branchId: req.branchId || ctx.branchId,
      departmentId: req.departmentId || null,
      name: req.name,
      startTime: req.startTime,
      endTime: req.endTime,
      breakDurationMinutes: req.breakDurationMinutes,
      workdays: req.workdays,
      requiredHeadcount: req.requiredHeadcount,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.shiftTemplates.set(id, template);
    return template;
  }

  getShiftTemplates(ctx: TenantContext): ShiftTemplate[] {
    return Array.from(this.shiftTemplates.values()).filter((t) => t.tenantId === ctx.tenantId);
  }

  createSchedule(ctx: TenantContext, req: CreateWorkforceScheduleRequest): WorkforceSchedule {
    const existingSchedules = this.getSchedules(ctx);
    const { hasConflict, conflictingSchedule } = SchedulingEngine.detectScheduleConflict(req, existingSchedules);
    if (hasConflict && conflictingSchedule) {
      throw new Error(`Schedule conflict detected with shift ${conflictingSchedule.id} (${conflictingSchedule.startTime} - ${conflictingSchedule.endTime})`);
    }

    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const schedule: WorkforceSchedule = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      shiftTemplateId: req.shiftTemplateId || null,
      date: new Date(req.date).toISOString(),
      startTime: req.startTime,
      endTime: req.endTime,
      status: req.status || "PUBLISHED",
      notes: req.notes || null,
      createdAt: now,
      updatedAt: now,
    };
    this.workforceSchedules.set(id, schedule);
    return schedule;
  }

  getSchedules(ctx: TenantContext): WorkforceSchedule[] {
    return Array.from(this.workforceSchedules.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Attendance & Time Tracking
  // =========================================================================

  clockIn(ctx: TenantContext, req: ClockInRequest): AttendanceRecord {
    const employee = this.getEmployeeById(ctx, req.employeeId);
    const existingKeys = new Set(Array.from(this.attendanceRecords.values()).map((a) => a.idempotencyKey));
    const schedule = req.scheduleId ? this.workforceSchedules.get(req.scheduleId) : null;

    const record = AttendanceEngine.processClockIn(ctx, req, employee, schedule, existingKeys);
    this.attendanceRecords.set(record.id, record);
    return record;
  }

  clockOut(ctx: TenantContext, attendanceId: string, req: ClockOutRequest): AttendanceRecord {
    const record = this.attendanceRecords.get(attendanceId);
    if (!record || record.tenantId !== ctx.tenantId) {
      throw new Error(`Attendance record ${attendanceId} not found`);
    }
    const updated = AttendanceEngine.processClockOut(record, req);
    this.attendanceRecords.set(updated.id, updated);
    return updated;
  }

  getAttendanceRecords(ctx: TenantContext): AttendanceRecord[] {
    return Array.from(this.attendanceRecords.values()).filter(
      (a) => a.tenantId === ctx.tenantId && a.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Timesheets
  // =========================================================================

  generateTimesheet(ctx: TenantContext, req: CreateTimesheetRequest): Timesheet {
    const employee = this.getEmployeeById(ctx, req.employeeId);
    if (!employee) throw new Error(`Employee ${req.employeeId} not found`);

    const pStart = new Date(req.periodStart).getTime();
    const pEnd = new Date(req.periodEnd).getTime();

    const attendances = this.getAttendanceRecords(ctx).filter((a) => {
      const wDate = new Date(a.workDate).getTime();
      return a.employeeId === req.employeeId && wDate >= pStart && wDate <= pEnd;
    });

    const totalRegularMinutes = attendances.reduce((sum, a) => sum + (Number(a.regularMinutes) || 0), 0);
    const totalOvertimeMinutes = attendances.reduce((sum, a) => sum + (Number(a.overtimeMinutes) || 0), 0);
    const totalBreakMinutes = attendances.reduce((sum, a) => sum + (Number(a.breakMinutes) || 0), 0);
    const totalWorkedMinutes = totalRegularMinutes + totalOvertimeMinutes;

    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const timesheet: Timesheet = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      periodStart: new Date(req.periodStart).toISOString(),
      periodEnd: new Date(req.periodEnd).toISOString(),
      totalScheduledMinutes: totalRegularMinutes,
      totalWorkedMinutes,
      totalRegularMinutes,
      totalOvertimeMinutes,
      totalBreakMinutes,
      totalAbsentMinutes: 0,
      totalApprovedMinutes: totalWorkedMinutes,
      status: "DRAFT",
      submittedAt: now,
      approvedAt: null,
      approvedById: null,
      rejectionReason: null,
      createdAt: now,
      updatedAt: now,
    };
    this.timesheets.set(id, timesheet);
    return timesheet;
  }

  approveTimesheet(ctx: TenantContext, timesheetId: string): Timesheet {
    const timesheet = this.timesheets.get(timesheetId);
    if (!timesheet || timesheet.tenantId !== ctx.tenantId) {
      throw new Error(`Timesheet ${timesheetId} not found`);
    }
    const now = new Date().toISOString();
    const approved: Timesheet = {
      ...timesheet,
      status: "APPROVED",
      approvedById: ctx.userId,
      approvedAt: now,
      updatedAt: now,
    };
    this.timesheets.set(approved.id, approved);
    return approved;
  }

  getTimesheets(ctx: TenantContext): Timesheet[] {
    return Array.from(this.timesheets.values()).filter(
      (t) => t.tenantId === ctx.tenantId && t.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Leave Management
  // =========================================================================

  createLeaveType(ctx: TenantContext, req: { name: string; code: string; defaultAllowanceDays?: number; isPaid?: boolean }): LeaveType {
    const id = randomUUID();
    const now = new Date().toISOString();
    const lt: LeaveType = {
      id,
      tenantId: ctx.tenantId,
      name: req.name,
      code: req.code.toUpperCase(),
      isPaid: req.isPaid !== undefined ? req.isPaid : true,
      defaultAllowanceDays: req.defaultAllowanceDays || 21,
      requiresProof: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.leaveTypes.set(id, lt);
    return lt;
  }

  getLeaveTypes(ctx: TenantContext): LeaveType[] {
    return Array.from(this.leaveTypes.values()).filter((l) => l.tenantId === ctx.tenantId);
  }

  requestLeave(ctx: TenantContext, req: CreateLeaveRequest): LeaveRequest {
    const leave = LeaveEngine.createLeaveRequest(ctx, req);
    this.leaveRequests.set(leave.id, leave);
    return leave;
  }

  approveLeave(ctx: TenantContext, leaveRequestId: string, approved: boolean, reason?: string): LeaveRequest {
    const leave = this.leaveRequests.get(leaveRequestId);
    if (!leave || leave.tenantId !== ctx.tenantId) {
      throw new Error(`Leave request ${leaveRequestId} not found`);
    }
    const updated = LeaveEngine.processLeaveApproval(leave, approved, ctx.userId, reason);
    this.leaveRequests.set(updated.id, updated);
    return updated;
  }

  getLeaveRequests(ctx: TenantContext): LeaveRequest[] {
    return Array.from(this.leaveRequests.values()).filter(
      (l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Tasks & Work Orders
  // =========================================================================

  createTask(ctx: TenantContext, req: CreateWorkforceTaskRequest): WorkforceTask {
    const task = TaskWorkOrderEngine.createTask(ctx, req);
    this.workforceTasks.set(task.id, task);
    return task;
  }

  updateTask(ctx: TenantContext, taskId: string, req: UpdateWorkforceTaskRequest): WorkforceTask {
    const task = this.workforceTasks.get(taskId);
    if (!task || task.tenantId !== ctx.tenantId) throw new Error(`Task ${taskId} not found`);
    const updated = TaskWorkOrderEngine.updateTask(task, req, ctx.userId);
    this.workforceTasks.set(updated.id, updated);
    return updated;
  }

  getTasks(ctx: TenantContext): WorkforceTask[] {
    return Array.from(this.workforceTasks.values()).filter(
      (t) => t.tenantId === ctx.tenantId && t.branchId === ctx.branchId
    );
  }

  createWorkOrder(ctx: TenantContext, req: CreateWorkOrderRequest): WorkOrder {
    const sequence = this.getWorkOrders(ctx).length + 1;
    const wo = TaskWorkOrderEngine.createWorkOrder(ctx, req, sequence);
    this.workOrders.set(wo.id, wo);
    return wo;
  }

  updateWorkOrder(ctx: TenantContext, workOrderId: string, req: UpdateWorkOrderRequest): WorkOrder {
    const wo = this.workOrders.get(workOrderId);
    if (!wo || wo.tenantId !== ctx.tenantId) throw new Error(`Work order ${workOrderId} not found`);
    const updated = TaskWorkOrderEngine.updateWorkOrder(wo, req, ctx.userId);
    this.workOrders.set(updated.id, updated);
    return updated;
  }

  getWorkOrders(ctx: TenantContext): WorkOrder[] {
    return Array.from(this.workOrders.values()).filter(
      (w) => w.tenantId === ctx.tenantId && w.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Skills & Certifications
  // =========================================================================

  addSkill(ctx: TenantContext, employeeId: string, req: CreateEmployeeSkillRequest): EmployeeSkill {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const skill: EmployeeSkill = {
      id,
      tenantId: ctx.tenantId,
      employeeId,
      skillName: req.skillName,
      proficiencyLevel: req.proficiencyLevel || "INTERMEDIATE",
      yearsExperience: req.yearsExperience || 1,
      createdAt: now,
      updatedAt: now,
    };
    this.employeeSkills.set(id, skill);
    return skill;
  }

  getSkills(ctx: TenantContext, employeeId: string): EmployeeSkill[] {
    return Array.from(this.employeeSkills.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.employeeId === employeeId
    );
  }

  addCertification(ctx: TenantContext, employeeId: string, req: CreateEmployeeCertificationRequest): EmployeeCertification {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const cert: EmployeeCertification = {
      id,
      tenantId: ctx.tenantId,
      employeeId,
      certificationName: req.certificationName,
      issuingBody: req.issuingBody,
      certificateNumber: req.certificateNumber || null,
      issueDate: new Date(req.issueDate).toISOString(),
      expiryDate: req.expiryDate ? new Date(req.expiryDate).toISOString() : null,
      isVerified: true,
      verifiedById: ctx.userId,
      verifiedAt: now,
      documentUrl: req.documentUrl || null,
      createdAt: now,
      updatedAt: now,
    };
    this.employeeCertifications.set(id, cert);
    return cert;
  }

  getCertifications(ctx: TenantContext, employeeId?: string): EmployeeCertification[] {
    return Array.from(this.employeeCertifications.values()).filter((c) => {
      if (c.tenantId !== ctx.tenantId) return false;
      if (employeeId && c.employeeId !== employeeId) return false;
      return true;
    });
  }

  // =========================================================================
  // Performance Reviews
  // =========================================================================

  createPerformanceReview(ctx: TenantContext, req: CreatePerformanceReviewRequest): PerformanceReview {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const review: PerformanceReview = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      reviewerId: ctx.userId,
      reviewPeriod: req.reviewPeriod,
      rating: req.rating,
      strengths: req.strengths || null,
      improvements: req.improvements || null,
      goals: req.goals || [],
      status: "COMPLETED",
      submittedAt: now,
      acknowledgedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.performanceReviews.set(id, review);
    return review;
  }

  getPerformanceReviews(ctx: TenantContext, employeeId?: string): PerformanceReview[] {
    return Array.from(this.performanceReviews.values()).filter((r) => {
      if (r.tenantId !== ctx.tenantId) return false;
      if (employeeId && r.employeeId !== employeeId) return false;
      return true;
    });
  }

  // =========================================================================
  // Commissions & Payroll Inputs
  // =========================================================================

  recordCommission(ctx: TenantContext, req: CreateCommissionRecordRequest): CommissionRecord {
    const record = CommissionEngine.createCommissionRecord(ctx, req);
    this.commissionRecords.set(record.id, record);
    return record;
  }

  approveCommission(ctx: TenantContext, commissionId: string): CommissionRecord {
    const comm = this.commissionRecords.get(commissionId);
    if (!comm || comm.tenantId !== ctx.tenantId) throw new Error(`Commission ${commissionId} not found`);
    const updated = CommissionEngine.approveCommission(comm, ctx.userId);
    this.commissionRecords.set(updated.id, updated);
    return updated;
  }

  getCommissions(ctx: TenantContext): CommissionRecord[] {
    return Array.from(this.commissionRecords.values()).filter(
      (c) => c.tenantId === ctx.tenantId && c.branchId === ctx.branchId
    );
  }

  generatePayrollInputFromTimesheet(ctx: TenantContext, employeeId: string, timesheetId: string): PayrollInput {
    const employee = this.getEmployeeById(ctx, employeeId);
    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    const timesheet = this.timesheets.get(timesheetId);
    if (!timesheet || timesheet.tenantId !== ctx.tenantId) throw new Error(`Timesheet ${timesheetId} not found`);

    const commissions = this.getCommissions(ctx).filter((c) => c.employeeId === employeeId);
    const payrollInput = PayrollInputEngine.generatePayrollInput(ctx, employee, timesheet, commissions);
    this.payrollInputs.set(payrollInput.id, payrollInput);
    return payrollInput;
  }

  approvePayrollInput(ctx: TenantContext, payrollInputId: string): PayrollInput {
    const pi = this.payrollInputs.get(payrollInputId);
    if (!pi || pi.tenantId !== ctx.tenantId) throw new Error(`Payroll input ${payrollInputId} not found`);
    const approved = PayrollInputEngine.approvePayrollInput(pi, ctx.userId);
    this.payrollInputs.set(approved.id, approved);
    return approved;
  }

  getPayrollInputs(ctx: TenantContext): PayrollInput[] {
    return Array.from(this.payrollInputs.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.branchId === ctx.branchId
    );
  }

  // =========================================================================
  // Workforce Dashboard & Analytics
  // =========================================================================

  getDashboardSummary(ctx: TenantContext): WorkforceDashboardSummary {
    const employees = this.getEmployees(ctx);
    const todayAttendance = this.getAttendanceRecords(ctx);
    const pendingLeaves = this.getLeaveRequests(ctx);
    const openTasks = this.getTasks(ctx);
    const workOrders = this.getWorkOrders(ctx);
    const certifications = this.getCertifications(ctx);

    return WorkforceAnalyticsEngine.generateDashboardSummary(
      employees,
      todayAttendance,
      pendingLeaves,
      openTasks,
      workOrders,
      certifications
    );
  }

  getAnalyticsReport(ctx: TenantContext, period = "2026-08"): WorkforceAnalyticsReport {
    const employees = this.getEmployees(ctx);
    const attendance = this.getAttendanceRecords(ctx);
    const tasks = this.getTasks(ctx);

    return WorkforceAnalyticsEngine.generateAnalyticsReport(ctx, period, employees, attendance, tasks);
  }
}
