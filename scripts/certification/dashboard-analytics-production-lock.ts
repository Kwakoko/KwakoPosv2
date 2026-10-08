import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_ID = "DASHBOARD-ANALYTICS-PRODUCTION-LOCK-2026-10-04";

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "fde353e1cd60aa8e025ac2a89d52610255519921",
  "apps/web/src/pages/DashboardPage.tsx": "59b98fc129531507362218674b135597bf224f8d",
  "apps/api/src/services/dashboardKpiService.ts": "86f8ee60dde1074f08818e33ab5dc36ebd3779ff",
  "apps/web/src/services/dashboardKpiService.ts": "9c624cadd529f028ebb46ca4fdfc95712e677d84",
  "packages/database/src/prismaProductionRepositories.ts": "72575e27a0c6ed11ba808e0aefb09e08a6fc4936",
  "tests/integration/dashboard-final-closures.test.ts": "07a0c2c012569e52f32fa0c719bafffb28e7f129",
  ".github/workflows/ci.yml": "ac14262fd3306566eec2bd9826fcca7fbabd26f9",
  ".github/workflows/production-certification.yml": "7d5bdfd034622938431f751988fc30af6e7633ec",
  ".github/workflows/production-release-exact-main.yml": "615ef46d4a08077cc4e1e3869c284f2126047f83"
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
  ["recent-orders-sync-label", "apps/web/src/pages/DashboardPage.tsx", '<th className="p-3 text-center">Sync</th>'],
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
