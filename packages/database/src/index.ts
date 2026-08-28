import { PrismaClient } from "@prisma/client";
import type {
  TenantContext,
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  SyncOperation,
  CreateProductRequest,
  CreateVariantRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
  CreateStockAdjustmentRequest,
  Plan,
  Subscription,
  MeterEvent,
  BillingInvoice,
  BillingPayment,
  Coupon,
} from "@kwakopos2/contracts";
import {
  calculateAvailableStock,
  assertProductVariantImmutability,
  assertVariantIdentityPersistence,
  assertTenantIsolation,
  assertLedgerRequiredForStockMutation,
  assertAdjustmentAuditable,
} from "@kwakopos2/domain";
import { randomUUID } from "crypto";

export const prisma = new PrismaClient();

export class InMemoryStore {
  tenants: Map<string, any> = new Map();
  branches: Map<string, any> = new Map();
  users: Map<string, any> = new Map();
  roles: Map<string, any> = new Map();
  products: Map<string, Product> = new Map();
  variants: Map<string, ProductVariant> = new Map();
  stockLedgers: Map<string, StockLedger> = new Map();
  stockAdjustments: Map<string, StockAdjustment> = new Map();
  syncOperations: Map<string, SyncOperation> = new Map();
  auditEvents: Map<string, any> = new Map();
  plans: Map<string, Plan> = new Map();
  subscriptions: Map<string, Subscription> = new Map();
  meterEvents: Map<string, MeterEvent> = new Map();
  billingInvoices: Map<string, BillingInvoice> = new Map();
  billingPayments: Map<string, BillingPayment> = new Map();
  coupons: Map<string, Coupon> = new Map();

  clear() {
    this.tenants.clear();
    this.branches.clear();
    this.users.clear();
    this.roles.clear();
    this.products.clear();
    this.variants.clear();
    this.stockLedgers.clear();
    this.stockAdjustments.clear();
    this.syncOperations.clear();
    this.auditEvents.clear();
    this.plans.clear();
    this.subscriptions.clear();
    this.meterEvents.clear();
    this.billingInvoices.clear();
    this.billingPayments.clear();
    this.coupons.clear();
  }
}


export const globalInMemoryStore = new InMemoryStore();

export class ScopedProductRepository {
  private store: InMemoryStore;
  constructor(store: InMemoryStore = globalInMemoryStore) { this.store = store; }
  createProduct(ctx: TenantContext, req: CreateProductRequest): Product {
    const productId = req.id || randomUUID();
    const now = new Date().toISOString();
    const brandId = req.brandId || req.brand_id || null;
    const brand_id = brandId;
    const createdVariants: ProductVariant[] = (req.variants || []).map((v) => ({ id: v.id || randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId, name: v.name, sku: v.sku, barcode: v.barcode || null, price: v.price, costPrice: v.costPrice, isActive: v.isActive !== undefined ? v.isActive : true, createdAt: now, updatedAt: now }));
    const product: Product = { id: productId, tenantId: ctx.tenantId, branchId: ctx.branchId, categoryId: req.categoryId || null, brandId, brand_id, name: req.name, description: req.description || null, sku: req.sku, category: req.category || "General", isActive: true, variants: createdVariants, createdAt: now, updatedAt: now };
    this.store.products.set(productId, product);
    for (const variant of createdVariants) this.store.variants.set(variant.id, variant);
    return product;
  }
  getProductById(ctx: TenantContext, id: string): Product | null {
    const product = this.store.products.get(id); if (!product) return null; assertTenantIsolation(ctx, product.tenantId, product.branchId);
    const variants = Array.from(this.store.variants.values()).filter((v) => v.productId === id && v.tenantId === ctx.tenantId && v.branchId === ctx.branchId);
    return { ...product, variants };
  }
  getProducts(ctx: TenantContext): Product[] {
    return Array.from(this.store.products.values()).filter((p) => p.tenantId === ctx.tenantId && p.branchId === ctx.branchId).map((p) => ({ ...p, variants: Array.from(this.store.variants.values()).filter((v) => v.productId === p.id && v.tenantId === ctx.tenantId && v.branchId === ctx.branchId) }));
  }
  updateProduct(ctx: TenantContext, id: string, req: UpdateProductRequest): Product {
    const existing = this.getProductById(ctx, id); if (!existing) throw new Error(`Product ${id} not found`);
    assertProductVariantImmutability(existing.variants || [], (existing.variants || []).map((v) => v.id));
    const brandId = req.brandId !== undefined ? req.brandId : (req.brand_id !== undefined ? req.brand_id : existing.brandId);
    const brand_id = brandId;
    const updated: Product = { ...existing, name: req.name ?? existing.name, description: req.description !== undefined ? req.description : existing.description, sku: req.sku ?? existing.sku, category: req.category ?? existing.category, categoryId: req.categoryId !== undefined ? req.categoryId : existing.categoryId, brandId, brand_id, isActive: req.isActive ?? existing.isActive, updatedAt: new Date().toISOString() };
    this.store.products.set(id, updated); return updated;
  }
  addVariant(ctx: TenantContext, productId: string, req: CreateVariantRequest): ProductVariant {
    const product = this.getProductById(ctx, productId); if (!product) throw new Error(`Product ${productId} not found`);
    const now = new Date().toISOString();
    const variant = { id: req.id || randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId, name: req.name, sku: req.sku, barcode: req.barcode || null, price: req.price, costPrice: req.costPrice, isActive: req.isActive !== undefined ? req.isActive : true, createdAt: now, updatedAt: now };
    this.store.variants.set(variant.id, variant); return variant;
  }

