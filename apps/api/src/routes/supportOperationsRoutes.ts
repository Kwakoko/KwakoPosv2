import type { FastifyInstance } from "fastify";
import { globalSupportOperationsService, type SupportSeverity, type SupportStatus } from "../services/supportOperationsService.js";

function tenantFrom(req: any): string {
  const tenantId = String(req.tenantContext?.tenantId || req.user?.tenantId || "").trim();
  if (!tenantId) throw new Error("TENANT_SCOPE_REQUIRED");
  return tenantId;
}

function actorFrom(req: any): string {
  return String(req.user?.sub || req.tenantContext?.userId || "system");
}

export function supportOperationsRoutes(server: FastifyInstance): void {
  server.post("/api/v1/support/tickets", async (req, reply) => {
    try {
      const body = (req.body || {}) as any;
      const ticket = await globalSupportOperationsService.createTicket({
        tenantId: tenantFrom(req), branchId: body.branchId, createdByUserId: actorFrom(req),
        subject: String(body.subject || "").trim(), description: String(body.description || "").trim(),
        severity: body.severity as SupportSeverity | undefined, category: body.category, module: body.module,
      });
      return reply.status(201).send({ success: true, data: ticket });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_TICKET_CREATE_FAILED", message: error instanceof Error ? error.message : "Unable to create ticket" } });
    }
  });

  server.get("/api/v1/support/tickets", async (req, reply) => {
    try {
      const status = String((req.query as any)?.status || "").trim() as SupportStatus;
      const tickets = await globalSupportOperationsService.listTickets(tenantFrom(req), status || undefined);
      return reply.send({ success: true, data: tickets });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_TICKET_LIST_FAILED", message: error instanceof Error ? error.message : "Unable to list tickets" } });
    }
  });

  server.get("/api/v1/support/tickets/:ticketId", async (req, reply) => {
    try {
      const ticket = await globalSupportOperationsService.getTicket(tenantFrom(req), String((req.params as any).ticketId));
      if (!ticket) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Support ticket not found" } });
      return reply.send({ success: true, data: ticket });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_TICKET_GET_FAILED", message: error instanceof Error ? error.message : "Unable to load ticket" } });
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/diagnose", async (req, reply) => {
    try {
      const data = await globalSupportOperationsService.diagnose(tenantFrom(req), String((req.params as any).ticketId));
      return reply.send({ success: true, data });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_DIAGNOSTIC_FAILED", message: error instanceof Error ? error.message : "Unable to diagnose ticket" } });
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/remediation", async (req, reply) => {
    try {
      const body = (req.body || {}) as any;
      const data = await globalSupportOperationsService.requestRemediation(tenantFrom(req), String((req.params as any).ticketId), String(body.action || ""), body.riskLevel || "SAFE", actorFrom(req));
      return reply.status(data.policy_decision === "HUMAN_APPROVAL_REQUIRED" ? 202 : 201).send({ success: true, data });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_REMEDIATION_FAILED", message: error instanceof Error ? error.message : "Unable to request remediation" } });
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/resolve", async (req, reply) => {
    try {
      const body = (req.body || {}) as any;
      const data = await globalSupportOperationsService.resolveTicket(tenantFrom(req), String((req.params as any).ticketId), actorFrom(req), String(body.verification || ""));
      return reply.send({ success: true, data });
    } catch (error) {
      return reply.status(400).send({ success: false, error: { code: "SUPPORT_RESOLUTION_FAILED", message: error instanceof Error ? error.message : "Unable to resolve ticket" } });
    }
  });

  server.get("/api/v1/support/summary", async (req, reply) => {
    try { return reply.send({ success: true, data: await globalSupportOperationsService.summary(tenantFrom(req)) }); }
    catch (error) { return reply.status(400).send({ success: false, error: { code: "SUPPORT_SUMMARY_FAILED", message: error instanceof Error ? error.message : "Unable to load support summary" } }); }
  });
}
