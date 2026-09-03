import {
  WorkflowAutomationHealthSummary,
  WorkflowAutomationHealthSummarySchema,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowDefinitionSchema,
  WorkflowInstanceExecution,
  WorkflowTaskAssignment,
} from "@kwakopos2/contracts";

type ActionExecutionContext = {
  workflow: WorkflowDefinition;
  instance: WorkflowInstanceExecution;
  action: WorkflowDefinition["actions"][number];
  eventPayload: Record<string, unknown>;
};

type ActionHandler = (context: ActionExecutionContext) => void | Promise<void>;

const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);

function readField(payload: Record<string, unknown>, field: string): unknown {
  return field.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    return hasOwn(record, segment) ? record[segment] : undefined;
  }, payload);
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left === "number" && typeof right === "number") return left === right;
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesCondition(condition: WorkflowCondition, payload: Record<string, unknown>): boolean {
  const actual = readField(payload, condition.field);
  switch (condition.operator) {
    case "EQUALS":
      return valuesEqual(actual, condition.value);
    case "NOT_EQUALS":
      return !valuesEqual(actual, condition.value);
    case "GREATER_THAN":
      return typeof actual === "number" && typeof condition.value === "number" && actual > condition.value;
    case "LESS_THAN":
      return typeof actual === "number" && typeof condition.value === "number" && actual < condition.value;
    case "CONTAINS":
      if (typeof actual === "string") return actual.includes(String(condition.value));
      if (Array.isArray(actual)) return actual.some((item) => valuesEqual(item, condition.value));
      return false;
    case "IN":
      return Array.isArray(condition.value) && condition.value.some((item) => valuesEqual(item, actual));
    default:
      return false;
  }
}

function now(): string {
  return new Date().toISOString();
}

