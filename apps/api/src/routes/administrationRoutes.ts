import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import { StandardPluginCatalog } from "@kwakopos2/domain";
import { globalSettingsService } from "../services/settingsService.js";
import type { PrivilegedRbacMutationService } from "../services/rbacMutationService.js";

type AdminRouteOptions = { rbacService: PrivilegedRbacMutationService };

function adminActor(req: FastifyRequest) {
  const ctx = (req as any).tenantContext;
  if (!ctx) throw new Error("UNAUTHORIZED: Authenticated tenant context is required");
  const roles = Array.isArray(ctx.roles) ? ctx.roles.map((r: unknown) => String(r).toUpperCase()) : [];
  const permissions = Array.isArray(ctx.permissions) ? ctx.permissions.map((p: unknown) => String(p).toLowerCase()) : [];
  const isAdminRole = roles.some((r: string) => ["OWNER", "ADMIN", "SUPER_ADMIN", "SUPERADMIN"].includes(r));
  const canAdminister =
    isAdminRole ||
    permissions.includes("*") ||
    permissions.includes("SUPER_ADMIN_OPERATIONS") ||
    permissions.includes("ADMIN:PLATFORM") ||
    permissions.includes("admin:*");
  if (!canAdminister) throw new Error("FORBIDDEN: Administration permission is required");
  return {
    ...ctx,
    deviceId: (req.traceContext as any)?.deviceId || req.headers["x-device-id"] || "administration-web",
    permissions,
    roles,
  };
}

function sendError(reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : "Administration request failed";
  const status = message.startsWith("UNAUTHORIZED") ? 401 : message.startsWith("FORBIDDEN") ? 403 : 400;
  return reply.status(status).send({ success: false, error: { code: status === 403 ? "FORBIDDEN" : status === 401 ? "UNAUTHORIZED" : "ADMINISTRATION_REQUEST_FAILED", message } });
}

function canonicalCatalog() {
  return StandardPluginCatalog.map((item: any) => ({
    id: String(item.id),
    name: String(item.name || item.id),
    industry: item.industry ? String(item.industry) : null,
    description: item.description ? String(item.description) : "",
    status: item.status ? String(item.status) : "stable",
  }));
}

export async function administrationRoutes(server: FastifyInstance, opts: AdminRouteOptions) {
  server.get("/api/v1/administration/modules", async (req, reply) => {
    try {
      const ctx = adminActor(req);
      const rows = await prisma.$queryRaw<Array<{ module_key: string; status: string; source: string }>>`
        SELECT module_key, status, source
        FROM tenant_module_entitlements
        WHERE tenant_id = ${ctx.tenantId}::uuid
        ORDER BY module_key ASC
      `;
      const active = new Map(rows.map((row) => [String(row.module_key), row]));
      return {
        success: true,
        data: {
          catalog: canonicalCatalog(),
          entitlements: canonicalCatalog()
            .filter((item) => active.has(item.id))
            .map((item) => ({ ...item, status: active.get(item.id)?.status || "ACTIVE", source: active.get(item.id)?.source || "UNKNOWN" })),
        },
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.put("/api/v1/administration/modules", async (req, reply) => {
    try {
      const ctx = adminActor(req);
      const body = (req.body || {}) as any;
      const requested: string[] = Array.isArray(body.moduleIds)
        ? Array.from(new Set((body.moduleIds as unknown[]).map((value) => String(value).trim().toLowerCase()).filter((value) => value.length > 0)))
        : [];
      const catalogIds = new Set(StandardPluginCatalog.map((item: any) => String(item.id).trim().toLowerCase()));
      const invalid = requested.filter((id) => !catalogIds.has(id));
      if (invalid.length) {
        return reply.status(400).send({ success: false, error: { code: "MODULE_NOT_FOUND", message: `Unknown or unauthorized module: ${invalid.join(", ")}` } });
      }

      const result = await prisma.$transaction(async (tx) => {
        const before = await tx.$queryRaw<Array<{ module_key: string; status: string }>>`
          SELECT module_key, status FROM tenant_module_entitlements
          WHERE tenant_id = ${ctx.tenantId}::uuid
          ORDER BY module_key ASC
        `;
        await tx.$executeRaw`DELETE FROM tenant_module_entitlements WHERE tenant_id = ${ctx.tenantId}::uuid`;
        for (const moduleKey of requested) {
          const catalog = StandardPluginCatalog.find((item: any) => String(item.id).toLowerCase() === moduleKey);
          if (!catalog) continue;
          await tx.$executeRaw`
            INSERT INTO tenant_module_entitlements (id, tenant_id, module_key, status, source)
            VALUES (${randomUUID()}::uuid, ${ctx.tenantId}::uuid, ${catalog.id}, 'ACTIVE', 'ADMINISTRATION')
          `;
        }
        await tx.auditEvent.create({
          data: {
            id: randomUUID(),
            tenantId: ctx.tenantId,
            branchId: ctx.branchId,
            userId: ctx.userId,
            deviceId: String(ctx.deviceId || "administration-web"),
            action: "FEATURE_MODULE_ENTITLEMENTS_UPDATED",
            entityType: "TenantModuleEntitlement",
            entityId: ctx.tenantId,
            metadata: { before, after: requested },
          },
        });
        return requested;
      });

      return reply.send({ success: true, data: { moduleIds: result } });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.put("/api/v1/administration/settings/batch", async (req, reply) => {
    try {
      const ctx = adminActor(req);
      const body = (req.body || {}) as any;
      const settings = Array.isArray(body.settings) ? body.settings : [];
      if (!settings.length) {
        return reply.status(400).send({ success: false, error: { code: "SETTINGS_BATCH_EMPTY", message: "settings must contain at least one record" } });
      }
      const result = await globalSettingsService.upsertBatch(ctx as any, settings);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.get("/api/v1/administration/audit", async (req, reply) => {
    try {
      const ctx = adminActor(req);
      const events = await prisma.auditEvent.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        take: 300,
      });
      return reply.send({
        success: true,
        data: events.map((event: any) => ({
          id: event.id,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          timestamp: event.createdAt,
          details: event.metadata || {},
        })),
      });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
