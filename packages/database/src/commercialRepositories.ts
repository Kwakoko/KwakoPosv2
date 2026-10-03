import type {
  TenantContext,
  Customer,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseReceipt,
  PurchaseReceiptItem,
  Sale,
  SaleLine,
  Return,
  ReturnLine,
  Payment,
  CashSession,
  Expense,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  CreatePurchaseOrderRequest,
  CreatePurchaseReceiptRequest,
  CreatePosSaleRequest,
  CreateSaleReturnRequest,
  CreatePaymentRequest,
  OpenCashSessionRequest,
  CloseCashSessionRequest,
  CreateExpenseRequest,
  CommercialDashboardSummary,
  StockLedger,
} from "@kwakopos2/contracts";
import {
  assertTenantIsolation,
  assertFinancialTransactionTenantIsolation,
  assertSaleLinesValid,
  assertSaleLineVariantsValid,
  assertStockAffectingSaleHasLedger,
  assertPurchaseReceiptHasInventory,
  assertPaymentTransactionValid,
  assertReturnReferencesOriginalSale,
  PricingTaxEngine,
  PaymentEngine,
  CashSessionEngine,
  TransactionNumbering,
  calculateAvailableStock,
} from "@kwakopos2/domain";
import { InMemoryStore } from "./inMemoryStore.js";
import { randomUUID } from "crypto";

let _StockRepositoryClass: any = null;
export function registerStockRepositoryClass(cls: any) {
  _StockRepositoryClass = cls;
}

export class ScopedCommercialRepository {
  private store: InMemoryStore;
  private stockRepo?: any;

  // Commercial store collections
  customers: Map<string, Customer> = new Map();
  suppliers: Map<string, Supplier> = new Map();
  purchaseOrders: Map<string, PurchaseOrder> = new Map();
  purchaseReceipts: Map<string, PurchaseReceipt> = new Map();
  sales: Map<string, Sale> = new Map();
  saleLines: Map<string, SaleLine[]> = new Map();
  returns: Map<string, Return> = new Map();
  payments: Map<string, Payment> = new Map();
  cashSessions: Map<string, CashSession> = new Map();
  expenses: Map<string, Expense> = new Map();

  constructor(store: InMemoryStore, stockRepo?: any) {
    this.store = store;
    this.stockRepo = stockRepo;
  }

  private getStockRepo(): any {
    if (this.stockRepo) return this.stockRepo;
    if (_StockRepositoryClass) return new _StockRepositoryClass(this.store);
    throw new Error("Stock repository class not registered");
  }

  // ==========================================
  // Customer Operations
  // ==========================================

  createCustomer(ctx: TenantContext, req: CreateCustomerRequest): Customer {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const code = req.customerCode || `CUST-${String(this.customers.size + 1).padStart(4, "0")}`;
    const customer: Customer = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      customerCode: code,
      name: req.name,
      phone: req.phone || null,
      email: req.email || null,
      address: req.address || null,
      creditLimit: req.creditLimit || 0,
      currentBalance: req.openingBalance || 0,
      openingBalance: req.openingBalance || 0,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.customers.set(id, customer);
    return customer;
  }

  getCustomers(ctx: TenantContext): Customer[] {
    return Array.from(this.customers.values()).filter(
      (c) => c.tenantId === ctx.tenantId && c.branchId === ctx.branchId
    );
  }

  getCustomerById(ctx: TenantContext, id: string): Customer | null {
    const cust = this.customers.get(id);
    if (!cust) return null;
    assertTenantIsolation(ctx, cust.tenantId, cust.branchId);
    return cust;
  }

