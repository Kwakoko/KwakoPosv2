import { ComplianceEngine } from "@kwakopos2/domain";

export class ComplianceService {
  private engine: ComplianceEngine;

  constructor(engine?: ComplianceEngine) {
    this.engine = engine ?? new ComplianceEngine();
  }

  public getEngine(): ComplianceEngine {
    return this.engine;
  }

  public evaluateRule(params: Parameters<ComplianceEngine["evaluateRule"]>[0]) {
    return this.engine.evaluateRule(params);
  }

  public appendAuditRecord(tenantId: string, moduleName: string, action: string, actorId: string, resourceId: string) {
    return this.engine.appendAuditRecord(tenantId, moduleName, action, actorId, resourceId);
  }

  public verifyAuditChain(tenantId: string) {
    return this.engine.verifyAuditChain(tenantId);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalComplianceService = new ComplianceService();
