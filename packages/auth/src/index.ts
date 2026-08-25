import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { TenantContext } from "@kwakopos2/contracts";

const JWT_SECRET = process.env.JWT_SECRET || "kwakopos-super-secret-jwt-key-change-in-production-min32chars";

export interface JwtPayload {
  sub: string; // userId
  tenantId: string;
  branchId: string;
  email: string;
  roles: string[];
  permissions: string[];
  deviceId: string;
}

export function hashPassword(password: string): string {
  return createHash("sha256").update(password + JWT_SECRET).digest("hex");
}

export function comparePassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) {
    throw new Error("UNAUTHORIZED: Invalid or expired access token.");
  }
}

export function extractTenantContext(payload: JwtPayload): TenantContext {
  return {
    tenantId: payload.tenantId,
    branchId: payload.branchId,
    userId: payload.sub,
    roles: payload.roles,
    permissions: payload.permissions,
  };
}
