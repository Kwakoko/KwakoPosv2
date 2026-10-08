import { describe, expect, it, beforeEach } from "vitest";
import { LocalIndexedDbStore, outboxMatchesScope } from "../../apps/web/src/indexedDb.js";

describe("pending outbox scope validation", () => {
  let db: LocalIndexedDbStore;

  beforeEach(async () => {
    db = new LocalIndexedDbStore(5);
    await db.ready;
    db.clear({ allowDestructiveReset: true });
  });

  const item = (id: string, tenantId?: string, branchId?: string) => ({
    id,
    entityType: "Product",
    entityId: id,
    operationType: "CREATE" as const,
    payload: {},
    clientCreatedAt: "2026-01-01T00:00:00.000Z",
    idempotencyKey: id,
    status: "PENDING" as const,
    tenantId,
    branchId,
  });

  it("accepts only complete metadata and exact scoped matches", () => {
    db.syncOutbox.set("valid", item("valid", "tenant-a", "branch-a"));
    db.syncOutbox.set("other-tenant", item("other-tenant", "tenant-b", "branch-a"));
    db.syncOutbox.set("other-branch", item("other-branch", "tenant-a", "branch-b"));
    db.syncOutbox.set("missing-tenant", item("missing-tenant", undefined, "branch-a"));
    db.syncOutbox.set("missing-branch", item("missing-branch", "tenant-a", undefined));
    db.syncOutbox.set("blank-tenant", item("blank-tenant", "   ", "branch-a"));
    db.syncOutbox.set("blank-branch", item("blank-branch", "tenant-a", "  "));

    expect(db.getPendingOutbox("tenant-a", "branch-a").map((x) => x.id)).toEqual(["valid"]);
    expect(db.getPendingOutbox("tenant-a").map((x) => x.id)).toEqual(["other-branch", "valid"]);
    expect(db.getPendingOutbox().map((x) => x.id)).toEqual(["other-branch", "other-tenant", "valid"]);
  });

  it("rejects incomplete metadata even when the requested scope is omitted", () => {
    expect(outboxMatchesScope(item("missing-tenant", undefined, "branch-a"))).toBe(false);
    expect(outboxMatchesScope(item("missing-branch", "tenant-a", undefined))).toBe(false);
    expect(outboxMatchesScope(item("blank-tenant", " ", "branch-a"))).toBe(false);
    expect(outboxMatchesScope(item("blank-branch", "tenant-a", " "))).toBe(false);
  });

  it("never treats missing scope metadata as a wildcard", () => {
    expect(outboxMatchesScope(item("x", "tenant-a", "branch-a"), "tenant-b", "branch-a")).toBe(false);
    expect(outboxMatchesScope(item("x", "tenant-a", "branch-a"), "tenant-a", "branch-b")).toBe(false);
  });
});
