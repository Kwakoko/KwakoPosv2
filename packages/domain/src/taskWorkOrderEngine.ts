import type {
  WorkforceTask,
  WorkOrder,
  CreateWorkforceTaskRequest,
  UpdateWorkforceTaskRequest,
  CreateWorkOrderRequest,
  UpdateWorkOrderRequest,
  TenantContext,
} from "@kwakopos2/contracts";
import { assertLaborCostReconciliation } from "./workforceInvariants.js";
import { randomUUID } from "crypto";

export class TaskWorkOrderEngine {
  /**
   * Creates a WorkforceTask in BACKLOG or ASSIGNED state.
   */
  static createTask(ctx: TenantContext, req: CreateWorkforceTaskRequest): WorkforceTask {
    const now = new Date().toISOString();
    const initialStatus = req.assignedEmployeeId ? "ASSIGNED" : "BACKLOG";

    return {
      id: req.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      title: req.title,
      description: req.description || null,
      taskType: req.taskType || "GENERAL",
      priority: req.priority || "MEDIUM",
      status: initialStatus,
      assignedEmployeeId: req.assignedEmployeeId || null,
      assignedTeam: req.assignedTeam || null,
      dueDate: req.dueDate ? new Date(req.dueDate).toISOString() : null,
      checklist: req.checklist || [],
      attachments: [],
      relatedEntityType: req.relatedEntityType || null,
      relatedEntityId: req.relatedEntityId || null,
      completedAt: null,
      verifiedById: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Updates a task status and sets completed/verified timestamps.
   */
  static updateTask(
    task: WorkforceTask,
    req: UpdateWorkforceTaskRequest,
    actorUserId?: string
  ): WorkforceTask {
    const now = new Date().toISOString();
    let completedAt = task.completedAt;
    let verifiedById = task.verifiedById;
    let verifiedAt = task.verifiedAt;

    if (req.status === "COMPLETED" && !completedAt) {
      completedAt = now;
    }
    if (req.status === "VERIFIED") {
      verifiedById = actorUserId || null;
      verifiedAt = now;
    }

    return {
      ...task,
      title: req.title || task.title,
      description: req.description !== undefined ? req.description : task.description,
      priority: req.priority || task.priority,
      status: req.status || task.status,
      assignedEmployeeId: req.assignedEmployeeId !== undefined ? req.assignedEmployeeId : task.assignedEmployeeId,
      dueDate: req.dueDate !== undefined ? (req.dueDate ? new Date(req.dueDate).toISOString() : null) : task.dueDate,
      checklist: req.checklist || task.checklist,
      completedAt,
      verifiedById,
      verifiedAt,
      updatedAt: now,
    };
  }

  /**
   * Creates a WorkOrder and calculates Labor Cost and Grand Total.
   */
  static createWorkOrder(
    ctx: TenantContext,
    req: CreateWorkOrderRequest,
    sequence: number
  ): WorkOrder {
    const now = new Date().toISOString();
    const workOrderNumber = req.workOrderNumber || `WO-${ctx.branchId.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}-${String(sequence).padStart(4, "0")}`;

    const laborHours = Number(req.laborHours) || 0;
    const laborRate = Number(req.laborRate) || 0;
    const laborCostTotal = Math.round(laborHours * laborRate * 100) / 100;
    const materialsCostTotal = Math.round((Number(req.materialsCostTotal) || 0) * 100) / 100;
    const grandTotal = Math.round((laborCostTotal + materialsCostTotal) * 100) / 100;

    assertLaborCostReconciliation(laborHours, laborRate, laborCostTotal);

    return {
      id: req.id || randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      workOrderNumber,
      customerId: req.customerId || null,
      projectId: req.projectId || null,
      title: req.title,
      description: req.description || null,
      priority: req.priority || "MEDIUM",
      status: "DRAFT",
      scheduledStart: req.scheduledStart ? new Date(req.scheduledStart).toISOString() : null,
      scheduledEnd: req.scheduledEnd ? new Date(req.scheduledEnd).toISOString() : null,
      assignedEmployeeId: req.assignedEmployeeId || null,
      laborHours,
      laborRate,
      laborCostTotal,
      materialsCostTotal,
      grandTotal,
      notes: req.notes || null,
      approvedById: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Updates a WorkOrder, recalculating totals if hours, rate, or materials change.
   */
  static updateWorkOrder(
    workOrder: WorkOrder,
    req: UpdateWorkOrderRequest,
    approverUserId?: string
  ): WorkOrder {
    const now = new Date().toISOString();
    const laborHours = req.laborHours !== undefined ? Number(req.laborHours) : Number(workOrder.laborHours);
    const laborRate = req.laborRate !== undefined ? Number(req.laborRate) : Number(workOrder.laborRate);
    const laborCostTotal = Math.round(laborHours * laborRate * 100) / 100;
    const materialsCostTotal =
      req.materialsCostTotal !== undefined ? Number(req.materialsCostTotal) : Number(workOrder.materialsCostTotal);
    const grandTotal = Math.round((laborCostTotal + materialsCostTotal) * 100) / 100;

    let approvedById = workOrder.approvedById;
    let approvedAt = workOrder.approvedAt;
    if (req.status === "COMPLETED" && approverUserId) {
      approvedById = approverUserId;
      approvedAt = now;
    }

    return {
      ...workOrder,
      title: req.title || workOrder.title,
      description: req.description !== undefined ? req.description : workOrder.description,
      status: req.status || workOrder.status,
      assignedEmployeeId: req.assignedEmployeeId !== undefined ? req.assignedEmployeeId : workOrder.assignedEmployeeId,
      laborHours,
      laborRate,
      laborCostTotal,
      materialsCostTotal,
      grandTotal,
      notes: req.notes !== undefined ? req.notes : workOrder.notes,
      approvedById,
      approvedAt,
      updatedAt: now,
    };
  }
}
