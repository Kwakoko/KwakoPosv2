import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "./client.js";

/**
 * H-008: Set PostgreSQL RLS tenant context for the current DB session.
 * Call this at the start of any Prisma $transaction to activate RLS policies.
 *
 * Usage:
 *   await prisma.$transaction(async (tx) => {
 *     await setRlsTenantContext(tx, ctx);
 *     // ... all subsequent queries enforce RLS
 *   });
 */
export async function setRlsTenantContext(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  ctx: TenantContext
): Promise<void> {
  if (!ctx.tenantId) {
    throw new Error("RLS_CONTEXT_ERROR: tenantId is required to set RLS context");
  }
  await (tx as any).$executeRaw`SELECT set_config('kwakopos.tenant_id', ${ctx.tenantId}, TRUE)`;
}

/**
 * Clear the RLS tenant context (e.g., for super-admin cross-tenant operations).
 * Only callable with SUPER_ADMIN role.
 */
export async function clearRlsTenantContext(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  ctx: TenantContext
): Promise<void> {
  const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
  if (!isSuperAdmin) {
    throw new Error("RLS_CLEAR_FORBIDDEN: Only SUPER_ADMIN can clear the RLS tenant context");
  }
  await (tx as any).$executeRaw`SELECT set_config('kwakopos.tenant_id', '', TRUE)`;
}
