import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { FinancialBridge } from "@kwakopos2/domain";
import { PrismaAtomicCommercialFinanceService, prisma } from "@kwakopos2/database";
import { randomUUID } from "node:crypto";

function assertScope(ctx: TenantContext, row: any) {
  if (!row || row.tenantId !== ctx.tenantId || row.branchId !== ctx.branchId) {
    throw new Error("PAYMENT_TENANT_BRANCH_BOUNDARY_VIOLATION");
  }
}

async function writeAudit(tx: any, ctx: TenantContext, req: SyncPushRequest, action: string, entityId: string, metadata: Record<string, unknown>) {
  await tx.auditEvent.create({
    data: {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      userId: ctx.userId,
      deviceId: req.deviceId,
      action,
      entityType: "Payment",
      entityId,
      metadata,
    },
  });
}

export async function applyPaymentsProductionLockOperation(
  ctx: TenantContext,
  req: SyncPushRequest,
  op: SyncPushRequest["operations"][number],
  tx: any,
): Promise<boolean> {
  if (op.entityType !== "Payment") return false;

  const payload: any = op.payload || {};
  const finance = new PrismaAtomicCommercialFinanceService({ $transaction: async (work: any) => work(tx) });

  if (op.operationType === "CREATE") {
    const amount = Number(payload.amount);
    if (!(amount > 0)) throw new Error("PAYMENT_AMOUNT_REQUIRED");
    if (payload.customerId && payload.supplierId) throw new Error("PAYMENT_ENTITY_AMBIGUOUS");
    const existing = await tx.payment.findUnique({ where: { id: op.entityId } });
    if (existing) {
      assertScope(ctx, existing);
      return true;
    }

    const method = String(payload.paymentMethod || "BANK").toUpperCase();
    if (["MOBILE_MONEY", "CARD", "BANK"].includes(method) && !String(payload.providerReference || "").trim()) {
      throw new Error("PAYMENT_PROVIDER_REFERENCE_REQUIRED");
    }

    const status = method === "CASH" || String(payload.status || "").toUpperCase() === "COMPLETED" || Boolean(String(payload.providerReference || "").trim())
      ? "COMPLETED"
      : "PENDING";

    const payment = await tx.payment.create({
      data: {
        id: op.entityId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        paymentNumber: payload.paymentNumber || `PAY-SYNC-${op.operationId.slice(0, 20)}`,
        saleId: payload.saleId || null,
        purchaseReceiptId: payload.purchaseReceiptId || null,
        customerId: payload.customerId || null,
        supplierId: payload.supplierId || null,
        amount,
        paymentMethod: method,
        provider: payload.provider || null,
        providerReference: payload.providerReference || null,
        status,
        providerEventId: payload.providerEventId || null,
        providerVerifiedAt: status === "COMPLETED" ? (payload.providerVerifiedAt ? new Date(payload.providerVerifiedAt) : null) : null,
        reconciliationStatus: status === "COMPLETED" ? "MATCHED" : "UNRECONCILED",
        reconciliationReference: payload.reconciliationReference || null,
        paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
      },
    });

    if (status === "COMPLETED") {
      if (!payment.customerId && !payment.supplierId) throw new Error("PAYMENT_CUSTOMER_OR_SUPPLIER_REQUIRED");
      const accounts = await finance.getFinancialAccountLookup(ctx, tx);
      const built = payment.customerId
        ? FinancialBridge.mapCustomerPaymentToJournal(ctx, payment as any, accounts as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1)
        : FinancialBridge.mapSupplierPaymentToJournal(ctx, payment as any, accounts as any, (await tx.journalEntry.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId } })) + 1);
      await finance.postFinancialJournal(ctx, built, tx);
    }
    await writeAudit(tx, ctx, req, "PAYMENT_SYNCED", payment.id, {
      operationId: op.operationId,
      amount,
      paymentMethod: method,
      provider: payment.provider,
      status,
    });
    return true;
  }

  if (op.operationType === "UPDATE") {
    const existing = await tx.payment.findUnique({ where: { id: op.entityId } });
    assertScope(ctx, existing);
    const action = String(payload.action || "").toUpperCase();

    if (action === "REVERSE") {
      await finance.reversePaymentInTransaction(ctx, op.entityId, String(payload.reason || "Synchronized payment reversal"), tx);
      await writeAudit(tx, ctx, req, "PAYMENT_REVERSED_SYNCED", op.entityId, { operationId: op.operationId, reason: payload.reason || null });
      return true;
    }

    if (action === "REFUND") {
      await finance.refundPaymentInTransaction(ctx, op.entityId, {
        amount: Number(payload.amount),
        reason: String(payload.reason || "Synchronized payment refund"),
        refundMethod: payload.refundMethod || existing.paymentMethod,
        provider: payload.provider || undefined,
        providerReference: payload.providerReference || undefined,
        idempotencyKey: op.idempotencyKey,
      }, tx);
      await writeAudit(tx, ctx, req, "PAYMENT_REFUNDED_SYNCED", op.entityId, {
        operationId: op.operationId,
        amount: Number(payload.amount),
        reason: payload.reason || null,
      });
      return true;
    }

    if (action === "PROVIDER_CONFIRM") {
      await finance.confirmProviderPaymentInTransaction(ctx, op.entityId, {
        amount: Number(payload.amount),
        provider: payload.provider,
        providerReference: payload.providerReference,
        providerEventId: payload.providerEventId,
        externalReference: payload.externalReference,
      }, tx);
      await writeAudit(tx, ctx, req, "PAYMENT_PROVIDER_CONFIRMED_SYNCED", op.entityId, {
        operationId: op.operationId,
        providerEventId: payload.providerEventId,
      });
      return true;
    }

    throw new Error("PAYMENT_PRODUCTION_LOCK_UNHANDLED_UPDATE");
  }

  if (op.operationType === "DELETE") {
    throw new Error("PAYMENT_DELETE_FORBIDDEN_USE_REVERSAL");
  }

  throw new Error("PAYMENT_PRODUCTION_LOCK_UNHANDLED_OPERATION");
}

export async function verifyPaymentProviderEventReference(tenantId: string, branchId: string, eventId: string): Promise<boolean> {
  if (!tenantId || !branchId || !eventId) return false;
  const existing = await prisma.payment.findFirst({ where: { tenantId, branchId, providerEventId: eventId } });
  return Boolean(existing);
}
