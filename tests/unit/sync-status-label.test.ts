import { describe, expect, it } from "vitest";
import { syncStatusLabel, type SyncStatusSnapshot } from "../../apps/web/src/services/syncStatusService.js";

const base = (): SyncStatusSnapshot => ({
  tenantId: "tenant-1",
  branchId: "branch-1",
  state: "IDLE",
  localRevision: "10",
  serverRevision: "10",
  syncEpoch: "epoch-1",
  reconciliationStatus: "IN_SYNC",
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  abandonedOutboxCount: 0,
  lastSyncedAt: Date.now(),
  lastSyncDurationMs: 25,
  lastError: null,
  lastResult: { pushed: 0, pulled: 0 },
  updatedAt: Date.now(),
});

describe("syncStatusLabel", () => {
  it("never reports synced while failed mutations exist", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS", failedOutboxCount: 4 })).toBe("ERROR");
  });

  it("never reports synced while retry-exhausted conflicts exist", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS", abandonedOutboxCount: 2 })).toBe("CONFLICT");
  });

  it("reports pending when the durable outbox still has work", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS", pendingOutboxCount: 1 })).toBe("PENDING");
  });

  it("does not report synced before authoritative reconciliation is verified", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS", reconciliationStatus: "UNKNOWN" })).toBe("VERIFYING");
  });

  it("reports a reconciliation divergence as a conflict", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS", reconciliationStatus: "DIVERGENT" })).toBe("CONFLICT");
  });

  it("reports synced only after a successful sync with an empty clean queue and IN_SYNC reconciliation", () => {
    expect(syncStatusLabel({ ...base(), state: "SUCCESS" })).toBe("SYNCED");
  });
});
