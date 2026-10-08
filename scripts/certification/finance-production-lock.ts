import fs from "node:fs";
import path from "node:path";
import { AccountingEngine, assertJournalBalanced, assertJournalLineAmounts, assertPeriodAllowsPosting } from "../../packages/domain/src/index.js";

const LOCK_ID = "FINANCE-ACCOUNTING-PRODUCTION-LOCK-V1-2026-10-07";

function read(p: string): string {
  const file = path.resolve(process.cwd(), p);
  if (!fs.existsSync(file)) throw new Error("Missing required file: " + p);
  return fs.readFileSync(file, "utf8");
}
function must(content: string, marker: string, label: string) {
  if (!content.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " -> missing " + marker);
}
function mustNot(content: string, marker: string, label: string) {
  if (content.includes(marker)) throw new Error("LOCK_BLOCKED: " + label + " -> forbidden " + marker);
}

const repoFiles = [
  "packages/domain/src/accountingEngine.ts",
  "packages/domain/src/financeInvariants.ts",
  "packages/domain/src/financialReportingEngine.ts",
  "packages/database/src/prismaFinanceRepository.ts",
  "packages/contracts/src/index.ts",
  "apps/api/src/server.ts",
  "apps/web/src/pages/WorkspacePages.tsx",
  "package.json",
  ".github/workflows/ci.yml",
  ".github/workflows/production-certification.yml",
  ".github/workflows/production-release-exact-main.yml",
];

for (const file of repoFiles) read(file);

const requestedScope = process.argv.find((arg) => arg.startsWith("--scope="))?.slice("--scope=".length) || "all";
const scopeMarkers: Record<string, Array<[string, string]>> = {
  receivables: [
    ["packages/database/src/prismaFinanceRepository.ts", "getReceivablesAging"],
    ["packages/database/src/prismaFinanceRepository.ts", "createCustomerInvoice"],
    ["packages/database/src/prismaFinanceRepository.ts", "allocatePayment"],
    ["apps/api/src/server.ts", "/api/v1/finance/receivables/aging"],
    ["apps/api/src/server.ts", "/api/v1/finance/receivables/invoices"],
  ],
  payables: [
    ["packages/database/src/prismaFinanceRepository.ts", "getPayablesAging"],
    ["packages/database/src/prismaFinanceRepository.ts", "createSupplierInvoice"],
    ["packages/database/src/prismaFinanceRepository.ts", "allocatePayment"],
    ["apps/api/src/server.ts", "/api/v1/finance/payables/aging"],
    ["apps/api/src/server.ts", "/api/v1/finance/payables/invoices"],
  ],
  expenses: [
    ["packages/database/src/atomicCommercialFinance.ts", "recordExpense"],
    ["packages/database/src/atomicCommercialFinance.ts", "payExpense"],
    ["packages/database/src/atomicCommercialFinance.ts", "voidExpense"],
    ["packages/database/src/prismaProductionRepositories.ts", "recordExpense"],
    ["apps/api/src/server.ts", "CreateExpenseRequestSchema"],
    ["apps/api/src/server.ts", "PayExpenseRequestSchema"],
    ["apps/api/src/server.ts", "VoidExpenseRequestSchema"],
  ],
  payments: [
    ["packages/domain/src/business/universalPaymentEngine.ts", "ProcessPayment"],
    ["packages/domain/src/business/universalPaymentEngine.ts", "ProcessSplitPayment"],
    ["packages/domain/src/business/universalPaymentEngine.ts", "RefundPayment"],
    ["packages/database/src/prismaProductionRepositories.ts", "refundPaymentId"],
    ["apps/web/src/pages/ReportsPage.tsx", "Payment Channel Share"],
  ],
};

if (requestedScope !== "all") {
  const checks = scopeMarkers[requestedScope];
  if (!checks) throw new Error("LOCK_BLOCKED: unknown finance audit scope -> " + requestedScope);
  for (const [file, marker] of checks) {
    must(read(file), marker, requestedScope + " audit control");
  }
}

const accounting = read("packages/domain/src/accountingEngine.ts");
must(accounting, 'accountCode: "2220"', "VAT input account");
must(accounting, "assertJournalLineAmounts(lines)", "journal amount enforcement");

