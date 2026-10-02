import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PrivilegedRbacMutationService, RbacMutationError } from "../services/rbacMutationService.js";
import type { TenantContext } from "@kwakopos2/contracts";

function requireAdminContext(req: FastifyRequest): TenantContext {
  if (!req.tenantContext) throw new Error("UNAUTHORIZED: Authenticated tenant context is required");
  const roles = Array.isArray(req.tenantContext.roles) ? req.tenantContext.roles.map((r) => String(r).toUpperCase()) : [];
  const permissions = Array.isArray(req.tenantContext.permissions) ? req.tenantContext.permissions.map((p) => String(p).toLowerCase()) : [];
  const isAdmin = roles.some((role) => ["ADMIN", "SUPER_ADMIN", "SUPERADMIN", "OWNER"].includes(role));
  const hasAdminPermission = permissions.includes("*") || permissions.includes("admin:*") || permissions.some((p) => p.startsWith("admin:"));
  if (!isAdmin && !hasAdminPermission) throw new RbacMutationError("FORBIDDEN", "Administrative privileges required", 403);
  return req.tenantContext;
}

function actor(req: FastifyRequest): any {
  const ctx = requireAdminContext(req);
  return {
    ...ctx,
    deviceId: (req.traceContext as any)?.deviceId || req.headers["x-device-id"] || "web",
  };
}

function mapRole(role: any) {
  const protectedNames = ["OWNER", "ADMIN", "SUPER_ADMIN", "SUPERADMIN", "MANAGER", "CASHIER", "INVENTORY", "ACCOUNTANT"];
  const isSystemRole = protectedNames.includes(String(role.name).toUpperCase());
  return {
    id: role.id,
    tenantId: role.tenantId,
    name: role.name,
    slug: String(role.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    description: role.description || "",
    isSystemRole: Boolean(role.isSystemRole) || isSystemRole,
    isCustom: !(Boolean(role.isSystemRole) || isSystemRole),
    permissions: role.permissions || [],
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

function mapUser(user: any) {
  const [firstName = "Staff", ...lastParts] = String(user.name || "").trim().split(/\s+/).filter(Boolean);
  return {
    id: user.id,
    tenantId: user.tenantId,
    firstName,
    lastName: lastParts.join(" "),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    roleId: user.roleId,
    role: user.role?.name || "",
    branchId: user.branchId,
    branchName: user.branch?.name || "",
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof RbacMutationError) {
    return reply.status(error.statusCode).send({ success: false, error: { code: error.code, message: error.message } });
  }
  throw error;
}

export async function rbacRoutes(server: FastifyInstance, opts: { service: PrivilegedRbacMutationService }) {
  const service = opts.service;

  server.get("/api/v1/users", async (req, reply) => {
    try {
      return { success: true, data: (await service.listUsers(actor(req))).map(mapUser) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.get("/api/v1/roles", async (req, reply) => {
    try {
      return { success: true, data: (await service.listRoles(actor(req))).map(mapRole) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.post("/api/v1/users", async (req, reply) => {
    try {
      const body: any = req.body || {};
      const branchId = String(body.branchId || "").trim();
      if (!branchId) return reply.status(400).send({ success: false, error: { code: "USER_BRANCH_INVALID", message: "A branchId is required." } });
      const user = await service.createUser(actor(req), {
        firstName: String(body.firstName || ""),
        lastName: String(body.lastName || ""),
        email: String(body.email || ""),
        phone: body.phone == null ? undefined : String(body.phone),
        password: String(body.password || ""),
        roleId: body.roleId ? String(body.roleId) : undefined,
        roleName: body.role ? String(body.role) : undefined,
        branchId,
      });
      return reply.status(201).send({ success: true, data: mapUser(user) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.put("/api/v1/users/:id", async (req, reply) => {
    try {
      const body: any = req.body || {};
      const user = await service.updateUser(actor(req), String((req.params as any).id), body);
      return { success: true, data: mapUser(user) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.delete("/api/v1/users/:id", async (req, reply) => {
    try {
      const user = await service.deactivateUser(actor(req), String((req.params as any).id));
      return { success: true, data: mapUser(user) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.post("/api/v1/roles", async (req, reply) => {
    try {
      const body: any = req.body || {};
      const role = await service.createRole(actor(req), {
        name: String(body.name || ""),
        description: body.description == null ? null : String(body.description),
        permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      });
      return reply.status(201).send({ success: true, data: mapRole(role) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.put("/api/v1/roles/:id", async (req, reply) => {
    try {
      const body: any = req.body || {};
      const role = await service.updateRole(actor(req), String((req.params as any).id), {
        name: String(body.name || ""),
        description: body.description == null ? null : String(body.description),
        permissions: Array.isArray(body.permissions) ? body.permissions.map(String) : [],
      });
      return { success: true, data: mapRole(role) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.delete("/api/v1/roles/:id", async (req, reply) => {
    try {
      return { success: true, data: await service.deleteRole(actor(req), String((req.params as any).id)) };
    } catch (error) {
      return sendError(reply, error);
    }
  });

  server.get("/api/v1/audit/logs", async (req, reply) => {
    try {
      const events = await service.listAuditEvents(actor(req));
      return {
        success: true,
        data: events.map((event: any) => ({
          id: event.id,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          userId: event.userId,
          timestamp: event.createdAt,
          details: JSON.stringify(event.metadata || {}),
          metadata: event.metadata || {},
          ipAddress: null,
        })),
      };
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
