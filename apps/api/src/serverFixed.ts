import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadConfig } from "@kwakopos2/config";
import { prisma } from "@kwakopos2/database";
import { comparePassword, generateAccessToken, globalSessionManager, hashPassword, passwordNeedsRehash, verifyAccessToken } from "@kwakopos2/auth";
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
  return config.NODE_ENV === "production" || config.NODE_ENV === "production-certification";
}

const REFRESH_COOKIE = "kwakopos_refresh";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type LoginRequestBody = { email?: unknown; password?: unknown; deviceId?: unknown; mfaCode?: unknown };
type RefreshRequestBody = { sessionId?: unknown };
type LogoutRequestBody = { sessionId?: unknown };
type SuperAdminSetupBody = { setupToken?: unknown; newPassword?: unknown; totpSecret?: unknown; totpCode?: unknown };
type SuperAdminSetupStartBody = { setupToken?: unknown };
type StepUpRequestBody = { password?: unknown; mfaCode?: unknown; action?: unknown; deviceId?: unknown };

function configurePersistentSessions() {
  globalSessionManager.setStoreProvider({
    create: async (record) => { await prisma.deviceSession.create({ data: record as any }); },
    get: async (sessionId) => await prisma.deviceSession.findUnique({ where: { id: sessionId } }) as any,
    update: async (record) => { await prisma.deviceSession.update({ where: { id: record.id }, data: { refreshTokenHash: record.refreshTokenHash, expiresAt: record.expiresAt, revokedAt: record.revokedAt } }); },
    revokeAllForUser: async (tenantId, userId) => (await prisma.deviceSession.updateMany({ where: { tenantId, userId, revokedAt: null }, data: { revokedAt: new Date() } })).count,
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) result[part.substring(0, index).trim()] = decodeURIComponent(part.substring(index + 1).trim());
  }
  return result;
}

function setRefreshCookie(reply: FastifyReply, token: string, secure: boolean): void {
  reply.header("Set-Cookie", `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`);
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

  const user = (await prisma.user.findMany({ where: { email, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true }, take: 1 }))[0];
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
  const session = await globalSessionManager.createSession(user.tenantId, user.id, deviceId);
  const payload = { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, roles, permissions, deviceId, sessionId: session.sessionId };
  const accessToken = generateAccessToken(payload);
  setRefreshCookie(reply, session.refreshToken, true);
  reply.send({ success: true, data: { accessToken, sessionId: session.sessionId, user: { id: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, name: user.name, role: roles[0] } } });
}

export function buildFixedServer(opts: { config?: ReturnType<typeof loadConfig>; productionPersistence?: boolean } = {}) {
  const config = opts.config ?? loadConfig();
  const productionPersistence = opts.productionPersistence ?? (process.env.KWAKOPOS_MOCK_AUTH === "true" ? false : true);
  if (productionPersistence) {
    configurePersistentSessions();
    requireSecuritySecrets();
  }

  const server = buildServer({ config, productionPersistence });
  supportOperationsRoutes(server);
  supportControlTowerRoutes(server);

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

    if (routePath === "/auth/refresh" && req.method === "POST") {
      const body = (req.body || {}) as RefreshRequestBody & { refreshToken?: string };
      const sessionId = String(body.sessionId || "");
      const refreshToken = body.refreshToken || parseCookies(req.headers?.cookie)[REFRESH_COOKIE] || "";
      if (!sessionId || !refreshToken) {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } });
        return;
      }

      const session = await prisma.deviceSession.findUnique({ where: { id: sessionId }, include: { user: { include: { role: true } } } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
        clearRefreshCookie(reply, true);
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } });
        return;
      }

      const rotated = await globalSessionManager.rotateRefreshToken(sessionId, refreshToken, {
        sub: session.user.id,
        tenantId: session.user.tenantId,
        branchId: session.user.branchId,
        email: session.user.email,
        roles: [String(session.user.role?.name || "ADMIN")],
        permissions: Array.isArray(session.user.role?.permissions) ? session.user.role.permissions.map((v) => String(v)) : [],
      });
      if (!rotated) {
        clearRefreshCookie(reply, true);
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or revoked refresh token" } });
        return;
      }
      setRefreshCookie(reply, rotated.refreshToken, true);
      reply.send({ success: true, data: { accessToken: rotated.accessToken } });
      return;
    }

    if (routePath === "/auth/logout" && req.method === "POST") {
      const body = (req.body || {}) as LogoutRequestBody;
      const sessionId = String(body.sessionId || "");
      if (sessionId) await globalSessionManager.revokeSession(sessionId);
      clearRefreshCookie(reply, true);
      reply.send({ success: true });
    }
  });
  return server;
}

export async function startFixedServer(): Promise<FastifyInstance> {
  const config = loadConfig();
  const server = buildFixedServer({ config });
  const port = Number(process.env.PORT || config.PORT || 3000);
  const host = process.env.HOST || config.HOST || "0.0.0.0";
  await server.listen({ port, host });
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