  updateCustomer(ctx: TenantContext, id: string, req: UpdateCustomerRequest): Customer {
    const existing = this.getCustomerById(ctx, id);
    if (!existing) throw new Error(`Customer ${id} not found`);
    const updated: Customer = {
      ...existing,
      name: req.name ?? existing.name,
      phone: req.phone !== undefined ? req.phone : existing.phone,
      email: req.email !== undefined ? req.email : existing.email,
      address: req.address !== undefined ? req.address : existing.address,
      creditLimit: req.creditLimit ?? existing.creditLimit,
      status: req.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.customers.set(id, updated);
    return updated;
  }

  // ==========================================
  // Supplier Operations
  // ==========================================

  createSupplier(ctx: TenantContext, req: CreateSupplierRequest): Supplier {
    const id = req.id || randomUUID();
    const now = new Date().toISOString();
    const code = req.supplierCode || `SUP-${String(this.suppliers.size + 1).padStart(4, "0")}`;
    const supplier: Supplier = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      supplierCode: code,
      name: req.name,
      phone: req.phone || null,
      email: req.email || null,
      address: req.address || null,
      taxPin: req.taxPin || null,
      outstandingBalance: 0,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.suppliers.set(id, supplier);
    return supplier;
  }

  getSuppliers(ctx: TenantContext): Supplier[] {
    return Array.from(this.suppliers.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.branchId === ctx.branchId
    );
  }

  getSupplierById(ctx: TenantContext, id: string): Supplier | null {
    const sup = this.suppliers.get(id);
    if (!sup) return null;
    assertTenantIsolation(ctx, sup.tenantId, sup.branchId);
    return sup;
  }

  updateSupplier(ctx: TenantContext, id: string, req: UpdateSupplierRequest): Supplier {
    const existing = this.getSupplierById(ctx, id);
    if (!existing) throw new Error(`Supplier ${id} not found`);
    const updated: Supplier = {
      ...existing,
      name: req.name ?? existing.name,
      phone: req.phone !== undefined ? req.phone : existing.phone,
      email: req.email !== undefined ? req.email : existing.email,
      address: req.address !== undefined ? req.address : existing.address,
      taxPin: req.taxPin !== undefined ? req.taxPin : existing.taxPin,
      status: req.status ?? existing.status,
      updatedAt: new Date().toISOString(),
    };
    this.suppliers.set(id, updated);
    return updated;
  }

  // ==========================================
  // Purchasing & Goods Receipt Operations
  // ==========================================

  createPurchaseOrder(ctx: TenantContext, req: CreatePurchaseOrderRequest): PurchaseOrder {
    const supplier = this.getSupplierById(ctx, req.supplierId);
    if (!supplier) throw new Error(`Supplier ${req.supplierId} not found`);

    const id = randomUUID();
    const now = new Date().toISOString();
    const orderNumber = TransactionNumbering.formatNumber("PUR", "MAIN", this.purchaseOrders.size + 1);

    let totalAmount = 0;
    const items: PurchaseOrderItem[] = req.items.map((item) => {
      const lineCost = item.quantityOrdered * item.unitCost;
      totalAmount += lineCost;
      return {
        id: randomUUID(),
        purchaseOrderId: id,
        variantId: item.variantId,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0,
        unitCost: item.unitCost,
        totalCost: lineCost,
      };
    });

    const po: PurchaseOrder = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      orderNumber,
      supplierId: req.supplierId,
      status: "APPROVED",
      totalAmount,
      notes: req.notes || null,
      createdById: ctx.userId,
      approvedById: ctx.userId,
      orderedAt: now,
      items,
      createdAt: now,
      updatedAt: now,
    };
    this.purchaseOrders.set(id, po);
    return po;
  }

