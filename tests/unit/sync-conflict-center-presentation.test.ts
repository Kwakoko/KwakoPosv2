import { describe, expect, it } from "vitest";
import {
  countUniqueLocalConflictIds,
  getConflictCenterReplicaState,
} from "../../apps/web/src/services/syncConflictPresentationService.js";

const baseStatus = () => ({
  state: "SUCCESS" as const,
  openConflictCount: 0,
  reconciliationStatus: "IN_SYNC" as const,
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

  it("accepts zero-divergence wording only after successful reconciliation with no queues or server conflicts", () => {
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

  it("does not claim convergence when an authoritative server conflict remains", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), openConflictCount: 1 })).toBe("NOT_VERIFIED");
  });

  it("does not claim convergence before the sync run is successful", () => {
    expect(getConflictCenterReplicaState({ ...baseStatus(), state: "IDLE" })).toBe("NOT_VERIFIED");
  });
});
