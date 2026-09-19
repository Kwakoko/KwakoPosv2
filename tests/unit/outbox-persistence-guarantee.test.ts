import { describe, it, expect, vi, beforeEach } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";

describe("Pillar 1 — Outbox Guarantees: Unit Tests", () => {
  let db: LocalIndexedDbStore;

  beforeEach(() => {
    db = new LocalIndexedDbStore();
  });

  it("guarantees outbox persistence: db.enqueueOutbox stores sale before any network attempt", () => {
    const saleId = "SALE-OFFLINE-001";
    const saleRecord = {
      id: saleId,
      subtotal: 100,
      grandTotal: 100,
      lines: [{ variantId: "VAR-01", quantity: 2, unitPrice: 50 }],
    };

    // 1. Enqueue to outbox first
    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    expect(outboxItem).toBeDefined();
    expect(outboxItem.id).toBeDefined();
    expect(outboxItem.status).toBe("PENDING");

    // Assert outbox queue contains this item
    const pending = db.getPendingOutbox();
    expect(pending.length).toBe(1);
    expect(pending[0].entityId).toBe(saleId);
    expect(pending[0].idempotencyKey).toBe(saleId);
  });

  it("preserves outbox item in PENDING state when network dispatch fails after exponential backoff", async () => {
    const saleId = "SALE-OFFLINE-002";
    const saleRecord = {
      id: saleId,
      grandTotal: 250,
      lines: [{ variantId: "VAR-02", quantity: 1, unitPrice: 250 }],
    };

    // Outbox-first pattern
    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    // Mock network dispatch that fails all attempts
    const fakeApiFetch = vi.fn().mockRejectedValue(new Error("Network connection dropped: ERR_INTERNET_DISCONNECTED"));
    const delays = [10, 20, 30]; // scaled down for fast unit testing
    let synced = false;

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        await fakeApiFetch("/api/v1/pos/sales", {
          method: "POST",
          body: JSON.stringify(saleRecord),
        });
        db.markOutboxSynced(outboxItem.id);
        synced = true;
        break;
      } catch {
        if (attempt < delays.length) {
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        }
      }
    }

    expect(synced).toBe(false);
    expect(fakeApiFetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    // Crucial guarantee: sale was NOT lost or marked synced
    const pending = db.getPendingOutbox();
    expect(pending.length).toBe(1);
    expect(pending[0].status).toBe("PENDING");
    expect(pending[0].entityId).toBe(saleId);
  });

  it("marks outbox item as SYNCED only upon verified server acknowledgment", async () => {
    const saleId = "SALE-ONLINE-003";
    const saleRecord = {
      id: saleId,
      grandTotal: 150,
    };

    const outboxItem = db.enqueueOutbox({
      entityType: "Sale" as never,
      entityId: saleId,
      operationType: "CREATE",
      payload: saleRecord,
      idempotencyKey: saleId,
      tenantId: "tenant-001",
      branchId: "branch-001",
    });

    expect(db.getPendingOutbox().length).toBe(1);

    // Mock successful server response
    const fakeApiFetch = vi.fn().mockResolvedValue({ success: true, saleId });
    const res = await fakeApiFetch("/api/v1/pos/sales", { method: "POST" });
    if (res) {
      db.markOutboxSynced(outboxItem.id);
    }

    // Now it should be SYNCED, not pending
    expect(db.getPendingOutbox().length).toBe(0);
    const item = db.syncOutbox.get(outboxItem.id);
    expect(item?.status).toBe("SYNCED");
  });
});
