import { WorkflowDefinition } from "@kwakopos2/contracts";
import { globalWorkflowAutomationEngine } from "@kwakopos2/domain";

export class WorkflowAutomationService {
  public registerWorkflow(definition: WorkflowDefinition) {
    return globalWorkflowAutomationEngine.registerWorkflow(definition);
  }

  public dispatchTrigger(eventType: string, payload: Record<string, any>) {
    return globalWorkflowAutomationEngine.dispatchTrigger(eventType, payload);
  }

  public decideApproval(taskId: string, decision: "APPROVED" | "REJECTED", approverId: string) {
    return globalWorkflowAutomationEngine.decideApprovalTask(taskId, decision, approverId);
  }

  public retryInstance(instanceId: string) {
    return globalWorkflowAutomationEngine.retryFailedInstance(instanceId);
  }

  public getDashboardMetrics() {
    return globalWorkflowAutomationEngine.getHealthSummary();
  }
}

export const globalWorkflowAutomationService = new WorkflowAutomationService();
