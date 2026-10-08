import { globalEnterpriseApprovalsEngine } from "@kwakopos2/domain";
import type { ApprovalPolicy, ApprovalEvidence, ApprovalDelegation } from "@kwakopos2/contracts";

// ============================================================
// Phase 34 — Enterprise Approvals API Service
// ============================================================

export class EnterpriseApprovalsService {
  public registerPolicy(policy: ApprovalPolicy) {
    return globalEnterpriseApprovalsEngine.registerPolicy(policy);
  }

  public evaluatePolicy(
    domain: ApprovalPolicy["domain"],
    actionCode: string,
    amountValue?: number
  ) {
    return globalEnterpriseApprovalsEngine.evaluatePolicy(domain, actionCode, amountValue);
  }

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
  }) {
    return globalEnterpriseApprovalsEngine.submitRequest(params);
  }

  public recordDecision(params: {
    approvalRequestId: string;
    approverId: string;
    approverRole: string;
    decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
    comments?: string;
    tenantId?: string;
  }) {
    return globalEnterpriseApprovalsEngine.recordDecision(params);
  }

  public executeApprovedRequest(approvalId: string, executorId: string, tenantId?: string) {
    return globalEnterpriseApprovalsEngine.executeApprovedRequest(approvalId, executorId, tenantId);
  }

  public cancelRequest(approvalId: string, cancelledBy: string, reason: string, tenantId?: string) {
    return globalEnterpriseApprovalsEngine.cancelRequest(approvalId, cancelledBy, reason, tenantId);
  }

  public escalateRequest(approvalId: string, escalatedBy: string, reason: string, tenantId?: string) {
    return globalEnterpriseApprovalsEngine.escalateRequest(approvalId, escalatedBy, reason, tenantId);
  }

  public registerDelegation(delegation: ApprovalDelegation) {
    return globalEnterpriseApprovalsEngine.registerDelegation(delegation);
  }

  public getActiveDelegations(approverId: string) {
    return globalEnterpriseApprovalsEngine.getActiveDelegations(approverId);
  }

  public getRequest(approvalId: string, tenantId?: string) {
    return globalEnterpriseApprovalsEngine.getRequest(approvalId, tenantId);
  }

  public listRequestsByTenant(tenantId: string) {
    return globalEnterpriseApprovalsEngine.listRequestsByTenant(tenantId);
  }

  public getPendingForApprover(approverId: string) {
    return globalEnterpriseApprovalsEngine.getPendingForApprover(approverId);
  }

  public getDecisionHistory(approvalId: string) {
    return globalEnterpriseApprovalsEngine.getDecisionHistory(approvalId);
  }

  public getAuditTrail(approvalId: string, tenantId?: string) {
    return globalEnterpriseApprovalsEngine.getAuditTrail(approvalId, tenantId);
  }

  public getDashboardMetrics() {
    return globalEnterpriseApprovalsEngine.getHealthSummary();
  }

  public listPolicies() {
    return globalEnterpriseApprovalsEngine.listPolicies();
  }
}

export const globalEnterpriseApprovalsService = new EnterpriseApprovalsService();
