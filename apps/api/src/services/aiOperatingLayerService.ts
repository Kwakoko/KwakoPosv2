import { globalAiOperatingLayerEngine } from "@kwakopos2/domain";

export class AiOperatingLayerService {
  public getInsightsAndRecommendations(tenantId: string) {
    return globalAiOperatingLayerEngine.generateInsightsAndRecommendations(tenantId);
  }

  public askAi(queryText: string, userPermissions: string[]) {
    return globalAiOperatingLayerEngine.askAi(queryText, userPermissions);
  }

  public explainRecommendation(recommendationId: string) {
    return globalAiOperatingLayerEngine.explainRecommendation(recommendationId);
  }

  public executeAction(recommendationId: string, approverId: string) {
    return globalAiOperatingLayerEngine.executeApprovedAction(recommendationId, approverId);
  }

  public toggleKillSwitch(scope: "GLOBAL" | "AGENT" | "TOOL" | "TENANT", idOrDisabled: string | boolean) {
    return globalAiOperatingLayerEngine.toggleKillSwitch(scope, idOrDisabled);
  }

  public getDashboardMetrics() {
    return globalAiOperatingLayerEngine.getHealthSummary();
  }
}

export const globalAiOperatingLayerService = new AiOperatingLayerService();
