import { prisma, setRlsTenantContext } from "@kwakopos2/database";
import type { TenantContext } from "@kwakopos2/contracts";
import { randomUUID } from "node:crypto";

export type NotificationScope = "TENANT" | "SUPER_ADMIN";
export type NotificationCategory =
  | "SYSTEM"
  | "INVENTORY"
  | "PAYMENT"
  | "APPROVAL"
  | "SYNC"
  | "POS"
  | "SUPPORT"
  | "SECURITY"
  | "FLEET";
export type NotificationSeverity = "CRITICAL" | "WARNING" | "INFO";

export interface NotificationCreateInput {
  recipientUserId?: string;
  branchId?: string | null;
  scope?: NotificationScope;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  channel?: "SMS" | "EMAIL" | "PUSH" | "WHATSAPP" | "IN_APP";
  title: string;
  description: string;
  actionPath?: string | null;
  actionLabel?: string | null;
  dedupeKey?: string;
}

const RETRY_BACKOFF_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
const MAX_RETRY_COUNT = RETRY_BACKOFF_MS.length;

function assertContext(ctx: TenantContext): void {
  if (!ctx?.tenantId || !ctx?.branchId || !ctx?.userId) {
    throw new Error("TENANT_BRANCH_CONTEXT_REQUIRED");
  }
}

function retryAtFor(retryCount: number): Date | null {
  if (retryCount < 0 || retryCount >= MAX_RETRY_COUNT) return null;
  return new Date(Date.now() + RETRY_BACKOFF_MS[retryCount]);
}