  createPurchaseReceipt(ctx: TenantContext, req: CreatePurchaseReceiptRequest): { receipt: PurchaseReceipt; ledgers: StockLedger[] } {
    // Idempotency check
    const existingReceipt = Array.from(this.purchaseReceipts.values()).find(
      (r) => r.tenantId === ctx.tenantId && (r.receiptNumber === req.idempotencyKey || r.id === req.idempotencyKey)
    );
    if (existingReceipt) {
      const ledgers = Array.from(this.store.stockLedgers.values()).filter(
        (l) => l.referenceType === "PURCHASE_RECEIPT" && l.referenceId === existingReceipt.id
      );
      return { receipt: existingReceipt, ledgers };
    }

    const supplier = this.getSupplierById(ctx, req.supplierId);
    if (!supplier) throw new Error(`Supplier ${req.supplierId} not found`);

    const receiptId = randomUUID();
    const now = new Date().toISOString();
    const receiptNumber = TransactionNumbering.formatNumber("REC", "MAIN", this.purchaseReceipts.size + 1);

    let totalReceiptCost = 0;
    const items: PurchaseReceiptItem[] = req.items.map((item) => {
      const totalCost = item.quantityReceived * item.unitCost;
      totalReceiptCost += totalCost;
      return {
        id: randomUUID(),
        purchaseReceiptId: receiptId,
        variantId: item.variantId,
        quantityReceived: item.quantityReceived,
        unitCost: item.unitCost,
        totalCost,
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
      };
    });

    const receipt: PurchaseReceipt = {
      id: receiptId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      receiptNumber,
      purchaseOrderId: req.purchaseOrderId || null,
      supplierId: req.supplierId,
      receivedAt: now,
      createdById: ctx.userId,
      notes: req.notes || null,
      items,
      createdAt: now,
      updatedAt: now,
    };

    // Update Supplier Payable Balance
    supplier.outstandingBalance = (supplier.outstandingBalance || 0) + totalReceiptCost;

    // Update parent Purchase Order progress if linked
    if (req.purchaseOrderId) {
      const po = this.purchaseOrders.get(req.purchaseOrderId);
      if (po && po.items) {
        assertTenantIsolation(ctx, po.tenantId, po.branchId);
        for (const item of req.items) {
          const poItem = po.items.find((poi) => poi.variantId === item.variantId);
          if (poItem) {
            poItem.quantityReceived = (poItem.quantityReceived || 0) + item.quantityReceived;
          }
        }
        const allReceived = po.items.every((poi) => poi.quantityReceived >= poi.quantityOrdered);
        const anyReceived = po.items.some((poi) => (poi.quantityReceived || 0) > 0);
        po.status = allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status;
        po.updatedAt = now;
      }
    }

    // Generate StockLedger additions (movementType: "PURCHASE")
    const stockRepo = this.getStockRepo();
    const ledgers: StockLedger[] = req.items.map((item) => {
      const variant = this.store.variants.get(item.variantId);
      return stockRepo.recordMovement(ctx, {
        productId: variant ? variant.productId : randomUUID(),
        variantId: item.variantId,
        movementType: "PURCHASE",
        quantityChange: item.quantityReceived,
        referenceType: "PURCHASE_RECEIPT",
        referenceId: receiptId,
        unitCost: item.unitCost,
        totalCost: item.unitCost * item.quantityReceived,
        deviceId: req.deviceId,
        operationId: req.operationId,
        idempotencyKey: `${req.idempotencyKey}-${item.variantId}`,
      });
    });

    assertPurchaseReceiptHasInventory(receiptId, req.items, ledgers);
    this.purchaseReceipts.set(receiptId, receipt);

    return { receipt, ledgers };
  }

  // ==========================================
  // POS & Sales Operations
  // ==========================================

