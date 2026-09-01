import { z } from "zod";

// 1. Workflow Condition Schema
export const WorkflowConditionSchema = z.object({
  field: z.string(),
  operator: z.enum(["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "CONTAINS", "IN"]),
  value: z.any(),
});

export type WorkflowCondition = z.infer<typeof WorkflowConditionSchema>;

// 2. Workflow Trigger Schema
export const WorkflowTriggerSchema = z.object({
  triggerId: z.string(),
  eventType: z.enum(["EVENT_SALE", "EVENT_STOCK_LOW", "EVENT_APPROVAL_REQ", "EVENT_SCHEDULE", "EVENT_CUSTOM"]),
  entityType: z.string(),
  conditions: z.array(WorkflowConditionSchema),
});

export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

// 3. Workflow Action Schema
export const WorkflowActionSchema = z.object({
  actionId: z.string(),
  actionType: z.enum(["NOTIFICATION", "EMAIL", "MUTATE_ENTITY", "HTTP_WEBHOOK", "CREATE_TASK", "AI_ACTION"]),
  payload: z.record(z.any()),
});

export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

// 4. Workflow Approval Requirement Schema
export const WorkflowApprovalRequirementSchema = z.object({
  stepId: z.string(),
  approverRole: z.string(),
  timeoutHours: z.number().int().positive().default(24),
  escalationRole: z.string().optional(),
});

export type WorkflowApprovalRequirement = z.infer<typeof WorkflowApprovalRequirementSchema>;

// 5. Workflow Definition Schema
export const WorkflowDefinitionSchema = z.object({
  workflowId: z.string(),
  name: z.string(),
  category: z.string(),
  version: z.string(),
  isActive: z.boolean().default(true),
  triggers: z.array(WorkflowTriggerSchema),
  actions: z.array(WorkflowActionSchema),
  approvalRequirements: z.array(WorkflowApprovalRequirementSchema).optional(),
  permissions: z.array(z.string()),
});

export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

// 6. Workflow Task Assignment Schema
export const WorkflowTaskAssignmentSchema = z.object({
  taskId: z.string(),
  workflowId: z.string(),
  instanceId: z.string(),
  assignedRole: z.string(),
  assignedUserId: z.string().optional(),
  title: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]),
  createdAt: z.string(),
});

export type WorkflowTaskAssignment = z.infer<typeof WorkflowTaskAssignmentSchema>;

// 7. Workflow Instance Execution Schema
export const WorkflowInstanceExecutionSchema = z.object({
  instanceId: z.string(),
  workflowId: z.string(),
  status: z.enum(["RUNNING", "PAUSED_APPROVAL", "COMPLETED", "FAILED", "RETRIED"]),
  currentStep: z.string(),
  logs: z.array(z.string()),
  startedAt: z.string(),
  completedAt: z.string().optional(),
});

export type WorkflowInstanceExecution = z.infer<typeof WorkflowInstanceExecutionSchema>;

// 8. Workflow Automation Health Summary Schema
export const WorkflowAutomationHealthSummarySchema = z.object({
  activeWorkflowsCount: z.number().int().nonnegative(),
  pendingApprovalsCount: z.number().int().nonnegative(),
  completedInstancesCount: z.number().int().nonnegative(),
  failedInstancesCount: z.number().int().nonnegative(),
  automationEngineOperational: z.boolean(),
});

export type WorkflowAutomationHealthSummary = z.infer<typeof WorkflowAutomationHealthSummarySchema>;
