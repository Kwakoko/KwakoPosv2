import { MultiSiteEngine } from "@kwakopos2/domain";
import { OrganizationLevel } from "@kwakopos2/contracts";

export class MultiSiteService {
  private engine: MultiSiteEngine;

  constructor(engine?: MultiSiteEngine) {
    this.engine = engine ?? new MultiSiteEngine();
  }

  public getEngine(): MultiSiteEngine {
    return this.engine;
  }

  public createOrganizationNode(params: Parameters<MultiSiteEngine["createOrganizationNode"]>[0]) {
    return this.engine.createOrganizationNode(params);
  }

  public listOrganizationNodes(tenantId: string, level?: OrganizationLevel) {
    return this.engine.listOrganizationNodes(tenantId, level);
  }

  public recordConsolidatedMetric(params: Parameters<MultiSiteEngine["recordConsolidatedMetric"]>[0]) {
    return this.engine.recordConsolidatedMetric(params);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalMultiSiteService = new MultiSiteService();