  createPosSale(ctx: TenantContext, req: CreatePosSaleRequest): { sale: Sale; lines: SaleLine[]; ledgers: StockLedger[] } {
    // Idempotency check
    const existingSale = Array.from(this.sales.values()).find(
      (s) => s.tenantId === ctx.tenantId && s.idempotencyKey === req.idempotencyKey
    );
    if (existingSale) {
      const lines = this.saleLines.get(existingSale.id) || [];
      const ledgers = Array.from(this.store.stockLedgers.values()).filter(
        (l) => l.referenceType === "SALE" && l.referenceId === existingSale.id
      );
      return { sale: existingSale, lines, ledgers };
    }

    // Production POS invariant: missing or foreign variants are hard failures; never fabricate inventory master data.
    for (const item of req.items) {
      const variant = this.store.variants.get(item.variantId);
      if (!variant) throw new Error(`POS_VARIANT_NOT_FOUND:${item.variantId}`);
      if (variant.tenantId !== ctx.tenantId || variant.branchId !== ctx.branchId || variant.productId !== item.productId || variant.isActive === false) {
        throw new Error(`POS_VARIANT_BOUNDARY_VIOLATION:${item.variantId}`);
      }
    }

    // Validate Variants exist
    const validVariantIds = new Set(Array.from(this.store.variants.keys()));
    const saleId = req.id || randomUUID();
    const now = new Date().toISOString();
    const saleNumber = TransactionNumbering.formatNumber("SAL", "MAIN", this.sales.size + 1);

    const lines: SaleLine[] = req.items.map((item) => {
      const product = this.store.products.get(item.productId);
      const variant = this.store.variants.get(item.variantId);
      const defaultCost = variant?.effectiveBuyingPrice ?? variant?.costPrice ?? product?.buyingPrice ?? 0;
      const unitCost = item.unitCost !== undefined && item.unitCost !== null && item.unitCost > 0 ? item.unitCost : defaultCost;

      const lineCalc = PricingTaxEngine.calculateLineItem({
        unitPrice: item.unitPrice,
        unitCost,
        quantity: item.quantity,
        discount: item.discountAmount ? { type: "FIXED", value: item.discountAmount } : undefined,
      });

      return {
        id: randomUUID(),
        saleId,
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: lineCalc.unitPrice,
        unitCost: lineCalc.unitCost,
        discountAmount: lineCalc.discountAmount,
        taxAmount: lineCalc.taxAmount,
        lineTotal: lineCalc.lineTotal,
      };
    });

    assertSaleLinesValid({ id: saleId }, lines);
    assertSaleLineVariantsValid(lines, validVariantIds);

    const totals = PricingTaxEngine.calculateSaleTotals(
      lines.map((l) => ({ lineTotal: l.lineTotal, totalCost: l.unitCost * l.quantity, discountAmount: l.discountAmount, taxAmount: l.taxAmount })),
      req.discountTotal || 0
    );

    // Process Payments
    const completedPayments: Payment[] = [];
    if (req.payments && req.payments.length > 0) {
      for (const p of req.payments) {
        const paymentRes = PaymentEngine.processPayment({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          provider: p.provider,
          providerReference: p.providerReference,
          customerId: req.customerId,
          customerCreditLimit: req.customerId ? this.customers.get(req.customerId)?.creditLimit : 0,
          customerCurrentBalance: req.customerId ? this.customers.get(req.customerId)?.currentBalance : 0,
        });

        if (paymentRes.success) {
          const payment: Payment = {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            paymentNumber: TransactionNumbering.formatNumber("PAY", "MAIN", this.payments.size + 1),
            saleId,
            purchaseReceiptId: null,
            customerId: req.customerId || null,
            supplierId: null,
            amount: p.amount,
            paymentMethod: p.paymentMethod,
            provider: p.provider || null,
            providerReference: paymentRes.reference,
            status: "COMPLETED",
            paidAt: now,
            createdAt: now,
            updatedAt: now,
          };
          this.payments.set(payment.id, payment);
          completedPayments.push(payment);

          // If credit payment, update customer balance
          if (p.paymentMethod === "CREDIT" && req.customerId) {
            const cust = this.customers.get(req.customerId);
            if (cust) {
              cust.currentBalance = (cust.currentBalance || 0) + p.amount;
            }
          }
        }
      }
    }

    const { paymentStatus } = PaymentEngine.evaluateSalePaymentStatus(
      totals.grandTotal,
      completedPayments.map((p) => ({ amount: p.amount, status: p.status }))
    );

    const sale: Sale = {
      id: saleId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      saleNumber,
      customerId: req.customerId || null,
      cashSessionId: req.cashSessionId || null,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
      totalCost: totals.totalCost,
      grossProfit: totals.grossProfit,
      status: "COMPLETED",
      paymentStatus,
      deviceId: req.deviceId,
      operationId: req.operationId,
      idempotencyKey: req.idempotencyKey,
      soldById: ctx.userId,
      soldAt: now,
      lines,
      createdAt: now,
      updatedAt: now,
    };

    // Update active Cash Session if cash was paid
    if (req.cashSessionId) {
      const session = this.cashSessions.get(req.cashSessionId);
      if (session) {
        const cashAmount = completedPayments
          .filter((p) => p.paymentMethod === "CASH")
          .reduce((acc, p) => acc + p.amount, 0);
        session.cashSalesTotal = (session.cashSalesTotal || 0) + cashAmount;
      }
    }

    // Generate StockLedger deductions (movementType: "SALE")
    const stockRepo = this.getStockRepo();
    const ledgers: StockLedger[] = lines.map((line) => {
      return stockRepo.recordMovement(ctx, {
        productId: line.productId,
        variantId: line.variantId,
        movementType: "SALE",
        quantityChange: -Math.abs(line.quantity),
        referenceType: "SALE",
        referenceId: saleId,
        unitCost: line.unitCost,
        totalCost: line.unitCost * line.quantity,
        deviceId: req.deviceId,
        operationId: req.operationId,
        idempotencyKey: `${req.idempotencyKey}-${line.variantId}`,
        notes: `POS Sale #${saleNumber}`,
      });
    });

    assertStockAffectingSaleHasLedger(saleId, lines, ledgers);
    assertFinancialTransactionTenantIsolation(ctx, { tenantId: sale.tenantId, branchId: sale.branchId });

    this.sales.set(saleId, sale);
    this.saleLines.set(saleId, lines);

    return { sale, lines, ledgers };
  }

