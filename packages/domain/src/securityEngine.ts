import {
  SecurityPolicy, ThreatEvent, SecurityHealthSummary, SecurityAuditEntry,
  ThreatType, SecurityRiskLevel,
} from "@kwakopos2/contracts";

export class SecurityEngine {
  private policies: Map<string, SecurityPolicy> = new Map();
  private threats: Map<string, ThreatEvent> = new Map();
  private blockedIps: Set<string> = new Set();
  private auditLedger: SecurityAuditEntry[] = [];

  public configurePolicy(params: Omit<SecurityPolicy, "createdAt" | "updatedAt">): {
    success: boolean; policy?: SecurityPolicy;
  } {
    const now = new Date().toISOString();
    const policy: SecurityPolicy = {
      ...params,
      createdAt: now,
      updatedAt: now,
    };
    this.policies.set(params.policyId, policy);
    this._writeAudit(params.tenantId, "POLICY_UPDATED", "SYSTEM", params.policyId, `Security policy updated: ${params.policyName}`);
    return { success: true, policy };
  }

  public logThreatEvent(params: Omit<ThreatEvent, "detectedAt" | "isMitigated">): {
    success: boolean; event?: ThreatEvent;
  } {
    const now = new Date().toISOString();
    const event: ThreatEvent = {
      ...params,
      isMitigated: false,
      detectedAt: now,
    };
    this.threats.set(params.eventId, event);
    this._writeAudit(params.tenantId, "THREAT_DETECTED", "SYSTEM", params.eventId,
      `Threat detected: ${params.threatType} (${params.riskLevel}) from ${params.sourceIp}`);
    return { success: true, event };
  }

  public mitigateThreat(eventId: string, actorId: string): { success: boolean; event?: ThreatEvent } {
    const threat = this.threats.get(eventId);
    if (!threat) return { success: false };
    threat.isMitigated = true;
    this._writeAudit(threat.tenantId, "THREAT_MITIGATED", actorId, eventId, `Threat mitigated`);
    return { success: true, event: threat };
  }

  public blockIp(tenantId: string, ipAddress: string, actorId: string): { success: boolean } {
    this.blockedIps.add(`${tenantId}:${ipAddress}`);
    this._writeAudit(tenantId, "IP_BLOCKED", actorId, ipAddress, `IP blocked: ${ipAddress}`);
    return { success: true };
  }

  public isIpBlocked(tenantId: string, ipAddress: string): boolean {
    return this.blockedIps.has(`${tenantId}:${ipAddress}`);
  }

  public getHealthSummary(tenantId: string): SecurityHealthSummary {
    const pList = Array.from(this.policies.values()).filter(p => p.tenantId === tenantId);
    const tList = Array.from(this.threats.values()).filter(t => t.tenantId === tenantId);
    const unmitigated = tList.filter(t => !t.isMitigated);
    const highRisk = unmitigated.filter(t => t.riskLevel === "HIGH" || t.riskLevel === "CRITICAL").length;

    return {
      tenantId,
      engineOperational: true,
      activePoliciesCount: pList.length,
      detectedThreatsCount: tList.length,
      unmitigatedThreatsCount: unmitigated.length,
      highRiskCount: highRisk,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): SecurityAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: SecurityAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
