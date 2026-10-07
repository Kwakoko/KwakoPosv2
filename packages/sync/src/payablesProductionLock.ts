import type { TenantContext, SyncPushRequest } from "@kwakopos2/contracts";
import { randomUUID } from "node:crypto";
import { stripSyncControlFields } from "./syncIntegrity.js";

const payablesTypes = new Set(["SupplierInvoice", "Payment", "PaymentAllocation"]);

export function isPayablesProductionLockEntity(entityType: string): boolean {
  return payablesTypes.has(entityType);
}

function assertScope(ctx: TenantContext, row: any) {
  if (!row || row.tenantId !== ctx.tenantId || row.branchId !== ctx.branchId) {
    throw new Error("TENANT_BRANCH_BOUNDARY_VIOLATION");
  }
}

async function writeAudit(
  tx: any,
  ctx: TenantContext,
  req: SyncPushRequest,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
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
      metadata: {
        ...metadata,
        operationId: req.operations.find((op) => op.entityId === entityId)?.operationId ?? null,
      },
    },
  });
}

export async function applyPayablesProductionLockOperation(
  ctx: TenantContext,
  req: SyncPushRequest,
  op: SyncPushRequest["operations"][number],
  tx: any,
): Promise<boolean> {
  if (!isPayablesProductionLockEntity(op.entityType)) return false;
  const payload: any = stripSyncControlFields(op.payload as any);

  if (op.entityType === "SupplierInvoice") {
    if (op.operationType === "CREATE") {
      const existing = await tx.supplierInvoice.findUnique({ where: { id: op.entityId } });
      if (existing) {
        assertScope(ctx, existing);
        return true;
      }
      const supplier = await tx.supplier.findUnique({ where: { id: payload.supplierId } });
      assertScope(ctx, supplier);
      if (supplier.status !== "ACTIVE") throw new Error("FINANCE_SUPPLIER_NOT_ACTIVE");

      const invoiceNumber = String(payload.invoiceNumber || `BIL-${op.operationId.slice(0, 16).toUpperCase()}`).trim();
      const duplicate = await tx.supplierInvoice.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, invoiceNumber },
      });
      if (duplicate) throw new Error("SUPPLIER_INVOICE_DUPLICATE_NUMBER");
      if (payload.purchaseReceiptId) {
        const linked = await tx.supplierInvoice.findFirst({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, purchaseReceiptId: payload.purchaseReceiptId } });
        if (linked) throw new Error("SUPPLIER_INVOICE_RECEIPT_ALREADY_INVOICED");
      }

      const items = Array.isArray(payload.lines ?? payload.items) ? (payload.lines ?? payload.items) : [];
      if (!items.length) throw new Error("AP_INVOICE_LINES_REQUIRED");

      const lines = items.map((i: any) => {
        const quantity = Number(i.quantity ?? 0);
        const unitCost = Number(i.unitCost ?? 0);
        const taxRate = Number(i.taxRate ?? 0);
        const taxAmount = i.taxAmount == null ? quantity * unitCost * taxRate / 100 : Number(i.taxAmount);
        if (!(quantity > 0) || !(unitCost >= 0) || !(taxRate >= 0) || !(taxAmount >= 0)) {
          throw new Error("AP_INVOICE_LINE_INVALID");
        }
        return {
          id: String(i.id || randomUUID()),
          variantId: i.variantId ?? null,
          description: String(i.description || "AP supplier invoice line"),
          quantity,
          unitCost,
          taxRate,
          taxAmount,
          lineTotal: quantity * unitCost + taxAmount,
        };
      });
      const subtotal = lines.reduce((sum: number, line: any) => sum + line.quantity * line.unitCost, 0);
      const taxTotal = lines.reduce((sum: number, line: any) => sum + line.taxAmount, 0);
      const grandTotal = subtotal + taxTotal;
      const dueDate = new Date(payload.dueDate);
      if (!Number.isFinite(dueDate.getTime()) || !(grandTotal >= 0)) throw new Error("AP_INVOICE_TOTAL_OR_DUE_DATE_INVALID");

      await tx.supplierInvoice.create({
        data: {
          id: op.entityId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          supplierId: supplier.id,
          purchaseReceiptId: payload.purchaseReceiptId ?? null,
          invoiceNumber,
          invoiceDate: new Date(payload.invoiceDate || new Date().toISOString()),
          dueDate,
          subtotal,
          taxTotal,
          grandTotal,
          amountPaid: 0,
          balanceDue: grandTotal,
          status: "APPROVED",
          notes: payload.notes ?? null,
          lines: { create: lines },
        },
      });
      if (payload.purchaseReceiptId) {
        const receipt = await tx.purchaseReceipt.findFirst({ where: { id: payload.purchaseReceiptId, tenantId: ctx.tenantId, branchId: ctx.branchId, supplierId: supplier.id }, include: { items: true } });
        if (!receipt) throw new Error("SUPPLIER_INVOICE_RECEIPT_NOT_FOUND");
        const accrued = receipt.items.reduce((sum: number, item: any) => sum + Number(item.totalCost), 0);
        const delta = grandTotal - accrued;
        if (delta > 0) await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { increment: delta } } });
        if (delta < 0) await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { decrement: Math.abs(delta) } } });
      } else {
        await tx.supplier.update({ where: { id: supplier.id }, data: { outstandingBalance: { increment: grandTotal } } });
      }
      await writeAudit(tx, ctx, req, "AP_INVOICE_SYNCED", "SupplierInvoice", op.entityId, {
        supplierId: supplier.id,
        invoiceNumber,
        grandTotal,
      });
      return true;
    }

    if (op.operationType === "UPDATE") {
      const invoice = await tx.supplierInvoice.findUnique({ where: { id: op.entityId } });
      if (!invoice) throw new Error("AP_INVOICE_NOT_FOUND");
      assertScope(ctx, invoice);
      const forbidden = [
        "supplierId",
        "invoiceNumber",
        "invoiceDate",
        "purchaseReceiptId",
        "subtotal",
        "taxTotal",
        "grandTotal",
        "amountPaid",
        "balanceDue",
        "status",
        "lines",
        "allocations",
      ];
      if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
        throw new Error("AP_FINANCIAL_FIELDS_REQUIRE_GOVERNED_MUTATION");
      }
      const updated = await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: {
          dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
          notes: payload.notes !== undefined ? (payload.notes == null ? null : String(payload.notes)) : undefined,
        },
      });
      await writeAudit(tx, ctx, req, "AP_INVOICE_UPDATED", "SupplierInvoice", updated.id, {
        dueDate: updated.dueDate.toISOString(),
      });
      return true;
    }

    throw new Error("AP_INVOICE_IMMUTABLE");
  }

  if (op.entityType === "Payment") {
    if (op.operationType === "CREATE") {
      if (!payload.supplierId) return false;
      if (payload.customerId) throw new Error("PAYMENT_ENTITY_AMBIGUOUS");
      const existing = await tx.payment.findUnique({ where: { id: op.entityId } });
      if (existing) {
        assertScope(ctx, existing);
        return Boolean(existing.supplierId);
      }
      const supplier = await tx.supplier.findUnique({ where: { id: payload.supplierId } });
      assertScope(ctx, supplier);
      if (supplier.status !== "ACTIVE") throw new Error("FINANCE_SUPPLIER_NOT_ACTIVE");
      const amount = Number(payload.amount);
      if (!(amount > 0)) throw new Error("PAYMENT_AMOUNT_REQUIRED");
      if (amount > Number(supplier.outstandingBalance)) throw new Error("PAYMENT_EXCEEDS_OUTSTANDING_PAYABLE");
      const paymentNumber = String(payload.paymentNumber || `PAY-SUP-${op.operationId.slice(0, 24)}`);
      const duplicatePayment = await tx.payment.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, paymentNumber },
      });
      if (duplicatePayment) {
        assertScope(ctx, duplicatePayment);
        return true;
      }
      await tx.payment.create({
        data: {
          id: op.entityId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          paymentNumber,
          purchaseReceiptId: payload.purchaseReceiptId || null,
          supplierId: supplier.id,
          amount,
          paymentMethod: payload.paymentMethod || "BANK",
          provider: payload.provider || null,
          providerReference: payload.providerReference || null,
          status: "COMPLETED",
          paidAt: payload.paidAt ? new Date(payload.paidAt) : new Date(),
        },
      });
      await writeAudit(tx, ctx, req, "AP_PAYMENT_SYNCED", "Payment", op.entityId, {
        supplierId: supplier.id,
        amount,
        paymentNumber,
      });
      return true;
    }

    const existing = await tx.payment.findUnique({ where: { id: op.entityId } });
    if (existing?.supplierId) {
      assertScope(ctx, existing);
      throw new Error("AP_PAYMENT_IMMUTABLE");
    }
    return false;
  }

  if (op.entityType === "PaymentAllocation") {
    if (op.operationType === "CREATE") {
      const existingAllocation = await tx.paymentAllocation.findUnique({ where: { id: op.entityId } });
      if (existingAllocation) {
        assertScope(ctx, existingAllocation);
        return Boolean(existingAllocation.supplierInvoiceId);
      }
      if (!payload.supplierInvoiceId) return false;

      const payment = await tx.payment.findUnique({ where: { id: payload.paymentId } });
      assertScope(ctx, payment);
      if (payment.status !== "COMPLETED" || !payment.supplierId) throw new Error("FINANCE_PAYMENT_NOT_COMPLETED");
      const invoice = await tx.supplierInvoice.findUnique({ where: { id: payload.supplierInvoiceId } });
      assertScope(ctx, invoice);
      if (invoice.supplierId !== payment.supplierId) throw new Error("FINANCE_PAYMENT_SUPPLIER_MISMATCH");
      if (["CANCELLED", "REJECTED", "PAID"].includes(invoice.status)) throw new Error("FINANCE_INVOICE_NOT_ALLOCATABLE");

      const allocations = await tx.paymentAllocation.findMany({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, paymentId: payment.id },
      });
      const alreadyAllocated = allocations.reduce((sum: number, a: any) => sum + Number(a.allocatedAmount), 0);
      const paymentRemaining = Math.max(0, Number(payment.amount) - alreadyAllocated);
      const requested = Number(payload.allocatedAmount ?? payload.amount ?? 0);
      const amount = Math.min(requested, Number(invoice.balanceDue), paymentRemaining);
      if (!(amount > 0)) throw new Error("FINANCE_PAYMENT_NO_REMAINING_ALLOCATABLE_AMOUNT");

      const amountPaid = Number(invoice.amountPaid) + amount;
      const balanceDue = Math.max(0, Number(invoice.balanceDue) - amount);
      const status = balanceDue <= 0 ? "PAID" : "PARTIALLY_PAID";
      await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: { amountPaid, balanceDue, status },
      });
      const supplier = await tx.supplier.findUnique({ where: { id: invoice.supplierId } });
      assertScope(ctx, supplier);
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { outstandingBalance: { decrement: amount } },
      });
      await tx.paymentAllocation.create({
        data: {
          id: op.entityId,
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          paymentId: payment.id,
          supplierInvoiceId: invoice.id,
          customerInvoiceId: null,
          allocatedAmount: amount,
          createdById: ctx.userId,
        },
      });
      await writeAudit(tx, ctx, req, "AP_PAYMENT_ALLOCATION_SYNCED", "SupplierInvoice", invoice.id, {
        paymentId: payment.id,
        allocationId: op.entityId,
        amount,
        status,
      });
      return true;
    }

    const existingAllocation = await tx.paymentAllocation.findUnique({ where: { id: op.entityId } });
    if (existingAllocation?.supplierInvoiceId) {
      assertScope(ctx, existingAllocation);
      throw new Error("AP_PAYMENT_ALLOCATION_IMMUTABLE");
    }
    return false;
  }

  return false;
}
