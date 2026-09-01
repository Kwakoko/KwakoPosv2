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

export class PoultryLivestockOperatingEngine {
  getModuleManifest(): PoultryLivestockModuleManifest {
    return {
      moduleId: "poultry_livestock_operating_system",
      name: "KwakoPos Enterprise Poultry & Livestock Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedSpecies: [
        "POULTRY_LAYERS",
        "POULTRY_BROILERS",
        "CATTLE_DAIRY",
        "CATTLE_BEEF",
        "GOATS_SHEEP",
        "PIGS",
        "RABBITS",
      ],
      permissions: [
        "FARM_FLOCK_VIEW",
        "FARM_FLOCK_MANAGE",
        "FARM_FEED_MANAGE",
        "FARM_HEALTH_MANAGE",
        "FARM_VACCINATION_MANAGE",
        "FARM_EGG_PRODUCTION_LOG",
        "FARM_MILK_PRODUCTION_LOG",
        "FARM_MORTALITY_LOG",
        "FARM_SALES_MANAGE",
        "FARM_AI_ANALYTICS_VIEW",
      ],
      navigationRoutes: [
        "/farm/flocks",
        "/farm/feed",
        "/farm/health",
        "/farm/vaccination",
        "/farm/egg-production",
        "/farm/milk-production",
        "/farm/mortality",
        "/farm/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_total_birds",
        "widget_egg_lay_rate_pct",
        "widget_feed_consumption",
        "widget_mortality_rate",
        "widget_farm_profitability",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): PoultryLivestockSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      requireVaccinationReminders: true,
      trackBatchLevelFeed: true,
      autoAlertOnHighMortalityPct: 2.0,
    };
  }

  reconcileFlockPopulation(
    openingBirds: number,
    additions: number,
    mortality: number,
    culls: number,
    transfersOut: number = 0
  ): {
    currentBirds: number;
    mortalityRatePct: number;
  } {
    const currentBirds = openingBirds + additions - mortality - culls - transfersOut;
    if (currentBirds < 0) {
      throw new Error(`Population Invariant Violation! Current birds cannot be negative (${currentBirds}).`);
    }

    const mortalityRatePct = openingBirds > 0 ? (mortality / openingBirds) * 100 : 0;

    return {
      currentBirds,
      mortalityRatePct: parseFloat(mortalityRatePct.toFixed(2)),
    };
  }

  calculateFeedConversionRatio(totalFeedConsumedKg: number, totalWeightGainKg: number): number {
    if (totalWeightGainKg <= 0) return 0;
    const fcr = totalFeedConsumedKg / totalWeightGainKg;
    return parseFloat(fcr.toFixed(2));
  }

  calculateLayRatePct(totalGoodEggs: number, eligibleBirds: number): number {
    if (eligibleBirds <= 0) return 0;
    const layRate = (totalGoodEggs / eligibleBirds) * 100;
    return parseFloat(layRate.toFixed(2));
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    flocks: FarmFlockBatch[],
    eggRecords: EggProductionRecord[],
    feedRecords: FeedConsumptionRecord[]
  ): PoultryLivestockAiRecommendation[] {
    const recs: PoultryLivestockAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Mortality Alert
    const highMortalityFlocks = flocks.filter(
      (f) => f.openingQuantity > 0 && (f.totalMortality / f.openingQuantity) * 100 > 2.0
    );
    if (highMortalityFlocks.length > 0) {
      recs.push({
        id: `REC-FARM-MORT-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "MORTALITY_ALERT",
        observation: `${highMortalityFlocks.length} poultry flocks exceeded 2.0% mortality threshold.`,
        evidence: `Flock #${highMortalityFlocks[0].flockCode} in House ${highMortalityFlocks[0].houseNumber} has cumulative mortality of ${highMortalityFlocks[0].totalMortality} birds.`,
        recommendation: "Conduct immediate veterinary health inspection & biosecurity review.",
        expectedImpact: "Prevents flock disease transmission and protects remaining population assets.",
        confidenceScore: 95,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalPoultryLivestockOperatingEngine = new PoultryLivestockOperatingEngine();
export const globalPoultryLivestockEngine = globalPoultryLivestockOperatingEngine;
export { PoultryLivestockOperatingEngine as PoultryLivestockEngine };
