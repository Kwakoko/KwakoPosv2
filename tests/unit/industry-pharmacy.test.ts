import { describe, it, expect } from "vitest";
import { PharmacyEngine } from "@kwakopos2/domain";
import type { PharmacyPrescription } from "@kwakopos2/contracts";

describe("Industry Engine: Pharmacy", () => {
  const engine = new PharmacyEngine();
  const refDate = new Date("2026-08-27T00:00:00Z");

  it("checks batch expiry accurately", () => {
    const validBatch = engine.validateBatchExpiry("2026-12-31T00:00:00Z", refDate);
    expect(validBatch.isExpired).toBe(false);
    expect(validBatch.daysRemaining).toBeGreaterThan(0);

    const expiredBatch = engine.validateBatchExpiry("2026-08-01T00:00:00Z", refDate);
    expect(expiredBatch.isExpired).toBe(true);
    expect(expiredBatch.daysRemaining).toBeLessThanOrEqual(0);
  });

  it("prevents dispensing expired medication batches", () => {
    const validPrescription: PharmacyPrescription = {
      id: "pres-1",
      tenantId: "t1",
      branchId: "b1",
      prescriptionNumber: "RX-1001",
      patientName: "John Doe",
      patientAge: 35,
      doctorName: "Dr. Smith",
      doctorLicenseNumber: "MED-9921",
      status: "VALIDATED",
      items: [
        {
          id: "item-1",
          medicineName: "Amoxicillin 500mg",
          activeIngredient: "Amoxicillin",
          dosage: "500mg",
          frequency: "3x daily",
          durationDays: 7,
          quantity: 21,
          batchNumber: "B-2026-09",
          expiryDate: "2026-09-30T00:00:00Z",
        },
      ],
      dispensedByUserId: null,
      dispensedAt: null,
      createdAt: "",
      updatedAt: "",
    };

    expect(() =>
      engine.assertPrescriptionValidForDispense(validPrescription, refDate)
    ).not.toThrow();

    const expiredPrescription: PharmacyPrescription = {
      ...validPrescription,
      items: [
        {
          ...validPrescription.items[0],
          batchNumber: "B-EXP-OLD",
          expiryDate: "2026-07-01T00:00:00Z",
        },
      ],
    };

    expect(() =>
      engine.assertPrescriptionValidForDispense(expiredPrescription, refDate)
    ).toThrow(/PHARMACY_VIOLATION: Cannot dispense expired batch/);
  });
});
