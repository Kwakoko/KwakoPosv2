/**
 * KwakoPosv2 — Universal Sample Data & Training Sandbox Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides realistic, localized retail demo datasets on demand for:
 *   - Cashier and manager training
 *   - Layout and hardware verification
 *   - Offline sync and reporting simulations
 *
 * All demo records are strictly tagged with `isDemo: true` so they can be
 * purged cleanly with a single click, restoring the store to 100% pristine zero data.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import type { LocalIndexedDbStore } from "../indexedDb.js";

export const DEMO_MODE_STORAGE_KEY = "kwakopos:demo_mode_active";
export const DEMO_DATA_EVENT = "kwakopos:demo-data-changed";

export interface SampleDataSummary {
  products: number;
  variants: number;
  customers: number;
  suppliers: number;
  sales: number;
  expenses: number;
}

// ─── Realistic Localized Retail Products ──────────────────────────────────────
const SAMPLE_PRODUCTS = [
  {
    id: "prod-demo-01",
    name: "Azam Wheat Flour 2kg",
    sku: "AZM-WHT-2KG",
    category: "Grains & Flour",
    brand: "Azam",
    sellingPrice: 7500,
    costPrice: 5800,
    buyingPrice: 5800,
    stock: 48,
    reorderLevel: 10,
    status: "Active",
    barcode: "616110001001",
    isDemo: true,
  },
  {
    id: "prod-demo-02",
    name: "Coca Cola 500ml Pet",
    sku: "CC-PET-500",
    category: "Beverages",
    brand: "Coca Cola",
    sellingPrice: 1500,
    costPrice: 1100,
    buyingPrice: 1100,
    stock: 120,
    reorderLevel: 24,
    status: "Active",
    barcode: "5449000000996",
    isDemo: true,
  },
  {
    id: "prod-demo-03",
    name: "ASAS Fresh Cow Milk 1L",
    sku: "ASAS-MLK-1L",
    category: "Dairy",
    brand: "ASAS",
    sellingPrice: 3000,
    costPrice: 2300,
    buyingPrice: 2300,
    stock: 22,
    reorderLevel: 12,
    status: "Active",
    barcode: "616110002002",
    expiryDate: new Date(Date.now() + 86400000 * 5).toISOString().split("T")[0], // Expiring in 5 days
    isDemo: true,
  },
  {
    id: "prod-demo-04",
    name: "Korie Refined Cooking Oil 5L",
    sku: "KOR-OIL-5L",
    category: "Edible Oils",
    brand: "Korie",
    sellingPrice: 42000,
    costPrice: 35000,
    buyingPrice: 35000,
    stock: 16,
    reorderLevel: 5,
    status: "Active",
    barcode: "616110003003",
    isDemo: true,
  },
  {
    id: "prod-demo-05",
    name: "Kilimanjaro Drinking Water 1.5L",
    sku: "KLM-WTR-15L",
    category: "Beverages",
    brand: "Bonite",
    sellingPrice: 1200,
    costPrice: 850,
    buyingPrice: 850,
    stock: 65,
    reorderLevel: 20,
    status: "Active",
    barcode: "616110004004",
    isDemo: true,
  },
  {
    id: "prod-demo-06",
    name: "Blue Band Margarine 500g",
    sku: "BB-MRG-500G",
    category: "Dairy & Spreads",
    brand: "Upfield",
    sellingPrice: 5500,
    costPrice: 4200,
    buyingPrice: 4200,
    stock: 30,
    reorderLevel: 8,
    status: "Active",
    barcode: "616110005005",
    isDemo: true,
  },
  {
    id: "prod-demo-07",
    name: "Unga wa Sembe Super 10kg",
    sku: "UNG-SMB-10K",
    category: "Grains & Flour",
    brand: "Azam",
    sellingPrice: 24000,
    costPrice: 19500,
    buyingPrice: 19500,
    stock: 6,
    reorderLevel: 10,
    status: "Low Stock",
    barcode: "616110006006",
    isDemo: true,
  },
  {
    id: "prod-demo-08",
    name: "Panadol Extra 500mg (Box of 24)",
    sku: "PAN-EXT-24",
    category: "Healthcare",
    brand: "GSK",
    sellingPrice: 9600,
    costPrice: 7200,
    buyingPrice: 7200,
    stock: 40,
    reorderLevel: 10,
    status: "Active",
    barcode: "616110007007",
    hasVariants: true,
    isDemo: true,
    variants: [
      {
        id: "var-demo-08a",
        productId: "prod-demo-08",
        name: "Full Box (24 Tabs)",
        sku: "PAN-EXT-BOX",
        price: 9600,
        buyingPrice: 7200,
        stock: 25,
        reorderLevel: 5,
        isDemo: true,
      },
      {
        id: "var-demo-08b",
        productId: "prod-demo-08",
        name: "Blister Strip (8 Tabs)",
        sku: "PAN-EXT-STP",
        price: 3500,
        buyingPrice: 2500,
        stock: 15,
        reorderLevel: 5,
        isDemo: true,
      },
    ],
  },
];

// ─── Realistic Customers ─────────────────────────────────────────────────────
const SAMPLE_CUSTOMERS = [
  {
    id: "cust-demo-01",
    name: "Walk-In Customer",
    phone: "",
    email: "",
    type: "Customer",
    loyaltyPoints: 0,
    outstandingBalance: 0,
    creditLimit: 0,
    walletBalance: 0,
    isDemo: true,
  },
  {
    id: "cust-demo-02",
    name: "Juma Mkwawa (Retail VIP)",
    phone: "+255 754 123 789",
    email: "juma.mkwawa@example.com",
    type: "Customer",
    loyaltyPoints: 1250,
    outstandingBalance: 45000,
    creditLimit: 500000,
    walletBalance: 20000,
    isDemo: true,
  },
  {
    id: "cust-demo-03",
    name: "Mama Neema General Store",
    phone: "+255 784 987 321",
    email: "neema.store@gmail.com",
    type: "Wholesale",
    loyaltyPoints: 4800,
    outstandingBalance: 320000,
    creditLimit: 1500000,
    walletBalance: 0,
    isDemo: true,
  },
];

// ─── Realistic Suppliers ─────────────────────────────────────────────────────
const SAMPLE_SUPPLIERS = [
  {
    id: "sup-demo-01",
    name: "Bakhresa Food Products Ltd",
    category: "Grains & Bakery",
    tin: "104-982-114",
    vrn: "40019283H",
    phone: "+255 22 286 1122",
    balance: 850000,
    creditLimit: 10000000,
    status: "Active",
    isDemo: true,
  },
  {
    id: "sup-demo-02",
    name: "Coca-Cola Kwanza Ltd",
    category: "Beverages",
    tin: "109-443-221",
    vrn: "40099812A",
    phone: "+255 22 277 4411",
    balance: 0,
    creditLimit: 5000000,
    status: "Active",
    isDemo: true,
  },
];

// ─── Realistic Expenses ──────────────────────────────────────────────────────
const SAMPLE_EXPENSES = [
  {
    id: "exp-demo-01",
    category: "Utilities",
    description: "TANESCO Electricity — Counter & Chillers",
    amount: 350000,
    date: new Date().toISOString().split("T")[0],
    payee: "TANESCO Ltd",
    paymentMethod: "M-Pesa",
    paymentRef: "MP88392019",
    status: "PAID",
    taxDeductible: true,
    isDemo: true,
  },
  {
    id: "exp-demo-02",
    category: "Supplies & Packaging",
    description: "Thermal Printer Rolls 80mm (Box of 50)",
    amount: 110000,
    date: new Date().toISOString().split("T")[0],
    payee: "Stationery Point DSM",
    paymentMethod: "Cash",
    status: "PAID",
    taxDeductible: true,
    isDemo: true,
  },
  {
    id: "exp-demo-03",
    category: "Transport & Logistics",
    description: "Stock delivery transport van from warehouse",
    amount: 75000,
    date: new Date(Date.now() - 86400000).toISOString().split("T")[0],
    payee: "Transporter Rashid",
    paymentMethod: "Cash",
    status: "PAID",
    taxDeductible: false,
    isDemo: true,
  },
];

// ─── Realistic Recent Sales ──────────────────────────────────────────────────
const SAMPLE_SALES = [
  {
    id: "sale-demo-101",
    receiptNumber: `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-001`,
    grandTotal: 34500,
    totalAmount: 34500,
    subtotal: 29237,
    taxAmount: 5263,
    paymentMethod: "Cash",
    paidAmount: 40000,
    changeAmount: 5500,
    status: "Completed",
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    soldAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    customerName: "Walk-In Customer",
    cashierName: "Cashier",
    isDemo: true,
    items: [
      { productId: "prod-demo-01", name: "Azam Wheat Flour 2kg", price: 7500, quantity: 2, lineTotal: 15000 },
      { productId: "prod-demo-02", name: "Coca Cola 500ml Pet", price: 1500, quantity: 3, lineTotal: 4500 },
      { productId: "prod-demo-06", name: "Blue Band Margarine 500g", price: 5500, quantity: 1, lineTotal: 5500 },
      { productId: "prod-demo-08", name: "Panadol Extra 500mg", price: 9500, quantity: 1, lineTotal: 9500 },
    ],
  },
  {
    id: "sale-demo-102",
    receiptNumber: `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-002`,
    grandTotal: 45000,
    totalAmount: 45000,
    subtotal: 38136,
    taxAmount: 6864,
    paymentMethod: "M-Pesa",
    paidAmount: 45000,
    changeAmount: 0,
    status: "Completed",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    soldAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    customerName: "Juma Mkwawa (Retail VIP)",
    cashierName: "Cashier",
    isDemo: true,
    items: [
      { productId: "prod-demo-04", name: "Korie Refined Cooking Oil 5L", price: 42000, quantity: 1, lineTotal: 42000 },
      { productId: "prod-demo-03", name: "ASAS Fresh Cow Milk 1L", price: 3000, quantity: 1, lineTotal: 3000 },
    ],
  },
  {
    id: "sale-demo-103",
    receiptNumber: `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-003`,
    grandTotal: 18000,
    totalAmount: 18000,
    subtotal: 15254,
    taxAmount: 2746,
    paymentMethod: "Cash",
    paidAmount: 20000,
    changeAmount: 2000,
    status: "Completed",
    createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    soldAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    customerName: "Walk-In Customer",
    cashierName: "Cashier",
    isDemo: true,
    items: [
      { productId: "prod-demo-02", name: "Coca Cola 500ml Pet", price: 1500, quantity: 4, lineTotal: 6000 },
      { productId: "prod-demo-05", name: "Kilimanjaro Drinking Water 1.5L", price: 1200, quantity: 10, lineTotal: 12000 },
    ],
  },
];

// ─── Active Shift Configuration ──────────────────────────────────────────────
const SAMPLE_SHIFT = {
  id: "sft-demo-active",
  shiftNumber: `SFT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-01`,
  status: "OPEN",
  openedAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  openingFloat: 200000,
  terminalId: "POS-TERM-01",
  cashierName: "Cashier",
  isDemo: true,
  movements: [
    {
      id: "csh-demo-01",
      time: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString().slice(11, 16),
      type: "OPENING_FLOAT",
      amount: 200000,
      balance: 200000,
      reason: "Shift Opening Cash Float",
      user: "Cashier",
      terminal: "POS-TERM-01",
    },
    {
      id: "csh-demo-02",
      time: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString().slice(11, 16),
      type: "PETTY_CASH",
      amount: -25000,
      balance: 175000,
      reason: "Cleaning supplies & drinking water",
      user: "Cashier",
      terminal: "POS-TERM-01",
    },
  ],
};

// ─── Service Methods ─────────────────────────────────────────────────────────

export function isDemoModeActive(db?: LocalIndexedDbStore): boolean {
  try {
    if (typeof localStorage !== "undefined") {
      const active = localStorage.getItem(DEMO_MODE_STORAGE_KEY);
      if (active === "true") return true;
    }
    if (db) {
      const flag = db.getConfigurationLocal?.("demo_mode_active");
      if (flag === true || flag === "true") return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function loadSampleData(
  db: LocalIndexedDbStore,
  tenantId?: string,
): Promise<SampleDataSummary> {
  await db.ready;
  const ctx = tenantId ? { tenantId } : undefined;

  let productCount = 0;
  let variantCount = 0;

  // 1. Inject Products & Variants
  for (const p of SAMPLE_PRODUCTS) {
    const productRecord: any = {
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      sellingPrice: p.sellingPrice,
      costPrice: p.costPrice,
      buyingPrice: p.buyingPrice,
      stock: p.stock,
      totalStock: p.stock,
      availableStock: p.stock,
      reorderLevel: p.reorderLevel,
      status: p.status,
      barcode: p.barcode,
      expiryDate: (p as any).expiryDate,
      hasVariants: p.hasVariants || false,
      isDemo: true,
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.saveProductLocal(productRecord as any, ctx);
    productCount += 1;

    const sampleVariants = (p.variants && p.variants.length > 0)
      ? p.variants.map((v) => ({
          ...v,
          tenantId,
          status: "Active",
          inventoryQuantity: v.stock,
          price: v.price || p.sellingPrice,
          costPrice: (v as any).costPrice || v.buyingPrice,
        }))
      : [
          {
            id: `var-${p.id}`,
            productId: p.id,
            name: "Standard",
            sku: `${p.sku}-STD`,
            price: p.sellingPrice,
            costPrice: p.buyingPrice,
            stock: p.stock,
            inventoryQuantity: p.stock,
            reorderLevel: p.reorderLevel,
            tenantId,
            status: "Active",
            isActive: true,
          },
        ];

    for (const v of sampleVariants) {
      db.saveVariantLocal(v as any, ctx);
      variantCount += 1;
    }

    // Generate initial stock ledger entry for audit trail
    db.saveStockLedgerLocal(
      {
        id: `led-${p.id}`,
        productId: p.id,
        quantity: p.stock,
        balanceAfter: p.stock,
        reason: "DEMO_INITIAL_STOCK",
        movementType: "INITIAL_COUNT",
        timestamp: new Date().toISOString(),
        tenantId: tenantId || "demo-tenant",
      } as any,
      ctx,
    );

    // Enqueue Product to outbox for multi-device convergence
    db.enqueueOutbox({
      entityType: "Product",
      entityId: p.id,
      operationType: "CREATE",
      payload: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        brand: p.brand,
        buyingPrice: p.buyingPrice,
        sellingPrice: p.sellingPrice,
        hasVariants: Boolean(p.hasVariants),
        variants: sampleVariants.map((v) => ({
          id: v.id,
          productId: p.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          costPrice: v.costPrice,
          stock: v.stock,
          inventoryQuantity: v.inventoryQuantity,
          reorderLevel: v.reorderLevel,
          isActive: true,
        })),
      },
      idempotencyKey: `PROD-SAMPLE-${p.id}`,
      tenantId,
    });

    for (const v of sampleVariants) {
      db.enqueueOutbox({
        entityType: "ProductVariant",
        entityId: v.id,
        operationType: "CREATE",
        payload: {
          id: v.id,
          productId: p.id,
          name: v.name,
          sku: v.sku,
          price: v.price,
          costPrice: v.costPrice,
          stock: v.stock,
          inventoryQuantity: v.inventoryQuantity,
          reorderLevel: v.reorderLevel,
          isActive: true,
        },
        idempotencyKey: `VAR-SAMPLE-${v.id}`,
        tenantId,
      });

      if (Number(v.stock || v.inventoryQuantity || 0) > 0) {
        db.enqueueOutbox({
          entityType: "StockAdjustment",
          entityId: `adj-${v.id}`,
          operationType: "CREATE",
          payload: {
            productId: p.id,
            variantId: v.id,
            sku: v.sku,
            adjustmentType: "INCREASE",
            quantityChange: Number(v.stock || v.inventoryQuantity),
            reason: "DEMO_INITIAL_STOCK",
            deviceId: "web-client",
            operationId: `adj-${v.id}`,
            idempotencyKey: `ADJ-SAMPLE-${v.id}`,
          },
          idempotencyKey: `ADJ-SAMPLE-${v.id}`,
          tenantId,
        });
      }
    }
  }

  // 2. Inject Customers
  for (const c of SAMPLE_CUSTOMERS) {
    db.saveCustomerLocal({ ...c, tenantId } as any, ctx);
    db.enqueueOutbox({
      entityType: "Customer",
      entityId: c.id,
      operationType: "CREATE",
      payload: c,
      idempotencyKey: `CUST-SAMPLE-${c.id}`,
      tenantId,
    });
  }

  // 3. Inject Suppliers
  for (const s of SAMPLE_SUPPLIERS) {
    db.saveSupplierLocal({ ...s, tenantId } as any, ctx);
    db.enqueueOutbox({
      entityType: "Supplier",
      entityId: s.id,
      operationType: "CREATE",
      payload: s,
      idempotencyKey: `SUPP-SAMPLE-${s.id}`,
      tenantId,
    });
  }

  // 4. Inject Sales
  for (const sale of SAMPLE_SALES) {
    db.saveSaleLocal({ ...sale, tenantId } as any, ctx);
    db.enqueueOutbox({
      entityType: "Sale",
      entityId: sale.id,
      operationType: "CREATE",
      payload: {
        id: sale.id,
        items: (sale.items || []).map((i: any) => ({
          productId: i.productId,
          variantId: i.variantId || `var-${i.productId}`,
          quantity: i.quantity,
          unitPrice: i.price || i.unitPrice,
        })),
        paymentMethod: sale.paymentMethod || "CASH",
        cashReceived: (sale as any).total ?? (sale as any).grandTotal ?? (sale as any).totalAmount ?? 0,
        amountPaid: (sale as any).total ?? (sale as any).grandTotal ?? (sale as any).totalAmount ?? 0,
        total: (sale as any).total ?? (sale as any).grandTotal ?? (sale as any).totalAmount ?? 0,
        totalAmount: (sale as any).total ?? (sale as any).grandTotal ?? (sale as any).totalAmount ?? 0,
        idempotencyKey: `SALE-SAMPLE-${sale.id}`,
      },
      idempotencyKey: `SALE-SAMPLE-${sale.id}`,
      tenantId,
    });
  }

  // 5. Inject Expenses
  db.saveConfigurationLocal("demo_expenses", SAMPLE_EXPENSES, ctx);

  // 6. Inject Active Shift
  db.saveConfigurationLocal("active_shift_session", SAMPLE_SHIFT, ctx);

  // Mark Demo Mode active
  db.saveConfigurationLocal("demo_mode_active", true, ctx);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
  }

  // Notify active pages
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "LOADED" } }));
  }

  return {
    products: productCount,
    variants: variantCount,
    customers: SAMPLE_CUSTOMERS.length,
    suppliers: SAMPLE_SUPPLIERS.length,
    sales: SAMPLE_SALES.length,
    expenses: SAMPLE_EXPENSES.length,
  };
}

/**
 * Automatically reconciles existing local products/variants in IndexedDB to the sync outbox
 * so that items previously created or loaded on one terminal immediately converge to all other terminals.
 */
