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
  }) {
    return globalEnterpriseApprovalsEngine.recordDecision(params);
  }

  public executeApprovedRequest(approvalId: string, executorId: string) {
    return globalEnterpriseApprovalsEngine.executeApprovedRequest(approvalId, executorId);
  }

  public cancelRequest(approvalId: string, cancelledBy: string, reason: string) {
    return globalEnterpriseApprovalsEngine.cancelRequest(approvalId, cancelledBy, reason);
  }

  public escalateRequest(approvalId: string, escalatedBy: string, reason: string) {
    return globalEnterpriseApprovalsEngine.escalateRequest(approvalId, escalatedBy, reason);
  }

  public registerDelegation(delegation: ApprovalDelegation) {
    return globalEnterpriseApprovalsEngine.registerDelegation(delegation);
  }

  public getActiveDelegations(approverId: string) {
    return globalEnterpriseApprovalsEngine.getActiveDelegations(approverId);
  }

  public getRequest(approvalId: string) {
    return globalEnterpriseApprovalsEngine.getRequest(approvalId);
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

  public getAuditTrail(approvalId: string) {
    return globalEnterpriseApprovalsEngine.getAuditTrail(approvalId);
  }

  public getDashboardMetrics() {
    return globalEnterpriseApprovalsEngine.getHealthSummary();
  }

  public listPolicies() {
    return globalEnterpriseApprovalsEngine.listPolicies();
  }
}

export const globalEnterpriseApprovalsService = new EnterpriseApprovalsService();
