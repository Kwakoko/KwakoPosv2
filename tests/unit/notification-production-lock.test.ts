import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("KWAKOPOS-NOTIFICATIONS-PRODUCTION-LOCK-v1", () => {
  it("uses durable tenant-scoped persistence instead of browser/in-memory authority", () => {
    const service = read("apps/api/src/services/notificationService.ts");
    const schema = read("packages/database/prisma/schema.prisma");
    const ui = read("apps/web/src/layouts/SystemAppShellLayout.tsx");

    expect(service).toContain("tx.notification.upsert");
    expect(service).toContain("setRlsTenantContext");
    expect(service).not.toContain("NotificationEngine");
    expect(schema).toContain("model Notification {");
    expect(schema).toContain('@@unique([tenantId, recipientUserId, dedupeKey])');
    expect(ui).not.toContain("kwakopos_read_notifications");
  });

  it("exposes the complete authoritative inbox lifecycle", () => {
    const server = read("apps/api/src/server.ts");

    expect(server).toContain('server.get("/api/v1/notifications"');
    expect(server).toContain('server.post("/api/v1/notifications/:id/read"');
    expect(server).toContain('server.post("/api/v1/notifications/read-all"');
    expect(server).toContain('server.post("/api/v1/notifications/:id/retry"');
    expect(server).toContain('server.get("/api/v1/notifications/health"');
  });

  it("covers automated operational alert categories", () => {
    const service = read("apps/api/src/services/notificationService.ts");

    for (const category of ["INVENTORY", "PAYMENT", "APPROVAL", "SYNC"]) {
      expect(service).toContain(`category: "${category}"`);
    }
  });

  it("installs tenant RLS and release-gate coverage", () => {
    const migration = read("packages/database/prisma/migrations/202610080003_notifications_production_lock/migration.sql");
    const pkg = read("package.json");

    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("kwakopos_tenant_notifications");
    expect(pkg).toContain('"certify:notifications-lock"');
    for (const workflow of [
      ".github/workflows/ci.yml",
      ".github/workflows/production-certification.yml",
      ".github/workflows/production-release-exact-main.yml",
    ]) {
      expect(read(workflow)).toContain("npm run certify:notifications-lock");
    }
  });
});