  // ==========================================
  // Returns & Refunds
  // ==========================================

  createSaleReturn(ctx: TenantContext, req: CreateSaleReturnRequest): { returnRecord: Return; ledgers: StockLedger[] } {
    const returnId = randomUUID();
    const now = new Date().toISOString();
    const returnNumber = TransactionNumbering.formatNumber("RET", "MAIN", this.returns.size + 1);

    if (req.originalSaleId) {
      const originalSale = this.sales.get(req.originalSaleId);
      assertReturnReferencesOriginalSale({ originalSaleId: req.originalSaleId }, !!originalSale);
      if (originalSale) {
        assertTenantIsolation(ctx, originalSale.tenantId, originalSale.branchId);
        if (originalSale.status === "REFUNDED") {
          throw new Error(`SALE_ALREADY_REFUNDED: Sale ${originalSale.saleNumber} has already been fully refunded`);
        }
      }
    }

    let totalRefundAmount = 0;
    const returnLines: ReturnLine[] = req.items.map((item) => {
      const refundLineTotal = item.quantityReturned * item.refundUnitPrice;
      totalRefundAmount += refundLineTotal;
      return {
        id: randomUUID(),
        returnId,
        variantId: item.variantId,
        quantityReturned: item.quantityReturned,
        refundUnitPrice: item.refundUnitPrice,
        refundLineTotal,
        condition: item.condition,
      };
    });

    const returnRecord: Return = {
      id: returnId,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      returnNumber,
      originalSaleId: req.originalSaleId || null,
      customerId: req.customerId || null,
      reason: req.reason,
      refundType: req.refundType,
      totalRefundAmount,
      status: "COMPLETED",
      authorizedById: ctx.userId,
      lines: returnLines,
      createdAt: now,
      updatedAt: now,
    };

    // If store credit / customer refund, reduce customer balance
    if (req.customerId) {
      const cust = this.customers.get(req.customerId);
      if (cust) {
        cust.currentBalance = Math.max(0, (cust.currentBalance || 0) - totalRefundAmount);
      }
    }

    // Generate StockLedger additions (movementType: "CUSTOMER_RETURN") for items in GOOD condition
    const stockRepo = this.getStockRepo();
    const ledgers: StockLedger[] = returnLines
      .filter((item) => item.condition === "GOOD")
      .map((item) => {
        const variant = this.store.variants.get(item.variantId);
        return stockRepo.recordMovement(ctx, {
          productId: variant ? variant.productId : randomUUID(),
          variantId: item.variantId,
          movementType: "CUSTOMER_RETURN",
          quantityChange: item.quantityReturned,
          referenceType: "CUSTOMER_RETURN",
          referenceId: returnId,
          unitCost: item.refundUnitPrice,
          totalCost: item.refundLineTotal,
          deviceId: req.deviceId,
          operationId: req.operationId,
          idempotencyKey: `${req.idempotencyKey}-${item.variantId}`,
          notes: `Customer Return #${returnRecord.returnNumber}`,
        });
      });

    this.returns.set(returnId, returnRecord);

    if (req.originalSaleId) {
      const originalSale = this.sales.get(req.originalSaleId);
      if (originalSale) {
        const pastReturns = Array.from(this.returns.values()).filter(
          (r) => r.originalSaleId === originalSale.id
        );
        const totalRefunded = pastReturns.reduce((sum, r) => sum + r.totalRefundAmount, 0);
        if (totalRefunded >= originalSale.grandTotal) {
          originalSale.status = "REFUNDED";
          originalSale.updatedAt = now;
        }
      }
    }

    return { returnRecord, ledgers };
  }

