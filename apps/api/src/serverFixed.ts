import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";
import { loadConfig } from "@kwakopos2/config";
import { prisma } from "@kwakopos2/database";
import {
  comparePassword,
  generateAccessToken,
  globalSessionManager,
  hashPassword,
  passwordNeedsRehash,
  verifyAccessToken,
  sessionPolicyFromSettings,
  sessionPolicyToMinutes,
} from "@kwakopos2/auth";
import { globalSettingsService } from "./services/settingsService.js";
import { buildServer } from "./server.js";
import { tenantOnboardingRoutes } from "./routes/tenantOnboardingRoutes.js";
import { supportOperationsRoutes } from "./routes/supportOperationsRoutes.js";
import { supportControlTowerRoutes } from "./routes/supportControlTowerRoutes.js";
import { startSupportAutomationScheduler } from "./services/supportAutomationScheduler.js";
import {
  beginSuperAdminSetup,
  clearLoginFailures,
  clearSuperAdminFailureState,
  clientAddress,
  completeSuperAdminSetup,
  ensureSuperAdminSecurity,
  getSuperAdminSecurity,
  isLoginThrottled,
  issueSetupToken,
  issueStepUpToken,
  logSuperAdminAuditEvent,
  recordLoginFailure,
  recordSuperAdminFailure,
  requireSecuritySecrets,
  revokeAllSuperAdminSessions,
  throttleKeys,
  verifyStepUpToken,
  verifySuperAdminMfa,
} from "./services/superAdminSecurityService.js";

function isProduction(config: ReturnType<typeof loadConfig>): boolean {
  return config.NODE_ENV === "production" ||
    config.NODE_ENV === "production-certification" ||
    process.env.K_SERVICE != null;
}

const REFRESH_COOKIE = "kwakopos_refresh";
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

type LoginRequestBody = { email?: unknown; password?: unknown; deviceId?: unknown; mfaCode?: unknown; rememberMe?: unknown };
type RefreshRequestBody = { sessionId?: unknown; refreshToken?: unknown };
type LogoutRequestBody = { sessionId?: unknown; reason?: unknown };
type SuperAdminSetupBody = { setupToken?: unknown; newPassword?: unknown; totpSecret?: unknown; totpCode?: unknown };
type SuperAdminSetupStartBody = { setupToken?: unknown };
type StepUpRequestBody = { password?: unknown; mfaCode?: unknown; action?: unknown; deviceId?: unknown };

function configurePersistentSessions() {
  globalSessionManager.setStoreProvider({
    create: async (record) => { await prisma.deviceSession.create({ data: record as any }); },
    get: async (sessionId) => await prisma.deviceSession.findUnique({ where: { id: sessionId } }) as any,
    update: async (record) => {
      await prisma.deviceSession.update({
        where: { id: record.id },
        data: {
          refreshTokenHash: record.refreshTokenHash,
          expiresAt: record.expiresAt,
          refreshTokenExpiresAt: record.refreshTokenExpiresAt,
          lastActivityAt: record.lastActivityAt,
          lastValidatedAt: record.lastValidatedAt,
          revokedAt: record.revokedAt,
          revokeReason: record.revokeReason || null,
          status: record.status,
          permissionsVersion: record.permissionsVersion,
          tenantVersion: record.tenantVersion,
          ipAddress: record.ipAddress || null,
          userAgent: record.userAgent || null,
          platform: record.platform || null,
          rememberMe: Boolean(record.rememberMe),
          offlineStartedAt: record.offlineStartedAt || null,
          offlineExpiresAt: record.offlineExpiresAt || null,
          idleTimeoutMs: record.idleTimeoutMs,
        },
      });
    },
    revokeAllForUser: async (tenantId, userId, reason = "PASSWORD_CHANGE") =>
      (await prisma.deviceSession.updateMany({
        where: { tenantId, userId, revokedAt: null },
        data: { revokedAt: new Date(), status: "REVOKED", revokeReason: reason },
      })).count,
    listForUser: async (tenantId, userId) => await prisma.deviceSession.findMany({
      where: { tenantId, userId },
      orderBy: { lastActivityAt: "desc" },
    }) as any,
    revokeTokenFamily: async (tokenFamilyId, reason, at = new Date()) =>
      (await prisma.deviceSession.updateMany({
        where: { tokenFamilyId, revokedAt: null },
        data: { revokedAt: at, status: "REVOKED", revokeReason: reason },
      })).count,
    atomicRotateRefreshToken: async (sessionId, expectedRefreshTokenHash, replacementRefreshTokenHash, now) =>
      prisma.$transaction(async (tx) => {
        const before = await tx.deviceSession.findUnique({ where: { id: sessionId } });
        if (!before) return { rotated: false, reused: false, session: null };
        const updated = await tx.deviceSession.updateMany({
          where: {
            id: sessionId,
            refreshTokenHash: expectedRefreshTokenHash,
            revokedAt: null,
            status: "ACTIVE",
            refreshTokenExpiresAt: { gt: now },
            expiresAt: { gt: now },
          },
          data: { refreshTokenHash: replacementRefreshTokenHash, lastValidatedAt: now },
        });
        if (updated.count !== 1) {
          const after = await tx.deviceSession.findUnique({ where: { id: sessionId } });
          const reused = Boolean(after && after.revokedAt == null && after.status === "ACTIVE" && after.refreshTokenHash !== expectedRefreshTokenHash);
          return { rotated: false, reused, session: after as any };
        }
        const session = await tx.deviceSession.findUnique({ where: { id: sessionId } });
        return { rotated: true, reused: false, session: session as any };
      }),
  });
}

