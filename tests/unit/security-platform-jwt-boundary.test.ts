import { describe, expect, it } from "vitest";
import { generateAccessToken, verifyAccessToken } from "@kwakopos2/auth";

describe("Security Platform JWT privilege boundary", () => {
  it("fails closed when callers omit roles and permissions", () => {
    const token = generateAccessToken({
      tenantId: "tenant-security-test",
      branchId: "branch-security-test",
      userId: "user-security-test",
      email: "security-test@example.invalid",
      deviceId: "device-security-test",
    });

    const claims = verifyAccessToken(token);
    expect(claims.roles).toEqual([]);
    expect(claims.permissions).toEqual([]);
    expect(claims.roles).not.toContain("ADMIN");
    expect(claims.permissions).not.toContain("*");
  });

  it("preserves explicit role and permission claims", () => {
    const token = generateAccessToken({
      tenantId: "tenant-security-test",
      branchId: "branch-security-test",
      userId: "user-security-test",
      email: "security-test@example.invalid",
      deviceId: "device-security-test",
      roles: ["CASHIER"],
      permissions: ["sales.create"],
    });

    const claims = verifyAccessToken(token);
    expect(claims.roles).toEqual(["CASHIER"]);
    expect(claims.permissions).toEqual(["sales.create"]);
  });
});
