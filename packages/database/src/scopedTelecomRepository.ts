import { randomUUID } from "crypto";
import type {
  TenantContext,
  TelecomCustomerContract,
  TelecomProject,
  TelecomSite,
  TelecomSurvey,
  TelecomRanSector,
  TelecomMicrowaveLink,
  TelecomWorkOrder,
  TelecomTestRecord,
  TelecomAcceptanceRecord,
  TelecomMaintenanceTicket,
  KmlImportRecord,
  GeoPlacemark,
} from "@kwakopos2/contracts";
import {
  assertSiteTenantOwnership,
  assertGeographicTenantBoundary,
  assertUniqueSerialNumber,
  assertValidMicrowaveEndpoints,
  assertWorkOrderChecklistComplete,
  assertSiteAcceptanceRequiresPassingTests,
  assertBillingTriggerHasAcceptanceEvidence,
  TelecomEngine,
  TelecomWorkflowEngine,
  KmlKmzParserEngine,
} from "@kwakopos2/domain";
import type { InMemoryStore } from "./index.js";

export class ScopedTelecomRepository {
  private store: InMemoryStore;

  // In-memory collections for Telecom
  contracts: Map<string, TelecomCustomerContract> = new Map();
  projects: Map<string, TelecomProject> = new Map();
  sites: Map<string, TelecomSite> = new Map();
  surveys: Map<string, TelecomSurvey> = new Map();
  ranSectors: Map<string, TelecomRanSector> = new Map();
  microwaveLinks: Map<string, TelecomMicrowaveLink> = new Map();
  workOrders: Map<string, TelecomWorkOrder> = new Map();
  testRecords: Map<string, TelecomTestRecord> = new Map();
  acceptanceRecords: Map<string, TelecomAcceptanceRecord> = new Map();
  maintenanceTickets: Map<string, TelecomMaintenanceTicket> = new Map();
  kmlImports: Map<string, KmlImportRecord> = new Map();
  serialRegistry: Set<string> = new Set();

  constructor(store: InMemoryStore) {
    this.store = store;
  }

  // =========================================================================
  // 1. Customer Contracts
  // =========================================================================

