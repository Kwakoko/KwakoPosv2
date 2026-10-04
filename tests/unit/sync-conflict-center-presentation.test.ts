import { describe, expect, it } from "vitest";
import {
  countUniqueLocalConflictIds,
  getConflictCenterReplicaState,
} from "../../apps/web/src/services/syncConflictPresentationService.js";

const baseStatus = () => ({
  reconciliationStatus: "IN_SYNC" as const,
  openConflictCount: 0,
  pendingOutboxCount: 0,
  failedOutboxCount: 0,
  abandonedOutboxCount: 0,
});

describe("Conflict Center presentation invariants", () => {
  it("deduplicates the two local metadata keys for one conflict", () => {
    const entries: [string, string][] = [
      ["sync_conflict_conflict:123", JSON.stringify({ conflictId: "conflict:123" })],
      ["sync_conflict_Product_product-1", JSON.stringify({ conflictId: "conflict:123" })],
      ["sync_conflict_conflict:456", JSON.stringify({ conflictId: "conflict:456" })],
    ];

    expect(countUniqueLocalConflictIds(entries)).toBe(2);
  });

  it("accepts zero-divergence wording only for IN_SYNC with no queues", () => {
    expect(getConflictCenterReplicaState(baseStatus())).toBe("VERIFIED");
  });

  it("does not claim convergence while mutations remain pending", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), pendingOutboxCount: 1 })).toBe("NOT_VERIFIED");
  });

  it("does not claim convergence while failures remain", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), failedOutboxCount: 1 })).toBe("NOT_VERIFIED");
  });

  it("does not claim convergence while abandoned mutations remain", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), abandonedOutboxCount: 1 })).toBe("NOT_VERIFIED");
  });

  it("surfaces an authoritative divergence even when the open conflict list is empty", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), reconciliationStatus: "DIVERGENT" })).toBe("DIVERGENT");
  });

  it("does not claim convergence before reconciliation has been established", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), reconciliationStatus: "UNKNOWN" })).toBe("NOT_VERIFIED");
  });

  it("does not claim zero conflicts when the authoritative conflict count is unknown", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), openConflictCount: null })).toBe("NOT_VERIFIED");
  });

  it("does not claim zero conflicts when the authoritative server reports open conflicts", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), openConflictCount: 2 })).toBe("NOT_VERIFIED");
  });
});
