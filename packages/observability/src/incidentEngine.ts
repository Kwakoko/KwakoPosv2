import { randomBytes } from "crypto";

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

export class IncidentEngine {
  private incidents = new Map<string, IncidentRecord>();
  private alertHandlers: AlertHandler[] = [];

  registerAlertHandler(handler: AlertHandler) {
    this.alertHandlers.push(handler);
  }

  async createIncident(params: {
    title: string;
    description: string;
    severity: IncidentSeverity;
    tenantId?: string;
    branchId?: string;
    service?: string;
    affectedOperationIds?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<IncidentRecord> {
    const id = `INC-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const now = new Date().toISOString();

    const incident: IncidentRecord = {
      id,
      title: params.title,
      description: params.description,
      severity: params.severity,
      status: "DETECTED",
      tenantId: params.tenantId,
      branchId: params.branchId,
      service: params.service || "kwakopos-platform",
      affectedOperationIds: params.affectedOperationIds || [],
      metadata: params.metadata,
      timeline: [
        {
          timestamp: now,
          status: "DETECTED",
          note: "Incident automatically created by anomaly detection engine.",
          actor: "system-observability",
        },
      ],
      startedAt: now,
    };

    this.incidents.set(id, incident);

    for (const handler of this.alertHandlers) {
      try {
        await handler(incident);
      } catch (err) {
        console.error(`[INCIDENT ALERT FAILED] Error notifying handler for ${id}:`, err);
      }
    }

    return incident;
  }

  updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus,
    note: string,
    actor = "system-operator",
    mitigation?: string,
    rootCause?: string
  ): IncidentRecord | null {
    const inc = this.incidents.get(incidentId);
    if (!inc) return null;

    inc.status = status;
    if (mitigation) inc.mitigation = mitigation;
    if (rootCause) inc.rootCause = rootCause;
    if (status === "RESOLVED") inc.resolvedAt = new Date().toISOString();

    inc.timeline.push({
      timestamp: new Date().toISOString(),
      status,
      note,
      actor,
    });

    return inc;
  }

  resolveIncident(incidentId: string, resolutionNote: string, actor = "system-operator"): IncidentRecord | null {
    return this.updateIncidentStatus(incidentId, "RESOLVED", resolutionNote, actor);
  }

  getIncident(id: string): IncidentRecord | null {
    return this.incidents.get(id) || null;
  }

  getActiveIncidents(tenantId?: string): IncidentRecord[] {
    return Array.from(this.incidents.values()).filter(
      (inc) => inc.status !== "RESOLVED" && (!tenantId || inc.tenantId === tenantId)
    );
  }

  searchIncidents(filters: {
    tenantId?: string;
    status?: IncidentStatus;
    severity?: IncidentSeverity;
    limit?: number;
  }): IncidentRecord[] {
    return Array.from(this.incidents.values())
      .filter((inc) => {
        if (filters.tenantId && inc.tenantId !== filters.tenantId) return false;
        if (filters.status && inc.status !== filters.status) return false;
        if (filters.severity && inc.severity !== filters.severity) return false;
        return true;
      })
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, filters.limit || 100);
  }

  getAllIncidents(limit = 100): IncidentRecord[] {
    return Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, limit);
  }

  clear() {
    this.incidents.clear();
  }
}

export const globalIncidentEngine = new IncidentEngine();