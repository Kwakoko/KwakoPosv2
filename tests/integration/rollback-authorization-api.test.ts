import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../../apps/api/src/server.js";
import { loadConfig } from "../../packages/config/src/index.js";
import { prisma } from "../../packages/database/src/client.js";
import { randomUUID } from "node:crypto";
import { issueStepUpToken } from "../../apps/api/src/services/superAdminSecurityService.js";

describe("KwakoPos Rollback Authorization Platform - Integration Tests", () => {
  let server: any;
  const tenantId = randomUUID();
  const branchId = randomUUID();

  beforeAll(async () => {
    await prisma.tenant.create({
      data: {
        id: tenantId,
        name: "Rollback Authorization Test Tenant",
        slug: "rollback-" + tenantId.slice(0, 8),
        branches: { create: { id: branchId, name: "Rollback Test Branch", code: "RB-" + branchId.slice(0, 8) } },
      },
    });
    const config = loadConfig({
      APP_VERSION: "2.13.0",
      NODE_ENV: "test",
      PORT: "3005",
    });
    server = buildServer({ config, productionPersistence: true });
    await server.ready();
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  const requesterHeaders = {
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
    "x-user-id": "user-requester-01",
    "x-role": "BRANCH_MANAGER",
  };

  const peerApproverHeaders = {
    "x-tenant-id": tenantId,
    "x-branch-id": branchId,
    "x-user-id": "user-peer-approver-02",
    "x-role": "SUPER_ADMIN",
    "x-step-up-token": issueStepUpToken("user-peer-approver-02", "ROLLBACK_EXECUTE"),
  };

  describe("1. Dry-Run Impact Simulation", () => {
    it("POST /api/v1/rollback/requests with dryRun: true simulates impact without persisting request", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/rollback/requests",
        headers: requesterHeaders,
        payload: {
          rollbackScope: "RECORD",
          targetType: "TRANSACTION",
          targetId: "sale-tx-8899",
          reason: "Cashier entered duplicate item during network glitch",
          dryRun: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.dryRun).toBe(true);
      expect(json.data.impactReport).toBeDefined();
      expect(json.data.impactReport.recordsAffected).toBeDefined();

      // Verify request was not saved in persistent list
      const listRes = await server.inject({
        method: "GET",
        url: "/api/v1/rollback/requests",
        headers: requesterHeaders,
      });
      const listJson = JSON.parse(listRes.payload);
      expect(listJson.data.some((r: any) => r.targetId === "sale-tx-8899")).toBe(false);
    });
  });

  describe("2. Full Governed Rollback Lifecycle with Four-Eyes & Confirmation Phrase", () => {
    let createdRequestId: string;

    it("Requester creates a HIGH risk branch-level rollback request", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/rollback/requests",
        headers: requesterHeaders,
        payload: {
          rollbackScope: "BRANCH",
          targetType: "BRANCH_CONFIG",
          targetId: branchId,
          reason: "Critical database corrupt state after unscheduled power shutdown",
          dryRun: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.request).toBeDefined();
      expect(json.data.request.status).toBe("REQUESTED");
      expect(json.data.request.riskLevel).toBe("HIGH");
      expect(json.data.request.requestedBy).toBe("user-requester-01");

      createdRequestId = json.data.request.id;
    });

    it("Four-Eyes Violation: Requester is prevented from approving their own request", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/rollback/requests/${createdRequestId}/approve`,
        headers: requesterHeaders, // Same user id as requester
        payload: {
          reason: "Self-approval attempt by the original requester",
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("SELF_APPROVAL_PROHIBITED");
    });

    it("Authorized peer approver successfully approves the rollback request", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/rollback/requests/${createdRequestId}/approve`,
        headers: peerApproverHeaders, // Different user
        payload: {
          reason: "Verified branch state logs; rollback authorized under protocol",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("APPROVED");
      expect(json.data.approvedBy).toBe("user-peer-approver-02");
    });

    it("Execution fails if mandatory idempotencyKey is missing", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/rollback/requests/${createdRequestId}/execute`,
        headers: peerApproverHeaders,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(false);
    });

    it("Execution succeeds with idempotency key and generates verification report", async () => {
      const res = await server.inject({
        method: "POST",
        url: `/api/v1/rollback/requests/${createdRequestId}/execute`,
        headers: peerApproverHeaders,
        payload: {
          idempotencyKey: "exec-idem-001",
          confirmationPhrase: "AUTHORIZE ROLLBACK",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.request.status).toBe("VERIFIED");
      expect(json.data.verificationReport).toBeDefined();
      expect(json.data.verificationReport.overallStatus).toBe("PASS");
    });

    it("GET /api/v1/rollback/requests/:id/verification retrieves the post-execution verification report", async () => {
      const res = await server.inject({
        method: "GET",
        url: `/api/v1/rollback/requests/${createdRequestId}/verification`,
        headers: peerApproverHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.overallStatus).toBe("PASS");
      expect(json.data.rollbackRequestId).toBe(createdRequestId);
    });
  });

  describe("3. Level 5 Emergency Recovery Path", () => {
    it("POST /api/v1/rollback/emergency executes emergency recovery with mandatory incident reference", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/rollback/emergency",
        headers: { ...peerApproverHeaders, "x-step-up-token": issueStepUpToken("user-peer-approver-02", "ROLLBACK_EMERGENCY") },
        payload: {
          rollbackScope: "EMERGENCY",
          targetType: "PLATFORM_DEPLOYMENT",
          targetId: "datacenter-primary",
          incidentId: "INC-2026-POWER-OUTAGE-099",
          emergencyReason: "Critical unrecoverable cluster state after storage SAN disruption",
          idempotencyKey: "emerg-idem-001",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.request.rollbackScope).toBe("EMERGENCY");
      expect(json.data.request.riskLevel).toBe("CRITICAL");
      expect(json.data.request.status).toBe("VERIFIED");
      expect(json.data.request.isEmergency).toBe(true);
      expect(json.data.verificationReport.overallStatus).toBe("PASS");
    });
  });

  describe("4. Cryptographic Audit Ledger & Platform Telemetry", () => {
    it("GET /api/v1/rollback/audit returns tamper-evident SHA-256 chained audit events", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/rollback/audit",
        headers: peerApproverHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      // Verify each event has eventHash
      for (const ev of json.data) {
        expect(ev.eventHash).toMatch(/^[a-f0-9]{64}$/);
      }
    });

    it("GET /api/v1/rollback/metrics returns comprehensive platform rollback KPIs", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/rollback/metrics",
        headers: peerApproverHeaders,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.totalRequests).toBeGreaterThanOrEqual(2);
      expect(json.data.completedRequests).toBeGreaterThanOrEqual(2);
      expect(json.data.emergencyRequests).toBeGreaterThanOrEqual(1);
    });
  });
});
