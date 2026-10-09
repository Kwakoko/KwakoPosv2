import fs from "node:fs";
import path from "node:path";

const LOCK_ID = "KWAKOPOS-SUPPORT-PRODUCTION-LOCK-v1";
const root = process.cwd();
const failures: string[] = [];

function read(relative: string): string {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    failures.push(`MISSING_FILE:${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function requireMarkers(relative: string, markers: string[]): void {
  const source = read(relative);
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`MISSING_MARKER:${relative}:${marker}`);
  }
}

function forbidMarkers(relative: string, markers: string[]): void {
  const source = read(relative);
  for (const marker of markers) {
    if (source.includes(marker)) failures.push(`FORBIDDEN_MARKER:${relative}:${marker}`);
  }
}

requireMarkers("packages/database/prisma/migrations/202610080005_support_production_lock/migration.sql", [
  'CREATE TABLE IF NOT EXISTS "SupportTicketComment"',
  'CREATE TABLE IF NOT EXISTS "SupportTicketAttachment"',
  'support_ticket_lifecycle_guard',
  'support_ticket_priority_sync',
  'ENABLE ROW LEVEL SECURITY',
  'kwakopos_tenant_support_tickets',
  'kwakopos_tenant_support_ticket_comments',
  'kwakopos_tenant_support_ticket_attachments',
  'kwakopos_tenant_support_events',
]);

requireMarkers("apps/api/src/services/supportTicketLifecycleService.ts", [
  "changeStatus",
  "setPriority",
  "assign",
  "addComment",
  "addAttachment",
  "escalate",
  "resolve",
  "listAudit",
  "set_config('kwakopos.tenant_id'",
  'WHERE "tenant_id"=$1',
  "TICKET_STATUS_CHANGED",
  "TICKET_PRIORITY_CHANGED",
  "TICKET_ASSIGNED",
  "TICKET_COMMENT_ADDED",
  "TICKET_ATTACHMENT_ADDED",
  "TICKET_ESCALATED",
  "TICKET_RESOLVED",
]);

requireMarkers("apps/api/src/routes/supportOperationsRoutes.ts", [
  '/tickets/:ticketId/lifecycle',
  '/tickets/:ticketId/priority',
  '/tickets/:ticketId/assign',
  '/tickets/:ticketId/comments',
  '/tickets/:ticketId/attachments',
  '/tickets/:ticketId/escalate',
  '/tickets/:ticketId/resolve',
  '/tickets/:ticketId/audit',
]);

requireMarkers("apps/api/src/routes/supportControlTowerRoutes.ts", [
  'roles.includes("PLATFORM_SUPER_ADMIN")',
]);
forbidMarkers("apps/api/src/routes/supportControlTowerRoutes.ts", [
  'roles.includes("SUPER_ADMIN")',
  'roles.includes("SUPERADMIN")',
]);

requireMarkers("tests/unit/support-production-lock.test.ts", [
  "Support Production Lock v1",
  "kwakopos_tenant_support_tickets",
  "/tickets/:ticketId/comments",
  "PLATFORM_SUPER_ADMIN",
]);

const packageJson = read("package.json");
if (!packageJson.includes('"certify:support-lock": "tsx scripts/certification/support-production-lock.ts"')) {
  failures.push("MISSING_MARKER:package.json:certify:support-lock");
}

if (failures.length) {
  console.error(`${LOCK_ID}: FAIL`);
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}

console.log(`${LOCK_ID}: PASS`);
console.log("Scope: tickets, lifecycle, assignment, priority, comments, attachment metadata, resolution, escalation, tenant isolation, audit, and platform support-plane authorization.");
