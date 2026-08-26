export interface SloTarget {
  name: string;
  targetPercent: number;
  currentPercent: number;
  status: "COMPLIANT" | "AT_RISK" | "BREACHED";
}

export interface SloReport {
  overallCompliance: "PASS" | "FAIL";
  evaluatedAt: string;
  targets: {
    availability: SloTarget;
    apiSuccessRate: SloTarget;
    syncSuccessRate: SloTarget;
    latencyP95: {
      name: string;
      thresholdMs: number;
      currentP95Ms: number;
      status: "COMPLIANT" | "AT_RISK" | "BREACHED";
    };
    inventoryIntegrity: SloTarget;
    tenantIsolationViolations: {
      name: string;
      maxAllowed: number;
      currentViolations: number;
      status: "COMPLIANT" | "BREACHED";
    };
    dataLossIncidents: {
      name: string;
      maxAllowed: number;
      currentCount: number;
      status: "COMPLIANT" | "BREACHED";
    };
  };
}

export class SloEvaluator {
  evaluateProductionSlos(params: {
    availabilityPercent: number;
    apiSuccessPercent: number;
    syncSuccessPercent: number;
    currentP95LatencyMs: number;
    inventoryIntegrityPercent: number;
    tenantIsolationViolationCount: number;
    dataLossIncidentCount: number;
  }): SloReport {
    const availabilityStatus =
      params.availabilityPercent >= 99.9 ? "COMPLIANT" : params.availabilityPercent >= 99.0 ? "AT_RISK" : "BREACHED";

    const apiStatus =
      params.apiSuccessPercent >= 99.5 ? "COMPLIANT" : params.apiSuccessPercent >= 98.5 ? "AT_RISK" : "BREACHED";

    const syncStatus =
      params.syncSuccessPercent >= 99.9 ? "COMPLIANT" : params.syncSuccessPercent >= 99.0 ? "AT_RISK" : "BREACHED";

    const latencyStatus =
      params.currentP95LatencyMs <= 500 ? "COMPLIANT" : params.currentP95LatencyMs <= 1000 ? "AT_RISK" : "BREACHED";

    const invStatus = params.inventoryIntegrityPercent >= 100 ? "COMPLIANT" : "BREACHED";

    const isoStatus = params.tenantIsolationViolationCount === 0 ? "COMPLIANT" : "BREACHED";
    const dataLossStatus = params.dataLossIncidentCount === 0 ? "COMPLIANT" : "BREACHED";

    const anyBreached =
      availabilityStatus === "BREACHED" ||
      apiStatus === "BREACHED" ||
      syncStatus === "BREACHED" ||
      latencyStatus === "BREACHED" ||
      invStatus === "BREACHED" ||
      isoStatus === "BREACHED" ||
      dataLossStatus === "BREACHED";

    return {
      overallCompliance: anyBreached ? "FAIL" : "PASS",
      evaluatedAt: new Date().toISOString(),
      targets: {
        availability: {
          name: "SaaS Availability",
          targetPercent: 99.9,
          currentPercent: params.availabilityPercent,
          status: availabilityStatus,
        },
        apiSuccessRate: {
          name: "API Success Rate",
          targetPercent: 99.5,
          currentPercent: params.apiSuccessPercent,
          status: apiStatus,
        },
        syncSuccessRate: {
          name: "Sync Success Rate",
          targetPercent: 99.9,
          currentPercent: params.syncSuccessPercent,
          status: syncStatus,
        },
        latencyP95: {
          name: "P95 API Latency",
          thresholdMs: 500,
          currentP95Ms: params.currentP95LatencyMs,
          status: latencyStatus,
        },
        inventoryIntegrity: {
          name: "Inventory Ledger Integrity",
          targetPercent: 100,
          currentPercent: params.inventoryIntegrityPercent,
          status: invStatus,
        },
        tenantIsolationViolations: {
          name: "Tenant Isolation Security",
          maxAllowed: 0,
          currentViolations: params.tenantIsolationViolationCount,
          status: isoStatus,
        },
        dataLossIncidents: {
          name: "Zero Data-Loss Incidents",
          maxAllowed: 0,
          currentCount: params.dataLossIncidentCount,
          status: dataLossStatus,
        },
      },
    };
  }
}

export const globalSloEvaluator = new SloEvaluator();