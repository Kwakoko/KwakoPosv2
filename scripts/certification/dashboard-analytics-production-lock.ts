import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_ID = "DASHBOARD-ANALYTICS-PRODUCTION-LOCK-2026-10-07";

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "490b7fd6ec428e77f1e2f48c8375856b1bac0eec",
  "packages/database/prisma/schema.prisma": "1a9e7130834582d8ad69523d881a6ab5f685b036",
  "packages/database/prisma/migrations/202610070001_dashboard_production_read_model/migration.sql": "5a053151e38557c9a016dc3d7b47b01c8aa2eb25",
  "packages/database/prisma/migrations/202610070002_dashboard_read_model_rls/migration.sql": "d7d998c2a9baf9d82c0fa491986a26c7df80ba0b",
  "apps/web/src/services/dashboardCardRegistry.ts": "69ccee4ebd02944cecdb008d730692b632fb3146",
  "apps/web/src/modules/moduleRegistry.ts": "6002fc7096bf4412cc9bc8643c26a0561b08bfc6",
  "apps/web/src/pages/DashboardPage.tsx": "cbfe27afea615933098d3888bb958e5b944012fb",
  "apps/api/src/services/dashboardKpiService.ts": "b085ec98cc339dc31f8d6dbde00feae5f78feff5",
  "apps/web/src/services/dashboardKpiService.ts": "ef9fcc7c256dcda2b901371ae9f73ed7819a7248",
  "packages/database/src/prismaProductionRepositories.ts": "d07fa6b890b5a96ff60c746cacb47375dac03aaa",
  "tests/integration/dashboard-final-closures.test.ts": "777bb47676b33a90f2011fa9d45e030829a18d1b",
  ".github/workflows/ci.yml": "a92b7208971968053f6de87aa7cb74b8c4fab705",
  ".github/workflows/production-certification.yml": "4ea8fa0290d154e3a66ea135e524928f7bf1d273",
  ".github/workflows/production-release-exact-main.yml": "6293102ebfff3d5b578dc8e76fe8323f481f41c2"
};

