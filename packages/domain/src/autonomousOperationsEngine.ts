import {
  AutonomousAgentCapability, AutonomousActionRequest, AutonomousOperationsHealthSummary,
  AutonomousOperationsAuditEntry, AutonomyMaturityLevel, AutonomyRiskClass,
} from "@kwakopos2/contracts";

export class AutonomousOperationsEngine {
  private agentCapabilities: Map<string, AutonomousAgentCapability> = new Map();
  private actionRequests: Map<string, AutonomousActionRequest> = new Map();
  private auditLedger: AutonomousOperationsAuditEntry[] = [];

  public registerAgentCapability(params: Omit<AutonomousAgentCapability, "createdAt" | "financialLimitTzs" | "rateLimitPerMin" | "isCertified" | "killSwitchActive"> & {
    financialLimitTzs?: number;
    rateLimitPerMin?: number;
    isCertified?: boolean;
    killSwitchActive?: boolean;
  }): {
    success: boolean; capability?: AutonomousAgentCapability;
  } {
    const now = new Date().toISOString();
    const cap: AutonomousAgentCapability = {
      ...params,
      financialLimitTzs: params.financialLimitTzs ?? 500000,
      rateLimitPerMin: params.rateLimitPerMin ?? 60,
      isCertified: params.isCertified ?? true,
      killSwitchActive: params.killSwitchActive ?? false,
      createdAt: now,
    };

    const key = `${params.tenantId}:${params.agentId}`;
    this.agentCapabilities.set(key, cap);
    this._writeAudit(params.tenantId, "CAPABILITY_REGISTERED", "SYSTEM", params.agentId,
      `Registered agent ${params.agentRole} at Autonomy Level ${params.autonomyLevel} (${params.riskClass} risk)`);

    return { success: true, capability: cap };
  }

  public executeAutonomousRequest(params: Omit<AutonomousActionRequest, "timestamp" | "state" | "verificationStatus" | "contextJson" | "financialCostTzs"> & {
    contextJson?: string;
    financialCostTzs?: number;
  }): {
    success: boolean; request?: AutonomousActionRequest; reason?: string;
  } {
    const now = new Date().toISOString();
    const key = `${params.tenantId}:${params.agentId}`;
    const agent = this.agentCapabilities.get(key);

    if (!agent) {
      return { success: false, reason: "Agent capability not registered" };
    }

    if (agent.killSwitchActive) {
      this._writeAudit(params.tenantId, "HUMAN_ESCALATION_TRIGGERED", params.agentId, params.requestId, "Blocked: Agent Kill Switch active");
      return { success: false, reason: "Blocked: Agent Kill Switch active" };
    }

    const cost = params.financialCostTzs ?? 0;
    if (cost > agent.financialLimitTzs) {
      // Escalate to human
      const escalatedRequest: AutonomousActionRequest = {
        ...params,
        contextJson: params.contextJson ?? "{}",
        financialCostTzs: cost,
        state: "ESCALATED",
        verificationStatus: "UNVERIFIED",
        timestamp: now,
      };
      this.actionRequests.set(params.requestId, escalatedRequest);
      this._writeAudit(params.tenantId, "HUMAN_ESCALATION_TRIGGERED", params.agentId, params.requestId,
        `Cost TZS ${cost} exceeds limit TZS ${agent.financialLimitTzs} -> Escalated to human`);
      return { success: true, request: escalatedRequest, reason: "Escalated to human due to financial limit" };
    }

    // Authorized & Executed
    const request: AutonomousActionRequest = {
      ...params,
      contextJson: params.contextJson ?? "{}",
      financialCostTzs: cost,
      state: "AUTHORIZED",
      verificationStatus: "UNVERIFIED",
      timestamp: now,
    };

    this.actionRequests.set(params.requestId, request);
    this._writeAudit(params.tenantId, "REQUEST_AUTHORIZED", params.agentId, params.requestId,
      `Autonomous action ${params.capability} authorized for execution`);

    return { success: true, request };
  }

  public verifyActionResult(requestId: string, isSuccessful: boolean): { success: boolean; request?: AutonomousActionRequest } {
    const req = this.actionRequests.get(requestId);
    if (!req) return { success: false };

    req.verificationStatus = isSuccessful ? "PASSED" : "FAILED";
    req.state = isSuccessful ? "VERIFIED" : "FAILED";

    this._writeAudit(req.tenantId, "REQUEST_VERIFIED", req.agentId, requestId,
      `Autonomous action ${requestId} verification status: ${req.verificationStatus}`);
    return { success: true, request: req };
  }

  public activateAgentKillSwitch(tenantId: string, agentId: string, actorId: string): { success: boolean } {
    const key = `${tenantId}:${agentId}`;
    const agent = this.agentCapabilities.get(key);
    if (agent) {
      agent.killSwitchActive = true;
      this._writeAudit(tenantId, "AGENT_KILL_SWITCH_ACTIVATED", actorId, agentId,
        `Kill switch activated for agent ${agentId} by ${actorId}`);
    }
    return { success: true };
  }

  public getHealthSummary(tenantId: string): AutonomousOperationsHealthSummary {
    const agents = Array.from(this.agentCapabilities.values()).filter(a => a.tenantId === tenantId);
    const l4 = agents.filter(a => a.autonomyLevel === "LEVEL_4_CERTIFIED" || a.autonomyLevel === "LEVEL_5_COORDINATED").length;
    const reqs = Array.from(this.actionRequests.values()).filter(r => r.tenantId === tenantId);
    const verified = reqs.filter(r => r.verificationStatus === "PASSED").length;
    const escalated = reqs.filter(r => r.state === "ESCALATED").length;
    const blocked = reqs.filter(r => r.state === "BLOCKED").length;

    return {
      tenantId,
      engineOperational: true,
      activeAgentsCount: agents.length,
      level4CertifiedCount: l4,
      verifiedActionsCount: verified,
      escalatedCount: escalated,
      blockedCount: blocked,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): AutonomousOperationsAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: AutonomousOperationsAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
