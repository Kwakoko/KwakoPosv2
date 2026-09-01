import { randomUUID } from "crypto";
import type {
  TenantContext,
  PharmacyModuleManifest,
  PharmacySettings,
  MedicineMaster,
  BatchRecord,
  Prescription,
  PatientProfile,
  PharmacySafetyAlert,
} from "@kwakopos2/contracts";

export class PharmacyOperatingEngine {
  getModuleManifest(): PharmacyModuleManifest {
    return {
      moduleId: "pharmacy_operating_system",
      name: "KwakoPos Enterprise Pharmacy Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedFormats: ["RETAIL_PHARMACY", "HOSPITAL_PHARMACY", "WHOLESALE_PHARMACY", "CLINIC_DISPENSARY"],
      permissions: [
        "PHARMACY_MEDICINE_VIEW",
        "PHARMACY_MEDICINE_MANAGE",
        "PHARMACY_BATCH_MANAGE",
        "PHARMACY_EXPIRY_VIEW",
        "PHARMACY_PRESCRIPTION_VIEW",
        "PHARMACY_PRESCRIPTION_CREATE",
        "PHARMACY_DISPENSE_EXECUTE",
        "PHARMACY_DISPENSE_APPROVE",
        "PHARMACY_SAFETY_OVERRIDE",
        "PHARMACY_QUARANTINE_MANAGE",
        "PHARMACY_RECALL_EXECUTE",
      ],
      navigationRoutes: [
        "/pharmacy/dispensing",
        "/pharmacy/medicines",
        "/pharmacy/batches",
        "/pharmacy/expiry",
        "/pharmacy/prescriptions",
        "/pharmacy/patients",
        "/pharmacy/quarantine",
        "/pharmacy/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_today_dispensed",
        "widget_expiring_soon",
        "widget_pending_prescriptions",
        "widget_safety_alerts",
        "widget_quarantine_batches",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): PharmacySettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requirePharmacistApprovalForControlled: true,
      nearExpiryThresholdDays: 90,
      defaultDispensingStrategy: "FEFO",
      allowExpiredDispensing: false,
      autoAlertOnDrugInteraction: true,
      taxRatePct: 0.0,
    };
  }

  selectBatchFEFO(
    batches: BatchRecord[],
    quantityRequired: number
  ): {
    selectedBatches: Array<{ batchId: string; batchNumber: string; quantityToTake: number; expiryDate: string }>;
    fulfilled: boolean;
    remainingQuantity: number;
  } {
    const now = new Date();
    // 1. Filter out expired or non-available batches
    const validBatches = batches
      .filter((b) => b.status !== "EXPIRED" && b.status !== "QUARANTINED" && b.status !== "RECALLED" && new Date(b.expiryDate) > now)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    let needed = quantityRequired;
    const selectedBatches: Array<{ batchId: string; batchNumber: string; quantityToTake: number; expiryDate: string }> = [];

    for (const b of validBatches) {
      if (needed <= 0) break;
      const take = Math.min(needed, b.currentQuantity);
      if (take > 0) {
        selectedBatches.push({
          batchId: b.id,
          batchNumber: b.batchNumber,
          quantityToTake: take,
          expiryDate: typeof b.expiryDate === "string" ? b.expiryDate : new Date(b.expiryDate).toISOString(),
        });
        needed -= take;
      }
    }

    return {
      selectedBatches,
      fulfilled: needed === 0,
      remainingQuantity: needed,
    };
  }

  classifyExpiryStatus(
    expiryDateStr: string,
    thresholdDays: number = 90
  ): "SAFE" | "APPROACHING_EXPIRY" | "CRITICAL" | "EXPIRED" {
    const now = new Date();
    const expiry = new Date(expiryDateStr);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "EXPIRED";
    if (diffDays <= 30) return "CRITICAL";
    if (diffDays <= thresholdDays) return "APPROACHING_EXPIRY";
    return "SAFE";
  }

  evaluateDrugSafety(
    ctx: TenantContext,
    medicine: MedicineMaster,
    patient?: PatientProfile,
    activeDispensingIngredients: string[] = []
  ): PharmacySafetyAlert[] {
    const alerts: PharmacySafetyAlert[] = [];
    const now = new Date().toISOString();

    // 1. Duplicate Active Ingredient Check
    for (const ing of medicine.activeIngredients) {
      if (activeDispensingIngredients.includes(ing.name)) {
        alerts.push({
          id: `ALERT-ING-${randomUUID().slice(0, 6)}`,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          alertType: "DUPLICATE_ACTIVE_INGREDIENT",
          severity: "HIGH",
          message: `Duplicate active ingredient '${ing.name}' detected in current dispensing session.`,
          evidence: `Medicine ${medicine.brandName} (${medicine.genericName}) contains ${ing.name} which is already in patient cart.`,
          actionTaken: "PENDING",
          createdAt: now,
        });
      }
    }

    // 2. Patient Allergy Conflict Check
    if (patient && patient.knownAllergies) {
      for (const allergy of patient.knownAllergies) {
        if (
          medicine.genericName.toLowerCase().includes(allergy.toLowerCase()) ||
          medicine.brandName.toLowerCase().includes(allergy.toLowerCase())
        ) {
          alerts.push({
            id: `ALERT-ALLERGY-${randomUUID().slice(0, 6)}`,
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            alertType: "ALLERGY_CONFLICT",
            severity: "CRITICAL",
            message: `Allergy Conflict! Patient ${patient.name} is allergic to '${allergy}'.`,
            evidence: `Prescribed medicine ${medicine.brandName} matches recorded patient allergy profile.`,
            actionTaken: "PENDING",
            createdAt: now,
          });
        }
      }
    }

    return alerts;
  }

  validateBatchExpiry(
    expiryDateStr: string,
    currentDate: Date = new Date()
  ): { isExpired: boolean; daysRemaining: number } {
    const expiry = new Date(expiryDateStr);
    const diffMs = expiry.getTime() - currentDate.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return {
      isExpired: daysRemaining <= 0,
      daysRemaining,
    };
  }

  assertPrescriptionValidForDispense(prescription: any, currentDate: Date = new Date()): boolean {
    if (!prescription) throw new Error("Prescription is required");
    for (const item of prescription.items || []) {
      if (item.expiryDate && new Date(item.expiryDate) < currentDate) {
        throw new Error(
          `PHARMACY_VIOLATION: Cannot dispense expired batch '${item.batchNumber}' for medicine '${item.medicineName}'`
        );
      }
    }
    return true;
  }
}

export const globalPharmacyOperatingEngine = new PharmacyOperatingEngine();
export const globalPharmacyEngine = globalPharmacyOperatingEngine;
export { PharmacyOperatingEngine as PharmacyEngine };
