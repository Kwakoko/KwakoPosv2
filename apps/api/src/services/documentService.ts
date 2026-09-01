import { DocumentEngine } from "@kwakopos2/domain";
import { DocumentType } from "@kwakopos2/contracts";

export class DocumentService {
  private engine: DocumentEngine;

  constructor(engine?: DocumentEngine) {
    this.engine = engine ?? new DocumentEngine();
  }

  public getEngine(): DocumentEngine {
    return this.engine;
  }

  public uploadDocument(params: Parameters<DocumentEngine["uploadDocument"]>[0]) {
    return this.engine.uploadDocument(params);
  }

  public getDocument(documentId: string) {
    return this.engine.getDocument(documentId);
  }

  public listDocuments(tenantId: string, filters?: { linkedEntityType?: string; linkedEntityId?: string; documentType?: DocumentType }) {
    return this.engine.listDocuments(tenantId, filters);
  }

  public addDocumentVersion(documentId: string, params: Parameters<DocumentEngine["addDocumentVersion"]>[1]) {
    return this.engine.addDocumentVersion(documentId, params);
  }

  public setOcrText(documentId: string, ocrText: string) {
    return this.engine.setOcrText(documentId, ocrText);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalDocumentService = new DocumentService();
