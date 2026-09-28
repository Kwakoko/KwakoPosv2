import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CreateTraVfdFiscalizationRequestSchema, TraVfdConfigSchema } from "@kwakopos2/contracts";
import { globalTraVfdService } from "../services/traVfdService.js";

function ctxOf(req: FastifyRequest) {
  const ctx = (req as any).tenantContext;
  if (!ctx?.tenantId || !ctx?.branchId || !ctx?.userId) throw new Error("UNAUTHORIZED: Authenticated tenant context is required");
  return { tenantId: String(ctx.tenantId), branchId: String(ctx.branchId), userId: String(ctx.userId), roles: Array.isArray(ctx.roles) ? ctx.roles.map(String) : [] };
}

function requireAdmin(ctx: ReturnType<typeof ctxOf>, reply: FastifyReply): boolean {
  if (ctx.roles.includes("*") || ctx.roles.some((role: string) => ["ADMIN", "OWNER", "SUPER_ADMIN"].includes(role))) return true;
  reply.status(403).send({ success: false, error: { code: "TRA_VFD_ADMIN_REQUIRED", message: "Only an administrator may change TRA VFD configuration." } });
  return false;
}

export function traVfdRoutes(server: FastifyInstance) {
  server.get("/api/v1/tra-vfd/config", async (req, reply) => {
    try { return reply.send({ success: true, data: await globalTraVfdService.getConfig(ctxOf(req)) }); }
    catch (error: any) { return reply.status(401).send({ success: false, error: error.message }); }
  });

  server.put("/api/v1/tra-vfd/config", async (req, reply) => {
    try {
      const ctx = ctxOf(req);
      if (!requireAdmin(ctx, reply)) return;
      const input = TraVfdConfigSchema.parse(req.body);
      return reply.send({ success: true, data: await globalTraVfdService.setConfig(ctx, input) });
    } catch (error: any) { return reply.status(400).send({ success: false, error: error.message }); }
  });

  server.post("/api/v1/tra-vfd/queue", async (req, reply) => {
    try {
      const ctx = ctxOf(req);
      const input = CreateTraVfdFiscalizationRequestSchema.parse(req.body);
      const fiscalization = await globalTraVfdService.enqueue(ctx, input);
      return reply.status(201).send({ success: true, data: fiscalization });
    } catch (error: any) {
      const status = error.message === "TRA_VFD_DISABLED" ? 409 : 400;
      return reply.status(status).send({ success: false, error: error.message });
    }
  });

  server.post("/api/v1/tra-vfd/submit/:id", async (req, reply) => {
    try {
      const ctx = ctxOf(req);
      return reply.send({ success: true, data: await globalTraVfdService.submit(ctx, String((req.params as any).id)) });
    } catch (error: any) { return reply.status(409).send({ success: false, error: error.message }); }
  });

  server.get("/api/v1/tra-vfd/:id", async (req, reply) => {
    try {
      const fiscalization = await globalTraVfdService.get(ctxOf(req), String((req.params as any).id));
      if (!fiscalization) return reply.status(404).send({ success: false, error: "TRA_VFD_FISCALIZATION_NOT_FOUND" });
      return reply.send({ success: true, data: fiscalization });
    } catch (error: any) { return reply.status(400).send({ success: false, error: error.message }); }
  });
}
