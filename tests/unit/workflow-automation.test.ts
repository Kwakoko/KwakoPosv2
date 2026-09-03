import { describe, it, expect } from "vitest";
import { WorkflowAutomationEngine } from "@kwakopos2/domain";
import { runWorkflowAutomationCertification } from "../../scripts/certification/workflow-automation-certification-engine.js";

describe("Phase 31 — KwakoPos Workflow & Automation OS Test Suite", () => {
  it("matches trigger conditions and executes actions only when conditions match", () => {
    const engine = new WorkflowAutomationEngine();
    const regRes = engine.registerWorkflow({
      workflowId: "wf-test-sale-condition",
      name: "High Value Sale Notification",
      category: "Sales",
      version: "1.0.0",
      isActive: true,
      triggers: [{
        triggerId: "trig-sale",
        eventType: "EVENT_SALE",
        entityType: "Sale",
        conditions: [{ field: "amount", operator: "GREATER_THAN", value: 10000 }],
      }],
      actions: [{ actionId: "act-notify", actionType: "NOTIFICATION", payload: { msg: "High value sale" } }],
      permissions: ["sales.manage"],
    });
    expect(regRes.success).toBe(true);

    expect(engine.dispatchTrigger("EVENT_SALE", { amount: 5000 }).triggeredCount).toBe(0);
    const dispatchRes = engine.dispatchTrigger("EVENT_SALE", { amount: 15000 });
    expect(dispatchRes.triggeredCount).toBe(1);
    expect(dispatchRes.instances[0].status).toBe("COMPLETED");
    expect(dispatchRes.instances[0].logs.some((log) => log.includes("act-notify") && log.includes("executed"))).toBe(true);
  });

  it("handles sequential approval chains and executes actions after the final approval", () => {
    const engine = new WorkflowAutomationEngine();
    engine.registerWorkflow({
      workflowId: "wf-approval-chain",
      name: "Two Tier Approval",
      category: "Finance",
      version: "1.0.0",
      isActive: true,
      triggers: [{ triggerId: "trig-approval", eventType: "EVENT_APPROVAL_REQ", entityType: "Request", conditions: [] }],
      actions: [{ actionId: "act-complete", actionType: "NOTIFICATION", payload: { msg: "Approved" } }],
      approvalRequirements: [
        { stepId: "tier-1", approverRole: "Manager", timeoutHours: 12 },
        { stepId: "tier-2", approverRole: "Director", timeoutHours: 24 },
      ],
      permissions: ["finance.manage"],
    });

    const dispatchRes = engine.dispatchTrigger("EVENT_APPROVAL_REQ", { amount: 15000 });
    const instance = dispatchRes.instances[0];
    expect(instance.status).toBe("PAUSED_APPROVAL");

    const firstTask = engine.getPendingTasks(instance.instanceId)[0];
    expect(firstTask.assignedRole).toBe("Manager");
    expect(engine.decideApprovalTask(firstTask.taskId, "APPROVED", "manager-1")).toBe(true);
    expect(engine.getInstance(instance.instanceId)?.status).toBe("PAUSED_APPROVAL");

    const secondTask = engine.getPendingTasks(instance.instanceId).find((task) => task.status === "PENDING");
    expect(secondTask?.assignedRole).toBe("Director");
    expect(secondTask && engine.decideApprovalTask(secondTask.taskId, "APPROVED", "director-1")).toBe(true);
    expect(engine.getInstance(instance.instanceId)?.status).toBe("COMPLETED");
  });

  it("rejects approval, marks the instance failed, and refuses invalid retries", () => {
    const engine = new WorkflowAutomationEngine();
    engine.registerWorkflow({
      workflowId: "wf-retry",
      name: "Approval Retry",
      category: "Operations",
      version: "1.0.0",
      isActive: true,
      triggers: [{ triggerId: "trig", eventType: "EVENT_CUSTOM", entityType: "Task", conditions: [] }],
      actions: [],
      approvalRequirements: [{ stepId: "approval", approverRole: "Manager", timeoutHours: 1 }],
      permissions: ["ops.manage"],
    });

    const dispatchRes = engine.dispatchTrigger("EVENT_CUSTOM", { id: "A" });
    const instance = dispatchRes.instances[0];
    const task = engine.getPendingTasks(instance.instanceId)[0];
    expect(engine.decideApprovalTask(task.taskId, "REJECTED", "manager-1")).toBe(true);
    expect(engine.getInstance(instance.instanceId)?.status).toBe("FAILED");
    expect(engine.retryFailedInstance(instance.instanceId)).toBe(true);
    expect(engine.getInstance(instance.instanceId)?.status).toBe("PAUSED_APPROVAL");
    expect(engine.retryFailedInstance("does-not-exist")).toBe(false);
  });

  it("passes the executable workflow certification campaign", () => {
    const cert = runWorkflowAutomationCertification();
    expect(cert.totalPillars).toBe(75);
    expect(cert.passedPillars).toBe(75);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