export function reconcileLocalInventoryToOutbox(
  db: LocalIndexedDbStore,
  tenantId?: string,
  branchId?: string,
): number {
  if (!db || !db.products) return 0;
  let reconciled = 0;

  // 1. Check existing outbox to see which product IDs are already tracked
  const trackedProductIds = new Set<string>();
  const syncOutboxMap = (db as any).syncOutbox as Map<string, any> | undefined;
  if (syncOutboxMap) {
    for (const item of syncOutboxMap.values()) {
      if (item.entityType === "Product" && item.entityId) {
        trackedProductIds.add(item.entityId);
      }
    }
  }

  // 2. For any product in db.products not in outbox, enqueue it
  for (const [prodId, prod] of db.products.entries()) {
    const pAny = prod as any;
    if (pAny.deletedAt || pAny.deleted_at || pAny.status === "Inactive") continue;
    if (!trackedProductIds.has(prodId)) {
      // Find variants for this product
      const variants: any[] = [];
      if (db.productVariants) {
        for (const v of db.productVariants.values()) {
          const vAny = v as any;
          if (vAny.productId === prodId) {
            variants.push(vAny);
          }
        }
      }

      const defaultVarId = variants.length > 0 ? variants[0].id : `${prodId}-default`;
      const effectiveVariants = variants.length > 0 ? variants : [
        {
          id: defaultVarId,
          productId: prodId,
          name: "Standard",
          sku: `${pAny.sku || prodId}-STD`,
          price: Number(pAny.sellingPrice || 0),
          costPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
          stock: Number(pAny.stock || pAny.availableStock || pAny.totalStock || 0),
          inventoryQuantity: Number(pAny.stock || pAny.availableStock || pAny.totalStock || 0),
          isActive: true,
        },
      ];

      if (variants.length === 0) {
        db.saveVariantLocal(effectiveVariants[0], tenantId ? { tenantId } : undefined);
      }

      db.enqueueOutbox({
        entityType: "Product",
        entityId: prodId,
        operationType: "CREATE",
        payload: {
          id: prodId,
          name: pAny.name,
          sku: pAny.sku || `SKU-${prodId.slice(0, 6).toUpperCase()}`,
          category: pAny.category || "General",
          brand: pAny.brand || "General",
          buyingPrice: Number(pAny.buyingPrice || pAny.costPrice || 0),
          sellingPrice: Number(pAny.sellingPrice || 0),
          hasVariants: effectiveVariants.length > 1,
          variants: effectiveVariants,
        },
        idempotencyKey: `PROD-RECON-${prodId}`,
        tenantId: tenantId || pAny.tenantId || undefined,
        branchId: branchId || pAny.branchId || undefined,
      });

      for (const v of effectiveVariants) {
        db.enqueueOutbox({
          entityType: "ProductVariant",
          entityId: v.id,
          operationType: "CREATE",
          payload: v,
          idempotencyKey: `VAR-RECON-${v.id}`,
          tenantId: tenantId || pAny.tenantId || undefined,
          branchId: branchId || pAny.branchId || undefined,
        });

        const vStock = Number(v.stock ?? v.inventoryQuantity ?? pAny.stock ?? 0);
        if (vStock > 0) {
          db.enqueueOutbox({
            entityType: "StockAdjustment",
            entityId: `adj-${v.id}`,
            operationType: "CREATE",
            payload: {
              productId: prodId,
              variantId: v.id,
              sku: v.sku,
              adjustmentType: "INCREASE",
              quantityChange: vStock,
              reason: "LOCAL_INVENTORY_RECONCILIATION",
              deviceId: "web-client",
              operationId: `adj-${v.id}`,
              idempotencyKey: `ADJ-RECON-${v.id}`,
            },
            idempotencyKey: `ADJ-RECON-${v.id}`,
            tenantId: tenantId || pAny.tenantId || undefined,
            branchId: branchId || pAny.branchId || undefined,
          });
        }
      }
      reconciled += 1;
    }
  }

  // 3. Retry any failed outbox items
  if (typeof (db as any).getFailedOutbox === "function" && typeof (db as any).retryOutbox === "function") {
    const failed = (db as any).getFailedOutbox(tenantId);
    for (const item of failed) {
      (db as any).retryOutbox(item.id);
    }
  }

  return reconciled;
}

