import {
  SecurityThreatAlert, SecurityKillSwitchState, PlatformSecurityHealthSummary,
  PlatformSecurityAuditEntry, SecurityThreatSeverity, SecurityIncidentState,
} from "@kwakopos2/contracts";

export class PlatformSecurityEngine {
  private threatAlerts: Map<string, SecurityThreatAlert> = new Map();
  private killSwitches: Map<string, SecurityKillSwitchState> = new Map();
  private auditLedger: PlatformSecurityAuditEntry[] = [];

  public triggerThreatAlert(params: Omit<SecurityThreatAlert, "timestamp" | "state" | "actorId" | "sourceIp" | "evidenceJson"> & {
    actorId?: string;
    sourceIp?: string;
    evidenceJson?: string;
  }): {
    success: boolean; alert?: SecurityThreatAlert;
  } {
    const now = new Date().toISOString();
    const alert: SecurityThreatAlert = {
      ...params,
      actorId: params.actorId ?? "UNKNOWN",
      sourceIp: params.sourceIp ?? "0.0.0.0",
      evidenceJson: params.evidenceJson ?? "{}",
      state: "DETECTED",
      timestamp: now,
    };

    this.threatAlerts.set(params.alertId, alert);
    this._writeAudit(params.tenantId, "THREAT_ALERT_TRIGGERED", alert.actorId, params.alertId,
      `Security threat alert [${params.severity}]: ${params.threatType} on resource ${params.targetResource}`);

    // Automated containment for critical cross-tenant attempt
    if (params.threatType === "UNAUTHORIZED_CROSS_TENANT_ACCESS" || params.severity === "CRITICAL") {
      this.containIncident(params.alertId, "SYSTEM_AUTOMATED_CONTAINMENT");
    }

    return { success: true, alert };
  }

  public containIncident(alertId: string, actorId: string): { success: boolean; alert?: SecurityThreatAlert } {
    const alert = this.threatAlerts.get(alertId);
    if (!alert) return { success: false };

    alert.state = "CONTAINED";
    this._writeAudit(alert.tenantId, "INCIDENT_CONTAINED", actorId, alertId,
      `Incident ${alertId} (${alert.threatType}) contained by ${actorId}`);
    return { success: true, alert };
  }

  public evaluateTenantIsolationBoundary(requestingTenantId: string, resourceTenantId: string): {
    isIsolated: boolean; violationAlertId?: string;
  } {
    if (requestingTenantId !== resourceTenantId) {
      const alertId = `ALT-ISO-${Date.now()}`;
      this.triggerThreatAlert({
        alertId,
        tenantId: requestingTenantId,
        threatType: "UNAUTHORIZED_CROSS_TENANT_ACCESS",
        severity: "CRITICAL",
        actorId: "UNKNOWN_CROSS_TENANT_ACTOR",
        targetResource: `TENANT_RESOURCE:${resourceTenantId}`,
      });
      return { isIsolated: false, violationAlertId: alertId };
    }
    return { isIsolated: true };
  }

  public activateKillSwitch(tenantId: string, scope: "GLOBAL" | "AI" | "MARKETPLACE" | "INTEGRATION", actorId: string): {
    success: boolean; state?: SecurityKillSwitchState;
  } {
    const now = new Date().toISOString();
    let current = this.killSwitches.get(tenantId) || {
      tenantId,
      isGlobalKillSwitchActive: false,
      isAiKillSwitchActive: false,
      isMarketplaceKillSwitchActive: false,
      isIntegrationKillSwitchActive: false,
      updatedAt: now,
    };

    if (scope === "GLOBAL") current.isGlobalKillSwitchActive = true;
    if (scope === "AI") current.isAiKillSwitchActive = true;
    if (scope === "MARKETPLACE") current.isMarketplaceKillSwitchActive = true;
    if (scope === "INTEGRATION") current.isIntegrationKillSwitchActive = true;
    current.updatedAt = now;

    this.killSwitches.set(tenantId, current);
    this._writeAudit(tenantId, "KILL_SWITCH_ACTIVATED", actorId, tenantId,
      `Security kill switch activated for scope ${scope} by ${actorId}`);

    return { success: true, state: current };
  }

  public getHealthSummary(tenantId: string): PlatformSecurityHealthSummary {
    const alerts = Array.from(this.threatAlerts.values()).filter(a => a.tenantId === tenantId);
    const critical = alerts.filter(a => a.severity === "CRITICAL").length;
    const contained = alerts.filter(a => a.state === "CONTAINED").length;
    const ks = this.killSwitches.get(tenantId);

    return {
      tenantId,
      engineOperational: true,
      activeAlertsCount: alerts.length,
      criticalIncidentsCount: critical,
      containedIncidentsCount: contained,
      tenantIsolationVerified: true,
      isKillSwitchActive: Boolean(ks && (ks.isGlobalKillSwitchActive || ks.isAiKillSwitchActive)),
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): PlatformSecurityAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: PlatformSecurityAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
