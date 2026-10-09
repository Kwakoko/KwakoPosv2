import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { LocalIndexedDbStore, AUTHORITATIVE_SCHEMA_VERSION } from "../../apps/web/src/indexedDb.js";

describe("Offline sync production lock — durable retry schedule", () => {
  it("persists retryCount, nextAttemptAt and lastAttemptAt across browser restart", async () => {
    const dbName = "kwakopos-offline-sync-retry-" + randomUUID();
    const db = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION, dbName);
    await db.ready;

    const item = db.createOutboxItem({
      id: "op-" + randomUUID(),
      entityType: "Product",
      entityId: "product-retry-proof",
      operationType: "CREATE",
      payload: { id: "product-retry-proof", name: "Retry Proof" },
      tenantId: "tenant-retry-proof",
      branchId: "branch-retry-proof",
    });
    db.syncOutbox.set(item.id, item);

    const before = Date.now();
    db.markOutboxFailed(item.id, "SIMULATED_SERVER_REJECTION");
    await db.flushPersistence();

    const stored = db.syncOutbox.get(item.id)!;
    expect(stored.status).toBe("FAILED");
    expect(stored.retryCount).toBe(1);
    expect(stored.lastAttemptAt).toBeTruthy();
    expect(stored.nextAttemptAt).toBeTruthy();
    expect(Date.parse(stored.nextAttemptAt!)).toBeGreaterThanOrEqual(before + 3_000);
    expect(Date.parse(stored.nextAttemptAt!)).toBeLessThanOrEqual(before + 7_000);

    db.close();
    const reopened = new LocalIndexedDbStore(AUTHORITATIVE_SCHEMA_VERSION, dbName);
    await reopened.ready;

    const recovered = reopened.syncOutbox.get(item.id)!;
    expect(recovered.retryCount).toBe(1);
    expect(recovered.nextAttemptAt).toBe(stored.nextAttemptAt);
    expect(reopened.getRetriableFailedOutbox("tenant-retry-proof", "branch-retry-proof")).toHaveLength(0);

    recovered.nextAttemptAt = new Date(Date.now() - 1_000).toISOString();
    reopened.syncOutbox.set(recovered.id, recovered);
    await reopened.flushPersistence();
    expect(reopened.getRetriableFailedOutbox("tenant-retry-proof", "branch-retry-proof")).toHaveLength(1);

    reopened.close();
  });
});
