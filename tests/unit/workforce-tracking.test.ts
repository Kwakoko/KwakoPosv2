import { describe, it, expect } from "vitest";
import { WorkforceTrackingEngine } from "@kwakopos2/domain";
import { runWorkforceCertification } from "../../scripts/certification/workforce-certification-engine.js";

describe("Advanced Workforce Tracking & Time Management Test Suite", () => {
  const engine = new WorkforceTrackingEngine();

  it("should onboard worker profile and enforce skill-based task assignment gating", () => {
    const worker = engine.createWorker({
      employeeNumber: "EMP-001",
      name: "Bakari Mkwawa",
      email: "bakari@kwakopos.com",
      department: "Engineering",
      team: "Field Ops",
      role: "High Voltage Specialist",
      workerType: "FIELD_TECHNICIAN",
      skills: ["Electrical Wiring"],
      certifications: [{ name: "High Voltage License Level 2", issuedDate: "2025-01-01", expiryDate: "2027-01-01" }],
      costRateTzs: 20000,
      billingRateTzs: 35000,
    });

    expect(worker.workerId.startsWith("WRK-")).toBe(true);

    const validCheck = engine.verifyTaskAssignment(worker.workerId, "High Voltage License Level 2");
    expect(validCheck.allowed).toBe(true);

    const invalidCheck = engine.verifyTaskAssignment(worker.workerId, "Crane Operator License");
    expect(invalidCheck.allowed).toBe(false);
  });

  it("should record immutable clock events and enforce attendance state machine", () => {
    const shift = engine.createShift({
      name: "Day Shift",
      startTime: "08:00",
      endTime: "17:00",
      breakDurationMinutes: 60,
      requiredStaffing: 5,
      location: "Main Yard",
    });

    const worker = engine.createWorker({
      employeeNumber: "EMP-002",
      name: "Farida Hassan",
      email: "farida@kwakopos.com",
      department: "Logistics",
      team: "Fleet Team",
      role: "Driver",
      workerType: "DRIVER",
      skills: ["Heavy Vehicle Driving"],
      certifications: [],
      costRateTzs: 15000,
      billingRateTzs: 25000,
    });

    const clockIn = engine.recordClockEvent({
      workerId: worker.workerId,
      shiftId: shift.shiftId,
      eventType: "CLOCK_IN",
      deviceId: "MOB-02",
    });
    expect(clockIn.success).toBe(true);

    const duplicateIn = engine.recordClockEvent({
      workerId: worker.workerId,
      shiftId: shift.shiftId,
      eventType: "CLOCK_IN",
      deviceId: "MOB-02",
    });
    expect(duplicateIn.success).toBe(false);
  });

  it("should calculate project labor cost and billable revenue accurately", () => {
    const worker = engine.createWorker({
      employeeNumber: "EMP-003",
      name: "John Doe",
      email: "john@kwakopos.com",
      department: "Construction",
      team: "BOQ Team",
      role: "Civil Engineer",
      workerType: "PERMANENT",
      skills: ["Concrete Laying"],
      certifications: [],
      costRateTzs: 25000,
      billingRateTzs: 40000,
    });

    const costing = engine.calculateProjectLaborCost("PRJ-101", "TSK-01", worker.workerId, 10);
    expect(costing.totalLaborCostTzs).toBe(250000);
    expect(costing.billableRevenueTzs).toBe(400000);
  });

  it("should generate timesheets from approved attendance", () => {
    const ts = engine.generateTimesheet("WRK-001", 160, 10);
    expect(ts.regularHours).toBe(160);
    expect(ts.overtimeHours).toBe(10);
    expect(ts.approvalStatus).toBe("APPROVED");
  });

  it("should pass 100% of the 58-Pillar Workforce certification campaign", () => {
    const cert = runWorkforceCertification();
    expect(cert.totalPillars).toBe(58);
    expect(cert.passedPillars).toBe(58);
    expect(cert.failedPillars).toBe(0);
    expect(cert.successRatePct).toBe(100);
  });
});
