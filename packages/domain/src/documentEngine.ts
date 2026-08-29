import {
  DocumentRecord, DocumentVersion, DocumentHealthSummary, DocumentAuditEntry,
  DocumentType, DocumentAccessLevel,
} from "@kwakopos2/contracts";

export class DocumentEngine {
  private documents: Map<string, DocumentRecord> = new Map();
  private versions: Map<string, DocumentVersion[]> = new Map();
  private auditLedger: DocumentAuditEntry[] = [];

  public uploadDocument(params: Omit<DocumentRecord, "createdAt" | "updatedAt" | "versionNumber" | "accessLevel"> & {
    accessLevel?: DocumentAccessLevel;
  }): {
    success: boolean; document?: DocumentRecord; error?: string;
  } {
    if (!params.documentId || !params.tenantId || !params.title || !params.storageUrl) {
      return { success: false, error: "documentId, tenantId, title, and storageUrl are required" };
    }

    const now = new Date().toISOString();
    const doc: DocumentRecord = {
      ...params,
      accessLevel: params.accessLevel ?? "INTERNAL",
      versionNumber: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.documents.set(params.documentId, doc);

    const initialVersion: DocumentVersion = {
      versionId: `VER-1-${params.documentId}`,
      documentId: params.documentId,
      tenantId: params.tenantId,
      versionNumber: 1,
      storageUrl: params.storageUrl,
      sizeBytes: params.sizeBytes,
      changeLog: "Initial upload",
      uploadedByUserId: params.uploadedByUserId,
      createdAt: now,
    };

    this.versions.set(params.documentId, [initialVersion]);
    this._writeAudit(params.tenantId, "DOCUMENT_UPLOADED", params.uploadedByUserId, params.documentId,
      `Document uploaded: ${params.title} (${params.documentType})`);

    return { success: true, document: doc };
  }

  public getDocument(documentId: string): DocumentRecord | undefined {
    return this.documents.get(documentId);
  }

  public listDocuments(tenantId: string, filters?: { linkedEntityType?: string; linkedEntityId?: string; documentType?: DocumentType }): DocumentRecord[] {
    return Array.from(this.documents.values()).filter(d => {
      if (d.tenantId !== tenantId) return false;
      if (filters?.linkedEntityType && d.linkedEntityType !== filters.linkedEntityType) return false;
      if (filters?.linkedEntityId && d.linkedEntityId !== filters.linkedEntityId) return false;
      if (filters?.documentType && d.documentType !== filters.documentType) return false;
      return true;
    });
  }

  public addDocumentVersion(documentId: string, params: {
    storageUrl: string; sizeBytes: number; changeLog: string; uploadedByUserId: string;
  }): { success: boolean; document?: DocumentRecord; version?: DocumentVersion; error?: string } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false, error: "Document not found" };

    const newVersionNum = doc.versionNumber + 1;
    const now = new Date().toISOString();

    const version: DocumentVersion = {
      versionId: `VER-${newVersionNum}-${documentId}`,
      documentId,
      tenantId: doc.tenantId,
      versionNumber: newVersionNum,
      storageUrl: params.storageUrl,
      sizeBytes: params.sizeBytes,
      changeLog: params.changeLog,
      uploadedByUserId: params.uploadedByUserId,
      createdAt: now,
    };

    doc.versionNumber = newVersionNum;
    doc.storageUrl = params.storageUrl;
    doc.sizeBytes = params.sizeBytes;
    doc.updatedAt = now;

    const vList = this.versions.get(documentId) ?? [];
    vList.push(version);
    this.versions.set(documentId, vList);

    this._writeAudit(doc.tenantId, "NEW_VERSION_ADDED", params.uploadedByUserId, documentId, `Version ${newVersionNum} added`);

    return { success: true, document: doc, version };
  }

  public setOcrText(documentId: string, ocrText: string): { success: boolean; document?: DocumentRecord } {
    const doc = this.documents.get(documentId);
    if (!doc) return { success: false };
    doc.ocrText = ocrText;
    doc.updatedAt = new Date().toISOString();
    this._writeAudit(doc.tenantId, "OCR_EXTRACTED", "SYSTEM", documentId, `OCR text extracted (${ocrText.length} chars)`);
    return { success: true, document: doc };
  }

  public getHealthSummary(tenantId: string): DocumentHealthSummary {
    const docs = this.listDocuments(tenantId);
    const totalStorage = docs.reduce((acc, d) => acc + d.sizeBytes, 0);
    const confidentialCount = docs.filter(d => d.accessLevel === "CONFIDENTIAL" || d.accessLevel === "RESTRICTED").length;
    const ocrCount = docs.filter(d => Boolean(d.ocrText)).length;

    return {
      tenantId,
      engineOperational: true,
      totalDocumentsCount: docs.length,
      totalStorageSizeBytes: totalStorage,
      confidentialDocumentsCount: confidentialCount,
      ocrExtractedCount: ocrCount,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): DocumentAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: DocumentAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenantId,
      eventType,
      actorId,
      targetEntityId,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
