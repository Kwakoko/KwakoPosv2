import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_ID = "BACKDATED-COMMERCIAL-PRODUCTION-LOCK-2026-10-08";

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "29fdef497005f558d7bb5347aff0b5e9d2641925",
  ".github/workflows/ci.yml": "e1fba0fbf5a7eed4302529d3c16804de70228e6d",
  ".github/workflows/production-certification.yml": "cbb5ee8eb264dcd89752b036bce03f76afb62048",
  ".github/workflows/production-release-exact-main.yml": "def1baeb4501837bbba9f339c8f358f38cd37873",
  "apps/web/src/pages/InventoryPage.tsx": "1aada87ec4442b426973a2bba97c3d920fa86f04",
  "apps/web/src/pages/PosPage.tsx": "35648f21f71204e65333582c33af9287a1a1edb1",
  "apps/web/src/services/payloadValidationService.ts": "9c28e200a6a2175c81d9d900d168936ae3e96f7d",
  "packages/contracts/src/index.ts": "27b80e50d9ee754721393adc6d858b1e71143cd2",
  "packages/domain/src/index.ts": "c1082076ac473584d61c3f108fcef819e54cadb1",
  "packages/domain/src/financialBridge.ts": "398c6bdcacc0ac5c7c7c0b513e6ac47b7a7b4131",
  "packages/database/src/index.ts": "aa2cc24f2f5d9b6a9392efb179f40110f4693d5c",
  "packages/database/src/prismaRepositories.ts": "810e75a92ad082318e7fc5157a2c217ccd04add5",
  "packages/database/src/atomicCommercialFinance.ts": "61a73fb17fc50306939e68ca1443356534c5b1f0",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "0a14912d599d3e325c48759d4b25366e79f1453d",
  "tests/unit/backdated-inventory.test.ts": "0d94562873f8ee67f0b63f3a263cc4016ddb136f",
  "tests/unit/payload-validation-service.test.ts": "b6f422df36190828ba2ec853fe6b94a963f9d083",
  "tests/integration/prisma-stock-convergence.test.ts": "82e2aa06c495b74482ded929ce2e1fdda3671cd9",
  "tests/unit/backdated-pos-ui.test.ts": "becf52a74f1a56e048914f156477efa362d0be2e",
};

const MARKERS: Array<[string, string, ...string[]]> = [
  ["ui-backdate-entry", "apps/web/src/pages/InventoryPage.tsx", "Backdate Stock Movement", "Post Backdated Stock"],
  ["pos-backdate-entry", "apps/web/src/pages/PosPage.tsx", "Activate Backdated Sale", "Historical Sale Date &amp; Time", "Complete Backdated Sale", "SALE_BACKDATE"],
  ["browser-normalization", "apps/web/src/services/payloadValidationService.ts", "NormalizedStockAdjustmentPayload", "occurredAt", "normalizeStockAdjustmentPayload"],
  ["permission-contract", "packages/contracts/src/index.ts", "INVENTORY_BACKDATE", "SALE_BACKDATE", "occurredAt", "isBackdated"],
  ["domain-threshold", "packages/domain/src/index.ts", "BACKDATING_MAX_THRESHOLD_DAYS = 730", "BACKDATING_PERMISSION", "assertBackdatingPermission", "SALE_BACKDATING_PERMISSION", "assertSaleBackdatingPermission"],
  ["finance-date", "packages/domain/src/financialBridge.ts", "entryDate:", "sale.soldAt", "toISOString()"],
  ["domain-insertion-invariant", "packages/domain/src/index.ts", "runningBeforeTarget", "insertionBalance"],
  ["local-governance", "packages/database/src/index.ts", "assertBackdatingPermission(ctx)", "validateRetroactiveTimeline", "currentQuantityBefore + quantityChange", "movement point"],
  ["prisma-governance", "packages/database/src/prismaRepositories.ts", "assertBackdatingPermission(ctx)", "ACCOUNTING_PERIOD_LOCKED", "ACCOUNTING_PERIOD_CLOSED", "historicalQuantityBefore"],
  ["pos-finance-governance", "packages/database/src/atomicCommercialFinance.ts", "assertSaleBackdatingPermission(ctx)", "validateRetroactiveTimeline", "historicalRows", "soldAt: occurredAt"],
  ["sync-governance", "packages/sync/src/worldStandardPrismaSyncEngine.ts", "payload.occurredAt", "assertBackdatingThreshold", "assertBackdatingPermission", "ACCOUNTING_PERIOD_LOCKED", "ACCOUNTING_PERIOD_CLOSED", "occurredAt, deviceId"],
  ["pos-sync-governance", "packages/sync/src/worldStandardPrismaSyncEngine.ts", "assertSaleBackdatingPermission", "isBackdated", "BACKDATED_SALE_DATE_REQUIRED"],
  ["unit-regressions", "tests/unit/backdated-inventory.test.ts", "exact backdated insertion point", "INVENTORY_BACKDATE_PERMISSION_REQUIRED", "ledger.quantityBefore"],
  ["normalization-regression", "tests/unit/payload-validation-service.test.ts", "preserves occurredAt for offline historical stock movements"],
  ["integration-regressions", "tests/integration/prisma-stock-convergence.test.ts", "preserves backdated timestamps and historical lineage through authoritative sync", "ACCOUNTING_PERIOD_LOCKED"],
  ["pos-sales-regression", "tests/integration/prisma-stock-convergence.test.ts", "first-class POS backdated sales preserve historical financial and stock dates", "SALE_BACKDATE_PERMISSION_REQUIRED"],
  ["pos-ui-regression", "tests/unit/backdated-pos-ui.test.ts", "Activate Backdated Sale", "Backdated Sale Control Surface", "Historical Sale Date &amp; Time"],
  ["ci-hook", ".github/workflows/ci.yml", "npm run certify:backdated-lock"],
  ["candidate-hook", ".github/workflows/production-certification.yml", "npm run certify:backdated-lock"],
  ["release-hook", ".github/workflows/production-release-exact-main.yml", "npm run certify:backdated-lock"],
  ["package-hook", "package.json", "certify:backdated-lock"],
];

function blobSha(content: string, relativePath: string): string {
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
    const actual = blobSha(read(relativePath), relativePath);
    checked[relativePath] = { expected, actual, pass: actual === expected };
    if (actual !== expected) failures.push(`LOCK_DRIFT: ${relativePath} expected ${expected} got ${actual}`);
  } catch (error) {
    failures.push(`LOCK_READ_FAILURE: ${relativePath}: ${String(error)}`);
  }
}

for (const [name, relativePath, ...needles] of MARKERS) {
  try {
    const source = read(relativePath);
    for (const needle of needles) {
      if (!source.includes(needle)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${needle}`);
    }
  } catch (error) {
    failures.push(`CONTRACT_READ_FAILURE: ${name}: ${String(error)}`);
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
if (failures.length) process.exit(1);
console.log("BACKDATED INVENTORY PRODUCTION LOCK: PASS — " + LOCK_ID);