const REQUIRED_MARKERS: Array<[string,string,string]> = [
  ["authoritative-dashboard-api", "apps/web/src/services/dashboardKpiService.ts", "fetchDashboardKpiSnapshot"],
  ["no-dashboard-kpi-idb-fallback", "apps/web/src/services/dashboardKpiService.ts", "Callers must not replace a failed online request with IndexedDB KPI data."],
  ["repeatable-read-authority", "apps/api/src/services/dashboardKpiService.ts", 'isolationLevel: "RepeatableRead"'],
  ["utc-reporting-authority", "apps/api/src/services/dashboardKpiService.ts", "SET LOCAL TIME ZONE 'UTC'"],
  ["utc-boundary-test", "tests/integration/dashboard-final-closures.test.ts", "keeps dashboard day/hour boundaries deterministic at UTC midnight"],
  ["payment-tenant-join", "apps/api/src/services/dashboardKpiService.ts", 's."tenantId" = p."tenantId"'],
  ["payment-branch-join", "apps/api/src/services/dashboardKpiService.ts", 's."branchId" = p."branchId"'],
  ["return-tenant-join", "apps/api/src/services/dashboardKpiService.ts", 's."tenantId" = r."tenantId"'],
  ["return-branch-join", "apps/api/src/services/dashboardKpiService.ts", 's."branchId" = r."branchId"'],
  ["product-revenue-ranking", "apps/api/src/services/dashboardKpiService.ts", 'ROW_NUMBER() OVER (ORDER BY revenue DESC'],
  ["product-unit-ranking", "apps/api/src/services/dashboardKpiService.ts", 'ROW_NUMBER() OVER (ORDER BY units DESC'],
  ["product-ranking-union", "apps/api/src/services/dashboardKpiService.ts", 'WHERE revenue_rank <= 20 OR units_rank <= 20'],
  ["ui-metric-sort", "apps/web/src/pages/DashboardPage.tsx", 'topProductsMetric === "revenue"'],
  ["ui-top-products-slice", "apps/web/src/pages/DashboardPage.tsx", "sortedRows.slice(0, 5)"],
  ["raw-payment-donut-metric", "apps/web/src/pages/DashboardPage.tsx", "value: Math.max(rawMetric, 0)"],
  ["cashier-authority-lookup", "packages/database/src/prismaProductionRepositories.ts", "db.user.findMany"],
  ["cashier-name-map", "packages/database/src/prismaProductionRepositories.ts", "cashierNames"],
  ["recent-orders-sync-label", "apps/web/src/pages/DashboardPage.tsx", "Sync</th>"],
  ["supplier-payables-kpi", "apps/api/src/services/dashboardKpiService.ts", "SupplierPayables: numberValue(payables.supplier_payables)"],
  ["overdue-payables-kpi", "apps/api/src/services/dashboardKpiService.ts", "overduePayablesCount: numberValue(payables.overdue_payables_count)"],
  ["dashboard-read-model-cache", "apps/api/src/services/dashboardKpiService.ts", "DASHBOARD_READ_MODEL_VERSION"],
  ["dashboard-read-model-rls", "packages/database/prisma/migrations/202610070002_dashboard_read_model_rls/migration.sql", "kwakopos_tenant_dashboard_read_models"],
  ["dashboard-branch-selector", "apps/web/src/pages/DashboardPage.tsx", "aria-label=\"Dashboard branch\""],
  ["dashboard-payables-card", "apps/web/src/modules/moduleRegistry.ts", "RetailSupplierPayables"],
  ["dashboard-final-isolation-test", "tests/integration/dashboard-final-closures.test.ts", "Cross-tenant isolation test"],
  ["dashboard-final-ranking-test", "tests/integration/dashboard-final-closures.test.ts", "revenueRank"],
  ["dashboard-final-cashier-test", "tests/integration/dashboard-final-closures.test.ts", "Amani Dashboard Cashier"],
  ["dashboard-lock-package-hook", "package.json", "certify:dashboard-lock"],
  ["dashboard-lock-ci-hook", ".github/workflows/ci.yml", "npm run certify:dashboard-lock"],
  ["dashboard-lock-candidate-hook", ".github/workflows/production-certification.yml", "npm run certify:dashboard-lock"],
  ["dashboard-lock-exact-main-hook", ".github/workflows/production-release-exact-main.yml", "npm run certify:dashboard-lock"],
];

function gitBlobSha(content: string, relativePath: string): string {
  try {
    return execFileSync("git", ["hash-object", "--path=" + relativePath, "--stdin"], {
      input: Buffer.from(content, "utf8"),
      encoding: "utf8",
    }).trim();
  } catch {
    const bytes = Buffer.from(content, "utf8");
    const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
    return createHash("sha1").update(Buffer.concat([header, bytes])).digest("hex");
  }
}

function read(relativePath: string): string {
  const absolute = path.resolve(process.cwd(), relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`missing file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

const failures: string[] = [];
const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};

for (const [relativePath, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = gitBlobSha(read(relativePath), relativePath);
    const pass = actual === expected;
    checked[relativePath] = { expected, actual, pass };
    if (!pass) failures.push(`LOCK_DRIFT: ${relativePath} expected ${expected} got ${actual}`);
  } catch (error) {
    failures.push(`LOCK_READ_FAILURE: ${relativePath}: ${String(error)}`);
  }
}

for (const [name, relativePath, marker] of REQUIRED_MARKERS) {
  try {
    if (!read(relativePath).includes(marker)) {
      failures.push(`CONTRACT_FAILURE: ${name} missing marker in ${relativePath}`);
    }
  } catch {
    failures.push(`CONTRACT_READ_FAILURE: ${name} could not read ${relativePath}`);
  }
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  failures,
  checked,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
console.log(`DASHBOARD ANALYTICS PRODUCTION LOCK: PASS — ${LOCK_ID}`);