async function recordSessionAudit(params: {
  tenantId: string;
  branchId: string;
  userId: string;
  deviceId: string;
  sessionId: string;
  action: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        tenantId: params.tenantId,
        branchId: params.branchId,
        userId: params.userId,
        deviceId: params.deviceId,
        action: params.action,
        entityType: "DeviceSession",
        entityId: params.sessionId,
        metadata: { ip: params.ipAddress || null, userAgent: params.userAgent || null, ...(params.metadata || {}) },
      },
    });
  } catch {
    // Authentication must not fail solely because audit persistence is unavailable.
  }
}

function requestUserAgent(req: FastifyRequest): string {
  return String(req.headers["user-agent"] || "").slice(0, 2048);
}

function requestPlatform(req: FastifyRequest): string {
  return String(req.headers["sec-ch-ua-platform"] || req.headers["user-agent"] || "unknown").slice(0, 256);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.substring(0, index).trim()] = decodeURIComponent(part.substring(index + 1).trim());
  }
  return result;
}

function setRefreshCookie(reply: FastifyReply, token: string, secure: boolean, maxAgeSeconds = DEFAULT_COOKIE_MAX_AGE_SECONDS): void {
  const cookie = REFRESH_COOKIE + "=" + encodeURIComponent(token) + "; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=" + Math.max(0, Math.floor(maxAgeSeconds)) + (secure ? "; Secure" : "");
  reply.header("Set-Cookie", cookie);
}

function clearRefreshCookie(reply: FastifyReply, secure: boolean): void {
  reply.header("Set-Cookie", `${REFRESH_COOKIE}=; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`);
}

