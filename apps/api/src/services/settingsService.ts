import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";

export const SETTINGS_SCOPES = ["TENANT", "BRANCH", "USER"] as const;
export type SettingsScope = (typeof SETTINGS_SCOPES)[number];

export const CANONICAL_SETTING_KEYS = [
  "business.profile",
  "localization.config",
  "pos.config",
  "tax.config",
  "inventory.config",
  "security.config",
  "notifications.config",
  "sync.config",
  "integrations.config",
  "retail.config",
] as const;

const DEFAULT_SETTINGS: Record<string, unknown> = {
  "business.profile": { businessName: "", tradingName: "", tinNumber: "", vrnNumber: "", email: "", phone: "", address: "" },
  "localization.config": { locale: "en" },
  "pos.config": { autoPrintReceipt: true, kickCashDrawer: true, barcodeScannerMode: "KEYBOARD_EMULATION", maxDiscountPercent: 15, allowHoldOrders: true },
  "tax.config": { vatEnabled: false, vatRatePercent: 0, currencySymbol: "Tsh", currencyCode: "TZS" },
  "inventory.config": { enforceFefoBatching: true, allowNegativeStock: false, defaultLowStockThreshold: 10, barcodePrefix: "200" },
  "security.config": {
    inactivityLockMinutes: 15,
    managerPinPolicy: "6-digit numeric PIN",
    sessionIdleTimeoutMinutes: 30,
    absoluteSessionLifetimeHours: 8,
    sessionWarningMinutes: 2,
    refreshTokenLifetimeDays: 14,
    rememberMeDurationDays: 30,
    forceLogoutOnBrowserClose: false,
    allowMultipleDevices: true,
    maxConcurrentSessions: 5,
    forceLogoutOnPasswordChange: true,
    singleDeviceLogin: false,
    trustedDevices: true,
    autoRedirect: true,
    restoreLastPage: true,
    offlineGracePeriodHours: 24,
    heartbeatIntervalMinutes: 5,
    sessionRefreshThresholdMinutes: 5,
  },
  "notifications.config": { lowStockAlerts: true, dailySummaryEmail: false, smsGatewayEnabled: false },
  "sync.config": { backgroundSyncEnabled: true, retryBackoff: "EXPONENTIAL", conflictPolicy: "SERVER_AUTHORITATIVE" },
  "integrations.config": { paymentGatewayStatus: "UNCONFIGURED" },
  "retail.config": {},
};

function assertKnownKey(key: string) {
  if (!CANONICAL_SETTING_KEYS.includes(key as any)) throw new Error("SETTING_KEY_NOT_SUPPORTED: " + key);
}
function normalizeScope(value?: string): SettingsScope {
  const scope = String(value || "BRANCH").toUpperCase() as SettingsScope;
  if (!SETTINGS_SCOPES.includes(scope)) throw new Error("SETTING_SCOPE_INVALID");
  return scope;
}

