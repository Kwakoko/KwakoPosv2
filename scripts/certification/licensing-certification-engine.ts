import { LicensingEngine } from "@kwakopos2/domain";

export interface LicensingCertificationPillar {
  id: string;
  description: string;
  test: (engine: LicensingEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: LicensingEngine) => boolean): LicensingCertificationPillar {
  return { id, description, test };
}

export const LICENSING_CERTIFICATION_PILLARS: LicensingCertificationPillar[] = [
  makePillar("LIC-01", "KwakoPos Licensing Operating Layer (KPLOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("LIC-02", "Issuing PRO license stores tier, limits, and enabled features", e => {
    const l = e.issueLicense({
      licenseId: "LIC-CERT-01", tenantId: "CERT", tier: "PRO",
      validFrom: "2026-01-01", validUntil: "2026-12-31",
      enabledFeatures: ["POS", "INVENTORY", "WORKFORCE", "CRM"],
    });
    return Boolean(l.success && l.license?.tier === "PRO");
  }),
  makePillar("LIC-03", "Entitlement check verifies enabled feature access", e => {
    const ok = e.checkEntitlement("CERT", "WORKFORCE");
    const fail = e.checkEntitlement("CERT", "AI_ADVANCED_STUDIO");
    return Boolean(ok === true && fail === false);
  }),
  makePillar("LIC-04", "Setting quota calculates maximum utilization percentage", e => {
    e.setUsageQuota({ tenantId: "CERT", metricName: "API_CALLS", currentUsage: 7500, limitQuota: 10000, unitName: "requests" });
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.quotaUtilizationPercent === 75);
  }),
  makePillar("LIC-05", "Audit trail records license issuance and entitlement checks", e => {
    return e.getAuditTrail("CERT").length >= 3;
  })
];
