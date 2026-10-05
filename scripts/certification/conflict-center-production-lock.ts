import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures: string[] = [];

const requireFile = (relative: string) => {
  if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing required lock file: ${relative}`);
};

const sourceContains = (relative: string, needle: string, forbidden = false) => {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`Cannot inspect missing file: ${relative}`);
    return;
  }
  const source = fs.readFileSync(file, "utf8");
  const present = source.includes(needle);
  if (forbidden ? present : !present) failures.push(`${forbidden ? "Forbidden" : "Required"} pattern in ${relative}: ${needle}`);
};

console.log("KWAKOKO CONFLICT CENTER PRODUCTION LOCK v1");

for (const file of [
  "apps/web/src/services/syncStatusService.ts",
  "apps/web/src/services/syncConflictPresentationService.ts",
  "apps/web/src/components/SyncConflictResolutionModal.tsx",
  "apps/api/src/server.ts",
  "packages/sync/src/worldStandardPrismaSyncEngine.ts",
  "tests/unit/sync-conflict-center-presentation.test.ts",
  "tests/unit/sync-status-label.test.ts",
  "tests/unit/sync-conflict-authorization.test.ts",
  "tests/integration/conflict-hardening-concurrency.test.ts",
  "scripts/certify-sync-conflict-resolution.ts",
  "packages/database/prisma/migrations/202610050001_sync_conflict_hardening/migration.sql",
  ".github/workflows/conflict-center-production-lock.yml",
]) requireFile(file);

sourceContains("apps/web/src/services/syncStatusService.ts", "openConflictCount: number;");
sourceContains("apps/web/src/services/syncStatusService.ts", "Number.isInteger(Number(authority?.openConflictCount))");
sourceContains("apps/web/src/services/syncStatusService.ts", 'openConflictCount = -1;');
sourceContains("apps/web/src/services/syncStatusService.ts", 'if (snapshot.abandonedOutboxCount > 0 || snapshot.openConflictCount > 0) return "CONFLICT";');

sourceContains("apps/web/src/services/syncConflictPresentationService.ts", 'if (snapshot.reconciliationStatus === "DIVERGENT") return "DIVERGENT";');
sourceContains("apps/web/src/services/syncConflictPresentationService.ts", 'if (snapshot.openConflictCount !== 0) return "NOT_VERIFIED";');
sourceContains("apps/web/src/services/syncConflictPresentationService.ts", 'snapshot.reconciliationStatus === "IN_SYNC"');

sourceContains("apps/web/src/components/SyncConflictResolutionModal.tsx", "getConflictCenterReplicaState");
sourceContains("apps/web/src/components/SyncConflictResolutionModal.tsx", "No open conflicts — replica verification pending.");
sourceContains("apps/web/src/components/SyncConflictResolutionModal.tsx", "The last authoritative reconciliation reported divergence.");

sourceContains("tests/unit/sync-conflict-center-presentation.test.ts", "does not claim convergence before reconciliation has been established");
sourceContains("tests/unit/sync-conflict-center-presentation.test.ts", "does not claim convergence when an authoritative server conflict remains");
sourceContains("tests/unit/sync-conflict-center-presentation.test.ts", "does not claim convergence before the sync run is successful");
sourceContains("tests/unit/sync-status-label.test.ts", "never reports synced while authoritative server conflicts exist");

sourceContains(".github/workflows/conflict-center-production-lock.yml", "name: Conflict Center Production Lock v1");
sourceContains(".github/workflows/conflict-center-production-lock.yml", "pull_request:");
sourceContains(".github/workflows/conflict-center-production-lock.yml", "push:");
sourceContains("apps/api/src/server.ts", 'assertSyncConflictPermission(ctx, "sync.conflict.read");');
sourceContains("apps/api/src/server.ts", 'assertSyncConflictPermission(ctx, "sync.conflict.resolve");');
sourceContains("packages/sync/src/worldStandardPrismaSyncEngine.ts", "SYNC_CONFLICT_CHANGED_SINCE_DETECTION");
sourceContains("packages/sync/src/worldStandardPrismaSyncEngine.ts", "SYNC_CONFLICT_ID_REUSE");
sourceContains("packages/database/prisma/migrations/202610050001_sync_conflict_hardening/migration.sql", "resolved_server_revision");
sourceContains("tests/integration/conflict-hardening-concurrency.test.ts", "serializes concurrent unit conversions");
sourceContains("tests/unit/sync-conflict-authorization.test.ts", "denies conflict resolution to ordinary operational permissions");
sourceContains("apps/web/src/services/syncStatusService.ts", '"/sync/status"');
sourceContains("apps/api/src/server.ts", "openConflictCount");
sourceContains("apps/web/src/services/syncStatusService.ts", '"No open conflicts"', true);

if (failures.length) {
  console.error("CONFLICT CENTER PRODUCTION LOCK v1: FAIL");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log("CONFLICT CENTER PRODUCTION LOCK v1: PASS");
console.log("Fail-closed authority handling, explicit authorization, concurrency hardening, durable resolution acknowledgements, regression tests, and CI integration are present.");