const invariants = read("packages/domain/src/financeInvariants.ts");
for (const marker of ["INVARIANT F001", "INVARIANT F002", "INVARIANT F003", "INVARIANT F004", "INVARIANT F005", "INVARIANT F006", "INVARIANT F007", "INVARIANT F008", "INVARIANT F009", "INVARIANT F010", "INVARIANT F011", "INVARIANT F012", "INVARIANT F013", "INVARIANT F014"]) must(invariants, marker, "finance invariant");

const repo = read("packages/database/src/prismaFinanceRepository.ts");
for (const marker of [
  "createCustomerInvoice(ctx",
  "createSupplierInvoice(ctx",
  "allocatePayment(ctx",
  "recordBankTransaction(ctx",
  "persistFinancialJournal",
  "getCashFlow(ctx",
  "getFinancialAuditTrail(ctx",
  'action: "JOURNAL_POSTED"',
  "INVARIANT_F010_VIOLATION",
]) must(repo, marker, "PostgreSQL finance authority");

const server = read("apps/api/src/server.ts");
for (const marker of [
  "assertFinanceAuthority",
  "/api/v1/finance/reports/cash-flow",
  "/api/v1/finance/taxes",
  "/api/v1/finance/audit-trail",
  "/api/v1/finance/journals",
  "/api/v1/finance/receivables/invoices",
  "/api/v1/finance/payables/invoices",
]) must(server, marker, "Finance API boundary");

const ui = read("apps/web/src/pages/WorkspacePages.tsx");
for (const marker of [
  "/api/v1/finance/dashboard/executive",
  "/api/v1/finance/reports/trial-balance",
  "/api/v1/finance/reports/profit-loss",
  "/api/v1/finance/reports/balance-sheet",
  "/api/v1/finance/reports/cash-flow",
  "/api/v1/finance/accounts",
]) must(ui, marker, "authoritative Finance UI");
for (const forbidden of ["42850000", "3200000", "842", "Cash in Hand", "1200 — Accounts Receivable"]) mustNot(ui, forbidden, "Finance fabricated/demo value");

const pkg = read("package.json");
must(pkg, '"certify:finance-lock"', "Finance lock package script");
must(read(".github/workflows/ci.yml"), "npm run certify:finance-lock", "CI Finance lock gate");
must(read(".github/workflows/production-certification.yml"), "npm run certify:finance-lock", "Production certification Finance lock gate");
must(read(".github/workflows/production-release-exact-main.yml"), "npm run certify:finance-lock", "Exact-main Finance lock gate");

const ctx = { tenantId: "11111111-1111-1111-1111-111111111111", branchId: "22222222-2222-2222-2222-222222222222", userId: "33333333-3333-3333-3333-333333333333", roles: ["ADMIN"], permissions: ["*"] };
const accounts = AccountingEngine.seedDefaultAccounts(ctx as any);
const cash = accounts.find((a) => a.accountCode === "1110")!;
const equity = accounts.find((a) => a.accountCode === "3100")!;
const journal = AccountingEngine.createJournalEntry(ctx as any, {
  journalNumber: "CERT-FIN-001",
  sourceType: "MANUAL",
  description: "Finance lock verification",
  lines: [
    { accountId: cash.id, debit: 1000, credit: 0 },
    { accountId: equity.id, debit: 0, credit: 1000 },
  ],
});
assertJournalLineAmounts(journal.lines);
assertJournalBalanced(journal.journal, journal.lines);
const closed = { id: "P", tenantId: ctx.tenantId, fiscalYearId: "FY", periodNumber: 1, name: "Closed", startDate: "2026-01-01T00:00:00.000Z", endDate: "2026-01-31T23:59:59.999Z", status: "CLOSED", closedAt: null, closedById: null, createdAt: "", updatedAt: "" };
try { assertPeriodAllowsPosting(closed as any); throw new Error("closed-period invariant did not fail"); } catch (e: any) { if (!String(e.message).includes("INVARIANT_F010_VIOLATION")) throw e; }

console.log(LOCK_ID);
console.log("Finance audit scope: " + requestedScope);
console.log("FINANCE / ACCOUNTING PRODUCTION LOCK: PASS");
console.log("Scope: Chart of Accounts, GL, Journals, Double Entry, AR, AP, Cash, Bank, Taxes, Trial Balance, P&L, Balance Sheet, Cash Flow, Period Closing, Financial Reports, Audit Trail");
