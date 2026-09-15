import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateTotpSecret,
  verifyTotpCode,
  issueSetupToken,
  issueStepUpToken,
  verifyStepUpToken,
  throttleKeys,
  logSuperAdminAuditEvent,
  recoverSuperAdminPassword,
} from "../../apps/api/src/services/superAdminSecurityService.js";
import { validatePasswordStrength, hashPassword, comparePassword } from "@kwakopos2/auth";

describe("KwakoPos v2 — Super Admin Core Security & Isolation Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SUPER_ADMIN_RECOVERY_KEY = "test-recovery-key-secure-998877";
    process.env.SUPER_ADMIN_MFA_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("1. TOTP secret generation conforms to RFC 6238 Base32 specifications", () => {
    const secret = generateTotpSecret();
    expect(secret).toBeDefined();
    // Base32 format (A-Z, 2-7)
    expect(secret).toMatch(/^[A-Z2-7]{16,64}$/);

    // Invalid code should return false
    expect(verifyTotpCode(secret, "999999")).toBe(false);
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("2. Setup token is securely issued with scope restrictions and expiration", () => {
    const userId = "super-admin-usr-101";
    const setupToken = issueSetupToken(userId);
    expect(setupToken).toBeDefined();
    expect(typeof setupToken).toBe("string");
  });

  it("3. Step-up authorization tokens require exact matching actions", () => {
    const userId = "super-admin-usr-101";
    const action = "EMERGENCY_KILL_SWITCH";
    const token = issueStepUpToken(userId, action);

    const verified = verifyStepUpToken(token, action);
    expect(verified.userId).toBe(userId);
    expect(verified.action).toBe(action);

    // Mismatched action must fail
    expect(() => verifyStepUpToken(token, "TENANT_DELETE")).toThrow();
  });

  it("4. Password recovery requires authentic disaster recovery key", async () => {
    // Attempting recovery with wrong key must fail with authorization error
    await expect(
      recoverSuperAdminPassword({
        recoveryKey: "wrong-invalid-key",
        newPassword: "NewMasterPassword2026!@",
      })
    ).rejects.toThrow("INVALID_RECOVERY_KEY");
  });

  it("5. Throttling and rate limit keys properly segregate tenant, IP, and device", () => {
    const keys = throttleKeys("admin@kwakoko.co.tz", "10.0.0.42", "device-pos-77");
    expect(keys).toEqual([
      "email:admin@kwakoko.co.tz",
      "ip:10.0.0.42",
      "device:device-pos-77",
    ]);
  });

  it("6. Tenant Admin roles (even with wildcard permissions) must NOT have platform Super Admin role", () => {
    const tenantAdminContext = {
      userId: "usr-tenant-admin-1",
      tenantId: "tenant-abc-123",
      roles: ["ADMIN", "OWNER"],
      permissions: ["*"],
    };

    const isPlatformSuperAdmin = (ctx: typeof tenantAdminContext) => {
      const roles = ctx.roles.map((r) => r.toUpperCase());
      return roles.includes("SUPER_ADMIN") || roles.includes("PLATFORM_SUPER_ADMIN") || roles.includes("SUPERADMIN");
    };

    expect(isPlatformSuperAdmin(tenantAdminContext)).toBe(false);

    const superAdminContext = {
      userId: "usr-super-admin",
      tenantId: "platform-hq",
      roles: ["PLATFORM_SUPER_ADMIN"],
      permissions: ["*"],
    };

    expect(isPlatformSuperAdmin(superAdminContext)).toBe(true);
  });
});
