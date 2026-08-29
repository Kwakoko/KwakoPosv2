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
export declare class SyncHealthMonitor {
    private events;
    private deadLetters;
    private oldestPendingTimestamp;
    private maxHistory;
    recordSyncEvent(event: SyncOperationEvent): void;
    recordDeadLetter(tenantId: string, operationId: string, reason: string): void;
    updateOldestPendingOutbox(oldestTimestamp: number): void;
    getSummary(sinceMs?: number): SyncHealthSummary;
    getDeadLetters(tenantId?: string): {
        tenantId: string;
        operationId: string;
        reason: string;
        timestamp: string;
    }[];
    clear(): void;
}
export declare const globalSyncMonitor: SyncHealthMonitor;
//# sourceMappingURL=syncMonitor.d.ts.map