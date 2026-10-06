import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_ID = "BACKDATED-INVENTORY-PRODUCTION-LOCK-2026-10-06";

const LOCKED_BLOBS: Record<string, string> = {
  "package.json": "d38f90796482287564e3d9443f7e6543afee2ae4",
  ".github/workflows/ci.yml": "08208dc9578e280c9b379e9d232ada4a7ca9f7fe",
  ".github/workflows/production-certification.yml": "103963535b668b95f4761c0476545603fb8c6eea",
  ".github/workflows/production-release-exact-main.yml": "253b4a5d57a1310d6cf62baa34489a397c55eec5",
  "apps/web/src/pages/InventoryPage.tsx": "06e5d58d410ae4d8935fa3dae13ecc586ef2f689",
  "packages/contracts/src/index.ts": "bf202adfcc2d8610ef62ea6acbd331a41a132223",
  "packages/domain/src/index.ts": "97f7f953f918731832aa56eb957545fb0b07d3a1",
  "packages/database/src/index.ts": "0ded080162d6102b2c9860f86924ff167dbc178d",
  "packages/database/src/prismaRepositories.ts": "6c8d4b003f1db53a25ea6f0e02a4164ae556f936",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "25905ee2336db8c313b27bfbcebae3cb21b6ed6b",
  "tests/unit/backdated-inventory.test.ts": "1bfb722d5dcca1629bc6b64ffa69ec710367676f",
  "tests/integration/prisma-stock-convergence.test.ts": "3a33c50d3d1eea3d6cdd3a6905ec9dc3ca8fca81",
};

const MARKERS: Array<[string, string, ...string[]]> = [
  ["ui-backdate-entry", "apps/web/src/pages/InventoryPage.tsx", "Backdate Stock Movement", "Post Backdated Stock"],
  ["permission-contract", "packages/contracts/src/index.ts", "INVENTORY_BACKDATE"],
  ["domain-threshold", "packages/domain/src/index.ts", "BACKDATING_MAX_THRESHOLD_DAYS = 730", "BACKDATING_PERMISSION", "assertBackdatingPermission"],
  ["domain-insertion-invariant", "packages/domain/src/index.ts", "runningBeforeTarget", "insertionBalance"],
  ["local-governance", "packages/database/src/index.ts", "assertBackdatingPermission(ctx)", "validateRetroactiveTimeline", "currentProjectedStock"],
  ["prisma-governance", "packages/database/src/prismaRepositories.ts", "assertBackdatingPermission(ctx)", "ACCOUNTING_PERIOD_LOCKED", "ACCOUNTING_PERIOD_CLOSED", "historicalQuantityBefore"],
  ["sync-governance", "packages/sync/src/worldStandardPrismaSyncEngine.ts", "payload.occurredAt", "assertBackdatingThreshold", "assertBackdatingPermission", "ACCOUNTING_PERIOD_LOCKED", "occurredAt, deviceId"],
  ["unit-regressions", "tests/unit/backdated-inventory.test.ts", "exact backdated insertion point", "INVENTORY_BACKDATE_PERMISSION_REQUIRED", "ledger.quantityBefore"],
  ["integration-regressions", "tests/integration/prisma-stock-convergence.test.ts", "preserves backdated timestamps and historical lineage through authoritative sync", "ACCOUNTING_PERIOD_LOCKED"],
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
