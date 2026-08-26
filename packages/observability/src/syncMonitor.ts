import { globalIncidentEngine } from "./incidentEngine.js";

export interface SyncOperationEvent {
  tenantId: string;
  branchId: string;
  deviceId: string;
  operationId: string;
  entityType: string;
  status: "SUCCESS" | "FAILED" | "CONFLICT" | "DUPLICATE_SUPPRESSED";
  durationMs: number;
  errorReason?: string;
  timestamp: number;
}

export interface SyncHealthSummary {
  totalPushed: number;
  totalSuccess: number;
  totalFailed: number;
  totalConflicts: number;
  totalDuplicatesSuppressed: number;
  failureRate: number;
  conflictRate: number;
  p95SyncLatencyMs: number;
  oldestPendingOutboxAgeMinutes: number;
  healthStatus: "HEALTHY" | "WARNING" | "CRITICAL";
}

export class SyncHealthMonitor {
  private events: SyncOperationEvent[] = [];
  private deadLetters: Array<{ tenantId: string; operationId: string; reason: string; timestamp: string }> = [];
  private oldestPendingTimestamp = Date.now();
  private maxHistory = 10000;

  recordSyncEvent(event: SyncOperationEvent) {
    this.events.push(event);
    if (this.events.length > this.maxHistory) {
      this.events.shift();
    }

    if (event.status === "FAILED") {
      this.recordDeadLetter(event.tenantId, event.operationId, event.errorReason || "Unknown sync failure");
    }
  }

  recordDeadLetter(tenantId: string, operationId: string, reason: string) {
    this.deadLetters.push({
      tenantId,
      operationId,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  updateOldestPendingOutbox(oldestTimestamp: number) {
    this.oldestPendingTimestamp = oldestTimestamp;
  }

  getSummary(sinceMs = 900000): SyncHealthSummary {
    const cutoff = Date.now() - sinceMs;
    const recent = this.events.filter((e) => e.timestamp >= cutoff);

    if (recent.length === 0) {
      return {
        totalPushed: 0,
        totalSuccess: 0,
        totalFailed: 0,
        totalConflicts: 0,
        totalDuplicatesSuppressed: 0,
        failureRate: 0,
        conflictRate: 0,
        p95SyncLatencyMs: 0,
        oldestPendingOutboxAgeMinutes: 0,
        healthStatus: "HEALTHY",
      };
    }

    let totalSuccess = 0;
    let totalFailed = 0;
    let totalConflicts = 0;
    let totalDuplicatesSuppressed = 0;
    const latencies: number[] = [];

    for (const ev of recent) {
      latencies.push(ev.durationMs);
      if (ev.status === "SUCCESS") totalSuccess++;
      else if (ev.status === "FAILED") totalFailed++;
      else if (ev.status === "CONFLICT") totalConflicts++;
      else if (ev.status === "DUPLICATE_SUPPRESSED") totalDuplicatesSuppressed++;
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;

    const failureRate = Number(((totalFailed / recent.length) * 100).toFixed(2));
    const conflictRate = Number(((totalConflicts / recent.length) * 100).toFixed(2));
    const oldestPendingOutboxAgeMinutes = Math.max(0, Math.floor((Date.now() - this.oldestPendingTimestamp) / 60000));

    let healthStatus: "HEALTHY" | "WARNING" | "CRITICAL" = "HEALTHY";
    if (failureRate > 5 || oldestPendingOutboxAgeMinutes > 15 || totalConflicts > 10) {
      healthStatus = "CRITICAL";
    } else if (failureRate > 1 || oldestPendingOutboxAgeMinutes > 5 || totalConflicts > 0) {
      healthStatus = "WARNING";
    }

    return {
      totalPushed: recent.length,
      totalSuccess,
      totalFailed,
      totalConflicts,
      totalDuplicatesSuppressed,
      failureRate,
      conflictRate,
      p95SyncLatencyMs: p95,
      oldestPendingOutboxAgeMinutes,
      healthStatus,
    };
  }

  getDeadLetters(tenantId?: string) {
    return this.deadLetters.filter((d) => !tenantId || d.tenantId === tenantId);
  }

  clear() {
    this.events = [];
    this.deadLetters = [];
    this.oldestPendingTimestamp = Date.now();
  }
}

export const globalSyncMonitor = new SyncHealthMonitor();