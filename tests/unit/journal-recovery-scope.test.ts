import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../packages/sync/src/worldStandardPrismaSyncEngine.ts", import.meta.url),
  "utf8",
);

describe("journal recovery tenant/branch scoping", () => {
  it("scopes the main reconcileJournal NOT EXISTS predicate by tenant, branch, and operation", () => {
    const marker = "AND NOT EXISTS (";
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const block = source.slice(start, source.indexOf("ORDER BY so.\"createdAt\"", start));
    expect(block).toContain('cj.tenant_id = so."tenantId"');
    expect(block).toContain('cj.branch_id = so."branchId"');
    expect(block).toContain('cj.operation_id = so."operationId"');
  });
});