export async function purgeSampleData(
  db: LocalIndexedDbStore,
  tenantId?: string,
): Promise<void> {
  await db.ready;
  const ctx = tenantId ? { tenantId } : undefined;

  // 1. Remove demo products
  for (const [id, prod] of Array.from(db.products.entries())) {
    if ((prod as any).isDemo || id.startsWith("prod-demo-")) {
      db.products.delete(id);
      (db as any).persist?.("products", id, null);
    }
  }

  // 2. Remove demo variants
  for (const [id, variant] of Array.from(db.productVariants.entries())) {
    if ((variant as any).isDemo || id.startsWith("var-demo-")) {
      db.productVariants.delete(id);
      (db as any).persist?.("productVariants", id, null);
    }
  }

  // 3. Remove demo ledger
  for (const [id, led] of Array.from(db.stockLedger.entries())) {
    if ((led as any).isDemo || id.startsWith("led-prod-demo-")) {
      db.stockLedger.delete(id);
      (db as any).persist?.("stockLedger", id, null);
    }
  }

  // 4. Remove demo customers
  for (const [id, cust] of Array.from(db.customers.entries())) {
    if ((cust as any).isDemo || id.startsWith("cust-demo-")) {
      db.customers.delete(id);
      (db as any).persist?.("customers", id, null);
    }
  }

  // 5. Remove demo suppliers
  for (const [id, sup] of Array.from(db.suppliers.entries())) {
    if ((sup as any).isDemo || id.startsWith("sup-demo-")) {
      db.suppliers.delete(id);
      (db as any).persist?.("suppliers", id, null);
    }
  }

  // 6. Remove demo sales
  for (const [id, sale] of Array.from(db.sales.entries())) {
    if ((sale as any).isDemo || id.startsWith("sale-demo-")) {
      db.sales.delete(id);
      (db as any).persist?.("sales", id, null);
    }
  }

  // 7. Clear shift, expenses, and procurement configuration
  db.saveConfigurationLocal("demo_expenses", [], ctx);
  db.saveConfigurationLocal("active_shift_session", null, ctx);
  db.saveConfigurationLocal("demo_mode_active", false, ctx);
  db.saveConfigurationLocal("procurement_suppliers", [], ctx);
  db.saveConfigurationLocal("procurement_purchase_orders", [], ctx);
  db.saveConfigurationLocal("procurement_grns", [], ctx);

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
  }

  // Notify active pages
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DEMO_DATA_EVENT, { detail: { action: "PURGED" } }));
  }
}
