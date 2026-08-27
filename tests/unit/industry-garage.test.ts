import { describe, it, expect } from "vitest";
import { GarageEngine } from "@kwakopos2/domain";
import type { GarageWorkOrder } from "@kwakopos2/contracts";

describe("Industry Engine: Garage", () => {
  const engine = new GarageEngine();

  it("calculates labor and parts costing accurately", () => {
    const { laborCostTotal, grandTotal } = engine.calculateWorkOrderCost(
      150000, // parts cost (e.g. brake pads + discs)
      3.5,    // labor hours
      30000   // hourly labor rate
    );

    expect(laborCostTotal).toBe(105000);
    expect(grandTotal).toBe(255000);
  });

  it("enforces QA review rules before vehicle delivery", () => {
    const wo: GarageWorkOrder = {
      id: "wo-1",
      tenantId: "t1",
      branchId: "b1",
      workOrderNumber: "WO-2026-001",
      vehicleId: "veh-1",
      customerId: "cust-1",
      assignedTechnicianId: "tech-1",
      status: "QA_REVIEW",
      issueDescription: "Engine knocking noise",
      diagnosis: "Replaced timing belt tensioner",
      partsCostTotal: 80000,
      laborHours: 4,
      laborRate: 25000,
      laborCostTotal: 100000,
      grandTotal: 180000,
      qaPassed: false,
      qaInspectorId: null,
      createdAt: "",
      updatedAt: "",
    };

    expect(() => engine.assertQaSignoffAllowed(wo)).not.toThrow();

    const intakeWo: GarageWorkOrder = {
      ...wo,
      status: "INTAKE",
    };
    expect(() => engine.assertQaSignoffAllowed(intakeWo)).toThrow(
      /GARAGE_VIOLATION: Cannot QA signoff work order/
    );
  });
});
