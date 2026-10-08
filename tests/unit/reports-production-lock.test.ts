import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateHistoricalInventoryValuation,
  calculateHistoricalInvoiceBalance,
} from "../../packages/database/src/prismaProductionRepositories.js";

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("Reports Production Lock v1", () => {
  it("reconstructs historical WAC valuation from immutable stock-ledger movements", () => {
    const rows = calculateHistoricalInventoryValuation([
      { productId: "P1", variantId: "V1", branchId: "B1", quantityChange: 100, unitCost: 400, occurredAt: "2026-01-01T00:00:00.000Z" },
      { productId: "P1", variantId: "V1", branchId: "B1", quantityChange: -30, unitCost: 400, occurredAt: "2026-01-02T00:00:00.000Z" },
      { productId: "P1", variantId: "V1", branchId: "B1", quantityChange: 50, unitCost: 420, occurredAt: "2026-01-03T00:00:00.000Z" },
    ]);
    expect(rows[0].quantity).toBe(120);
    expect(rows[0].averageCost).toBe(408.33);
    expect(rows[0].stockValue).toBe(49000);
  });

  it("calculates invoice balance as of the report end date using allocation dates", () => {
    const invoice = {
      invoiceDate: "2026-01-01T00:00:00.000Z",
      grandTotal: 1000,
      allocations: [
        { allocatedAmount: 250, allocatedAt: "2026-01-10T00:00:00.000Z" },
        { allocatedAmount: 150, allocatedAt: "2026-02-10T00:00:00.000Z" },
      ],
    };
    expect(calculateHistoricalInvoiceBalance(invoice, new Date("2026-01-31T23:59:59.999Z"))).toBe(750);
    expect(calculateHistoricalInvoiceBalance(invoice, new Date("2026-02-28T23:59:59.999Z"))).toBe(600);
  });

  it("locks report scope, exports, historical aging and branch authorization at source and UI layers", () => {
    const repo = read("packages/database/src/prismaProductionRepositories.ts");
    const page = read("apps/web/src/pages/ReportsPage.tsx");
    const server = read("apps/api/src/server.ts");
    const certification = read("scripts/certification/reports-authority-certification.ts");
    const ci = read(".github/workflows/ci.yml");
    const prod = read(".github/workflows/production-certification.yml");
    const exact = read(".github/workflows/production-release-exact-main.yml");

    for (const marker of [
      "employeeCanAccessBranch",
      "REPORT_BRANCH_AUTHORIZATION_VIOLATION",
      "calculateHistoricalInventoryValuation",
      "calculateHistoricalInvoiceBalance",
      "ReceivablesPayablesEngine.generateReceivablesAgingReport",
      "ReceivablesPayablesEngine.generatePayablesAgingReport",
    ]) expect(repo).toContain(marker);

    for (const marker of [
      "inventoryValuation",
      "receivablesAgingReport",
      "payablesAgingReport",
      "Suppliers Report",
      "Payables Aging",
      "exportCurrentReportCsv",
    ]) expect(page).toContain(marker);

    for (const marker of [
      "allBranches",
      "const requestedBranch = allBranches ? null : (query.branchId ? String(query.branchId) : ctx.branchId);",
    ]) expect(server).toContain(marker);

    expect(certification).toContain("REPORT_BRANCH_AUTHORIZATION_VIOLATION");
    expect(ci).toContain("npm run certify:reports");
    expect(prod).toContain("npm run certify:reports");
    expect(exact).toContain("npm run certify:reports");
  });
});
