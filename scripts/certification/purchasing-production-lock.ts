import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const checks: Array<[string, boolean]> = [];
const add = (name: string, ok: boolean) => checks.push([name, ok]);

const server = read("apps/api/src/server.ts");
const ui = read("apps/web/src/pages/PurchasingPage.tsx");
const repo = read("packages/database/src/prismaProductionRepositories.ts");
const finance = read("packages/database/src/prismaFinanceRepository.ts");
const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
const payables = read("packages/sync/src/payablesProductionLock.ts");
const schema = read("packages/database/prisma/schema.prisma");

add("PO API", server.includes('"/api/v1/purchases"') && repo.includes("createPurchaseOrder"));
add("Supplier selection", server.includes('"/api/v1/suppliers"') && repo.includes("createSupplier"));
add("Receiving", server.includes('"/api/v1/purchases/receipts"') && repo.includes("createPurchaseReceipt"));
add("Partial receiving", repo.includes("quantityReceived") && schema.includes("quantityReceived"));
add("Supplier invoices/AP", server.includes('"/api/v1/finance/payables/invoices"') && finance.includes("createSupplierInvoice"));
add("Invoice/receipt AP reconciliation", finance.includes("SUPPLIER_INVOICE_RECEIPT_ALREADY_INVOICED") && finance.includes("const accrued"));
add("Purchase returns", server.includes('"/api/v1/purchases/returns"') && repo.includes("createPurchaseReturn"));
add("Return inventory ledger", repo.includes('"SUPPLIER_RETURN"') && repo.includes('"PURCHASE_RETURN"'));
add("Supplier payments", server.includes('"/api/v1/finance/payables/settle-supplier"') && repo.includes("settleSupplierPayable"));
add("Purchase history", server.includes('"/api/v1/purchases/history"'));
add("Purchase reports", server.includes('"/api/v1/purchases/reports"'));
add("Offline return replay", sync.includes('op.entityType === "PurchaseReturn"') && sync.includes("PURCHASE_RETURN_SYNCED"));
add("AP sync hardening", payables.includes("SUPPLIER_INVOICE_RECEIPT_ALREADY_INVOICED") && payables.includes("const accrued"));
add("Purchasing UI parity", ["Purchase Returns","Purchase History","Purchase Reports","Supplier Invoices"].every(x => ui.includes(x)));
add("No demo purchasing data", ui.includes("const hasDemoData = false"));
add("Tenant/branch return scope", repo.includes('tenantWhere(ctx)') && sync.includes('tenantId: ctx.tenantId, branchId: ctx.branchId'));

const failed = checks.filter(([, ok]) => !ok);
const evidence = {
  lock: "PURCHASING_PRODUCTION_LOCK",
  generatedAt: new Date().toISOString(),
  project: root,
  status: failed.length ? "REJECTED" : "APPLIED",
  gates: Object.fromEntries(checks.map(([name, ok]) => [name, ok ? "PASS" : "FAIL"])),
};
fs.mkdirSync(path.join(root, "artifacts/core-engine-evidence"), { recursive: true });
fs.writeFileSync(path.join(root, "artifacts/core-engine-evidence/purchasing-production-lock.json"), JSON.stringify(evidence, null, 2));
for (const [name, ok] of checks) console.log(`[PURCHASING-LOCK] ${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log("[PURCHASING-LOCK] APPLIED");
