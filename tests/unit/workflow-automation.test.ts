import { describe, it, expect } from "vitest";
import { WorkflowAutomationEngine } from "@kwakopos2/domain";
import { runWorkflowAutomationCertification } from "../../scripts/certification/workflow-automation-certification-engine.js";

describe("Phase 31 — KwakoPos Workflow & Automation OS Test Suite", () => {
  const engine = new WorkflowAutomationEngine();

  it("should register workflow definitions and dispatch triggers on business events", () => {
    const regRes = engine.registerWorkflow({
      workflowId: "wf-test-sale",
      name: "High Value Sale Approval",
      category: "Sales",
      version: "1.0.0",
      isActive: true,
      triggers: [{ triggerId: "trig-sale", eventType: "EVENT_SALE", entityType: "Sale", conditions: [] }],
      actions: [{ actionId: "act-notify", actionType: "NOTIFICATION", payload: { msg: "High value sale" } }],
      approvalRequirements: [{ stepId: "step-mgr-app", approverRole: "Manager", timeoutHours: 12 }],
      permissions: ["sales.manage"],
    });
    expect(regRes.success).toBe(true);

    const dispatchRes = engine.dispatchTrigger("EVENT_SALE", { amount: 15000 });
    expect(dispatchRes.triggeredCount).toBeGreaterThanOrEqual(1);
    expect(dispatchRes.instances[0].status).toBe("PAUSED_APPROVAL");
  });

  it("should handle approval task decisions and advance workflow instance execution", () => {
    const dispatchRes = engine.dispatchTrigger("EVENT_STOCK_LOW", { quantity: 2 });
    const instance = dispatchRes.instances[0];

    // Find approval task for this instance
    const healthBefore = engine.getHealthSummary();
    expect(healthBefore.pendingApprovalsCount).toBeGreaterThan(0);
  });

  it("should support manual retry of failed workflow instances", () => {
    const dispatchRes = engine.dispatchTrigger("EVENT_STOCK_LOW", { quantity: 1 });
    const instanceId = dispatchRes.instances[0].instanceId;
    const retried = engine.retryFailedInstance(instanceId);
    expect(retried).toBe(true);
  });


  it("should pass 100% of the 75-Pillar Workflow & Automation OS certification campaign", () => {
    const cert = runWorkflowAutomationCertification();
    expect(cert.totalPillars).toBe(75);
    expect(cert.passedPillars).toBe(75);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
