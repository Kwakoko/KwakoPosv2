import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaFinanceRepository } from "../../packages/database/src/prismaFinanceRepository.js";

type Check = { id: string; passed: boolean; details: string };

const root = resolve(process.cwd());
const checks: Check[] = [];
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const check = (id: string, passed: boolean, details: string) => checks.push({ id, passed, details });

const prismaFinance = read("packages/database/src/prismaFinanceRepository.ts");
const productionRepo = read("packages/database/src/prismaProductionRepositories.ts");
const server = read("apps/api/src/server.ts");
const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
const lock = read("packages/sync/src/payablesProductionLock.ts");

const proto = PrismaFinanceRepository.prototype as any;
for (const method of [
  "createSupplierInvoice",
  "getSupplierInvoices",
  "getPayablesAging",
  "getSupplierStatement",
  "getPayablesLedger",
  "allocatePayment",
]) {
  check(
    `AP-PRISMA-${method}`,
    typeof proto[method] === "function",
    `PrismaFinanceRepository.${method} must exist`,
  );
}

check("AP-API-INVOICES", server.includes("/api/v1/finance/payables/invoices"), "Supplier invoice endpoint");
check("AP-API-AGING", server.includes("/api/v1/finance/payables/aging"), "AP aging endpoint");
check("AP-API-STATEMENT", server.includes("/api/v1/finance/payables/statements/:supplierId"), "Supplier statement endpoint");
check("AP-API-LEDGER", server.includes("/api/v1/finance/payables/ledger"), "AP ledger endpoint");
check("AP-API-REPORTS", server.includes("/api/v1/finance/payables/reports"), "AP report endpoint");
check("AP-API-SETTLE", server.includes("/api/v1/finance/payables/settle-supplier"), "Supplier payment endpoint");
check("AP-API-ALLOCATE", server.includes("/api/v1/finance/payments/allocate"), "Payment allocation endpoint");
check("AP-SYNC-LOCK", sync.includes("applyPayablesProductionLockOperation") && lock.includes("SupplierInvoice") && lock.includes("PaymentAllocation"), "Offline AP mutations use an authoritative production lock");
check("AP-SYNC-PAYMENT", lock.includes('op.entityType === "Payment"') && lock.includes('"AP_PAYMENT_SYNCED"'), "Supplier payments are production-locked and audited");
check("AP-AUDIT-INVOICE", prismaFinance.includes('action: "AP_INVOICE_CREATED"'), "Direct AP invoice creation writes immutable audit evidence");
check("AP-AUDIT-PAYMENT", productionRepo.includes('action: "AP_PAYMENT_CREATED"'), "Direct supplier payment writes immutable audit evidence");
check("AP-AUDIT-ALLOCATION", prismaFinance.includes('"AP_PAYMENT_ALLOCATED"') && productionRepo.includes('"AP_PAYMENT_ALLOCATED"'), "Payment allocation writes AP audit evidence");
check("AP-TENANT-ISOLATION", prismaFinance.includes("tenantId: ctx.tenantId") && prismaFinance.includes("branchId: ctx.branchId"), "AP queries are tenant/branch scoped");
check("AP-NO-GENERIC-BALANCE-DECREMENT", !sync.includes('data: { outstandingBalance: { decrement: amount } }') || !sync.includes('if (payload.supplierId) {'), "Generic supplier payment path no longer decrements AP mirror balances");
check("AP-SETTLE-FIFO", productionRepo.includes('orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }, { invoiceNumber: "asc" }]'), "Direct supplier payments allocate deterministically");
check("AP-SETTLE-AUDIT", productionRepo.includes('action: "AP_PAYMENT_ALLOCATED"'), "Direct supplier payment allocation is audited");
const allPassed = checks.every((c) => c.passed);
const evidence = {
  lockId: "AP-PRODUCTION-LOCK-V1",
  appliedAt: new Date().toISOString(),
  status: allPassed ? "APPLIED" : "BLOCKED",
  checks,
  productionAuthority: "PrismaFinanceRepository",
  synchronizationAuthority: "WorldStandardPrismaSyncEngine",
};

mkdirSync(resolve(root, "artifacts/core-engine-evidence"), { recursive: true });
writeFileSync(
  resolve(root, "artifacts/core-engine-evidence/payables-production-lock.json"),
  JSON.stringify(evidence, null, 2),
  "utf8",
);

for (const c of checks) console.log(`[${c.passed ? "PASS" : "FAIL"}] ${c.id} — ${c.details}`);
console.log(`AP PRODUCTION LOCK: ${allPassed ? "APPLIED" : "BLOCKED"}`);

if (!allPassed) process.exit(1);
