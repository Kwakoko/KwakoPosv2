import { describe, expect, it } from "vitest";
import { assertSyncConflictPermission, hasSyncConflictPermission } from "@kwakopos2/sync";

describe("Sync conflict authorization", () => {
  it("allows explicit conflict-read permission", () => {
    expect(hasSyncConflictPermission({ permissions: ["sync.conflict.read"] }, "sync.conflict.read")).toBe(true);
  });

  it("denies conflict resolution to ordinary operational permissions", () => {
    expect(hasSyncConflictPermission({ permissions: ["sales.create"] }, "sync.conflict.resolve")).toBe(false);
    expect(() => assertSyncConflictPermission({ permissions: ["sales.create"] }, "sync.conflict.resolve")).toThrow("FORBIDDEN");
  });

  it("allows resolution to an explicit permission or settings administrator", () => {
    expect(hasSyncConflictPermission({ permissions: ["sync.conflict.resolve"] }, "sync.conflict.resolve")).toBe(true);
    expect(hasSyncConflictPermission({ permissions: ["settings.manage"] }, "sync.conflict.resolve")).toBe(true);
  });

  it("treats branch managers as readers but not resolvers", () => {
    expect(hasSyncConflictPermission({ roles: ["MANAGER"] }, "sync.conflict.read")).toBe(true);
    expect(hasSyncConflictPermission({ roles: ["MANAGER"] }, "sync.conflict.resolve")).toBe(false);
  });
});
