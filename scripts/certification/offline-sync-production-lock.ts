import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const LOCK_ID = "OFFLINE-SYNC-PLATFORM-PRODUCTION-LOCK-2026-10-08";
const repo = process.cwd();

const LOCKED_BLOBS: Record<string, string> = {
  "apps/web/src/indexedDb.ts": "1893f5704481b7a7178e80622b99a8c4ae42376c",
  "apps/web/src/atomicOutbox.ts": "37b6e5970add752c02f76b811db18c4228f2c6e0",
  "apps/web/src/clientSyncEngine.ts": "dc09da367ef05f11bdbf2b03e0660ca9257146ae",
  "apps/web/src/persistence/migrationEngine.ts": "3f7c6b79efed22bce68ea2868500fbd5d84687bb",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts": "6f9e95de79010ea7e40bb683c46f7f56c3c77d65",
  "tests/browser/five-client-convergence.spec.ts": "d29dac6fcac5be6245b8fa6f11d92d62de5ec4e0",
  "tests/browser/crash-restart-inflight-outbox.spec.ts": "aae962da35d5263e3507831a17bb132c8dcc8e83",
  "tests/browser/delete-tombstone-nonresurrection.spec.ts": "07d9727d0d2935387a4846b2ea73b179c76fd91e",
  "tests/sync/outbox-flaky-network.test.ts": "bdfb8e17d0e446178b9869c5dc277b742244b46d",
};

const REQUIRED_MARKERS: Array<[string, string, string[]]> = [
  ["indexeddb-authority", "apps/web/src/indexedDb.ts", [
    "AUTHORITATIVE_SCHEMA_VERSION = 7",
    "executeAtomicMutation",
    "nativeDb.transaction(stores, \"readwrite\")",
    "syncOutbox",
    "MAX_OUTBOX_RETRIES",
    "nextAttemptAt",
    "OUTBOX_RETRY_JITTER_RATIO",
    "preservedOutboxCount",
  ]],
  ["migration-authority", "apps/web/src/persistence/migrationEngine.ts", [
    "applySchemaUpgrade",
    "if (toVersion >= 5 && fromVersion < 5)",
    "if (toVersion >= 6 && fromVersion < 6)",
    "if (toVersion >= 7 && fromVersion < 7)",
  ]],
  ["atomic-outbox", "apps/web/src/atomicOutbox.ts", [
    "installAtomicOutboxBoundary()",
    "objectStore(\"syncOutbox\").put",
    "jitterRatio",
    "await targetDb.flushPersistence();",
  ]],
  ["sync-engine-client", "apps/web/src/clientSyncEngine.ts", [
    "lastSyncRevision",
    "requiresBootstrap",
    "defaultBootstrapApi",
    "applyRevisioned",
    "refreshStoresFromNative",
    "syncEpoch",
    'tombstone:"',
  ]],
  ["sync-engine-server", "packages/sync/src/worldStandardPrismaSyncEngine.ts", [
    "prisma.$transaction(async (tx: any)",
    "tx.syncOperation.create",
    "this.journal(ctx, op, snapshot, \"push\", tx)",
    "sync_change_revision_seq",
    "sync_change_journal",
    "processBootstrap",
    "processDelta",
    "STALE_WRITE_CONFLICT",
    "resolveConflict",
    "reconcileJournal",
  ]],
  ["ui-projection", "apps/web/src/context/KwakoPosContexts.tsx", [
    "publishDataChanged({ action: \"SYNC_CONVERGED\"",
    "db.getPendingOutbox",
  ]],
  ["runtime-certification", "scripts/certification/world-standard-offline-sync-certification.ts", [
    "Real production E2E proof",
    "upgradePreservedOutbox",
    "duplicateReplayIdempotent",
    "revisionReplay",
    "tenantScoped",
  ]],
  ["zero-loss-certification", "scripts/certification/runPwaZeroDataLossCertification.ts", [
    "outbox",
    "preserved",
    "recovery",
  ]],
  ["durable-retry-test", "tests/unit/offline-sync-durable-retry.test.ts", [
    "nextAttemptAt",
    "retryCount",
    "browser restart",
  ]],
  ["offline-replay-test", "tests/sync/outbox-flaky-network.test.ts", [
    "queue length MUST NOT decrease",
    "status).toBe(\"SYNCED\")",
  ]],
  ["multi-device-test", "tests/browser/five-client-convergence.spec.ts", [
    "const deviceIds = [\"DEVICE-A\", \"DEVICE-B\", \"DEVICE-C\", \"DEVICE-D\", \"DEVICE-E\"]",
    "lastSyncRevision",
    "syncEpoch",
  ]],
  ["tombstone-test", "tests/browser/delete-tombstone-nonresurrection.spec.ts", [
    "tombstonePresent",
    "lastSyncRevision",
  ]],
];

