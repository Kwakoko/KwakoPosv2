import type {
  Sale,
  SaleLine,
  StockLedger,
  PurchaseReceipt,
  Payment,
  Return,
  TenantContext,
} from "@kwakopos2/contracts";
import { calculateAvailableStock } from "./index.js";

/**
 * INVARIANT C001: Every finalized sale has >= 1 valid sale lines.
 */
export function assertSaleLinesValid(sale: Partial<Sale>, lines: SaleLine[]): void {
  if (!lines || lines.length === 0) {
    throw new Error(
      `INVARIANT_C001_VIOLATION: Finalized sale ${sale.id || "NEW"} must have at least one sale line.`
    );
  }
}

/**
 * INVARIANT C002: Every sale line references an active, existing variant.
 */
export function assertSaleLineVariantsValid(
  lines: SaleLine[],
  validVariantIds: Set<string>
): void {
  for (const line of lines) {
    if (!line.variantId || !validVariantIds.has(line.variantId)) {
      throw new Error(
        `INVARIANT_C002_VIOLATION: Sale line ${line.id} references invalid or non-existent variantId ${line.variantId}.`
      );
    }
  }
}

/**
 * INVARIANT C003: Every stock-affecting sale produces matching StockLedger deduction entries (movementType: 'SALE').
 */
export function assertStockAffectingSaleHasLedger(
  saleId: string,
  saleLines: SaleLine[],
  ledgers: StockLedger[]
): void {
  const saleLedgers = ledgers.filter(
    (l) => l.referenceType === "SALE" && l.referenceId === saleId && l.movementType === "SALE"
  );
  const ledgerVariantMap = new Map<string, number>();
  for (const l of saleLedgers) {
    ledgerVariantMap.set(l.variantId, (ledgerVariantMap.get(l.variantId) || 0) + Math.abs(Number(l.quantity)));
  }

  for (const line of saleLines) {
    const recordedQty = ledgerVariantMap.get(line.variantId) || 0;
    if (recordedQty < Number(line.quantity)) {
      throw new Error(
        `INVARIANT_C003_VIOLATION: Sale ${saleId} variant ${line.variantId} sold ${line.quantity} units, but only ${recordedQty} units deducted in StockLedger.`
      );
    }
  }
}

/**
 * INVARIANT C004: Every purchase receipt produces matching StockLedger addition entries (movementType: 'PURCHASE').
 */
export function assertPurchaseReceiptHasInventory(
  receiptId: string,
  items: { variantId: string; quantityReceived: number }[],
  ledgers: StockLedger[]
): void {
  const receiptLedgers = ledgers.filter(
    (l) => l.referenceType === "PURCHASE_RECEIPT" && l.referenceId === receiptId && l.movementType === "PURCHASE"
  );
  const ledgerVariantMap = new Map<string, number>();
  for (const l of receiptLedgers) {
    ledgerVariantMap.set(l.variantId, (ledgerVariantMap.get(l.variantId) || 0) + Number(l.quantity));
  }

  for (const item of items) {
    const recordedQty = ledgerVariantMap.get(item.variantId) || 0;
    if (recordedQty < item.quantityReceived) {
      throw new Error(
        `INVARIANT_C004_VIOLATION: Purchase receipt ${receiptId} variant ${item.variantId} received ${item.quantityReceived}, but only ${recordedQty} added in StockLedger.`
      );
    }
  }
}

/**
 * INVARIANT C005: Every payment references a valid sale, purchase receipt, customer, or supplier.
 */
export function assertPaymentTransactionValid(payment: Partial<Payment>): void {
  if (!payment.amount || payment.amount <= 0) {
    throw new Error(`INVARIANT_C005_VIOLATION: Payment amount must be strictly positive.`);
  }
  if (!payment.saleId && !payment.purchaseReceiptId && !payment.customerId && !payment.supplierId) {
    throw new Error(
      `INVARIANT_C005_VIOLATION: Payment ${payment.id || "NEW"} must be linked to a sale, purchase receipt, customer, or supplier.`
    );
  }
}

/**
 * INVARIANT C006: Every return references valid original sale evidence where policy requires it.
 */
export function assertReturnReferencesOriginalSale(
  returnRecord: Partial<Return>,
  originalSaleExists: boolean
): void {
  if (returnRecord.originalSaleId && !originalSaleExists) {
    throw new Error(
      `INVARIANT_C006_VIOLATION: Return references non-existent original sale ${returnRecord.originalSaleId}.`
    );
  }
}

/**
 * INVARIANT C007: No financial or inventory transaction crosses tenant boundaries.
 */
export function assertFinancialTransactionTenantIsolation(
  requestContext: TenantContext,
  resource: { tenantId: string; branchId?: string }
): void {
  if (requestContext.tenantId !== resource.tenantId) {
    throw new Error(
      `INVARIANT_C007_VIOLATION: Financial cross-tenant breach! Context tenant ${requestContext.tenantId} attempted operation on resource tenant ${resource.tenantId}.`
    );
  }
}

/**
 * INVARIANT C008: No duplicate finalized operation exists for the same idempotency key.
 */
export function assertIdempotencyUniqueness(
  incomingKey: string,
  existingKeys: Set<string>
): void {
  if (existingKeys.has(incomingKey)) {
    throw new Error(
      `INVARIANT_C008_VIOLATION: Duplicate operation with idempotencyKey '${incomingKey}' already processed.`
    );
  }
}

/**
 * INVARIANT C009: Inventory remains mathematically reconcilable (Available = Sum of valid StockLedger movements).
 */
export function assertInventoryMathematicalReconciliation(
  variantId: string,
  reportedStock: number,
  ledgerEntries: StockLedger[]
): void {
  const calculated = calculateAvailableStock(ledgerEntries);
  if (reportedStock !== calculated) {
    throw new Error(
      `INVARIANT_C009_VIOLATION: Stock reconciliation divergence for variant ${variantId}. Stored: ${reportedStock}, Calculated from ledger: ${calculated}`
    );
  }
}

/**
 * INVARIANT C010: Multi-device state converges to identical authoritative ledger and balance state.
 */
export function assertMultiDeviceAuthoritativeConvergence(
  deviceAStock: number,
  deviceBStock: number,
  serverStock: number
): void {
  if (deviceAStock !== serverStock || deviceBStock !== serverStock) {
    throw new Error(
      `INVARIANT_C010_VIOLATION: Multi-device sync divergence! Device A: ${deviceAStock}, Device B: ${deviceBStock}, Server Authoritative: ${serverStock}.`
    );
  }
}