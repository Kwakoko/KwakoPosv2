import { describe, it, expect } from "vitest";
import { RestaurantEngine } from "@kwakopos2/domain";
import type { RestaurantTable } from "@kwakopos2/contracts";

describe("Industry Engine: Restaurant", () => {
  const engine = new RestaurantEngine();

  it("calculates table occupancy rate correctly", () => {
    const tables: RestaurantTable[] = [
      { id: "1", tenantId: "t1", branchId: "b1", tableNumber: "T1", capacity: 4, status: "OCCUPIED", floorArea: "MAIN", currentOrderId: null, assignedStaffId: null, createdAt: "", updatedAt: "" },
      { id: "2", tenantId: "t1", branchId: "b1", tableNumber: "T2", capacity: 4, status: "AVAILABLE", floorArea: "MAIN", currentOrderId: null, assignedStaffId: null, createdAt: "", updatedAt: "" },
      { id: "3", tenantId: "t1", branchId: "b1", tableNumber: "T3", capacity: 2, status: "OCCUPIED", floorArea: "TERRACE", currentOrderId: null, assignedStaffId: null, createdAt: "", updatedAt: "" },
      { id: "4", tenantId: "t1", branchId: "b1", tableNumber: "T4", capacity: 6, status: "RESERVED", floorArea: "MAIN", currentOrderId: null, assignedStaffId: null, createdAt: "", updatedAt: "" },
    ];

    expect(engine.calculateTableOccupancyRate(tables)).toBe(50); // 2 out of 4 occupied = 50%
  });

  it("calculates service charges and total bill", () => {
    const { serviceCharge, grandTotal } = engine.calculateServiceCharge(50000, 10);
    expect(serviceCharge).toBe(5000);
    expect(grandTotal).toBe(55000);
  });

  it("splits bill evenly among dinner guests with integer balancing", () => {
    const shares = engine.splitBillEvenly(55000, 3);
    expect(shares).toHaveLength(3);
    // 55000 / 3 = 18333 with 1 remaining -> [18334, 18333, 18333]
    expect(shares[0]).toBe(18334);
    expect(shares[1]).toBe(18333);
    expect(shares[2]).toBe(18333);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(55000);
  });
});
