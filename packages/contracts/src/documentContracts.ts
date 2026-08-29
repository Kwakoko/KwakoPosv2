import { z } from "zod";

// ============================================================
// Phase 40 — KwakoPos Document & Asset Contracts (KDAOL v1.0.0)
// ============================================================

export const DocumentTypeEnum = z.enum([
  "INVOICE", "RECEIPT", "PURCHASE_ORDER", "CONTRACT", "ID_PROOF", "TAX_CERTIFICATE",
  "PRODUCT_IMAGE", "WORK_ORDER_ATTACHMENT", "LEGAL_BRIEF", "MEDICAL_RECORD", "CUSTOM",
]);
export type DocumentType = z.infer<typeof DocumentTypeEnum>;

export const DocumentAccessLevelEnum = z.enum([
  "PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED",
]);
export type DocumentAccessLevel = z.infer<typeof DocumentAccessLevelEnum>;

export const DocumentRecordSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  branchId: z.string().optional(),
  title: z.string(),
  documentType: DocumentTypeEnum,
  fileExtension: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  storageUrl: z.string(),
  accessLevel: DocumentAccessLevelEnum.default("INTERNAL"),
  linkedEntityType: z.string().optional(),
  linkedEntityId: z.string().optional(),
  ocrText: z.string().optional(),
  uploadedByUserId: z.string(),
  versionNumber: z.number().int().positive().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DocumentRecord = z.infer<typeof DocumentRecordSchema>;

export const DocumentVersionSchema = z.object({
  versionId: z.string(),
  documentId: z.string(),
  tenantId: z.string(),
  versionNumber: z.number().int().positive(),
  storageUrl: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  changeLog: z.string(),
  uploadedByUserId: z.string(),
  createdAt: z.string(),
});
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentHealthSummarySchema = z.object({
  tenantId: z.string(),
  engineOperational: z.boolean(),
  totalDocumentsCount: z.number().int().nonnegative(),
  totalStorageSizeBytes: z.number().int().nonnegative(),
  confidentialDocumentsCount: z.number().int().nonnegative(),
  ocrExtractedCount: z.number().int().nonnegative(),
  auditEntryCount: z.number().int().nonnegative(),
});
export type DocumentHealthSummary = z.infer<typeof DocumentHealthSummarySchema>;

export const DocumentAuditEntrySchema = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  eventType: z.enum([
    "DOCUMENT_UPLOADED", "DOCUMENT_UPDATED", "NEW_VERSION_ADDED",
    "DOCUMENT_DELETED", "DOCUMENT_ACCESSED", "OCR_EXTRACTED",
  ]),
  actorId: z.string(),
  targetEntityId: z.string(),
  details: z.string(),
  timestamp: z.string(),
});
export type DocumentAuditEntry = z.infer<typeof DocumentAuditEntrySchema>;
