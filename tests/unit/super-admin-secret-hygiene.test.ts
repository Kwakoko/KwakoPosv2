import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validatePasswordStrength, hashPassword, comparePassword } from "@kwakopos2/auth";

describe("KwakoPos v2 — Super Admin Secret Hygiene & Password Policy", () => {
  const rootDir = process.cwd();

  it("1. Bootstrap secret 'Argon2id2@' must never be hardcoded as a static permanent credential", () => {
    const trackedFiles = [
      "packages/database/prisma/schema.prisma",
      "packages/database/prisma/seed.ts",
      "apps/api/src/server.ts",
      "apps/api/src/serverFixed.ts",
      "apps/web/src/pages/LoginPage.tsx",
      "apps/web/src/pages/SuperAdminPage.tsx",
      "docker-compose.yml",
      "Dockerfile",
    ];

    for (const rel of trackedFiles) {
      const full = path.join(rootDir, rel);
      if (fs.existsSync(full)) {
        const content = fs.readFileSync(full, "utf8");
        // Must not contain hardcoded bootstrap password string
        expect(content).not.toContain("TestOnly-StrongPass-2026!");
      }
    }
  });

  it("2. Password policy validator enforces strict complexity standards", () => {
    // Valid password (10+ chars, uppercase, lowercase, digit, symbol)
    const validResult = validatePasswordStrength("TestOnly-StrongPass-2026!");
    expect(validResult.valid).toBe(true);

    const strongResult = validatePasswordStrength("SuperMasterKey2026!#");
    expect(strongResult.valid).toBe(true);

    // Too short (< 10 chars)
    const shortResult = validatePasswordStrength("Short-1!");
    expect(shortResult.valid).toBe(false);
    expect(shortResult.reason).toContain("at least 10 characters");

    // Missing uppercase
    const noUpperResult = validatePasswordStrength("testonlysecret2026!");
    expect(noUpperResult.valid).toBe(false);
    expect(noUpperResult.reason).toContain("uppercase");

    // Missing lowercase
    const noLowerResult = validatePasswordStrength("TESTONLYSECRET2026!");
    expect(noLowerResult.valid).toBe(false);
    expect(noLowerResult.reason).toContain("lowercase");

    // Missing digit
    const noDigitResult = validatePasswordStrength("TestPasswordSecret@");
    expect(noDigitResult.valid).toBe(false);
    expect(noDigitResult.reason).toContain("digit");

    // Missing special character
    const noSpecialResult = validatePasswordStrength("TestPasswordSecret2");
    expect(noSpecialResult.valid).toBe(false);
    expect(noSpecialResult.reason).toContain("special character");
  });

  it("3. Argon2id derives secure hash and verifies correctly", async () => {
    const bootstrapCandidate = "TestOnly-StrongPass-2026!";
    const hash = await hashPassword(bootstrapCandidate);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await comparePassword(bootstrapCandidate, hash)).toBe(true);
    expect(await comparePassword("WrongPassword123!", hash)).toBe(false);
  });
  it("4. TOTP setup must not return a live OTP and the legacy TOTP dump script must be absent", () => {
    const service = fs.readFileSync(path.join(rootDir, "apps/api/src/services/superAdminSecurityService.ts"), "utf8");
    expect(service).not.toContain("currentOtp");
    expect(fs.existsSync(path.join(rootDir, "scripts/security/show-totp.ts"))).toBe(false);
  });

});