function uniqueId(prefix: string, counter: number): string {
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export class WorkflowAutomationEngine {
  private definitions = new Map<string, WorkflowDefinition>();
  private instances = new Map<string, WorkflowInstanceExecution>();
  private pendingTasks = new Map<string, WorkflowTaskAssignment>();
  private approvalIndexes = new Map<string, number>();
  private eventPayloads = new Map<string, Record<string, unknown>>();
  private actionHandlers = new Map<string, ActionHandler>();
  private sequence = 0;

  constructor(actionHandlers?: Record<string, ActionHandler>) {
    for (const [actionType, handler] of Object.entries(actionHandlers ?? {})) {
      this.registerActionHandler(actionType, handler);
    }

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

  public registerActionHandler(actionType: string, handler: ActionHandler): void {
    if (!actionType || typeof handler !== "function") throw new Error("Action handler must have a valid type and function");
    this.actionHandlers.set(actionType, handler);
  }

  public registerWorkflow(definition: WorkflowDefinition): { success: boolean; error?: string } {
    const parsed = WorkflowDefinitionSchema.safeParse(definition);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
    }
    if (parsed.data.triggers.length === 0) return { success: false, error: "Workflow must define at least one trigger" };
    this.definitions.set(parsed.data.workflowId, parsed.data);
    return { success: true };
  }

  public dispatchTrigger(eventType: string, entityPayload: Record<string, unknown>): {
    triggeredCount: number;
    instances: WorkflowInstanceExecution[];
  } {
    if (!eventType) return { triggeredCount: 0, instances: [] };

    const matchedInstances: WorkflowInstanceExecution[] = [];
    for (const definition of this.definitions.values()) {
      if (!definition.isActive) continue;
      const triggerMatched = definition.triggers.some((trigger) =>
        trigger.eventType === eventType && trigger.conditions.every((condition) => matchesCondition(condition, entityPayload)),
      );
      if (!triggerMatched) continue;

      const instanceId = uniqueId("WFI", ++this.sequence);
      const hasApproval = (definition.approvalRequirements?.length ?? 0) > 0;
      const instance: WorkflowInstanceExecution = {
        instanceId,
        workflowId: definition.workflowId,
        status: hasApproval ? "PAUSED_APPROVAL" : "RUNNING",
        currentStep: hasApproval ? definition.approvalRequirements![0].stepId : "RUNNING",
        logs: [`Workflow triggered by event: ${eventType}`, `Trigger conditions matched`],
        startedAt: now(),
      };

      this.instances.set(instanceId, instance);
      this.eventPayloads.set(instanceId, entityPayload);
      if (hasApproval) {
        this.approvalIndexes.set(instanceId, 0);
        this.createApprovalTask(definition, instance);
      } else {
        this.executeActions(definition, instance, entityPayload);
      }
      matchedInstances.push(instance);
    }

    return { triggeredCount: matchedInstances.length, instances: matchedInstances };
  }

  private createApprovalTask(definition: WorkflowDefinition, instance: WorkflowInstanceExecution): WorkflowTaskAssignment {
    const index = this.approvalIndexes.get(instance.instanceId) ?? 0;
    const requirement = definition.approvalRequirements?.[index];
    if (!requirement) throw new Error(`No approval requirement found for workflow ${definition.workflowId}`);

    const taskId = uniqueId("TSK", ++this.sequence);
    const task: WorkflowTaskAssignment = {
      taskId,
      workflowId: definition.workflowId,
      instanceId: instance.instanceId,
      assignedRole: requirement.approverRole,
      title: `Approve Workflow: ${definition.name}`,
      priority: index === 0 ? "HIGH" : "CRITICAL",
      status: "PENDING",
      createdAt: now(),
    };
    this.pendingTasks.set(taskId, task);
    instance.currentStep = requirement.stepId;
    instance.logs.push(`Approval task ${taskId} assigned to role ${requirement.approverRole}`);
    return task;
  }

  private executeActions(
    definition: WorkflowDefinition,
    instance: WorkflowInstanceExecution,
    eventPayload: Record<string, unknown>,
  ): void {
    instance.status = "RUNNING";
    try {
      for (const action of definition.actions) {
        const handler = this.actionHandlers.get(action.actionType);
        if (handler) {
          const result = handler({ workflow: definition, instance, action, eventPayload });
          if (result && typeof (result as Promise<void>).then === "function") {
            throw new Error(`Asynchronous action handler '${action.actionType}' is not supported by synchronous dispatch`);
          }
        }
        instance.logs.push(`Action ${action.actionId} (${action.actionType}) executed${handler ? " via registered handler" : " (accepted by workflow runtime)"}`);
      }
      instance.status = "COMPLETED";
      instance.currentStep = "DONE";
      instance.completedAt = now();
      instance.logs.push("Workflow completed successfully");
    } catch (error) {
      instance.status = "FAILED";
      instance.currentStep = "FAILED";
      instance.completedAt = now();
      instance.logs.push(`Workflow action failure: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public decideApprovalTask(taskId: string, decision: "APPROVED" | "REJECTED", approverId: string): boolean {
    const task = this.pendingTasks.get(taskId);
    if (!task || task.status !== "PENDING" || !approverId.trim()) return false;

    task.status = decision;
    const instance = this.instances.get(task.instanceId);
    if (!instance) return false;
    const definition = this.definitions.get(task.workflowId);
    if (!definition) return false;

    instance.logs.push(`Approval task ${taskId} ${decision} by ${approverId}`);
    if (decision === "REJECTED") {
      instance.status = "FAILED";
      instance.currentStep = "REJECTED";
      instance.completedAt = now();
      return true;
    }

    const currentIndex = this.approvalIndexes.get(instance.instanceId) ?? 0;
    const nextIndex = currentIndex + 1;
    if (nextIndex < (definition.approvalRequirements?.length ?? 0)) {
      this.approvalIndexes.set(instance.instanceId, nextIndex);
      this.createApprovalTask(definition, instance);
      instance.status = "PAUSED_APPROVAL";
      return true;
    }

    this.approvalIndexes.delete(instance.instanceId);
    this.executeActions(definition, instance, this.eventPayloads.get(instance.instanceId) ?? {});
    return true;
  }

  public retryFailedInstance(instanceId: string): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance || instance.status !== "FAILED") return false;
    const definition = this.definitions.get(instance.workflowId);
    if (!definition) return false;

    const payload = this.eventPayloads.get(instanceId) ?? {};
    instance.status = "RETRIED";
    instance.completedAt = undefined;
    instance.logs.push(`Retry initiated at ${now()}`);

    if ((definition.approvalRequirements?.length ?? 0) > 0) {
      this.approvalIndexes.set(instanceId, 0);
      for (const task of this.pendingTasks.values()) {
        if (task.instanceId === instanceId && task.status === "PENDING") task.status = "EXPIRED";
      }
      instance.status = "PAUSED_APPROVAL";
      this.createApprovalTask(definition, instance);
      return true;
    }

    this.executeActions(definition, instance, payload);
    return true;
  }

  public getInstance(instanceId: string): WorkflowInstanceExecution | undefined {
    return this.instances.get(instanceId);
  }

  public getPendingTasks(instanceId?: string): WorkflowTaskAssignment[] {
    return Array.from(this.pendingTasks.values()).filter((task) => !instanceId || task.instanceId === instanceId);
  }

  public getHealthSummary(): WorkflowAutomationHealthSummary {
    const summary: WorkflowAutomationHealthSummary = {
      activeWorkflowsCount: Array.from(this.definitions.values()).filter((definition) => definition.isActive).length,
      pendingApprovalsCount: Array.from(this.pendingTasks.values()).filter((task) => task.status === "PENDING").length,
      completedInstancesCount: Array.from(this.instances.values()).filter((instance) => instance.status === "COMPLETED").length,
      failedInstancesCount: Array.from(this.instances.values()).filter((instance) => instance.status === "FAILED").length,
      automationEngineOperational: true,
    };
    return WorkflowAutomationHealthSummarySchema.parse(summary);
  }
}

export const globalWorkflowAutomationEngine = new WorkflowAutomationEngine();