export class NotificationService {
  async queue(ctx: TenantContext, input: NotificationCreateInput) {
    assertContext(ctx);
    const recipientUserId = input.recipientUserId || ctx.userId;
    const dedupeKey = input.dedupeKey || `manual:${randomUUID()}`;

    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const recipient = await tx.user.findFirst({
        where: {
          id: recipientUserId,
          tenantId: ctx.tenantId,
          ...(input.branchId ? { branchId: input.branchId } : {}),
        },
        select: { id: true },
      });
      if (!recipient) throw new Error("NOTIFICATION_RECIPIENT_NOT_FOUND");

      return tx.notification.upsert({
        where: {
          tenantId_recipientUserId_dedupeKey: {
            tenantId: ctx.tenantId,
            recipientUserId,
            dedupeKey,
          },
        },
        create: {
          tenantId: ctx.tenantId,
          branchId: input.branchId ?? ctx.branchId,
          recipientUserId,
          scope: input.scope ?? "TENANT",
          category: input.category,
          severity: input.severity ?? "INFO",
          channel: input.channel ?? "IN_APP",
          title: input.title,
          description: input.description,
          actionPath: input.actionPath ?? null,
          actionLabel: input.actionLabel ?? null,
          status: "QUEUED",
          retryCount: 0,
          dedupeKey,
        },
        update: {},
      });
    });
  }

  async deliver(ctx: TenantContext, notificationId: string) {
    assertContext(ctx);
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const row = await tx.notification.findFirst({
        where: { id: notificationId, tenantId: ctx.tenantId, recipientUserId: ctx.userId },
      });
      if (!row) throw new Error("NOTIFICATION_NOT_FOUND");

      const now = new Date();
      return tx.notification.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          sentAt: row.sentAt ?? now,
          deliveredAt: now,
          nextRetryAt: null,
          lastError: null,
        },
      });
    });
  }

  async publish(ctx: TenantContext, input: NotificationCreateInput) {
    const queued = await this.queue(ctx, input);
    return this.deliver({ ...ctx, userId: input.recipientUserId || ctx.userId }, queued.id);
  }

  async list(ctx: TenantContext, scope: NotificationScope = "TENANT", limit = 100) {
    assertContext(ctx);
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      await this.materializeOperationalAlertsTx(tx, ctx);

      return tx.notification.findMany({
        where: {
          tenantId: ctx.tenantId,
          recipientUserId: ctx.userId,
          scope,
          OR: [{ branchId: ctx.branchId }, { branchId: null }],
        },
        orderBy: { createdAt: "desc" },
        take: boundedLimit,
      });
    });
  }

  async markRead(ctx: TenantContext, notificationId: string) {
    assertContext(ctx);
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const result = await tx.notification.updateMany({
        where: {
          id: notificationId,
          tenantId: ctx.tenantId,
          recipientUserId: ctx.userId,
          readAt: null,
        },
        data: { readAt: new Date(), updatedAt: new Date() },
      });
      if (result.count !== 1) throw new Error("NOTIFICATION_NOT_FOUND_OR_ALREADY_READ");
      return { success: true };
    });
  }

  async markAllRead(ctx: TenantContext, scope?: NotificationScope) {
    assertContext(ctx);
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const result = await tx.notification.updateMany({
        where: {
          tenantId: ctx.tenantId,
          recipientUserId: ctx.userId,
          ...(scope ? { scope } : {}),
          readAt: null,
        },
        data: { readAt: new Date(), updatedAt: new Date() },
      });
      return { success: true, updated: result.count };
    });
  }

  async markFailed(ctx: TenantContext, notificationId: string, error: string) {
    assertContext(ctx);
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const row = await tx.notification.findFirst({
        where: { id: notificationId, tenantId: ctx.tenantId },
      });
      if (!row) throw new Error("NOTIFICATION_NOT_FOUND");

      const retryCount = row.retryCount + 1;
      return tx.notification.update({
        where: { id: row.id },
        data: {
          status: "FAILED",
          retryCount,
          lastError: error.slice(0, 1000),
          nextRetryAt: retryAtFor(retryCount),
          updatedAt: new Date(),
        },
      });
    });
  }

  async retryDue(ctx: TenantContext, limit = 50) {
    assertContext(ctx);
    const candidates = await prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      return tx.notification.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: "FAILED",
          nextRetryAt: { lte: new Date() },
          retryCount: { lt: MAX_RETRY_COUNT },
        },
        orderBy: { nextRetryAt: "asc" },
        take: Math.max(1, Math.min(limit, 100)),
      });
    });

    let delivered = 0;
    for (const candidate of candidates) {
      try {
        await this.deliver({ ...ctx, userId: candidate.recipientUserId }, candidate.id);
        delivered++;
      } catch {
        // Leave the failed row durable for the next retry window.
      }
    }
    return { attempted: candidates.length, delivered };
  }

  async getHealthSummary(ctx: TenantContext) {
    assertContext(ctx);
    return prisma.$transaction(async (tx) => {
      await setRlsTenantContext(tx, ctx);
      const [total, delivered, failed, unread] = await Promise.all([
        tx.notification.count({ where: { tenantId: ctx.tenantId } }),
        tx.notification.count({ where: { tenantId: ctx.tenantId, status: "DELIVERED" } }),
        tx.notification.count({ where: { tenantId: ctx.tenantId, status: "FAILED" } }),
        tx.notification.count({ where: { tenantId: ctx.tenantId, recipientUserId: ctx.userId, readAt: null } }),
      ]);
      return {
        tenantId: ctx.tenantId,
        engineOperational: true,
        totalDispatchedCount: total,
        deliveredCount: delivered,
        failedCount: failed,
        unreadCount: unread,
        blockedConsentCount: 0,
      };
    });
  }

  private async materializeOperationalAlertsTx(tx: any, ctx: TenantContext): Promise<void> {
    const now = new Date();

    const [lowStock, failedPayments, pendingApprovals, failedSyncs] = await Promise.all([
      tx.productVariant.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          isActive: true,
          inventoryQuantity: { lte: tx.productVariant.fields.reorderLevel },
        },
        select: { id: true, sku: true, name: true, inventoryQuantity: true, reorderLevel: true, updatedAt: true },
        take: 50,
      }).catch(async () => tx.productVariant.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, isActive: true },
        select: { id: true, sku: true, name: true, inventoryQuantity: true, reorderLevel: true, updatedAt: true },
        take: 50,
      })),
      tx.payment.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: { in: ["FAILED", "PENDING"] } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, paymentNumber: true, status: true, updatedAt: true },
        take: 25,
      }),
      tx.purchaseOrder.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: "DRAFT" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, orderNumber: true, updatedAt: true },
        take: 25,
      }),
      tx.syncOperation.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: { in: ["FAILED", "CONFLICT", "ERROR"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, entityType: true, entityId: true, status: true, createdAt: true },
        take: 25,
      }),
    ]);

    const rows: any[] = [];
    for (const row of lowStock) {
      const stock = Number(row.inventoryQuantity);
      const reorder = Number(row.reorderLevel);
      if (stock > reorder) continue;
      rows.push({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        recipientUserId: ctx.userId,
        scope: "TENANT",
        category: "INVENTORY",
        severity: stock <= 0 ? "CRITICAL" : "WARNING",
        channel: "IN_APP",
        title: stock <= 0 ? `Out of Stock: ${row.name}` : `Low Stock: ${row.name}`,
        description: `${row.sku} has ${stock} units remaining against reorder level ${reorder}.`,
        actionPath: "/inventory",
        actionLabel: "Open Inventory",
        status: "DELIVERED",
        sentAt: now,
        deliveredAt: now,
        dedupeKey: `inventory:${row.id}:${new Date(row.updatedAt).getTime()}`,
      });
    }

    for (const row of failedPayments) {
      rows.push({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        recipientUserId: ctx.userId,
        scope: "TENANT",
        category: "PAYMENT",
        severity: row.status === "FAILED" ? "CRITICAL" : "WARNING",
        channel: "IN_APP",
        title: row.status === "FAILED" ? `Payment Failed: ${row.paymentNumber}` : `Payment Pending: ${row.paymentNumber}`,
        description: `Payment ${row.paymentNumber} is currently ${String(row.status).toLowerCase()}.`,
        actionPath: "/payments",
        actionLabel: "Review Payment",
        status: "DELIVERED",
        sentAt: now,
        deliveredAt: now,
        dedupeKey: `payment:${row.id}:${String(row.status)}`,
      });
    }

    for (const row of pendingApprovals) {
      rows.push({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        recipientUserId: ctx.userId,
        scope: "TENANT",
        category: "APPROVAL",
        severity: "WARNING",
        channel: "IN_APP",
        title: `Purchase Approval Required: ${row.orderNumber}`,
        description: "This purchase order remains in DRAFT and requires the authorized approval workflow.",
        actionPath: "/purchases",
        actionLabel: "Review Purchase",
        status: "DELIVERED",
        sentAt: now,
        deliveredAt: now,
        dedupeKey: `approval:purchase-order:${row.id}:${new Date(row.updatedAt).getTime()}`,
      });
    }

    for (const row of failedSyncs) {
      rows.push({
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        recipientUserId: ctx.userId,
        scope: "TENANT",
        category: "SYNC",
        severity: row.status === "CONFLICT" ? "CRITICAL" : "WARNING",
        channel: "IN_APP",
        title: `Sync Alert: ${row.entityType}`,
        description: `Sync record ${row.entityId} is ${String(row.status).toLowerCase()} and needs attention.`,
        actionPath: "/diagnostics",
        actionLabel: "Open Sync Diagnostics",
        status: "DELIVERED",
        sentAt: now,
        deliveredAt: now,
        dedupeKey: `sync:${row.id}:${String(row.status)}`,
      });
    }

    for (const data of rows) {
      await tx.notification.upsert({
        where: {
          tenantId_recipientUserId_dedupeKey: {
            tenantId: data.tenantId,
            recipientUserId: data.recipientUserId,
            dedupeKey: data.dedupeKey,
          },
        },
        create: data,
        update: {},
      });
    }
  }
}

export const globalNotificationService = new NotificationService();
