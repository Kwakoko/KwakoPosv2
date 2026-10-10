import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const LOCK_ID = "CASH-MANAGEMENT-PRODUCTION-LOCK-V1-2026-10-07";
const REQUIRED_SUBITEMS = [
  "Cash registers",
  "Till/session opening",
  "Cash-in",
  "Cash-out",
  "Cash transfers",
  "Cash reconciliation",
  "Till closing",
  "Cash variance",
  "Payment-channel reconciliation",
  "Cash reports",
  "Audit trail",
];

const LOCKED_BLOBS: Record<string, string> = {
  "apps/web/src/pages/CashDrawerPage.tsx": "8f57d8586a833d37aee9f37d99efad869fcb607e",
  "apps/api/src/server.ts": "7f12aa469897be1e93b4505d7cbb41e15e64be07",
  "packages/contracts/src/index.ts": "27b80e50d9ee754721393adc6d858b1e71143cd2",
  "packages/database/src/prismaProductionRepositories.ts": "b2cf81b306fca370b230e8554c60b33c920279eb",
  "packages/database/src/commercialRepositories.ts": "c188b7d11db34e5740d754ed7113af635838b7d6",
  "packages/database/prisma/schema.prisma": "9a5d562964681cbae04f79efac7d6dd406c2fb74",
  "packages/database/prisma/migrations/202610070001_cash_register_control/migration.sql": "8dcb1fa1c5b2ea4615122beb05b5befa966ee7e3",
  "packages/domain/src/cashSessionEngine.ts": "dba62875d6293e50e38feeb4abbf977ff7b922ae",
  "packages/domain/src/financialBridge.ts": "398c6bdcacc0ac5c7c7c0b513e6ac47b7a7b4131",
  "packages/domain/src/financeInvariants.ts": "24c87b01c5f9b05168961ff4702c98c60f55cfdb",
  "tests/integration/cash-management-production-lock.test.ts": "203c4f5fb29548a9cafa189cf898f9bfbd199aa1",
};

const MARKERS: Array<[string, string, string[]]> = [
  ["registers", "apps/web/src/pages/CashDrawerPage.tsx", ["kwakopos:cash-register-id", "registerCode", "REGISTER TERMINAL"]],
  ["session-opening", "apps/api/src/server.ts", ['server.post("/api/v1/cash-sessions"', "registerCode"]],
  ["cash-in-out", "packages/database/src/prismaProductionRepositories.ts", ["CASH_IN", "CASH_OUT", "CASH_INSUFFICIENT_DRAWER_BALANCE", "CASH_COUNT_ALREADY_SEALED"]],
  ["cash-transfer", "apps/api/src/server.ts", ['server.post("/api/v1/cash-sessions/:id/transfer"', "CashTransferRequestSchema"]],
  ["cash-transfer-authority", "packages/database/src/prismaProductionRepositories.ts", ["async transferCash", "CASH_TRANSFER_BOUNDARY_VIOLATION"]],
  ["reconciliation", "packages/domain/src/cashSessionEngine.ts", ["Expected Cash", "Variance"]],
  ["variance-journal", "packages/database/src/prismaProductionRepositories.ts", ["CASH_VARIANCE_MANAGER_APPROVAL_REQUIRED", "mapCashSessionVarianceToJournal"]],
  ["variance-journal-idempotency", "packages/domain/src/financialBridge.ts", ["jrn-var-", "mapCashSessionVarianceToJournal"]],
  ["channel-reconciliation", "apps/api/src/server.ts", ["payment-channel-reconciliation", "getPaymentChannelReconciliation"]],
  ["reports", "apps/web/src/pages/CashDrawerPage.tsx", ["Run X-Reading", "Reprint Z-Slip", "Completed Shift Reports Journal"]],
  ["audit-trail", "apps/api/src/server.ts", ["audit-trail", "getCashAuditTrail"]],
  ["audit-events", "packages/database/src/prismaProductionRepositories.ts", ["CASH_SESSION_OPENED", "CASH_COUNT_SEALED", "CASH_MOVEMENT_CREATED", "CASH_TRANSFER_COMPLETED", "CASH_SESSION_CLOSED"]],
  ["integration-certification", "tests/integration/cash-management-production-lock.test.ts", ["cash lifecycle", "CASH_VARIANCE_MANAGER_APPROVAL_REQUIRED", "CASH_MOVEMENT_IDEMPOTENCY_BOUNDARY_VIOLATION"]],
  ["schema-migration", "packages/database/prisma/migrations/202610070001_cash_register_control/migration.sql", ["registerCode", "cash_sessions_active_register_unique"]],
];

function gitBlobSha(content: string, relativePath: string): string {
  try {
    return execFileSync("git", ["hash-object", "--path=" + relativePath, "--stdin"], { input: Buffer.from(content, "utf8"), encoding: "utf8" }).trim();
  } catch {
    const bytes = Buffer.from(content, "utf8");
    return createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
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

for (const [name, relativePath, markers] of MARKERS) {
  try {
    const source = read(relativePath);
    for (const marker of markers) {
      if (!source.includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${marker}`);
    }
  } catch (error) {
    failures.push(`CONTRACT_READ_FAILURE: ${name}: ${String(error)}`);
  }
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length ? "FAIL" : "PASS",
  requiredSubitems: REQUIRED_SUBITEMS,
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  checked,
  failures,
  generatedAt: new Date().toISOString(),
};
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exit(1);
console.log("CASH MANAGEMENT PRODUCTION LOCK: PASS — " + LOCK_ID);
