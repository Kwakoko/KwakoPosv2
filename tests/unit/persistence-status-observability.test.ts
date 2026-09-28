import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import {
  PERSISTENCE_STATES,
  createPersistenceStatus,
} from "../../apps/web/src/persistence/persistenceStatus.js";

describe("P1 persistence state observability", () => {
  it("defines the canonical lifecycle and terminal states", () => {
    expect(PERSISTENCE_STATES).toEqual([
      "LOCAL_COMMITTED",
      "SYNC_PENDING",
      "SERVER_CONFIRMED",
      "FAILED",
      "CONFLICT",
      "TOMBSTONED",
    ]);

    const status = createPersistenceStatus(
      {
        tenantId: "tenant-p1",
        branchId: "branch-p1",
        entityType: "Product",
        entityId: "product-p1",
        operationId: "op-p1",
        operationType: "CREATE",
      },
      "LOCAL_COMMITTED",
    );
    expect(status.state).toBe("LOCAL_COMMITTED");
    expect(status.localCommittedAt).toBeTruthy();
  });

  it("tracks the local commit through pending and server confirmation durably", async () => {
    const dbName = "kwakopos-persistence-status-" + randomUUID();
    const db = new LocalIndexedDbStore(4, dbName);
    await db.ready;

    const tenantId = "tenant-p1";
    const branchId = "branch-p1";
    const item = db.createOutboxItem({
      id: "op-" + randomUUID(),
      entityType: "Product",
      entityId: "product-p1",
      operationType: "CREATE",
      payload: { id: "product-p1", name: "Observed Product" },
      tenantId,
      branchId,
    });

    await db.executeAtomicMutation({
      writes: [
        {
          store: "products",
          key: item.entityId,
          value: { id: item.entityId, tenantId, branchId, name: "Observed Product" },
        },
      ],
      outboxItem: item,
      tenantContext: { tenantId, branchId },
    });
    await db.flushPersistence();

    expect(db.getPersistenceStatus(tenantId, branchId, "Product", item.entityId)?.state)
      .toBe("SYNC_PENDING");

    db.markOutboxSynced(item.id);
    await db.flushPersistence();
    expect(db.getPersistenceStatus(tenantId, branchId, "Product", item.entityId)?.state)
      .toBe("SERVER_CONFIRMED");

    db.close();
    const reopened = new LocalIndexedDbStore(4, dbName);
    await reopened.ready;
    expect(reopened.getPersistenceStatus(tenantId, branchId, "Product", item.entityId)?.state)
      .toBe("SERVER_CONFIRMED");
    reopened.close();
  });

  it("exposes failed, retry, conflict, and tombstone states through one snapshot", async () => {
    const dbName = "kwakopos-persistence-terminal-" + randomUUID();
    const db = new LocalIndexedDbStore(4, dbName);
    await db.ready;
    const tenantId = "tenant-p1";
    const branchId = "branch-p1";

    const failed = db.createOutboxItem({
      id: "failed-" + randomUUID(), entityType: "Product", entityId: "p-failed",
      operationType: "CREATE", payload: { id: "p-failed" }, tenantId, branchId,
    });
    db.syncOutbox.set(failed.id, failed);
    db.markOutboxFailed(failed.id, "server rejected");
    expect(db.getPersistenceStatus(tenantId, branchId, "Product", "p-failed")?.state).toBe("FAILED");

    db.retryOutbox(failed.id);
    expect(db.getPersistenceStatus(tenantId, branchId, "Product", "p-failed")?.state).toBe("SYNC_PENDING");

    db.setPersistenceStatus(failed, "CONFLICT", { conflictId: "conflict-1" });
    expect(db.getPersistenceStatus(tenantId, branchId, "Product", "p-failed")?.state).toBe("CONFLICT");

    const deleted = { ...failed, id: "delete-" + randomUUID(), entityId: "p-deleted", operationType: "DELETE" as const };
    db.syncOutbox.set(deleted.id, deleted);
    db.markOutboxSynced(deleted.id);
    expect(db.getPersistenceStatus(tenantId, branchId, "Product", "p-deleted")?.state).toBe("TOMBSTONED");

    const snapshot = db.getPersistenceStatusSnapshot(tenantId, branchId);
    expect(snapshot.counts.CONFLICT).toBe(1);
    expect(snapshot.counts.TOMBSTONED).toBe(1);
    expect(snapshot.counts.SYNC_PENDING).toBe(0);
    db.close();
  });
});