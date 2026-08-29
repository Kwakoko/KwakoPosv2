export type IncidentSeverity = "INFO" | "WARNING" | "CRITICAL";
export type IncidentStatus = "DETECTED" | "INVESTIGATING" | "MITIGATING" | "MONITORING" | "RESOLVED";
export interface IncidentTimelineEntry {
    timestamp: string;
    status: IncidentStatus;
    note: string;
    actor: string;
}
export interface IncidentRecord {
    id: string;
    title: string;
    description: string;
    severity: IncidentSeverity;
    status: IncidentStatus;
    tenantId?: string;
    branchId?: string;
    service: string;
    rootCause?: string;
    mitigation?: string;
    affectedOperationIds?: string[];
    metadata?: Record<string, unknown>;
    timeline: IncidentTimelineEntry[];
    startedAt: string;
    resolvedAt?: string;
}
export type AlertHandler = (incident: IncidentRecord) => Promise<void> | void;
export declare class IncidentEngine {
    private incidents;
    private alertHandlers;
    registerAlertHandler(handler: AlertHandler): void;
    createIncident(params: {
        title: string;
        description: string;
        severity: IncidentSeverity;
        tenantId?: string;
        branchId?: string;
        service?: string;
        affectedOperationIds?: string[];
        metadata?: Record<string, unknown>;
    }): Promise<IncidentRecord>;
    updateIncidentStatus(incidentId: string, status: IncidentStatus, note: string, actor?: string, mitigation?: string, rootCause?: string): IncidentRecord | null;
    resolveIncident(incidentId: string, resolutionNote: string, actor?: string): IncidentRecord | null;
    getIncident(id: string): IncidentRecord | null;
    getActiveIncidents(tenantId?: string): IncidentRecord[];
    searchIncidents(filters: {
        tenantId?: string;
        status?: IncidentStatus;
        severity?: IncidentSeverity;
        limit?: number;
    }): IncidentRecord[];
    getAllIncidents(limit?: number): IncidentRecord[];
    clear(): void;
}
export declare const globalIncidentEngine: IncidentEngine;
//# sourceMappingURL=incidentEngine.d.ts.map