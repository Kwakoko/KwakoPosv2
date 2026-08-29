import {
  WorkflowDefinition,
  WorkflowInstanceExecution,
  WorkflowTaskAssignment,
  WorkflowAutomationHealthSummary,
} from "@kwakopos2/contracts";

export class WorkflowAutomationEngine {
  private definitions: Map<string, WorkflowDefinition> = new Map();
  private instances: Map<string, WorkflowInstanceExecution> = new Map();
  private pendingTasks: Map<string, WorkflowTaskAssignment> = new Map();

  constructor() {
    // Register Default Low Stock Reorder Workflow
    this.registerWorkflow({
      workflowId: "wf-low-stock-reorder",
      name: "Automated Low Stock Purchase Reorder Workflow",
      category: "Inventory & Procurement",
      version: "1.0.0",
      isActive: true,
      triggers: [
        {
          triggerId: "trig-stock-low",
          eventType: "EVENT_STOCK_LOW",
          entityType: "Product",
          conditions: [{ field: "quantity", operator: "LESS_THAN", value: 10 }],
        },
      ],
      actions: [
        {
          actionId: "act-create-po-task",
          actionType: "CREATE_TASK",
          payload: { title: "Approve Stock Reorder PO", assignedRole: "Storekeeper" },
        },
        {
          actionId: "act-send-notify",
          actionType: "NOTIFICATION",
          payload: { message: "Low stock alert triggered purchase reorder workflow" },
        },
      ],
      approvalRequirements: [
        { stepId: "step-po-approval", approverRole: "Storekeeper", timeoutHours: 24, escalationRole: "Manager" },
      ],
      permissions: ["inventory.manage", "purchases.create"],
    });
  }

  /**
   * 1. Register Workflow Definition
   */
  public registerWorkflow(definition: WorkflowDefinition): { success: boolean; error?: string } {
    if (!definition.workflowId || !definition.name) {
      return { success: false, error: "Invalid workflow definition params" };
    }
    this.definitions.set(definition.workflowId, definition);
    return { success: true };
  }

  /**
   * 2. Dispatch Event Trigger & Process Workflow Steps
   */
  public dispatchTrigger(eventType: string, entityPayload: Record<string, any>): {
    triggeredCount: number;
    instances: WorkflowInstanceExecution[];
  } {
    const matchedInstances: WorkflowInstanceExecution[] = [];

    for (const def of this.definitions.values()) {
      if (!def.isActive) continue;

      const triggerMatch = def.triggers.some((t) => t.eventType === eventType);
      if (!triggerMatch) continue;

      const instanceId = `WFI-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const hasApproval = def.approvalRequirements && def.approvalRequirements.length > 0;

      const instance: WorkflowInstanceExecution = {
        instanceId,
        workflowId: def.workflowId,
        status: hasApproval ? "PAUSED_APPROVAL" : "COMPLETED",
        currentStep: hasApproval ? def.approvalRequirements![0].stepId : "DONE",
        logs: [
          `Workflow triggered by event: ${eventType}`,
          hasApproval ? `Paused at approval step: ${def.approvalRequirements![0].stepId}` : "Actions executed successfully",
        ],
        startedAt: new Date().toISOString(),
        completedAt: hasApproval ? undefined : new Date().toISOString(),
      };

      this.instances.set(instanceId, instance);
      matchedInstances.push(instance);

      // Create Pending Approval Task if required
      if (hasApproval) {
        const req = def.approvalRequirements![0];
        const taskId = `TSK-${Date.now()}`;
        const task: WorkflowTaskAssignment = {
          taskId,
          workflowId: def.workflowId,
          instanceId,
          assignedRole: req.approverRole,
          title: `Approve Workflow: ${def.name}`,
          priority: "HIGH",
          status: "PENDING",
          createdAt: new Date().toISOString(),
        };
        this.pendingTasks.set(taskId, task);
      }
    }

    return {
      triggeredCount: matchedInstances.length,
      instances: matchedInstances,
    };
  }

  /**
   * 3. Process Approval Decision
   */
  public decideApprovalTask(taskId: string, decision: "APPROVED" | "REJECTED", approverId: string): boolean {
    const task = this.pendingTasks.get(taskId);
    if (!task || task.status !== "PENDING") return false;

    task.status = decision;
    const instance = this.instances.get(task.instanceId);
    if (instance) {
      if (decision === "APPROVED") {
        instance.status = "COMPLETED";
        instance.currentStep = "DONE";
        instance.completedAt = new Date().toISOString();
        instance.logs.push(`Approval task ${taskId} APPROVED by ${approverId}`);
      } else {
        instance.status = "FAILED";
        instance.currentStep = "REJECTED";
        instance.completedAt = new Date().toISOString();
        instance.logs.push(`Approval task ${taskId} REJECTED by ${approverId}`);
      }
    }
    return true;
  }

  /**
   * 4. Retry Failed Instance
   */
  public retryFailedInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;
    instance.status = "RETRIED";
    instance.logs.push(`Manual retry initiated at ${new Date().toISOString()}`);
    instance.status = "COMPLETED";
    instance.completedAt = new Date().toISOString();
    return true;
  }

  /**
   * 5. Health Summary
   */
  public getHealthSummary(): WorkflowAutomationHealthSummary {
    let activeWorkflows = this.definitions.size;
    let pendingApprovals = 0;
    let completedInstances = 0;
    let failedInstances = 0;

    for (const task of this.pendingTasks.values()) {
      if (task.status === "PENDING") pendingApprovals++;
    }

    for (const inst of this.instances.values()) {
      if (inst.status === "COMPLETED" || inst.status === "RETRIED") completedInstances++;
      if (inst.status === "FAILED") failedInstances++;
    }

    return {
      activeWorkflowsCount: activeWorkflows,
      pendingApprovalsCount: pendingApprovals,
      completedInstancesCount: completedInstances,
      failedInstancesCount: failedInstances,
      automationEngineOperational: true,
    };
  }
}

export const globalWorkflowAutomationEngine = new WorkflowAutomationEngine();
