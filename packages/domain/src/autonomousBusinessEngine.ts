import {
  AutonomousPolicy, AutonomousActionRecord, AutonomousHealthSummary, AutonomousAuditEntry,
  AutonomousAgentRole, AutonomousExecutionState,
} from "@kwakopos2/contracts";

export class AutonomousBusinessEngine {
  private policies: Map<string, AutonomousPolicy> = new Map();
  private actions: Map<string, AutonomousActionRecord> = new Map();
  private globalKillSwitchMap: Map<string, boolean> = new Map();
  private auditLedger: AutonomousAuditEntry[] = [];

  public configurePolicy(params: Omit<AutonomousPolicy, "createdAt" | "updatedAt" | "maxFinancialLimitTzs" | "requiresHumanApprovalAboveTzs" | "isKillSwitchActive"> & {
    maxFinancialLimitTzs?: number;
    requiresHumanApprovalAboveTzs?: number;
    isKillSwitchActive?: boolean;
  }): {
    success: boolean; policy?: AutonomousPolicy;
  } {
    const now = new Date().toISOString();
    const policy: AutonomousPolicy = {
      ...params,
      maxFinancialLimitTzs: params.maxFinancialLimitTzs ?? 1000000,
      requiresHumanApprovalAboveTzs: params.requiresHumanApprovalAboveTzs ?? 500000,
      isKillSwitchActive: params.isKillSwitchActive ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.policies.set(`${params.tenantId}:${params.agentRole}`, policy);
    this._writeAudit(params.tenantId, "POLICY_CONFIGURED", "SYSTEM", params.policyId,
      `Autonomous policy configured for role ${params.agentRole}: limit TZS ${policy.maxFinancialLimitTzs}`);
    return { success: true, policy };
  }

  public triggerAutonomousAction(params: Omit<AutonomousActionRecord, "createdAt" | "state" | "payloadJson" | "financialImpactTzs"> & {
    payloadJson?: string;
    financialImpactTzs?: number;
  }): {
    success: boolean; action?: AutonomousActionRecord; reason?: string;
  } {
    const now = new Date().toISOString();
    const isGlobalKillSwitch = this.globalKillSwitchMap.get(params.tenantId) ?? false;
    if (isGlobalKillSwitch) {
      this._writeAudit(params.tenantId, "ACTION_BLOCKED", "SYSTEM", params.actionId, `Blocked: Tenant Global Kill Switch active`);
      return { success: false, reason: "Blocked: Tenant Global Kill Switch is active" };
    }

    const policy = this.policies.get(`${params.tenantId}:${params.agentRole}`);
    if (policy && policy.isKillSwitchActive) {
      this._writeAudit(params.tenantId, "ACTION_BLOCKED", "SYSTEM", params.actionId, `Blocked: Role Kill Switch active for ${params.agentRole}`);
      return { success: false, reason: `Blocked: Role Kill Switch active for ${params.agentRole}` };
    }

    const impact = params.financialImpactTzs ?? 0;
    const maxLimit = policy ? policy.maxFinancialLimitTzs : 1000000;
    const approvalThreshold = policy ? policy.requiresHumanApprovalAboveTzs : 500000;

    if (impact > maxLimit) {
      this._writeAudit(params.tenantId, "ACTION_BLOCKED", "SYSTEM", params.actionId, `Blocked: Financial impact TZS ${impact} exceeds max limit TZS ${maxLimit}`);
      return { success: false, reason: `Blocked: Financial impact TZS ${impact} exceeds max limit TZS ${maxLimit}` };
    }

    const initialState: AutonomousExecutionState = impact > approvalThreshold ? "PROPOSED" : "EXECUTED";

    const actionRecord: AutonomousActionRecord = {
      ...params,
      payloadJson: params.payloadJson ?? "{}",
      financialImpactTzs: impact,
      state: initialState,
      executedAt: initialState === "EXECUTED" ? now : undefined,
      createdAt: now,
    };

    this.actions.set(params.actionId, actionRecord);
    this._writeAudit(params.tenantId, initialState === "EXECUTED" ? "ACTION_EXECUTED" : "ACTION_PROPOSED",
      "SYSTEM", params.actionId, `Action ${initialState}: ${params.actionDescription} (Impact TZS ${impact})`);

    return { success: true, action: actionRecord };
  }

  public approveAction(actionId: string, approverUserId: string): { success: boolean; action?: AutonomousActionRecord } {
    const action = this.actions.get(actionId);
    if (!action || action.state !== "PROPOSED") return { success: false };

    action.state = "APPROVED";
    action.executedAt = new Date().toISOString();
    action.state = "EXECUTED";

    this._writeAudit(action.tenantId, "ACTION_APPROVED", approverUserId, actionId, `Action approved and executed by ${approverUserId}`);
    return { success: true, action };
  }

  public activateTenantKillSwitch(tenantId: string, actorId: string): { success: boolean } {
    this.globalKillSwitchMap.set(tenantId, true);
    this._writeAudit(tenantId, "KILL_SWITCH_ACTIVATED", actorId, tenantId, `Global Tenant Kill Switch activated by ${actorId}`);
    return { success: true };
  }

  public getHealthSummary(tenantId: string): AutonomousHealthSummary {
    const pList = Array.from(this.policies.values()).filter(p => p.tenantId === tenantId);
    const aList = Array.from(this.actions.values()).filter(a => a.tenantId === tenantId);
    const executed = aList.filter(a => a.state === "EXECUTED").length;
    const pending = aList.filter(a => a.state === "PROPOSED").length;

    const blockedAudits = this.auditLedger.filter(a => a.tenantId === tenantId && a.eventType === "ACTION_BLOCKED").length;

    return {
      tenantId,
      engineOperational: true,
      activePoliciesCount: pList.length,
      executedActionsCount: executed,
      pendingApprovalCount: pending,
      blockedActionsCount: blockedAudits,
      isGlobalKillSwitchActive: this.globalKillSwitchMap.get(tenantId) ?? false,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): AutonomousAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: AutonomousAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
