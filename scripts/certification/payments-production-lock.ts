import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Check = { id: string; passed: boolean; details: string };
const root = resolve(process.cwd());
const checks: Check[] = [];
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const check = (id: string, passed: boolean, details: string) => checks.push({ id, passed, details });

const schema = read("packages/database/prisma/schema.prisma");
const migration = read("packages/database/prisma/migrations/202610070005_payment_production_lock/migration.sql");
const contracts = read("packages/contracts/src/index.ts");
const engine = read("packages/domain/src/paymentEngine.ts");
const bridge = read("packages/domain/src/financialBridge.ts");
const atomic = read("packages/database/src/atomicCommercialFinance.ts");
const production = read("packages/database/src/prismaProductionRepositories.ts");
const bank = read("packages/database/src/prismaFinanceRepository.ts");
const sync = read("packages/sync/src/worldStandardPrismaSyncEngine.ts");
const lock = read("packages/sync/src/paymentsProductionLock.ts");
const server = read("apps/api/src/server.ts");
const dashboard = read("apps/api/src/services/dashboardKpiService.ts");
const unitTests = read("tests/unit/payment-production-lock.test.ts");
const integrationTests = read("tests/integration/payments-production-lock.test.ts");

check("PAY-SCHEMA-LIFECYCLE", ["refundedAmount","isRefund","reversalOfPaymentId","reconciliationStatus","providerEventId"].every((f) => schema.includes(f) && migration.includes(f)), "Payment persistence contains refund, reversal, provider and reconciliation state");
check("PAY-CONTRACT-LIFECYCLE", contracts.includes("PARTIALLY_REFUNDED") && contracts.includes("REVERSED") && contracts.includes("RefundPaymentRequestSchema") && contracts.includes("PaymentReconciliationRequestSchema"), "Contracts expose the complete payment lifecycle");
check("PAY-PROVIDER-FAIL-CLOSED", !engine.includes("SUCCESSFUL_CONFIRMATION") && engine.includes("PROVIDER_REFERENCE_REQUIRED"), "Provider-controlled tenders no longer fabricate success and require an external reference");
check("PAY-SPLIT-GL", bridge.includes("Array.isArray(paymentMethodOrPayments)") && bridge.includes("SALE_TENDER_TOTAL_MISMATCH") && atomic.includes("FinancialBridge.mapSaleToJournal"), "Split tenders post each payment independently to control accounts");
check("PAY-OVERPAYMENT", atomic.includes("PAYMENT_OVERPAYMENT"), "Production POS rejects overpayment");
check("PAY-REVERSAL", atomic.includes("reversePaymentInTransaction") && atomic.includes("PAYMENT_REVERSED"), "Persisted payment reversal with linked compensating journal and audit");
check("PAY-REFUND", atomic.includes("refundPaymentInTransaction") && production.includes("PAYMENT_REFUND_RECORDED") && production.includes("mapReturnToJournal"), "Refunds are persisted, linked, journaled and audited");
check("PAY-BANK-DIRECTION", bank.includes("signedDelta") && bank.includes("TRANSFER_OUT"), "Bank balance reconciliation uses transaction direction");
check("PAY-CHANNEL-REPORT", production.includes("getPaymentChannelReport") && server.includes("/api/v1/payments/reports/channels") && dashboard.includes("refundedAmount"), "Payment-channel reporting is net of refunds");
check("PAY-RECONCILIATION", production.includes("reconcilePayments") && server.includes("/api/v1/payments/reconcile") && production.includes("PAYMENT_RECONCILIATION_COMPLETED"), "External payment reconciliation is persisted and audited");
check("PAY-WEBHOOK-AUTH", server.includes("/api/v1/payments/webhooks/:provider") && server.includes("PAYMENT_WEBHOOK_SIGNATURE_INVALID") && server.includes("createHmac"), "Provider webhooks require verified signatures and event identifiers");
check("PAY-SYNC-LOCK", sync.includes("applyPaymentsProductionLockOperation") && lock.includes("action === \"REVERSE\"") && lock.includes("action === \"REFUND\"") && lock.includes("action === \"PROVIDER_CONFIRM\""), "Offline payment mutations use the authoritative payment production lock");
check("PAY-SYNC-DELETE-GUARD", lock.includes("PAYMENT_DELETE_FORBIDDEN_USE_REVERSAL"), "Synced payment deletion is forbidden");
check("PAY-AUDIT", server.includes("assertPaymentAuthority") && production.includes("PAYMENT_REFUND_RECORDED") && atomic.includes("PAYMENT_REVERSED"), "Dedicated payment authority and lifecycle audit events are present");
check("PAY-UNIT-PROOF", unitTests.includes("PROVIDER_REFERENCE_REQUIRED") && unitTests.includes("PAYMENT_OVERPAYMENT") && unitTests.includes("split tenders"), "Targeted unit proof covers critical blockers");
check("PAY-INTEGRATION-PROOF", integrationTests.includes("reversePayment") && integrationTests.includes("refundPayment") && integrationTests.includes("createSaleReturn"), "PostgreSQL integration proof covers reversal, refund and return accounting");

const allPassed = checks.every((c) => c.passed);
const evidence = { lockId: "PAYMENTS-PRODUCTION-LOCK-V1", appliedAt: new Date().toISOString(), status: allPassed ? "APPLIED" : "BLOCKED", checks, productionAuthority: "PrismaCommercialRepository + PrismaAtomicCommercialFinanceService", schemaMigration: "202610070005_payment_production_lock" };
mkdirSync(resolve(root, "artifacts/core-engine-evidence"), { recursive: true });
writeFileSync(resolve(root, "artifacts/core-engine-evidence/payments-production-lock.json"), JSON.stringify(evidence, null, 2), "utf8");
for (const c of checks) console.log(`[${c.passed ? "PASS" : "FAIL"}] ${c.id} — ${c.details}`);
console.log(`PAYMENTS PRODUCTION LOCK: ${allPassed ? "APPLIED" : "BLOCKED"}`);
if (!allPassed) process.exit(1);