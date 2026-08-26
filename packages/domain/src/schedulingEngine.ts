import type {
  WorkforceSchedule,
  ShiftTemplate,
  CreateWorkforceScheduleRequest,
  TenantContext,
} from "@kwakopos2/contracts";
import { randomUUID } from "crypto";

export class SchedulingEngine {
  /**
   * Generates schedules for employees based on a ShiftTemplate for a date range.
   */
  static generateSchedulesFromTemplate(
    ctx: TenantContext,
    template: ShiftTemplate,
    employeeIds: string[],
    dates: Date[]
  ): WorkforceSchedule[] {
    const schedules: WorkforceSchedule[] = [];
    const now = new Date().toISOString();

    for (const date of dates) {
      // JavaScript day of week: Sunday=0, Monday=1... template workdays Monday=1... Sunday=7
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      if (!template.workdays.includes(dayOfWeek)) {
        continue;
      }

      for (const employeeId of employeeIds) {
        schedules.push({
          id: randomUUID(),
          tenantId: ctx.tenantId,
          branchId: template.branchId || ctx.branchId,
          employeeId,
          shiftTemplateId: template.id,
          date: date.toISOString(),
          startTime: template.startTime,
          endTime: template.endTime,
          status: "PUBLISHED",
          notes: `Auto-scheduled from ${template.name}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return schedules;
  }

  /**
   * Checks if an employee has conflicting shifts on the same date and overlapping time window.
   */
  static detectScheduleConflict(
    newSchedule: CreateWorkforceScheduleRequest,
    existingSchedules: WorkforceSchedule[]
  ): { hasConflict: boolean; conflictingSchedule?: WorkforceSchedule } {
    const targetDate = new Date(newSchedule.date).toISOString().slice(0, 10);

    for (const s of existingSchedules) {
      if (s.employeeId !== newSchedule.employeeId) continue;
      if (s.status === "CANCELLED") continue;

      const schedDate = new Date(s.date).toISOString().slice(0, 10);
      if (schedDate === targetDate) {
        // Simple time overlap check
        if (
          (newSchedule.startTime >= s.startTime && newSchedule.startTime < s.endTime) ||
          (newSchedule.endTime > s.startTime && newSchedule.endTime <= s.endTime) ||
          (newSchedule.startTime <= s.startTime && newSchedule.endTime >= s.endTime)
        ) {
          return { hasConflict: true, conflictingSchedule: s };
        }
      }
    }

    return { hasConflict: false };
  }
}
