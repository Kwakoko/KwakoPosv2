import { execFileSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();

const inGate = [
  "tests/unit/catalog-brand-persistence.test.ts",
  "tests/unit/font-persistence.test.ts",
  "tests/unit/login-logout-persistence-lifecycle.test.ts",
  "tests/unit/outbox-persistence-guarantee.test.ts",
  "tests/unit/pwa-durable-lifecycle.test.ts",
  "tests/unit/pwa-version.test.ts",
  "tests/unit/session-persistence.test.ts",
];

const excluded = [
  "tests/unit/p1-commercial-acceptance.test.ts",
  "tests/unit/p3-workforce-acceptance.test.ts",
  "tests/unit/product-registration-wizard.test.ts",
  "tests/unit/snapshot-reconciliation.test.ts",
];

console.log("============================================================");
console.log(" KWAKOPOS NODE PERSISTENCE TEST GATE");
console.log("============================================================");
console.log("IN-GATE:");
inGate.forEach((file) => console.log("  + " + file));
console.log("EXCLUDED HYBRID ACCEPTANCE SUITES:");
excluded.forEach((file) => console.log("  - " + file));
console.log("These suites remain in the general unit suite and dedicated acceptance/browser coverage.");

const vitestBin = path.resolve(root, "node_modules/vitest/vitest.mjs");
try {
  execFileSync(process.execPath, [vitestBin, "run", ...inGate], {
    cwd: root,
    stdio: "inherit",
  });
} catch (error: any) {
  const status = Number(error?.status || 1);
  console.error("\n❌ NODE PERSISTENCE TEST GATE FAILED");
  process.exit(status);
}
console.log("\n✅ NODE PERSISTENCE TEST GATE PASSED");
