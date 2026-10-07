import { randomUUID } from "node:crypto";
import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { stripSyncControlFields } from "./syncIntegrity.js";

const receivablesTypes = new Set(["CustomerInvoice", "PaymentAllocation"]);

export function isReceivablesProductionLockEntity(entityType: string): boolean {
  return receivablesTypes.has(entityType);
}

function assertScope(ctx: TenantContext, row: any) {
  if (!row || row.tenantId !== ctx.tenantId || row.branchId !== ctx.branchId) {
    throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
  }
}

async function writeAudit(tx: any, ctx: TenantContext, req: SyncPushRequest, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
  await tx.auditEvent.create({
    data: {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      userId: ctx.userId,
      deviceId: req.deviceId,
      action,
      entityType,
      entityId,
      metadata: { ...metadata, operationId: req.operations.find((op) => op.entityId === entityId)?.operationId ?? null },
    },
  });
}

export async function applyReceivablesProductionLockOperation(
  ctx: TenantContext,
  req: SyncPushRequest,
  op: SyncPushRequest["operations"][number],
  tx: any,
): Promise<boolean> {
  if (!isReceivablesProductionLockEntity(op.entityType)) return false;
  const payload: any = stripSyncControlFields(op.payload as any);

  if (op.entityType === "CustomerInvoice" && op.operationType === "CREATE") {
    const existing = await tx.customerInvoice.findUnique({ where: { id: op.entityId } });
    if (existing) {
      assertScope(ctx, existing);
      return true;
    }
    const customer = await tx.customer.findUnique({ where: { id: payload.customerId } });
    assertScope(ctx, customer);
    if (customer.status !== "ACTIVE") throw new Error("FINANCE_CUSTOMER_NOT_ACTIVE");

    const items = Array.isArray(payload.lines ?? payload.items) ? (payload.lines ?? payload.items) : [];
    if (!items.length) throw new Error("AR_INVOICE_LINES_REQUIRED");
    const lines = items.map((i: any) => {
      const quantity = Number(i.quantity ?? 0);
      const unitPrice = Number(i.unitPrice ?? 0);
      const taxRate = Number(i.taxRate ?? 0);
      const discountAmount = Number(i.discountAmount ?? 0);
      const taxAmount = i.taxAmount == null ? quantity * unitPrice * taxRate / 100 : Number(i.taxAmount);
      return {
        id: String(i.id || randomUUID()),
        variantId: i.variantId ?? null,
        description: String(i.description || "AR invoice line"),
        quantity,
        unitPrice,
        taxRate,
        taxAmount,
        discountAmount,
        lineTotal: quantity * unitPrice + taxAmount - discountAmount,
      };
    });
    const subtotal = lines.reduce((s: number, i: any) => s + i.quantity * i.unitPrice, 0);
    const taxTotal = lines.reduce((s: number, i: any) => s + i.taxAmount, 0);
    const discountTotal = lines.reduce((s: number, i: any) => s + i.discountAmount, 0);
    const grandTotal = subtotal + taxTotal - discountTotal;
    if (grandTotal < 0) throw new Error("AR_INVOICE_TOTAL_INVALID");

    await tx.customerInvoice.create({
      data: {
        id: op.entityId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        customerId: customer.id,
        saleId: payload.saleId ?? null,
        invoiceNumber: String(payload.invoiceNumber || `INV-${op.operationId.slice(0, 16).toUpperCase()}`),
        invoiceDate: new Date(payload.invoiceDate || new Date().toISOString()),
        dueDate: new Date(payload.dueDate),
        subtotal,
        taxTotal,
        discountTotal,
        grandTotal,
        amountPaid: 0,
        balanceDue: grandTotal,
        status: "ISSUED",
        notes: payload.notes ?? null,
        lines: { create: lines },
      },
    });
    await writeAudit(tx, ctx, req, "AR_INVOICE_SYNCED", "CustomerInvoice", op.entityId, { grandTotal, customerId: customer.id });
    return true;
  }

  if (op.entityType === "CustomerInvoice" && op.operationType === "UPDATE") {
    const invoice = await tx.customerInvoice.findUnique({ where: { id: op.entityId } });
    if (!invoice) throw new Error("AR_INVOICE_NOT_FOUND");
    assertScope(ctx, invoice);
    if (payload.amountPaid !== undefined || payload.balanceDue !== undefined || payload.grandTotal !== undefined || payload.allocations !== undefined) {
      throw new Error("AR_FINANCIAL_FIELDS_REQUIRE_GOVERNED_MUTATION");
    }
    const updated = await tx.customerInvoice.update({
      where: { id: op.entityId },
      data: {
        dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
        notes: payload.notes !== undefined ? (payload.notes == null ? null : String(payload.notes)) : undefined,
      },
    });
    await writeAudit(tx, ctx, req, "AR_INVOICE_UPDATED", "CustomerInvoice", updated.id, { dueDate: updated.dueDate.toISOString() });
    return true;
  }

  if (op.entityType === "PaymentAllocation" && op.operationType === "CREATE") {
    const existingAllocation = await tx.paymentAllocation.findUnique({ where: { id: op.entityId } });
    if (existingAllocation) {
      assertScope(ctx, existingAllocation);
      return true;
    }
    const payment = await tx.payment.findUnique({ where: { id: payload.paymentId } });
    assertScope(ctx, payment);
    if (payment.status !== "COMPLETED") throw new Error("FINANCE_PAYMENT_NOT_COMPLETED");

    const isCustomer = Boolean(payload.customerInvoiceId);
    const isSupplier = Boolean(payload.supplierInvoiceId);
    if (isCustomer === isSupplier) throw new Error("FINANCE_PAYMENT_TARGET_REQUIRED");
    const invoice = isCustomer
      ? await tx.customerInvoice.findUnique({ where: { id: payload.customerInvoiceId } })
      : await tx.supplierInvoice.findUnique({ where: { id: payload.supplierInvoiceId } });
    assertScope(ctx, invoice);
    if (["CANCELLED", "REJECTED", "PAID"].includes(invoice.status)) throw new Error("FINANCE_INVOICE_NOT_ALLOCATABLE");

    if (isCustomer && payment.customerId && payment.customerId !== invoice.customerId) throw new Error("FINANCE_PAYMENT_CUSTOMER_MISMATCH");
    if (isSupplier && payment.supplierId && payment.supplierId !== invoice.supplierId) throw new Error("FINANCE_PAYMENT_SUPPLIER_MISMATCH");

    const allocations = await tx.paymentAllocation.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, paymentId: payment.id },
    });
    const alreadyAllocated = allocations.reduce((s: number, a: any) => s + Number(a.allocatedAmount), 0);
    const paymentRemaining = Math.max(0, Number(payment.amount) - alreadyAllocated);
    const requested = Number(payload.allocatedAmount ?? payload.amount ?? 0);
    const amount = Math.min(requested, Number(invoice.balanceDue), paymentRemaining);
    if (!(amount > 0)) throw new Error("FINANCE_PAYMENT_NO_REMAINING_ALLOCATABLE_AMOUNT");

    const amountPaid = Number(invoice.amountPaid) + amount;
    const balanceDue = Math.max(0, Number(invoice.balanceDue) - amount);
    const status = balanceDue <= 0 ? "PAID" : "PARTIALLY_PAID";
    if (isCustomer) {
      await tx.customerInvoice.update({ where: { id: invoice.id }, data: { amountPaid, balanceDue, status } });
      const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
      assertScope(ctx, customer);
      await tx.customer.update({ where: { id: customer.id }, data: { currentBalance: { decrement: amount } } });
    } else {
      await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { amountPaid, balanceDue, status } });
      const supplier = await tx.supplier.findUnique({ where: { id: invoice.supplierId } });
      assertScope(ctx, supplier);
      await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: amount } } });
    }

    await tx.paymentAllocation.create({
      data: {
        id: op.entityId,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        paymentId: payment.id,
        customerInvoiceId: isCustomer ? invoice.id : null,
        supplierInvoiceId: isSupplier ? invoice.id : null,
        allocatedAmount: amount,
        createdById: ctx.userId,
      },
    });
    await writeAudit(tx, ctx, req, "AR_PAYMENT_ALLOCATION_SYNCED", isCustomer ? "CustomerInvoice" : "SupplierInvoice", invoice.id, {
      paymentId: payment.id,
      allocationId: op.entityId,
      amount,
      status,
    });
    return true;
  }

  if (op.entityType === "PaymentAllocation" && op.operationType !== "CREATE") {
    throw new Error("AR_PAYMENT_ALLOCATION_IMMUTABLE");
  }

  throw new Error("AR_PRODUCTION_LOCK_UNHANDLED_OPERATION");
}