async function handleProductionLogin(req: FastifyRequest, reply: FastifyReply) {
  const body = (req.body || {}) as LoginRequestBody;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const deviceId = String(body.deviceId || "device-client").trim();
  const mfaCode = String(body.mfaCode || "").trim();
  const rememberMe = Boolean(body.rememberMe);
  const config = loadConfig();
  const ip = clientAddress(req);
  if (!email || !password) {
    reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "email and password are required" } });
    return;
  }

  const keys = throttleKeys(email, ip, deviceId);
  if (await isLoginThrottled(keys)) {
    reply.status(429).send({ success: false, error: { code: "LOGIN_THROTTLED", message: "Too many authentication attempts. Try again later." } });
    return;
  }

  let user = (await prisma.user.findMany({ where: { email, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true }, take: 1 }))[0];
  if (!user && !isProduction(config)) {
    // In dev / non-prod mode, auto-provision user in Prisma so that subsequent logins permanently persist
    try {
      const baseSlug = (email.split("@")[0] || "tenant").toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 32);
      let tenant = await prisma.tenant.findFirst({
        where: { OR: [{ slug: baseSlug }, { name: `${email.split("@")[0]} Organization` }] },
        include: { branches: true },
      });
      if (!tenant) {
        const { randomUUID } = await import("crypto");
        const newTenantId = randomUUID();
        const newBranchId = randomUUID();
        tenant = await prisma.tenant.create({
          data: {
            id: newTenantId,
            name: `${email.split("@")[0]} Organization`,
            slug: baseSlug + "-" + newTenantId.slice(0, 6),
            status: "ACTIVE",
            branches: {
              create: {
                id: newBranchId,
                name: "Main Branch",
                code: "MAIN-" + newTenantId.slice(0, 6).toUpperCase(),
                isMain: true,
              },
            },
          },
          include: { branches: true },
        });
      }
      const branchId = tenant.branches[0]?.id;
      let role = await prisma.role.findFirst({ where: { tenantId: tenant.id, name: "ADMIN" } });
      if (!role) {
        role = await prisma.role.create({
          data: { tenantId: tenant.id, name: "ADMIN", permissions: ["*"] },
        });
      }
      const passwordHash = await hashPassword(password);
      const { randomUUID } = await import("crypto");
      await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          name: email.split("@")[0] || "Admin User",
          passwordHash,
          tenantId: tenant.id,
          branchId,
          roleId: role.id,
          status: "ACTIVE",
        },
      });
      user = (await prisma.user.findMany({ where: { email, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true }, take: 1 }))[0];
    } catch {
      // ignore auto-provision failure, will fall through to standard 401
    }
  }

  const passwordValid = !!user && await comparePassword(password, user.passwordHash);
  if (!passwordValid) {
    await recordLoginFailure(keys);
    if (user) {
      const roleName = String(user.role?.name || "").toUpperCase();
      if (roleName === "SUPER_ADMIN" || roleName === "PLATFORM_SUPER_ADMIN") {
        await ensureSuperAdminSecurity(user.id);
        await recordSuperAdminFailure(user.id);
        await logSuperAdminAuditEvent({ userId: user.id, deviceId, action: "SUPER_ADMIN_LOGIN_FAILURE", outcome: "FAILURE", metadata: { ip, reason: "INVALID_PASSWORD" } });
      }
    }
    reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
    return;
  }

  const roleName = String(user.role?.name || "ADMIN").toUpperCase();
  const superAdminState = await getSuperAdminSecurity(user.id);
  const isSuperAdmin = roleName === "SUPER_ADMIN" || roleName === "PLATFORM_SUPER_ADMIN" || !!superAdminState;
  if (isSuperAdmin) {
    await ensureSuperAdminSecurity(user.id);
    const state = await getSuperAdminSecurity(user.id);
    if (!state) {
      reply.status(500).send({ success: false, error: { code: "SECURITY_CONFIGURATION_ERROR", message: "Super Admin security state unavailable" } });
      return;
    }
    if (state.lockedUntil && state.lockedUntil > new Date()) {
      await logSuperAdminAuditEvent({ userId: user.id, deviceId, action: "SUPER_ADMIN_LOCKED_ACCESS_ATTEMPT", outcome: "DENIED", metadata: { ip } });
      reply.status(429).send({ success: false, error: { code: "SUPER_ADMIN_LOCKED", message: "Super Admin access is temporarily locked." } });
      return;
    }
    if (state.mustChangePassword || !state.mfaEnrolled) {
      reply.status(428).send({ success: false, error: { code: "SUPER_ADMIN_SETUP_REQUIRED", message: "Super Admin security setup is required before a normal session can be issued." }, data: { setupToken: issueSetupToken(user.id), passwordChangeRequired: state.mustChangePassword, mfaRequired: state.mfaRequired, mfaEnrolled: state.mfaEnrolled } });
      return;
    }
    if (!(await verifySuperAdminMfa(user.id, mfaCode))) {
      await recordLoginFailure(keys);
      await recordSuperAdminFailure(user.id);
      await logSuperAdminAuditEvent({ userId: user.id, deviceId, action: "SUPER_ADMIN_MFA_FAILURE", outcome: "FAILURE", metadata: { ip } });
      reply.status(401).send({ success: false, error: { code: "MFA_REQUIRED", message: "Valid Super Admin MFA code is required." } });
      return;
    }
  }

  await clearLoginFailures(keys);
  if (user && passwordNeedsRehash(user.passwordHash)) {
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
  }
  if (isSuperAdmin) {
    await clearSuperAdminFailureState(user.id);
    await logSuperAdminAuditEvent({ userId: user.id, deviceId, action: "SUPER_ADMIN_LOGIN_SUCCESS", outcome: "SUCCESS", metadata: { ip } });
  }

  const roles = [String(user.role?.name || "ADMIN")];
  const permissions = Array.isArray(user.role?.permissions) ? user.role.permissions.map((value) => String(value)) : [];
  const effectiveSettings = await globalSettingsService.getEffectiveSettings({
    tenantId: user.tenantId,
    branchId: user.branchId,
    userId: user.id,
    roles,
    permissions,
  } as any);
  const policy = sessionPolicyFromSettings((effectiveSettings["security.config"]?.value || {}) as Record<string, unknown>);
  const now = new Date();
  const permissionsVersion = Math.floor(new Date(user.role?.updatedAt || now).getTime() / 1000);
  const tenantRecord = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  const tenantVersion = Math.floor(new Date(tenantRecord?.updatedAt || now).getTime() / 1000);

  const activeSessions = await prisma.deviceSession.findMany({
    where: { tenantId: user.tenantId, userId: user.id, revokedAt: null, status: "ACTIVE", expiresAt: { gt: now } },
    orderBy: { lastActivityAt: "asc" },
  });
  if (!policy.allowMultipleDevices || policy.singleDeviceLogin) {
    await prisma.deviceSession.updateMany({
      where: { tenantId: user.tenantId, userId: user.id, deviceId: { not: deviceId }, revokedAt: null },
      data: { revokedAt: now, status: "REVOKED", revokeReason: "SINGLE_DEVICE_LOGIN" },
    });
  }
  const eligibleForLimit = activeSessions.filter((s) => !(s.deviceId !== deviceId && (!policy.allowMultipleDevices || policy.singleDeviceLogin)));
  if (eligibleForLimit.length >= policy.maxConcurrentSessions) {
    const toRevoke = eligibleForLimit.slice(0, eligibleForLimit.length - policy.maxConcurrentSessions + 1);
    if (toRevoke.length) {
      await prisma.deviceSession.updateMany({
        where: { id: { in: toRevoke.map((s) => s.id) } },
        data: { revokedAt: now, status: "REVOKED", revokeReason: "CONCURRENT_SESSION_LIMIT" },
      });
    }
  }

  const existingDevice = await prisma.device.findUnique({ where: { deviceId } });
  if (existingDevice && (existingDevice.tenantId !== user.tenantId || existingDevice.userId !== user.id)) {
    reply.status(409).send({ success: false, error: { code: "DEVICE_ID_CONFLICT", message: "This device identity is already associated with another account." } });
    return;
  }
  await prisma.device.upsert({
    where: { deviceId },
    create: { id: randomUUID(), deviceId, tenantId: user.tenantId, userId: user.id, platform: requestPlatform(req), browser: requestUserAgent(req), lastSeenAt: now, status: "ACTIVE" },
    update: { platform: requestPlatform(req), browser: requestUserAgent(req), lastSeenAt: now, status: "ACTIVE", revokedAt: null, revokeReason: null },
  });

  const session = await globalSessionManager.createSession({
    tenantId: user.tenantId,
    userId: user.id,
    branchId: user.branchId,
    deviceId,
    permissionsVersion,
    tenantVersion,
    ipAddress: ip,
    userAgent: requestUserAgent(req),
    platform: requestPlatform(req),
    rememberMe,
    idleTimeoutMs: policy.idleTimeoutMs,
    absoluteLifetimeMs: policy.absoluteTimeoutMs,
    refreshTokenLifetimeMs: rememberMe ? policy.rememberMeDurationMs : policy.refreshTokenDurationMs,
  });
  const payload = { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, roles, permissions, deviceId, sessionId: session.sessionId, permissionsVersion, tenantVersion };
  const accessToken = generateAccessToken(payload);
  setRefreshCookie(reply, session.refreshToken, true, (session.refreshTokenExpiresAt.getTime() - now.getTime()) / 1000);
  await recordSessionAudit({
    tenantId: user.tenantId,
    branchId: user.branchId,
    userId: user.id,
    deviceId,
    sessionId: session.sessionId,
    action: "SESSION_STARTED",
    ipAddress: ip,
    userAgent: requestUserAgent(req),
    metadata: { rememberMe, policy: sessionPolicyToMinutes(policy) },
  });
  reply.send({ success: true, data: {
    accessToken,
    sessionId: session.sessionId,
    user: { id: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, name: user.name, role: roles[0] },
    session: { status: "AUTHENTICATED_ONLINE", expiresAt: session.expiresAt.toISOString(), refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(), policy: sessionPolicyToMinutes(policy) },
  } });
}

