import { randomUUID } from "crypto";
import type {
  TenantContext,
  HardwareModuleManifest,
  HardwareSettings,
  HardwareProduct,
  HardwareProjectRequirement,
  HardwareAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalHardwareOperatingEngine,
  HardwareOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class HardwareService {
  private engine: HardwareOperatingEngine;
  private store: InMemoryStore;

  private productMap: Map<string, HardwareProduct> = new Map();
  private projectMap: Map<string, HardwareProjectRequirement> = new Map();

  constructor(engine?: HardwareOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalHardwareOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): HardwareModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): HardwareSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  createProduct(
    ctx: TenantContext,
    productData: Omit<HardwareProduct, "id" | "tenantId" | "branchId" | "sku">
  ): HardwareProduct {
    const id = randomUUID();
    const sku = `HW-${Math.floor(10000 + Math.random() * 90000)}`;
    const product: HardwareProduct = {
      ...productData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sku,
    };

    const marginCheck = this.engine.calculateMarginPct(product.costPriceTzs, product.retailPriceTzs);
    if (!marginCheck.meetsMinimumThreshold) {
      console.warn(`[HARDWARE_SERVICE_WARN] Product '${product.name}' retail margin ${marginCheck.marginPct}% is below 10% policy threshold.`);
    }

    this.productMap.set(id, product);
    return product;
  }

  getProducts(ctx: TenantContext): HardwareProduct[] {
    return Array.from(this.productMap.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.branchId === ctx.branchId
    );
  }

  createProjectRequirement(
    ctx: TenantContext,
    projectData: Omit<HardwareProjectRequirement, "id" | "tenantId" | "branchId" | "actualSpendTzs" | "status">
  ): HardwareProjectRequirement {
    const id = randomUUID();
    const project: HardwareProjectRequirement = {
      ...projectData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      actualSpendTzs: 0,
      status: "QUOTED",
    };
    this.projectMap.set(id, project);
    return project;
  }

  getProjects(ctx: TenantContext): HardwareProjectRequirement[] {
    return Array.from(this.projectMap.values()).filter(
      (p) => p.tenantId === ctx.tenantId && p.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): HardwareAiRecommendation[] {
    const products = this.getProducts(ctx);
    const projects = this.getProjects(ctx);
    return this.engine.generateExplainableAiRecommendations(ctx, products, projects);
  }
}

export const globalHardwareService = new HardwareService();
