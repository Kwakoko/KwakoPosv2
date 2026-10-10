/** Canonical client-side predicate for platform-level Super Admin identity.
 * Tenant-scoped SUPER_ADMIN/SUPERADMIN roles must never select the platform shell.
 */
export function isPlatformSuperAdminRole(role: unknown): boolean {
  return String(role || "").toUpperCase() === "PLATFORM_SUPER_ADMIN";
}

const PLATFORM_ONLY_PATHS = new Set([
  "/super-admin",
  "/super-admin/certification",
  "/super-admin/support",
  "/super-admin/compliance",
  "/super-admin/rollback",
  "/diagnostics",
  "/tenant-onboarding",
]);

/** Platform dashboards must not render inside an active tenant inspection. */
export function isPlatformOnlyPath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const normalized = path === "/" ? path : path.replace(/\/+$/, "");
  return PLATFORM_ONLY_PATHS.has(normalized) || normalized.startsWith("/super-admin/");
}

/** The platform shell is reserved for the platform role outside tenant inspection. */
export function shouldUsePlatformShell(role: unknown, hasActiveTenantInspection: boolean): boolean {
  return isPlatformSuperAdminRole(role) && !hasActiveTenantInspection;
}
