import { randomUUID } from "crypto";
import type {
  TenantContext,
  LawFirmModuleManifest,
  LawFirmSettings,
  LegalMatter,
  ConflictCheckResult,
  LegalDeadline,
  TimeEntry,
  TrustAccountTransaction,
  LawFirmAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalLawFirmOperatingEngine,
  LawFirmOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class LawFirmService {
  private engine: LawFirmOperatingEngine;
  private store: InMemoryStore;

  private matterMap: Map<string, LegalMatter> = new Map();
  private conflictMap: Map<string, ConflictCheckResult> = new Map();
  private deadlineMap: Map<string, LegalDeadline> = new Map();
  private timeEntryMap: Map<string, TimeEntry> = new Map();
  private trustMap: Map<string, TrustAccountTransaction[]> = new Map();

  constructor(engine?: LawFirmOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalLawFirmOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): LawFirmModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): LawFirmSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  runConflictCheck(ctx: TenantContext, targetName: string): ConflictCheckResult {
    const matters = this.getMatters(ctx);
    const result = this.engine.performConflictCheck(ctx, targetName, matters);
    this.conflictMap.set(result.id, result);
    return result;
  }

  createMatter(ctx: TenantContext, matter: Omit<LegalMatter, "id" | "tenantId" | "branchId" | "matterNumber" | "openDate" | "status">): LegalMatter {
    const id = randomUUID();
    const matterNumber = `MAT-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullMatter: LegalMatter = {
      ...matter,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      matterNumber,
      status: "OPEN",
      openDate: new Date().toISOString(),
    };
    this.matterMap.set(id, fullMatter);
    return fullMatter;
  }

  getMatters(ctx: TenantContext): LegalMatter[] {
    return Array.from(this.matterMap.values()).filter(
      (m) => m.tenantId === ctx.tenantId && m.branchId === ctx.branchId
    );
  }

  recordTimeEntry(
    ctx: TenantContext,
    entry: Omit<TimeEntry, "id" | "tenantId" | "branchId" | "attorneyId" | "totalBillableTzs" | "status" | "entryDate">
  ): TimeEntry {
    const id = randomUUID();
    const billing = this.engine.calculateTimeEntryBilling(entry.durationHours, entry.hourlyRateTzs, entry.isBillable);
    const fullEntry: TimeEntry = {
      ...entry,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      attorneyId: ctx.userId,
      totalBillableTzs: billing.totalBillableTzs,
      status: "APPROVED",
      entryDate: new Date().toISOString(),
    };
    this.timeEntryMap.set(id, fullEntry);
    return fullEntry;
  }

  getTimeEntries(ctx: TenantContext): TimeEntry[] {
    return Array.from(this.timeEntryMap.values()).filter(
      (t) => t.tenantId === ctx.tenantId && t.branchId === ctx.branchId
    );
  }

  getAiRecommendations(ctx: TenantContext): LawFirmAiRecommendation[] {
    const matters = this.getMatters(ctx);
    const deadlines = Array.from(this.deadlineMap.values()).filter((d) => d.tenantId === ctx.tenantId);
    const timeEntries = this.getTimeEntries(ctx);

    return this.engine.generateExplainableAiRecommendations(ctx, matters, deadlines, timeEntries);
  }
}

export const globalLawFirmService = new LawFirmService();
