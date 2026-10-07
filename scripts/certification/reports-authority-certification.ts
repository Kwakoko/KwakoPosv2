/**
 * Reports Production Authority Certification
 *
 * Static architecture gate for the Reports closed-loop remediation.
 * It intentionally fails if the UI regresses to browser-local business truth,
 * fabricated financial assumptions, or a missing PostgreSQL report authority path.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

const page = read("apps/web/src/pages/ReportsPage.tsx");
const server = read("apps/api/src/server.ts");
const prismaRepo = read("packages/database/src/prismaProductionRepositories.ts");

const required = [
  [page, "/api/v1/reports/data", "Reports UI calls authoritative report API"],
  [page, "exportCurrentReportCsv", "CSV export is implemented"],
  [page, "inventoryValuation", "Historical inventory valuation is report-authoritative"],
  [page, "receivablesAgingReport", "Historical receivables aging is report-authoritative"],
  [page, "payablesAgingReport", "Historical payables aging is report-authoritative"],
  [page, "Suppliers Report", "Supplier reporting is exposed in Reports UI"],
  [page, "Payables Aging", "Payables reporting is exposed in Reports UI"],
  [server, '/api/v1/reports/data', "Reports API route exists"],
  [server, "allBranches", "All-branch scope is explicit"],
  [server, "ctx.branchId", "Default report scope is current branch"],
  [prismaRepo, "employeeCanAccessBranch", "Branch authorization helper exists"],
  [prismaRepo, "REPORT_BRANCH_AUTHORIZATION_VIOLATION", "Branch authorization failure is enforced"],
  [prismaRepo, "calculateHistoricalInventoryValuation", "Historical stock valuation is reconstructed from ledger"],
  [prismaRepo, "calculateHistoricalInvoiceBalance", "Historical invoice balances use allocation dates"],
  [prismaRepo, "getReportsData", "PostgreSQL report authority exists"],
  [prismaRepo, "tenantId: ctx.tenantId", "Tenant boundary is present"],
  [prismaRepo, "totalCost", "COGS comes from authoritative sale cost"],
];

const forbidden = [
  [page, "localStorage", "Reports must not read browser localStorage"],
  [page, "useSync", "Reports must not use local replica as authority"],
  [page, "getProductsLocal", "Reports must not use local product authority"],
  [page, "getCustomersLocal", "Reports must not use local customer authority"],
  [page, "Date.now() - new Date(inv.dueDate)", "AR aging must not use current wall-clock time"],
  [page, "gross * 0.18", "Reports must not fabricate VAT at 18%"],
];

const failures: string[] = [];
for (const [source, needle, label] of required) {
  if (!source.includes(needle)) failures.push(`MISSING: ${label} [${needle}]`);
}
for (const [source, needle, label] of forbidden) {
  if (source.includes(needle)) failures.push(`FORBIDDEN: ${label} [${needle}]`);
}

const result = {
  gate: "REPORTS-P0-P1-AUTHORITY",
  timestamp: new Date().toISOString(),
  status: failures.length === 0 ? "PASS" : "FAIL",
  assertions: required.length + forbidden.length,
  failures,
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
