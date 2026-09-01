import {
  TenantLicense, UsageQuotaRecord, LicensingHealthSummary, LicensingAuditEntry,
  SubscriptionTier, LicenseStatus,
} from "@kwakopos2/contracts";

export class LicensingEngine {
  private licenses: Map<string, TenantLicense> = new Map();
  private quotas: Map<string, UsageQuotaRecord> = new Map();
  private auditLedger: LicensingAuditEntry[] = [];

  public issueLicense(params: Omit<TenantLicense, "createdAt" | "updatedAt" | "status" | "maxBranches" | "maxUsers" | "enabledFeatures"> & {
    status?: LicenseStatus;
    maxBranches?: number;
    maxUsers?: number;
    enabledFeatures?: string[];
  }): {
    success: boolean; license?: TenantLicense; error?: string;
  } {
    if (!params.licenseId || !params.tenantId || !params.tier) {
      return { success: false, error: "licenseId, tenantId, and tier are required" };
    }

    const now = new Date().toISOString();
    const license: TenantLicense = {
      ...params,
      status: params.status ?? "ACTIVE",
      maxBranches: params.maxBranches ?? 5,
      maxUsers: params.maxUsers ?? 20,
      enabledFeatures: params.enabledFeatures ?? ["POS", "INVENTORY", "REPORTS"],
      createdAt: now,
      updatedAt: now,
    };

    this.licenses.set(params.tenantId, license);
    this._writeAudit(params.tenantId, "LICENSE_ISSUED", "SYSTEM", params.licenseId,
      `License issued: Tier=${params.tier}, Status=${license.status}`);

    return { success: true, license };
  }

  public checkEntitlement(tenantId: string, featureKey: string): boolean {
    const license = this.licenses.get(tenantId);
    if (!license || license.status !== "ACTIVE") {
      this._writeAudit(tenantId, "FEATURE_ENTITLEMENT_CHECK", "SYSTEM", featureKey, `Entitlement check failed: No active license`);
      return false;
    }
    const entitled = license.enabledFeatures.includes(featureKey) || license.tier === "ENTERPRISE";
    this._writeAudit(tenantId, "FEATURE_ENTITLEMENT_CHECK", "SYSTEM", featureKey, `Entitlement check for ${featureKey}: ${entitled}`);
    return entitled;
  }

  public setUsageQuota(params: UsageQuotaRecord): { success: boolean } {
    this.quotas.set(`${params.tenantId}:${params.metricName}`, params);
    if (params.currentUsage >= params.limitQuota) {
      this._writeAudit(params.tenantId, "QUOTA_EXCEEDED", "SYSTEM", params.metricName,
        `Quota exceeded for ${params.metricName}: ${params.currentUsage}/${params.limitQuota}`);
    }
    return { success: true };
  }

  public getHealthSummary(tenantId: string): LicensingHealthSummary {
    const license = this.licenses.get(tenantId);
    const qList = Array.from(this.quotas.values()).filter(q => q.tenantId === tenantId);
    
    let maxUtil = 0;
    if (qList.length > 0) {
      maxUtil = Math.max(...qList.map(q => Math.min(100, Math.round((q.currentUsage / q.limitQuota) * 100))));
    }

    return {
      tenantId,
      engineOperational: true,
      activeLicenseTier: license?.tier ?? "FREE_TRIAL",
      licenseStatus: license?.status ?? "EXPIRED",
      isEntitled: license?.status === "ACTIVE",
      quotaUtilizationPercent: maxUtil,
      auditEntryCount: this.getAuditTrail(tenantId).length,
    };
  }

  public getAuditTrail(tenantId: string): LicensingAuditEntry[] {
    return this.auditLedger.filter(a => a.tenantId === tenantId);
  }

  private _writeAudit(tenantId: string, eventType: LicensingAuditEntry["eventType"], actorId: string, targetEntityId: string, details: string) {
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
