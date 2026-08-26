import type {
  Employee,
  AttendanceRecord,
  LeaveRequest,
  WorkforceTask,
  WorkOrder,
  EmployeeCertification,
  WorkforceDashboardSummary,
  WorkforceAnalyticsReport,
  TenantContext,
} from "@kwakopos2/contracts";
import { assertCertificationExpiryCalculated } from "./workforceInvariants.js";

export class WorkforceAnalyticsEngine {
  /**
   * Generates real-time Workforce Dashboard Summary.
   */
  static generateDashboardSummary(
    employees: Employee[],
    todayAttendance: AttendanceRecord[],
    pendingLeaves: LeaveRequest[],
    openTasks: WorkforceTask[],
    workOrders: WorkOrder[],
    certifications: EmployeeCertification[]
  ): WorkforceDashboardSummary {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((e) => e.status === "ACTIVE").length;

    const presentToday = todayAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE" || a.status === "OVERTIME").length;
    const lateToday = todayAttendance.filter((a) => a.status === "LATE").length;
    const overtimeToday = todayAttendance.filter((a) => a.status === "OVERTIME" || Number(a.overtimeMinutes) > 0).length;
    const absentToday = Math.max(0, activeEmployees - presentToday);

    const pendingLeaveCount = pendingLeaves.filter((l) => l.status === "PENDING").length;
    const activeTaskCount = openTasks.filter((t) => t.status !== "COMPLETED" && t.status !== "VERIFIED" && t.status !== "CANCELLED").length;
    const activeWorkOrderCount = workOrders.filter((w) => w.status !== "COMPLETED" && w.status !== "INVOICED" && w.status !== "CANCELLED").length;

    const expiringCertificationsCount = certifications.filter((c) => {
      const { isExpired, daysRemaining } = assertCertificationExpiryCalculated(c);
      return isExpired || daysRemaining <= 30;
    }).length;

    let workforceHealth: "GREEN" | "YELLOW" | "RED" = "GREEN";
    if (absentToday > activeEmployees * 0.25 || lateToday > activeEmployees * 0.3) {
      workforceHealth = "RED";
    } else if (absentToday > activeEmployees * 0.1 || lateToday > activeEmployees * 0.15 || expiringCertificationsCount > 0) {
      workforceHealth = "YELLOW";
    }

    return {
      totalEmployees,
      activeEmployees,
      presentToday,
      absentToday,
      lateToday,
      overtimeToday,
      pendingLeaveRequests: pendingLeaveCount,
      openTasks: activeTaskCount,
      activeWorkOrders: activeWorkOrderCount,
      expiringCertificationsCount,
      workforceHealth,
    };
  }

  /**
   * Generates comprehensive Workforce Analytics Report for a period.
   */
  static generateAnalyticsReport(
    ctx: TenantContext,
    period: string,
    employees: Employee[],
    attendance: AttendanceRecord[],
    tasks: WorkforceTask[],
    totalSalesRevenue = 0,
    totalLaborCost = 0
  ): WorkforceAnalyticsReport {
    const headcount = employees.filter((e) => e.status === "ACTIVE").length;
    const totalAttendanceCount = attendance.length;
    const onTimeCount = attendance.filter((a) => a.status === "PRESENT").length;
    const averagePunctualityPct =
      totalAttendanceCount > 0 ? Math.round((onTimeCount / totalAttendanceCount) * 10000) / 100 : 100;

    const totalWorkedMinutes = attendance.reduce((sum, a) => sum + (Number(a.regularMinutes) || 0) + (Number(a.overtimeMinutes) || 0), 0);
    const totalOvertimeMinutes = attendance.reduce((sum, a) => sum + (Number(a.overtimeMinutes) || 0), 0);

    const totalHoursWorked = Math.round((totalWorkedMinutes / 60) * 100) / 100;
    const totalOvertimeHours = Math.round((totalOvertimeMinutes / 60) * 100) / 100;

    const revenuePerEmployee = headcount > 0 ? Math.round((totalSalesRevenue / headcount) * 100) / 100 : 0;

    const completedTasks = tasks.filter((t) => t.status === "COMPLETED" || t.status === "VERIFIED").length;
    const taskCompletionRatePct =
      tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 10000) / 100 : 100;

    return {
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      period,
      headcount,
      turnoverRatePct: 0,
      averagePunctualityPct,
      totalHoursWorked,
      totalOvertimeHours,
      totalLaborCost,
      revenuePerEmployee,
      taskCompletionRatePct,
    };
  }
}
