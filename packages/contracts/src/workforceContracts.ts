import { z } from "zod";

// ============================================================
// Phase 37 — Workforce Contracts (KWOL v1.0.0)
// ============================================================

// ─── 1. Enumerations ─────────────────────────────────────────

export const WorkforceEmploymentTypeEnum = z.enum([
  "FULL_TIME", "PART_TIME", "CONTRACTOR", "TEMPORARY", "INTERN", "FIELD_WORKER", "SEASONAL", "CASUAL",
]);
export type WorkforceEmploymentType = z.infer<typeof WorkforceEmploymentTypeEnum>;

export const WorkforceEmployeeStatusEnum = z.enum([
  "PENDING", "ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED", "ARCHIVED",
]);
export type WorkforceEmployeeStatus = z.infer<typeof WorkforceEmployeeStatusEnum>;

export const WorkforceOrgLevelEnum = z.enum([
  "TENANT", "COUNTRY", "REGION", "BRANCH", "DEPARTMENT", "TEAM",
]);
export type WorkforceOrgLevel = z.infer<typeof WorkforceOrgLevelEnum>;

export const WorkforceShiftStatusEnum = z.enum([
  "DRAFT", "PUBLISHED", "ACKNOWLEDGED", "ACTIVE", "COMPLETED", "VERIFIED", "CANCELLED",
]);
export type WorkforceShiftStatus = z.infer<typeof WorkforceShiftStatusEnum>;

export const WorkforceAttendanceSourceEnum = z.enum([
  "APP_CHECKIN", "MANAGER_ENTRY", "BIOMETRIC_DEVICE", "GPS_GEOFENCE", "KIOSK_PIN", "API_SYNC",
]);
export type WorkforceAttendanceSource = z.infer<typeof WorkforceAttendanceSourceEnum>;

export const WorkforceAttendanceStatusEnum = z.enum([
  "CHECKED_IN", "CHECKED_OUT", "ON_BREAK", "MISSING_CHECKOUT", "EXCUSED", "ABSENT", "LATE",
]);
export type WorkforceAttendanceStatus = z.infer<typeof WorkforceAttendanceStatusEnum>;

export const WorkforceTimesheetStatusEnum = z.enum([
  "DRAFT", "SUBMITTED", "REVIEWED", "APPROVED", "LOCKED", "REJECTED",
]);
export type WorkforceTimesheetStatus = z.infer<typeof WorkforceTimesheetStatusEnum>;

export const WorkforceLeaveTypeEnum = z.enum([
  "ANNUAL", "SICK", "MATERNITY", "PATERNITY", "UNPAID", "STUDY", "COMPASSIONATE", "PUBLIC_HOLIDAY",
]);
export type WorkforceLeaveType = z.infer<typeof WorkforceLeaveTypeEnum>;

export const WorkforceLeaveStatusEnum = z.enum([
  "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CANCELLED",
]);
export type WorkforceLeaveStatus = z.infer<typeof WorkforceLeaveStatusEnum>;

export const WorkforceTaskStateEnum = z.enum([
  "ASSIGNED", "ACCEPTED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "CLOSED",
]);
export type WorkforceTaskState = z.infer<typeof WorkforceTaskStateEnum>;

export const WorkforceSkillLevelEnum = z.enum([
  "BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT", "MASTER",
]);
export type WorkforceSkillLevel = z.infer<typeof WorkforceSkillLevelEnum>;

export const WorkforceExpenseStatusEnum = z.enum([
  "DRAFT", "SUBMITTED", "APPROVED", "PAID", "REJECTED",
]);
export type WorkforceExpenseStatus = z.infer<typeof WorkforceExpenseStatusEnum>;

export const WorkforceIndustryTypeEnum = z.enum([
  "RESTAURANT", "PHARMACY", "LAW_FIRM", "FLEET", "CONSTRUCTION",
  "TELECOM", "RETAIL", "WHOLESALE", "GARAGE", "HARDWARE",
  "ELECTRONICS", "REAL_ESTATE", "MICROFINANCE", "SACCO_VICOBA",
  "POULTRY_LIVESTOCK", "ENTERPRISE",
]);
export type WorkforceIndustryType = z.infer<typeof WorkforceIndustryTypeEnum>;

// ─── 2. Master Data Schemas ──────────────────────────────────

