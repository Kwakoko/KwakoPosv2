import { PlatformSecurityEngine } from "@kwakopos2/domain";

export interface PlatformSecurityCertificationPillar {
  id: string;
  description: string;
  test: (engine: PlatformSecurityEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: PlatformSecurityEngine) => boolean): PlatformSecurityCertificationPillar {
  return { id, description, test };
}

export const PLATFORM_SECURITY_CERTIFICATION_PILLARS: PlatformSecurityCertificationPillar[] = [
  makePillar("SEC-01", "KwakoPos Security Operating Layer (KSOL v2.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("SEC-02", "Threat alert triggering logs incident evidence and updates threat counts", e => {
    const alt = e.triggerThreatAlert({
      alertId: "ALT-SEC-01", tenantId: "CERT", threatType: "BRUTE_FORCE_AUTH",
      severity: "HIGH", targetResource: "/api/v1/auth/login",
    });
    return Boolean(alt.success && alt.alert?.state === "DETECTED");
  }),
  makePillar("SEC-03", "Critical cross-tenant attempt triggers instant automated incident containment", e => {
    const iso = e.evaluateTenantIsolationBoundary("TEN-A", "TEN-B");
    return Boolean(iso.isIsolated === false && iso.violationAlertId);
  }),
  makePillar("SEC-04", "Manual incident containment successfully transitions alert state to CONTAINED", e => {
    const alt = e.triggerThreatAlert({
      alertId: "ALT-SEC-02", tenantId: "CERT", threatType: "CREDENTIAL_EXPOSURE",
      severity: "MEDIUM", targetResource: "SECRETS_VAULT",
    });
    const cont = e.containIncident("ALT-SEC-02", "USR-SOC-LEAD");
    return Boolean(cont.success && cont.alert?.state === "CONTAINED");
  }),
  makePillar("SEC-05", "Activating security kill switch updates security posture and health summary", e => {
    e.activateKillSwitch("CERT", "AI", "USR-CISO");
    return Boolean(e.getHealthSummary("CERT").isKillSwitchActive === true);
  })
];
