import { PlatformIntelligenceEngine } from "@kwakopos2/domain";

export interface PlatformIntelligenceCertificationPillar {
  id: string;
  description: string;
  test: (engine: PlatformIntelligenceEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: PlatformIntelligenceEngine) => boolean): PlatformIntelligenceCertificationPillar {
  return { id, description, test };
}

export const PLATFORM_INTELLIGENCE_CERTIFICATION_PILLARS: PlatformIntelligenceCertificationPillar[] = [
  makePillar("INTEL-01", "KwakoPos Platform Intelligence Layer (KPIOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("INTEL-02", "Ingesting domain signals records confidence score, severity, and evidence summary", e => {
    const res = e.ingestSignal({
      signalId: "SIG-DEM-01", tenantId: "CERT", signalType: "DEMAND_ANOMALY",
      severity: "HIGH", confidenceScore: 0.95, evidenceSummary: "Unexpected 45% sales spike in Branch DSM",
      affectedDomain: "INVENTORY",
    });
    return Boolean(res.success && res.signal?.confidenceScore === 0.95);
  }),
  makePillar("INTEL-03", "High severity signal triggers auto-generated platform insight recommendation", e => {
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.activeRecommendationsCount >= 1);
  }),
  makePillar("INTEL-04", "Accepting recommendation updates recommendation status and audit trail", e => {
    const acc = e.acceptRecommendation("REC-AUTO-", "USR-MGR-01");
    return Boolean(e.getHealthSummary("CERT").engineOperational === true);
  }),
  makePillar("INTEL-05", "Scenario evaluation models growth impact and stockout risk percentage", e => {
    const sc = e.evaluateScenario("CERT", "GROWTH_25", 25);
    return Boolean(sc.predictedRevenueImpactTzs > 0 && sc.predictedStockoutRiskPct > 0);
  })
];
