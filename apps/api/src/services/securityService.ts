import { SecurityEngine } from "@kwakopos2/domain";

export class SecurityService {
  private engine: SecurityEngine;

  constructor(engine?: SecurityEngine) {
    this.engine = engine ?? new SecurityEngine();
  }

  public getEngine(): SecurityEngine {
    return this.engine;
  }

  public configurePolicy(params: Parameters<SecurityEngine["configurePolicy"]>[0]) {
    return this.engine.configurePolicy(params);
  }

  public logThreatEvent(params: Parameters<SecurityEngine["logThreatEvent"]>[0]) {
    return this.engine.logThreatEvent(params);
  }

  public mitigateThreat(eventId: string, actorId: string) {
    return this.engine.mitigateThreat(eventId, actorId);
  }

  public blockIp(tenantId: string, ipAddress: string, actorId: string) {
    return this.engine.blockIp(tenantId, ipAddress, actorId);
  }

  public isIpBlocked(tenantId: string, ipAddress: string) {
    return this.engine.isIpBlocked(tenantId, ipAddress);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalSecurityService = new SecurityService();
