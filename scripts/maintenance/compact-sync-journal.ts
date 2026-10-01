/**
 * KwakoPos V2 — Scheduled / Operational Change Journal Compaction Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Recommendation 3: Prunes historical sync_change_journal records older than
 * safe revision R_k (and/or max-age retention window) once active replicas advance.
 * Preserves current authoritative database state and prevents unbounded DB growth.
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage:
 *   npx tsx scripts/maintenance/compact-sync-journal.ts [--retain=5000] [--max-age-days=30] [--dry-run] [--stats]
 */
import {
  WorldStandardPrismaSyncEngine,
  type JournalCompactionOptions,
  type JournalCompactionResult,
  type CompactionScopeContext,
} from "@kwakopos2/sync";
import {
  PrismaProductRepository,
  PrismaStockRepository,
  prisma,
} from "@kwakopos2/database";

export async function runJournalCompaction(args: {
  retainRevisions?: number;
  maxAgeDays?: number;
  tenantId?: string;
  branchId?: string;
  dryRun?: boolean;
  statsOnly?: boolean;
}): Promise<JournalCompactionResult[]> {
  const productRepo = new PrismaProductRepository();
  const stockRepo = new PrismaStockRepository();
  const engine = new WorldStandardPrismaSyncEngine(productRepo, stockRepo);

  console.log("===============================================================");
  console.log("  KwakoPos V2 — Sync Change Journal Compaction Manager");
  console.log("===============================================================");

  const ctx: CompactionScopeContext | undefined =
    args.tenantId && args.branchId ? { tenantId: args.tenantId, branchId: args.branchId } : undefined;
  const statsList = await engine.getJournalCompactionStats(ctx);

  console.log("\n[1] Current Journal State Across Active Scopes:");
  if (statsList.length === 0) {
    console.log("    (No journal entries found in sync_change_journal)");
    return [];
  }

  for (const stat of statsList) {
    console.log(`    Tenant: ${stat.tenantId} | Branch: ${stat.branchId}`);
    console.log(`      • Total Entries:  ${stat.totalEntries.toLocaleString()}`);
    console.log(`      • Revision Range: [${stat.minRevision || 0} ... ${stat.maxRevision || 0}]`);
    console.log(`      • Oldest Entry:   ${stat.oldestEntryDate || "N/A"}`);
    console.log(`      • Newest Entry:   ${stat.newestEntryDate || "N/A"}`);
  }

  if (args.statsOnly) {
    console.log("\n[INFO] --stats flag provided; compaction skipped.\n");
    return [];
  }

  const options: JournalCompactionOptions = {
    retainRevisions: args.retainRevisions ?? 5000,
    maxAgeDays: args.maxAgeDays,
    dryRun: Boolean(args.dryRun),
  };

  console.log("\n[2] Executing Journal Compaction Policy:");
  console.log(`    Retention Window: Keep at least ${options.retainRevisions} recent revisions`);
  if (options.maxAgeDays) {
    console.log(`    Max Age Threshold: Prune older than ${options.maxAgeDays} days`);
  }
  console.log(`    Execution Mode:   ${options.dryRun ? "DRY-RUN (Simulated)" : "LIVE PRUNE (Committed)"}\n`);

  let results: JournalCompactionResult[];
  if (ctx) {
    results = [await engine.compactJournal(ctx, options)];
  } else {
    results = await engine.compactAllJournals(options);
  }

  console.log("[3] Compaction Execution Summary:");
  let totalExamined = 0;
  let totalPruned = 0;

  for (const r of results) {
    totalExamined += r.entriesExamined;
    totalPruned += r.prunedCount;
    console.log(
      `    ✓ [${r.tenantId}/${r.branchId}] Safe Rev: R_k <= ${r.safeRevisionThreshold} | ` +
      `Pruned: ${r.prunedCount.toLocaleString()} | Retained: ${r.retainedCount.toLocaleString()} ` +
      `(${r.dryRun ? "DRY-RUN" : "COMMITTED"})`
    );
  }

  console.log("---------------------------------------------------------------");
  console.log(`  Total Entries Examined: ${totalExamined.toLocaleString()}`);
  console.log(`  Total Entries Pruned:   ${totalPruned.toLocaleString()} ${options.dryRun ? "(Simulated)" : "(Deleted)"}`);
  console.log("===============================================================\n");

  return results;
}

function parseCliArgs(): {
  retainRevisions?: number;
  maxAgeDays?: number;
  tenantId?: string;
  branchId?: string;
  dryRun?: boolean;
  statsOnly?: boolean;
} {
  const argv = process.argv.slice(2);
  let retainRevisions: number | undefined;
  let maxAgeDays: number | undefined;
  let tenantId: string | undefined;
  let branchId: string | undefined;
  let dryRun = false;
  let statsOnly = false;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--stats") statsOnly = true;
    else if (arg.startsWith("--retain=")) retainRevisions = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--max-age-days=")) maxAgeDays = parseInt(arg.split("=")[1], 10);
    else if (arg.startsWith("--tenant=")) tenantId = arg.split("=")[1];
    else if (arg.startsWith("--branch=")) branchId = arg.split("=")[1];
  }

  return { retainRevisions, maxAgeDays, tenantId, branchId, dryRun, statsOnly };
}

if (process.argv[1] && process.argv[1].includes("compact-sync-journal")) {
  const args = parseCliArgs();
  runJournalCompaction(args)
    .then(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[ERROR] Compaction failed:", err);
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    });
}
