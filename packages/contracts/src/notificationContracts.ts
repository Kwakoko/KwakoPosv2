import { z } from "zod";

// ============================================================
// Phase 42 — KwakoPos Notification Contracts (KNCOL v1.0.0)
// ============================================================

export const NotificationChannelTypeEnum = z.enum(["SMS", "EMAIL", "PUSH", "WHATSAPP", "IN_APP"]);
export type NotificationChannelType = z.infer<typeof NotificationChannelTypeEnum>;

export const NotificationPriorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type NotificationPriority = z.infer<typeof NotificationPriorityEnum>;

export const NotificationDispatchStatusEnum = z.enum(["QUEUED", "SENT", "DELIVERED", "FAILED", "BLOCKED"]);
export type NotificationDispatchStatus = z.infer<typeof NotificationDispatchStatusEnum>;

export const NotificationMessageRecordSchema = z.object({
  messageId: z.string(),
  tenantId: z.string(),
  channel: NotificationChannelTypeEnum,
  recipient: z.string(),
  subject: z.string().optional(),
  body: z.string(),
  priority: NotificationPriorityEnum.default("NORMAL"),
  status: NotificationDispatchStatusEnum.default("QUEUED"),
  errorMessage: z.string().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  sentAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  createdAt: z.string(),
});
export type NotificationMessageRecord = z.infer<typeof NotificationMessageRecordSchema>;

export const NotificationHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  totalDispatchedCount: z.number().int().nonnegative(),
  deliveredCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  blockedConsentCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type NotificationHealthSummary = z.infer<typeof NotificationHealthSummarySchema>;

export const NotificationAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "NOTIFICATION_QUEUED", "NOTIFICATION_SENT", "NOTIFICATION_DELIVERED",
    "NOTIFICATION_FAILED", "NOTIFICATION_BLOCKED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type NotificationAuditEntry = z.infer<typeof NotificationAuditEntrySchema>;
