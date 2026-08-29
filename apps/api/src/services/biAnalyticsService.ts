import { BiMetricDefinition } from "@kwakopos2/contracts";
import { globalBiAnalyticsEngine } from "@kwakopos2/domain";

export class BiAnalyticsService {
  public defineMetric(metric: BiMetricDefinition) {
    return globalBiAnalyticsEngine.defineMetric(metric);
  }

  public querySemantic(queryText: string, userPermissions: string[]) {
    return globalBiAnalyticsEngine.executeSemanticQuery(queryText, userPermissions);
  }

  public getInsightsAndForecasts(tenantId: string) {
    return globalBiAnalyticsEngine.generateInsightsAndForecasts(tenantId);
  }

  public triggerAnomalyAlert(metricId: string, actualValue: number, expectedValue: number) {
    return globalBiAnalyticsEngine.triggerBiWorkflowAlert(metricId, actualValue, expectedValue);
  }

  public getDashboardMetrics() {
    return globalBiAnalyticsEngine.getHealthSummary();
  }
}

export const globalBiAnalyticsService = new BiAnalyticsService();
