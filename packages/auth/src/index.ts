import jwt from "jsonwebtoken";
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";

const developmentJwtSecret = randomBytes(48).toString("hex");
const ARGON2_MEMORY_COST = Number(process.env.KWAKOPOS_ARGON2_MEMORY_COST || 65536);
const ARGON2_TIME_COST = Number(process.env.KWAKOPOS_ARGON2_TIME_COST || 3);
const ARGON2_PARALLELISM = Number(process.env.KWAKOPOS_ARGON2_PARALLELISM || 1);

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification") {
      throw new Error("SECURITY_FATAL: JWT_SECRET environment variable is MANDATORY in production environments!");
    }
    return developmentJwtSecret;
  }
  return secret;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  branchId: string;
  email: string;
  roles: string[];
  permissions: string[];
  deviceId: string;
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 12) throw new Error("Password must contain at least 12 characters.");
  return argon2Hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: ARGON2_MEMORY_COST,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    outputLen: 32,
  });
}

export async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith("$argon2id$")) {
    try {
      return await argon2Verify(storedHash, password);
    } catch {
      return false;
    }
  }
  if (storedHash.startsWith("scrypt:")) {
    const [, salt, originalKey] = storedHash.split(":");
    if (!salt || !originalKey) return false;
    try {
      const derivedKey = scryptSync(password, salt, 64).toString("hex");
      const expected = Buffer.from(originalKey, "hex");
      const actual = Buffer.from(derivedKey, "hex");
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }
  try {
    const legacyHash = createHash("sha256").update(password + getJwtSecret()).digest("hex");
    const expected = Buffer.from(storedHash);
    const actual = Buffer.from(legacyHash);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function passwordNeedsRehash(storedHash: string): boolean {
  return !storedHash.startsWith("$argon2id$");
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
  } catch {
    throw new Error("UNAUTHORIZED: Invalid or expired access token.");
  }
}

export function extractTenantContext(payload: JwtPayload): TenantContext {
  return { tenantId: payload.tenantId, branchId: payload.branchId, userId: payload.sub, roles: payload.roles, permissions: payload.permissions };
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

export interface SessionStoreProvider {
  create(record: SessionRecord): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(record: SessionRecord): Promise<void>;
  revokeAllForUser(tenantId: string, userId: string): Promise<number>;
}

export class SessionManager {
  private inMemorySessions = new Map<string, SessionRecord>();
  private storeProvider: SessionStoreProvider | null = null;

  public setStoreProvider(provider: SessionStoreProvider): void {
    this.storeProvider = provider;
  }

  private requireProductionStore(): void {
    if ((process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification") && !this.storeProvider) {
      throw new Error("SECURITY_FATAL: Persistent PostgreSQL session store provider is MANDATORY in production environments!");
    }
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(tenantId: string, userId: string, deviceId: string, expiresInDays = 30): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date }> {
    this.requireProductionStore();
    const sessionId = randomBytes(16).toString("hex");
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const record: SessionRecord = { id: sessionId, tenantId, userId, deviceId, refreshTokenHash: this.hashToken(refreshToken), expiresAt, revokedAt: null, createdAt: new Date() };
    if (this.storeProvider) await this.storeProvider.create(record);
    else this.inMemorySessions.set(sessionId, record);
    return { sessionId, refreshToken, expiresAt };
  }

  async rotateRefreshToken(sessionId: string, providedRefreshToken: string, userPayload: Omit<JwtPayload, "deviceId">): Promise<{ accessToken: string; refreshToken: string } | null> {
    this.requireProductionStore();
    const session = this.storeProvider ? await this.storeProvider.get(sessionId) : this.inMemorySessions.get(sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
    const providedHash = this.hashToken(providedRefreshToken);
    if (session.refreshTokenHash !== providedHash) {
      session.revokedAt = new Date();
      if (this.storeProvider) await this.storeProvider.update(session);
      return null;
    }
    const newRefreshToken = generateRefreshToken();
    session.refreshTokenHash = this.hashToken(newRefreshToken);
    if (this.storeProvider) await this.storeProvider.update(session);
    return { accessToken: generateAccessToken({ ...userPayload, deviceId: session.deviceId }), refreshToken: newRefreshToken };
  }

  async revokeSession(sessionId: string): Promise<boolean> {
    this.requireProductionStore();
    const session = this.storeProvider ? await this.storeProvider.get(sessionId) : this.inMemorySessions.get(sessionId);
    if (!session) return false;
    session.revokedAt = new Date();
    if (this.storeProvider) await this.storeProvider.update(session);
    return true;
  }

  async revokeAllUserSessions(tenantId: string, userId: string): Promise<number> {
    this.requireProductionStore();
    if (this.storeProvider) return this.storeProvider.revokeAllForUser(tenantId, userId);
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
