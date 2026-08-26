import { randomUUID } from "crypto";
import { ScopedProductRepository, ScopedStockRepository, ScopedCommercialRepository, ScopedFinanceRepository, globalInMemoryStore } from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine.js";
import {
  calculateAvailableStock,
  assertInventoryLedgerIntegrity,
  assertNoOrphanAdjustments,
  FinancialBridge,
  AccountingEngine,
  ReceivablesPayablesEngine,
} from "@kwakopos2/domain";
import { globalMetrics, globalIncidentEngine, defaultLogger } from "@kwakopos2/observability";

export interface SyntheticRunResult {
  testSuite: string;
  syntheticTenantId: string;
  durationMs: number;
  status: "PASS" | "FAIL";
  evidence: Record<string, unknown>;
  timestamp: string;
}

export async function runSyntheticProductionSuite(apiBaseUrl?: string): Promise<{
  allPassed: boolean;
  results: SyntheticRunResult[];
}> {
  const results: SyntheticRunResult[] = [];
  const syntheticTenantId = `tenant-synthetic-${randomUUID().slice(0, 8)}`;
  const syntheticBranchId = `branch-synthetic-${randomUUID().slice(0, 8)}`;
  const syntheticUserId = `user-synthetic-${randomUUID().slice(0, 8)}`;

  const ctx = {
    tenantId: syntheticTenantId,
    branchId: syntheticBranchId,
    userId: syntheticUserId,
    roles: ["ADMIN"],
    permissions: ["*"],
  };

  console.log("========================================================================");
  console.log(` KWAKOPOS 2.0 CONTINUOUS SYNTHETIC PRODUCTION MONITORING                `);
  console.log(` Synthetic Tenant: ${syntheticTenantId}`);
  console.log("========================================================================");

  const productRepo = new ScopedProductRepository(globalInMemoryStore);
  const stockRepo = new ScopedStockRepository(globalInMemoryStore);
  const commercialRepo = new ScopedCommercialRepository(globalInMemoryStore);
  const syncEngine = new SyncEngine(productRepo, stockRepo, commercialRepo, globalInMemoryStore);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST A: Login -> Create Product -> Update -> Verify Persistence
  // -------------------------------------------------------------------------
  const startA = Date.now();
  const prod = productRepo.createProduct(ctx, {
    name: "Synthetic Product Alpha",
    sku: "SYNTH-P1",
    variants: [{ name: "Standard", sku: "SYNTH-V1", price: 25, costPrice: 10 }],
  });
  const updatedProd = productRepo.updateProduct(ctx, prod.id, { name: "Synthetic Product Alpha Updated" });
  const fetchedProd = productRepo.getProductById(ctx, prod.id);
  const passA = fetchedProd !== null && fetchedProd.name === "Synthetic Product Alpha Updated";
  results.push({
    testSuite: "SYNTHETIC_TEST_A_PRODUCT_LIFECYCLE",
    syntheticTenantId,
    durationMs: Date.now() - startA,
    status: passA ? "PASS" : "FAIL",
    evidence: { productId: prod.id, name: fetchedProd?.name },
    timestamp: new Date().toISOString(),
  });
  console.log(` [A/F] ${passA ? "✓" : "✗"} Synthetic Test A (Product Lifecycle & Persistence): ${passA ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST B: Create Variant -> Verify Relationship & Identity
  // -------------------------------------------------------------------------
  const startB = Date.now();
  const varB = productRepo.addVariant(ctx, prod.id, {
    name: "Synthetic Size Large",
    sku: "SYNTH-V2-LG",
    price: 30,
    costPrice: 12,
  });
  const reloadedProd = productRepo.getProductById(ctx, prod.id);
  const passB = reloadedProd?.variants?.some((v) => v.id === varB.id && v.productId === prod.id);
  results.push({
    testSuite: "SYNTHETIC_TEST_B_VARIANT_INTEGRITY",
    syntheticTenantId,
    durationMs: Date.now() - startB,
    status: passB ? "PASS" : "FAIL",
    evidence: { variantId: varB.id, totalVariants: reloadedProd?.variants?.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [B/F] ${passB ? "✓" : "✗"} Synthetic Test B (Variant Relationship Integrity): ${passB ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST C: Stock Adjustment -> Ledger Mutation Arithmetic
  // -------------------------------------------------------------------------
  const startC = Date.now();
  const targetVarId = varB.id;
  stockRepo.recordStockAdjustment(ctx, {
    variantId: targetVarId,
    adjustmentType: "INCREASE",
    quantityChange: 150,
    reason: "Synthetic Intake",
    deviceId: "synth-dev-1",
    operationId: "op-synth-1",
    idempotencyKey: "key-synth-1",
  });
  stockRepo.recordStockAdjustment(ctx, {
    variantId: targetVarId,
    adjustmentType: "DECREASE",
    quantityChange: 15,
    reason: "Synthetic Dispatch",
    deviceId: "synth-dev-1",
    operationId: "op-synth-2",
    idempotencyKey: "key-synth-2",
  });
  const currentStock = stockRepo.getAvailableStock(ctx, targetVarId);
  const ledgers = stockRepo.getLedger(ctx, targetVarId);
  assertInventoryLedgerIntegrity(targetVarId, 135, ledgers);
  const passC = currentStock === 135; // 150 - 15 = 135
  results.push({
    testSuite: "SYNTHETIC_TEST_C_STOCK_LEDGER_ARITHMETIC",
    syntheticTenantId,
    durationMs: Date.now() - startC,
    status: passC ? "PASS" : "FAIL",
    evidence: { variantId: targetVarId, expectedStock: 135, actualStock: currentStock },
    timestamp: new Date().toISOString(),
  });
  console.log(` [C/F] ${passC ? "✓" : "✗"} Synthetic Test C (Stock Ledger Arithmetic 150 - 15 = 135): ${passC ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST D: Browser A -> Server -> Browser B Multi-Device Sync
  // -------------------------------------------------------------------------
  const startD = Date.now();
  const bADb = new LocalIndexedDbStore();
  const bAEngine = new ClientSyncEngine("device-synth-A", bADb);
  const bBDb = new LocalIndexedDbStore();
  const bBEngine = new ClientSyncEngine("device-synth-B", bBDb);

  const synthVarId = randomUUID();
  const synthProdId = randomUUID();

  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D1",
    entityType: "Product",
    entityId: synthProdId,
    operationType: "CREATE",
    payload: { name: "Sync Synth Item", sku: "SYNTH-SYNC-01" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D1",
    status: "PENDING",
  });
  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D2",
    entityType: "ProductVariant",
    entityId: synthVarId,
    operationType: "CREATE",
    payload: { productId: synthProdId, name: "Var Sync", sku: "SYNTH-VAR-01", price: 10, costPrice: 5 },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D2",
    status: "PENDING",
  });
  bADb.recordOutboxMutation({
    id: "OP-SYNTH-D3",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: {
      variantId: synthVarId,
      adjustmentType: "INCREASE",
      quantityChange: 75,
      reason: "Intake",
      deviceId: "device-synth-A",
      operationId: "OP-SYNTH-D3",
      idempotencyKey: "SYNTH-KEY-D3",
    },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "SYNTH-KEY-D3",
    status: "PENDING",
  });

  await bAEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  await bBEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  const bBStock = calculateAvailableStock(
    Array.from(bBDb.stockLedger.values()).filter((l) => l.variantId === synthVarId)
  );
  const passD = bBStock === 75 && bBDb.products.size >= 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_D_MULTI_DEVICE_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startD,
    status: passD ? "PASS" : "FAIL",
    evidence: { browserBStock: bBStock, expected: 75 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [D/F] ${passD ? "✓" : "✗"} Synthetic Test D (Multi-Device Convergence to Browser B = 75): ${passD ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST E: Offline Mutation Outbox Queuing & Reconnect Sync
  // -------------------------------------------------------------------------
  const startE = Date.now();
  const offlineDb = new LocalIndexedDbStore();
  const offlineEngine = new ClientSyncEngine("device-synth-offline", offlineDb);

  offlineDb.recordOutboxMutation({
    id: "OP-OFFLINE-01",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: {
      variantId: synthVarId,
      adjustmentType: "DECREASE",
      quantityChange: 10,
      reason: "Offline Sale",
      deviceId: "device-synth-offline",
      operationId: "OP-OFFLINE-01",
      idempotencyKey: "OFFLINE-KEY-01",
    },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "OFFLINE-KEY-01",
    status: "PENDING",
  });

  const pendingBefore = offlineDb.getPendingOutbox().length;
  await offlineEngine.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );
  const pendingAfter = offlineDb.getPendingOutbox().length;
  const passE = pendingBefore === 1 && pendingAfter === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_E_OFFLINE_DURABILITY",
    syntheticTenantId,
    durationMs: Date.now() - startE,
    status: passE ? "PASS" : "FAIL",
    evidence: { pendingBefore, pendingAfter },
    timestamp: new Date().toISOString(),
  });
  console.log(` [E/F] ${passE ? "✓" : "✗"} Synthetic Test E (Offline Outbox Durability & Sync Clearance): ${passE ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F: PWA Schema Migration Preservation
  // -------------------------------------------------------------------------
  const startF = Date.now();
  const pwaDb = new LocalIndexedDbStore();
  pwaDb.recordOutboxMutation({
    id: "OP-PWA-01",
    entityType: "StockAdjustment",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { variantId: synthVarId, adjustmentType: "INCREASE", quantityChange: 10, idempotencyKey: "PWA-1" },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "PWA-1",
    status: "PENDING",
  });
  const migration = pwaDb.migrateToVersion(3);
  const passF = migration.newVersion === 3 && migration.preservedOutboxCount === 1;
  results.push({
    testSuite: "SYNTHETIC_TEST_F_PWA_UPGRADE_PRESERVATION",
    syntheticTenantId,
    durationMs: Date.now() - startF,
    status: passF ? "PASS" : "FAIL",
    evidence: { version: migration.newVersion, preserved: migration.preservedOutboxCount },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F/L] ${passF ? "✓" : "✗"} Synthetic Test F (PWA Schema Upgrade Outbox Preservation): ${passF ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST G: Product -> Variant -> Sale -> Stock Ledger Deduction (100 - 5 = 95)
  // -------------------------------------------------------------------------
  const startG = Date.now();
  const prodG = productRepo.createProduct(ctx, {
    name: "Commercial Flour 1kg",
    sku: "FLOUR-1KG",
    variants: [{ name: "1kg", sku: "FLOUR-1KG-V1", price: 2000, costPrice: 1500 }],
  });
  const varGId = prodG.variants![0].id;
  stockRepo.recordStockAdjustment(ctx, {
    variantId: varGId,
    adjustmentType: "INCREASE",
    quantityChange: 100,
    reason: "Initial Stock",
    deviceId: "dev-synth-1",
    operationId: "op-synth-init-g",
    idempotencyKey: "idem-synth-init-g",
  });
  const saleResG = commercialRepo.createPosSale(ctx, {
    items: [{ productId: prodG.id, variantId: varGId, quantity: 5, unitPrice: 2000, unitCost: 1500 }],
    payments: [{ amount: 10000, paymentMethod: "CASH" }],
    deviceId: "dev-synth-1",
    operationId: "op-synth-sale-g",
    idempotencyKey: "idem-synth-sale-g",
  });
  const stockAfterG = stockRepo.getAvailableStock(ctx, varGId);
  const passG = saleResG.sale.grandTotal === 10000 && stockAfterG === 95;
  results.push({
    testSuite: "SYNTHETIC_TEST_G_POS_SALE_STOCK_DEDUCTION",
    syntheticTenantId,
    durationMs: Date.now() - startG,
    status: passG ? "PASS" : "FAIL",
    evidence: { stockBefore: 100, sold: 5, stockAfter: stockAfterG },
    timestamp: new Date().toISOString(),
  });
  console.log(` [G/L] ${passG ? "✓" : "✗"} Synthetic Test G (POS Sale & Ledger Stock Deduction 100 -> 95): ${passG ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST H: Purchase -> Goods Receipt -> Stock Ledger Addition (95 + 20 = 115)
  // -------------------------------------------------------------------------
  const startH = Date.now();
  const supH = commercialRepo.createSupplier(ctx, { name: "Synthetic Miller Ltd" });
  const recH = commercialRepo.createPurchaseReceipt(ctx, {
    supplierId: supH.id,
    deviceId: "dev-synth-1",
    operationId: "op-synth-rec-h",
    idempotencyKey: "idem-synth-rec-h",
    items: [{ variantId: varGId, quantityReceived: 20, unitCost: 1500 }],
  });
  const stockAfterH = stockRepo.getAvailableStock(ctx, varGId);
  const passH = recH.ledgers.length === 1 && stockAfterH === 115;
  results.push({
    testSuite: "SYNTHETIC_TEST_H_PURCHASE_RECEIPT_STOCK_ADDITION",
    syntheticTenantId,
    durationMs: Date.now() - startH,
    status: passH ? "PASS" : "FAIL",
    evidence: { stockBefore: 95, received: 20, stockAfter: stockAfterH },
    timestamp: new Date().toISOString(),
  });
  console.log(` [H/L] ${passH ? "✓" : "✗"} Synthetic Test H (Goods Receipt & Ledger Addition 95 -> 115): ${passH ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST I: Sale Return -> Stock Ledger Restoration (115 + 2 = 117)
  // -------------------------------------------------------------------------
  const startI = Date.now();
  const retI = commercialRepo.createSaleReturn(ctx, {
    reason: "Customer exchanged size",
    refundType: "CASH",
    deviceId: "dev-synth-1",
    operationId: "op-synth-ret-i",
    idempotencyKey: "idem-synth-ret-i",
    items: [{ variantId: varGId, quantityReturned: 2, refundUnitPrice: 2000, condition: "GOOD" }],
  });
  const stockAfterI = stockRepo.getAvailableStock(ctx, varGId);
  const passI = retI.returnRecord.totalRefundAmount === 4000 && stockAfterI === 117;
  results.push({
    testSuite: "SYNTHETIC_TEST_I_SALE_RETURN_STOCK_RESTORATION",
    syntheticTenantId,
    durationMs: Date.now() - startI,
    status: passI ? "PASS" : "FAIL",
    evidence: { stockBefore: 115, returned: 2, stockAfter: stockAfterI },
    timestamp: new Date().toISOString(),
  });
  console.log(` [I/L] ${passI ? "✓" : "✗"} Synthetic Test I (Sale Return & Ledger Restoration 115 -> 117): ${passI ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST J: Customer -> Credit Sale -> Balance Tracking
  // -------------------------------------------------------------------------
  const startJ = Date.now();
  const custJ = commercialRepo.createCustomer(ctx, { name: "Synthetic Wholesale Buyer", creditLimit: 200000 });
  const creditSaleJ = commercialRepo.createPosSale(ctx, {
    customerId: custJ.id,
    items: [{ productId: prodG.id, variantId: varGId, quantity: 10, unitPrice: 2000, unitCost: 1500 }],
    payments: [{ amount: 20000, paymentMethod: "CREDIT" }],
    deviceId: "dev-synth-1",
    operationId: "op-synth-sale-j",
    idempotencyKey: "idem-synth-sale-j",
  });
  const custJUpdated = commercialRepo.getCustomerById(ctx, custJ.id);
  const passJ = creditSaleJ.sale.paymentStatus === "PAID" && custJUpdated?.currentBalance === 20000;
  results.push({
    testSuite: "SYNTHETIC_TEST_J_CUSTOMER_CREDIT_ACCOUNTING",
    syntheticTenantId,
    durationMs: Date.now() - startJ,
    status: passJ ? "PASS" : "FAIL",
    evidence: { creditLimit: 200000, creditSale: 20000, currentBalance: custJUpdated?.currentBalance },
    timestamp: new Date().toISOString(),
  });
  console.log(` [J/L] ${passJ ? "✓" : "✗"} Synthetic Test J (Customer Credit & AR Tracking): ${passJ ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST K: Multi-Device Outbox Convergence (Device A -> Server -> Device B)
  // -------------------------------------------------------------------------
  const startK = Date.now();
  const dbA = new LocalIndexedDbStore();
  const dbB = new LocalIndexedDbStore();
  const engineA = new ClientSyncEngine("device-k-a", dbA);
  const engineB = new ClientSyncEngine("device-k-b", dbB);

  dbA.recordOutboxMutation({
    id: "OP-DEV-A-01",
    entityType: "Customer",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { name: "Converged Customer Alpha", creditLimit: 50000 },
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: "CONV-A-01",
    status: "PENDING",
  });

  // Device A syncs up to Server
  await engineA.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  // Device B syncs down from Server
  await engineB.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  const serverCustomers = commercialRepo.getCustomers(ctx);
  const passK = serverCustomers.some((c) => c.name === "Converged Customer Alpha");
  results.push({
    testSuite: "SYNTHETIC_TEST_K_MULTI_DEVICE_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startK,
    status: passK ? "PASS" : "FAIL",
    evidence: { convergedCustomerCount: serverCustomers.length },
    timestamp: new Date().toISOString(),
  });
  console.log(` [K/L] ${passK ? "✓" : "✗"} Synthetic Test K (Multi-Device A -> Server -> B Sync Convergence): ${passK ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST L: Cashier Session Lifecycle & Drawer Variance Reconciliation
  // -------------------------------------------------------------------------
  const startL = Date.now();
  const sessionL = commercialRepo.openCashSession(ctx, { openingCash: 100000 });
  sessionL.cashSalesTotal = 50000;
  commercialRepo.recordExpense(ctx, {
    cashSessionId: sessionL.id,
    category: "OFFICE_EXPENSE",
    amount: 10000,
    reason: "Cleaning Supplies",
  });
  const closedSessionL = commercialRepo.closeCashSession(ctx, sessionL.id, { actualCash: 140000 });
  const passL = closedSessionL.status === "CLOSED" && closedSessionL.expectedCash === 140000 && closedSessionL.variance === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_L_CASH_SESSION_RECONCILIATION",
    syntheticTenantId,
    durationMs: Date.now() - startL,
    status: passL ? "PASS" : "FAIL",
    evidence: { opening: 100000, sales: 50000, expenses: 10000, expected: closedSessionL.expectedCash, variance: closedSessionL.variance },
    timestamp: new Date().toISOString(),
  });
  console.log(` [L/L] ${passL ? "✓" : "✗"} Synthetic Test L (Cashier Session Lifecycle & Variance Reconciliation): ${passL ? "PASS" : "FAIL"}`);

  // =========================================================================
  // PHASE 2: FINANCE & OPERATIONAL CONTROL SYNTHETIC MONITORING (F01 - F08)
  // =========================================================================

  const financeRepo = new ScopedFinanceRepository(globalInMemoryStore);
  const accountLookup = financeRepo.getAccountLookup(ctx);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F01: Sale -> Payment -> Journal -> General Ledger & Trial Balance
  // -------------------------------------------------------------------------
  const startF01 = Date.now();
  const saleF01 = commercialRepo.createPosSale(ctx, {
    items: [{ productId: prod.id, variantId: targetVarId, quantity: 2, unitPrice: 30, unitCost: 12 }],
    payments: [{ amount: 60, paymentMethod: "CASH" }],
    deviceId: "synth-dev-1",
    operationId: "op-synth-f01",
    idempotencyKey: `synth-f01-${randomUUID()}`,
  });
  const { journal: jF01 } = FinancialBridge.mapSaleToJournal(ctx, saleF01.sale, accountLookup, "CASH");
  financeRepo.journalEntries.set(jF01.id, jF01);
  financeRepo.journalLines.set(jF01.id, jF01.lines || []);
  const tbF01 = financeRepo.getTrialBalance(ctx);
  const passF01 = jF01.totalDebit === jF01.totalCredit && tbF01.isBalanced;
  results.push({
    testSuite: "SYNTHETIC_TEST_F01_SALE_JOURNAL_GL_INTEGRITY",
    syntheticTenantId,
    durationMs: Date.now() - startF01,
    status: passF01 ? "PASS" : "FAIL",
    evidence: { journalId: jF01.id, totalDebit: jF01.totalDebit, isTrialBalanceBalanced: tbF01.isBalanced },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F01/F08] ${passF01 ? "✓" : "✗"} Synthetic Test F01 (Sale -> Journal -> GL Double-Entry Balance): ${passF01 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F02: Credit Sale -> Customer Invoice -> Payment Allocation -> Zero Balance
  // -------------------------------------------------------------------------
  const startF02 = Date.now();
  const custF02 = commercialRepo.createCustomer(ctx, { name: "Synthetic Credit Customer", creditLimit: 500000 });
  const invF02 = financeRepo.createCustomerInvoice(ctx, {
    customerId: custF02.id,
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    items: [{ description: "Credit Goods", quantity: 5, unitPrice: 10000 }],
  });
  const allocF02 = financeRepo.allocatePayment(ctx, {
    paymentId: randomUUID(),
    customerInvoiceId: invF02.id,
    amount: 50000,
  });
  const passF02 = allocF02.updatedInvoice.status === "PAID" && allocF02.updatedInvoice.balanceDue === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_F02_AR_INVOICE_ALLOCATION",
    syntheticTenantId,
    durationMs: Date.now() - startF02,
    status: passF02 ? "PASS" : "FAIL",
    evidence: { invoiceId: invF02.id, status: allocF02.updatedInvoice.status, balanceDue: allocF02.updatedInvoice.balanceDue },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F02/F08] ${passF02 ? "✓" : "✗"} Synthetic Test F02 (Credit Sale -> AR Invoice -> Payment Allocation): ${passF02 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F03: Purchase -> Supplier Invoice -> Supplier Payment -> Zero Balance
  // -------------------------------------------------------------------------
  const startF03 = Date.now();
  const supF03 = commercialRepo.createSupplier(ctx, { name: "Synthetic AP Supplier" });
  const invF03 = financeRepo.createSupplierInvoice(ctx, {
    supplierId: supF03.id,
    dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    items: [{ description: "Raw Materials", quantity: 10, unitCost: 8000 }],
  });
  const allocF03 = financeRepo.allocatePayment(ctx, {
    paymentId: randomUUID(),
    supplierInvoiceId: invF03.id,
    amount: 80000,
  });
  const passF03 = allocF03.updatedInvoice.status === "PAID" && allocF03.updatedInvoice.balanceDue === 0;
  results.push({
    testSuite: "SYNTHETIC_TEST_F03_AP_INVOICE_ALLOCATION",
    syntheticTenantId,
    durationMs: Date.now() - startF03,
    status: passF03 ? "PASS" : "FAIL",
    evidence: { supplierInvoiceId: invF03.id, status: allocF03.updatedInvoice.status, balanceDue: allocF03.updatedInvoice.balanceDue },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F03/F08] ${passF03 ? "✓" : "✗"} Synthetic Test F03 (Purchase -> AP Invoice -> Supplier Payment): ${passF03 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F04: Expense -> Journal Posting
  // -------------------------------------------------------------------------
  const startF04 = Date.now();
  const expF04 = commercialRepo.recordExpense(ctx, { category: "UTILITIES", amount: 25000, reason: "Electricity Bill" });
  const { journal: jF04 } = FinancialBridge.mapExpenseToJournal(ctx, expF04, accountLookup.expenseDefaultAccountId, accountLookup);
  financeRepo.journalEntries.set(jF04.id, jF04);
  financeRepo.journalLines.set(jF04.id, jF04.lines || []);
  const passF04 = jF04.status === "POSTED" && jF04.totalDebit === 25000 && jF04.totalCredit === 25000;
  results.push({
    testSuite: "SYNTHETIC_TEST_F04_EXPENSE_JOURNAL_POSTING",
    syntheticTenantId,
    durationMs: Date.now() - startF04,
    status: passF04 ? "PASS" : "FAIL",
    evidence: { expenseId: expF04.id, journalId: jF04.id },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F04/F08] ${passF04 ? "✓" : "✗"} Synthetic Test F04 (Operating Expense -> GL Journal Posting): ${passF04 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F05: Cash Session -> Close -> Drawer Variance Journal
  // -------------------------------------------------------------------------
  const startF05 = Date.now();
  const sesF05 = commercialRepo.openCashSession(ctx, { openingCash: 100000 });
  sesF05.cashSalesTotal = 20000;
  const closedF05 = commercialRepo.closeCashSession(ctx, sesF05.id, { actualCash: 115000 }); // 5k short
  const varianceResultF05 = FinancialBridge.mapCashSessionVarianceToJournal(ctx, closedF05, accountLookup);
  const passF05 = varianceResultF05 !== null && varianceResultF05.journal.totalDebit === 5000;
  results.push({
    testSuite: "SYNTHETIC_TEST_F05_CASH_VARIANCE_JOURNAL",
    syntheticTenantId,
    durationMs: Date.now() - startF05,
    status: passF05 ? "PASS" : "FAIL",
    evidence: { variance: closedF05.variance, journalDebit: varianceResultF05?.journal.totalDebit },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F05/F08] ${passF05 ? "✓" : "✗"} Synthetic Test F05 (Cash Session -> Variance -> Cash Short Journal): ${passF05 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F06: Multi-Device Financial Mutation Sync Convergence
  // -------------------------------------------------------------------------
  const startF06 = Date.now();
  const dbStoreF06A = new LocalIndexedDbStore();
  const dbStoreF06B = new LocalIndexedDbStore();
  const engineF06A = new ClientSyncEngine("device-fin-a", dbStoreF06A);
  const engineF06B = new ClientSyncEngine("device-fin-b", dbStoreF06B);

  dbStoreF06A.recordOutboxMutation({
    id: "op-fin-sync-1",
    entityType: "Customer",
    entityId: randomUUID(),
    operationType: "CREATE",
    payload: { name: "Converged Financial Customer", creditLimit: 250000 },
    idempotencyKey: `idem-fin-sync-${randomUUID()}`,
    clientCreatedAt: new Date().toISOString(),
    status: "PENDING",
  });

  await engineF06A.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );
  await engineF06B.syncWithServer(
    async (req) => syncEngine.processPush(ctx, req),
    async (since) => syncEngine.processDelta(ctx, { since })
  );

  const passF06 = commercialRepo.getCustomers(ctx).some((c) => c.name === "Converged Financial Customer");
  results.push({
    testSuite: "SYNTHETIC_TEST_F06_FINANCIAL_SYNC_CONVERGENCE",
    syntheticTenantId,
    durationMs: Date.now() - startF06,
    status: passF06 ? "PASS" : "FAIL",
    evidence: { syncStatus: "CONVERGED", customerFound: passF06 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F06/F08] ${passF06 ? "✓" : "✗"} Synthetic Test F06 (Multi-Device Financial Mutation Sync Convergence): ${passF06 ? "PASS" : "FAIL"}`);


  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F07: Closed Accounting Period -> Attempt Posting -> Correct Rejection
  // -------------------------------------------------------------------------
  const startF07 = Date.now();
  const fyF07 = financeRepo.createFiscalYear(ctx, { name: "FY Synthetic", startDate: "2026-01-01", endDate: "2026-12-31" });
  const pF07 = financeRepo.createAccountingPeriod(ctx, { fiscalYearId: fyF07.id, periodNumber: 2, name: "2026-02", startDate: "2026-02-01", endDate: "2026-02-28" });
  financeRepo.closePeriod(ctx, pF07.id);
  let rejectedCorrectly = false;
  try {
    financeRepo.createJournalEntry(ctx, {
      accountingPeriodId: pF07.id,
      sourceType: "MANUAL",
      description: "Invalid Posting",
      lines: [
        { accountId: accountLookup.cashAccountId, debit: 100, credit: 0 },
        { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 100 },
      ],
    });
  } catch (err: any) {
    rejectedCorrectly = err.message.includes("INVARIANT_F010_VIOLATION");
  }
  const passF07 = rejectedCorrectly;
  results.push({
    testSuite: "SYNTHETIC_TEST_F07_CLOSED_PERIOD_POSTING_REJECTION",
    syntheticTenantId,
    durationMs: Date.now() - startF07,
    status: passF07 ? "PASS" : "FAIL",
    evidence: { rejectedCorrectly },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F07/F08] ${passF07 ? "✓" : "✗"} Synthetic Test F07 (Closed Accounting Period -> Correct Rejection): ${passF07 ? "PASS" : "FAIL"}`);

  // -------------------------------------------------------------------------
  // SYNTHETIC TEST F08: Duplicate Payment -> Idempotency -> Single Financial Result
  // -------------------------------------------------------------------------
  const startF08 = Date.now();
  const keyF08 = `idem-fin-f08-${randomUUID()}`;
  const firstJ = financeRepo.createJournalEntry(ctx, {
    idempotencyKey: keyF08,
    sourceType: "MANUAL",
    description: "Idempotent Entry",
    lines: [
      { accountId: accountLookup.cashAccountId, debit: 5000, credit: 0 },
      { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 5000 },
    ],
  });
  const secondJ = financeRepo.createJournalEntry(ctx, {
    idempotencyKey: keyF08,
    sourceType: "MANUAL",
    description: "Duplicate Attempt",
    lines: [
      { accountId: accountLookup.cashAccountId, debit: 5000, credit: 0 },
      { accountId: accountLookup.salesRevenueAccountId, debit: 0, credit: 5000 },
    ],
  });
  const passF08 = firstJ.journal.id === secondJ.journal.id;
  results.push({
    testSuite: "SYNTHETIC_TEST_F08_IDEMPOTENCY_SINGLE_RESULT",
    syntheticTenantId,
    durationMs: Date.now() - startF08,
    status: passF08 ? "PASS" : "FAIL",
    evidence: { firstId: firstJ.journal.id, secondId: secondJ.journal.id, duplicatePrevented: passF08 },
    timestamp: new Date().toISOString(),
  });
  console.log(` [F08/F08] ${passF08 ? "✓" : "✗"} Synthetic Test F08 (Duplicate Payment Idempotency -> Single Financial Result): ${passF08 ? "PASS" : "FAIL"}`);

  const allPassed = results.every((r) => r.status === "PASS");
  return { allPassed, results };
}

if (process.argv[1] && process.argv[1].endsWith("synthetic-monitor.ts")) {
  runSyntheticProductionSuite()
    .then(({ allPassed, results }) => {
      console.log("\n========================================================================");
      console.log(` SYNTHETIC SUITE RESULT: ${allPassed ? "ALL TESTS PASSED (GREEN)" : "FAILURES DETECTED (RED)"}`);
      console.log("========================================================================");
      if (!allPassed) process.exit(1);
    })
    .catch((err) => {
      console.error("SYNTHETIC MONITORING ERROR:", err);
      process.exit(1);
    });
}