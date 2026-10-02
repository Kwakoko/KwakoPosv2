import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { hashPassword } from "@kwakopos2/auth";
import type { TenantContext } from "@kwakopos2/contracts";

export class RbacMutationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "RbacMutationError";
  }
}

type Actor = Pick<TenantContext, "tenantId" | "branchId" | "userId" | "roles" | "permissions"> & {
  deviceId?: string | null;
};

type RoleInput = {
  name: string;
  description?: string | null;
  permissions: string[];
};

type UserCreateInput = {
  firstName: string;
  lastName?: string;
  email: string;
  phone?: string;
  password: string;
  roleId?: string;
  roleName?: string;
  branchId: string;
};

type UserUpdateInput = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  password?: string;
  roleId?: string;
  branchId?: string;
  status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
};

const PROTECTED_ROLE_NAMES = new Set([
  "OWNER",
  "ADMIN",
  "SUPER_ADMIN",
  "SUPERADMIN",
  "MANAGER",
  "CASHIER",
  "INVENTORY",
  "ACCOUNTANT",
]);

const PLATFORM_PERMISSIONS = new Set([
  "tenant.manage",
  "billing.manage",
  "feature_flag.manage",
  "system.logs.view",
]);

function normalizeRoleName(value: string): string {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new RbacMutationError("ROLE_NAME_INVALID", "Role name must be between 2 and 80 characters.");
  }
  return name;
}

function normalizePermissions(values: unknown): string[] {
  if (!Array.isArray(values)) {
    throw new RbacMutationError("ROLE_PERMISSIONS_INVALID", "Role permissions must be an array.");
  }

  const normalized = Array.from(
    new Set(
      values
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean),
    ),
  );

  if (normalized.length > 200) {
    throw new RbacMutationError("ROLE_PERMISSIONS_INVALID", "A role cannot contain more than 200 permissions.");
  }

  return normalized;
}

function isOwnerActor(actorRoleName: string): boolean {
  return actorRoleName === "OWNER" || actorRoleName === "SUPER_ADMIN" || actorRoleName === "SUPERADMIN";
}

export class PrivilegedRbacMutationService {
  constructor(private readonly prisma: PrismaClient) {}

  private actorDeviceId(actor: Actor): string {
    const deviceId = String(actor.deviceId || "").trim();
    return deviceId || "server";
  }

  private async resolveActor(tx: any, actor: Actor) {
    const user = await tx.user.findFirst({
      where: {
        id: actor.userId,
        tenantId: actor.tenantId,
        status: "ACTIVE",
      },
      include: { role: true },
    });
    if (!user) {
      throw new RbacMutationError("ACTOR_NOT_FOUND", "The authenticated administrator is not an active tenant user.", 403);
    }

    if (String(user.branchId) !== String(actor.branchId)) {
      throw new RbacMutationError("ACTOR_BRANCH_MISMATCH", "The authenticated branch context does not match the persisted user.", 403);
    }

    const dbPermissions = new Set(
      (user.role?.permissions || []).map((value: string) => String(value).trim().toLowerCase()),
    );
    const dbRoleName = String(user.role?.name || "").trim().toUpperCase();

    return {
      userId: user.id,
      tenantId: user.tenantId,
      branchId: user.branchId,
      roleName: dbRoleName,
      permissions: dbPermissions,
    };
  }

  private async requireAnyPermission(tx: any, actor: Actor, permissions: Array<"users.manage" | "roles.manage">) {
    const resolved = await this.resolveActor(tx, actor);
    const allowed =
      isOwnerActor(resolved.roleName) ||
      resolved.permissions.has("*") ||
      permissions.some((permission) => resolved.permissions.has(permission)) ||
      resolved.permissions.has("admin:*");
    if (!allowed) {
      throw new RbacMutationError("FORBIDDEN", "Administrative permission required.", 403);
    }
    return resolved;
  }

  private async requirePermission(tx: any, actor: Actor, permission: "users.manage" | "roles.manage") {
    const resolved = await this.resolveActor(tx, actor);
    const allowed =
      isOwnerActor(resolved.roleName) ||
      resolved.permissions.has("*") ||
      resolved.permissions.has(permission) ||
      resolved.permissions.has("admin:*");
    if (!allowed) {
      throw new RbacMutationError("FORBIDDEN", `Administrative permission required: ${permission}`, 403);
    }
    return resolved;
  }

