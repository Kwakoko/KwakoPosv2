import type {
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  ProductBranchStock,
  ProductPriceHistory,
  SyncOperation,
  Plan,
  Subscription,
  MeterEvent,
  BillingInvoice,
  BillingPayment,
  Coupon,
} from '@kwakopos2/contracts';

export class InMemoryStore {
  tenants: Map<string, any> = new Map();
  branches: Map<string, any> = new Map();
  users: Map<string, any> = new Map();
  roles: Map<string, any> = new Map();
  products: Map<string, Product> = new Map();
  variants: Map<string, ProductVariant> = new Map();
  stockLedgers: Map<string, StockLedger> = new Map();
  stockAdjustments: Map<string, StockAdjustment> = new Map();
  productBranchStock: Map<string, ProductBranchStock> = new Map();
  productPriceHistories: Map<string, ProductPriceHistory> = new Map();
  syncOperations: Map<string, SyncOperation> = new Map();
  auditEvents: Map<string, any> = new Map();
  plans: Map<string, Plan> = new Map();
  subscriptions: Map<string, Subscription> = new Map();
  meterEvents: Map<string, MeterEvent> = new Map();
  billingInvoices: Map<string, BillingInvoice> = new Map();
  billingPayments: Map<string, BillingPayment> = new Map();
  coupons: Map<string, Coupon> = new Map();
  pluginCustomEntities: Map<string, any> = new Map();

  clear() {
    this.tenants.clear();
    this.branches.clear();
    this.users.clear();
    this.roles.clear();
    this.products.clear();
    this.variants.clear();
    this.stockLedgers.clear();
    this.stockAdjustments.clear();
    this.productBranchStock.clear();
    this.syncOperations.clear();
    this.auditEvents.clear();
    this.plans.clear();
    this.subscriptions.clear();
    this.meterEvents.clear();
    this.billingInvoices.clear();
    this.billingPayments.clear();
    this.coupons.clear();
    this.pluginCustomEntities.clear();
  }
}
