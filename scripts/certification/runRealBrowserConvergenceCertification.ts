import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface RealBrowserConvergenceEvidence {
  status: "PASS" | "FAIL";
  test: string;
  appUrl: string;
  browserEngine: string;
  clients: number;
  transportPath: string;
  outbox: {
    atomicEnqueueEvents: Array<{ id: string; entityType: string }>;
    outboxEntityTypes: string[];
    committedServerOperationIds: string[];
    durableOutboxDrained: boolean;
  };
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  runtimeIdentity: {
    version: string;
    gitSha: string;
    containerDigest?: string;
    cloudRunRevision?: string;
  };
  authoritativePostgres: {
    products: number;
    productVariants: number;
    stockLedger: number;
    stockAdjustments: number;
    openingStock: number;
    syncOperationsProcessed: number;
    syncJournalRows: number;
    journalRevisions: string[];
    serverHeadRevision: string;
    syncEpoch: string;
  };
  indexedDbConvergence: {
    clientCount: number;
    clientCursors: string[];
    allCursorsAtServerHead: boolean;
    allSameSyncEpoch: boolean;
    eachVariantStock: number[];
    eachLedgerQuantity: number[];
    pendingOutboxPerClient: number[];
    failedOutboxPerClient: number[];
  };
  clientsConverged: boolean;
  timestamp: string;
}

function readEvidence(evidencePath: string): RealBrowserConvergenceEvidence {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")) as RealBrowserConvergenceEvidence;
  const required = [
    evidence?.status,
    evidence?.test,
    evidence?.appUrl,
    evidence?.browserEngine,
    evidence?.clients,
    evidence?.transportPath,
    evidence?.tenantId,
    evidence?.branchId,
    evidence?.productId,
    evidence?.variantId,
    evidence?.runtimeIdentity?.version,
    evidence?.runtimeIdentity?.gitSha,
    evidence?.authoritativePostgres?.serverHeadRevision,
    evidence?.authoritativePostgres?.syncEpoch,
  ];
  if (required.some((value) => value === undefined || value === null || value === "")) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: required evidence field missing");
  }
  if (evidence.status !== "PASS" || evidence.browserEngine !== "Chromium" || evidence.clients !== 5 || !evidence.clientsConverged) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: convergence result is not PASS");
  }
  if (evidence.transportPath !== "Chromium -> IndexedDB -> durable syncOutbox -> localhost:3000 -> API -> Prisma -> PostgreSQL -> sync_change_journal -> /sync/delta -> IndexedDB") {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: required transport path is not proven");
  }
  if (!evidence.outbox?.durableOutboxDrained ||
      evidence.outbox.atomicEnqueueEvents.length < 3 ||
      new Set(evidence.outbox.outboxEntityTypes).size < 3 ||
      evidence.outbox.committedServerOperationIds.length < 3) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: durable outbox -> push proof is incomplete");
  }
  if (evidence.runtimeIdentity?.version !== "2.13.0" || !/^[0-9a-f]{40}$/i.test(evidence.runtimeIdentity?.gitSha || "")) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: runtime release identity is missing or malformed");
  }
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(evidence.appUrl)) {
    throw new Error(`REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: expected local runtime URL, got ${evidence.appUrl}`);
  }
  if (evidence.authoritativePostgres?.products !== 1 || evidence.authoritativePostgres?.productVariants !== 1 || evidence.authoritativePostgres?.stockLedger !== 1 || evidence.authoritativePostgres?.openingStock !== 25) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: authoritative PostgreSQL proof is incomplete");
  }
  if (evidence.authoritativePostgres?.syncJournalRows !== 9 || evidence.authoritativePostgres?.syncOperationsProcessed !== 8) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: sync journal/operation proof is incomplete");
  }
  if (evidence.indexedDbConvergence.clientCursors.length !== 5 ||
      evidence.indexedDbConvergence.clientCursors.some((cursor) => cursor !== evidence.authoritativePostgres.serverHeadRevision) ||
      !evidence.indexedDbConvergence.allCursorsAtServerHead ||
      !evidence.indexedDbConvergence.allSameSyncEpoch) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: one or more clients did not reach the common server head/epoch");
  }
  if (evidence.indexedDbConvergence.pendingOutboxPerClient.some((count) => count !== 0) ||
      evidence.indexedDbConvergence.failedOutboxPerClient.some((count) => count !== 0) ||
      !evidence.outbox.durableOutboxDrained) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: outbox is not fully drained");
  }
  return evidence;
}

export function runRealBrowserConvergenceCertification(): RealBrowserConvergenceEvidence {
  const rootDir = process.cwd();
  const appUrl = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:3000").trim().replace(/\/$/, "");
  const certificationStartedAt = Date.now();
  const sourceGitSha = execFileSync(
    process.platform === "win32" ? "git.exe" : "git",
    ["rev-parse", "HEAD"],
    { cwd: rootDir, encoding: "utf8" },
  ).trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(appUrl)) {
    throw new Error(`REAL_BROWSER_CONVERGENCE_BLOCKED: this pillar is the local real-Chromium gate and requires localhost/127.0.0.1, got ${appUrl}`);
  }

  const playwrightCli = path.resolve(rootDir, "node_modules", "@playwright", "test", "cli.js");
  if (!fs.existsSync(playwrightCli)) {
    throw new Error(`REAL_BROWSER_CONVERGENCE_BLOCKED: Playwright CLI not found at ${playwrightCli}`);
  }
  execFileSync(
    process.execPath,
    [playwrightCli, "test", "tests/browser/five-client-convergence.spec.ts", "--workers=1", "--reporter=line"],
    {
      cwd: rootDir,
      stdio: "inherit",
      env: { ...process.env, KWAKOPOS_LOCAL_URL: appUrl },
    },
  );

  const evidencePath = path.resolve(rootDir, "artifacts/release-evidence/kwakopos-five-client-convergence.json");
  if (!fs.existsSync(evidencePath)) {
    throw new Error(`REAL_BROWSER_CONVERGENCE_BLOCKED: expected evidence file missing at ${evidencePath}`);
  }

  const evidence = readEvidence(evidencePath);
  if (evidence.runtimeIdentity.gitSha.toLowerCase() !== sourceGitSha.toLowerCase()) {
    throw new Error(
      `REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: runtime Git SHA ${evidence.runtimeIdentity.gitSha} does not match source checkout ${sourceGitSha}`,
    );
  }
  if (Date.parse(evidence.timestamp) <= certificationStartedAt) {
    throw new Error("REAL_BROWSER_CONVERGENCE_INVALID_EVIDENCE: evidence is not fresh from this certification invocation");
  }
  const signedEvidence: RealBrowserConvergenceEvidence = {
    ...evidence,
    status: "PASS",
    appUrl,
    timestamp: new Date().toISOString(),
  };
  const outputPath = path.resolve(rootDir, "artifacts/release-evidence/real-browser-convergence-certification.json");
  fs.writeFileSync(outputPath, JSON.stringify(signedEvidence, null, 2), "utf8");
  console.log("REAL_BROWSER_CONVERGENCE_CERTIFICATION=PASS");
  console.log(`EVIDENCE=${outputPath}`);
  return signedEvidence;
}

if (process.argv[1]?.endsWith("runRealBrowserConvergenceCertification.ts")) {
  try {
    runRealBrowserConvergenceCertification();
  } catch (error: any) {
    console.error(`REAL_BROWSER_CONVERGENCE_CERTIFICATION=FAIL: ${error?.message || error}`);
    process.exit(1);
  }
}
