import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "@kwakopos2/database";
import { TenantOnboardingCreateRequestSchema } from "@kwakopos2/contracts";
import { TenantOnboardingError, TenantOnboardingService } from "../services/tenantOnboardingService.js";

function requireContext(req: FastifyRequest) {
  const ctx = (req as any).tenantContext;
  if (!ctx) throw new TenantOnboardingError("FORBIDDEN", "Authenticated context is required", 401);
  return ctx as { userId: string; tenantId: string; roles: string[]; permissions: string[] };
}
function isPlatformProvisioner(ctx: { roles: string[]; permissions: string[] }): boolean {
  const roles = ctx.roles.map(String).map((v) => v.toUpperCase());
  const permissions = ctx.permissions.map(String).map((v) => v.toUpperCase());
  return roles.includes("SUPER_ADMIN") || permissions.includes("SUPER_ADMIN_OPERATIONS");
}
function isOwner(ctx: { roles: string[]; permissions: string[] }): boolean {
  return ctx.roles.map(String).map((v) => v.toUpperCase()).includes("OWNER");
}
function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof TenantOnboardingError) return reply.status(error.statusCode).send({ success: false, error: { code: error.code, message: error.message } });
  if (error instanceof Error && error.name === "ZodError") return reply.status(400).send({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid tenant onboarding request" } });
  return reply.status(500).send({ success: false, error: { code: "PROVISIONING_FAILED", message: "Tenant onboarding operation failed" } });
}

export function tenantOnboardingRoutes(server: FastifyInstance): void {
  const service = new TenantOnboardingService(prisma);
  server.post("/api/v1/onboarding/tenants", async (req, reply) => {
    try {
      const ctx = requireContext(req);
      if (!isPlatformProvisioner(ctx)) return reply.status(403).send({ success: false, error: { code: "FORBIDDEN", message: "Platform provisioning privileges are required" } });
      const parsed = TenantOnboardingCreateRequestSchema.parse(req.body);
      const created = await service.create(parsed, { userId: ctx.userId, tenantId: ctx.tenantId, isSuperAdmin: true, correlationId: String(req.headers["x-correlation-id"] || ""), traceId: String(req.headers["x-trace-id"] || "") });
      return reply.status(201).send({ success: true, data: created });
    } catch (error) { return sendError(reply, error); }
  });
  server.get("/api/v1/onboarding/tenants/:tenantId", async (req, reply) => {
    try {
      const ctx = requireContext(req); const tenantId = String((req.params as any)?.tenantId || "");
      return reply.send({ success: true, data: await service.getForActor(tenantId, { tenantId: ctx.tenantId, isSuperAdmin: isPlatformProvisioner(ctx) }) });
    } catch (error) { return sendError(reply, error); }
  });
  server.patch("/api/v1/onboarding/tenants/:tenantId", async (req, reply) => {
    try {
      const ctx = requireContext(req); const tenantId = String((req.params as any)?.tenantId || "");
      return reply.send({ success: true, data: await service.update(tenantId, req.body, { tenantId: ctx.tenantId, userId: ctx.userId, isSuperAdmin: isPlatformProvisioner(ctx) }) });
    } catch (error) { return sendError(reply, error); }
  });
  server.post("/api/v1/onboarding/tenants/:tenantId/complete", async (req, reply) => {
    try {
      const ctx = requireContext(req); const tenantId = String((req.params as any)?.tenantId || "");
      const ownerAuthenticated = isOwner(ctx) && ctx.tenantId === tenantId;
      if (!ownerAuthenticated) return reply.status(403).send({ success: false, error: { code: "FORBIDDEN", message: "Owner authentication is required before onboarding completion" } });
      return reply.send({ success: true, data: await service.complete(tenantId, { tenantId: ctx.tenantId, isSuperAdmin: false, userId: ctx.userId, correlationId: String(req.headers["x-correlation-id"] || ""), traceId: String(req.headers["x-trace-id"] || "") }) });
    } catch (error) { return sendError(reply, error); }
  });
}
