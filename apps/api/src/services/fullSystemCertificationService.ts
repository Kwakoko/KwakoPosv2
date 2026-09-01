import { FullSystemCertificationEngine } from "@kwakopos2/domain";
import { FullSystemCertificationDomain } from "@kwakopos2/contracts";

export class FullSystemCertificationService {
  private engine: FullSystemCertificationEngine;

  constructor(engine?: FullSystemCertificationEngine) {
    this.engine = engine ?? new FullSystemCertificationEngine();
  }

  public getEngine(): FullSystemCertificationEngine {
    return this.engine;
  }

  public createCampaign(params: Parameters<FullSystemCertificationEngine["createCampaign"]>[0]) {
    return this.engine.createCampaign(params);
  }

  public certifyDomain(campaignId: string, domain: FullSystemCertificationDomain, auditorId: string) {
    return this.engine.certifyDomain(campaignId, domain, auditorId);
  }

  public finalizeCampaign(campaignId: string, auditorId: string) {
    return this.engine.finalizeCampaign(campaignId, auditorId);
  }

  public getHealthSummary(tenantId?: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalFullSystemCertificationService = new FullSystemCertificationService();
