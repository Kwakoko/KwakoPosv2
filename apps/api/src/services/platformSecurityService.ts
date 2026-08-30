import { PlatformSecurityEngine } from "@kwakopos2/domain";

export class PlatformSecurityService {
  private engine: PlatformSecurityEngine;

  constructor(engine?: PlatformSecurityEngine) {
    this.engine = engine ?? new PlatformSecurityEngine();
  }

  public getEngine(): PlatformSecurityEngine {
    return this.engine;
  }

  public triggerThreatAlert(params: Parameters<PlatformSecurityEngine["triggerThreatAlert"]>[0]) {
    return this.engine.triggerThreatAlert(params);
  }

  public containIncident(alertId: string, actorId: string) {
    return this.engine.containIncident(alertId, actorId);
  }

  public evaluateTenantIsolationBoundary(requestingTenantId: string, resourceTenantId: string) {
    return this.engine.evaluateTenantIsolationBoundary(requestingTenantId, resourceTenantId);
  }

  public activateKillSwitch(tenantId: string, scope: "GLOBAL" | "AI" | "MARKETPLACE" | "INTEGRATION", actorId: string) {
    return this.engine.activateKillSwitch(tenantId, scope, actorId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalPlatformSecurityService = new PlatformSecurityService();
