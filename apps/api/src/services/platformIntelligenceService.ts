import { PlatformIntelligenceEngine } from "@kwakopos2/domain";

export class PlatformIntelligenceService {
  private engine: PlatformIntelligenceEngine;

  constructor(engine?: PlatformIntelligenceEngine) {
    this.engine = engine ?? new PlatformIntelligenceEngine();
  }

  public getEngine(): PlatformIntelligenceEngine {
    return this.engine;
  }

  public ingestSignal(params: Parameters<PlatformIntelligenceEngine["ingestSignal"]>[0]) {
    return this.engine.ingestSignal(params);
  }

  public generateRecommendation(params: Parameters<PlatformIntelligenceEngine["generateRecommendation"]>[0]) {
    return this.engine.generateRecommendation(params);
  }

  public acceptRecommendation(recommendationId: string, actorId: string) {
    return this.engine.acceptRecommendation(recommendationId, actorId);
  }

  public evaluateScenario(tenantId: string, scenarioName: string, growthPct: number) {
    return this.engine.evaluateScenario(tenantId, scenarioName, growthPct);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalPlatformIntelligenceService = new PlatformIntelligenceService();
