import { describe, it, expect, beforeEach } from "vitest";
import { IntegrationEngine } from "@kwakopos2/domain";

describe("Phase 39 — KwakoPos Integration Center (KIOL v1.0.0)", () => {
  let engine: IntegrationEngine;

  beforeEach(() => {
    engine = new IntegrationEngine();
  });

  it("should list connectors and install integration with configuration", () => {
    const connectors = engine.listConnectors();
    expect(connectors.length).toBeGreaterThanOrEqual(4);

    const inst = engine.installIntegration({
      integrationId: "INT-TEST-01", tenantId: "TEN-01", connectorId: "CONN-TRA-EFDMS",
      displayName: "TRA EFDms Gateway", baseUrl: "https://efdms.tra.go.tz/api",
    });
    expect(inst.success).toBe(true);
    expect(inst.config?.status).toBe("ACTIVE");
  });

  it("should store credential and execute zero-trust 5-stage secret rotation", () => {
    engine.installIntegration({
      integrationId: "INT-TEST-02", tenantId: "TEN-01", connectorId: "CONN-WHATSAPP",
      displayName: "WhatsApp Gateway", baseUrl: "https://graph.facebook.com",
    });

    const set = engine.setCredential({
      credentialId: "CRED-TEST-01", tenantId: "TEN-01", integrationId: "INT-TEST-02",
      authType: "API_KEY", encryptedSecret: "ENC-SECRET-OLD", scopes: ["messages.send"],
    });
    expect(set.success).toBe(true);

    const rot = engine.rotateCredential("CRED-TEST-01", "ENC-SECRET-NEW", "USR-ADMIN");
    expect(rot.success).toBe(true);
    expect(rot.credential?.rotationState).toBe("ACTIVE");
  });

  it("should process webhook verification, event normalization, and retry dead-letters", () => {
    engine.installIntegration({
      integrationId: "INT-TEST-03", tenantId: "TEN-01", connectorId: "CONN-DHL",
      displayName: "DHL Express", baseUrl: "https://dhl.com/api",
    });

    const evt = engine.receiveWebhookEvent({
      eventId: "EVT-TEST-01", tenantId: "TEN-01", integrationId: "INT-TEST-03",
      eventType: "payment.success", payload: { amount: 200000 },
      rawSignature: "VALID-HMAC-SIGNATURE", hmacSecret: "SECRET",
    });
    expect(evt.signatureVerified).toBe(true);
    expect(evt.eventLog?.eventType).toBe("PAYMENT_CONFIRMED");

    engine.receiveWebhookEvent({
      eventId: "EVT-TEST-FAIL", tenantId: "TEN-01", integrationId: "INT-TEST-03",
      eventType: "order.failed", payload: {}, rawSignature: "", hmacSecret: "SECRET",
    });

    let ret: any;
    for (let i = 0; i < 5; i++) {
      ret = engine.retryWebhookEvent("EVT-TEST-FAIL");
    }
    expect(ret.eventLog?.status).toBe("DEAD_LETTER");
  });

  it("should run sync job, evaluate circuit breaker, and return health summary", () => {
    engine.installIntegration({
      integrationId: "INT-TEST-04", tenantId: "TEN-01", connectorId: "CONN-QUICKBOOKS",
      displayName: "QuickBooks Sync", baseUrl: "https://quickbooks.api.com",
    });

    const job = engine.startSyncJob({
      jobId: "JOB-TEST-01", tenantId: "TEN-01", integrationId: "INT-TEST-04",
      mode: "INCREMENTAL_SYNC", direction: "BIDIRECTIONAL",
    });
    expect(job.success).toBe(true);

    const exec = engine.executeSync("JOB-TEST-01", [{ id: 1 }], [{ id: 2 }]);
    expect(exec.job?.status).toBe("COMPLETED");

    const cbState = engine.evaluateCircuitBreaker("INT-TEST-04", 45.0);
    expect(cbState).toBe("OPEN");

    const hs = engine.getHealthSummary("TEN-01");
    expect(hs.engineOperational).toBe(true);
    expect(hs.circuitBreakersOpenCount).toBe(1);
  });
});
