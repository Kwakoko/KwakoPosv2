import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateRollbackRequestPayloadSchema,
  ApproveRollbackPayloadSchema,
  RejectRollbackPayloadSchema,
  ExecuteRollbackPayloadSchema,
  EmergencyRollbackPayloadSchema,
  TenantContext,
} from "@kwakopos2/contracts";
import { globalRollbackAuthorizationService } from "../services/rollbackAuthorizationService.js";
import { requireStepUpToken } from "../services/stepUpGuard.js";

// ============================================================
// KWAKOPOS V2 — ROLLBACK AUTHORIZATION API ROUTES
// ============================================================

export function rollbackAuthorizationRoutes(server: FastifyInstance): void {
  function getContext(req: FastifyRequest): TenantContext {
    const ctx = (req as any).tenantContext;
    if (!ctx) {
      throw new Error("UNAUTHORIZED: Authentication is required");
    }
    return ctx as TenantContext;
  }

  function formatError(reply: FastifyReply, error: unknown) {
    const err = error as any;
    const statusCode = err?.statusCode || 400;
    const code = err?.code || "BAD_REQUEST";
    const message = statusCode === 401
      ? "Authentication failed"
      : statusCode === 403
        ? "Access denied"
        : statusCode >= 500
          ? "An unexpected server error occurred"
          : "Rollback operation could not be completed";
    return reply.status(statusCode).send({
      success: false,
      error: { code, message },
    });
  }

  // 1. Submit rollback request or calculate dry-run
  server.post("/api/v1/rollback/requests", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const parsed = CreateRollbackRequestPayloadSchema.parse(req.body);
      const result = await globalRollbackAuthorizationService.createRequest(ctx, parsed);
      return reply.status(result.dryRun ? 200 : 201).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 2. Calculate impact preview for a request
  server.post("/api/v1/rollback/requests/:id/preview", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const report = await globalRollbackAuthorizationService.getImpactPreview(ctx, id);
      return reply.status(200).send({
        success: true,
        data: report,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 3. Approve rollback request (Four-eyes dual control)
  server.post("/api/v1/rollback/requests/:id/approve", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const parsed = ApproveRollbackPayloadSchema.parse(req.body);
      const updated = await globalRollbackAuthorizationService.approveRequest(ctx, id, parsed);
      return reply.status(200).send({
        success: true,
        data: updated,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 4. Reject rollback request
  server.post("/api/v1/rollback/requests/:id/reject", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const parsed = RejectRollbackPayloadSchema.parse(req.body);
      const updated = await globalRollbackAuthorizationService.rejectRequest(ctx, id, parsed);
      return reply.status(200).send({
        success: true,
        data: updated,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 5. Cancel rollback request
  server.post("/api/v1/rollback/requests/:id/cancel", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const { reason } = (req.body as any) || {};
      const updated = await globalRollbackAuthorizationService.cancelRequest(ctx, id, reason);
      return reply.status(200).send({
        success: true,
        data: updated,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 6. Execute rollback (Acquires lock, sets sync barrier, creates snapshot, executes reversal, increments sync epoch)
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const stepUp = String(req.headers["x-step-up-token"] || "");
      if (!stepUp) throw Object.assign(new Error("STEP_UP_REQUIRED"), { statusCode: 403, code: "STEP_UP_REQUIRED" });
      const verifiedStepUp = await import("../services/superAdminSecurityService.js").then(({ verifyStepUpToken }) => verifyStepUpToken(stepUp, "ROLLBACK_EXECUTE"));
      if (verifiedStepUp.userId !== ctx.userId) throw Object.assign(new Error("STEP_UP_ACTOR_MISMATCH"), { statusCode: 403, code: "STEP_UP_ACTOR_MISMATCH" });
      const parsed = ExecuteRollbackPayloadSchema.parse(req.body);
      const result = await globalRollbackAuthorizationService.executeRollback(ctx, id, parsed);
      return reply.status(200).send({
      const result = await globalRollbackAuthorizationService.executeRollback(ctx, id, parsed);
      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 7. Emergency Rollback (Fast-path with incident reference)
  server.post("/api/v1/rollback/emergency", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const parsed = EmergencyRollbackPayloadSchema.parse(req.body);
  server.post("/api/v1/rollback/emergency", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const stepUp = String(req.headers["x-step-up-token"] || "");
      if (!stepUp) throw Object.assign(new Error("STEP_UP_REQUIRED"), { statusCode: 403, code: "STEP_UP_REQUIRED" });
      const verifiedStepUp = await import("../services/superAdminSecurityService.js").then(({ verifyStepUpToken }) => verifyStepUpToken(stepUp, "ROLLBACK_EMERGENCY"));
      if (verifiedStepUp.userId !== ctx.userId) throw Object.assign(new Error("STEP_UP_ACTOR_MISMATCH"), { statusCode: 403, code: "STEP_UP_ACTOR_MISMATCH" });
      const parsed = EmergencyRollbackPayloadSchema.parse(req.body);
      const result = await globalRollbackAuthorizationService.emergencyRollback(ctx, parsed);
      return reply.status(200).send({
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 8. List rollback requests
  server.get("/api/v1/rollback/requests", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const query = (req.query as any) || {};
      const requests = await globalRollbackAuthorizationService.listRequests(ctx, {
        status: query.status,
        riskLevel: query.riskLevel,
        scope: query.scope,
        branchId: query.branchId,
        tenantId: query.tenantId,
      });
      return reply.status(200).send({
        success: true,
        data: requests,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 9. Get rollback request by ID
  server.get("/api/v1/rollback/requests/:id", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const request = await globalRollbackAuthorizationService.getRequest(ctx, id);
      if (!request) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Rollback request ${id} not found.` },
        });
      }
      return reply.status(200).send({
        success: true,
        data: request,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 10. Get verification report
  server.get("/api/v1/rollback/requests/:id/verification", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const { id } = req.params as { id: string };
      const report = await globalRollbackAuthorizationService.getVerificationReport(ctx, id);
      if (!report) {
        return reply.status(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `Verification report for request ${id} not found.` },
        });
      }
      return reply.status(200).send({
        success: true,
        data: report,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 10. Audit trail (Tamper-evident cryptographically chained history)
  server.get("/api/v1/rollback/audit", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const query = (req.query as any) || {};
      const events = await globalRollbackAuthorizationService.getAuditTrail(ctx, query.requestId, query.tenantId);
      return reply.status(200).send({
        success: true,
        data: events,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });

  // 11. Rollback KPIs & Telemetry Metrics
  server.get("/api/v1/rollback/metrics", async (req, reply) => {
    try {
      const ctx = getContext(req);
      const metrics = await globalRollbackAuthorizationService.getMetrics(ctx);
      return reply.status(200).send({
        success: true,
        data: metrics,
      });
    } catch (error) {
      return formatError(reply, error);
    }
  });
}
