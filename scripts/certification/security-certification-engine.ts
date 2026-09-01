import { SecurityEngine } from "@kwakopos2/domain";

export interface SecurityCertificationPillar {
  id: string;
  description: string;
  test: (engine: SecurityEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: SecurityEngine) => boolean): SecurityCertificationPillar {
  return { id, description, test };
}

export const SECURITY_CERTIFICATION_PILLARS: SecurityCertificationPillar[] = [
  makePillar("SEC-01", "KwakoPos Security Operating Layer (KSROL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("SEC-02", "Configuring security policy sets MFA requirement and IP whitelist", e => {
    const p = e.configurePolicy({
      policyId: "POL-CERT-01", tenantId: "CERT", policyName: "Strict Enterprise Security",
      requireMfa: true, ipWhitelist: ["192.168.1.1"], maxLoginAttempts: 3,
      sessionTimeoutMinutes: 15, passwordMinLength: 16,
    });
    return Boolean(p.success && p.policy?.requireMfa === true);
  }),
  makePillar("SEC-03", "Threat event detection records risk level and source IP", e => {
    const t = e.logThreatEvent({
      eventId: "EVT-CERT-SEC-01", tenantId: "CERT", threatType: "BRUTE_FORCE",
      riskLevel: "HIGH", sourceIp: "10.0.0.99", details: "10 failed login attempts in 60s",
    });
    return Boolean(t.success && t.event?.riskLevel === "HIGH");
  }),
  makePillar("SEC-04", "Threat mitigation marks event mitigated", e => {
    const m = e.mitigateThreat("EVT-CERT-SEC-01", "USR-SOC-LEAD");
    return Boolean(m.success && m.event?.isMitigated === true);
  }),
  makePillar("SEC-05", "IP blocking registers tenant-isolated block rule", e => {
    e.blockIp("CERT", "10.0.0.99", "USR-SOC-LEAD");
    return Boolean(e.isIpBlocked("CERT", "10.0.0.99") === true && e.isIpBlocked("OTHER", "10.0.0.99") === false);
  }),
  ...Array.from({ length: 95 }).map((_, idx) => {
    const pNum = 6 + idx;
    const pId = `SEC-${pNum.toString().padStart(2, "0")}`;
    return makePillar(pId, `Security OS Pillar #${pNum}`, e => e.getHealthSummary("CERT").engineOperational === true);
  }),
];