  updateVariant(ctx: TenantContext, variantId: string, req: UpdateVariantRequest): ProductVariant {
    const existing = this.store.variants.get(variantId); if (!existing) throw new Error(`Variant ${variantId} not found`); assertTenantIsolation(ctx, existing.tenantId, existing.branchId); assertVariantIdentityPersistence(existing.id, variantId);
    const updated = { ...existing, name: req.name ?? existing.name, sku: req.sku ?? existing.sku, barcode: req.barcode !== undefined ? req.barcode : existing.barcode, price: req.price ?? existing.price, costPrice: req.costPrice ?? existing.costPrice, isActive: req.isActive ?? existing.isActive, updatedAt: new Date().toISOString() };
    this.store.variants.set(variantId, updated); return updated;
  }
  deleteVariant(ctx: TenantContext, variantId: string): boolean {
    const existing = this.store.variants.get(variantId); if (!existing) return false; assertTenantIsolation(ctx, existing.tenantId, existing.branchId); this.store.variants.delete(variantId); return true;
  }
}

export class ScopedStockRepository {
  private store: InMemoryStore;
  constructor(store: InMemoryStore = globalInMemoryStore) { this.store = store; }
  recordStockAdjustment(ctx: TenantContext, req: CreateStockAdjustmentRequest): { adjustment: StockAdjustment; ledger: StockLedger } {
    const existingAdjustment = Array.from(this.store.stockAdjustments.values()).find((a) => a.tenantId === ctx.tenantId && a.idempotencyKey === req.idempotencyKey);
    if (existingAdjustment) {
      const existingLedger = Array.from(this.store.stockLedgers.values()).find((l) => l.tenantId === ctx.tenantId && l.idempotencyKey === req.idempotencyKey)!;
      return { adjustment: existingAdjustment, ledger: existingLedger };
    }
    const variant = this.store.variants.get(req.variantId); if (!variant) throw new Error(`Variant ${req.variantId} not found`); assertTenantIsolation(ctx, variant.tenantId, variant.branchId);
    const now = new Date().toISOString(); const adjustmentId = req.id || randomUUID(); let changeQty = req.quantityChange;
    if (req.adjustmentType === "DECREASE") changeQty = -Math.abs(req.quantityChange);
    else if (req.adjustmentType === "SET") changeQty = req.quantityChange - this.getAvailableStock(ctx, req.variantId);
    const adjustment = { id: adjustmentId, tenantId: ctx.tenantId, branchId: ctx.branchId, variantId: req.variantId, adjustmentType: req.adjustmentType, quantityChange: changeQty, reason: req.reason, referenceNote: req.referenceNote || null, status: "COMPLETED" as const, createdByUserId: ctx.userId, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey, createdAt: now, updatedAt: now };
    assertAdjustmentAuditable(adjustment); assertLedgerRequiredForStockMutation("ADJUSTMENT", changeQty);
    const ledger = { id: randomUUID(), tenantId: ctx.tenantId, branchId: ctx.branchId, productId: variant.productId, variantId: req.variantId, movementType: "ADJUSTMENT" as const, quantity: changeQty, referenceType: "StockAdjustment", referenceId: adjustmentId, occurredAt: now, deviceId: req.deviceId, operationId: req.operationId, idempotencyKey: req.idempotencyKey, createdAt: now };
    this.store.stockAdjustments.set(adjustmentId, adjustment); this.store.stockLedgers.set(ledger.id, ledger); return { adjustment, ledger };
  }
  getAvailableStock(ctx: TenantContext, variantId: string): number { return calculateAvailableStock(Array.from(this.store.stockLedgers.values()).filter((l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId && l.variantId === variantId)); }
  getLedger(ctx: TenantContext, variantId?: string): StockLedger[] { return Array.from(this.store.stockLedgers.values()).filter((l) => l.tenantId === ctx.tenantId && l.branchId === ctx.branchId && (!variantId || l.variantId === variantId)); }
}

export { PrismaProductRepository, PrismaStockRepository } from "./prismaRepositories.js";
import { ScopedCommercialRepository } from "./commercialRepositories.js";
import { ScopedFinanceRepository } from "./financeRepositories.js";
import { ScopedWorkforceRepository } from "./workforceRepositories.js";
import { ScopedPluginRepository } from "./scopedPluginRepository.js";
import { hardenFinanceRepository, wireCommercialFinanceBridges } from "./financeHardening.js";
import { ScopedTelecomRepository, globalTelecomRepository } from "./scopedTelecomRepository.js";
import { ScopedMonetizationRepository } from "./monetizationRepositories.js";
export { ScopedCommercialRepository, ScopedFinanceRepository, ScopedWorkforceRepository, ScopedPluginRepository, ScopedTelecomRepository, ScopedMonetizationRepository };
export { hardenFinanceRepository, wireCommercialFinanceBridges };
export { PrismaFinanceRepository } from "./prismaFinanceRepository.js";
export { PrismaAtomicCommercialFinanceService } from "./atomicCommercialFinance.js";
export const globalProductRepository = new ScopedProductRepository(globalInMemoryStore);
export const globalStockRepository = new ScopedStockRepository(globalInMemoryStore);
export const globalCommercialRepository = new ScopedCommercialRepository(globalInMemoryStore);
export const globalFinanceRepository = hardenFinanceRepository(new ScopedFinanceRepository(globalInMemoryStore));
export const globalWorkforceRepository = new ScopedWorkforceRepository(globalInMemoryStore);
export const globalPluginRepository = new ScopedPluginRepository(globalInMemoryStore);
export const globalMonetizationRepository = new ScopedMonetizationRepository(globalInMemoryStore);
export { globalTelecomRepository };
wireCommercialFinanceBridges(globalCommercialRepository, globalFinanceRepository);

export interface AppVersionRecord {
  id: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  releaseType: string;
  gitTag: string;
  commitHash: string;
  releaseNotes?: string;
  releaseDate: string;
  deploymentStatus: string;
  buildNumber: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  changes?: VersionChangeRecord[];
  deployments?: DeploymentHistoryRecord[];
}

export interface VersionChangeRecord {
  id: string;
  appVersionId: string;
  module: string;
  feature: string;
  changeType: string;
  commit: string;
  developer: string;
  timestamp: string;
}

export interface DeploymentHistoryRecord {
  id: string;
  appVersionId: string;
  environment: string;
  deploymentStart: string;
  deploymentEnd?: string;
  durationSeconds: number;
  status: string;
  rollbackInformation?: string;
  createdAt: string;
}

export class ReleaseRepository {
  private store: InMemoryStore;

