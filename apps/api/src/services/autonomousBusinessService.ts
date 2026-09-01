import { AutonomousBusinessEngine } from "@kwakopos2/domain";

export class AutonomousBusinessService {
  private engine: AutonomousBusinessEngine;

  constructor(engine?: AutonomousBusinessEngine) {
    this.engine = engine ?? new AutonomousBusinessEngine();
  }

  public getEngine(): AutonomousBusinessEngine {
    return this.engine;
  }

  public configurePolicy(params: Parameters<AutonomousBusinessEngine["configurePolicy"]>[0]) {
    return this.engine.configurePolicy(params);
  }

  public triggerAutonomousAction(params: Parameters<AutonomousBusinessEngine["triggerAutonomousAction"]>[0]) {
    return this.engine.triggerAutonomousAction(params);
  }

  public approveAction(actionId: string, approverUserId: string) {
    return this.engine.approveAction(actionId, approverUserId);
  }

  public activateTenantKillSwitch(tenantId: string, actorId: string) {
    return this.engine.activateTenantKillSwitch(tenantId, actorId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalAutonomousBusinessService = new AutonomousBusinessService();
