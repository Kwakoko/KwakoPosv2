import type {
  TenantContext,
  PluginManifest,
  TenantPluginActivation,
  BranchPluginActivation,
  PluginConfigurationEntry,
  PluginEvent,
  PluginUsageRecord,
  RestaurantTable,
  KitchenTicket,
  GarageVehicle,
  GarageWorkOrder,
  PharmacyPrescription,
  ConstructionProject,
  TelecomSite,
  WholesaleProductTierRule,
} from "@kwakopos2/contracts";
import {
  assertPluginTenantBoundary,
  assertPluginMutationIdempotency,
} from "@kwakopos2/domain";
import { randomUUID } from "crypto";
import type { InMemoryStore } from "./index.js";


export class ScopedPluginRepository {
  public pluginActivations = new Map<string, TenantPluginActivation>();
  public branchConfigs = new Map<string, BranchPluginActivation>();
  public configEntries = new Map<string, PluginConfigurationEntry>();
  public pluginEvents = new Map<string, PluginEvent>();
  public usageRecords = new Map<string, PluginUsageRecord>();
  public restaurantTables = new Map<string, RestaurantTable>();
  public kitchenTickets = new Map<string, KitchenTicket>();
  public garageVehicles = new Map<string, GarageVehicle>();
  public garageWorkOrders = new Map<string, GarageWorkOrder>();
  public pharmacyPrescriptions = new Map<string, PharmacyPrescription>();
  public constructionProjects = new Map<string, ConstructionProject>();
  public telecomSites = new Map<string, TelecomSite>();
  public wholesaleTierRules = new Map<string, WholesaleProductTierRule>();
  public processedIdempotencyKeys = new Set<string>();

  constructor(public store?: InMemoryStore) {}

