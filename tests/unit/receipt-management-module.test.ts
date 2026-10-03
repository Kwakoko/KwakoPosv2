import { describe, it, expect, beforeEach } from "vitest";
import { ReceiptEngine, ReceiptNumberGenerator } from "../../packages/domain/src/receiptEngine.js";
import { InMemoryReceiptRepository } from "../../packages/database/src/receiptRepositories.ts";
import { ReceiptService } from "../../apps/api/src/services/receiptService.ts";
import { TenantContext, CreateReceiptRequest } from "../../packages/contracts/src/index.js";

describe("Production-Grade Receipt Management Module Test Suite", () => {
  let ctx: TenantContext;
  let repo: InMemoryReceiptRepository;
  let service: ReceiptService;

  beforeEach(() => {
    ctx = {
      tenantId: "TENANT-TEST-001",
      branchId: "BRANCH-DSM-001",
      userId: "USER-CASHIER-001",
      roles: ["CASHIER", "ADMIN"],
      permissions: ["*"],
    };
    repo = new InMemoryReceiptRepository();
    service = new ReceiptService(repo);
  });

  describe("ReceiptNumberGenerator", () => {
    it("should generate globally unique daily formatted receipt numbers", () => {
      const num1 = ReceiptNumberGenerator.generate({
        tenantPrefix: "TN1",
        branchPrefix: "BR1",
        sequenceType: "DAILY",
        sequenceNumber: 1,
        date: new Date(2026, 8, 2),
      });

      expect(num1).toBe("TN1-BR1-RCPT-20260902-000001");
    });

    it("must reject process-local sequence allocation", () => {
      expect(() => ReceiptNumberGenerator.generate({
        tenantPrefix: "TN1",
        branchPrefix: "BR1",
        sequenceType: "DAILY",
        date: new Date(2026, 8, 2),
      })).toThrow("RECEIPT_SEQUENCE_MUST_BE_DATABASE_ALLOCATED");
    });

    it("should pad sequence numbers up to 6 digits", () => {
      const num = ReceiptNumberGenerator.generate({
        tenantPrefix: "HQ",
        branchPrefix: "POS",
        sequenceType: "DAILY",
        sequenceNumber: 42,
        date: new Date(2026, 8, 2),
      });

      expect(num).toBe("HQ-POS-RCPT-20260902-000042");
    });
  });

  describe("ReceiptEngine SHA256 & Verification", () => {
    it("should compute deterministic SHA256 digital signatures", () => {
      const sig1 = ReceiptEngine.calculateDigitalSignature(
        "RCPT-20260902-000001",
        "TXN-1001",
        150000.0,
        "2026-09-02T10:00:00.000Z"
      );
      const sig2 = ReceiptEngine.calculateDigitalSignature(
        "RCPT-20260902-000001",
        "TXN-1001",
        150000.0,
        "2026-09-02T10:00:00.000Z"
      );

      expect(sig1).toHaveLength(64);
      expect(sig1).toBe(sig2);
    });

    it("should render thermal 80mm layout text", () => {
      const mockReceipt: any = {
        id: "R1",
        receiptNumber: "RCPT-20260902-000001",
        transactionId: "TXN-1001",
        transactionType: "POS_SALE",
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        cashierId: ctx.userId,
        cashierName: "Amani",
        subtotal: 10000,
        discountTotal: 0,
        taxTotal: 1800,
        grandTotal: 11800,
        paidAmount: 12000,
        changeAmount: 200,
        paymentMethod: "CASH",
        currency: "TZS",
        exchangeRate: 1,
        status: "COMPLETED",
        deviceId: "DEV-1",
        syncStatus: "SYNCED",
        digitalSignature: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        qrCodePayload: "https://pos.kwako.app/verify-receipt?receiptNumber=RCPT-20260902-000001",
        barcodePayload: "RCPT20260902000001",
        reprintCount: 0,
        createdAt: "2026-09-02T10:00:00.000Z",
        updatedAt: "2026-09-02T10:00:00.000Z",
        items: [
          { sku: "SKU1", name: "Product 1", qty: 2, unitPrice: 5000, discount: 0, taxRate: 18, taxAmount: 1800, lineTotal: 11800 },
        ],
      };

      const rendered = ReceiptEngine.renderThermal80mm(mockReceipt);
      expect(rendered).toContain("RCPT-20260902-000001");
      expect(rendered).toContain("Product 1");
      expect(rendered).toContain("11,800");
    });
  });

  describe("Receipt API Service Operations", () => {
    const createReq: CreateReceiptRequest = {
      transactionId: "TXN-TEST-999",
      transactionType: "POS_SALE",
      cashierId: "USER-CASHIER-001",
      cashierName: "Amani Mwangi",
      customerId: "CUST-100",
      customerName: "Baraka Juma",
      customerPhone: "+255754000111",
      customerEmail: "baraka@example.com",
      items: [
        { sku: "SKU-A", name: "Item A", qty: 2, unitPrice: 10000, discount: 0, taxRate: 18 },
        { sku: "SKU-B", name: "Item B", qty: 1, unitPrice: 20000, discount: 2000, taxRate: 18 },
      ],
      paidAmount: 50000,
      paymentMethod: "CASH",
      currency: "TZS",
      deviceId: "POS-DEV-01",
      notes: "Test transaction receipt creation",
    };

    it("should create, sign, and store receipt successfully", async () => {
      const receipt = await service.createReceipt(ctx, createReq);

      expect(receipt.id).toBeDefined();
      expect(receipt.receiptNumber).toContain("RCPT-");
      expect(receipt.digitalSignature).toHaveLength(64);
      expect(receipt.qrCodePayload).toContain("verify-receipt");
      expect(receipt.grandTotal).toBeGreaterThan(0);
      expect(receipt.status).toBe("COMPLETED");
    });

    it("should search receipts by query", async () => {
      const receipt = await service.createReceipt(ctx, createReq);
      const searchResult = await service.searchReceipts(ctx, { query: "Baraka" });

      expect(searchResult.total).toBe(1);
      expect(searchResult.receipts[0].receiptNumber).toBe(receipt.receiptNumber);
    });

    it("should record reprint attempt and update reprint counter", async () => {
      const receipt = await service.createReceipt(ctx, createReq);
      const reprintRes = await service.recordReprint(ctx, receipt.id, ctx.userId, "Customer lost paper copy");

      expect(reprintRes.success).toBe(true);
      expect(reprintRes.reprintCount).toBe(1);

      const fetched = await service.getReceiptById(ctx, receipt.id);
      expect(fetched?.reprintCount).toBe(1);
    });

    it("should verify authentic receipt signature and flag tampered receipts", async () => {
      const receipt = await service.createReceipt(ctx, createReq);
      const verifyRes = await service.verifyReceipt(receipt.receiptNumber, undefined, ctx.tenantId);

      expect(verifyRes.isValid).toBe(true);
      expect(verifyRes.digitalSignatureValid).toBe(true);
      expect(verifyRes.verificationMessage).toContain("AUTHENTIC");
    });

    it("should allow cancelling and refunding receipts", async () => {
      const receipt = await service.createReceipt(ctx, createReq);
      const cancelled = await service.updateReceiptStatus(ctx, receipt.id, "CANCELLED", "Cashier mistake");

      expect(cancelled.status).toBe("CANCELLED");

      const verifyRes = await service.verifyReceipt(receipt.receiptNumber, undefined, ctx.tenantId);
      expect(verifyRes.isValid).toBe(false);
    });
  });
});