  private async assertTargetRoleAllowed(tx: any, actorResolved: any, role: any) {
    const roleName = String(role.name || "").trim().toUpperCase();
    const permissions = new Set(
      (role.permissions || []).map((value: string) => String(value).trim().toLowerCase()),
    );
    const attemptsPrivilegedGrant =
      isOwnerActor(roleName) ||
      permissions.has("*") ||
      roleName === "SUPER_ADMIN" ||
      roleName === "SUPERADMIN";

    if (attemptsPrivilegedGrant && !isOwnerActor(actorResolved.roleName) && !actorResolved.permissions.has("*")) {
      throw new RbacMutationError(
        "PRIVILEGE_ESCALATION_DENIED",
        "Only the tenant owner or an equivalent unrestricted administrator can grant unrestricted access.",
        403,
      );
    }
  }

  private async assertRolePermissionsSafe(permissions: string[], actorResolved: any) {
    const forbiddenPlatform = permissions.filter((permission) => PLATFORM_PERMISSIONS.has(permission));
    if (forbiddenPlatform.length && !isOwnerActor(actorResolved.roleName) && !actorResolved.permissions.has("*")) {
      throw new RbacMutationError(
        "PLATFORM_PERMISSION_DENIED",
        "Tenant roles cannot grant platform-level permissions.",
        403,
      );
    }
    if (permissions.includes("*") && !isOwnerActor(actorResolved.roleName) && !actorResolved.permissions.has("*")) {
      throw new RbacMutationError(
        "PRIVILEGE_ESCALATION_DENIED",
        "Only an unrestricted administrator can create an unrestricted role.",
        403,
      );
    }
  }

  private async audit(tx: any, actor: Actor, actorResolved: any, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await tx.auditEvent.create({
      data: {
        id: randomUUID(),
        tenantId: actorResolved.tenantId,
        branchId: actorResolved.branchId,
        userId: actorResolved.userId,
        deviceId: this.actorDeviceId(actor),
        action,
        entityType,
        entityId,
        metadata,
      },
    });
  }

