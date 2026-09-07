import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { loadConfig } from "../../packages/config/src/index.js";

describe("Legal & Compliance Governance Platform Integration Tests", () => {
  let server: any;

  beforeAll(async () => {
    const config = loadConfig({
      APP_VERSION: "2.2.0",
      NODE_ENV: "test",
      PORT: "3004",
    });
    server = buildServer({ config, productionPersistence: false });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  const authHeaders = {
    "x-tenant-id": "tenant-legal-test-01",
    "x-branch-id": "branch-legal-test-01",
    "x-user-id": "user-legal-test-01",
  };

  const adminHeaders = {
    "x-tenant-id": "tenant-legal-test-01",
    "x-branch-id": "branch-legal-test-01",
    "x-user-id": "admin-legal-test-01",
  };

  describe("Public Compliance & Legal Transparency Endpoints (No Auth Required)", () => {
    it("GET /api/legal/documents returns all 22 statutory documents", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/documents",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBe(22);

      const slugs = json.data.map((d: any) => d.slug);
      expect(slugs).toContain("privacy-policy");
      expect(slugs).toContain("data-protection-policy");
      expect(slugs).toContain("terms-of-service");
      expect(slugs).toContain("cookie-policy");
      expect(slugs).toContain("dpa");
      expect(slugs).toContain("software-license");
    });

    it("GET /api/legal/documents?language=sw returns official Swahili titles", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/documents?language=sw",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      const terms = json.data.find((d: any) => d.slug === "terms-of-service");
      expect(terms).toBeDefined();
      expect(terms.title).toContain("Masharti");
    });

    it("GET /api/legal/documents/:slug returns document with cryptographic tamper verification", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/documents/terms-of-service",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.document.slug).toBe("terms-of-service");
      expect(json.data.isTamperVerified).toBe(true);
      expect(json.data.activeVersion.cryptographicIntegrityHash).toBeDefined();
    });

    it("GET /api/legal/subprocessors returns authorized subprocessor registry", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/subprocessors",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(5);

      const providers = json.data.map((s: any) => s.provider);
      expect(providers).toContain("Google Cloud Platform");
      expect(providers).toContain("Tanzania Revenue Authority");
      expect(providers).toContain("Vodacom Tanzania");
      expect(providers).toContain("Cloudflare");
    });

    it("GET /api/legal/oss-notices returns open source software licenses & attributions", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/oss-notices",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(4);
    });

    it("GET /api/legal/cookies returns cookie & storage transparency manifest", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/cookies",
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.categories.length).toBeGreaterThan(0);
      expect(json.data.statement).toContain("KwakoPos");
    });
  });

  describe("User Consent & Acceptance Lifecycle", () => {
    let targetDoc: any;

    beforeAll(async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/documents/terms-of-service",
      });
      const json = JSON.parse(res.payload);
      targetDoc = json.data;
    });

    it("GET /api/legal/acceptance/status identifies non-compliant user needing acceptance", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/acceptance/status",
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.isCompliant).toBe(false);
      expect(json.data.requiredDocuments.length).toBeGreaterThan(0);
    });

    it("POST /api/legal/acceptance/submit records consent with cryptographic evidence hash", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/legal/acceptance/submit",
        headers: authHeaders,
        payload: {
          documentId: targetDoc.document.id,
          documentVersion: targetDoc.activeVersion.version,
          language: "en",
          acceptanceMethod: "CLICK_WRAP",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.evidenceHash).toBeDefined();
      expect(json.data.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
      expect(json.data.consentStatus).toBe("ACCEPTED");
    });

    it("POST /api/legal/acceptance/withdraw withdraws optional consent", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/legal/acceptance/withdraw",
        headers: authHeaders,
        payload: {
          documentId: targetDoc.document.id,
          documentVersion: targetDoc.activeVersion.version,
          reason: "User revoked marketing or optional data sharing consent",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.consentStatus).toBe("WITHDRAWN");
      expect(json.data.withdrawnAt).not.toBeNull();
    });
  });

  describe("Data Subject Rights (DSR) & Portability", () => {
    let createdDsrId: string;
    let exportJobId: string;

    it("POST /api/legal/dsr/request files a formal DSR request", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/legal/dsr/request",
        headers: authHeaders,
        payload: {
          requestType: "ACCESS",
          details: "Requesting full record of store manager transaction history for 2026.",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.requestType).toBe("ACCESS");
      expect(json.data.status).toBe("SUBMITTED");
      createdDsrId = json.data.id;
    });

    it("GET /api/legal/dsr/requests lists user's registered DSR requests", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/dsr/requests",
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((r: any) => r.id === createdDsrId)).toBe(true);
    });

    it("POST /api/admin/legal/dsr/:id/status updates DSR status under admin oversight", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/admin/legal/dsr/${createdDsrId}/status`,
        headers: adminHeaders,
        payload: {
          status: "COMPLETED",
          resolution: "Data package generated and securely dispatched to data subject.",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("COMPLETED");
      expect(json.data.resolvedAt).not.toBeNull();
    });

    it("POST /api/legal/export/request creates data export job", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/legal/export/request",
        headers: authHeaders,
        payload: {
          scope: "USER_SPECIFIC",
        },
      });

      expect(res.statusCode).toBe(202);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      exportJobId = json.data.id;
    });

    it("GET /api/legal/export/download/:jobId sanitizes and removes credentials", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/legal/export/download/${exportJobId}`,
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.exportPayload).toBeDefined();

      // Verify secrets scrubbing
      const profile = json.data.exportPayload.userProfile;
      expect(profile.passwordHash).toBe("[REDACTED_FOR_PRIVACY]");
      expect(profile.apiKey).toBe("[REDACTED_FOR_PRIVACY]");
    });
  });

  describe("Super Admin Compliance Tower, Legal Holds & Retention", () => {
    let holdId: string;

    it("GET /api/admin/legal/governance-tower returns platform-wide metrics", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/admin/legal/governance-tower",
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.totalDocuments).toBe(22);
      expect(json.data.cryptographicHealth.allHashesValid).toBe(true);
      expect(json.data.cryptographicHealth.verifiedDocumentsCount).toBeGreaterThan(0);
    });

    it("POST /api/admin/legal/documents/:id/publish publishes new version with SHA-256 seal", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/admin/legal/documents/terms-of-service/publish",
        headers: adminHeaders,
        payload: {
          version: "2.3.0",
          language: "en",
          title: "Terms of Service (v2.3.0 Extended)",
          content: "Updated platform terms with enhanced dispute resolution.",
          summaryOfChanges: "Updated arbitration venue to Dar es Salaam.",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.version).toBe("2.3.0");
      expect(json.data.cryptographicIntegrityHash).toBeDefined();
    });

    it("POST /api/admin/legal/holds creates a binding legal hold", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/admin/legal/holds",
        headers: adminHeaders,
        payload: {
          tenantId: "tenant-legal-test-01",
          authority: "TRA_AUDIT_COMMISSION",
          reason: "Tax assessment investigation for year 2025/2026",
          targetEntityType: "AUDIT_RECORD",
          targetEntityId: "*",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.status).toBe("ACTIVE");
      holdId = json.data.id;
    });

    it("POST /api/admin/legal/retention/run protects held records during retention sweep", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/admin/legal/retention/run",
        headers: adminHeaders,
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("SUCCESS");
      expect(json.data.heldCount).toBeGreaterThan(0);
      expect(json.data.evidenceSha256).toBeDefined();
    });

    it("POST /api/admin/legal/holds/:id/release releases legal hold", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/admin/legal/holds/${holdId}/release`,
        headers: adminHeaders,
        payload: {
          releaseNotes: "TRA tax assessment concluded satisfactorily without penalties.",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("RELEASED");
      expect(json.data.releasedAt).not.toBeNull();
    });

    it("POST /api/admin/legal/incidents records and registers security/privacy incident", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/admin/legal/incidents",
        headers: adminHeaders,
        payload: {
          incidentType: "UNAUTHORIZED_ACCESS",
          severity: "HIGH",
          title: "Brute force attempts against test cash drawer terminal",
          summary: "Multiple failed authentication attempts detected from unauthorized IP.",
          affectedTenantId: "tenant-legal-test-01",
          notificationRequired: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.id).toBeDefined();
      expect(json.data.incidentNumber).toMatch(/^INC-SEC-/);
    });

    it("GET /api/admin/legal/incidents lists logged security incidents", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/admin/legal/incidents",
        headers: adminHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });
  });

  describe("Tenant Custom Terms & Disclosures", () => {
    it("PUT /api/legal/tenant-settings upserts tenant custom legal terms", async () => {
      const res = await server.inject({
        method: "PUT",
        url: "/api/legal/tenant-settings",
        headers: adminHeaders,
        payload: {
          documentType: "CUSTOMER_TERMS",
          title: "Supermarket Customer Terms & Return Policy",
          content: "Goods once sold can be exchanged within 48 hours with receipt.",
          version: "1.0",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("Supermarket Customer Terms & Return Policy");
    });

    it("GET /api/legal/tenant-settings retrieves tenant legal documents", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/legal/tenant-settings",
        headers: authHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((d: any) => d.title === "Supermarket Customer Terms & Return Policy")).toBe(true);
    });
  });
});