function read(file: string): string {
  const absolute = path.join(repo, file);
  if (!fs.existsSync(absolute)) throw new Error("Missing production-lock file: " + file);
  return fs.readFileSync(absolute, "utf8");
}

function blobSha(content: string, file: string): string {
  return execFileSync("git", ["hash-object", "--path=" + file, "--stdin"], {
    cwd: repo,
    input: Buffer.from(content, "utf8"),
    encoding: "utf8",
  }).trim();
}

const failures: string[] = [];
const checked: Record<string, { expected: string; actual: string; pass: boolean }> = {};

for (const [file, expected] of Object.entries(LOCKED_BLOBS)) {
  try {
    const actual = blobSha(read(file), file);
    checked[file] = { expected, actual, pass: actual === expected };
    if (actual !== expected) failures.push(`LOCK_DRIFT: ${file} expected ${expected} got ${actual}`);
  } catch (error) {
    failures.push(`LOCK_READ_FAILURE: ${file}: ${String(error)}`);
  }
}

for (const [name, file, markers] of REQUIRED_MARKERS) {
  try {
    const source = read(file);
    for (const marker of markers) {
      if (!source.includes(marker)) failures.push(`CONTRACT_FAILURE: ${name} missing marker: ${marker}`);
    }
  } catch (error) {
    failures.push(`CONTRACT_READ_FAILURE: ${name}: ${String(error)}`);
  }
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["certify:offline-sync-lock"] !== "tsx scripts/certification/offline-sync-production-lock.ts") {
  failures.push("PACKAGE_HOOK_MISSING: certify:offline-sync-lock");
}
if (packageJson.scripts?.["certify:offline-sync"] !== "tsx scripts/certification/world-standard-offline-sync-certification.ts") {
  failures.push("PACKAGE_HOOK_DRIFT: certify:offline-sync");
}
if (packageJson.scripts?.["certify:offline-e2e"] !== "tsx scripts/certification/world-standard-offline-e2e.ts") {
  failures.push("PACKAGE_HOOK_DRIFT: certify:offline-e2e");
}

for (const workflow of [
  ".github/workflows/ci.yml",
  ".github/workflows/production-certification.yml",
  ".github/workflows/production-release-exact-main.yml",
]) {
  const source = read(workflow);
  if (!source.includes("npm run certify:offline-sync-lock")) {
    failures.push(`WORKFLOW_HOOK_MISSING: ${workflow}`);
  }
}

const tracked = execFileSync("git", ["ls-files", "apps", "packages", "scripts"], {
  cwd: repo,
  encoding: "utf8",
}).split(/\r?\n/).filter(Boolean);

for (const file of tracked) {
  if (file === "apps/web/src/atomicOutbox.ts") continue;
  if (file === "scripts/certification/offline-sync-production-lock.ts") continue;
  if (/^tests\//.test(file)) continue;
  let source = "";
  try { source = read(file); } catch { continue; }
  if (/\bprocessOutbox\s*\(/.test(source) || /from ["']\.\/atomicOutbox\.js["']/.test(source) && /processOutbox/.test(source)) {
    failures.push(`LEGACY_OUTBOX_RUNTIME_USAGE: ${file} imports or invokes processOutbox; production sync must use ClientSyncEngine.`);
  }
}

const docs = [
  "docs/convergence/OFFLINE_SYNC_PRODUCTION_LOCK.md",
  "docs/convergence/OUTBOX_SPECIFICATION.md",
  "docs/convergence/BOOTSTRAP_SPECIFICATION.md",
  "docs/convergence/CONVERGENCE_CONTRACT.md",
  "docs/convergence/DELTA_SYNC_SPECIFICATION.md",
  "docs/convergence/SYNC_PROTOCOL_SPECIFICATION.md",
];
for (const doc of docs) {
  if (!fs.existsSync(path.join(repo, doc))) failures.push("MISSING_CONVERGENCE_DOC: " + doc);
}

const result = {
  lockId: LOCK_ID,
  verdict: failures.length === 0 ? "PASS" : "FAIL",
  lockedFiles: Object.keys(LOCKED_BLOBS).length,
  controls: REQUIRED_MARKERS.length,
  failures,
  checked,
  generatedAt: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) {
  console.error(`OFFLINE SYNC PLATFORM PRODUCTION LOCK: FAIL — ${LOCK_ID}`);
  process.exit(1);
}
console.log(`OFFLINE SYNC PLATFORM PRODUCTION LOCK: PASS — ${LOCK_ID}`);