export function buildFixedServer(opts: { config?: ReturnType<typeof loadConfig>; productionPersistence?: boolean } = {}) {
  const config = opts.config ?? loadConfig();
  const productionPersistence = isProduction(config)
    ? true
    : (opts.productionPersistence ?? (process.env.KWAKOPOS_MOCK_AUTH === "true" ? false : true));
  if (isProduction(config) && process.env.KWAKOPOS_MOCK_AUTH === "true") {
    throw new Error("PERSISTENCE_FATAL: Production authentication cannot run with KWAKOPOS_MOCK_AUTH=true.");
  }
  if (productionPersistence) {
    configurePersistentSessions();
    requireSecuritySecrets();
  }

  const server = buildServer({ config, productionPersistence });
  supportOperationsRoutes(server);
  supportControlTowerRoutes(server);

  server.post("/auth/super-admin/setup/start", async (req, reply) => {
    const body = (req.body || {}) as SuperAdminSetupStartBody;
    try {
      const data = await beginSuperAdminSetup(String(body.setupToken || ""));
      return reply.send({ success: true, data });
    } catch {
      return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired Super Admin setup token" } });
    }
  });

  server.post("/auth/super-admin/setup/complete", async (req, reply) => {
    const body = (req.body || {}) as SuperAdminSetupBody;
    const setupToken = String(body.setupToken || "");
    const newPassword = String(body.newPassword || "");
    const totpSecret = String(body.totpSecret || "").toUpperCase().replace(/\s+/g, "");
    const totpCode = String(body.totpCode || "");
    if (!setupToken || !newPassword || !totpSecret || !totpCode) {
      return reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "setupToken, newPassword, totpSecret and totpCode are required" } });
    }
    try {
      await completeSuperAdminSetup(setupToken, newPassword, totpSecret, totpCode);
      return reply.send({ success: true, data: { completed: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to complete Super Admin setup";
      return reply.status(400).send({ success: false, error: { code: "SETUP_FAILED", message } });
    }
  });

  let supportScheduler: { stop: () => void } | undefined;
  if (productionPersistence && process.env.KWAKOPOS_DISABLE_SUPPORT_AUTOMATION !== "true") supportScheduler = startSupportAutomationScheduler();
  server.addHook("onClose", async () => { supportScheduler?.stop(); });

  server.addHook("preValidation", async (req, reply) => {
    if (!productionPersistence) return;
    const routePath = req.url.split("?")[0];

    if (routePath === "/auth/login" && req.method === "POST") {
      await handleProductionLogin(req, reply);
      return;
    }

    if (routePath === "/auth/super-admin/setup/start" && req.method === "POST") {
      const body = (req.body || {}) as SuperAdminSetupStartBody;
      try {
        const data = await beginSuperAdminSetup(String(body.setupToken || ""));
        reply.send({ success: true, data });
      } catch {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired Super Admin setup token" } });
      }
      return;
    }

    if (routePath === "/auth/super-admin/setup/complete" && req.method === "POST") {
      const body = (req.body || {}) as SuperAdminSetupBody;
      const setupToken = String(body.setupToken || "");
      const newPassword = String(body.newPassword || "");
      const totpSecret = String(body.totpSecret || "").toUpperCase().replace(/\s+/g, "");
      const totpCode = String(body.totpCode || "");
      if (!setupToken || !newPassword || !totpSecret || !totpCode) {
        reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "setupToken, newPassword, totpSecret and totpCode are required" } });
        return;
      }
      try {
        await completeSuperAdminSetup(setupToken, newPassword, totpSecret, totpCode);
        reply.send({ success: true, data: { completed: true } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to complete Super Admin setup";
        reply.status(400).send({ success: false, error: { code: "SETUP_FAILED", message } });
      }
      return;
    }

    if (routePath === "/auth/super-admin/step-up" && req.method === "POST") {
      const body = (req.body || {}) as StepUpRequestBody;
      const password = String(body.password || "");
      const mfaCode = String(body.mfaCode || "");
      const action = String(body.action || "DESTRUCTIVE_OPERATION");
      const deviceId = String(body.deviceId || "system");
      
      const authHeader = String(req.headers.authorization || "");
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Bearer token required for step-up authentication" } });
        return;
      }

      try {
        const ctx = verifyAccessToken(token);
        const userId = (ctx as any).userId || ctx.sub;
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !(await comparePassword(password, user.passwordHash))) {
          await logSuperAdminAuditEvent({ userId, deviceId, action: "STEP_UP_AUTH_FAILURE", outcome: "FAILURE", metadata: { targetAction: action } });
          reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid credentials for step-up authentication" } });
          return;
        }

        const mfaValid = await verifySuperAdminMfa(userId, mfaCode);
        if (!mfaValid) {
          await logSuperAdminAuditEvent({ userId, deviceId, action: "STEP_UP_MFA_FAILURE", outcome: "FAILURE", metadata: { targetAction: action } });
          reply.status(401).send({ success: false, error: { code: "MFA_REQUIRED", message: "Valid MFA code required for step-up authentication" } });
          return;
        }

        const stepUpToken = issueStepUpToken(userId, action);
        await logSuperAdminAuditEvent({ userId, deviceId, action: "STEP_UP_AUTH_SUCCESS", outcome: "SUCCESS", metadata: { targetAction: action } });
        reply.send({ success: true, data: { stepUpToken, expiresAt: new Date(Date.now() + 300 * 1000).toISOString() } });
      } catch {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid access token" } });
      }
      return;
    }

    if (routePath === "/auth/super-admin/revoke-sessions" && req.method === "POST") {
      const authHeader = String(req.headers.authorization || "");
      const token = authHeader.replace(/^Bearer\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const userId = (ctx as any).userId || ctx.sub;
        const count = await revokeAllSuperAdminSessions(userId);
        await logSuperAdminAuditEvent({ userId, action: "SESSIONS_REVOKED", outcome: "SUCCESS", metadata: { revokedCount: count } });
        reply.send({ success: true, data: { revokedCount: count } });
      } catch {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid access token" } });
      }
      return;
    }

    if (routePath === "/auth/session/event" && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const event = String((req.body as any)?.event || "").toUpperCase();
        const allowed = new Set(["SESSION_WARNING_SHOWN", "SESSION_RESTORED", "SESSION_REFRESHED", "SESSION_LOGOUT", "SESSION_TIMEOUT", "SESSION_REVOKED"]);
        if (!allowed.has(event)) return reply.status(400).send({ success: false, error: { code: "INVALID_SESSION_EVENT", message: "Unsupported session event." } });
        if (!ctx.sessionId) return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Session required." } });
        const validation = await globalSessionManager.validateSession(ctx.sessionId, {
          tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.sub, deviceId: ctx.deviceId, activity: false,
        });
        if (!validation.valid || !validation.session) return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Session is not valid." } });
        await recordSessionAudit({
          tenantId: ctx.tenantId,
          branchId: ctx.branchId,
          userId: ctx.sub,
          deviceId: ctx.deviceId,
          sessionId: ctx.sessionId,
          action: event,
          ipAddress: clientAddress(req),
          userAgent: requestUserAgent(req),
          metadata: (req.body as any)?.metadata || undefined,
        });
        return reply.send({ success: true });
      } catch {
        return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
      }
    }

    if (routePath === "/auth/session" || routePath === "/auth/session/validate" || routePath === "/auth/session/heartbeat") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const sessionId = String(ctx.sessionId || "");
        if (!sessionId) throw new Error("UNAUTHORIZED");
        const validation = await globalSessionManager.validateSession(sessionId, {
          tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.sub, deviceId: ctx.deviceId,
          activity: routePath.endsWith("heartbeat"),
        });
        if (!validation.valid || !validation.session) {
          const code = validation.code === "SESSION_EXPIRED" ? "SESSION_EXPIRED" : validation.code === "SESSION_REVOKED" ? "SESSION_REVOKED" : "AUTH_REQUIRED";
          clearRefreshCookie(reply, true);
          return reply.status(401).send({ success: false, error: { code, message: code === "SESSION_EXPIRED" ? "Session expired." : "Authentication required." } });
        }
        const user = await prisma.user.findFirst({ where: { id: ctx.sub, tenantId: ctx.tenantId, branchId: ctx.branchId, status: "ACTIVE" }, include: { role: true, tenant: true } });
        if (!user) return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
        const effective = await globalSettingsService.getEffectiveSettings({ tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.sub, roles: ctx.roles, permissions: ctx.permissions } as any);
        const policy = sessionPolicyFromSettings((effective["security.config"]?.value || {}) as Record<string, unknown>);
        const idleRemainingMs = Math.max(0, validation.session.lastActivityAt.getTime() + policy.idleTimeoutMs - Date.now());
        if (idleRemainingMs <= 0) {
          await globalSessionManager.revokeSession(sessionId, "SESSION_TIMEOUT");
          await recordSessionAudit({ tenantId: ctx.tenantId, branchId: ctx.branchId, userId: ctx.sub, deviceId: ctx.deviceId, sessionId, action: "SESSION_TIMEOUT", ipAddress: clientAddress(req), userAgent: requestUserAgent(req) });
          clearRefreshCookie(reply, true);
          return reply.status(401).send({ success: false, error: { code: "SESSION_EXPIRED", message: "Session expired due to inactivity." } });
        }
        await prisma.device.updateMany({ where: { deviceId: ctx.deviceId, tenantId: ctx.tenantId, userId: ctx.sub }, data: { lastSeenAt: new Date(), status: "ACTIVE" } });
        return reply.send({ success: true, data: {
          status: validation.session.status,
          sessionId,
          deviceId: ctx.deviceId,
          serverTime: new Date().toISOString(),
          lastActivityAt: validation.session.lastActivityAt.toISOString(),
          expiresAt: validation.session.expiresAt.toISOString(),
          refreshTokenExpiresAt: validation.session.refreshTokenExpiresAt.toISOString(),
          permissionsVersion: Math.floor(new Date(user.role?.updatedAt || new Date()).getTime() / 1000),
          tenantVersion: Math.floor(new Date(user.tenant?.updatedAt || new Date()).getTime() / 1000),
          policy: sessionPolicyToMinutes(policy),
          idleRemainingMs,
        } });
      } catch {
        return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } });
      }
    }

    if (routePath === "/auth/sessions" && req.method === "GET") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const rows = await prisma.deviceSession.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.sub }, orderBy: { lastActivityAt: "desc" }, select: { id: true, deviceId: true, branchId: true, createdAt: true, lastActivityAt: true, lastValidatedAt: true, expiresAt: true, refreshTokenExpiresAt: true, revokedAt: true, revokeReason: true, status: true, rememberMe: true, ipAddress: true, userAgent: true, platform: true } });
        return reply.send({ success: true, data: rows });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath.startsWith("/auth/sessions/") && routePath.endsWith("/revoke") && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      const sessionId = routePath.split("/")[3];
      try {
        const ctx = verifyAccessToken(token);
        const target = await prisma.deviceSession.findUnique({ where: { id: sessionId } });
        if (!target || target.tenantId !== ctx.tenantId || target.userId !== ctx.sub) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Session not found." } });
        await globalSessionManager.revokeSession(sessionId, "DEVICE_SESSION_REVOKED");
        await recordSessionAudit({ tenantId: target.tenantId, branchId: target.branchId, userId: target.userId, deviceId: target.deviceId, sessionId, action: "SESSION_REVOKED", ipAddress: clientAddress(req), userAgent: requestUserAgent(req) });
        return reply.send({ success: true, data: { revoked: true, sessionId } });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath === "/auth/sessions/revoke-all" && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const count = await globalSessionManager.revokeAllUserSessions(ctx.tenantId, ctx.sub, "REVOKE_ALL");
        return reply.send({ success: true, data: { revokedCount: count } });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath === "/auth/device/register" && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const now = new Date();
        const existing = await prisma.device.findUnique({ where: { deviceId: ctx.deviceId } });
        if (existing && (existing.tenantId !== ctx.tenantId || existing.userId !== ctx.sub)) return reply.status(409).send({ success: false, error: { code: "DEVICE_ID_CONFLICT", message: "Device identity conflict." } });
        const device = await prisma.device.upsert({
          where: { deviceId: ctx.deviceId },
          create: { id: randomUUID(), deviceId: ctx.deviceId, tenantId: ctx.tenantId, userId: ctx.sub, platform: requestPlatform(req), browser: requestUserAgent(req), lastSeenAt: now, status: "ACTIVE" },
          update: { platform: requestPlatform(req), browser: requestUserAgent(req), lastSeenAt: now, status: "ACTIVE", revokedAt: null, revokeReason: null },
        });
        return reply.send({ success: true, data: device });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath === "/auth/devices" && req.method === "GET") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      try {
        const ctx = verifyAccessToken(token);
        const devices = await prisma.device.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.sub }, orderBy: { lastSeenAt: "desc" } });
        return reply.send({ success: true, data: devices });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath.startsWith("/auth/devices/") && routePath.endsWith("/revoke") && req.method === "POST") {
      const token = String(req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
      const deviceId = routePath.split("/")[3];
      try {
        const ctx = verifyAccessToken(token);
        const device = await prisma.device.findUnique({ where: { deviceId } });
        if (!device || device.tenantId !== ctx.tenantId || device.userId !== ctx.sub) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND", message: "Device not found." } });
        const at = new Date();
        await prisma.device.update({ where: { deviceId }, data: { revokedAt: at, status: "REVOKED", revokeReason: "DEVICE_REVOKED" } });
        await prisma.deviceSession.updateMany({ where: { tenantId: ctx.tenantId, userId: ctx.sub, deviceId, revokedAt: null }, data: { revokedAt: at, status: "REVOKED", revokeReason: "DEVICE_REVOKED" } });
        return reply.send({ success: true, data: { revoked: true, deviceId } });
      } catch { return reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); }
    }

    if (routePath === "/auth/refresh" && req.method === "POST") {
      const body = (req.body || {}) as RefreshRequestBody;
      const sessionId = String(body.sessionId || "");
      const refreshToken = parseCookies(req.headers?.cookie)[REFRESH_COOKIE] || "";
      if (!sessionId || !refreshToken) return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Refresh token required." } });

      const session = await prisma.deviceSession.findUnique({ where: { id: sessionId } });
      if (!session || session.revokedAt || session.status !== "ACTIVE" || session.expiresAt <= new Date() || session.refreshTokenExpiresAt <= new Date()) {
        clearRefreshCookie(reply, true);
        return reply.status(401).send({ success: false, error: { code: session?.revokedAt ? "SESSION_REVOKED" : "SESSION_EXPIRED", message: "Invalid or expired session." } });
      }
      const user = await prisma.user.findFirst({ where: { id: session.userId, tenantId: session.tenantId, branchId: session.branchId, status: "ACTIVE" }, include: { role: true } });
      if (!user) {
        clearRefreshCookie(reply, true);
        return reply.status(401).send({ success: false, error: { code: "AUTH_REQUIRED", message: "Authentication required." } });
      }
      const rotated = await globalSessionManager.rotateRefreshToken(sessionId, refreshToken, {
        sub: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email,
        roles: [String(user.role?.name || "ADMIN")],
        permissions: Array.isArray(user.role?.permissions) ? user.role.permissions.map((v) => String(v)) : [],
      });
      if (!rotated) {
        clearRefreshCookie(reply, true);
        return reply.status(401).send({ success: false, error: { code: "TOKEN_INVALID", message: "Invalid or reused refresh token." } });
      }
      const updated = await prisma.deviceSession.findUnique({ where: { id: sessionId } });
      const maxAge = updated ? (updated.refreshTokenExpiresAt.getTime() - Date.now()) / 1000 : DEFAULT_COOKIE_MAX_AGE_SECONDS;
      setRefreshCookie(reply, rotated.refreshToken, true, maxAge);
      await recordSessionAudit({ tenantId: user.tenantId, branchId: user.branchId, userId: user.id, deviceId: session.deviceId, sessionId, action: "SESSION_REFRESHED", ipAddress: clientAddress(req), userAgent: requestUserAgent(req) });
      return reply.send({ success: true, data: { accessToken: rotated.accessToken, sessionId } });
    }

    if (routePath === "/auth/logout" && req.method === "POST") {
      const body = (req.body || {}) as LogoutRequestBody;
      const sessionId = String(body.sessionId || "");
      const reason = String(body.reason || "USER_LOGOUT").toUpperCase();
      if (sessionId) {
        const target = await prisma.deviceSession.findUnique({ where: { id: sessionId } });
        if (target) {
          const revokeReason = reason === "SESSION_TIMEOUT" ? "SESSION_TIMEOUT" : "USER_LOGOUT";
          await globalSessionManager.revokeSession(sessionId, revokeReason);
          await recordSessionAudit({ tenantId: target.tenantId, branchId: target.branchId, userId: target.userId, deviceId: target.deviceId, sessionId, action: reason === "SESSION_TIMEOUT" ? "SESSION_TIMEOUT" : "SESSION_LOGOUT", ipAddress: clientAddress(req), userAgent: requestUserAgent(req), metadata: { reason } });
        }
      }
      clearRefreshCookie(reply, true);
      reply.send({ success: true, data: { loggedOut: true, reason } });
    }
  });
  return server;
}

export async function startFixedServer(): Promise<FastifyInstance> {
  const config = loadConfig();
  const server = buildFixedServer({ config });
  const port = Number(process.env.PORT || config.PORT || 3000);
  const host = process.env.HOST || config.HOST || "0.0.0.0";

  let attempts = 0;
  while (true) {
    try {
      await server.listen({ port, host });
      break;
    } catch (err: any) {
      if (err?.code === "EADDRINUSE" && attempts < 5) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw err;
    }
  }

  const shutdown = async () => {
    try {
      await server.close();
    } catch {}
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  console.log(`KwakoPos 2.0 API listening on ${host}:${port}`);
  return server;
}

const isMainModule = () => {
  if (typeof require !== "undefined" && require.main === module) return true;
  if (process.argv[1]) {
    const p = process.argv[1].replace(/\\/g, "/");
    if (p.endsWith("serverFixed.ts") || p.endsWith("serverFixed.js")) return true;
  }
  return false;
};

if (isMainModule()) {
  void startFixedServer().catch((err) => {
    console.error("FAILED_TO_START_API_SERVER:", err);
    process.exit(1);
  });
}