export const WorkforceDepartmentSchema = z.object({
  departmentId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  code: z.string(),
  name: z.string(),
  managerEmployeeId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceDepartment = z.infer<typeof WorkforceDepartmentSchema>;

export const WorkforcePositionSchema = z.object({
  positionId: z.string(),
  tenantId: z.string(),
  departmentId: z.string().optional(),
  title: z.string(),
  code: z.string(),
  applicationRoleId: z.string(), // Separation of Position Title from System RBAC Role
  minSkillRequirements: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforcePosition = z.infer<typeof WorkforcePositionSchema>;

export const WorkforceEmployeeSchema = z.object({
  employeeId: z.string(),
  tenantId: z.string(),
  userId: z.string().optional(), // Separate Identity: optional link to Platform User
  employeeCode: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  employmentType: WorkforceEmploymentTypeEnum,
  status: WorkforceEmployeeStatusEnum,
  countryId: z.string().default("TZ"),
  regionId: z.string().optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  positionTitle: z.string(),
  positionId: z.string().optional(),
  applicationRoleId: z.string().default("POS_OPERATOR"),
  managerEmployeeId: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  emergencyContact: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    relationship: z.string().optional(),
  }).optional(),
  hourlyRate: z.number().nonnegative().default(0),
  monthlySalary: z.number().nonnegative().default(0),
  currency: z.string().default("TZS"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceEmployee = z.infer<typeof WorkforceEmployeeSchema>;

// ─── 3. Scheduling & Shift Management Schemas ────────────────

export const WorkforceShiftSchema = z.object({
  shiftId: z.string(),
  tenantId: z.string(),
  branchId: z.string(),
  departmentId: z.string().optional(),
  employeeId: z.string(),
  roleTitle: z.string(),
  startTime: z.string(), // ISO date-time string
  endTime: z.string(),   // ISO date-time string
  breakMinutes: z.number().int().nonnegative().default(30),
  status: WorkforceShiftStatusEnum,
  isOvertime: z.boolean().default(false),
  assignedBy: z.string(),
  notes: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceShift = z.infer<typeof WorkforceShiftSchema>;

export const ShiftConflictReportSchema = z.object({
  hasConflict: z.boolean(),
  conflicts: z.array(z.object({
    type: z.enum(["DOUBLE_BOOKING", "LEAVE_OVERLAP", "INSUFFICIENT_REST", "MISSING_COVERAGE", "UNAVAILABLE"]),
    message: z.string(),
    conflictingShiftId: z.string().optional(),
    conflictingLeaveId: z.string().optional(),
  })),
});
export type ShiftConflictReport = z.infer<typeof ShiftConflictReportSchema>;

// ─── 4. Attendance & Time Tracking Schemas ───────────────────

export const WorkforceAttendanceSchema = z.object({
  attendanceId: z.string(),
  tenantId: z.string(),
  branchId: z.string(),
  employeeId: z.string(),
  shiftId: z.string().optional(),
  checkInTime: z.string(),
  checkOutTime: z.string().optional(),
  status: WorkforceAttendanceStatusEnum,
  source: WorkforceAttendanceSourceEnum,
  locationCoords: z.string().optional(), // lat,lng where permitted
  exceptions: z.array(z.string()).default([]),
  isCorrected: z.boolean().default(false),
  correctedBy: z.string().optional(),
  correctionReason: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceAttendance = z.infer<typeof WorkforceAttendanceSchema>;

export const WorkforceTimesheetSchema = z.object({
  timesheetId: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  regularHours: z.number().nonnegative().default(0),
  overtimeHours: z.number().nonnegative().default(0),
  billableHours: z.number().nonnegative().default(0),
  nonBillableHours: z.number().nonnegative().default(0),
  totalHours: z.number().nonnegative().default(0),
  status: WorkforceTimesheetStatusEnum,
  approvedBy: z.string().optional(),
  approvedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceTimesheet = z.infer<typeof WorkforceTimesheetSchema>;

// ─── 5. Leave & Task Schemas ─────────────────────────────────

export const WorkforceLeaveSchema = z.object({
  leaveId: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  leaveType: WorkforceLeaveTypeEnum,
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.number().positive(),
  status: WorkforceLeaveStatusEnum,
  approvalRef: z.string().optional(), // Integrated with Phase 34 Approvals
  reason: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceLeave = z.infer<typeof WorkforceLeaveSchema>;

export const WorkforceTaskSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  tenantId: z.string(),
  branchId: z.string().optional().nullable(),
  assignedEmployeeId: z.string().optional().nullable(),
  assignedTeam: z.string().optional().nullable(),
  title: z.string(),
  description: z.string().optional().nullable(),
  taskType: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  status: z.enum(["BACKLOG", "ASSIGNED", "IN_PROGRESS", "BLOCKED", "COMPLETED", "VERIFIED", "CANCELLED"]).default("ASSIGNED"),
  state: WorkforceTaskStateEnum.optional(),
  dueDate: z.string().optional().nullable(),
  estimatedHours: z.number().nonnegative().optional(),
  actualHours: z.number().nonnegative().optional(),
  checklist: z.array(z.object({ item: z.string(), done: z.boolean() })).optional(),
  attachments: z.array(z.string()).optional(),
  relatedEntityType: z.string().optional().nullable(),
  relatedEntityId: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  verifiedById: z.string().optional().nullable(),
  verifiedBy: z.string().optional().nullable(),
  verifiedAt: z.string().optional().nullable(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});
export type WorkforceTask = z.infer<typeof WorkforceTaskSchema>;

// ─── 6. Skills, Training & Certifications ─────────────────────

export const WorkforceSkillSchema = z.object({
  skillId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  category: z.string(),
  level: WorkforceSkillLevelEnum.default("BEGINNER"),
  createdAt: z.string(),
});
export type WorkforceSkill = z.infer<typeof WorkforceSkillSchema>;

export const WorkforceCertificationSchema = z.object({
  certId: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  title: z.string(),
  issuingBody: z.string(),
  issuedDate: z.string(),
  expiryDate: z.string(),
  status: z.enum(["ACTIVE", "EXPIRING_SOON", "EXPIRED"]).default("ACTIVE"),
  documentRef: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceCertification = z.infer<typeof WorkforceCertificationSchema>;

// ─── 7. Expenses, Payroll & Finance Bridge Schemas ───────────

export const WorkforceExpenseSchema = z.object({
  expenseId: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  category: z.string(), // Travel, Fuel, Accommodation, Meals, Field, Purchases
  amount: z.number().positive(),
  currency: z.string().default("TZS"),
  description: z.string(),
  receiptRef: z.string().optional(),
  status: WorkforceExpenseStatusEnum,
  approvalRef: z.string().optional(), // Integrated with Phase 34 Approvals
  postedToFinance: z.boolean().default(false),
  financeJournalRef: z.string().optional(), // Integrated with Phase 35 Treasury / GL
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkforceExpense = z.infer<typeof WorkforceExpenseSchema>;

export const WorkforcePayrollInputSchema = z.object({
  payrollInputId: z.string(),
  tenantId: z.string(),
  employeeId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  regularHours: z.number().nonnegative(),
  overtimeHours: z.number().nonnegative(),
  leaveDaysPaid: z.number().nonnegative(),
  leaveDaysUnpaid: z.number().nonnegative(),
  approvedAllowances: z.number().nonnegative().default(0),
  approvedDeductions: z.number().nonnegative().default(0),
  currency: z.string().default("TZS"),
  isLocked: z.boolean().default(false),
  generatedAt: z.string(),
});
export type WorkforcePayrollInput = z.infer<typeof WorkforcePayrollInputSchema>;

// ─── 8. Industry Profile & Analytics Schemas ──────────────────

export const IndustryWorkforceProfileSchema = z.object({
  profileId: z.string(),
  tenantId: z.string(),
  industryType: WorkforceIndustryTypeEnum,
  customRoleTitles: z.array(z.string()),
  credentialRequirements: z.array(z.string()).default([]),
  specialRules: z.record(z.any()).default({}),
  createdAt: z.string(),
});
export type IndustryWorkforceProfile = z.infer<typeof IndustryWorkforceProfileSchema>;

export const WorkforceAnalyticsMetricsSchema = z.object({
  tenantId: z.string(),
  calculatedAt: z.string(),
  totalHeadcount: z.number().int().nonnegative(),
  activeHeadcount: z.number().int().nonnegative(),
  onLeaveHeadcount: z.number().int().nonnegative(),
  attendanceRatePct: z.number().min(0).max(100),
  scheduleAdherencePct: z.number().min(0).max(100),
  overtimeRatePct: z.number().min(0).max(100),
  totalLaborCost: z.number().nonnegative(),
  totalBillableHours: z.number().nonnegative(),
  billableRatioPct: z.number().min(0).max(100),
  certificationCompliancePct: z.number().min(0).max(100),
  taskCompletionRatePct: z.number().min(0).max(100),
  turnoverRatePct: z.number().min(0).max(100),
});
export type WorkforceAnalyticsMetrics = z.infer<typeof WorkforceAnalyticsMetricsSchema>;

export const WorkforceHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  activeEmployees: z.number().int().nonnegative(),
  scheduledShiftsToday: z.number().int().nonnegative(),
  checkedInToday: z.number().int().nonnegative(),
  missingCheckoutsCount: z.number().int().nonnegative(),
  pendingLeaveRequests: z.number().int().nonnegative(),
  expiringCertifications30Days: z.number().int().nonnegative(),
  openTasksCount: z.number().int().nonnegative(),
  unapprovedOvertimeHours: z.number().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type WorkforceHealthSummary = z.infer<typeof WorkforceHealthSummarySchema>;

export const WorkforceAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_ONBOARDED", "EMPLOYEE_OFFBOARDED",
    "STATUS_CHANGED", "SHIFT_CREATED", "SHIFT_PUBLISHED", "SHIFT_SWAPPED",
    "CHECK_IN", "CHECK_OUT", "ATTENDANCE_CORRECTED", "TIMESHEET_SUBMITTED",
    "TIMESHEET_APPROVED", "TIMESHEET_LOCKED", "LEAVE_REQUESTED", "LEAVE_APPROVED",
    "TASK_ASSIGNED", "TASK_COMPLETED", "EXPENSE_APPROVED", "PAYROLL_INPUT_GENERATED",
    "AI_SCHEDULE_RECOMMENDED", "CERTIFICATION_EXPIRED_ALERT",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type WorkforceAuditEntry = z.infer<typeof WorkforceAuditEntrySchema>;
