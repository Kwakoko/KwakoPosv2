import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const LOCK_ID = "POS-TERMINAL-PRODUCTION-LOCK-2026-10-05";
const LOCKED_BLOBS: Record<string, string> = {
  "apps/web/src/pages/PosPage.tsx": "9a18ff18044b097e1631a132a868b31d58cd97f8",
  "packages/domain/src/business/posCheckoutEngine.ts": "840fb268efe7453d59f0d6ac62715cdf8b544558",
  "apps/web/src/services/inventoryStockService.ts": "2278f496b81368dd7c284783a381c9611edd4465",
  "apps/web/src/services/applicationApiService.ts": "0da2356445acc3f2cdd1055627c934a48161310b",
};

const MARKERS: Array<[string, string, string]> = [
  ["authoritative-catalog", "apps/web/src/pages/PosPage.tsx", "Authoritative local catalog projection. Production POS must never invent demo products."],
  ["authoritative-cash-session", "apps/web/src/pages/PosPage.tsx", "/api/v1/cash-sessions/active"],
  ["atomic-sale-boundary", "apps/web/src/pages/PosPage.tsx", "db.executeAtomicMutation"],
  ["no-custom-authority-bypass", "apps/web/src/pages/PosPage.tsx", "Custom/non-inventory items are not supported by the authoritative sale contract."],
  ["explicit-supervisor-permission", "apps/web/src/pages/PosPage.tsx", 'hasPermission("sales.void")'],
  ["tenant-isolation", "packages/domain/src/business/posCheckoutEngine.ts", "TENANT_BOUNDARY_VIOLATION"],
  ["stock-authority", "packages/domain/src/business/posCheckoutEngine.ts", "INSUFFICIENT_STOCK"],
  ["checkout-event", "packages/domain/src/business/posCheckoutEngine.ts", "CHECKOUT_COMPLETED"],
  ["tenant-scoped-stock", "apps/web/src/services/inventoryStockService.ts", "tenantId"],
  ["application-api-facade", "apps/web/src/services/applicationApiService.ts", "export * from \"./apiClient.js\";"],
];

function sha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
}
function read(file: string): string {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) throw new Error(`missing file: ${file}`);
  return fs.readFileSync(p, "utf8");
}

const failures: string[] = [];
const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};
for (const [file, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = sha(read(file));
    const pass = actual === expected;
    checked[file] = { expected, actual, pass };
    if (!pass) failures.push(`LOCK_DRIFT: ${file} expected ${expected} got ${actual}`);
  } catch (error) {
    failures.push(`LOCK_READ_FAILURE: ${file}: ${String(error)}`);
  }
}
for (const [name, file, marker] of MARKERS) {
  try {
    if (!read(file).includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker in ${file}`);
  } catch {
    failures.push(`CONTRACT_READ_FAILURE: ${name} could not read ${file}`);
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
console.log(`POS TERMINAL PRODUCTION LOCK: PASS — ${LOCK_ID}`);
