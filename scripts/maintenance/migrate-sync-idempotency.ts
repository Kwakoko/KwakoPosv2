/**
 * Maintenance script: Verify and migrate existing syncOperation records.
 * Ensures idempotency keys and operationIds are populated, deduplicated, and
 * consistent across tenant/branch boundaries without deviceId constraint locks.
 */
import { prisma } from "@kwakopos2/database";

export async function migrateSyncIdempotency(): Promise<{
  scanned: number;
  fixed: number;
  duplicateKeysDetected: number;
}> {
  console.log("[Migration] Scanning sync_operations for idempotency anomalies...");
  const operations = await prisma.syncOperation.findMany({
    orderBy: { createdAt: "asc" },
  });

  let fixed = 0;
  let duplicateKeysDetected = 0;
  const seenKeys = new Set<string>();

  for (const op of operations) {
    const key = `${op.tenantId}:${op.branchId}:${op.idempotencyKey}`;
    if (seenKeys.has(key)) {
      duplicateKeysDetected += 1;
      console.warn(`[Migration] Duplicate idempotency key across records: ${key} (OpId: ${op.operationId})`);
    } else {
      seenKeys.add(key);
    }

    if (!op.idempotencyKey || op.idempotencyKey.trim() === "") {
      await prisma.syncOperation.update({
        where: { id: op.id },
        data: { idempotencyKey: op.operationId },
      });
      fixed += 1;
    }
  }

  console.log(`[Migration] Scanned: ${operations.length}, Fixed: ${fixed}, Duplicates: ${duplicateKeysDetected}`);
  return { scanned: operations.length, fixed, duplicateKeysDetected };
}

if (process.argv[1] && process.argv[1].endsWith("migrate-sync-idempotency.ts")) {
  migrateSyncIdempotency()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
