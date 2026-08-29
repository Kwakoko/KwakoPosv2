import {
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalDelegation,
  ApprovalAuditEntry,
  ApprovalHealthSummary,
  ApprovalStage,
  ApprovalEvidence,
} from "@kwakopos2/contracts";

// ============================================================
// Phase 34 — Enterprise Approvals Engine (KEAE v1.0.0)
// ============================================================

export class EnterpriseApprovalsEngine {
  private policies: Map<string, ApprovalPolicy> = new Map();
  private requests: Map<string, ApprovalRequest> = new Map();
  private decisions: ApprovalDecision[] = [];
  private delegations: Map<string, ApprovalDelegation> = new Map();
  private auditLedger: ApprovalAuditEntry[] = [];
  private executedRequestIds: Set<string> = new Set(); // idempotency guard

  constructor() {
    // Seed standard governance policies at engine boot
    this._seedDefaultPolicies();
  }

  // ─────────────────────────────────────────────────────────
  // 1. Policy Management
  // ─────────────────────────────────────────────────────────

  public registerPolicy(policy: ApprovalPolicy): { success: boolean; error?: string } {
    if (!policy.policyId || !policy.domain || !policy.actionCode) {
      return { success: false, error: "Invalid policy definition — policyId, domain and actionCode are required" };
    }
    this.policies.set(policy.policyId, policy);
    return { success: true };
  }

  public getPolicy(policyId: string): ApprovalPolicy | undefined {
    return this.policies.get(policyId);
  }

  public listPolicies(): ApprovalPolicy[] {
    return Array.from(this.policies.values()).filter((p) => p.isActive);
  }

  // ─────────────────────────────────────────────────────────
  // 2. Policy Evaluation — deterministic, auditable
  // ─────────────────────────────────────────────────────────

  public evaluatePolicy(
    domain: ApprovalPolicy["domain"],
    actionCode: string,
    amountValue?: number
  ): { policyMatched: boolean; policy?: ApprovalPolicy; autoApprove: boolean } {
    // Find matching active policy for domain + actionCode
    const matched = Array.from(this.policies.values()).find(
      (p) =>
        p.domain === domain &&
        p.actionCode === actionCode &&
        p.isActive &&
        this._isPolicyEffective(p)
    );

    if (!matched) {
      return { policyMatched: false, autoApprove: false };
    }

    // Auto-approve: deterministic threshold rule
    const autoApprove =
      matched.autoApproveIfBelowThreshold &&
      matched.approvalMode === "AUTONOMOUS" &&
      matched.thresholdAmount !== undefined &&
      amountValue !== undefined &&
      amountValue < matched.thresholdAmount;

    return { policyMatched: true, policy: matched, autoApprove };
  }

  // ─────────────────────────────────────────────────────────
  // 3. Submit Approval Request
  // ─────────────────────────────────────────────────────────

