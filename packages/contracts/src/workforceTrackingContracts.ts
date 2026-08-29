import { z } from "zod";

// 1. Worker Profile
export const WorkerProfileSchema = z.object({
  workerId: z.string(),
  employeeNumber: z.string(),
  name: z.string(),
  email: z.string().email(),
  department: z.string(),
  team: z.string(),
  role: z.string(),
  workerType: z.enum(["PERMANENT", "TEMPORARY", "CASUAL", "CONTRACTOR", "FIELD_TECHNICIAN", "DRIVER"]),
  skills: z.array(z.string()),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuedDate: z.string(),
      expiryDate: z.string(),
    })
  ),
  costRateTzs: z.number().nonnegative(),
  billingRateTzs: z.number().nonnegative(),
  status: z.enum(["APPLICANT", "ONBOARDING", "ACTIVE", "SUSPENDED", "OFFBOARDING", "ARCHIVED"]),
  createdAt: z.string(),
});

export type WorkerProfile = z.infer<typeof WorkerProfileSchema>;

// 2. Shift Definition
export const ShiftDefinitionSchema = z.object({
  shiftId: z.string(),
  name: z.string(),
  startTime: z.string(), // "08:00"
  endTime: z.string(),   // "17:00"
  breakDurationMinutes: z.number().nonnegative(),
  requiredStaffing: z.number().int().positive(),
  location: z.string(),
});

export type ShiftDefinition = z.infer<typeof ShiftDefinitionSchema>;

// 3. Roster Assignment
export const RosterAssignmentSchema = z.object({
  rosterId: z.string(),
  workerId: z.string(),
  shiftId: z.string(),
  date: z.string(),
  version: z.number().int().positive(),
  publishedStatus: z.enum(["DRAFT", "PUBLISHED", "ACKNOWLEDGED", "CANCELLED"]),
});

export type RosterAssignment = z.infer<typeof RosterAssignmentSchema>;

// 4. Clock Event (Immutable)
export const ClockEventSchema = z.object({
  eventId: z.string(),
  workerId: z.string(),
  shiftId: z.string(),
  eventType: z.enum(["CLOCK_IN", "BREAK_IN", "BREAK_OUT", "CLOCK_OUT"]),
  timestamp: z.string(),
  deviceId: z.string(),
  locationMetadata: z.object({
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    siteId: z.string().optional(),
  }).optional(),
  syncState: z.enum(["PENDING", "SYNCED", "FAILED"]),
});

export type ClockEvent = z.infer<typeof ClockEventSchema>;

// 5. Timesheet Record
export const TimesheetRecordSchema = z.object({
  timesheetId: z.string(),
  workerId: z.string(),
  periodStartDate: z.string(),
  periodEndDate: z.string(),
  regularHours: z.number().nonnegative(),
  overtimeHours: z.number().nonnegative(),
  breakHours: z.number().nonnegative(),
  projectHours: z.number().nonnegative(),
  billableHours: z.number().nonnegative(),
  approvalStatus: z.enum(["SUBMITTED", "APPROVED", "REJECTED", "PAYROLL_PROCESSED"]),
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
});

export type TimesheetRecord = z.infer<typeof TimesheetRecordSchema>;

// 6. Project Labor Costing
export const ProjectLaborCostingSchema = z.object({
  costingId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  workerId: z.string(),
  approvedHours: z.number().nonnegative(),
  costRateTzs: z.number().nonnegative(),
  totalLaborCostTzs: z.number().nonnegative(),
  billableRevenueTzs: z.number().nonnegative(),
  allocatedAt: z.string(),
});

export type ProjectLaborCosting = z.infer<typeof ProjectLaborCostingSchema>;

// 7. Workforce Command Center Summary
export const WorkforceCommandCenterSummarySchema = z.object({
  totalActiveWorkers: z.number().int().nonnegative(),
  workersPresentToday: z.number().int().nonnegative(),
  workersOnLeaveToday: z.number().int().nonnegative(),
  totalOvertimeHoursThisWeek: z.number().nonnegative(),
  totalLaborCostAllocatedTzs: z.number().nonnegative(),
  attendanceReliabilityPct: z.number().min(0).max(100),
  complianceAlertsCount: z.number().int().nonnegative(),
  payrollReconciliationPassing: z.boolean(),
});

export type WorkforceCommandCenterSummary = z.infer<typeof WorkforceCommandCenterSummarySchema>;
