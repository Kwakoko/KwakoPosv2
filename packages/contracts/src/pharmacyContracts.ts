import { z } from "zod";

export const PharmacyModuleManifestSchema = z.object({
  moduleId: z.literal("pharmacy_operating_system"),
  name: z.string(),
  version: z.string(),
  status: z.enum(["INSTALLED", "ACTIVE", "MAINTENANCE"]),
  supportedFormats: z.array(
    z.enum(["RETAIL_PHARMACY", "HOSPITAL_PHARMACY", "WHOLESALE_PHARMACY", "CLINIC_DISPENSARY"])
  ),
  permissions: z.array(z.string()),
  navigationRoutes: z.array(z.string()),
  dashboardWidgetIds: z.array(z.string()),
});
export type PharmacyModuleManifest = z.infer<typeof PharmacyModuleManifestSchema>;

export const PharmacySettingsSchema = z.object({
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  currency: z.string().default("TZS"),
  requirePharmacistApprovalForControlled: z.boolean().default(true),
  nearExpiryThresholdDays: z.number().default(90),
  defaultDispensingStrategy: z.enum(["FEFO", "FIFO"]).default("FEFO"),
  allowExpiredDispensing: z.boolean().default(false),
  autoAlertOnDrugInteraction: z.boolean().default(true),
  taxRatePct: z.number().default(0.0), // Medical exemptions
});
export type PharmacySettings = z.infer<typeof PharmacySettingsSchema>;

export const ActiveIngredientSchema = z.object({
  name: z.string(),
  strength: z.string(),
});
export type ActiveIngredient = z.infer<typeof ActiveIngredientSchema>;

export const MedicineMasterSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  genericName: z.string(),
  brandName: z.string(),
  activeIngredients: z.array(ActiveIngredientSchema),
  dosageForm: z.enum([
    "TABLET",
    "CAPSULE",
    "SYRUP",
    "SUSPENSION",
    "CREAM",
    "OINTMENT",
    "GEL",
    "DROPS",
    "INHALER",
    "INJECTION",
    "SUPPOSITORIES",
    "POWDER",
    "SOLUTION",
    "MEDICAL_SUPPLY",
  ]),
  strength: z.string(),
  routeOfAdministration: z.string(),
  packSize: z.number(),
  unitOfMeasure: z.string(),
  gtinBarcode: z.string().optional(),
  sku: z.string(),
  requiresPrescription: z.boolean().default(false),
  isControlledSubstance: z.boolean().default(false),
  purchasePrice: z.number(),
  sellingPrice: z.number(),
  reorderLevel: z.number().default(20),
});
export type MedicineMaster = z.infer<typeof MedicineMasterSchema>;

export const BatchRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  medicineId: z.string().uuid(),
  batchNumber: z.string(),
  supplierId: z.string().uuid(),
  manufacturingDate: z.string().or(z.date()),
  expiryDate: z.string().or(z.date()),
  initialQuantity: z.number(),
  currentQuantity: z.number(),
  unitCost: z.number(),
  status: z.enum(["AVAILABLE", "NEAR_EXPIRY", "EXPIRED", "QUARANTINED", "RECALLED"]),
});
export type BatchRecord = z.infer<typeof BatchRecordSchema>;

export const PrescriptionItemSchema = z.object({
  medicineId: z.string().uuid(),
  medicineName: z.string(),
  dosage: z.string(),
  frequency: z.string(),
  durationDays: z.number(),
  quantityPrescribed: z.number(),
  quantityDispensed: z.number().default(0),
});
export type PrescriptionItem = z.infer<typeof PrescriptionItemSchema>;

export const PrescriptionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  prescriptionNumber: z.string(),
  patientId: z.string().uuid(),
  patientName: z.string(),
  prescriberName: z.string(),
  prescriberLicense: z.string().optional(),
  items: z.array(PrescriptionItemSchema),
  status: z.enum(["CREATED", "REVIEWED", "VALIDATED", "DISPENSING", "PARTIALLY_DISPENSED", "FULLY_DISPENSED", "CLOSED"]),
  createdAt: z.string().or(z.date()),
});
export type Prescription = z.infer<typeof PrescriptionSchema>;

export const DispensingRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  dispensingNumber: z.string(),
  prescriptionId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  medicineId: z.string().uuid(),
  batchId: z.string().uuid(),
  batchNumber: z.string(),
  quantityDispensed: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
  dispensedByUserId: z.string().uuid(),
  verifiedByPharmacistId: z.string().uuid().optional(),
  dispensedAt: z.string().or(z.date()),
});
export type DispensingRecord = z.infer<typeof DispensingRecordSchema>;

export const PatientProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  patientCode: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  knownAllergies: z.array(z.string()).default([]),
  chronicConditions: z.array(z.string()).default([]),
});
export type PatientProfile = z.infer<typeof PatientProfileSchema>;

export const QuarantineRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  batchId: z.string().uuid(),
  batchNumber: z.string(),
  medicineId: z.string().uuid(),
  quantityQuarantined: z.number(),
  reason: z.string(),
  status: z.enum(["UNDER_INVESTIGATION", "RELEASED", "DISPOSED", "RETURNED_TO_SUPPLIER"]),
  quarantinedAt: z.string().or(z.date()),
});
export type QuarantineRecord = z.infer<typeof QuarantineRecordSchema>;

export const RecallRecordSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  recallNumber: z.string(),
  batchNumber: z.string(),
  medicineId: z.string().uuid(),
  reason: z.string(),
  status: z.enum(["INITIATED", "IN_PROGRESS", "CLOSED"]),
  affectedBranches: z.array(z.string().uuid()),
  initiatedAt: z.string().or(z.date()),
});
export type RecallRecord = z.infer<typeof RecallRecordSchema>;

export const PharmacySafetyAlertSchema = z.object({
  id: z.string(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid(),
  alertType: z.enum([
    "DUPLICATE_ACTIVE_INGREDIENT",
    "DRUG_INTERACTION",
    "EXCESSIVE_QUANTITY",
    "ALLERGY_CONFLICT",
    "EXPIRED_BATCH_BLOCKED",
    "CONTROLLED_SUBSTANCE_OVERRIDE",
  ]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  message: z.string(),
  evidence: z.string(),
  actionTaken: z.enum(["PENDING", "ACCEPTED", "DISMISSED", "BLOCKED"]),
  reviewedByUserId: z.string().uuid().optional(),
  createdAt: z.string().or(z.date()),
});
export type PharmacySafetyAlert = z.infer<typeof PharmacySafetyAlertSchema>;

export const PharmacyEvidencePackageSchema = z.object({
  exerciseId: z.string(),
  timestamp: z.string(),
  environment: z.string(),
  appVersion: z.string(),
  gitSha: z.string(),
  overallScore: z.number(),
  status: z.enum(["CERTIFIED", "CONDITIONAL", "FAILED"]),
  evaluations: z.array(
    z.object({
      pillarId: z.number(),
      pillarName: z.string(),
      passed: z.boolean(),
      details: z.string(),
    })
  ),
  digest: z.string(),
});
export type PharmacyEvidencePackage = z.infer<typeof PharmacyEvidencePackageSchema>;
