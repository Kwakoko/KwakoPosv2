import { LicensingEngine } from "@kwakopos2/domain";
import { UsageQuotaRecord } from "@kwakopos2/contracts";

export class LicensingService {
  private engine: LicensingEngine;

  constructor(engine?: LicensingEngine) {
    this.engine = engine ?? new LicensingEngine();
  }

  public getEngine(): LicensingEngine {
    return this.engine;
  }

  public issueLicense(params: Parameters<LicensingEngine["issueLicense"]>[0]) {
    return this.engine.issueLicense(params);
  }

  public checkEntitlement(tenantId: string, featureKey: string) {
    return this.engine.checkEntitlement(tenantId, featureKey);
  }

  public setUsageQuota(params: UsageQuotaRecord) {
    return this.engine.setUsageQuota(params);
  }

  public getHealthSummary(tenantId: string) {
    return this.engine.getHealthSummary(tenantId);
  }
}

export const globalLicensingService = new LicensingService();
