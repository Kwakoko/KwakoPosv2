import { describe, it, expect } from 'vitest';
import {
  ScopedCommercialRepository,
  ScopedStockRepository,
  ScopedProductRepository,
  InMemoryStore,
} from '@kwakopos2/database';
import { SyncEngine } from '@kwakopos2/sync';
import type { TenantContext } from '@kwakopos2/contracts';
const tenantA: TenantContext = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  branchId: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
  roles: ['ADMIN'],
  permissions: ['*'],
};

const tenantB: TenantContext = {
  tenantId: '99999999-9999-4999-8999-999999999999',
  branchId: '88888888-8888-4888-8888-888888888888',
  userId: '77777777-7777-4777-8777-777777777777',
  roles: ['ADMIN'],
  permissions: ['*'],
};

describe('Issue #3 Gap Analysis Defect Eliminator Suite', () => {
  it('enforces strict customer credit limit on POS sales and rejects over-limit transactions', () => {
    const store = new InMemoryStore();
    const commercial = new ScopedCommercialRepository(store);
    const products = new ScopedProductRepository(store);

    const product = products.createProduct(tenantA, {
      name: 'Credit Test Item',
      sku: 'SKU-CR-01',
      buyingPrice: 100,
      sellingPrice: 200,
    });
    const variantId = product.variants[0].id;

    const stocks = new ScopedStockRepository(store);
    stocks.recordMovement(tenantA, {
      productId: product.id,
      variantId,
      movementType: 'OPENING',
      quantityChange: 10,
      deviceId: 'DEV-01',
      operationId: 'OP-01',
      idempotencyKey: 'IDEM-OP-01',
    });

    const customer = commercial.createCustomer(tenantA, {
      name: 'Credit Customer',
      creditLimit: 300,
    });
    const overSale = commercial.createPosSale(tenantA, {
      customerId: customer.id,
      items: [{ variantId, quantity: 2, unitPrice: 200 }],
      payments: [{ amount: 400, paymentMethod: 'CREDIT' }],
      deviceId: 'DEV-01',
      operationId: 'SALE-OP-01',
      idempotencyKey: 'IDEM-SALE-01',
    });
    expect(overSale.sale.paymentStatus).toBe('UNPAID');
    expect(customer.currentBalance).toBe(0);

    const saleResult = commercial.createPosSale(tenantA, {
      customerId: customer.id,
      items: [{ variantId, quantity: 1, unitPrice: 200 }],
      payments: [{ amount: 200, paymentMethod: 'CREDIT' }],
      deviceId: 'DEV-01',
      operationId: 'SALE-OP-02',
      idempotencyKey: 'IDEM-SALE-02',
    });
    expect(saleResult.sale.status).toBe('COMPLETED');
    expect(customer.currentBalance).toBe(200);
  });

  it('enforces exactly one open cash session per cashier', () => {
    const store = new InMemoryStore();
    const commercial = new ScopedCommercialRepository(store);

    const session1 = commercial.openCashSession(tenantA, {
      openingCash: 50000,
    });
    expect(session1.status).toBe('OPEN');
    expect(() => {
      commercial.openCashSession(tenantA, {
        openingCash: 20000,
      });
    }).toThrow(/CASH_SESSION_ALREADY_OPEN/i);

    commercial.closeCashSession(tenantA, session1.id, {
      actualCash: 50000,
    });

    const session2 = commercial.openCashSession(tenantA, {
      openingCash: 60000,
    });
    expect(session2.status).toBe('OPEN');
  });

  it('updates purchase order received quantities and transitions status on goods receipt', () => {
    const store = new InMemoryStore();
    const commercial = new ScopedCommercialRepository(store);
    const products = new ScopedProductRepository(store);

    const supplier = commercial.createSupplier(tenantA, { name: 'Test Supplier' });
    const product = products.createProduct(tenantA, {
      name: 'PO Item',
      sku: 'SKU-PO-01',
      buyingPrice: 100,
      sellingPrice: 150,
    });
    const variantId = product.variants[0].id;

    const po = commercial.createPurchaseOrder(tenantA, {
      supplierId: supplier.id,
      items: [{ variantId, quantityOrdered: 10, unitCost: 100 }],
    });
    expect(po.status).toBe('APPROVED');

    commercial.createPurchaseReceipt(tenantA, {
      purchaseOrderId: po.id,
      supplierId: supplier.id,
      items: [{ variantId, quantityReceived: 4, unitCost: 100 }],
      deviceId: 'DEV-01',
      operationId: 'REC-01',
      idempotencyKey: 'IDEM-REC-01',
    });
    expect(po.items[0].quantityReceived).toBe(4);
    expect(po.status).toBe('PARTIALLY_RECEIVED');

    commercial.createPurchaseReceipt(tenantA, {
      purchaseOrderId: po.id,
      supplierId: supplier.id,
      items: [{ variantId, quantityReceived: 6, unitCost: 100 }],
      deviceId: 'DEV-01',
      operationId: 'REC-02',
      idempotencyKey: 'IDEM-REC-02',
    });
    expect(po.items[0].quantityReceived).toBe(10);
    expect(po.status).toBe('RECEIVED');
  });

  it('enforces tenant isolation on sales returns and updates original sale status to REFUNDED', () => {
    const store = new InMemoryStore();
    const commercial = new ScopedCommercialRepository(store);
    const products = new ScopedProductRepository(store);

    const product = products.createProduct(tenantA, {
      name: 'Return Item',
      sku: 'SKU-RET-01',
      buyingPrice: 50,
      sellingPrice: 100,
    });
    const variantId = product.variants[0].id;

    const stocks = new ScopedStockRepository(store);
    stocks.recordMovement(tenantA, {
      productId: product.id,
      variantId,
      movementType: 'OPENING',
      quantityChange: 10,
      deviceId: 'DEV-01',
      operationId: 'OP-RET-01',
      idempotencyKey: 'IDEM-RET-01',
    });

    const sale = commercial.createPosSale(tenantA, {
      items: [{ variantId, quantity: 2, unitPrice: 100 }],
      payments: [{ amount: 200, paymentMethod: 'CASH' }],
      deviceId: 'DEV-01',
      operationId: 'SALE-RET-01',
      idempotencyKey: 'IDEM-SALE-RET-01',
    }).sale;

    expect(() => {
      commercial.createSaleReturn(tenantB, {
        originalSaleId: sale.id,
        items: [{ variantId, quantityReturned: 1, refundUnitPrice: 100, condition: 'GOOD' }],
        reason: 'Attempted cross-tenant return',
        refundType: 'CASH',
        deviceId: 'DEV-B',
        operationId: 'RET-OP-B',
        idempotencyKey: 'IDEM-RET-B',
      });
    }).toThrow();

    commercial.createSaleReturn(tenantA, {
        originalSaleId: sale.id,
        items: [{ variantId, quantityReturned: 1, refundUnitPrice: 100, condition: 'GOOD' }],
        reason: 'Wrong size',
        refundType: 'CASH	',
        deviceId: 'DEV-01',
        operationId: 'RET-0P-01',
        idempotencyKey: 'IDEM-RET-A1',
      });
    expect(sale.status).toBe('COMPLETED');

    commercial.createSaleReturn(tenantA, {
        originalSaleId: sale.id,
        items: [{ variantId, quantityReturned: 1, refundUnitPrice: 100, condition: 'GOOD' }],
        reason: 'No longer needed',
        refundType: 'CASH	',
        deviceId: 'DEV-01',
        operationId: 'RET-0P-02',
        idempotencyKey: 'IDEM-RET-A2',
      });
    expect(sale.status).toBe('REFUNDED');
  });

  it('processes offline Return sync operations cleanly via SyncEngine', () => {
    const store = new InMemoryStore();
    const products = new ScopedProductRepository(store);
    const stock = new ScopedStockRepository(store);
    const commercial = new ScopedCommercialRepository(store);
    const syncEngine = new SyncEngine(products, stock, commercial, store);

    const product = products.createProduct(tenantA, {
      name: 'Sync Return Item',
      sku: 'SKU-SYNC-RET-01',
      buyingPrice: 40,
      sellingPrice: 80,
    });
    const variantId = product.variants[0].id;

    const pushResult = syncEngine.processPush(tenantA, {
      deviceId: 'OFFLINE-POS-01',
      operations: [
        {
          operationId: 'OP-SYNC-RET-001',
          idempotencyKey: 'IDEM-SYNC-RET-001',
          entityType: 'Return',
          entityId: 'RET-UUID-001',
          operationType: 'CREATE',
          clientCreatedAt: new Date().toISOString(),
          payload: {
            items: [{ variantId, quantityReturned: 1, refundUnitPrice: 80, condition: 'GOOD' }],
            reason: 'Customer return offline',
            refundType: 'CASH',
          },
        },
      ],
    });

    expect(pushResult.processedCount).toBe(1);
    expect(pushResult.results[0].status).toBe('SUCCESS');
    expect(commercial.getReturns(tenantA).length).toBe(1);
  });
});