  async listRoles(actor: Actor) {
    await this.requireAnyPermission(this.prisma, actor, ["users.manage", "roles.manage"]);
    return this.prisma.role.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ name: "asc" }],
    });
  }

  async listUsers(actor: Actor) {
    await this.requirePermission(this.prisma, actor, "users.manage");
    return this.prisma.user.findMany({
      where: { tenantId: actor.tenantId },
      include: { role: true, branch: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async listAuditEvents(actor: Actor) {
    await this.requirePermission(this.prisma, actor, "users.manage");
    return this.prisma.auditEvent.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createRole(actor: Actor, input: RoleInput) {
    const name = normalizeRoleName(input.name);
    const normalizedName = name.toUpperCase();
    if (PROTECTED_ROLE_NAMES.has(normalizedName)) {
      throw new RbacMutationError("SYSTEM_ROLE_PROTECTED", "Reserved system role names cannot be created as custom roles.", 409);
    }
    const permissions = normalizePermissions(input.permissions);

    return this.prisma.$transaction(async (tx) => {
      const actorResolved = await this.requirePermission(tx, actor, "roles.manage");
      await this.assertRolePermissionsSafe(permissions, actorResolved);

      const duplicate = await tx.role.findFirst({ where: { tenantId: actor.tenantId, name } });
      if (duplicate) {
        throw new RbacMutationError("ROLE_EXISTS", "A role with this name already exists.", 409);
      }

      const role = await tx.role.create({
        data: {
          id: randomUUID(),
          tenantId: actor.tenantId,
          name,
          description: String(input.description || "").trim() || null,
          permissions,
          isSystemRole: false,
        },
      });

      await this.audit(tx, actor, actorResolved, "ROLE_CREATED", "Role", role.id, {
        name: role.name,
        permissions: role.permissions,
        description: input.description,
      });
      return role;
    });
  }

  async updateRole(actor: Actor, roleId: string, input: RoleInput) {
    const name = normalizeRoleName(input.name);
    const permissions = normalizePermissions(input.permissions);

    return this.prisma.$transaction(async (tx) => {
      const actorResolved = await this.requirePermission(tx, actor, "roles.manage");
      const existing = await tx.role.findFirst({ where: { id: roleId, tenantId: actor.tenantId } });
      if (!existing) throw new RbacMutationError("ROLE_NOT_FOUND", "Role not found.", 404);
      if (PROTECTED_ROLE_NAMES.has(String(existing.name).trim().toUpperCase())) {
        throw new RbacMutationError("SYSTEM_ROLE_PROTECTED", "System roles cannot be modified.", 403);
      }
      await this.assertRolePermissionsSafe(permissions, actorResolved);

      const duplicate = await tx.role.findFirst({
        where: { tenantId: actor.tenantId, name, NOT: { id: roleId } },
      });
      if (duplicate) throw new RbacMutationError("ROLE_EXISTS", "A role with this name already exists.", 409);

      const role = await tx.role.update({
        where: { id: roleId },
        data: {
          name,
          description: String(input.description || "").trim() || null,
          permissions,
        },
      });
      await this.audit(tx, actor, actorResolved, "ROLE_UPDATED", "Role", role.id, {
        before: { name: existing.name, permissions: existing.permissions },
        after: { name: role.name, permissions: role.permissions },
      });
      return role;
    });
  }

  async deleteRole(actor: Actor, roleId: string) {
    return this.prisma.$transaction(async (tx) => {
      const actorResolved = await this.requirePermission(tx, actor, "roles.manage");
      const role = await tx.role.findFirst({ where: { id: roleId, tenantId: actor.tenantId } });
      if (!role) throw new RbacMutationError("ROLE_NOT_FOUND", "Role not found.", 404);
      if (PROTECTED_ROLE_NAMES.has(String(role.name).trim().toUpperCase())) {
        throw new RbacMutationError("SYSTEM_ROLE_PROTECTED", "System roles cannot be deleted.", 403);
      }

      const assignedUsers = await tx.user.count({ where: { tenantId: actor.tenantId, roleId } });
      if (assignedUsers > 0) {
        throw new RbacMutationError("ROLE_IN_USE", "A role assigned to users cannot be deleted.", 409);
      }

      await tx.role.delete({ where: { id: roleId } });
      await this.audit(tx, actor, actorResolved, "ROLE_DELETED", "Role", roleId, {
        name: role.name,
        permissions: role.permissions,
      });
      return { id: roleId, deleted: true };
    });
  }

  async createUser(actor: Actor, input: UserCreateInput) {
    const firstName = String(input.firstName || "").trim();
    const lastName = String(input.lastName || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!firstName || !email || password.length < 8) {
      throw new RbacMutationError(
        "USER_INPUT_INVALID",
        "First name, email and a password of at least 8 characters are required.",
        400,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const actorResolved = await this.requirePermission(tx, actor, "users.manage");
      const branch = await tx.branch.findFirst({ where: { id: input.branchId, tenantId: actor.tenantId } });
      if (!branch) throw new RbacMutationError("USER_BRANCH_INVALID", "A valid tenant branch is required.", 400);

      const role = input.roleId
        ? await tx.role.findFirst({ where: { id: input.roleId, tenantId: actor.tenantId } })
        : await tx.role.findFirst({ where: { tenantId: actor.tenantId, name: normalizeRoleName(String(input.roleName || "")) } });
      if (!role) throw new RbacMutationError("USER_ROLE_INVALID", "A valid tenant role is required.", 400);
      await this.assertTargetRoleAllowed(tx, actorResolved, role);

      const passwordHash = await hashPassword(password);
      try {
        const user = await tx.user.create({
          data: {
            id: randomUUID(),
            tenantId: actor.tenantId,
            branchId: branch.id,
            email,
            phone: input.phone ? String(input.phone).trim() : null,
            passwordHash,
            name: [firstName, lastName].filter(Boolean).join(" "),
            roleId: role.id,
            status: "ACTIVE",
          },
          include: { role: true, branch: true },
        });
        await this.audit(tx, actor, actorResolved, "USER_CREATED", "User", user.id, {
          email: user.email,
          roleId: role.id,
          roleName: role.name,
          branchId: branch.id,
        });
        return user;
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new RbacMutationError("USER_EXISTS", "A user with that email already exists in this tenant.", 409);
        }
        throw error;
      }
    });
  }

  async updateUser(actor: Actor, userId: string, input: UserUpdateInput) {
    return this.prisma.$transaction(async (tx) => {
      const actorResolved = await this.requirePermission(tx, actor, "users.manage");
      const existing = await tx.user.findFirst({
        where: { id: userId, tenantId: actor.tenantId },
        include: { role: true, branch: true },
      });
      if (!existing) throw new RbacMutationError("USER_NOT_FOUND", "User not found.", 404);
      if (userId === actorResolved.userId && input.status && input.status !== "ACTIVE") {
        throw new RbacMutationError("USER_SELF_DISABLE_FORBIDDEN", "You cannot disable your own active account.", 400);
      }

      const nextRole = input.roleId
        ? await tx.role.findFirst({ where: { id: input.roleId, tenantId: actor.tenantId } })
        : existing.role;
      if (!nextRole) throw new RbacMutationError("USER_ROLE_INVALID", "A valid tenant role is required.", 400);
      await this.assertTargetRoleAllowed(tx, actorResolved, nextRole);

      const nextBranch = input.branchId
        ? await tx.branch.findFirst({ where: { id: input.branchId, tenantId: actor.tenantId } })
        : existing.branch;
      if (!nextBranch) throw new RbacMutationError("USER_BRANCH_INVALID", "A valid tenant branch is required.", 400);

      if (userId === actorResolved.userId && input.roleId && String(nextRole.id) !== String(existing.roleId)) {
        const nextPermissions = new Set(nextRole.permissions.map((value: string) => String(value).trim().toLowerCase()));
        const retainsUserAdmin =
          isOwnerActor(String(nextRole.name).trim().toUpperCase()) ||
          nextPermissions.has("*") ||
          nextPermissions.has("users.manage") ||
          nextPermissions.has("admin:*");
        if (!retainsUserAdmin) {
          throw new RbacMutationError("USER_SELF_LOCKOUT_FORBIDDEN", "You cannot change your own role to one that removes user-management authority.", 400);
        }
      }

      const nextName = [
        input.firstName !== undefined ? String(input.firstName).trim() : existing.name.split(" ")[0] || "",
        input.lastName !== undefined ? String(input.lastName).trim() : existing.name.split(" ").slice(1).join(" "),
      ].filter(Boolean).join(" ");

      const data: any = {
        name: nextName,
        email: input.email !== undefined ? String(input.email).trim().toLowerCase() : existing.email,
        phone: input.phone !== undefined ? (String(input.phone).trim() || null) : existing.phone,
        roleId: nextRole.id,
        branchId: nextBranch.id,
        status: input.status || existing.status,
      };
      if (input.password !== undefined) {
        if (String(input.password).length < 8) {
          throw new RbacMutationError("USER_PASSWORD_INVALID", "Password must be at least 8 characters.", 400);
        }
        data.passwordHash = await hashPassword(String(input.password));
      }

      try {
        const updated = await tx.user.update({
          where: { id: userId },
          data,
          include: { role: true, branch: true },
        });
        if (updated.status !== "ACTIVE") {
          await tx.deviceSession.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        await this.audit(tx, actor, actorResolved, "USER_UPDATED", "User", updated.id, {
          changed: {
            email: updated.email !== existing.email,
            roleId: updated.roleId !== existing.roleId,
            branchId: updated.branchId !== existing.branchId,
            status: updated.status !== existing.status,
            passwordChanged: input.password !== undefined,
          },
          previousRoleId: existing.roleId,
          nextRoleId: updated.roleId,
          previousBranchId: existing.branchId,
          nextBranchId: updated.branchId,
        });
        return updated;
      } catch (error: any) {
        if (error?.code === "P2002") {
          throw new RbacMutationError("USER_EXISTS", "A user with that email already exists in this tenant.", 409);
        }
        throw error;
      }
    });
  }

  async deactivateUser(actor: Actor, userId: string) {
    return this.updateUser(actor, userId, { status: "INACTIVE" });
  }
}
