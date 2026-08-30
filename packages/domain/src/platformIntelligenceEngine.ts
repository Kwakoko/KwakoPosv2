import {
  IntelligenceSignal, PlatformInsightRecommendation, PlatformIntelligenceHealthSummary,
  PlatformIntelligenceAuditEntry, IntelligenceSignalType, IntelligenceSignalSeverity,
} from "@kwakopos2/contracts";

export class PlatformIntelligenceEngine {
  private signals: Map<string, IntelligenceSignal> = new Map();
  private recommendations: Map<string, PlatformInsightRecommendation> = new Map();
  private auditLedger: PlatformIntelligenceAuditEntry[] = [];

  public ingestSignal(params: Omit<IntelligenceSignal, "timestamp" | "confidenceScore"> & {
    confidenceScore?: number;
  }): {
    success: boolean; signal?: IntelligenceSignal;
  } {
    const now = new Date().toISOString();
    const signal: IntelligenceSignal = {
      ...params,
      confidenceScore: params.confidenceScore ?? 0.9,
      timestamp: now,
    };

    this.signals.set(params.signalId, signal);
    this._writeAudit(params.tenantId, "SIGNAL_INGESTED", "SYSTEM", params.signalId,
      `Ingested signal [${params.severity}]: ${params.signalType} in domain ${params.affectedDomain}`);

    // Auto-generate recommendation for high/critical severity signals
    if (params.severity === "HIGH" || params.severity === "CRITICAL") {
      this.generateRecommendation({
        recommendationId: `REC-AUTO-${Date.now()}`,
        signalId: params.signalId,
        tenantId: params.tenantId,
        recommendedAction: `Mitigate ${params.signalType} in domain ${params.affectedDomain}`,
        financialImpactTzs: 500000,
        riskAssessment: "MEDIUM_RISK",
        isAutoActionable: params.severity === "HIGH",
      });
    }

    return { success: true, signal };
  }

  public generateRecommendation(params: Omit<PlatformInsightRecommendation, "createdAt" | "status" | "financialImpactTzs" | "riskAssessment" | "isAutoActionable"> & {
    financialImpactTzs?: number;
    riskAssessment?: string;
    isAutoActionable?: boolean;
  }): {
    success: boolean; recommendation?: PlatformInsightRecommendation;
  } {
    const now = new Date().toISOString();
    const rec: PlatformInsightRecommendation = {
      ...params,
      financialImpactTzs: params.financialImpactTzs ?? 0,
      riskAssessment: params.riskAssessment ?? "LOW_RISK",
      isAutoActionable: params.isAutoActionable ?? false,
      status: "PROPOSED",
      createdAt: now,
    };

    this.recommendations.set(params.recommendationId, rec);
    this._writeAudit(params.tenantId, "RECOMMENDATION_GENERATED", "SYSTEM", params.recommendationId,
      `Recommendation generated for signal ${params.signalId}: ${params.recommendedAction}`);

    return { success: true, recommendation: rec };
  }

  public acceptRecommendation(recommendationId: string, actorId: string): { success: boolean; recommendation?: PlatformInsightRecommendation } {
    const rec = this.recommendations.get(recommendationId);
    if (!rec) return { success: false };

    rec.status = "ACCEPTED";
    this._writeAudit(rec.tenantId, "RECOMMENDATION_ACCEPTED", actorId, recommendationId,
      `Recommendation ${recommendationId} accepted by ${actorId}`);
    return { success: true, recommendation: rec };
  }

  public evaluateScenario(tenantId: string, scenarioName: string, growthPct: number): {
    predictedRevenueImpactTzs: number; predictedStockoutRiskPct: number;
  } {
    this._writeAudit(tenantId, "SCENARIO_EVALUATED", "SYSTEM", scenarioName,
      `Evaluated scenario ${scenarioName} with growth factor ${growthPct}%`);

    return {
      predictedRevenueImpactTzs: 10000000 * (growthPct / 100),
      predictedStockoutRiskPct: Math.min(95, Math.max(5, growthPct * 0.8)),
    };
  }

  public getHealthSummary(tenantId: string): PlatformIntelligenceHealthSummary {
    const sList = Array.from(this.signals.values()).filter(s => s.tenantId === tenantId);
    const rList = Array.from(this.recommendations.values()).filter(r => r.tenantId === tenantId);
    const accepted = rList.filter(r => r.status === "ACCEPTED" || r.status === "EXECUTED").length;

    const avgConfidence = sList.length > 0
      ? sList.reduce((acc, s) => acc + s.confidenceScore, 0) / sList.length
      : 0.95;

    return {
      tenantId,
      engineOperational: true,
      ingestedSignalsCount: sList.length,
      activeRecommendationsCount: rList.length,
      acceptedRecommendationsCount: accepted,
      avgConfidenceScore: Number(avgConfidence.toFixed(2)),
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): PlatformIntelligenceAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: PlatformIntelligenceAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
    this.auditLedger.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      tenantId,
      eventType,
      actorId,
      targetEntityId,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
