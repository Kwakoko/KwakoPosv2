import type {
  GarageWorkOrder,
  TenantContext,
} from "@kwakopos2/contracts";

export class GarageEngine {
  calculateWorkOrderCost(
    partsCostTotal: number,
    laborHours: number,
    laborRate: number
  ): { laborCostTotal: number; grandTotal: number } {
    const laborCostTotal = Math.round(laborHours * laborRate);
    const grandTotal = Math.round(partsCostTotal + laborCostTotal);
    return {
      laborCostTotal,
      grandTotal,
    };
  }

  assertQaSignoffAllowed(workOrder: GarageWorkOrder): void {
    if (workOrder.status !== "QA_REVIEW" && workOrder.status !== "IN_PROGRESS") {
      throw new Error(
        `GARAGE_VIOLATION: Cannot QA signoff work order ${workOrder.workOrderNumber} in status '${workOrder.status}'.`
      );
    }
    if (workOrder.laborHours <= 0) {
      throw new Error(
        `GARAGE_VIOLATION: Work order ${workOrder.workOrderNumber} must record labor hours before QA approval.`
      );
    }
  }
}
