import jwt from "jsonwebtoken";
import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { TenantContext } from "@kwakopos2/contracts";

const developmentJwtSecret = randomBytes(48).toString("hex");
const ARGON2_MEMORY_COST = Number(process.env.KWAKOPOS_ARGON2_MEMORY_COST || 65536);
const ARGON2_TIME_COST = Number(process.env.KWAKOPOS_ARGON2_TIME_COST || 3);
const ARGON2_PARALLELISM = Number(process.env.KWAKOPOS_ARGON2_PARALLELISM || 1);
const JWT_ALGORITHM = "HS256" as const;
const JWT_ISSUER = String(process.env.JWT_ISSUER || "kwakopos-api").trim();
const JWT_AUDIENCE = String(process.env.JWT_AUDIENCE || "kwakopos-web").trim();
const ACCESS_TOKEN_TTL = String(process.env.ACCESS_TOKEN_TTL || "20m").trim();

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

export function getJwtIssuer(): string {
  return JWT_ISSUER;
}

export function getJwtAudience(): string {
  return JWT_AUDIENCE;
}

export interface JwtPayload {
  sub: string;
  tenantId: string;
  branchId: string;
  email: string;
  roles: string[];
  permissions: string[];
  deviceId: string;
  sessionId?: string;
  permissionsVersion?: number;
  tenantVersion?: number;
  iat?: number;
  exp?: number;
}

function assertJwtPayload(payload: unknown): asserts payload is JwtPayload {
  const value = payload as Partial<JwtPayload> | null;
  if (!value || typeof value !== "object" || typeof value.sub !== "string" || !value.sub ||
      typeof value.tenantId !== "string" || !value.tenantId || typeof value.branchId !== "string" || !value.branchId ||
      typeof value.email !== "string" || !value.email || !Array.isArray(value.roles) || !Array.isArray(value.permissions) ||
      typeof value.deviceId !== "string" || !value.deviceId ||
      !value.roles.every((role) => typeof role === "string") ||
      !value.permissions.every((permission) => typeof permission === "string")) {
    throw new Error("Invalid access-token claims.");
  }
}

export function validatePasswordStrength(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 10) {
    return { valid: false, reason: "Password must contain at least 10 characters." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one uppercase letter." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one lowercase letter." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one digit." };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, reason: "Password must contain at least one special character." };
  }
  return { valid: true };
}

export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < 10) throw new Error("Password must contain at least 10 characters.");
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
  return false;
}

export function passwordNeedsRehash(storedHash: string): boolean {
  return !storedHash.startsWith("$argon2id$");
}

