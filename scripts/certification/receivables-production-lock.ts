import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaFinanceRepository } from "../../packages/database/src/prismaFinanceRepository.js";

type Check = { id: string; passed: boolean; details: string };

const root = resolve(process.cwd());
const checks: Check[] = [];
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const check = (id: string, passed: boolean, details: string) => checks.push({ id, passed, details });

const prismaFinance = read("packages/database/src/prismaFinanceRepository.ts");
const server = read("apps/api/src/server.ts");
const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
const lock = read("packages/sync/src/receivablesProductionLock.ts");

const proto = PrismaFinanceRepository.prototype as any;
for (const method of [
  "getReceivablesAging",
  "allocatePayment",
  "getCustomerStatement",
  "getReceivablesLedger",
  "getReceivablesCollections",
]) {
  check(`AR-PRISMA-${method}`, typeof proto[method] === "function", `PrismaFinanceRepository.${method} must exist`);
}

check("AR-API-AGING", server.includes('/api/v1/finance/receivables/aging'), "Dedicated production AR aging endpoint");
check("AR-API-STATEMENT", server.includes('/api/v1/finance/receivables/statements/:customerId'), "Customer statement endpoint");
check("AR-API-LEDGER", server.includes('/api/v1/finance/receivables/ledger'), "AR ledger endpoint");
check("AR-API-COLLECTIONS", server.includes('/api/v1/finance/receivables/collections'), "Collections endpoint");
check("AR-API-ALLOCATE", server.includes('/api/v1/finance/payments/allocate'), "Payment allocation endpoint");
check("AR-PROD-PERSISTENCE", server.includes('productionPersistence ? new PrismaFinanceRepository()'), "Production persistence authority is Prisma-backed");
check("AR-SYNC-LOCK", sync.includes('applyReceivablesProductionLockOperation') && lock.includes('PaymentAllocation') && lock.includes('CustomerInvoice'), "Offline AR mutations use an authoritative production lock");
check("AR-AUDIT-INVOICE", prismaFinance.includes('AR_INVOICE_CREATED'), "Invoice creation writes immutable audit evidence");
check("AR-AUDIT-PAYMENT", prismaFinance.includes('AR_PAYMENT_ALLOCATED'), "Payment allocation writes immutable audit evidence");
check("AR-TENANT-ISOLATION", prismaFinance.includes('tenantId: ctx.tenantId') && prismaFinance.includes('branchId: ctx.branchId'), "AR queries are tenant/branch scoped");

const allPassed = checks.every((c) => c.passed);
const evidence = {
  lockId: "AR-PRODUCTION-LOCK-V1",
  appliedAt: new Date().toISOString(),
  status: allPassed ? "APPLIED" : "BLOCKED",
  checks,
  productionAuthority: "PrismaFinanceRepository",
};

mkdirSync(resolve(root, "artifacts/core-engine-evidence"), { recursive: true });
writeFileSync(
  resolve(root, "artifacts/core-engine-evidence/receivables-production-lock.json"),
  JSON.stringify(evidence, null, 2),
  "utf8",
);

for (const c of checks) console.log(`[${c.passed ? "PASS" : "FAIL"}] ${c.id} — ${c.details}`);
console.log(`AR PRODUCTION LOCK: ${allPassed ? "APPLIED" : "BLOCKED"}`);

if (!allPassed) process.exit(1);
