import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword, passwordNeedsRehash } from "@kwakopos2/auth";

describe("password hardening", () => {
  it("hashes new passwords with Argon2id and never returns plaintext", async () => {
    const password = "test-password-for-unit-suite-2026";
    const hash = await hashPassword(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain(password);
    expect(await comparePassword(password, hash)).toBe(true);
    expect(await comparePassword("wrong-password", hash)).toBe(false);
    expect(passwordNeedsRehash(hash)).toBe(false);
  });

  it("rejects malformed and empty password hashes safely", async () => {
    expect(await comparePassword("anything", "")).toBe(false);
    expect(await comparePassword("anything", "$argon2id$malformed")).toBe(false);
    expect(passwordNeedsRehash("scrypt:legacy:salt")).toBe(true);
  });
});
