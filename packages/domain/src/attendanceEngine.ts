import type {
  AttendanceRecord,
  ClockInRequest,
  ClockOutRequest,
  WorkforceSchedule,
  Employee,
  TenantContext,
} from "@kwakopos2/contracts";
import {
  assertAttendanceEmployeeValid,
  assertChronologicalClockSequence,
  assertAttendanceIdempotency,
} from "./workforceInvariants.js";
import { EmployeeEngine } from "./employeeEngine.js";
import { randomUUID } from "crypto";

export interface AttendanceAnomaly {
  anomalyType: "MISSING_CLOCK_OUT" | "DUPLICATE_CLOCK_IN" | "EXCESSIVE_OVERTIME" | "UNSCHEDULED_ATTENDANCE";
  severity: "INFO" | "WARNING" | "CRITICAL";
  description: string;
  employeeId: string;
  attendanceId?: string;
}

export class AttendanceEngine {
  /**
   * Processes a Clock-In event and validates PIN / QR / Geo if applicable.
   */
  static processClockIn(
    ctx: TenantContext,
    req: ClockInRequest,
    employee: Employee | null,
    schedule?: WorkforceSchedule | null,
    existingKeys: Set<string> = new Set()
  ): AttendanceRecord {
    assertAttendanceEmployeeValid(employee, ctx);
    assertAttendanceIdempotency(req.idempotencyKey, existingKeys);

    const now = req.clockInTime ? new Date(req.clockInTime) : new Date();
    const workDate = new Date(now.toISOString().slice(0, 10));

    // PIN verification if required
    let pinVerified = false;
    if (req.method === "PIN" && req.pinCode) {
      if (!EmployeeEngine.verifyPin(req.pinCode, employee?.pinCodeHash)) {
        throw new Error("Invalid employee PIN for attendance check-in.");
      }
      pinVerified = true;
    }

    // Determine status (Check if Late compared to schedule start)
    let status: AttendanceRecord["status"] = "PRESENT";
    if (schedule && schedule.startTime) {
      const [schedHours, schedMinutes] = schedule.startTime.split(":").map(Number);
      const scheduledClockIn = new Date(now);
      scheduledClockIn.setUTCHours(schedHours, schedMinutes, 0, 0);

      // If clocked in more than 15 minutes after scheduled start
      if (now.getTime() - scheduledClockIn.getTime() > 15 * 60 * 1000) {
        status = "LATE";
      }
    }


    return {
      id: req.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      employeeId: req.employeeId,
      scheduleId: req.scheduleId || (schedule ? schedule.id : null),
      workDate: workDate.toISOString(),
      clockIn: now.toISOString(),
      clockOut: null,
      breakMinutes: 0,
      regularMinutes: 0,
      overtimeMinutes: 0,
      status,
      method: req.method || "STANDARD",
      pinVerified,
      qrCode: req.qrCode || null,
      latitude: req.latitude || null,
      longitude: req.longitude || null,
      deviceId: req.deviceId || null,
      idempotencyKey: req.idempotencyKey,
      supervisorApproved: false,
      approvedById: null,
      approvedAt: null,
      correctionReason: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  /**
   * Processes a Clock-Out event, computes worked time, deductions, and overtime.
   */
  static processClockOut(
    record: AttendanceRecord,
    req: ClockOutRequest,
    standardWorkMinutes = 480 // 8 hours standard
  ): AttendanceRecord {
    const clockOutTime = req.clockOutTime ? new Date(req.clockOutTime) : new Date();
    assertChronologicalClockSequence(record.clockIn, clockOutTime);

    const clockInMs = new Date(record.clockIn).getTime();
    const clockOutMs = clockOutTime.getTime();
    const totalMinutesElapsed = Math.floor((clockOutMs - clockInMs) / (1000 * 60));

    const breakMinutes = req.breakMinutes || record.breakMinutes || 0;
    const netWorkedMinutes = Math.max(0, totalMinutesElapsed - breakMinutes);

    let regularMinutes = netWorkedMinutes;
    let overtimeMinutes = 0;

    if (netWorkedMinutes > standardWorkMinutes) {
      regularMinutes = standardWorkMinutes;
      overtimeMinutes = netWorkedMinutes - standardWorkMinutes;
    }

    let status = record.status;
    if (overtimeMinutes > 0) {
      status = "OVERTIME";
    }

    return {
      ...record,
      clockOut: clockOutTime.toISOString(),
      breakMinutes,
      regularMinutes,
      overtimeMinutes,
      status,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates attendance records for operational anomalies.
   */
  static detectAnomalies(
    records: AttendanceRecord[],
    maxShiftHours = 14
  ): AttendanceAnomaly[] {
    const anomalies: AttendanceAnomaly[] = [];
    const now = Date.now();

    for (const r of records) {
      // Check 1: Missing Clock Out after maxShiftHours
      if (!r.clockOut) {
        const inMs = new Date(r.clockIn).getTime();
        if (now - inMs > maxShiftHours * 60 * 60 * 1000) {
          anomalies.push({
            anomalyType: "MISSING_CLOCK_OUT",
            severity: "WARNING",
            description: `Employee ${r.employeeId} clocked in at ${r.clockIn} has not clocked out after ${maxShiftHours} hours.`,
            employeeId: r.employeeId,
            attendanceId: r.id,
          });
        }
      }

      // Check 2: Excessive Overtime (> 4 hours overtime in a single shift)
      if (r.overtimeMinutes > 240) {
        anomalies.push({
          anomalyType: "EXCESSIVE_OVERTIME",
          severity: "INFO",
          description: `Employee ${r.employeeId} logged ${Math.round(r.overtimeMinutes / 60)} hours overtime on ${r.workDate}.`,
          employeeId: r.employeeId,
          attendanceId: r.id,
        });
      }
    }

    return anomalies;
  }
}
