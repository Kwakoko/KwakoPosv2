"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalIncidentEngine = exports.IncidentEngine = void 0;
const crypto_1 = require("crypto");
class IncidentEngine {
    incidents = new Map();
    alertHandlers = [];
    registerAlertHandler(handler) {
        this.alertHandlers.push(handler);
    }
    async createIncident(params) {
        const id = `INC-${Date.now()}-${(0, crypto_1.randomBytes)(4).toString("hex").toUpperCase()}`;
        const now = new Date().toISOString();
        const incident = {
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
            }
            catch (err) {
                console.error(`[INCIDENT ALERT FAILED] Error notifying handler for ${id}:`, err);
            }
        }
        return incident;
    }
    updateIncidentStatus(incidentId, status, note, actor = "system-operator", mitigation, rootCause) {
        const inc = this.incidents.get(incidentId);
        if (!inc)
            return null;
        inc.status = status;
        if (mitigation)
            inc.mitigation = mitigation;
        if (rootCause)
            inc.rootCause = rootCause;
        if (status === "RESOLVED")
            inc.resolvedAt = new Date().toISOString();
        inc.timeline.push({
            timestamp: new Date().toISOString(),
            status,
            note,
            actor,
        });
        return inc;
    }
    resolveIncident(incidentId, resolutionNote, actor = "system-operator") {
        return this.updateIncidentStatus(incidentId, "RESOLVED", resolutionNote, actor);
    }
    getIncident(id) {
        return this.incidents.get(id) || null;
    }
    getActiveIncidents(tenantId) {
        return Array.from(this.incidents.values()).filter((inc) => inc.status !== "RESOLVED" && (!tenantId || inc.tenantId === tenantId));
    }
    searchIncidents(filters) {
        return Array.from(this.incidents.values())
            .filter((inc) => {
            if (filters.tenantId && inc.tenantId !== filters.tenantId)
                return false;
            if (filters.status && inc.status !== filters.status)
                return false;
            if (filters.severity && inc.severity !== filters.severity)
                return false;
            return true;
        })
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, filters.limit || 100);
    }
    getAllIncidents(limit = 100) {
        return Array.from(this.incidents.values())
            .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
            .slice(0, limit);
    }
    clear() {
        this.incidents.clear();
    }
}
exports.IncidentEngine = IncidentEngine;
exports.globalIncidentEngine = new IncidentEngine();
//# sourceMappingURL=incidentEngine.js.map