  // -------------------------------------------------------------------------
  // Tenant Plugin Activation
  // -------------------------------------------------------------------------
  activatePlugin(
    ctx: TenantContext,
    pluginId: string,
    pluginVersion: string,
    initialConfig: Record<string, unknown> = {}
  ): TenantPluginActivation {
    const key = `${ctx.tenantId}:${pluginId}`;
    const now = new Date().toISOString();
    const existing = this.pluginActivations.get(key);

    if (existing) {
      existing.state = "ACTIVE";
      existing.enabledAt = now;
      existing.disabledAt = null;
      existing.configuration = { ...existing.configuration, ...initialConfig };
      existing.updatedAt = now;
      return existing;
    }

    const activation: TenantPluginActivation = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      pluginId,
      pluginVersion,
      state: "ACTIVE",
      enabledAt: now,
      installedAt: now,
      disabledAt: null,
      configuration: initialConfig,
      createdAt: now,
      updatedAt: now,
    };
    this.pluginActivations.set(key, activation);
    return activation;
  }

  deactivatePlugin(ctx: TenantContext, pluginId: string): TenantPluginActivation {
    const key = `${ctx.tenantId}:${pluginId}`;
    const activation = this.pluginActivations.get(key);
    if (!activation) throw new Error(`Plugin ${pluginId} is not active for tenant`);
    assertPluginTenantBoundary(ctx, activation);

    activation.state = "DISABLED";
    activation.disabledAt = new Date().toISOString();
    activation.updatedAt = new Date().toISOString();
    return activation;
  }

  getTenantActivations(ctx: TenantContext): TenantPluginActivation[] {
    return Array.from(this.pluginActivations.values()).filter(
      (a) => a.tenantId === ctx.tenantId && a.state === "ACTIVE"
    );
  }

  isPluginActive(ctx: TenantContext, pluginId: string): boolean {
    const key = `${ctx.tenantId}:${pluginId}`;
    const a = this.pluginActivations.get(key);
    return a?.state === "ACTIVE";
  }

  // -------------------------------------------------------------------------
  // Branch Activation & Config
  // -------------------------------------------------------------------------
  setBranchPluginConfig(
    ctx: TenantContext,
    branchId: string,
    pluginId: string,
    isEnabled: boolean,
    config: Record<string, unknown> = {}
  ): BranchPluginActivation {
    const key = `${ctx.tenantId}:${branchId}:${pluginId}`;
    const now = new Date().toISOString();
    const existing = this.branchConfigs.get(key);

    if (existing) {
      existing.isEnabled = isEnabled;
      existing.configuration = { ...existing.configuration, ...config };
      existing.updatedAt = now;
      return existing;
    }

    const branchActivation: BranchPluginActivation = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId,
      pluginId,
      isEnabled,
      configuration: config,
      createdAt: now,
      updatedAt: now,
    };
    this.branchConfigs.set(key, branchActivation);
    return branchActivation;
  }

  // -------------------------------------------------------------------------
  // Hierarchical Configuration
  // -------------------------------------------------------------------------
  setConfigEntry(
    ctx: TenantContext,
    entry: Omit<PluginConfigurationEntry, "id" | "createdAt" | "updatedAt" | "version">
  ): PluginConfigurationEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    const configEntry: PluginConfigurationEntry = {
      ...entry,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.configEntries.set(id, configEntry);
    return configEntry;
  }

  getConfigEntries(pluginId: string): PluginConfigurationEntry[] {
    return Array.from(this.configEntries.values()).filter((e) => e.pluginId === pluginId);
  }

  // -------------------------------------------------------------------------
  // Plugin Events & Usage Metering
  // -------------------------------------------------------------------------
  logPluginEvent(ctx: TenantContext, event: Omit<PluginEvent, "id" | "timestamp" | "tenantId">): PluginEvent {
    assertPluginMutationIdempotency(event.idempotencyKey, this.processedIdempotencyKeys);
    this.processedIdempotencyKeys.add(event.idempotencyKey);

    const id = randomUUID();
    const log: PluginEvent = {
      ...event,
      id,
      tenantId: ctx.tenantId,
      timestamp: new Date().toISOString(),
    };
    this.pluginEvents.set(id, log);
    return log;
  }

  recordUsage(ctx: TenantContext, pluginId: string, metricName: string, quantity: number): PluginUsageRecord {
    const id = randomUUID();
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const record: PluginUsageRecord = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId || null,
      pluginId,
      metricName,
      quantity,
      period,
      timestamp: now.toISOString(),
    };
    this.usageRecords.set(id, record);
    return record;
  }

  // -------------------------------------------------------------------------
  // Specialized Industry Entities CRUD
  // -------------------------------------------------------------------------

  // 1. Restaurant
  createRestaurantTable(ctx: TenantContext, req: Omit<RestaurantTable, "id" | "tenantId" | "createdAt" | "updatedAt">): RestaurantTable {
    const id = randomUUID();
    const now = new Date().toISOString();
    const table: RestaurantTable = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.restaurantTables.set(id, table);
    return table;
  }

  getRestaurantTables(ctx: TenantContext): RestaurantTable[] {
    return Array.from(this.restaurantTables.values()).filter(
      (t) => t.tenantId === ctx.tenantId && (!ctx.branchId || t.branchId === ctx.branchId)
    );
  }

  createKitchenTicket(ctx: TenantContext, req: Omit<KitchenTicket, "id" | "tenantId" | "createdAt" | "updatedAt">): KitchenTicket {
    const id = randomUUID();
    const now = new Date().toISOString();
    const ticket: KitchenTicket = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.kitchenTickets.set(id, ticket);
    return ticket;
  }

  // 2. Pharmacy
  createPrescription(ctx: TenantContext, req: Omit<PharmacyPrescription, "id" | "tenantId" | "createdAt" | "updatedAt">): PharmacyPrescription {
    const id = randomUUID();
    const now = new Date().toISOString();
    const pres: PharmacyPrescription = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.pharmacyPrescriptions.set(id, pres);
    return pres;
  }

  getPrescriptions(ctx: TenantContext): PharmacyPrescription[] {
    return Array.from(this.pharmacyPrescriptions.values()).filter((p) => p.tenantId === ctx.tenantId);
  }

  // 3. Garage
  createGarageVehicle(ctx: TenantContext, req: Omit<GarageVehicle, "id" | "tenantId" | "createdAt" | "updatedAt">): GarageVehicle {
    const id = randomUUID();
    const now = new Date().toISOString();
    const vehicle: GarageVehicle = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.garageVehicles.set(id, vehicle);
    return vehicle;
  }

  createGarageWorkOrder(ctx: TenantContext, req: Omit<GarageWorkOrder, "id" | "tenantId" | "createdAt" | "updatedAt">): GarageWorkOrder {
    const id = randomUUID();
    const now = new Date().toISOString();
    const wo: GarageWorkOrder = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.garageWorkOrders.set(id, wo);
    return wo;
  }

  // 4. Construction
  createConstructionProject(ctx: TenantContext, req: Omit<ConstructionProject, "id" | "tenantId" | "createdAt" | "updatedAt">): ConstructionProject {
    const id = randomUUID();
    const now = new Date().toISOString();
    const proj: ConstructionProject = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.constructionProjects.set(id, proj);
    return proj;
  }

  // 5. Telecom
  createTelecomSite(ctx: TenantContext, req: Omit<TelecomSite, "id" | "tenantId" | "createdAt" | "updatedAt">): TelecomSite {
    const id = randomUUID();
    const now = new Date().toISOString();
    const site: TelecomSite = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.telecomSites.set(id, site);
    return site;
  }

  // 6. Wholesale
  setWholesaleTierRule(ctx: TenantContext, req: Omit<WholesaleProductTierRule, "id" | "tenantId" | "createdAt" | "updatedAt">): WholesaleProductTierRule {
    const id = randomUUID();
    const now = new Date().toISOString();
    const rule: WholesaleProductTierRule = {
      ...req,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.wholesaleTierRules.set(rule.variantId, rule);
    return rule;
  }
}
