import type {
  PluginWorkflowDefinition,
  PluginWorkflowStep,
  TenantContext,
} from "@kwakopos2/contracts";

export interface WorkflowInstance {
  id: string;
  workflowId: string;
  entityId: string;
  currentStepNumber: number;
  status: "IN_PROGRESS" | "COMPLETED" | "REJECTED";
  history: Array<{
    stepNumber: number;
    action: string;
    actorId: string;
    timestamp: string;
    notes?: string;
  }>;
}

export class PluginWorkflowEngine {
  startWorkflow(
    definition: PluginWorkflowDefinition,
    entityId: string,
    ctx: TenantContext
  ): WorkflowInstance {
    if (!definition.steps || definition.steps.length === 0) {
      throw new Error(`Workflow ${definition.workflowId} has no steps defined`);
    }

    const firstStep = definition.steps[0];
    return {
      id: crypto.randomUUID(),
      workflowId: definition.workflowId,
      entityId,
      currentStepNumber: firstStep.stepNumber,
      status: "IN_PROGRESS",
      history: [
        {
          stepNumber: firstStep.stepNumber,
          action: firstStep.action,
          actorId: ctx.userId,
          timestamp: new Date().toISOString(),
          notes: "Workflow initialized",
        },
      ],
    };
  }

  advanceStep(
    instance: WorkflowInstance,
    definition: PluginWorkflowDefinition,
    ctx: TenantContext,
    notes?: string
  ): WorkflowInstance {
    if (instance.status !== "IN_PROGRESS") {
      throw new Error(`Cannot advance workflow in status ${instance.status}`);
    }

    const nextStepIndex = definition.steps.findIndex(
      (s) => s.stepNumber > instance.currentStepNumber
    );

    if (nextStepIndex === -1) {
      // Completed all steps
      instance.status = "COMPLETED";
      instance.history.push({
        stepNumber: instance.currentStepNumber,
        action: "COMPLETE",
        actorId: ctx.userId,
        timestamp: new Date().toISOString(),
        notes: notes || "Workflow completed successfully",
      });
      return instance;
    }

    const nextStep = definition.steps[nextStepIndex];
    instance.currentStepNumber = nextStep.stepNumber;
    instance.history.push({
      stepNumber: nextStep.stepNumber,
      action: nextStep.action,
      actorId: ctx.userId,
      timestamp: new Date().toISOString(),
      notes,
    });

    return instance;
  }
}
