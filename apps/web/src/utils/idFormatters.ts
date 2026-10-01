/**
 * KwakoPosv2 — Human-Friendly ID Formatting Utilities
 * ─────────────────────────────────────────────────────────────────────────────
 * Industry-Standard Dual-Key Pattern:
 * Under the hood: PostgreSQL & IndexedDB maintain full UUIDv4 (ensuring offline
 * sync replication and zero schema collisions).
 * Presentation layer: Human-readable, concise, mnemonic identifiers (slugs, codes,
 * and prefixed tokens).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a given string is a standard 36-character UUIDv4.
 */
export function isUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return UUID_REGEX.test(value.trim());
}

/**
 * Formats a raw UUID or ID into a clean, human-friendly short code.
 * Example:
 *   formatShortId("c0b5a903-a0a1-4bec-a4d3-7a377ed61dd6", "USR") => "USR-C0B5A9"
 *   formatShortId("33b96a4b-8b7e-4066-b858-92b0ee0ee62c", "TNT") => "TNT-33B96A"
 *   formatShortId("BP-MAINBR") => "BP-MAINBR"
 */
export function formatShortId(
  id: string | null | undefined,
  prefix?: "USR" | "TNT" | "BR" | "ROL" | "SES" | "EVT" | "TXN" | string,
  charCount = 6
): string {
  if (!id || typeof id !== "string") return "—";
  const clean = id.trim();
  if (!clean) return "—";

  // If it's already a non-UUID custom identifier (e.g. "BP-MAINBR", "bravados-pub", "OWNER"), keep as-is
  if (!isUuid(clean)) {
    return clean;
  }

  // Strip hyphens and take the leading characters uppercase
  const hex = clean.replace(/-/g, "").toUpperCase();
  const token = hex.slice(0, charCount);
  return prefix ? `${prefix}-${token}` : token;
}

/**
 * Resolves a human-friendly Tenant Code or Slug.
 * Prefers slug (e.g. "bravados-pub"), falls back to "TNT-XXXXXX".
 */
export function formatTenantCode(
  tenant: { id?: string | null; slug?: string | null; name?: string | null } | string | null | undefined
): string {
  if (!tenant) return "—";
  if (typeof tenant === "string") {
    if (isUuid(tenant)) return formatShortId(tenant, "TNT");
    return tenant;
  }
  if (tenant.slug && tenant.slug.trim()) {
    return tenant.slug.trim().toLowerCase();
  }
  return formatShortId(tenant.id, "TNT");
}

/**
 * Resolves a human-friendly Branch Code.
 * Prefers branch code (e.g. "BP-MAINBR"), falls back to "BR-XXXXXX".
 */
export function formatBranchCode(
  branch: { id?: string | null; code?: string | null; name?: string | null } | string | null | undefined
): string {
  if (!branch) return "—";
  if (typeof branch === "string") {
    if (isUuid(branch)) return formatShortId(branch, "BR");
    return branch;
  }
  if (branch.code && branch.code.trim()) {
    return branch.code.trim().toUpperCase();
  }
  return formatShortId(branch.id, "BR");
}

/**
 * Resolves a human-friendly Role Name.
 * Suppresses raw role UUIDs completely from the user interface.
 */
export function formatRoleName(
  role: { name?: string | null } | string | null | undefined
): string {
  if (!role) return "USER";
  const name = typeof role === "string" ? role : role.name;
  if (!name || !name.trim()) return "USER";
  if (isUuid(name)) return formatShortId(name, "ROL");
  return name.trim().toUpperCase();
}

/**
 * Resolves a human-friendly User / Staff code.
 * Prefers employee number if defined, falls back to "USR-XXXXXX".
 */
export function formatUserCode(
  user: { id?: string | null; employeeNumber?: string | null; employeeCode?: string | null } | string | null | undefined
): string {
  if (!user) return "—";
  if (typeof user === "string") {
    return formatShortId(user, "USR");
  }
  const emp = user.employeeNumber || user.employeeCode;
  if (emp && emp.trim()) return emp.trim();
  return formatShortId(user.id, "USR");
}

/**
 * Truncates a long text with middle ellipsis while preserving prefix and suffix.
 */
export function truncateMiddle(str: string, maxLength = 24): string {
  if (!str || str.length <= maxLength) return str;
  const keep = Math.floor((maxLength - 3) / 2);
  return `${str.slice(0, keep)}...${str.slice(-keep)}`;
}
