import jwt from "jsonwebtoken";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { TenantContext, UserRole } from "@kwakopos2/contracts";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECURITY_FATAL: JWT_SECRET environment variable is MANDATORY in production environments!");
    }
    return "kwakopos-super-secret-jwt-key-change-in-production-min32chars";
  }
  return secret;
}

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
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

export function comparePassword(password: string, hash: string): boolean {
  if (hash.startsWith("scrypt:")) {
    const [, salt, originalKey] = hash.split(":");
    const derivedKey = scryptSync(password, salt, 64).toString("hex");
    return timingSafeEqual(Buffer.from(originalKey, "hex"), Buffer.from(derivedKey, "hex"));
  }
  // Legacy SHA-256 fallback comparison for backward compatibility
  const legacyHash = createHash("sha256").update(password + getJwtSecret()).digest("hex");
  return legacyHash === hash;
}

export function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "15m" });
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as JwtPayload;
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

export interface SessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export class SessionManager {
  private inMemorySessions = new Map<string, SessionRecord>();

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(
    tenantId: string,
    userId: string,
    deviceId: string,
    expiresInDays = 30
  ): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
    const sessionId = randomBytes(16).toString("hex");
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const record: SessionRecord = {
      id: sessionId,
      tenantId,
      userId,
      deviceId,
      refreshTokenHash,
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };

    this.inMemorySessions.set(sessionId, record);
    return { sessionId, refreshToken, expiresAt };
  }

  async rotateRefreshToken(
    sessionId: string,
    providedRefreshToken: string,
    userPayload: Omit<JwtPayload, "deviceId">
  ): Promise<{ accessToken: string; refreshToken: string } | null> {
    const session = this.inMemorySessions.get(sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return null;
    }

    const providedHash = this.hashToken(providedRefreshToken);
    if (session.refreshTokenHash !== providedHash) {
      session.revokedAt = new Date();
      return null;
    }

    const newRefreshToken = generateRefreshToken();
    session.refreshTokenHash = this.hashToken(newRefreshToken);

    const payload: JwtPayload = {
      ...userPayload,
      deviceId: session.deviceId,
    };

    const accessToken = generateAccessToken(payload);
    return { accessToken, refreshToken: newRefreshToken };
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    const session = this.inMemorySessions.get(sessionId);
    if (session) {
      session.revokedAt = new Date();
      return true;
    }
    return false;
  }

  async revokeAllUserSessions(tenantId: string, userId: string): Promise<number> {
    let count = 0;
    for (const session of this.inMemorySessions.values()) {
      if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
        session.revokedAt = new Date();
        count++;
      }
    }
    return count;
  }
}

export const globalSessionManager = new SessionManager();