  getReturns(ctx: TenantContext): Return[] {
    return Array.from(this.returns.values()).filter(
      (r) => r.tenantId === ctx.tenantId && r.branchId === ctx.branchId
    );
  }

  // ==========================================
  // Cash Session Operations
  // ==========================================

  openCashSession(ctx: TenantContext, req: OpenCashSessionRequest): CashSession {
    const existingOpen = Array.from(this.cashSessions.values()).find(
      (s) => s.tenantId === ctx.tenantId && s.cashierId === ctx.userId && s.status === "OPEN"
    );
    if (existingOpen) {
      throw new Error(`CASH_SESSION_ALREADY_OPEN: Cashier already has an active open session (${existingOpen.sessionNumber})`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const sessionNumber = TransactionNumbering.formatNumber("SES", "MAIN", this.cashSessions.size + 1);

    const session: CashSession = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sessionNumber,
      cashierId: ctx.userId,
      openedAt: now,
      closedAt: null,
      openingCash: req.openingCash,
      closingCash: null,
      expectedCash: req.openingCash,
      actualCash: null,
      cashSalesTotal: 0,
      cashRefundsTotal: 0,
      cashExpensesTotal: 0,
      variance: null,
      status: "OPEN",
      notes: req.notes || null,
      createdAt: now,
      updatedAt: now,
    };
    this.cashSessions.set(id, session);
    return session;
  }

  recordExpense(ctx: TenantContext, req: CreateExpenseRequest): Expense {
    const id = randomUUID();
    const now = new Date().toISOString();
    const expense: Expense = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      cashSessionId: req.cashSessionId || null,
      category: req.category,
      amount: req.amount,
      reason: req.reason,
      authorizedById: ctx.userId,
      incurredAt: now,
      createdAt: now,
    };
    this.expenses.set(id, expense);

    if (req.cashSessionId) {
      const session = this.cashSessions.get(req.cashSessionId);
      if (session) {
        session.cashExpensesTotal = (session.cashExpensesTotal || 0) + req.amount;
      }
    }
    return expense;
  }

  sealCashSessionCount(ctx: TenantContext, sessionId: string, req: { actualCash: number; deviceId?: string }): CashSession {
    const session = this.cashSessions.get(sessionId);
    if (!session) throw new Error(`Cash session ${sessionId} not found`);
    assertTenantIsolation(ctx, session.tenantId, session.branchId);
    if (session.cashierId !== ctx.userId) throw new Error("CASH_SESSION_AUTHORIZATION_REQUIRED");
    if (session.status === "CLOSED") throw new Error("CASH_SESSION_CLOSED");
    if (session.countSealedAt) throw new Error("CASH_COUNT_ALREADY_SEALED");
    const actualCash = Number(req.actualCash);
    if (!Number.isFinite(actualCash) || actualCash < 0) throw new Error("INVALID_CASH_COUNT");
    const now = new Date().toISOString();
    session.actualCash = actualCash; session.closingCash = actualCash; session.countSealedAt = now;
    session.countSealedById = ctx.userId; session.countSealedDeviceId = req.deviceId || null; session.updatedAt = now;
    return session;
  }

