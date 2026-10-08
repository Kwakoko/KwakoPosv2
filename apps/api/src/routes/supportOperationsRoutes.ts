import type { FastifyInstance } from "fastify";
import { globalSupportOperationsService, type SupportSeverity, type SupportStatus } from "../services/supportOperationsService.js";
import { globalSupportTicketLifecycleService, type SupportLifecycleStatus, type SupportTicketPriority } from "../services/supportTicketLifecycleService.js";

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
      const b = (req.body || {}) as any;
      const priority = String(b.priority || b.severity || "P3").trim().toUpperCase() as SupportSeverity;
      const ticket = await globalSupportOperationsService.createTicket({
        tenantId: tenantFrom(req),
        branchId: b.branchId,
        createdByUserId: actorFrom(req),
        subject: String(b.subject || "").trim(),
        description: String(b.description || "").trim(),
        severity: priority,
        category: b.category,
        module: b.module,
      });
      return reply.status(201).send({ success: true, data: ticket });
    } catch {
      return reply.status(400).send({ success:false,error:{code:"SUPPORT_TICKET_CREATE_FAILED",message:"Unable to create ticket"} });
    }
  });

  server.get("/api/v1/support/tickets", async (req, reply) => {
    try {
      const status = String((req.query as any)?.status || "").trim() as SupportStatus;
      return reply.send({ success:true,data:await globalSupportOperationsService.listTickets(tenantFrom(req), status || undefined) });
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_TICKET_LIST_FAILED",message:e instanceof Error?e.message:"Unable to list tickets"}});
    }
  });

  server.get("/api/v1/support/tickets/:ticketId", async (req, reply) => {
    try {
      const tenantId = tenantFrom(req);
      const ticketId = String((req.params as any).ticketId);
      const ticket = await globalSupportOperationsService.getTicket(tenantId, ticketId);
      if (!ticket) return reply.status(404).send({success:false,error:{code:"NOT_FOUND",message:"Support ticket not found"}});
      return reply.send({success:true,data:await globalSupportTicketLifecycleService.getTicketWorkspace(tenantId, ticketId)});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_TICKET_GET_FAILED",message:e instanceof Error?e.message:"Unable to load ticket"}});
    }
  });

  server.patch("/api/v1/support/tickets/:ticketId/lifecycle", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.changeStatus(
        tenantFrom(req),
        String((req.params as any).ticketId),
        String(b.status || "") as SupportLifecycleStatus,
        actorFrom(req),
        b.note,
      );
      return reply.send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_LIFECYCLE_FAILED",message:e instanceof Error?e.message:"Unable to change ticket lifecycle"}});
    }
  });

  server.patch("/api/v1/support/tickets/:ticketId/priority", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.setPriority(
        tenantFrom(req),
        String((req.params as any).ticketId),
        String(b.priority || "") as SupportTicketPriority,
        actorFrom(req),
      );
      return reply.send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_PRIORITY_FAILED",message:e instanceof Error?e.message:"Unable to set ticket priority"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/assign", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.assign(
        tenantFrom(req),
        String((req.params as any).ticketId),
        actorFrom(req),
        b.assignedToUserId,
        b.assignedTeam,
      );
      return reply.send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_ASSIGNMENT_FAILED",message:e instanceof Error?e.message:"Unable to assign ticket"}});
    }
  });

  server.get("/api/v1/support/tickets/:ticketId/comments", async (req, reply) => {
    try {
      return reply.send({success:true,data:await globalSupportTicketLifecycleService.listComments(tenantFrom(req),String((req.params as any).ticketId))});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_COMMENTS_FAILED",message:e instanceof Error?e.message:"Unable to list comments"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/comments", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.addComment(
        tenantFrom(req),
        String((req.params as any).ticketId),
        actorFrom(req),
        String(b.body || ""),
        false,
      );
      return reply.status(201).send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_COMMENT_CREATE_FAILED",message:e instanceof Error?e.message:"Unable to create comment"}});
    }
  });

  server.get("/api/v1/support/tickets/:ticketId/attachments", async (req, reply) => {
    try {
      return reply.send({success:true,data:await globalSupportTicketLifecycleService.listAttachments(tenantFrom(req),String((req.params as any).ticketId))});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_ATTACHMENTS_FAILED",message:e instanceof Error?e.message:"Unable to list attachments"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/attachments", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.addAttachment(
        tenantFrom(req),
        String((req.params as any).ticketId),
        actorFrom(req),
        {
          fileName:String(b.fileName||""),
          mimeType:String(b.mimeType||""),
          storageKey:String(b.storageKey||""),
          sizeBytes:Number(b.sizeBytes),
          sha256:String(b.sha256||""),
          commentId:b.commentId,
        },
      );
      return reply.status(201).send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_ATTACHMENT_CREATE_FAILED",message:e instanceof Error?e.message:"Unable to create attachment"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/escalate", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.escalate(
        tenantFrom(req),
        String((req.params as any).ticketId),
        actorFrom(req),
        String(b.reason || ""),
        b.assignedTeam,
      );
      return reply.send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_ESCALATION_FAILED",message:e instanceof Error?e.message:"Unable to escalate ticket"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/diagnose", async (req, reply) => {
    try {
      return reply.send({success:true,data:await globalSupportOperationsService.diagnose(tenantFrom(req),String((req.params as any).ticketId))});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_DIAGNOSTIC_FAILED",message:e instanceof Error?e.message:"Unable to diagnose ticket"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/remediation", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportOperationsService.requestRemediation(
        tenantFrom(req),
        String((req.params as any).ticketId),
        String(b.action||""),
        b.riskLevel||"SAFE",
        actorFrom(req),
      );
      return reply.status(data.policy_decision==="HUMAN_APPROVAL_REQUIRED"?202:201).send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_REMEDIATION_FAILED",message:e instanceof Error?e.message:"Unable to request remediation"}});
    }
  });

  server.post("/api/v1/support/tickets/:ticketId/resolve", async (req, reply) => {
    try {
      const b = (req.body || {}) as any;
      const data = await globalSupportTicketLifecycleService.resolve(
        tenantFrom(req),
        String((req.params as any).ticketId),
        actorFrom(req),
        { verification:String(b.verification||""), summary:String(b.summary||""), code:b.code },
      );
      return reply.send({success:true,data});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_RESOLUTION_FAILED",message:e instanceof Error?e.message:"Unable to resolve ticket"}});
    }
  });

  server.get("/api/v1/support/tickets/:ticketId/audit", async (req, reply) => {
    try {
      return reply.send({success:true,data:await globalSupportTicketLifecycleService.listAudit(tenantFrom(req),String((req.params as any).ticketId))});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_AUDIT_FAILED",message:e instanceof Error?e.message:"Unable to load ticket audit"}});
    }
  });

  server.get("/api/v1/support/summary", async (req, reply) => {
    try {
      return reply.send({success:true,data:await globalSupportOperationsService.summary(tenantFrom(req))});
    } catch(e) {
      return reply.status(400).send({success:false,error:{code:"SUPPORT_SUMMARY_FAILED",message:e instanceof Error?e.message:"Unable to load support summary"}});
    }
  });
}
