import { globalSettingsService } from "./settingsService.js";
import {
  DEFAULT_SESSION_POLICY,
  sessionPolicyFromSettings,
  type SessionPolicy,
} from "@kwakopos2/auth";
import type { TenantContext } from "@kwakopos2/contracts";

export async function getSessionPolicy(ctx: Pick<TenantContext, "tenantId" | "branchId" | "userId" | "roles" | "permissions">): Promise<SessionPolicy> {
  try {
    const effective = await globalSettingsService.getEffectiveSettings(ctx as TenantContext);
    return sessionPolicyFromSettings((effective["security.config"]?.value || {}) as Record<string, unknown>);
  } catch {
    return DEFAULT_SESSION_POLICY;
  }
}

export function platformSessionPolicy(): SessionPolicy {
  return DEFAULT_SESSION_POLICY;
}