  closeCashSession(ctx: TenantContext, sessionId: string, req: CloseCashSessionRequest): CashSession {
    const session = this.cashSessions.get(sessionId);
    if (!session) throw new Error(`Cash session ${sessionId} not found`);
    assertTenantIsolation(ctx, session.tenantId, session.branchId);

    const actualCash = session.actualCash;
    if (actualCash === null || actualCash === undefined || !session.countSealedAt) throw new Error("CASH_COUNT_NOT_SEALED");

    const varianceResult = CashSessionEngine.calculateVariance(
      {
        id: session.id,
        openingCash: session.openingCash,
        cashSalesTotal: session.cashSalesTotal || 0,
        cashRefundsTotal: session.cashRefundsTotal || 0,
        cashExpensesTotal: session.cashExpensesTotal || 0,
        cashInTotal: 0,
        cashOutTotal: 0,
        safeDropTotal: 0,
      },
      actualCash
    );

    const now = new Date().toISOString();
    session.closedAt = now;
    session.closingCash = actualCash;
    session.actualCash = actualCash;
    session.expectedCash = varianceResult.expectedCash;
    session.variance = varianceResult.variance;
    session.status = "CLOSED";
    session.notes = req.notes || session.notes;
    session.updatedAt = now;

    return session;
  }

  // ==========================================
  // Executive Dashboard & Commercial Reports
  // ==========================================

  getDashboardSummary(ctx: TenantContext): CommercialDashboardSummary {
    const tenantSales = Array.from(this.sales.values()).filter(
      (s) => s.tenantId === ctx.tenantId && s.branchId === ctx.branchId
    );
    const todayRevenue = tenantSales.reduce((acc, s) => acc + s.grandTotal, 0);
    const todayGrossProfit = tenantSales.reduce((acc, s) => acc + s.grossProfit, 0);
    const todayTransactionCount = tenantSales.length;

    const customers = this.getCustomers(ctx);
    const totalOutstandingReceivables = customers.reduce((acc, c) => acc + (c.currentBalance || 0), 0);

    const suppliers = this.getSuppliers(ctx);
    const totalOutstandingPayables = suppliers.reduce((acc, s) => acc + (s.outstandingBalance || 0), 0);

    const lowStockItemsCount = Array.from(this.store.variants.values()).filter(
      (v) => v.tenantId === ctx.tenantId && v.branchId === ctx.branchId && calculateAvailableStock(Array.from(this.store.stockLedgers.values()).filter((l) => l.variantId === v.id)) <= 5
    ).length;

    // Derive top-selling products from real sale lines
    const variantSalesMap = new Map<string, { quantitySold: number; revenue: number }>();
    for (const [saleId, lines] of this.saleLines.entries()) {
      const sale = this.sales.get(saleId);
      if (!sale || sale.tenantId !== ctx.tenantId || sale.branchId !== ctx.branchId) continue;
      for (const line of lines) {
        const existing = variantSalesMap.get(line.variantId) || { quantitySold: 0, revenue: 0 };
        variantSalesMap.set(line.variantId, {
          quantitySold: existing.quantitySold + line.quantity,
          revenue: existing.revenue + line.lineTotal,
        });
      }
    }
    const topSellingProducts = Array.from(variantSalesMap.entries())
      .sort((a, b) => b[1].quantitySold - a[1].quantitySold)
      .slice(0, 5)
      .map(([variantId, stats]) => {
        const variant = this.store.variants.get(variantId);
        return {
          variantId,
          productName: variant ? variant.name : variantId,
          quantitySold: stats.quantitySold,
          revenue: Math.round(stats.revenue * 100) / 100,
        };
      });

    // Derive cash drawer position from the open session for this branch
    const openSession = Array.from(this.cashSessions.values()).find(
      (s) => s.tenantId === ctx.tenantId && s.branchId === ctx.branchId && s.status === "OPEN"
    );
    const cashDrawerPosition = openSession
      ? Math.round(
          (openSession.openingCash + (openSession.cashSalesTotal || 0) - (openSession.cashRefundsTotal || 0) - (openSession.cashExpensesTotal || 0)) * 100
        ) / 100
      : 0;

    return {
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      todayGrossProfit: Math.round(todayGrossProfit * 100) / 100,
      todayTransactionCount,
      totalOutstandingReceivables: Math.round(totalOutstandingReceivables * 100) / 100,
      totalOutstandingPayables: Math.round(totalOutstandingPayables * 100) / 100,
      lowStockItemsCount,
      topSellingProducts,
      cashDrawerPosition,
    };
  }
}