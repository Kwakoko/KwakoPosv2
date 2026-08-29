import { globalWorkforceEngine } from "@kwakopos2/domain";
import type {
  WorkforceEmployee, WorkforceShift, WorkforceAttendance,
  WorkforceLeave, WorkforceTask, WorkforceCertification, WorkforceExpense,
  IndustryWorkforceProfile, WorkforceEmployeeStatus, WorkforceTaskState,
} from "@kwakopos2/contracts";

// ============================================================
// Phase 37 — Workforce API Service
// ============================================================

export class WorkforceService {
  public registerEmployee(params: any) {
    return globalWorkforceEngine.registerEmployee(params);
  }
  public getEmployee(employeeId: string) {
    return globalWorkforceEngine.getEmployee(employeeId);
  }
  public listEmployees(tenantId: string, filters?: any) {
    return globalWorkforceEngine.listEmployees(tenantId, filters);
  }
  public updateEmployee(employeeId: string, updates: Partial<WorkforceEmployee>) {
    return globalWorkforceEngine.updateEmployee(employeeId, updates);
  }

  public transitionEmployeeStatus(employeeId: string, newStatus: WorkforceEmployeeStatus, reason: string, actorId: string) {
    return globalWorkforceEngine.transitionEmployeeStatus(employeeId, newStatus, reason, actorId);
  }
  public onboardEmployee(employeeId: string, workflowRef: string, actorId: string) {
    return globalWorkforceEngine.onboardEmployee(employeeId, workflowRef, actorId);
  }
  public offboardEmployee(employeeId: string, terminationReason: string, approvalRef: string, actorId: string) {
    return globalWorkforceEngine.offboardEmployee(employeeId, terminationReason, approvalRef, actorId);
  }

  public createDepartment(params: any) {
    return globalWorkforceEngine.createDepartment(params);
  }
  public listDepartments(tenantId: string) {
    return globalWorkforceEngine.listDepartments(tenantId);
  }
  public createPosition(params: any) {
    return globalWorkforceEngine.createPosition(params);
  }
  public listPositions(tenantId: string) {
    return globalWorkforceEngine.listPositions(tenantId);
  }

  public createShift(shift: any) {
    return globalWorkforceEngine.createShift(shift);
  }
  public publishShift(shiftId: string, actorId: string) {
    return globalWorkforceEngine.publishShift(shiftId, actorId);
  }
  public swapShifts(shiftId1: string, shiftId2: string, approvalRef: string, actorId: string) {
    return globalWorkforceEngine.swapShifts(shiftId1, shiftId2, approvalRef, actorId);
  }
  public checkShiftConflicts(shift: any) {
    return globalWorkforceEngine.checkShiftConflicts(shift);
  }
  public listShifts(tenantId: string, branchId?: string, startDate?: string, endDate?: string) {
    return globalWorkforceEngine.listShifts(tenantId, branchId, startDate, endDate);
  }

  public recordCheckIn(params: any) {
    return globalWorkforceEngine.recordCheckIn(params);
  }
  public recordCheckOut(params: any) {
    return globalWorkforceEngine.recordCheckOut(params);
  }
  public correctAttendance(params: any) {
    return globalWorkforceEngine.correctAttendance(params);
  }
  public listAttendance(tenantId: string, branchId?: string, startDate?: string, endDate?: string) {
    return globalWorkforceEngine.listAttendance(tenantId, branchId, startDate, endDate);
  }

  public submitTimesheet(params: any) {
    return globalWorkforceEngine.submitTimesheet(params);
  }
  public approveTimesheet(timesheetId: string, approvedBy: string) {
    return globalWorkforceEngine.approveTimesheet(timesheetId, approvedBy);
  }
  public lockTimesheet(timesheetId: string, lockedBy: string) {
    return globalWorkforceEngine.lockTimesheet(timesheetId, lockedBy);
  }

  public requestLeave(params: any) {
    return globalWorkforceEngine.requestLeave(params);
  }
  public approveLeave(leaveId: string, approvalRef: string, approvedBy: string) {
    return globalWorkforceEngine.approveLeave(leaveId, approvalRef, approvedBy);
  }

  public assignTask(params: any) {
    return globalWorkforceEngine.assignTask(params);
  }
  public updateTaskState(taskId: string, newState: WorkforceTaskState, actorId: string, actualHours?: number) {
    return globalWorkforceEngine.updateTaskState(taskId, newState, actorId, actualHours);
  }

  public registerCertification(cert: any) {
    return globalWorkforceEngine.registerCertification(cert);
  }
  public checkExpiringCertifications(tenantId: string, daysAhead?: number) {
    return globalWorkforceEngine.checkExpiringCertifications(tenantId, daysAhead);
  }

  public setIndustryProfile(profile: IndustryWorkforceProfile) {
    return globalWorkforceEngine.setIndustryProfile(profile);
  }
  public getIndustryProfile(tenantId: string, industryType: IndustryWorkforceProfile["industryType"]) {
    return globalWorkforceEngine.getIndustryProfile(tenantId, industryType);
  }

  public submitExpense(params: any) {
    return globalWorkforceEngine.submitExpense(params);
  }
  public approveExpense(expenseId: string, approvalRef: string, approvedBy: string) {
    return globalWorkforceEngine.approveExpense(expenseId, approvalRef, approvedBy);
  }

  public generatePayrollInput(tenantId: string, employeeId: string, periodStart: string, periodEnd: string) {
    return globalWorkforceEngine.generatePayrollInput(tenantId, employeeId, periodStart, periodEnd);
  }

  public getWorkforceAnalytics(tenantId: string) {
    return globalWorkforceEngine.calculateWorkforceAnalytics(tenantId);
  }
  public generateAIStaffingRecommendation(tenantId: string, branchId: string, demandScenario: any) {
    return globalWorkforceEngine.generateAIStaffingRecommendation(tenantId, branchId, demandScenario);
  }
  public detectWorkforceAnomalies(tenantId: string) {
    return globalWorkforceEngine.detectWorkforceAnomalies(tenantId);
  }
  public getHealthSummary(tenantId: string) {
    return globalWorkforceEngine.getHealthSummary(tenantId);
  }
  public getAuditTrail(tenantId: string) {
    return globalWorkforceEngine.getAuditTrail(tenantId);
  }
}

export const globalWorkforceService = new WorkforceService();
