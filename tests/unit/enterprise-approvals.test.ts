import { describe, it, expect } from "vitest";
import { EnterpriseApprovalsEngine } from "@kwakopos2/domain";

describe("Phase 34 — Enterprise Approvals Engine (KEAE v1.0.0)", () => {
  it("should evaluate policy deterministically and submit a request with correct lifecycle state", () => {
    const engine = new EnterpriseApprovalsEngine();

    const evalResult = engine.evaluatePolicy("FINANCE", "EXPENSE_APPROVAL", 450000);
    expect(evalResult.policyMatched).toBe(true);
    expect(evalResult.policy?.policyId).toBe("POL-EXPENSE-001");
    expect(evalResult.autoApprove).toBe(false);

    const submitResult = engine.submitRequest({
      tenantId: "TEN-TEST-01",
      branchId: "BRANCH-TEST-01",
      requesterId: "USR-TEST-01",
      requesterRole: "cashier",
      subject: "Transport Expense Claim",
      domain: "FINANCE",
      actionCode: "EXPENSE_APPROVAL",
      actionDescription: "Staff transport reimbursement",
      amountValue: 450000,
      businessContext: "Branch operations",
    });

    expect(submitResult.success).toBe(true);
    expect(submitResult.request?.status).toBe("PENDING");
    expect(submitResult.request?.policyMatched).toBe("POL-EXPENSE-001");
    expect(submitResult.request?.riskLevel).toBe("MEDIUM");
    expect(submitResult.request?.blastRadius).toBe("BRANCH");
    expect(submitResult.request?.expiresAt).toBeDefined();
    expect(submitResult.request?.revisions.length).toBeGreaterThanOrEqual(1);
  });

  it("should enforce segregation of duties and approve via valid approver with idempotent execution", () => {
    const engine = new EnterpriseApprovalsEngine();

    const { request } = engine.submitRequest({
      tenantId: "TEN-TEST-02",
      requesterId: "USR-REQUESTER",
      requesterRole: "cashier",
      subject: "Expense Approval Test",
      domain: "FINANCE",
      actionCode: "EXPENSE_APPROVAL",
      actionDescription: "Test expense",
      amountValue: 200000,
      businessContext: "Unit test",
    });

    // SOD: requester cannot self-approve
    const selfDecision = engine.recordDecision({
      approvalRequestId: request!.approvalId,
      approverId: "USR-REQUESTER",
      approverRole: "cashier",
      decision: "APPROVE",
    });
    expect(selfDecision.success).toBe(false);
    expect(selfDecision.error).toMatch(/Segregation/i);

    // Valid approver approves
    const validDecision = engine.recordDecision({
      approvalRequestId: request!.approvalId,
      approverId: "approver-finance_manager",
      approverRole: "finance_manager",
      decision: "APPROVE",
      comments: "Approved after evidence review",
    });
    expect(validDecision.success).toBe(true);
    expect(validDecision.updatedRequest?.status).toBe("APPROVED");

    // Execute
    const exec = engine.executeApprovedRequest(request!.approvalId, "approver-finance_manager");
    expect(exec.success).toBe(true);
    expect(exec.executionRef).toBeDefined();

    // Idempotency — second execute must fail
    const dupExec = engine.executeApprovedRequest(request!.approvalId, "approver-finance_manager");
    expect(dupExec.success).toBe(false);
    expect(dupExec.error).toMatch(/already been executed/i);

    // Verify state
    const finalReq = engine.getRequest(request!.approvalId);
    expect(finalReq?.status).toBe("COMPLETE");
    expect(finalReq?.verificationStatus).toBe("VERIFIED");
    expect(finalReq?.executionStatus).toBe("COMPLETE");
  });

  it("should auto-approve low-risk inventory reorder below autonomous threshold", () => {
    const engine = new EnterpriseApprovalsEngine();

    const autoEval = engine.evaluatePolicy("INVENTORY", "STOCK_REORDER_AUTO", 85000);
    expect(autoEval.autoApprove).toBe(true);

    const result = engine.submitRequest({
      tenantId: "TEN-AUTO",
      requesterId: "AGENT-INVENTORY",
      requesterRole: "ai_agent",
      subject: "Auto-Reorder: Paracetamol 100mg",
      domain: "INVENTORY",
      actionCode: "STOCK_REORDER_AUTO",
      actionDescription: "AI-recommended autonomous reorder",
      amountValue: 85000,
      businessContext: "Below TZS 500K autonomous threshold",
    });

    expect(result.success).toBe(true);
    expect(result.autoApproved).toBe(true);
    expect(result.request?.status).toBe("APPROVED");
  });

  it("should record delegation, detect active delegations, and produce immutable audit trail", () => {
    const engine = new EnterpriseApprovalsEngine();

    const delegationResult = engine.registerDelegation({
      delegationId: "DEL-UNIT-001",
      originalApproverId: "MGR-UNIT-001",
      delegateId: "MGR-DEPUTY-UNIT-001",
      scope: "EXPENSE_APPROVAL",
      validFrom: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86400000 * 7).toISOString(),
      isActive: true,
      reason: "Leave cover",
      createdAt: new Date().toISOString(),
    });
    expect(delegationResult.success).toBe(true);

    const activeDels = engine.getActiveDelegations("MGR-UNIT-001");
    expect(activeDels.length).toBeGreaterThanOrEqual(1);
    expect(activeDels[0].delegateId).toBe("MGR-DEPUTY-UNIT-001");

    // Escalation
    const { request: escReq } = engine.submitRequest({
      tenantId: "TEN-ESC",
      requesterId: "USR-ESC",
      requesterRole: "cashier",
      subject: "Refund Escalation Test",
      domain: "REFUND",
      actionCode: "REFUND_APPROVE",
      actionDescription: "Customer refund",
      amountValue: 50000,
      businessContext: "Escalation test",
    });
    const escResult = engine.escalateRequest(escReq!.approvalId, "SYSTEM", "SLA exceeded");
    expect(escResult.success).toBe(true);
    const escalatedReq = engine.getRequest(escReq!.approvalId);
    expect(escalatedReq?.status).toBe("ESCALATED");

    // Audit trail
    const health = engine.getHealthSummary();
    expect(health.approvalEngineOperational).toBe(true);
    expect(health.totalPolicies).toBeGreaterThanOrEqual(6);
    expect(health.totalDelegations).toBeGreaterThanOrEqual(1);
    expect(health.escalatedRequests).toBeGreaterThanOrEqual(1);
  });
});