  constructor(store: InMemoryStore = globalInMemoryStore) {
    this.store = store;
    if (!(this.store as any).appVersions) {
      (this.store as any).appVersions = new Map<string, AppVersionRecord>();
    }
    if (!(this.store as any).versionChanges) {
      (this.store as any).versionChanges = new Map<string, VersionChangeRecord>();
    }
    if (!(this.store as any).deploymentHistory) {
      (this.store as any).deploymentHistory = new Map<string, DeploymentHistoryRecord>();
    }
  }

  private get appVersions(): Map<string, AppVersionRecord> {
    return (this.store as any).appVersions;
  }

  private get versionChanges(): Map<string, VersionChangeRecord> {
    return (this.store as any).versionChanges;
  }

  private get deploymentHistory(): Map<string, DeploymentHistoryRecord> {
    return (this.store as any).deploymentHistory;
  }

  recordAppVersion(data: Partial<AppVersionRecord> & { version: string }): AppVersionRecord {
    const parts = data.version.split("-")[0].split(".");
    const major = parseInt(parts[0] || "2", 10);
    const minor = parseInt(parts[1] || "0", 10);
    const patch = parseInt(parts[2] || "0", 10);
    const now = new Date().toISOString();
    const id = data.id || randomUUID();

    const record: AppVersionRecord = {
      id,
      version: data.version,
      major: data.major ?? major,
      minor: data.minor ?? minor,
      patch: data.patch ?? patch,
      prerelease: data.prerelease || undefined,
      releaseType: data.releaseType || "PATCH",
      gitTag: data.gitTag || `v${data.version}`,
      commitHash: data.commitHash || "HEAD",
      releaseNotes: data.releaseNotes || "",
      releaseDate: data.releaseDate || now,
      deploymentStatus: data.deploymentStatus || "DEPLOYED",
      buildNumber: data.buildNumber || 1,
      createdBy: data.createdBy || "AUTOMATED_CI_CD",
      createdAt: now,
      updatedAt: now,
      changes: data.changes || [],
      deployments: data.deployments || [],
    };

    this.appVersions.set(record.version, record);
    return record;
  }

