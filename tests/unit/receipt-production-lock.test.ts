import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEscPosPayload } from "../../apps/web/src/services/receiptPrinterService";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("Receipt production lock", () => {
  it("uses authoritative print/share paths and does not fabricate receipts", () => {
    const page = read("apps/web/src/pages/ReceiptsPage.tsx");
    expect(page).toContain("apiFetch");
    expect(page).toContain("/print/audit");
    expect(page).toContain("/share");
    expect(page).not.toContain("TENANT-001");
    expect(page).not.toContain("RCPT-${Date.now()}");
    expect(page).not.toContain("Receipt Dispatched");
  });

  it("has a concrete Web Serial ESC/POS printer implementation", () => {
    const printer = read("apps/web/src/services/receiptPrinterService.ts");
    expect(printer).toContain("navigator.serial");
    expect(printer).toContain("getWriter");
    expect(printer).toContain("buildEscPosPayload");
  });

  it("renders deterministic ESC/POS payloads with identity and totals", () => {
    const payload = buildEscPosPayload({
      receiptNumber: "TST-RCP-0001", transactionId: "SALE-1", createdAt: "2026-10-08T00:00:00.000Z",
      items: [{ name: "Test Item", sku: "SKU-1", qty: 2, unitPrice: 1000, lineTotal: 2000, discount: 0, taxRate: 0, taxAmount: 0 }],
      grandTotal: 2000, paidAmount: 2500, changeAmount: 500, paymentMethod: "CASH", currency: "TZS"
    });
    const output = new TextDecoder().decode(payload);
    expect(output).toContain("TST-RCP-0001");
    expect(output).toContain("TOTAL: 2000 TZS");
    expect(payload[payload.length - 4]).toBe(0x1d);
  });

  it("keeps share status honest", () => {
    const route = read("apps/api/src/routes/receiptRoutes.ts");
    const repo = read("packages/database/src/receiptRepositories.ts");
    expect(route).toContain("Receipt share recorded");
    expect(repo).toContain("status: \"OPENED\"");
    expect(repo).not.toContain("status: \"SENT\"");
  });
});