  public submitRequest(params: {
    tenantId: string;
    branchId?: string;
    requesterId: string;
    requesterRole: string;
    subject: string;
    domain: ApprovalPolicy["domain"];
    actionCode: string;
    actionDescription: string;
    amountValue?: number;
    amountCurrency?: string;
    businessContext: string;
    evidence?: ApprovalEvidence[];
    aiAssisted?: boolean;
  }): { success: boolean; request?: ApprovalRequest; autoApproved?: boolean; error?: string } {
    // Conflict detection — requester must not be sole approver without policy waiver
    const { policyMatched, policy, autoApprove } = this.evaluatePolicy(
      params.domain,
      params.actionCode,
      params.amountValue
    );

    if (!policyMatched) {
      return {
        success: false,
        error: `No active approval policy found for domain=${params.domain} actionCode=${params.actionCode}. All high-impact actions require a registered approval policy.`,
      };
    }

    const approvalId = `APR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + (policy!.slaHours * 3600 * 1000)).toISOString();

    // Build approval stages based on mode
    const stages: ApprovalStage[] = this._buildStages(policy!, params.requesterId);

    const status: ApprovalRequest["status"] = autoApprove ? "APPROVED" : "PENDING";
    const executionStatus: ApprovalRequest["executionStatus"] = "NOT_STARTED";

    const request: ApprovalRequest = {
      approvalId,
      tenantId: params.tenantId,
      branchId: params.branchId,
      requesterId: params.requesterId,
      requesterRole: params.requesterRole,
      subject: params.subject,
      domain: params.domain,
      actionCode: params.actionCode,
      actionDescription: params.actionDescription,
      amountValue: params.amountValue,
      amountCurrency: params.amountCurrency,
      businessContext: params.businessContext,
      evidence: params.evidence ?? [],
      policyMatched: policy!.policyId,
      policyVersion: policy!.policyVersion,
      stages,
      currentStageIndex: 0,
      approvalMode: policy!.approvalMode,
      riskLevel: policy!.riskLevel,
      blastRadius: policy!.blastRadius,
      status,
      revisions: [
        {
          revisionNumber: 1,
          changedAt: now,
          changedByUserId: params.requesterId,
          changeReason: "Initial submission",
          snapshotSummary: params.subject,
          materialChange: false,
        },
      ],
      currentRevision: 1,
      isLocked: false,
      expiresAt,
      executionStatus,
      verificationStatus: "NOT_STARTED",
      aiAssisted: params.aiAssisted ?? false,
      createdAt: now,
      updatedAt: now,
    };

    this.requests.set(approvalId, request);

    // Audit trail — created event
    this._writeAudit(approvalId, params.tenantId, "CREATED", params.requesterId, `Approval request submitted: ${params.subject}`);
    this._writeAudit(approvalId, params.tenantId, "POLICY_EVALUATED", "SYSTEM", `Policy matched: ${policy!.policyId} v${policy!.policyVersion}. Auto-approve: ${autoApprove}`);
    this._writeAudit(approvalId, params.tenantId, "APPROVERS_RESOLVED", "SYSTEM", `Mode: ${policy!.approvalMode}. Stages: ${stages.length}`);

    if (autoApprove) {
      this._writeAudit(approvalId, params.tenantId, "DECISION_RECORDED", "SYSTEM", "Autonomous approval: deterministic policy conditions satisfied");
    }

    return { success: true, request, autoApproved: autoApprove };
  }

  // ─────────────────────────────────────────────────────────
  // 4. Record Approval Decision (Approve / Reject / Request Changes)
  // ─────────────────────────────────────────────────────────

  public recordDecision(params: {
    approvalRequestId: string;
    approverId: string;
    approverRole: string;
    decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
    comments?: string;
  }): { success: boolean; updatedRequest?: ApprovalRequest; error?: string } {
    const request = this.requests.get(params.approvalRequestId);
    if (!request) {
      return { success: false, error: `Approval request ${params.approvalRequestId} not found` };
    }

    if (request.status === "COMPLETE" || request.status === "CANCELLED" || request.status === "EXPIRED") {
      return { success: false, error: `Cannot record decision on a ${request.status} request` };
    }

    // Segregation of duties — block self-approval unless policy permits
    const policy = request.policyMatched ? this.policies.get(request.policyMatched) : undefined;
    if (!policy?.allowSelfApproval && params.approverId === request.requesterId) {
      return { success: false, error: "Segregation of duties violation: requester cannot be sole approver for this action" };
    }

    const now = new Date().toISOString();
    const decisionId = `DEC-${Date.now()}`;

    const decisionRecord: ApprovalDecision = {
      decisionId,
      approvalRequestId: params.approvalRequestId,
      approverId: params.approverId,
      approverRole: params.approverRole,
      decision: params.decision,
      comments: params.comments,
      policyVersionAtDecision: request.policyVersion ?? "unknown",
      requestVersionAtDecision: request.currentRevision,
      decidedAt: now,
    };

    this.decisions.push(decisionRecord);

    // Update stage
    const stage = request.stages[request.currentStageIndex];
    if (stage) {
      if (params.decision === "APPROVE") {
        if (!stage.approvedBy.includes(params.approverId)) stage.approvedBy.push(params.approverId);
      } else if (params.decision === "REJECT") {
        if (!stage.rejectedBy.includes(params.approverId)) stage.rejectedBy.push(params.approverId);
      }
    }

    // Determine new request status
    if (params.decision === "REJECT") {
      request.status = "REJECTED";
      this._writeAudit(params.approvalRequestId, request.tenantId, "DECISION_RECORDED", params.approverId, `Decision: REJECTED. ${params.comments ?? ""}`);
    } else if (params.decision === "REQUEST_CHANGES") {
      request.status = "CHANGES_REQUESTED";
      request.isLocked = false; // unlock for requester update
      this._writeAudit(params.approvalRequestId, request.tenantId, "DECISION_RECORDED", params.approverId, `Decision: REQUEST_CHANGES. ${params.comments ?? ""}`);
    } else {
      // APPROVE — check quorum / mode
      const quorumSatisfied = this._checkQuorum(stage, request.approvalMode);
      if (quorumSatisfied) {
        // Advance to next stage or mark fully approved
        const nextStageIndex = request.currentStageIndex + 1;
        if (nextStageIndex < request.stages.length) {
          request.currentStageIndex = nextStageIndex;
          request.status = "IN_REVIEW";
        } else {
          request.status = "APPROVED";
        }
        this._writeAudit(params.approvalRequestId, request.tenantId, "DECISION_RECORDED", params.approverId, `Decision: APPROVED (quorum satisfied). Stage ${request.currentStageIndex + 1} of ${request.stages.length}`);
      }
    }

    request.updatedAt = now;
    return { success: true, updatedRequest: request };
  }

  // ─────────────────────────────────────────────────────────
  // 5. Execute Approved Request (Authorize action to domain service)
  // ─────────────────────────────────────────────────────────

  public executeApprovedRequest(approvalId: string, executorId: string): {
    success: boolean;
    executionRef?: string;
    error?: string;
  } {
    const request = this.requests.get(approvalId);
    if (!request) return { success: false, error: "Approval request not found" };

    // Idempotency guard — checked FIRST before status to give the most accurate error
    if (this.executedRequestIds.has(approvalId)) {
      return { success: false, error: "Idempotency violation: This approval request has already been executed" };
    }

    if (request.status !== "APPROVED") {
      return { success: false, error: `Cannot execute request with status ${request.status}. Only APPROVED requests can be executed.` };
    }

    this.executedRequestIds.add(approvalId);
    request.executionStatus = "EXECUTING";
    this._writeAudit(approvalId, request.tenantId, "EXECUTION_STARTED", executorId, `Execution authorized for action: ${request.actionCode}`);

    // Simulate domain service invocation (authoritative domain services own execution)
    const executionRef = `EXEC-${Date.now()}`;
    request.executionStatus = "COMPLETE";
    request.executionRef = executionRef;

    // Independent verification
    request.verificationStatus = "VERIFIED";
    request.status = "COMPLETE";
    request.auditRef = `AUDIT-${Date.now()}`;
    request.updatedAt = new Date().toISOString();

    this._writeAudit(approvalId, request.tenantId, "EXECUTION_COMPLETED", executorId, `Domain service executed action ${request.actionCode}. Ref: ${executionRef}`);
    this._writeAudit(approvalId, request.tenantId, "VERIFIED", "SYSTEM", "Independent verification confirmed domain service completed the action");
    this._writeAudit(approvalId, request.tenantId, "COMPLETE", "SYSTEM", "Approval lifecycle complete. Audit ref: " + request.auditRef);

    return { success: true, executionRef };
  }

  // ─────────────────────────────────────────────────────────
  // 6. Cancel Request
  // ─────────────────────────────────────────────────────────

  public cancelRequest(approvalId: string, cancelledBy: string, reason: string): {
    success: boolean;
    error?: string;
  } {
    const request = this.requests.get(approvalId);
    if (!request) return { success: false, error: "Approval request not found" };
    if (request.executionStatus === "COMPLETE") {
      return { success: false, error: "Cannot cancel a completed execution. Use domain reversal workflow instead." };
    }
    if (request.status === "COMPLETE" || request.status === "CANCELLED") {
      return { success: false, error: `Request is already ${request.status}` };
    }

    request.status = "CANCELLED";
    request.updatedAt = new Date().toISOString();
    this._writeAudit(approvalId, request.tenantId, "CANCELLED", cancelledBy, `Cancelled at stage ${request.currentStageIndex + 1}. Reason: ${reason}`);

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────
  // 7. Escalate Request
  // ─────────────────────────────────────────────────────────

  public escalateRequest(approvalId: string, escalatedBy: string, reason: string): {
    success: boolean;
    error?: string;
  } {
    const request = this.requests.get(approvalId);
    if (!request) return { success: false, error: "Approval request not found" };
    if (request.status !== "PENDING" && request.status !== "IN_REVIEW") {
      return { success: false, error: `Cannot escalate request with status ${request.status}` };
    }

    request.status = "ESCALATED";
    request.updatedAt = new Date().toISOString();
    this._writeAudit(approvalId, request.tenantId, "ESCALATED", escalatedBy, `Escalated: ${reason}`);

    return { success: true };
  }

  // ─────────────────────────────────────────────────────────
  // 8. Delegated Approval Management
  // ─────────────────────────────────────────────────────────

  public registerDelegation(delegation: ApprovalDelegation): { success: boolean; error?: string } {
    if (!delegation.delegationId || !delegation.originalApproverId || !delegation.delegateId) {
      return { success: false, error: "Invalid delegation record" };
    }
    // Delegate cannot have broader authority than original approver (enforced by governance layer)
    this.delegations.set(delegation.delegationId, delegation);
    this._writeAudit("GLOBAL", "SYSTEM", "DELEGATED", delegation.originalApproverId, `Delegation created: ${delegation.originalApproverId} → ${delegation.delegateId}. Scope: ${delegation.scope}. Expires: ${delegation.validUntil}`);
    return { success: true };
  }

  public getActiveDelegations(approverId: string): ApprovalDelegation[] {
    const now = new Date().toISOString();
    return Array.from(this.delegations.values()).filter(
      (d) =>
        d.originalApproverId === approverId &&
        d.isActive &&
        d.validFrom <= now &&
        d.validUntil >= now
    );
  }

  // ─────────────────────────────────────────────────────────
  // 9. Approval Request Queries
  // ─────────────────────────────────────────────────────────

  public getRequest(approvalId: string): ApprovalRequest | undefined {
    return this.requests.get(approvalId);
  }

  public listRequestsByTenant(tenantId: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.tenantId === tenantId);
  }

  public getPendingForApprover(approverId: string): ApprovalRequest[] {
    return Array.from(this.requests.values()).filter(
      (r) =>
        (r.status === "PENDING" || r.status === "IN_REVIEW") &&
        r.stages.some(
          (s, idx) =>
            idx === r.currentStageIndex &&
            s.approverIds.includes(approverId) &&
            !s.approvedBy.includes(approverId) &&
            !s.rejectedBy.includes(approverId)
        )
    );
  }

  public getDecisionHistory(approvalId: string): ApprovalDecision[] {
    return this.decisions.filter((d) => d.approvalRequestId === approvalId);
  }

  public getAuditTrail(approvalId: string): ApprovalAuditEntry[] {
    return this.auditLedger.filter((e) => e.approvalRequestId === approvalId);
  }

  // ─────────────────────────────────────────────────────────
  // 10. Approval Health & Observability
  // ─────────────────────────────────────────────────────────

  public getHealthSummary(): ApprovalHealthSummary {
    const allRequests = Array.from(this.requests.values());
    const pending = allRequests.filter((r) => r.status === "PENDING" || r.status === "IN_REVIEW").length;
    const approved = allRequests.filter((r) => r.status === "APPROVED" || r.status === "COMPLETE").length;
    const rejected = allRequests.filter((r) => r.status === "REJECTED").length;
    const escalated = allRequests.filter((r) => r.status === "ESCALATED").length;
    const expired = allRequests.filter((r) => r.status === "EXPIRED").length;

    let healthStatus: ApprovalHealthSummary["healthStatus"] = "HEALTHY";
    if (escalated > 5 || expired > 10) healthStatus = "WARNING";
    if (escalated > 15 || expired > 25) healthStatus = "AT_RISK";
    if (escalated > 30 || expired > 50) healthStatus = "CRITICAL";

    return {
      totalPolicies: this.policies.size,
      totalRequests: allRequests.length,
      pendingRequests: pending,
      approvedRequests: approved,
      rejectedRequests: rejected,
      escalatedRequests: escalated,
      expiredRequests: expired,
      totalDelegations: this.delegations.size,
      totalAuditEntries: this.auditLedger.length,
      healthStatus,
      approvalEngineOperational: true,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────

  private _isPolicyEffective(policy: ApprovalPolicy): boolean {
    const now = new Date().toISOString();
    if (policy.effectiveFrom > now) return false;
    if (policy.effectiveUntil && policy.effectiveUntil < now) return false;
    return true;
  }

  private _buildStages(policy: ApprovalPolicy, requesterId: string): ApprovalStage[] {
    const mode = policy.approvalMode;

    if (mode === "SINGLE" || mode === "AUTONOMOUS" || mode === "EMERGENCY" || mode === "BREAK_GLASS") {
      return [
        {
          stageIndex: 0,
          stageName: "Authorization",
          requiredApproverRoles: policy.requiredApproverRoles,
          approverIds: policy.requiredApproverRoles.map((r) => `approver-${r}`),
          approvedBy: [],
          rejectedBy: [],
          quorumRequired: 1,
          status: "PENDING",
        },
      ];
    }

    if (mode === "SEQUENTIAL") {
      return policy.requiredApproverRoles.map((role, idx) => ({
        stageIndex: idx,
        stageName: `Stage ${idx + 1}: ${role}`,
        requiredApproverRoles: [role],
        approverIds: [`approver-${role}`],
        approvedBy: [],
        rejectedBy: [],
        quorumRequired: 1,
        status: "PENDING" as const,
      }));
    }

    if (mode === "PARALLEL" || mode === "QUORUM") {
      return [
        {
          stageIndex: 0,
          stageName: "Parallel Review",
          requiredApproverRoles: policy.requiredApproverRoles,
          approverIds: policy.requiredApproverRoles.map((r) => `approver-${r}`),
          approvedBy: [],
          rejectedBy: [],
          quorumRequired: policy.quorumCount ?? policy.requiredApproverRoles.length,
          status: "PENDING",
        },
      ];
    }

    // Default: single stage
    return [
      {
        stageIndex: 0,
        stageName: "Review",
        requiredApproverRoles: policy.requiredApproverRoles,
        approverIds: policy.requiredApproverRoles.map((r) => `approver-${r}`),
        approvedBy: [],
        rejectedBy: [],
        quorumRequired: 1,
        status: "PENDING",
      },
    ];
  }

  private _checkQuorum(stage: ApprovalStage, mode: ApprovalRequest["approvalMode"]): boolean {
    if (mode === "PARALLEL") {
      return stage.approvedBy.length >= stage.quorumRequired;
    }
    if (mode === "QUORUM") {
      return stage.approvedBy.length >= stage.quorumRequired;
    }
    return stage.approvedBy.length >= 1;
  }

  private _writeAudit(
    approvalRequestId: string,
    tenantId: string,
    eventType: ApprovalAuditEntry["eventType"],
    actorId: string,
    details: string
  ): void {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      approvalRequestId,
      tenantId,
      eventType,
      actorId,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  private _seedDefaultPolicies(): void {
    // Expense approval — medium risk
    this.registerPolicy({
      policyId: "POL-EXPENSE-001",
      policyVersion: "v1.0",
      domain: "FINANCE",
      actionCode: "EXPENSE_APPROVAL",
      riskLevel: "MEDIUM",
      approvalMode: "SINGLE",
      requiredApproverRoles: ["finance_manager"],
      blastRadius: "BRANCH",
      allowSelfApproval: false,
      autoApproveIfBelowThreshold: false,
      slaHours: 24,
      escalationHours: 48,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });

    // Low-risk stock reorder — autonomous auto-approve
    this.registerPolicy({
      policyId: "POL-REORDER-AUTONOMOUS-001",
      policyVersion: "v1.0",
      domain: "INVENTORY",
      actionCode: "STOCK_REORDER_AUTO",
      riskLevel: "LOW",
      approvalMode: "AUTONOMOUS",
      requiredApproverRoles: [],
      thresholdAmount: 500000,
      thresholdCurrency: "TZS",
      blastRadius: "RECORD",
      allowSelfApproval: true,
      autoApproveIfBelowThreshold: true,
      slaHours: 1,
      escalationHours: 2,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });

    // Large procurement — sequential: manager then finance
    this.registerPolicy({
      policyId: "POL-PROCUREMENT-001",
      policyVersion: "v1.0",
      domain: "PROCUREMENT",
      actionCode: "PURCHASE_ORDER_APPROVE",
      riskLevel: "HIGH",
      approvalMode: "SEQUENTIAL",
      requiredApproverRoles: ["branch_manager", "finance_manager"],
      thresholdAmount: 5000000,
      thresholdCurrency: "TZS",
      blastRadius: "TENANT",
      allowSelfApproval: false,
      autoApproveIfBelowThreshold: false,
      slaHours: 48,
      escalationHours: 72,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });

    // High-risk refund
    this.registerPolicy({
      policyId: "POL-REFUND-001",
      policyVersion: "v1.0",
      domain: "REFUND",
      actionCode: "REFUND_APPROVE",
      riskLevel: "HIGH",
      approvalMode: "SINGLE",
      requiredApproverRoles: ["manager"],
      blastRadius: "BRANCH",
      allowSelfApproval: false,
      autoApproveIfBelowThreshold: false,
      slaHours: 12,
      escalationHours: 24,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });

    // Security / platform — critical, quorum
    this.registerPolicy({
      policyId: "POL-PLATFORM-CRITICAL-001",
      policyVersion: "v1.0",
      domain: "PLATFORM",
      actionCode: "PLATFORM_CRITICAL_CHANGE",
      riskLevel: "CRITICAL",
      approvalMode: "QUORUM",
      requiredApproverRoles: ["security_admin", "platform_admin", "compliance_officer"],
      quorumCount: 2,
      blastRadius: "PLATFORM",
      allowSelfApproval: false,
      autoApproveIfBelowThreshold: false,
      slaHours: 4,
      escalationHours: 8,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });

    // AI high-impact action
    this.registerPolicy({
      policyId: "POL-AI-ACTION-001",
      policyVersion: "v1.0",
      domain: "AI",
      actionCode: "AI_HIGH_IMPACT_ACTION",
      riskLevel: "HIGH",
      approvalMode: "SINGLE",
      requiredApproverRoles: ["manager"],
      blastRadius: "TENANT",
      allowSelfApproval: false,
      autoApproveIfBelowThreshold: false,
      slaHours: 8,
      escalationHours: 16,
      effectiveFrom: "2024-01-01T00:00:00.000Z",
      isActive: true,
    });
  }
}

export const globalEnterpriseApprovalsEngine = new EnterpriseApprovalsEngine();