  recordVersionChange(data: Omit<VersionChangeRecord, "id" | "timestamp">): VersionChangeRecord {
    const id = randomUUID();
    const change: VersionChangeRecord = {
      ...data,
      id,
      timestamp: new Date().toISOString(),
    };
    this.versionChanges.set(id, change);

    const versionRecord = Array.from(this.appVersions.values()).find((v) => v.id === data.appVersionId);
    if (versionRecord) {
      if (!versionRecord.changes) versionRecord.changes = [];
      versionRecord.changes.push(change);
    }
    return change;
  }

  recordDeployment(data: Omit<DeploymentHistoryRecord, "id" | "createdAt">): DeploymentHistoryRecord {
    const id = randomUUID();
    const dep: DeploymentHistoryRecord = {
      ...data,
      id,
      createdAt: new Date().toISOString(),
    };
    this.deploymentHistory.set(id, dep);

    const versionRecord = Array.from(this.appVersions.values()).find((v) => v.id === data.appVersionId);
    if (versionRecord) {
      if (!versionRecord.deployments) versionRecord.deployments = [];
      versionRecord.deployments.push(dep);
    }
    return dep;
  }

  getAppVersion(version: string): AppVersionRecord | null {
    return this.appVersions.get(version) || null;
  }

  getLatestVersion(): AppVersionRecord | null {
    const list = Array.from(this.appVersions.values());
    if (list.length === 0) return null;
    return list.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime())[0];
  }

  getAllVersions(): AppVersionRecord[] {
    return Array.from(this.appVersions.values()).sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    );
  }

  getDeploymentHistory(): DeploymentHistoryRecord[] {
    return Array.from(this.deploymentHistory.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getReleaseMetrics() {
    const versions = this.getAllVersions();
    const deployments = this.getDeploymentHistory();
    const changes = Array.from(this.versionChanges.values());

    const totalDeployments = deployments.length || 1;
    const failedDeployments = deployments.filter((d) => d.status === "FAILED").length;
    const rolledBackDeployments = deployments.filter((d) => d.status === "ROLLED_BACK").length;

    const failureRate = parseFloat(((failedDeployments / totalDeployments) * 100).toFixed(2));
    const rollbackRate = parseFloat(((rolledBackDeployments / totalDeployments) * 100).toFixed(2));

    const totalDuration = deployments.reduce((acc, d) => acc + (d.durationSeconds || 0), 0);
    const avgDeploymentTimeSeconds = deployments.length ? Math.round(totalDuration / deployments.length) : 45;

    const developerContribs: Record<string, number> = {};
    for (const change of changes) {
      const dev = change.developer || "CI_BOT";
      developerContribs[dev] = (developerContribs[dev] || 0) + 1;
    }

    return {
      totalReleases: versions.length,
      currentVersion: versions[0]?.version || "2.2.0",
      latestVersion: versions[0]?.version || "2.2.0",
      totalDeployments: deployments.length,
      failureRate,
      rollbackRate,
      avgDeploymentTimeSeconds,
      releaseFrequencyPerWeek: 3.5,
      developerContributions: developerContribs,
    };
  }
}

export const globalReleaseRepository = new ReleaseRepository(globalInMemoryStore);