export class SettingsService {
  async getEffectiveSettings(ctx: TenantContext) {
    // Unit tests without a database still use the canonical Settings contract,
    // but must not construct a Prisma connection. Production never uses this seam.
    if (typeof process !== "undefined" && process.env.NODE_ENV === "test" && !process.env.DATABASE_URL) {
      return Object.fromEntries(
        Object.entries(DEFAULT_SETTINGS).map(([key, value]) => [key, { value, scope: "TENANT" }]),
      );
    }
    const rows = await prisma.setting.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        OR: [
          { scope: "TENANT" },
          { scope: "BRANCH", branchId: ctx.branchId },
          { scope: "USER", userId: ctx.userId },
        ],
      },
      orderBy: { updatedAt: "asc" },
    });
    const effective: Record<string, any> = Object.fromEntries(
      CANONICAL_SETTING_KEYS.map((key) => [key, { value: DEFAULT_SETTINGS[key], scope: "TENANT" }]),
    );
    const precedence: Record<string, number> = { TENANT: 1, BRANCH: 2, USER: 3 };
    for (const row of rows) {
      const scope = normalizeScope(row.scope);
      if (scope === "BRANCH" && row.branchId !== ctx.branchId) continue;
      if (scope === "USER" && row.userId !== ctx.userId) continue;
      if ((precedence[scope] || 0) >= (precedence[effective[row.key]?.scope] || 0)) {
        effective[row.key] = {
          value: row.value,
          scope,
          id: row.id,
          version: row.version,
          updatedAt: row.updatedAt.toISOString(),
        };
      }
    }
    return effective;
  }

  async getSettings(ctx: TenantContext) {
    const effective = await this.getEffectiveSettings(ctx);
    return Object.fromEntries(Object.entries(effective).map(([key, entry]: any) => [key, entry.value]));
  }

  async upsertBatch(ctx: TenantContext, records: Array<any>) {
    if (!records.length) throw new Error("SETTINGS_BATCH_EMPTY");
    const permissions = (ctx.permissions || []).map(String).map((p) => p.toLowerCase());
    const roles = (ctx.roles || []).map(String).map((r) => r.toUpperCase());
    const allowed = permissions.includes("*") || permissions.includes("settings.manage") || roles.some((r) => ["ADMIN","OWNER","SUPER_ADMIN","SUPERADMIN"].includes(r));
    if (!allowed) throw new Error("SETTINGS_MANAGE_REQUIRED");
    return prisma.$transaction(async (tx: any) => {
      await tx.$executeRawUnsafe("CREATE SEQUENCE IF NOT EXISTS sync_change_revision_seq");
      await tx.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS sync_change_journal (revision BIGINT PRIMARY KEY DEFAULT nextval('sync_change_revision_seq'), tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, operation_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, operation_type TEXT NOT NULL, record JSONB NOT NULL, source TEXT NOT NULL DEFAULT 'settings', created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
      await tx.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS sync_change_journal_tenant_branch_operation_uq ON sync_change_journal (tenant_id, branch_id, operation_id)");
      const results: any[] = [];
      for (const record of records) {
        const key = String(record.key || "").trim();
        assertKnownKey(key);
        const scope = normalizeScope(record.scope);
        if (scope === "USER" && record.userId && record.userId !== ctx.userId) throw new Error("SETTING_USER_SCOPE_FORBIDDEN");
        if (scope === "BRANCH" && record.branchId && record.branchId !== ctx.branchId) throw new Error("SETTING_BRANCH_SCOPE_FORBIDDEN");
        const branchId = scope === "BRANCH" ? ctx.branchId : null;
        const userId = scope === "USER" ? ctx.userId : null;
        const operationId = String(record.operationId || randomUUID());
        const operationType = String(record.operationType || "UPDATE").toUpperCase();
        const replay = await tx.$queryRawUnsafe(
          "SELECT entity_id, operation_type, record FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2 AND operation_id = $3 LIMIT 1",
          ctx.tenantId, ctx.branchId, operationId,
        ) as Array<{ entity_id: string; operation_type: string; record: any }>;
        if (replay[0]) {
          const replayRow = await tx.setting.findUnique({ where: { id: replay[0].entity_id } });
          if (replayRow) {
            results.push({ ...replayRow, operationId, operationType: "ALREADY_PROCESSED" });
            continue;
          }
          throw new Error("SETTINGS_IDEMPOTENCY_REPLAY");
        }
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `kwakopos:settings:${ctx.tenantId}:${scope}:${key}:${branchId || ""}:${userId || ""}`);
        const existing = await tx.setting.findFirst({
          where: { tenantId: ctx.tenantId, key, scope, branchId, userId, isActive: true },
          orderBy: { updatedAt: "desc" },
        });
        let row: any;
        if (operationType === "DELETE") {
          if (!existing) continue;
          row = await tx.setting.update({ where: { id: existing.id }, data: { isActive: false, version: { increment: 1 } } });
        } else if (existing) {
          row = await tx.setting.update({ where: { id: existing.id }, data: { value: record.value, version: { increment: 1 }, isActive: true } });
        } else {
          row = await tx.setting.create({ data: { id: String(record.entityId || randomUUID()), tenantId: ctx.tenantId, branchId, userId, scope, key, value: record.value ?? {}, version: 1, isActive: true } });
        }

        const auditMetadata = { key, scope, operationType, beforeId: existing?.id || null, beforeValue: existing?.value ?? null, afterValue: row.value, settingVersion: row.version };
        await tx.auditEvent.create({
          data: {
            id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.userId,
            deviceId: String(record.deviceId || "settings"), action: "SETTING_UPDATED",
            entityType: "Setting", entityId: row.id, metadata: auditMetadata,
          },
        });

        await tx.$executeRawUnsafe(
          "INSERT INTO sync_change_journal (tenant_id, branch_id, operation_id, entity_type, entity_id, operation_type, record, source) VALUES ($1,$2,$3,'Setting',$4,$5,$6::jsonb,'settings') ON CONFLICT (tenant_id, branch_id, operation_id) DO NOTHING",
          ctx.tenantId, ctx.branchId, operationId, row.id, operationType, JSON.stringify(operationType === "DELETE" ? { ...row, key, scope, _deleted: true } : { ...row, key, scope }),
        );
        if (key === "tax.config" && scope === "BRANCH" && operationType !== "DELETE") {
          const rawTax = (record.value || {}) as any;
          const vatEnabled = Boolean(rawTax.vatEnabled);
          const rate = Number(rawTax.vatRatePercent ?? 0);
          if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error("TAX_RATE_INVALID");
          const code = String(rawTax.taxCode || "VAT").trim().toUpperCase();
          if (!/^[A-Z0-9_-]{1,32}$/.test(code)) throw new Error("TAX_CODE_INVALID");
          const canonicalTax = await tx.tax.upsert({
            where: { tenantId_branchId_code: { tenantId: ctx.tenantId, branchId: ctx.branchId, code } },
            create: {
              id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId,
              name: String(rawTax.taxName || "VAT"), code, rate,
              isInclusive: rawTax.taxInclusivePricing !== false, isActive: vatEnabled,
            },
            update: {
              name: String(rawTax.taxName || "VAT"), rate,
              isInclusive: rawTax.taxInclusivePricing !== false, isActive: vatEnabled,
            },
          });
          const canonicalValue = {
            ...(row.value as any),
            taxId: canonicalTax.id,
            taxCode: code,
            vatRatePercent: Number(canonicalTax.rate),
            taxInclusivePricing: Boolean(canonicalTax.isInclusive),
            vatEnabled,
          };
          row = await tx.setting.update({
            where: { id: row.id },
            data: { value: canonicalValue, version: { increment: 1 }, isActive: true },
          });
        }
        results.push({ ...row, operationId, operationType });
      }
      return results;
    });
  }
}

export const globalSettingsService = new SettingsService();
