import { AutonomousOperationsEngine } from "@kwakopos2/domain";

export class AutonomousOperationsService {
  private engine: AutonomousOperationsEngine;

  constructor(engine?: AutonomousOperationsEngine) {
    this.engine = engine ?? new AutonomousOperationsEngine();
  }

  public getEngine(): AutonomousOperationsEngine {
    return this.engine;
  }

  public registerAgentCapability(params: Parameters<AutonomousOperationsEngine["registerAgentCapability"]>[0]) {
    return this.engine.registerAgentCapability(params);
  }

  public executeAutonomousRequest(params: Parameters<AutonomousOperationsEngine["executeAutonomousRequest"]>[0]) {
    return this.engine.executeAutonomousRequest(params);
  }

  public verifyActionResult(requestId: string, isSuccessful: boolean) {
    return this.engine.verifyActionResult(requestId, isSuccessful);
  }

  public activateAgentKillSwitch(tenantId: string, agentId: string, actorId: string) {
    return this.engine.activateAgentKillSwitch(tenantId, agentId, actorId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalAutonomousOperationsService = new AutonomousOperationsService();
