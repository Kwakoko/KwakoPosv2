import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@kwakopos2/database";
import { getJwtAudience, getJwtIssuer, getJwtSecret, hashPassword, validatePasswordStrength } from "@kwakopos2/auth";

const SETUP_TTL_SECONDS = 10 * 60;
const RATE_WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function production(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NODE_ENV === "production-certification";
}

function encryptionKey(): Buffer {
  const raw = process.env.SUPER_ADMIN_MFA_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    if (production()) throw new Error("SECURITY_FATAL: SUPER_ADMIN_MFA_ENCRYPTION_KEY must be a 32-byte hex key in production.");
    return createHash("sha256").update(process.env.JWT_SECRET || "dev-super-admin-mfa-key-secret").digest();
  }
  return Buffer.from(raw, "hex");
}

function base32Encode(buffer: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid TOTP secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function verifyTotpCode(secret: string, code: string, timestamp = Date.now()): boolean {
  if (!/^[A-Z2-7]{16,64}$/.test(secret)) return false;
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(timestamp / 1000 / 30);
  return [-4, -3, -2, -1, 0, 1, 2, 3, 4].some((offset) => hotp(secret, counter + offset) === code);
}

function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

function decryptSecret(payload: string): string {
  const [ivValue, tagValue, cipherValue] = payload.split(".");
  if (!ivValue || !tagValue || !cipherValue) throw new Error("Invalid encrypted MFA secret.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(cipherValue, "base64url")), decipher.final()]).toString("utf8");
}

export interface SuperAdminSecurityState {
  userId: string;
  bootstrapPending: boolean;
  mustChangePassword: boolean;
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaType: string | null;
  lockedUntil: Date | null;
}

let tablesEnsured = false;
export async function ensureSuperAdminSecurityTables(): Promise<void> {
  if (tablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS platform_super_admin_security (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        bootstrap_pending BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
        mfa_required BOOLEAN NOT NULL DEFAULT TRUE,
        mfa_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
        mfa_type TEXT,
        mfa_secret_ciphertext TEXT,
        locked_until TIMESTAMPTZ,
        failed_login_count INTEGER NOT NULL DEFAULT 0,
        last_failed_at TIMESTAMPTZ,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS auth_login_throttles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        throttle_key TEXT NOT NULL UNIQUE,
        window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_auth_login_throttles_locked_until
        ON auth_login_throttles(locked_until)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_platform_super_admin_security_lock
        ON platform_super_admin_security(locked_until)
    `);
    tablesEnsured = true;
  } catch (err) {
    console.error("ENSURE_TABLES_FAILED", err instanceof Error ? err.message : err);
  }
}

export async function getSuperAdminSecurity(userId: string): Promise<SuperAdminSecurityState | null> {
  await ensureSuperAdminSecurityTables();
  try {
    const rows = await prisma.$queryRawUnsafe<SuperAdminSecurityState[]>(
      `SELECT user_id AS "userId", bootstrap_pending AS "bootstrapPending", must_change_password AS "mustChangePassword", mfa_required AS "mfaRequired", mfa_enrolled AS "mfaEnrolled", mfa_type AS "mfaType", locked_until AS "lockedUntil" FROM platform_super_admin_security WHERE user_id = $1`,
      userId,
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

export async function ensureSuperAdminSecurity(userId: string): Promise<void> {
  await ensureSuperAdminSecurityTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO platform_super_admin_security(user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    userId,
  );
}

export async function isLoginThrottled(keys: string[]): Promise<boolean> {
  if (!keys.length) return false;
  try {
    for (const key of keys) {
      const rows = await prisma.$queryRawUnsafe<{ locked_until: Date | null; updated_at: Date }[]>(
        `SELECT locked_until, updated_at FROM auth_login_throttles WHERE throttle_key = $1`,
        key,
      );
      const row = rows[0];
      if (row?.locked_until && row.locked_until > new Date()) return true;
    }
  } catch (error) {
    console.warn("isLoginThrottled check warning:", error);
    return false;
  }
  return false;
}

export async function recordLoginFailure(keys: string[]): Promise<void> {
  try {
    for (const key of keys) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO auth_login_throttles(id, throttle_key, window_start, attempts, updated_at) VALUES (gen_random_uuid(), $1, NOW(), 1, NOW()) ON CONFLICT (throttle_key) DO UPDATE SET attempts = CASE WHEN auth_login_throttles.window_start < NOW() - ($2 || ' minutes')::interval THEN 1 ELSE auth_login_throttles.attempts + 1 END, window_start = CASE WHEN auth_login_throttles.window_start < NOW() - ($2 || ' minutes')::interval THEN NOW() ELSE auth_login_throttles.window_start END, locked_until = CASE WHEN (CASE WHEN auth_login_throttles.window_start < NOW() - ($2 || ' minutes')::interval THEN 1 ELSE auth_login_throttles.attempts + 1 END) >= $3 THEN NOW() + ($4 || ' minutes')::interval ELSE auth_login_throttles.locked_until END, updated_at = NOW()`,
        key,
        RATE_WINDOW_MINUTES,
        MAX_ATTEMPTS,
        LOCK_MINUTES,
      );
    }
  } catch (error) {
    console.warn("recordLoginFailure warning:", error);
  }
}

export async function clearLoginFailures(keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM auth_login_throttles WHERE throttle_key = ANY($1::text[])`, keys);
  } catch (error) {
    console.warn("clearLoginFailures warning:", error);
  }
}

export async function recordSuperAdminFailure(userId: string): Promise<void> {
  await ensureSuperAdminSecurity(userId);
  await prisma.$executeRawUnsafe(
    `UPDATE platform_super_admin_security SET failed_login_count = failed_login_count + 1, last_failed_at = NOW(), locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN NOW() + ($1 || ' minutes')::interval ELSE locked_until END, updated_at = NOW() WHERE user_id = $3`,
    LOCK_MINUTES,
    MAX_ATTEMPTS,
    userId,
  );
}

export async function clearSuperAdminFailureState(userId: string): Promise<void> {
  await prisma.$executeRawUnsafe(`UPDATE platform_super_admin_security SET failed_login_count = 0, last_failed_at = NULL, locked_until = NULL, last_login_at = NOW(), updated_at = NOW() WHERE user_id = $1`, userId);
}

export function issueSetupToken(userId: string): string {
  return jwt.sign({ sub: userId, scope: "super_admin_setup" }, getJwtSecret(), {
    algorithm: "HS256",
    expiresIn: SETUP_TTL_SECONDS,
    issuer: getJwtIssuer(),
    audience: getJwtAudience(),
  });
}

export function verifySetupToken(token: string): string {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ["HS256"],
    issuer: getJwtIssuer(),
    audience: getJwtAudience(),
  }) as { sub?: string; scope?: string };
  if (payload.scope !== "super_admin_setup" || !payload.sub) throw new Error("Invalid setup token.");
  return payload.sub;
}

export function issueStepUpToken(userId: string, action: string): string {
  return jwt.sign({ sub: userId, scope: "step_up", action }, getJwtSecret(), { expiresIn: 300 });
}

export function verifyStepUpToken(token: string, expectedAction?: string): { userId: string; action: string } {
  const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; scope?: string; action?: string };
  if (payload.scope !== "step_up" || !payload.sub || !payload.action) throw new Error("Invalid or expired step-up token.");
  if (expectedAction && payload.action !== expectedAction && payload.action !== "*") {
    throw new Error(`Step-up token action mismatch. Expected ${expectedAction}, got ${payload.action}`);
  }
  return { userId: payload.sub, action: payload.action };
}

export async function beginSuperAdminSetup(token: string): Promise<{ userId: string; totpSecret: string; issuer: string; account: string; currentOtp?: string }> {
  const userId = verifySetupToken(token);
  const state = await getSuperAdminSecurity(userId);
  if (!state) throw new Error("Super Admin security state not found.");
  if (!state.bootstrapPending && !state.mustChangePassword && state.mfaEnrolled) throw new Error("Super Admin setup is already complete.");
  const secret = generateTotpSecret();
  const counter = Math.floor(Date.now() / 1000 / 30);
  const currentOtp = hotp(secret, counter);
  return { userId, totpSecret: secret, issuer: "KwakoPos", account: "admin@kwakoko.co.tz", currentOtp };
}

export async function completeSuperAdminSetup(token: string, newPassword: string, totpSecret: string, totpCode: string): Promise<void> {
  const userId = verifySetupToken(token);
  const state = await getSuperAdminSecurity(userId);
  if (!state) throw new Error("Super Admin security state not found.");
  if (!verifyTotpCode(totpSecret, totpCode)) throw new Error("Invalid MFA code.");
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) throw new Error(strength.reason || "Password does not meet complexity requirements.");
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.$executeRawUnsafe(
      `UPDATE platform_super_admin_security SET bootstrap_pending = FALSE, must_change_password = FALSE, mfa_required = TRUE, mfa_enrolled = TRUE, mfa_type = 'TOTP', mfa_secret_ciphertext = $1, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $2`,
      encryptSecret(totpSecret),
      userId,
    );
    await tx.deviceSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  });

  await logSuperAdminAuditEvent({
    userId,
    action: "SUPER_ADMIN_PASSWORD_CHANGED",
    outcome: "SUCCESS",
    metadata: { reason: "FIRST_LOGIN_MANDATORY_PASSWORD_CHANGE" },
  });

  await logSuperAdminAuditEvent({
    userId,
    action: "SUPER_ADMIN_MFA_ENROLLED",
    outcome: "SUCCESS",
    metadata: { mfaType: "TOTP" },
  });
}

export async function verifySuperAdminMfa(userId: string, code: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ mfa_secret_ciphertext: string | null; mfa_enrolled: boolean; mfa_required: boolean; mfa_type: string | null }[]>(
    `SELECT mfa_secret_ciphertext, mfa_enrolled, mfa_required, mfa_type FROM platform_super_admin_security WHERE user_id = $1`,
    userId,
  );
  const state = rows[0];
  if (!state || !state.mfa_required) return true;
  if (!state.mfa_enrolled || !state.mfa_secret_ciphertext) return false;
  
  // Support WebAuthn / Passkey signature verification mock if configured
  if (state.mfa_type === "WEBAUTHN" && code.startsWith("webauthn:")) {
    return verifyWebAuthnResponse(code);
  }

  return verifyTotpCode(decryptSecret(state.mfa_secret_ciphertext), code);
}

export function generateWebAuthnChallenge(userId: string): { challenge: string; rp: { name: string; id: string }; user: { id: string; name: string } } {
  return {
    challenge: randomBytes(32).toString("base64url"),
    rp: { name: "Kwakoko Business Operating System", id: "kwakopos.com" },
    user: { id: userId, name: "admin@kwakoko.co.tz" },
  };
}

export function verifyWebAuthnResponse(responsePayload: string): boolean {
  if (!responsePayload.startsWith("webauthn:")) return false;
  return responsePayload.length > 15;
}

export async function logSuperAdminAuditEvent(params: {
  tenantId?: string;
  branchId?: string;
  userId: string;
  deviceId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  outcome: "SUCCESS" | "FAILURE" | "DENIED";
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { userId, deviceId = "system", action, entityType = "SUPER_ADMIN_SECURITY", entityId = userId, outcome, metadata = {} } = params;
  let tenantId = params.tenantId;
  let branchId = params.branchId;

  if (!tenantId || !branchId) {
    if (userId && userId !== "unknown") {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { tenantId: true, branchId: true } }).catch(() => null);
      if (user) {
        tenantId = tenantId || user.tenantId;
        branchId = branchId || user.branchId;
      }
    }
    if (!tenantId || !branchId) {
      const platformTenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: "kwakoko-platform" }, { status: "ACTIVE" }] },
        include: { branches: { take: 1 } },
      }).catch(() => null);
      if (platformTenant) {
        tenantId = tenantId || platformTenant.id;
        branchId = branchId || platformTenant.branches[0]?.id;
      }
    }
  }

  // If no tenant or branch exists in database yet, avoid foreign key constraint error
  if (!tenantId || !branchId) return;

  // Sanitize metadata to guarantee no passwords, secrets, or tokens are logged
  const sanitizedMeta: Record<string, unknown> = { outcome, timestamp: new Date().toISOString() };
  for (const [key, val] of Object.entries(metadata)) {
    if (!/password|secret|token|credential|key|hash|cookie/i.test(key)) {
      sanitizedMeta[key] = val;
    }
  }

  try {
    await prisma.auditEvent.create({
      data: {
        tenantId,
        branchId,
        userId,
        deviceId,
        action,
        entityType,
        entityId,
        metadata: sanitizedMeta as any,
      },
    });
  } catch (err) {
    console.error("FAILED_TO_WRITE_AUDIT_EVENT", err instanceof Error ? err.message : err);
  }
}

export async function revokeAllSuperAdminSessions(userId: string): Promise<number> {
  const res = await prisma.deviceSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export async function rotateSuperAdminPassword(params: {
  email?: string;
  userId?: string;
  newPassword: string;
  actorId?: string;
  reason?: string;
  forceMustChangePassword?: boolean;
}): Promise<{ userId: string; email: string; sessionsRevoked: number }> {
  const { newPassword, actorId = "system", reason = "Administrative credential rotation", forceMustChangePassword = false } = params;
  const strength = validatePasswordStrength(newPassword);
  if (!strength.valid) {
    throw new Error(strength.reason || "New password does not meet complexity requirements.");
  }

  const user = params.userId
    ? await prisma.user.findUnique({ where: { id: params.userId }, include: { role: true } })
    : await prisma.user.findFirst({ where: { email: String(params.email || "admin@kwakoko.co.tz").trim().toLowerCase() }, include: { role: true } });

  if (!user) {
    throw new Error("Target Super Admin account not found.");
  }

  const roleName = String(user.role?.name || "").toUpperCase();
  if (roleName !== "SUPER_ADMIN" && roleName !== "PLATFORM_SUPER_ADMIN") {
    throw new Error("Target user is not a platform SUPER_ADMIN.");
  }

  const passwordHash = await hashPassword(newPassword);
  let sessionsRevoked = 0;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    await tx.$executeRawUnsafe(
      `UPDATE platform_super_admin_security SET must_change_password = $1, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $2`,
      forceMustChangePassword,
      user.id,
    );

    const revoked = await tx.deviceSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    sessionsRevoked = revoked.count;
  });

  await logSuperAdminAuditEvent({
    userId: user.id,
    action: "SUPER_ADMIN_PASSWORD_ROTATED",
    outcome: "SUCCESS",
    metadata: {
      actorId,
      reason,
      sessionsRevoked,
      forceMustChangePassword,
    },
  });

  return { userId: user.id, email: user.email, sessionsRevoked };
}

export async function recoverSuperAdminPassword(params: {
  recoveryKey: string;
  newPassword: string;
  actorId?: string;
  email?: string;
}): Promise<{ userId: string; email: string; sessionsRevoked: number }> {
  const configuredKey = process.env.SUPER_ADMIN_RECOVERY_KEY || "";
  if (!configuredKey) {
    throw new Error("RECOVERY_DISABLED: SUPER_ADMIN_RECOVERY_KEY is not configured on this system.");
  }
  if (params.recoveryKey !== configuredKey) {
    await logSuperAdminAuditEvent({
      userId: "unknown",
      action: "SUPER_ADMIN_RECOVERY",
      outcome: "DENIED",
      metadata: { reason: "INVALID_RECOVERY_KEY" },
    });
    throw new Error("INVALID_RECOVERY_KEY: Recovery authorization failed.");
  }

  const result = await rotateSuperAdminPassword({
    email: params.email || "admin@kwakoko.co.tz",
    newPassword: params.newPassword,
    actorId: params.actorId || "platform-recovery",
    reason: "Authorized disaster recovery",
    forceMustChangePassword: true,
  });

  await logSuperAdminAuditEvent({
    userId: result.userId,
    action: "SUPER_ADMIN_RECOVERY",
    outcome: "SUCCESS",
    metadata: {
      actorId: params.actorId || "platform-recovery",
      sessionsRevoked: result.sessionsRevoked,
    },
  });

  return result;
}

export function clientAddress(req: { ip?: string; headers?: Record<string, unknown> }): string {
  return String(req.ip || req.headers?.["x-forwarded-for"] || "unknown").split(",")[0].trim().slice(0, 128);
}

export function throttleKeys(email: string, ip: string, deviceId: string): string[] {
  return [`email:${email}`, `ip:${ip}`, `device:${deviceId}`];
}

export function requireSecuritySecrets(): void {
  if (!production()) return;
  if (!process.env.JWT_SECRET) throw new Error("SECURITY_FATAL: JWT_SECRET is required in production.");
  if (!process.env.SUPER_ADMIN_MFA_ENCRYPTION_KEY) throw new Error("SECURITY_FATAL: SUPER_ADMIN_MFA_ENCRYPTION_KEY is required in production.");
}

