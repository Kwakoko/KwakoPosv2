import type { TenantContext } from "@kwakopos2/contracts";

const ADMIN_ROLES = new Set(["ADMIN", "OWNER", "SUPER_ADMIN", "SUPERADMIN"]);

export function hasRetailCapability(ctx: TenantContext | null | undefined, capability: string, aliases: string[] = []): boolean {
  if (!ctx?.tenantId || !ctx.branchId || !ctx.userId) return false;
  const permissions = Array.isArray(ctx.permissions)
    ? ctx.permissions.map((permission) => String(permission).trim().toLowerCase())
    : [];
  const roles = Array.isArray(ctx.roles)
    ? ctx.roles.map((role) => String(role).trim().toUpperCase())
    : [];
  if (roles.some((role) => ADMIN_ROLES.has(role))) return true;
  if (permissions.includes("*") || permissions.includes("retail.*")) return true;
  return permissions.includes(capability.trim().toLowerCase()) ||
    aliases.some((alias) => permissions.includes(alias.trim().toLowerCase()));
}

export function assertRetailCapability<T extends TenantContext>(ctx: T, capability: string, aliases: string[] = []): T {
  if (!hasRetailCapability(ctx, capability, aliases)) {
    throw new Error("FORBIDDEN: " + capability + " permission required");
  }
  return ctx;
}
