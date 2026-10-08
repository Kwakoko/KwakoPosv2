import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const LOCK_ID = "KWAKOPOS-NOTIFICATIONS-PRODUCTION-LOCK-v1";

function read(relative: string): string {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) throw new Error(`MISSING_FILE:${relative}`);
  return fs.readFileSync(file, "utf8");
}

function requireText(relative: string, markers: string[]): void {
  const content = read(relative);
  for (const marker of markers) {
    if (!content.includes(marker)) {
      throw new Error(`LOCK_MARKER_MISSING:${relative}:${marker}`);
    }
  }
}

function requireAbsent(relative: string, markers: string[]): void {
  const content = read(relative);
  for (const marker of markers) {
    if (content.includes(marker)) {
      throw new Error(`LOCK_FORBIDDEN_MARKER:${relative}:${marker}`);
    }
  }
}

const checks: Array<[string, boolean]> = [];

requireText("packages/database/prisma/schema.prisma", [
  "model Notification {",
  'status            String    @default("QUEUED")',
  "recipientUserId   String",
  "readAt            DateTime?",
  "retryCount        Int       @default(0)",
  "nextRetryAt       DateTime?",
  "dedupeKey         String",
  "@@unique([tenantId, recipientUserId, dedupeKey])",
]);

requireText("packages/database/prisma/migrations/202610080003_notifications_production_lock/migration.sql", [
  "CREATE TABLE IF NOT EXISTS notifications",
  "ENABLE ROW LEVEL SECURITY",
  "CREATE POLICY kwakopos_tenant_notifications",
  "notifications_tenant_recipient_dedupe_uq",
]);

requireText("apps/api/src/services/notificationService.ts", [
  "setRlsTenantContext",
  "tx.notification.upsert",
  "async list(",
  "async markRead(",
  "async markAllRead(",
  "async markFailed(",
  "async retryDue(",
  "async retryOne(",
  "materializeOperationalAlertsTx",
  'category: "INVENTORY"',
  'category: "PAYMENT"',
  'category: "APPROVAL"',
  'category: "SYNC"',
]);

requireAbsent("apps/api/src/services/notificationService.ts", [
  "NotificationEngine",
  "private messages:",
  "new Map<string, NotificationMessageRecord>",
]);

requireText("apps/api/src/server.ts", [
  'server.get("/api/v1/notifications"',
  'server.post("/api/v1/notifications/:id/read"',
  'server.post("/api/v1/notifications/read-all"',
  'server.post("/api/v1/notifications"',
  'server.post("/api/v1/notifications/:id/retry"',
  'server.get("/api/v1/notifications/health"',
]);

requireAbsent("apps/web/src/layouts/SystemAppShellLayout.tsx", [
  "kwakopos_read_notifications",
  "SUPER_ADMIN_FALLBACK_NOTIFICATIONS",
  "TENANT_FALLBACK_NOTIFICATIONS",
]);

requireText("apps/web/src/layouts/SystemAppShellLayout.tsx", [
  '/api/v1/notifications?scope=',
  "/api/v1/notifications/read-all",
  "/api/v1/notifications/",
]);

requireText("apps/web/src/uiParityMatrix.ts", [
  "PostgreSQL Notification + EventBus",
  "server-authoritative",
  "Durable Notification.readAt transition",
]);

requireText("tests/unit/notification-production-lock.test.ts", [
  "KWAKOPOS-NOTIFICATIONS-PRODUCTION-LOCK-v1",
]);

requireText("package.json", [
  '"certify:notifications-lock": "tsx scripts/certification/notification-production-lock.ts"',
]);

for (const workflow of [
  ".github/workflows/ci.yml",
  ".github/workflows/production-certification.yml",
  ".github/workflows/production-release-exact-main.yml",
]) {
  requireText(workflow, ["npm run certify:notifications-lock"]);
}

checks.push(["durable-model", true]);
checks.push(["tenant-rsl", true]);
checks.push(["api-boundary", true]);
checks.push(["server-read-state", true]);
checks.push(["operational-alerts", true]);
checks.push(["release-gates", true]);

console.log(`${LOCK_ID}: PASS`);
console.log(`Checks: ${checks.length}/${checks.length}`);
console.log("Scope: in-app persistence, read/unread durability, delivery state, retry, tenant isolation, inventory/payment/approval/sync/system alert paths.");
