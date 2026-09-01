import {
  NotificationMessageRecord, NotificationHealthSummary, NotificationAuditEntry,
  NotificationChannelType, NotificationPriority,
} from "@kwakopos2/contracts";

export class NotificationEngine {
  private messages: Map<string, NotificationMessageRecord> = new Map();
  private optOuts: Set<string> = new Set();
  private auditLedger: NotificationAuditEntry[] = [];

  public sendNotification(params: Omit<NotificationMessageRecord, "createdAt" | "status" | "retryCount" | "priority"> & {
    priority?: NotificationPriority;
  }): {
    success: boolean; message?: NotificationMessageRecord; error?: string;
  } {
    if (!params.messageId || !params.tenantId || !params.recipient || !params.body) {
      return { success: false, error: "messageId, tenantId, recipient, and body are required" };
    }

    const optOutKey = `${params.tenantId}:${params.channel}:${params.recipient}`;
    if (this.optOuts.has(optOutKey)) {
      this._writeAudit(params.tenantId, "NOTIFICATION_BLOCKED", "SYSTEM", params.messageId,
        `Notification blocked due to recipient opt-out (${params.channel}: ${params.recipient})`);
      return { success: false, error: "Recipient has opted out of communication" };
    }

    const now = new Date().toISOString();
    const message: NotificationMessageRecord = {
      ...params,
      priority: params.priority ?? "NORMAL",
      status: "DELIVERED",
      retryCount: 0,
      sentAt: now,
      deliveredAt: now,
      createdAt: now,
    };

    this.messages.set(params.messageId, message);
    this._writeAudit(params.tenantId, "NOTIFICATION_DELIVERED", "SYSTEM", params.messageId,
      `Notification delivered via ${params.channel} to ${params.recipient}`);

    return { success: true, message };
  }

  public registerOptOut(tenantId: string, channel: NotificationChannelType, recipient: string): { success: boolean } {
    this.optOuts.add(`${tenantId}:${channel}:${recipient}`);
    return { success: true };
  }

  public getHealthSummary(tenantId: string): NotificationHealthSummary {
    const list = Array.from(this.messages.values()).filter(m => m.tenantId === tenantId);
    const delivered = list.filter(m => m.status === "DELIVERED").length;
    const failed = list.filter(m => m.status === "FAILED").length;
    const blockedCount = this.auditLedger.filter(a => a.tenantId === tenantId && a.eventType === "NOTIFICATION_BLOCKED").length;

    return {
      tenantId,
      engineOperational: true,
      totalDispatchedCount: list.length,
      deliveredCount: delivered,
      failedCount: failed,
      blockedConsentCount: blockedCount,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): NotificationAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: NotificationAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenantId,
      eventType,
      actorId,
      targetEntityId,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
