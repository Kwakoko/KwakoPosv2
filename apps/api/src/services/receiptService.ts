import { globalReceiptRepository, ScopedReceiptRepository, ReceiptSearchFilter } from "@kwakopos2/database";
import { ReceiptEngine } from "@kwakopos2/domain";
import { TenantContext, CreateReceiptRequest, ReceiptDTO, ReceiptTemplateDTO } from "@kwakopos2/contracts";

export class ReceiptService {
  constructor(private repo: ScopedReceiptRepository = globalReceiptRepository) {}

  async createReceipt(ctx: TenantContext, req: CreateReceiptRequest): Promise<ReceiptDTO> {
    // Receipt sequencing, signing and persistence are authoritative repository concerns.
    // Prisma allocates the sequence in PostgreSQL; the in-memory repository is a test double.
    return this.repo.createReceipt(ctx, req as any);
  }
  async getReceiptById(ctx: TenantContext, id: string): Promise<ReceiptDTO | null> {
    return this.repo.getReceiptById(ctx, id);
  }

  async getReceiptByNumber(ctx: TenantContext, receiptNumber: string): Promise<ReceiptDTO | null> {
    return this.repo.getReceiptByNumber(ctx, receiptNumber);
  }

  async searchReceipts(ctx: TenantContext, filter: ReceiptSearchFilter) {
    return this.repo.searchReceipts(ctx, filter);
  }

  async recordReprint(ctx: TenantContext, receiptId: string, printedBy: string, reason?: string) {
    return this.repo.recordReprint(ctx, receiptId, printedBy, reason);
  }

  async recordShare(ctx: TenantContext, receiptId: string, channel: "EMAIL" | "SMS" | "WHATSAPP", recipient: string, sharedBy: string) {
    return this.repo.recordShare(ctx, receiptId, channel, recipient, sharedBy);
  }

  async updateReceiptStatus(ctx: TenantContext, receiptId: string, status: string, reason?: string, actorId?: string) {
    return this.repo.updateReceiptStatus(ctx, receiptId, status, reason, actorId);
  }

  async verifyReceipt(receiptNumber: string, signature?: string) {
    const found = await this.repo.getReceiptForPublicVerification(receiptNumber);

    if (!found) {
      return {
        receiptNumber,
        isValid: false,
        status: "NOT_FOUND",
        digitalSignatureValid: false,
        verificationMessage: `Receipt '${receiptNumber}' not found in official KwakoPos ledger.`,
        verifiedAt: new Date().toISOString(),
      };
    }

    const computedSignatureValid = ReceiptEngine.verifyReceiptSignature(found);
    const suppliedSignatureValid = !signature || signature.toLowerCase() === found.digitalSignature.toLowerCase();
    const digitalSignatureValid = computedSignatureValid && suppliedSignatureValid;

    return {
      receiptNumber,
      isValid: digitalSignatureValid && found.status !== "CANCELLED" && found.status !== "VOIDED",
      status: found.status,
      digitalSignatureValid,
      receipt: found,
      verificationMessage: digitalSignatureValid
        ? `Receipt '${receiptNumber}' is AUTHENTIC and certified.`
        : `WARNING: Receipt signature mismatch; possible tamper detected.`,
      verifiedAt: new Date().toISOString(),
    };
  }

  async renderThermal58mm(ctx: TenantContext, id: string): Promise<string> {
    const rcpt = await this.getReceiptById(ctx, id);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");
    const templates = await this.repo.getReceiptTemplates(ctx);
    return ReceiptEngine.renderThermal58mm(rcpt, templates[0]);
  }

  async renderThermal80mm(ctx: TenantContext, id: string): Promise<string> {
    const rcpt = await this.getReceiptById(ctx, id);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");
    const templates = await this.repo.getReceiptTemplates(ctx);
    return ReceiptEngine.renderThermal80mm(rcpt, templates[0]);
  }

  async renderA4Html(ctx: TenantContext, id: string): Promise<string> {
    const rcpt = await this.getReceiptById(ctx, id);
    if (!rcpt) throw new Error("RECEIPT_NOT_FOUND");
    const templates = await this.repo.getReceiptTemplates(ctx);
    return ReceiptEngine.renderA4Html(rcpt, templates[0]);
  }

  async getReceiptTemplates(ctx: TenantContext): Promise<ReceiptTemplateDTO[]> {
    return this.repo.getReceiptTemplates(ctx);
  }

  async saveReceiptTemplate(ctx: TenantContext, template: Partial<ReceiptTemplateDTO>): Promise<ReceiptTemplateDTO> {
    return this.repo.saveReceiptTemplate(ctx, template);
  }

  async getReceiptAnalytics(ctx: TenantContext) {
    return this.repo.getReceiptAnalytics(ctx);
  }
}

export const globalReceiptService = new ReceiptService();