  createContract(ctx: TenantContext, input: Omit<TelecomCustomerContract, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }): TelecomCustomerContract {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const contract: TelecomCustomerContract = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      branchId: input.branchId || ctx.branchId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.contracts.set(id, contract);
    return contract;
  }

  getContracts(ctx: TenantContext): TelecomCustomerContract[] {
    return Array.from(this.contracts.values()).filter((c) => c.tenantId === ctx.tenantId);
  }

  // =========================================================================
  // 2. Telecom Projects
  // =========================================================================

  createProject(ctx: TenantContext, input: Omit<TelecomProject, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }): TelecomProject {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const project: TelecomProject = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      branchId: input.branchId || ctx.branchId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  getProjects(ctx: TenantContext): TelecomProject[] {
    return Array.from(this.projects.values()).filter((p) => p.tenantId === ctx.tenantId);
  }

  getProjectById(ctx: TenantContext, id: string): TelecomProject | null {
    const project = this.projects.get(id);
    if (!project) return null;
    assertGeographicTenantBoundary(ctx, project.tenantId);
    return project;
  }

  // =========================================================================
  // 3. Site Management & Geospatial Search
  // =========================================================================

  createSite(ctx: TenantContext, input: Omit<TelecomSite, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }): TelecomSite {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const site: TelecomSite = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      branchId: input.branchId || ctx.branchId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.sites.set(id, site);
    return site;
  }

  getSites(ctx: TenantContext): TelecomSite[] {
    return Array.from(this.sites.values()).filter((s) => s.tenantId === ctx.tenantId);
  }

  getSiteById(ctx: TenantContext, id: string): TelecomSite | null {
    const site = this.sites.get(id);
    if (!site) return null;
    assertSiteTenantOwnership(ctx, site);
    return site;
  }

  searchSitesNear(
    ctx: TenantContext,
    targetLat: number,
    targetLon: number,
    radiusKm = 25.0
  ): { site: TelecomSite; distanceKm: number }[] {
    const tenantSites = this.getSites(ctx);
    const results: { site: TelecomSite; distanceKm: number }[] = [];

    for (const site of tenantSites) {
      const distanceKm = TelecomEngine.calculateGreatCircleDistanceKm(
        { latitude: targetLat, longitude: targetLon },
        { latitude: site.latitude, longitude: site.longitude }
      );
      if (distanceKm <= radiusKm) {
        results.push({ site, distanceKm });
      }
    }

    return results.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  // =========================================================================
  // 4. KML / KMZ File Processing & Site Generation
  // =========================================================================

  importKmlPlacemarksAsSites(
    ctx: TenantContext,
    importRecordId: string,
    selectedPlacemarkIds: string[]
  ): { createdSites: TelecomSite[]; importRecord: KmlImportRecord } {
    const record = this.kmlImports.get(importRecordId);
    if (!record) throw new Error(`KML import record ${importRecordId} not found.`);
    assertGeographicTenantBoundary(ctx, record.tenantId);

    const targetPlacemarks = record.parsedPlacemarks.filter((p) => selectedPlacemarkIds.includes(p.id));
    const createdSites: TelecomSite[] = [];

    for (const p of targetPlacemarks) {
      if (p.coordinates.length > 0) {
        const coord = p.coordinates[0];
        const siteCode = `SITE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const site = this.createSite(ctx, {
          siteCode,
          name: p.name,
          siteType: "GREENFIELD_TOWER",
          status: "PLANNED",
          latitude: coord.latitude,
          longitude: coord.longitude,
          elevationMeters: coord.elevationMeters || 0,
          towerHeightMeters: 45,
          region: "National",
          district: p.layerName,
          address: p.description,
          powerSource: "GRID_COMMERCIAL",
          securityRestrictions: null,
          photos: [],
          documents: [],
        });
        createdSites.push(site);
      }
    }

    const updatedRecord: KmlImportRecord = {
      ...record,
      sitesCreated: record.sitesCreated + createdSites.length,
      status: "IMPORTED",
    };
    this.kmlImports.set(importRecordId, updatedRecord);

    return { createdSites, importRecord: updatedRecord };
  }

  // =========================================================================
  // 5. Microwave Link Management & Budget Calculation
  // =========================================================================

  createMicrowaveLink(
    ctx: TenantContext,
    input: Omit<TelecomMicrowaveLink, "id" | "tenantId" | "calculation" | "createdAt" | "updatedAt"> & { id?: string }
  ): TelecomMicrowaveLink {
    assertValidMicrowaveEndpoints({ siteAId: input.siteAId, siteBId: input.siteBId }, this.sites);

    const siteA = this.sites.get(input.siteAId)!;
    const siteB = this.sites.get(input.siteBId)!;

    const calculation = TelecomEngine.executeLinkBudgetCalculation({
      siteA: { latitude: siteA.latitude, longitude: siteA.longitude, elevationMeters: siteA.elevationMeters, antennaHeightMeters: input.siteAAntennaHeightMeters },
      siteB: { latitude: siteB.latitude, longitude: siteB.longitude, elevationMeters: siteB.elevationMeters, antennaHeightMeters: input.siteBAntennaHeightMeters },
      frequencyGhz: input.frequencyGhz,
      txPowerDbm: input.txPowerDbm,
      antennaGainDbiSiteA: input.antennaGainDbiSiteA,
      antennaGainDbiSiteB: input.antennaGainDbiSiteB,
      feederLossSiteADb: input.feederLossSiteADb,
      feederLossSiteBDb: input.feederLossSiteBDb,
    });

    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const link: TelecomMicrowaveLink = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      calculation,
      status: calculation.linkBudgetValid ? "APPROVED" : "DESIGN",
      approvedById: calculation.linkBudgetValid ? ctx.userId : null,
      approvedAt: calculation.linkBudgetValid ? now : null,
      createdAt: now,
      updatedAt: now,
    };
    this.microwaveLinks.set(id, link);
    return link;
  }

  getMicrowaveLinks(ctx: TenantContext): TelecomMicrowaveLink[] {
    return Array.from(this.microwaveLinks.values()).filter((l) => l.tenantId === ctx.tenantId);
  }

  // =========================================================================
  // 6. RAN Sector Management
  // =========================================================================

  createRanSector(
    ctx: TenantContext,
    input: Omit<TelecomRanSector, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }
  ): TelecomRanSector {
    const site = this.sites.get(input.siteId);
    if (!site) throw new Error(`Site ${input.siteId} not found.`);
    assertSiteTenantOwnership(ctx, site);

    if (input.radioUnitSerialNumber) {
      assertUniqueSerialNumber(input.radioUnitSerialNumber, this.serialRegistry);
      this.serialRegistry.add(input.radioUnitSerialNumber.trim().toUpperCase());
    }

    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const sector: TelecomRanSector = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };
    this.ranSectors.set(id, sector);
    return sector;
  }

  getRanSectorsBySite(ctx: TenantContext, siteId: string): TelecomRanSector[] {
    return Array.from(this.ranSectors.values()).filter((s) => s.tenantId === ctx.tenantId && s.siteId === siteId);
  }

  // =========================================================================
  // 7. Work Orders & Checklists
  // =========================================================================

  createWorkOrder(
    ctx: TenantContext,
    input: Omit<TelecomWorkOrder, "id" | "tenantId" | "checklistItems" | "createdAt" | "updatedAt"> & { id?: string; checklistItems?: TelecomWorkOrder["checklistItems"] }
  ): TelecomWorkOrder {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const checklistItems = input.checklistItems || TelecomWorkflowEngine.generateDefaultChecklist(input.workType);

    const workOrder: TelecomWorkOrder = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      branchId: input.branchId || ctx.branchId || null,
      checklistItems,
      createdAt: now,
      updatedAt: now,
    };
    this.workOrders.set(id, workOrder);
    return workOrder;
  }

  completeWorkOrder(ctx: TenantContext, id: string, completionNotes?: string): TelecomWorkOrder {
    const wo = this.workOrders.get(id);
    if (!wo) throw new Error(`Work order ${id} not found.`);
    assertGeographicTenantBoundary(ctx, wo.tenantId);

    const completed: TelecomWorkOrder = {
      ...wo,
      status: "COMPLETED",
      actualEndTime: new Date().toISOString(),
      completionNotes: completionNotes || wo.completionNotes,
      updatedAt: new Date().toISOString(),
    };

    assertWorkOrderChecklistComplete(completed);
    this.workOrders.set(id, completed);
    return completed;
  }

  // =========================================================================
  // 8. Testing & Site Acceptance (SAT)
  // =========================================================================

  recordTest(ctx: TenantContext, input: Omit<TelecomTestRecord, "id" | "tenantId" | "createdAt"> & { id?: string }): TelecomTestRecord {
    const id = input.id || randomUUID();
    const test: TelecomTestRecord = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      createdAt: new Date().toISOString(),
    };
    this.testRecords.set(id, test);
    return test;
  }

  createSiteAcceptance(
    ctx: TenantContext,
    input: Omit<TelecomAcceptanceRecord, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }
  ): TelecomAcceptanceRecord {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();

    const site = this.sites.get(input.siteId);
    if (!site) throw new Error(`Site ${input.siteId} not found.`);
    assertSiteTenantOwnership(ctx, site);

    const siteTests = Array.from(this.testRecords.values()).filter((t) => t.tenantId === ctx.tenantId && t.siteId === input.siteId);
    const acceptance: TelecomAcceptanceRecord = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      createdAt: now,
      updatedAt: now,
    };

    assertSiteAcceptanceRequiresPassingTests(acceptance, siteTests);
    assertBillingTriggerHasAcceptanceEvidence(acceptance);

    this.acceptanceRecords.set(id, acceptance);

    // Update Site status to ACCEPTED
    const updatedSite: TelecomSite = {
      ...site,
      status: "ACCEPTED",
      updatedAt: now,
    };
    this.sites.set(site.id, updatedSite);

    return acceptance;
  }

  // =========================================================================
  // 9. Maintenance Tickets & SLA
  // =========================================================================

  createMaintenanceTicket(
    ctx: TenantContext,
    input: Omit<TelecomMaintenanceTicket, "id" | "tenantId" | "createdAt" | "updatedAt"> & { id?: string }
  ): TelecomMaintenanceTicket {
    const id = input.id || randomUUID();
    const now = new Date().toISOString();
    const ticket: TelecomMaintenanceTicket = {
      ...input,
      id,
      tenantId: ctx.tenantId,
      branchId: input.branchId || ctx.branchId || null,
      createdAt: now,
      updatedAt: now,
    };
    this.maintenanceTickets.set(id, ticket);
    return ticket;
  }

  getMaintenanceTickets(ctx: TenantContext): TelecomMaintenanceTicket[] {
    return Array.from(this.maintenanceTickets.values()).filter((t) => t.tenantId === ctx.tenantId);
  }
}

export const globalTelecomRepository = new ScopedTelecomRepository((globalThis as any).__kwakoposInMemoryStore || ((globalThis as any).__kwakoposInMemoryStore = {

  tenants: new Map(),
  branches: new Map(),
  products: new Map(),
  variants: new Map(),
  stockLedgers: [],
  stockAdjustments: new Map(),
  customers: new Map(),
  suppliers: new Map(),
  purchaseOrders: new Map(),
  purchaseReceipts: new Map(),
  sales: new Map(),
  returns: new Map(),
  payments: new Map(),
  cashSessions: new Map(),
  expenses: new Map(),
}));
