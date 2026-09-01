import { randomUUID } from "crypto";
import type {
  TenantContext,
  PoultryLivestockModuleManifest,
  PoultryLivestockSettings,
  FarmFlockBatch,
  EggProductionRecord,
  FeedConsumptionRecord,
  PoultryLivestockAiRecommendation,
} from "@kwakopos2/contracts";
import {
  globalPoultryLivestockOperatingEngine,
  PoultryLivestockOperatingEngine,
} from "@kwakopos2/domain";
import {
  globalInMemoryStore,
  InMemoryStore,
} from "@kwakopos2/database";

export class PoultryLivestockService {
  private engine: PoultryLivestockOperatingEngine;
  private store: InMemoryStore;

  private flockMap: Map<string, FarmFlockBatch> = new Map();
  private eggMap: Map<string, EggProductionRecord[]> = new Map();
  private feedMap: Map<string, FeedConsumptionRecord[]> = new Map();

  constructor(engine?: PoultryLivestockOperatingEngine, store?: InMemoryStore) {
    this.engine = engine || globalPoultryLivestockOperatingEngine;
    this.store = store || globalInMemoryStore;
  }

  getManifest(): PoultryLivestockModuleManifest {
    return this.engine.getModuleManifest();
  }

  getSettings(ctx: TenantContext): PoultryLivestockSettings {
    return this.engine.getDefaultSettings(ctx.tenantId, ctx.branchId);
  }

  createFlockBatch(
    ctx: TenantContext,
    flockData: Omit<FarmFlockBatch, "id" | "tenantId" | "branchId" | "flockCode" | "currentQuantity" | "totalMortality" | "totalCulls" | "status">
  ): FarmFlockBatch {
    const id = randomUUID();
    const flockCode = `FLK-${Math.floor(1000 + Math.random() * 9000)}`;
    const fullFlock: FarmFlockBatch = {
      ...flockData,
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      flockCode,
      currentQuantity: flockData.openingQuantity,
      totalMortality: 0,
      totalCulls: 0,
      status: "LAYING_PRODUCTION",
    };
    this.flockMap.set(id, fullFlock);
    return fullFlock;
  }

  getFlocks(ctx: TenantContext): FarmFlockBatch[] {
    return Array.from(this.flockMap.values()).filter(
      (f) => f.tenantId === ctx.tenantId && f.branchId === ctx.branchId
    );
  }

  recordEggCollection(
    ctx: TenantContext,
    record: { flockId: string; totalGoodEggs: number; totalBrokenEggs: number; totalDirtyEggs: number }
  ): EggProductionRecord {
    const flock = this.flockMap.get(record.flockId);
    if (!flock) throw new Error(`Flock with ID '${record.flockId}' not found.`);

    const layRatePct = this.engine.calculateLayRatePct(record.totalGoodEggs, flock.currentQuantity);
    const fullRecord: EggProductionRecord = {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      flockId: flock.id,
      collectionDate: new Date().toISOString(),
      totalGoodEggs: record.totalGoodEggs,
      totalBrokenEggs: record.totalBrokenEggs,
      totalDirtyEggs: record.totalDirtyEggs,
      layRatePct,
      recordedByUserId: ctx.userId,
    };

    if (!this.eggMap.has(flock.id)) this.eggMap.set(flock.id, []);
    this.eggMap.get(flock.id)!.push(fullRecord);
    return fullRecord;
  }

  getAiRecommendations(ctx: TenantContext): PoultryLivestockAiRecommendation[] {
    const flocks = this.getFlocks(ctx);
    const eggRecords = Array.from(this.eggMap.values()).flat().filter((e) => e.tenantId === ctx.tenantId);
    const feedRecords = Array.from(this.feedMap.values()).flat().filter((f) => f.tenantId === ctx.tenantId);

    return this.engine.generateExplainableAiRecommendations(ctx, flocks, eggRecords, feedRecords);
  }
}

export const globalPoultryLivestockService = new PoultryLivestockService();
