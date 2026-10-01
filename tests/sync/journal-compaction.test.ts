import { describe, it, expect, beforeEach } from "vitest";
import {
  WorldStandardPrismaSyncEngine,
  type JournalCompactionOptions,
} from "@kwakopos2/sync";
import {
  PrismaProductRepository,
  PrismaStockRepository,
  prisma,
} from "@kwakopos2/database";
import { randomUUID } from "crypto";

describe("Change Journal Compaction Policy & Bootstrap Recovery Gate (Recommendation 3)", () => {
  const productRepo = new PrismaProductRepository();
  const stockRepo = new PrismaStockRepository();
  const engine = new WorldStandardPrismaSyncEngine(productRepo, stockRepo);

  const testTenantId = `test-compaction-${randomUUID()}`;
  const testBranchId = `branch-${randomUUID()}`;
  const ctx = { tenantId: testTenantId, branchId: testBranchId };

  beforeEach(async () => {
    // Ensure table exists
    await (engine as any).ensureInfrastructure();
  });

  it("1. should compute accurate compaction stats for a tenant branch scope", async () => {
    // Insert 10 mock journal entries
    for (let i = 1; i <= 10; i++) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO sync_change_journal (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source, created_at)
         VALUES ($1, $2, $3, 'Customer', $4, 'CREATE', '{"name":"Test"}', 'push', now())`,
        testTenantId,
        testBranchId,
        `op-${randomUUID()}`,
        `cust-${i}`,
      );
    }

    const statsList = await engine.getJournalCompactionStats(ctx);
    expect(statsList.length).toBe(1);
    const stats = statsList[0];
    expect(stats.tenantId).toBe(testTenantId);
    expect(stats.branchId).toBe(testBranchId);
    expect(stats.totalEntries).toBe(10);
    expect(Number(stats.minRevision)).toBeGreaterThan(0);
    expect(Number(stats.maxRevision)).toBeGreaterThanOrEqual(Number(stats.minRevision));
  });

  it("2. should simulate compaction in dry-run mode without deleting rows", async () => {
    const statsBefore = (await engine.getJournalCompactionStats(ctx))[0];
    const retainRevisions = 3;

    const dryRunResult = await engine.compactJournal(ctx, {
      retainRevisions,
      dryRun: true,
    });

    expect(dryRunResult.dryRun).toBe(true);
    expect(dryRunResult.entriesExamined).toBe(10);
    expect(dryRunResult.prunedCount).toBe(7); // 10 - 3 = 7 entries should be flagged for pruning

    // Verify nothing was actually deleted
    const statsAfter = (await engine.getJournalCompactionStats(ctx))[0];
    expect(statsAfter.totalEntries).toBe(10);
  });

  it("3. should execute live compaction pruning entries older than safe revision R_k", async () => {
    const retainRevisions = 3;
    const liveResult = await engine.compactJournal(ctx, {
      retainRevisions,
      dryRun: false,
    });

    expect(liveResult.dryRun).toBe(false);
    expect(liveResult.prunedCount).toBe(7);
    expect(liveResult.retainedCount).toBe(3);

    // Verify database only retains the 3 newest revisions
    const statsAfter = (await engine.getJournalCompactionStats(ctx))[0];
    expect(statsAfter.totalEntries).toBe(3);
    expect(Number(statsAfter.minRevision)).toBeGreaterThanOrEqual(Number(liveResult.safeRevisionThreshold));
  });

  it("4. should signal requiresBootstrap when a client delta requests a pruned revision", async () => {
    // Client cursor is at rev:0, while journal starts at minRevision > 1
    const deltaRes = await engine.processDelta(ctx as any, { since: "rev:1" });
    expect((deltaRes as any).requiresBootstrap).toBe(true);
    expect((deltaRes as any).compactionMinRevision).toBeDefined();
    expect(Number((deltaRes as any).compactionMinRevision)).toBeGreaterThan(1);
  });
});
