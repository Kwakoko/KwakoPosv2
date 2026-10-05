import { describe, expect, it } from "vitest";
import { requireBaseUpdatedAt } from "@kwakopos2/sync";

describe("Sync mutation preconditions", () => {
  it("requires a valid base timestamp for exclusive updates/deletes", () => {
    const base = "2026-10-05T12:00:00.000Z";
    expect(requireBaseUpdatedAt({ _baseUpdatedAt: base }, "Product")).toBe(base);
    expect(() => requireBaseUpdatedAt({}, "Product")).toThrow("SYNC_PRECONDITION_REQUIRED");
    expect(() => requireBaseUpdatedAt({ _baseUpdatedAt: "not-a-date" }, "Product")).toThrow("SYNC_PRECONDITION_REQUIRED");
  });
});
