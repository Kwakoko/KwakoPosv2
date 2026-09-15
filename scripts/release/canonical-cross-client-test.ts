import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * KwakoPos Release Engineering Platform v2 — Canonical Cross-Client Transaction Test Runner
 * Executes Section 20 critical transaction verification:
 * Browser A -> Create Product -> Variant -> Stock -> Sale/Adjustment -> Server Sync -> Browser B -> Persistence & Convergence Verification.
 */

export interface CrossClientTestResult {
  testId: string;
  timestamp: string;
  status: "PASS" | "FAIL";
  browserA: {
    productId: string;
    variantId: string;
    initialStock: number;
    saleQuantity: number;
    finalStock: number;
  };
  serverSync: {
    ledgerEventsRecorded: number;
    outboxSynced: boolean;
    serverCalculatedBalance: number;
  };
  browserB: {
    syncedProductVerified: boolean;
    syncedVariantVerified: boolean;
    syncedStockVerified: boolean;
    syncedLedgerVerified: boolean;
    calculatedBalance: number;
  };
  resilienceChecks: {
    refreshPersistence: boolean;
    logoutLoginPersistence: boolean;
    serviceWorkerUpdatePersistence: boolean;
    reconnectRetryPersistence: boolean;
  };
  message: string;
}

export function runCanonicalCrossClientTest(): CrossClientTestResult {
  throw new Error(
    "REAL_RUNTIME_REQUIRED: synthetic cross-client results are prohibited. Use `npm run production:browser` with NODE_ENV=production-certification and a real CANDIDATE_URL; the authoritative Playwright spec writes the evidence artifact."
  );
}

if (process.argv[1]?.endsWith("canonical-cross-client-test.ts")) {
  if (process.env.NODE_ENV !== "production-certification") {
    throw new Error("REAL_RUNTIME_REQUIRED: production:browser must run with NODE_ENV=production-certification.");
  }
  if (!process.env.CANDIDATE_URL || /localhost|127\.0\.0\.1/i.test(process.env.CANDIDATE_URL)) {
    throw new Error("REAL_RUNTIME_REQUIRED: CANDIDATE_URL must be a real HTTPS candidate endpoint.");
  }

  const runner = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(runner, ["playwright", "test", "tests/browser/production-browser.spec.mjs", "--config=playwright.production.config.mjs"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  const evidencePath = resolve(process.cwd(), "artifacts/release-evidence/kwakopos-browser-certification-evidence.json");
  if (!existsSync(evidencePath)) {
    throw new Error(`REAL_RUNTIME_REQUIRED: authoritative Playwright evidence was not produced at ${evidencePath}.`);
  }
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (evidence.finalConvergenceStatus !== "PASS") {
    throw new Error("REAL_RUNTIME_REQUIRED: authoritative Playwright convergence evidence is not PASS.");
  }
  console.log(`REAL_CROSS_CLIENT_CERTIFICATION=PASS\\nEVIDENCE=${evidencePath}`);
}
