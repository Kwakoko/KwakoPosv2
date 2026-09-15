import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { globalReceiptService } from "../services/receiptService.js";
import { CreateReceiptRequestSchema, TenantContext } from "@kwakopos2/contracts";

export function extractTenantContext(req: FastifyRequest): TenantContext {
  const ctx = (req as any).tenantContext as TenantContext | undefined;
  if (!ctx?.tenantId || !ctx?.branchId || !ctx?.userId) {
    throw new Error("UNAUTHORIZED: Authenticated tenant context is required");
  }
  return {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    userId: ctx.userId,
    roles: Array.isArray(ctx.roles) ? ctx.roles.map((r) => String(r)) : [],
    permissions: Array.isArray(ctx.permissions) ? ctx.permissions.map((p) => String(p)) : [],
  };
}

export function receiptRoutes(server: FastifyInstance) {
  // POST /api/v2/receipts - Create new receipt
  server.post("/api/v2/receipts", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const body = CreateReceiptRequestSchema.parse(req.body);
      const receipt = await globalReceiptService.createReceipt(ctx, body);
      return reply.status(201).send({ success: true, receipt });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // GET /api/v2/receipts - Search & List receipts
  server.get("/api/v2/receipts", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const query = (req.query as any) || {};
      const filter = {
        query: query.query as string,
        status: query.status as string,
        transactionType: query.transactionType as string,
        cashierId: query.cashierId as string,
        customerId: query.customerId as string,
        branchId: query.branchId as string,
        page: query.page ? parseInt(query.page as string, 10) : 1,
        limit: query.limit ? parseInt(query.limit as string, 10) : 50,
      };
      const result = await globalReceiptService.searchReceipts(ctx, filter);
      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /api/v2/receipts/analytics - Analytics dashboard
  server.get("/api/v2/receipts/analytics", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const analytics = await globalReceiptService.getReceiptAnalytics(ctx);
      return reply.send({ success: true, analytics });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /api/v2/receipts/templates - List receipt templates
  server.get("/api/v2/receipts/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const templates = await globalReceiptService.getReceiptTemplates(ctx);
      return reply.send({ success: true, templates });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/templates - Save template
  server.post("/api/v2/receipts/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const template = await globalReceiptService.saveReceiptTemplate(ctx, req.body as any);
      return reply.send({ success: true, template });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/verify - Public / Auditor receipt verification
  server.post("/api/v2/receipts/verify", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { receiptNumber, signature } = (req.body as any) || {};
      if (!receiptNumber) return reply.status(400).send({ success: false, error: "receiptNumber is required" });
      const verification = await globalReceiptService.verifyReceipt(receiptNumber, signature);
      return reply.send({ success: true, verification });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /api/v2/receipts/number/:number - Get receipt by receipt number
  server.get("/api/v2/receipts/number/:number", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const receipt = await globalReceiptService.getReceiptByNumber(ctx, (req.params as any).number);
      if (!receipt) return reply.status(404).send({ success: false, error: "Receipt not found" });
      return reply.send({ success: true, receipt });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // GET /api/v2/receipts/:id - Get receipt by ID
  server.get("/api/v2/receipts/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const receipt = await globalReceiptService.getReceiptById(ctx, (req.params as any).id);
      if (!receipt) return reply.status(404).send({ success: false, error: "Receipt not found" });
      return reply.send({ success: true, receipt });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/print - Record initial print or thermal layout
  server.post("/api/v2/receipts/:id/print", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const format = (req.query as any)?.format;
      if (format === "58mm") {
        const text = await globalReceiptService.renderThermal58mm(ctx, id);
        return reply.send({ success: true, format: "58mm", content: text });
      } else if (format === "80mm") {
        const text = await globalReceiptService.renderThermal80mm(ctx, id);
        return reply.send({ success: true, format: "80mm", content: text });
      } else if (format === "html" || format === "a4") {
        const html = await globalReceiptService.renderA4Html(ctx, id);
        return reply.send({ success: true, format: "a4", content: html });
      }
      const result = await globalReceiptService.recordReprint(ctx, id, ctx.userId, "Initial Print");
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/reprint - Record reprint with audit reason
  server.post("/api/v2/receipts/:id/reprint", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const { reason, printedBy } = (req.body as any) || {};
      const result = await globalReceiptService.recordReprint(ctx, id, printedBy || ctx.userId, reason);
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/email - Send email receipt
  server.post("/api/v2/receipts/:id/email", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const { email } = (req.body as any) || {};
      const ok = await globalReceiptService.recordShare(ctx, id, "EMAIL", email, ctx.userId);
      return reply.send({ success: ok, message: `Receipt sent to ${email}` });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/share - Share link or SMS
  server.post("/api/v2/receipts/:id/share", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const { channel, recipient } = (req.body as any) || {};
      const ok = await globalReceiptService.recordShare(ctx, id, channel || "WHATSAPP", recipient, ctx.userId);
      return reply.send({ success: ok, channel, recipient });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/cancel - Cancel / Void receipt
  server.post("/api/v2/receipts/:id/cancel", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const { reason } = (req.body as any) || {};
      const receipt = await globalReceiptService.updateReceiptStatus(ctx, id, "CANCELLED", reason);
      return reply.send({ success: true, receipt });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });

  // POST /api/v2/receipts/:id/refund - Refund receipt
  server.post("/api/v2/receipts/:id/refund", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const ctx = extractTenantContext(req);
      const id = (req.params as any).id;
      const { reason } = (req.body as any) || {};
      const receipt = await globalReceiptService.updateReceiptStatus(ctx, id, "REFUNDED", reason);
      return reply.send({ success: true, receipt });
    } catch (err: any) {
      return reply.status(500).send({ success: false, error: err.message });
    }
  });
}
