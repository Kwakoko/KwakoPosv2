import type {
  PharmacyPrescription,
  PharmacyPrescriptionItem,
  TenantContext,
} from "@kwakopos2/contracts";

export class PharmacyEngine {
  validateBatchExpiry(expiryDateStr: string, referenceDate = new Date()): { isExpired: boolean; daysRemaining: number } {
    const exp = new Date(expiryDateStr);
    const diffMs = exp.getTime() - referenceDate.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      isExpired: daysRemaining <= 0,
      daysRemaining,
    };
  }

  assertPrescriptionValidForDispense(prescription: PharmacyPrescription, referenceDate = new Date()): void {
    if (prescription.status === "DISPENSED") {
      throw new Error(`PHARMACY_VIOLATION: Prescription ${prescription.prescriptionNumber} has already been dispensed.`);
    }
    if (prescription.items.length === 0) {
      throw new Error(`PHARMACY_VIOLATION: Prescription ${prescription.prescriptionNumber} contains no medication items.`);
    }

    for (const item of prescription.items) {
      const { isExpired } = this.validateBatchExpiry(item.expiryDate, referenceDate);
      if (isExpired) {
        throw new Error(
          `PHARMACY_VIOLATION: Cannot dispense expired batch ${item.batchNumber} for medicine ${item.medicineName} (expired ${item.expiryDate}).`
        );
      }
    }
  }
}
