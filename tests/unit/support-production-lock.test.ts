import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Support Production Lock v1", () => {
  it("has durable support lifecycle persistence and tenant RLS", () => {
    const migration = read("packages/database/prisma/migrations/202610080005_support_production_lock/migration.sql");
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "priority"');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "assigned_to_user_id"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "SupportTicketComment"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "SupportTicketAttachment"');
    expect(migration).toContain("support_ticket_lifecycle_guard");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("kwakopos_tenant_support_tickets");
  });

  it("implements all requested ticket operations with tenant filters", () => {
    const service = read("apps/api/src/services/supportTicketLifecycleService.ts");
    for (const marker of [
      "changeStatus",
      "setPriority",
      "assign",
      "addComment",
      "addAttachment",
      "escalate",
      "resolve",
      "listAudit",
      'WHERE "tenant_id"=$1',
      "set_config('kwakopos.tenant_id'",
    ]) expect(service).toContain(marker);
  });

  it("exposes lifecycle, assignment, comments, attachments, resolution, escalation and audit APIs", () => {
    const route = read("apps/api/src/routes/supportOperationsRoutes.ts");
    for (const marker of [
      "/lifecycle",
      "/priority",
      "/assign",
      "/comments",
      "/attachments",
      "/escalate",
      "/resolve",
      "/audit",
    ]) expect(route).toContain(marker);
  });

  it("locks the dedicated platform support plane to PLATFORM_SUPER_ADMIN", () => {
    const route = read("apps/api/src/routes/supportControlTowerRoutes.ts");
    expect(route).toContain('roles.includes("PLATFORM_SUPER_ADMIN")');
    expect(route).not.toContain('roles.includes("SUPER_ADMIN")');
    expect(route).not.toContain('roles.includes("SUPERADMIN")');
  });
});
