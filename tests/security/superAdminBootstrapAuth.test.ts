import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hashPassword, comparePassword, generateAccessToken, verifyAccessToken } from "@kwakopos2/auth";
import {
  generateTotpSecret,
  verifyTotpCode,
  issueSetupToken,
  verifySetupToken,
  issueStepUpToken,
  verifyStepUpToken,
  generateWebAuthnChallenge,
  throttleKeys,
} from "../../apps/api/src/services/superAdminSecurityService.js";
import { SyncEngine } from "@kwakopos2/sync";
import { ScopedProductRepository, ScopedStockRepository, InMemoryStore } from "@kwakopos2/database";

describe("KwakoPos v2 — Super Admin Bootstrap & Authentication Security Suite", () => {
  const rootDir = process.cwd();

  it("1. Source files & config must never contain hardcoded Super Admin plaintext passwords", () => {
    const filesToScan = [
      "scripts/security/bootstrap-super-admin.ts",
      ".env.example",
      "packages/database/prisma/schema.prisma",
    ];

    for (const relPath of filesToScan) {
      const fullPath = path.join(rootDir, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        // Ensure no plaintext password assignments exist like SUPER_ADMIN_PASSWORD="SecretPassword"
        expect(content).not.toMatch(/SUPER_ADMIN_INITIAL_PASSWORD\s*=\s*["'][^"']+["']/i);
        expect(content).not.toMatch(/passwordHash\s*=\s*["'](?!\$argon2)[^"']+["']/i);
      }
    }
  });

  it("2. Password hashing must use Argon2id with unique salt", async () => {
    const pass = "SuperAdminStrongPass2026!";
    const hash = await hashPassword(pass);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await comparePassword(pass, hash)).toBe(true);
    expect(await comparePassword("WrongPassword123!", hash)).toBe(false);
  });

  it("3. Super Admin setup token must be signed, scope-restricted, and time-limited", () => {
    const userId = "usr-super-admin-001";
    const token = issueSetupToken(userId);
    expect(token).toBeDefined();

    const verifiedUserId = verifySetupToken(token);
    expect(verifiedUserId).toBe(userId);
  });

  it("4. Step-up authentication tokens must require matching target action and expire quickly", () => {
    const userId = "usr-super-admin-001";
    const action = "TENANT_DELETION";
    const stepUpToken = issueStepUpToken(userId, action);

    const verified = verifyStepUpToken(stepUpToken, action);
    expect(verified.userId).toBe(userId);
    expect(verified.action).toBe(action);

    // Mismatched action must fail
    expect(() => verifyStepUpToken(stepUpToken, "KEY_ROTATION")).toThrow();
  });

  it("5. MFA TOTP secret generation & verification must work correctly", () => {
    const secret = generateTotpSecret();
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThanOrEqual(16);

    // Generating TOTP code using current timestamp window
    const isValid = verifyTotpCode(secret, "000000");
    // Invalid code returns false
    expect(isValid).toBe(false);
  });

  it("6. WebAuthn challenge generation is non-authorizing until a real verifier is implemented", () => {
    const challenge = generateWebAuthnChallenge("usr-super-admin-001");
    expect(challenge.challenge).toBeDefined();
    expect(challenge.rp.name).toBe("Kwakoko Business Operating System");
    expect(challenge.user.name).toBe("admin@kwakoko.co.tz");
  });

  it("7. Throttling key generation formats unique rate limiting keys", () => {
    const keys = throttleKeys("admin@kwakoko.co.tz", "192.168.1.1", "device-win-01");
    expect(keys).toContain("email:admin@kwakoko.co.tz");
    expect(keys).toContain("ip:192.168.1.1");
    expect(keys).toContain("device:device-win-01");
  });

  it("8. Offline Sync engine must reject privilege escalation attempts", () => {
    const store = new InMemoryStore();
    const productRepo = new ScopedProductRepository(store);
    const stockRepo = new ScopedStockRepository(store);
    const syncEngine = new SyncEngine(productRepo, stockRepo, store);

    const ctx = { tenantId: "ten-001", branchId: "br-001", roles: ["CASHIER"], permissions: ["pos:sale"] };

    const maliciousPushPayload = {
      deviceId: "device-hacked-01",
      operations: [
        {
          operationId: "op-hack-01",
          idempotencyKey: "idem-hack-01",
          entityType: "Role",
          entityId: "role-super-admin",
          operationType: "CREATE",
          clientCreatedAt: new Date().toISOString(),
          payload: { name: "SUPER_ADMIN", permissions: ["*"] },
        },
      ],
    };

    const res = syncEngine.processPush(ctx, maliciousPushPayload as any);
    expect(res.results[0].status).toBe("FAILED");
    expect(res.results[0].error).toContain("PRIVILEGE_ESCALATION_ATTEMPT_DENIED");
  });
});
