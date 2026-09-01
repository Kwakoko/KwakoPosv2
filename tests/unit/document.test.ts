import { describe, it, expect, beforeEach } from "vitest";
import { DocumentEngine } from "@kwakopos2/domain";

describe("Phase 40 — KwakoPos Document OS (KDAOL v1.0.0)", () => {
  let engine: DocumentEngine;

  beforeEach(() => {
    engine = new DocumentEngine();
  });

  it("should upload document, add version, and extract OCR text", () => {
    const u = engine.uploadDocument({
      documentId: "DOC-T1", tenantId: "TEN-01", title: "Business License 2026",
      documentType: "ID_PROOF", fileExtension: "pdf", mimeType: "application/pdf",
      sizeBytes: 524288, storageUrl: "s3://docs/license.pdf", uploadedByUserId: "USR-01",
    });
    expect(u.success).toBe(true);

    const v = engine.addDocumentVersion("DOC-T1", {
      storageUrl: "s3://docs/license-v2.pdf", sizeBytes: 600000,
      changeLog: "Renewed stamp", uploadedByUserId: "USR-01",
    });
    expect(v.document?.versionNumber).toBe(2);

    const ocr = engine.setOcrText("DOC-T1", "BRELA Business License #998877");
    expect(ocr.document?.ocrText).toContain("BRELA");

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.ocrExtractedCount).toBe(1);
  });
});
