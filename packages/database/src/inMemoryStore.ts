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
  legalDocuments: Map<string, any> = new Map();
  legalDocumentVersions: Map<string, any> = new Map();
  legalAcceptances: Map<string, any> = new Map();
  dataSubjectRequests: Map<string, any> = new Map();
  dataExportJobs: Map<string, any> = new Map();
  legalHolds: Map<string, any> = new Map();
  retentionPolicies: Map<string, any> = new Map();
  retentionExecutions: Map<string, any> = new Map();
  securityPrivacyIncidents: Map<string, any> = new Map();
  subprocessors: Map<string, any> = new Map();
  ossLicenseNotices: Map<string, any> = new Map();
  tenantLegalDocuments: Map<string, any> = new Map();
  rollbackRequests: Map<string, any> = new Map();
  rollbackApprovals: Map<string, any> = new Map();
  rollbackRecoveryPoints: Map<string, any> = new Map();
  rollbackLocks: Map<string, any> = new Map();
  rollbackAuditEvents: Map<string, any> = new Map();
  rollbackSyncBarriers: Map<string, any> = new Map();
  rollbackIncidents: Map<string, any> = new Map();
  syncEpochs: Map<string, number> = new Map();

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
    this.legalDocuments.clear();
    this.legalDocumentVersions.clear();
    this.legalAcceptances.clear();
    this.dataSubjectRequests.clear();
    this.dataExportJobs.clear();
    this.legalHolds.clear();
    this.retentionPolicies.clear();
    this.retentionExecutions.clear();
    this.securityPrivacyIncidents.clear();
    this.subprocessors.clear();
    this.ossLicenseNotices.clear();
    this.tenantLegalDocuments.clear();
    this.rollbackRequests.clear();
    this.rollbackApprovals.clear();
    this.rollbackRecoveryPoints.clear();
    this.rollbackLocks.clear();
    this.rollbackAuditEvents.clear();
    this.rollbackSyncBarriers.clear();
    this.rollbackIncidents.clear();
    this.syncEpochs.clear();
  }
}

export const globalInMemoryStore = new InMemoryStore();
