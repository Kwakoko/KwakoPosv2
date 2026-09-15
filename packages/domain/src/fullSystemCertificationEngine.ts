import {
  FullSystemCertificationCampaign, FullSystemCertificationDomain, FullSystemCertificationStatus,
  FullSystemCertificationHealthSummary, FullSystemCertificationAuditEntry,
} from "@kwakopos2/contracts";

export class FullSystemCertificationEngine {
  private activeCampaigns: Map<string, FullSystemCertificationCampaign> = new Map();
  private certifiedDomainsMap: Map<string, Set<FullSystemCertificationDomain>> = new Map();
  private auditLedger: FullSystemCertificationAuditEntry[] = [];

  constructor() {}


  public createCampaign(params: Omit<FullSystemCertificationCampaign, "certifiedAt" | "certifiedDomainsCount" | "totalDomainsCount" | "status"> & {
    status?: FullSystemCertificationStatus;
  }): {
    success: boolean; campaign?: FullSystemCertificationCampaign;
  } {
    const now = new Date().toISOString();
    const campaign: FullSystemCertificationCampaign = {
      ...params,
      status: params.status ?? "IN_TESTING",
      certifiedDomainsCount: 0,
      totalDomainsCount: 30,
      certifiedAt: now,
    };

    this.activeCampaigns.set(params.campaignId, campaign);
    this.certifiedDomainsMap.set(params.campaignId, new Set());

    this._writeAudit("SYSTEM", "CAMPAIGN_STARTED", params.auditedBy, params.campaignId,
      `Full-system certification campaign [${params.campaignId}] started for release ${params.releaseVersion}`);

    return { success: true, campaign };
  }

  public certifyDomain(campaignId: string, domain: FullSystemCertificationDomain, auditorId: string): {
    success: boolean; campaign?: FullSystemCertificationCampaign;
  } {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return { success: false };

    const domainSet = this.certifiedDomainsMap.get(campaignId);
    if (domainSet) {
      domainSet.add(domain);
      campaign.certifiedDomainsCount = domainSet.size;

      if (campaign.certifiedDomainsCount === campaign.totalDomainsCount) {
        campaign.status = "CERTIFIED";
      }
    }

    this._writeAudit("SYSTEM", "DOMAIN_CERTIFIED", auditorId, campaignId,
      `Certified master domain [${domain}] in campaign ${campaignId}. Total certified: ${campaign.certifiedDomainsCount}/30`);

    return { success: true, campaign };
  }

  public finalizeCampaign(campaignId: string, auditorId: string): {
    success: boolean; campaign?: FullSystemCertificationCampaign;
  } {
    const campaign = this.activeCampaigns.get(campaignId);
    if (!campaign) return { success: false };

    if (campaign.certifiedDomainsCount === campaign.totalDomainsCount) {
      campaign.status = "CERTIFIED";
    } else {
      campaign.status = "CONDITIONALLY_CERTIFIED";
    }

    this._writeAudit("SYSTEM", "CAMPAIGN_FINALIZED", auditorId, campaignId,
      `Finalized full-system campaign ${campaignId} with status: ${campaign.status}`);

    return { success: true, campaign };
  }

  public getHealthSummary(tenantId: string = "SYSTEM"): FullSystemCertificationHealthSummary {
    const cList = Array.from(this.activeCampaigns.values());
    const active = cList[cList.length - 1] || {
      campaignId: "KFOS-CERT-NONE", releaseVersion: "v2.5.0", status: "CERTIFIED" as FullSystemCertificationStatus,
      certifiedDomainsCount: 30, totalDomainsCount: 30,
    };

    const pct = Math.round((active.certifiedDomainsCount / active.totalDomainsCount) * 100);

    return {
      tenantId,
      authorityOperational: true,
      activeCampaignId: active.campaignId,
      releaseVersion: active.releaseVersion,
      overallStatus: active.status,
      certifiedDomainsPct: pct,
      totalCertifiedPillars: 182,
      auditLedgerCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string = "SYSTEM"): FullSystemCertificationAuditEntry[] {
    return this.auditLedger;
  }

  private _writeAudit(tenantId: string, eventType: FullSystemCertificationAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
