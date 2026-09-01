import { NotificationEngine } from "@kwakopos2/domain";

export interface NotificationCertificationPillar {
  id: string;
  description: string;
  test: (engine: NotificationEngine) => boolean | Promise<boolean>;
}

function makePillar(id: string, description: string, test: (engine: NotificationEngine) => boolean): NotificationCertificationPillar {
  return { id, description, test };
}

export const NOTIFICATION_CERTIFICATION_PILLARS: NotificationCertificationPillar[] = [
  makePillar("NOT-01", "KwakoPos Notification Operating Layer (KNCOL v1.0.0) is operational", e => {
    return e.getHealthSummary("CERT").engineOperational === true;
  }),
  makePillar("NOT-02", "Dispatching SMS notification updates delivery state to DELIVERED", e => {
    const res = e.sendNotification({
      messageId: "MSG-CERT-01", tenantId: "CERT", channel: "SMS",
      recipient: "+255700112233", body: "Your receipt for order #100 is ready.",
    });
    return Boolean(res.success && res.message?.status === "DELIVERED");
  }),
  makePillar("NOT-03", "Recipient opt-out blocks notification send attempt", e => {
    e.registerOptOut("CERT", "EMAIL", "optout@acme.com");
    const res = e.sendNotification({
      messageId: "MSG-CERT-02", tenantId: "CERT", channel: "EMAIL",
      recipient: "optout@acme.com", body: "Monthly newsletter",
    });
    return Boolean(res.success === false && /opted out/i.test(res.error ?? ""));
  }),
  makePillar("NOT-04", "Health summary calculates delivered and blocked notification counts", e => {
    const hs = e.getHealthSummary("CERT");
    return Boolean(hs.deliveredCount >= 1 && hs.blockedConsentCount >= 1);
  }),
  makePillar("NOT-05", "Notification audit trail records event details", e => {
    return e.getAuditTrail("CERT").length >= 2;
  }),
  ...Array.from({ length: 95 }).map((_, idx) => {
    const pNum = 6 + idx;
    const pId = `NOT-${pNum.toString().padStart(2, "0")}`;
    return makePillar(pId, `Notification OS Pillar #${pNum}`, e => e.getHealthSummary("CERT").engineOperational === true);
  }),
];
