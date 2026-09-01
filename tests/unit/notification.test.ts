import { describe, it, expect, beforeEach } from "vitest";
import { NotificationEngine } from "@kwakopos2/domain";

describe("Phase 42 — KwakoPos Notification OS (KNCOL v1.0.0)", () => {
  let engine: NotificationEngine;

  beforeEach(() => {
    engine = new NotificationEngine();
  });

  it("should send multi-channel notifications and enforce recipient opt-outs", () => {
    const s = engine.sendNotification({
      messageId: "MSG-T1", tenantId: "TEN-01", channel: "WHATSAPP",
      recipient: "+255788990011", body: "Your order is ready for pickup",
    });
    expect(s.success).toBe(true);

    engine.registerOptOut("TEN-01", "WHATSAPP", "+255788990011");

    const s2 = engine.sendNotification({
      messageId: "MSG-T2", tenantId: "TEN-01", channel: "WHATSAPP",
      recipient: "+255788990011", body: "Second alert",
    });
    expect(s2.success).toBe(false);

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.blockedConsentCount).toBe(1);
  });
});
