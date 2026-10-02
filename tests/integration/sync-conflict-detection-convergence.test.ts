import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { applyRevisionedChanges } from "../../apps/web/src/clientSyncEngine.js";

describe("Conflict detection convergence lifecycle", () => {
  it("uses the server-compatible deterministic conflict id for delta-detected stale writes", async () => {
    const dbName = "kwakopos-conflict-delta-" + randomUUID();
    const db = new LocalIndexedDbStore(6, dbName);
    await db.ready;

    const tenantId = "tenant-conflict-delta";
    const branchId = "branch-conflict-delta";
    const operationId = "op-" + randomUUID();
    const entityId = "product-" + randomUUID();

    db.recordOutboxMutation({
      id: operationId,
      entityType: "Product",
      entityId,
      operationType: "UPDATE",
      payload: { name: "Offline Name" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "idem-" + operationId,
      status: "PENDING",
      tenantId,
      branchId,
    });

    await db.flushPersistence();

    const revision = "42";
    await applyRevisionedChanges(
      [{
        revision,
        entityType: "Product",
        entityId,
        operationType: "UPDATE",
        record: { id: entityId, tenantId, branchId, name: "Server Name" },
      }],
      revision,
      new Date().toISOString(),
      tenantId,
      branchId,
      "sync-epoch-test",
    );

    const stored = JSON.parse(
      db.syncMetadata.get("sync_conflict_" + "conflict:" + operationId) || "{}",
    );

    expect(stored.conflictId).toBe("conflict:" + operationId);
    expect(stored.operationId).toBe(operationId);
    expect(stored.operationType).toBe("UPDATE");
    expect(db.syncOutbox.get(operationId)?.status).toBe("PENDING");

    db.close();
  });
});
