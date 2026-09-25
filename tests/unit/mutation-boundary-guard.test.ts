import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(entry.name) ? [file] : [];
  });
}

describe("Repository-wide local mutation boundary", () => {
  it("forbids direct outbox persistence outside the atomic infrastructure", () => {
    const root = path.resolve(process.cwd(), "apps/web/src");
    const allowed = new Set([
      path.resolve(root, "indexedDb.ts"),
      path.resolve(root, "atomicOutbox.ts"),
    ]);
    const violations: string[] = [];
    for (const file of sourceFiles(root)) {
      if (allowed.has(file)) continue;
      const source = fs.readFileSync(file, "utf8");
      for (const needle of ["enqueueOutbox(", "recordOutboxMutation("]) {
        if (source.includes(needle)) violations.push(path.relative(process.cwd(), file) + " => " + needle);
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
