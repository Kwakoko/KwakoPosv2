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
    expect(await comparePassword("anything", "4f0d0d1d7f1d9a5c9fbb6f7c0d2a0b6e9a2d9e2c1a3f8b5d7c9e1f2a4b6c8d0e")).toBe(false);
    expect(passwordNeedsRehash("scrypt:legacy:salt")).toBe(true);
  });
});
