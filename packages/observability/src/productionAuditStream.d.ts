export type AuditEventType = "RELEASE_CREATED" | "CANDIDATE_DEPLOYED" | "CERTIFICATION_COMPLETED" | "TRAFFIC_PROMOTED" | "CANARY_STAGE_ADVANCED" | "ROLLBACK_TRIGGERED" | "ROLLBACK_COMPLETED" | "PRODUCTION_FREEZE_CHANGED" | "FEATURE_FLAG_UPDATED" | "CONFIG_CHANGED" | "INCIDENT_OPENED" | "INCIDENT_RESOLVED" | "INVENTORY_RECONCILIATION_RUN" | "BACKUP_VERIFICATION_RUN";
export interface OperationalAuditEvent {
    eventId: string;
    eventType: AuditEventType;
    timestamp: string;
    actor: {
        userId?: string;
        email?: string;
        role?: string;
        systemProcess?: string;
    };
    releaseContext: {
        appVersion: string;
        gitSha?: string;
        cloudRunRevision?: string;
        environment: string;
    };
    details: Record<string, any>;
    beforeValue?: any;
    afterValue?: any;
}
export declare class ProductionAuditStream {
    private static events;
    static record(event: Omit<OperationalAuditEvent, "eventId" | "timestamp">): OperationalAuditEvent;
    static getRecentEvents(limit?: number): OperationalAuditEvent[];
    static filterEvents(criteria: {
        eventType?: AuditEventType;
        appVersion?: string;
        actorEmail?: string;
        limit?: number;
    }): OperationalAuditEvent[];
}
//# sourceMappingURL=productionAuditStream.d.ts.map