export function generateAccessToken(payload: Partial<JwtPayload> & { tenantId: string; branchId: string; userId?: string }): string {
  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification";
  if (isProduction && (!Array.isArray(payload.roles) || payload.roles.length === 0 || !Array.isArray(payload.permissions) || payload.permissions.length === 0)) {
    throw new Error("SECURITY_FATAL: Production access tokens require explicit roles and permissions.");
  }
  const normalized: JwtPayload = {
    ...payload,
    sub: payload.sub || payload.userId || "usr_system",
    tenantId: payload.tenantId,
    branchId: payload.branchId,
    email: payload.email || "system@kwakopos.local",
    roles: payload.roles && payload.roles.length ? payload.roles : ["ADMIN"],
    permissions: payload.permissions && payload.permissions.length ? payload.permissions : ["*"],
    deviceId: payload.deviceId || "dev_system",
    ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
  };
  return jwt.sign(normalized, getJwtSecret(), {
    algorithm: JWT_ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL as any,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    assertJwtPayload(decoded);
    return decoded;
  } catch {
    throw new Error("UNAUTHORIZED: Invalid or expired access token.");
  }
}

export function extractTenantContext(payload: JwtPayload): TenantContext {
  return { tenantId: payload.tenantId, branchId: payload.branchId, userId: payload.sub, roles: payload.roles, permissions: payload.permissions };
}

export type SessionStatus =
  | "ACTIVE"
  | "LOCKED"
  | "EXPIRED"
  | "REVOKED"
  | "LOGGED_OUT";

export interface SessionRecord {
  id: string;
  tenantId: string;
  userId: string;
  branchId: string;
  deviceId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  createdAt: Date;
  lastActivityAt: Date;
  lastValidatedAt: Date;
  expiresAt: Date;
  refreshTokenExpiresAt: Date;
  revokedAt: Date | null;
  revokeReason?: string | null;
  status: SessionStatus;
  permissionsVersion: number;
  tenantVersion: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  rememberMe?: boolean;
  offlineStartedAt?: Date | null;
  offlineExpiresAt?: Date | null;
  idleTimeoutMs: number;
}

export interface SessionCreateInput {
  tenantId: string;
  userId: string;
  branchId: string;
  deviceId: string;
  permissionsVersion?: number;
  tenantVersion?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  platform?: string | null;
  rememberMe?: boolean;
  idleTimeoutMs?: number;
  absoluteLifetimeMs?: number;
  refreshTokenLifetimeMs?: number;
}

export interface SessionValidation {
  valid: boolean;
  code:
    | "OK"
    | "SESSION_NOT_FOUND"
    | "SESSION_EXPIRED"
    | "SESSION_REVOKED"
    | "SESSION_LOCKED"
    | "TENANT_MISMATCH"
    | "BRANCH_MISMATCH"
    | "USER_MISMATCH"
    | "DEVICE_MISMATCH"
    | "REFRESH_EXPIRED";
  session?: SessionRecord;
}

export interface SessionStoreProvider {
  create(record: SessionRecord): Promise<void>;
  get(sessionId: string): Promise<SessionRecord | null>;
  update(record: SessionRecord): Promise<void>;
  revokeAllForUser(tenantId: string, userId: string, reason?: string): Promise<number>;
  listForUser?(tenantId: string, userId: string): Promise<SessionRecord[]>;
  revokeTokenFamily?(tokenFamilyId: string, reason: string, at?: Date): Promise<number>;
  atomicRotateRefreshToken?(
    sessionId: string,
    expectedRefreshTokenHash: string,
    replacementRefreshTokenHash: string,
    now: Date,
  ): Promise<{ rotated: boolean; reused: boolean; session: SessionRecord | null }>;
}

function addMs(now: Date, ms: number): Date {
  return new Date(now.getTime() + ms);
}

export class SessionManager {
  private inMemorySessions = new Map<string, SessionRecord>();
  private storeProvider: SessionStoreProvider | null = null;

  public setStoreProvider(provider: SessionStoreProvider): void {
    this.storeProvider = provider;
  }

  public getStoreProvider(): SessionStoreProvider | null {
    return this.storeProvider;
  }

  private requireProductionStore(): void {
    if ((process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification") && !this.storeProvider) {
      throw new Error("SECURITY_FATAL: Persistent PostgreSQL session store provider is MANDATORY in production environments!");
    }
  }

  private async get(sessionId: string): Promise<SessionRecord | null> {
    return this.storeProvider ? this.storeProvider.get(sessionId) : (this.inMemorySessions.get(sessionId) || null);
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    this.requireProductionStore();
    return this.get(sessionId);
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  async createSession(inputOrTenantId: SessionCreateInput | string, userId?: string, deviceId?: string, expiresInDays?: number): Promise<{ sessionId: string; refreshToken: string; expiresAt: Date; refreshTokenExpiresAt: Date }> {
    this.requireProductionStore();
    const now = new Date();
    const input: SessionCreateInput = typeof inputOrTenantId === "string"
      ? {
          tenantId: inputOrTenantId,
          userId: String(userId || ""),
          deviceId: String(deviceId || "device-client"),
          branchId: "branch-default",
          idleTimeoutMs: 30 * 60_000,
          absoluteLifetimeMs: typeof expiresInDays === "number" ? expiresInDays * 24 * 60 * 60_000 : 8 * 60 * 60_000,
          refreshTokenLifetimeMs: 14 * 24 * 60 * 60_000,
        }
      : inputOrTenantId;
    if (!input.tenantId || !input.userId || !input.deviceId) throw new Error("SESSION_CONTEXT_REQUIRED");
    const sessionId = randomBytes(16).toString("hex");
    const tokenFamilyId = randomBytes(16).toString("hex");
    const refreshToken = generateRefreshToken();
    const absoluteLifetimeMs = input.absoluteLifetimeMs ?? 8 * 60 * 60_000;
    const refreshTokenLifetimeMs = input.refreshTokenLifetimeMs ?? 14 * 24 * 60 * 60_000;
    const expiresAt = addMs(now, absoluteLifetimeMs);
    const refreshTokenExpiresAt = addMs(now, input.rememberMe ? Math.max(refreshTokenLifetimeMs, 30 * 24 * 60 * 60_000) : refreshTokenLifetimeMs);
    const record: SessionRecord = {
      id: sessionId,
      tenantId: input.tenantId,
      userId: input.userId,
      branchId: input.branchId,
      deviceId: input.deviceId,
      refreshTokenHash: this.hashToken(refreshToken),
      tokenFamilyId,
      createdAt: now,
      lastActivityAt: now,
      lastValidatedAt: now,
      expiresAt,
      refreshTokenExpiresAt,
      revokedAt: null,
      revokeReason: null,
      status: "ACTIVE",
      permissionsVersion: input.permissionsVersion ?? 1,
      tenantVersion: input.tenantVersion ?? 1,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      platform: input.platform ?? null,
      rememberMe: Boolean(input.rememberMe),
      offlineStartedAt: null,
      offlineExpiresAt: null,
      idleTimeoutMs: input.idleTimeoutMs ?? 30 * 60_000,
    };
    if (this.storeProvider) await this.storeProvider.create(record);
    else this.inMemorySessions.set(sessionId, record);
    return { sessionId, refreshToken, expiresAt, refreshTokenExpiresAt };
  }

  async validateSession(sessionId: string, context?: { tenantId?: string; branchId?: string; userId?: string; deviceId?: string; activity?: boolean; now?: Date }): Promise<SessionValidation> {
    this.requireProductionStore();
    const session = await this.get(sessionId);
    if (!session) return { valid: false, code: "SESSION_NOT_FOUND" };
    const now = context?.now || new Date();
    if (session.revokedAt || session.status === "REVOKED" || session.status === "LOGGED_OUT") return { valid: false, code: "SESSION_REVOKED", session };
    if (session.status === "LOCKED") return { valid: false, code: "SESSION_LOCKED", session };
    if (session.expiresAt <= now) {
      session.status = "EXPIRED";
      session.revokedAt = session.revokedAt || now;
      session.revokeReason = session.revokeReason || "SESSION_EXPIRED";
      await this.persist(session);
      return { valid: false, code: "SESSION_EXPIRED", session };
    }
    if (context?.tenantId && session.tenantId !== context.tenantId) return { valid: false, code: "TENANT_MISMATCH", session };
    if (context?.branchId && session.branchId && session.branchId !== context.branchId) return { valid: false, code: "BRANCH_MISMATCH", session };
    if (context?.userId && session.userId !== context.userId) return { valid: false, code: "USER_MISMATCH", session };
    if (context?.deviceId && session.deviceId !== context.deviceId) return { valid: false, code: "DEVICE_MISMATCH", session };
    if (session.refreshTokenExpiresAt <= now) return { valid: false, code: "REFRESH_EXPIRED", session };
    if (session.lastActivityAt.getTime() + session.idleTimeoutMs <= now.getTime()) {
      session.status = "EXPIRED";
      session.revokedAt = now;
      session.revokeReason = "SESSION_TIMEOUT";
      await this.persist(session);
      return { valid: false, code: "SESSION_EXPIRED", session };
    }
    return { valid: true, code: "OK", session };
  }

  async touchActivity(sessionId: string, at = new Date()): Promise<boolean> {
    this.requireProductionStore();
    const session = await this.get(sessionId);
    if (!session) return false;
    if (session.revokedAt || session.status !== "ACTIVE" || session.expiresAt <= at) return false;
    session.lastActivityAt = at;
    await this.persist(session);
    return true;
  }

  async validateAndTouch(sessionId: string, context?: { tenantId?: string; branchId?: string; userId?: string; deviceId?: string; activity?: boolean; now?: Date }): Promise<SessionValidation> {
    const result = await this.validateSession(sessionId, context);
    if (result.valid && context?.activity !== false) await this.touchActivity(sessionId, context?.now || new Date());
    return result;
  }

  async markOffline(sessionId: string, offlineGracePeriodMs: number, at = new Date()): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session || session.revokedAt || session.status !== "ACTIVE") return false;
    session.offlineStartedAt = at;
    session.offlineExpiresAt = new Date(Math.min(session.expiresAt.getTime(), at.getTime() + offlineGracePeriodMs));
    await this.persist(session);
    return true;
  }

  async lockSession(sessionId: string, reason = "OFFLINE_GRACE_EXPIRED"): Promise<boolean> {
    const session = await this.get(sessionId);
    if (!session || session.revokedAt) return false;
    session.status = "LOCKED";
    session.revokeReason = reason;
    await this.persist(session);
    return true;
  }

  private async persist(session: SessionRecord): Promise<void> {
    if (this.storeProvider) await this.storeProvider.update(session);
    else this.inMemorySessions.set(session.id, session);
  }

  async rotateRefreshToken(sessionId: string, providedRefreshToken: string, userPayload: Omit<JwtPayload, "deviceId">): Promise<{ accessToken: string; refreshToken: string } | null> {
    this.requireProductionStore();
    const now = new Date();
    const session = await this.get(sessionId);
    if (!session || session.revokedAt || session.status !== "ACTIVE" || session.expiresAt <= now || session.refreshTokenExpiresAt <= now) return null;
    if (session.lastActivityAt.getTime() + session.idleTimeoutMs <= now.getTime()) {
      session.status = "EXPIRED";
      session.revokedAt = now;
      session.revokeReason = "SESSION_TIMEOUT";
      await this.persist(session);
      return null;
    }
    const providedHash = this.hashToken(providedRefreshToken);

    if (this.storeProvider?.atomicRotateRefreshToken) {
      const replacement = generateRefreshToken();
      const result = await this.storeProvider.atomicRotateRefreshToken(sessionId, providedHash, this.hashToken(replacement), now);
      if (!result.rotated || !result.session) {
        if (result.reused && this.storeProvider.revokeTokenFamily) await this.storeProvider.revokeTokenFamily(session.tokenFamilyId, "TOKEN_REUSE_DETECTED", now);
        return null;
      }
      return {
        accessToken: generateAccessToken({
          ...userPayload,
          deviceId: result.session.deviceId,
          sessionId: result.session.id,
          permissionsVersion: result.session.permissionsVersion,
          tenantVersion: result.session.tenantVersion,
        }),
        refreshToken: replacement,
      };
    }

    if (session.refreshTokenHash !== providedHash) {
      session.revokedAt = now;
      session.status = "REVOKED";
      session.revokeReason = "TOKEN_REUSE_DETECTED";
      await this.persist(session);
      return null;
    }
    const newRefreshToken = generateRefreshToken();
    session.refreshTokenHash = this.hashToken(newRefreshToken);
    session.lastValidatedAt = now;
    await this.persist(session);
    return {
      accessToken: generateAccessToken({
        ...userPayload,
        deviceId: session.deviceId,
        sessionId: session.id,
        permissionsVersion: session.permissionsVersion,
        tenantVersion: session.tenantVersion,
      }),
      refreshToken: newRefreshToken,
    };
  }

  async isSessionRevoked(sessionId: string): Promise<boolean> {
    const result = await this.validateSession(sessionId, { activity: false });
    return !result.valid;
  }

  async revokeSession(sessionId: string, reason = "USER_LOGOUT"): Promise<boolean> {
    this.requireProductionStore();
    const session = await this.get(sessionId);
    if (!session) return false;
    const at = new Date();
    session.revokedAt = at;
    session.status = reason === "USER_LOGOUT" ? "LOGGED_OUT" : "REVOKED";
    session.revokeReason = reason;
    await this.persist(session);
    return true;
  }

  async revokeAllUserSessions(tenantId: string, userId: string, reason = "PASSWORD_CHANGE"): Promise<number> {
    this.requireProductionStore();
    if (this.storeProvider) return this.storeProvider.revokeAllForUser(tenantId, userId, reason);
    let count = 0;
    for (const session of this.inMemorySessions.values()) {
      if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
        session.revokedAt = new Date();
        session.status = "REVOKED";
        session.revokeReason = reason;
        count++;
      }
    }
    return count;
  }
}

export const globalSessionManager = new SessionManager();

export * from "./sessionPolicy.js";
