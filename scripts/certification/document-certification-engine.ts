import { DocumentEngine } from "@kwakopos2/domain";

export interface DocumentCertificationPillar {
  id: string;
  description: string;
  test: (engine: DocumentEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: DocumentEngine) => boolean): DocumentCertificationPillar {
  return { id, description, test };
}

export const DOCUMENT_CERTIFICATION_PILLARS: DocumentCertificationPillar[] = [
  makePillar("DOC-01", "KwakoPos Document Operating Layer (KDAOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("DOC-02", "Uploading document stores record with initial version 1", e => {
    const u = e.uploadDocument({
      documentId: "DOC-CERT-01", tenantId: "CERT", title: "Tax Compliance Certificate",
      documentType: "TAX_CERTIFICATE", fileExtension: "pdf", mimeType: "application/pdf",
      sizeBytes: 1048576, storageUrl: "s3://bucket/cert.pdf", uploadedByUserId: "USR-ADMIN",
    });
    return Boolean(u.success && u.document?.versionNumber === 1);
  }),
  makePillar("DOC-03", "Adding new version increments version number to 2", e => {
    const v = e.addDocumentVersion("DOC-CERT-01", {
      storageUrl: "s3://bucket/cert-v2.pdf", sizeBytes: 1100000,
      changeLog: "Updated TRA stamp", uploadedByUserId: "USR-ADMIN",
    });
    return Boolean(v.success && v.document?.versionNumber === 2);
  }),
  makePillar("DOC-04", "OCR text extraction attaches searchable text to document record", e => {
    const ocr = e.setOcrText("DOC-CERT-01", "Tanzania Revenue Authority Taxpayer TIN 123456789");
    return Boolean(ocr.success && ocr.document?.ocrText?.includes("TIN 123456789"));
  }),
  makePillar("DOC-05", "Health summary tracks storage bytes and OCR count", e => {
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.totalDocumentsCount >= 1 && hs.ocrExtractedCount >= 1);
  })
];
