import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Internal communication fabric boundary", () => {
  const read = (relativePath: string) =>
    fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

  it("keeps durable sync distinct from UI notification transport", () => {
    const context = read("apps/web/src/context/KwakoPosContexts.tsx");
    const sync = read("apps/web/src/clientSyncEngine.ts");
    const bridge = read("packages/sync/src/durableDomainEventBridge.ts");
    const dataChange = read("apps/web/src/services/dataChangeEvent.ts");

    expect(context).toContain("kwakopos_sync_channel");
    expect(sync).toContain('/sync/push');
    expect(sync).toContain('/sync/delta');
    expect(bridge).toContain("domain_event_journal");
    expect(dataChange).toContain("kwakopos:data-changed");
    expect(dataChange).not.toContain("localStorage");
  });

  it("does not permit UI code to bypass the application API facade", () => {
    const roots = [
      path.resolve(process.cwd(), "apps/web/src/pages"),
      path.resolve(process.cwd(), "apps/web/src/components"),
    ];
    const violations: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          const source = fs.readFileSync(full, "utf8");
          if (source.includes('apiClient.js') || /\bfetch\s*\(/.test(source)) {
            violations.push(path.relative(process.cwd(), full));
          }
        }
      }
    };
    for (const root of roots) walk(root);
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("requires every production outbox item to carry tenant and branch scope", () => {
    const source = read("apps/web/src/atomicOutbox.ts");
    expect(source).toContain("every production outbox mutation must carry tenantId and branchId");
    expect(source).toContain("SYNC_CONTEXT_REQUIRED");
  });
});
