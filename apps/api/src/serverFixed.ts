import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { loadConfig } from "@kwakopos2/config";
import { prisma } from "@kwakopos2/database";
import { comparePassword, generateAccessToken, globalSessionManager } from "@kwakopos2/auth";
import { buildServer } from "./server.js";
import { tenantOnboardingRoutes } from "./routes/tenantOnboardingRoutes.js";
import { supportOperationsRoutes } from "./routes/supportOperationsRoutes.js";
import { supportControlTowerRoutes } from "./routes/supportControlTowerRoutes.js";
import { startSupportAutomationScheduler } from "./services/supportAutomationScheduler.js";

function isProduction(config: ReturnType<typeof loadConfig>): boolean {
  return config.NODE_ENV === "production" || config.NODE_ENV === "production-certification";
}

const REFRESH_COOKIE = "kwakopos_refresh";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

type LoginRequestBody = { email?: unknown; password?: unknown; deviceId?: unknown };
type RefreshRequestBody = { sessionId?: unknown };
type LogoutRequestBody = { sessionId?: unknown };

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
  const deviceId = String(body.deviceId || "").trim();
  if (!email || !password || !deviceId) {
    reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "email, password and deviceId are required" } });
    return;
  }

  const users = await prisma.user.findMany({ where: { email, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true }, take: 1 });
  const user = users[0];
  if (!user || !comparePassword(password, user.passwordHash)) {
    reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
    return;
  }

  const roles = [String(user.role?.name || "ADMIN")];
  const permissions = Array.isArray(user.role?.permissions) ? user.role.permissions.map((value) => String(value)) : [];
  const payload = { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, roles, permissions, deviceId };
  const accessToken = generateAccessToken(payload);
  const session = await globalSessionManager.createSession(user.tenantId, user.id, deviceId);
  setRefreshCookie(reply, session.refreshToken, true);
  reply.send({ success: true, data: { accessToken, sessionId: session.sessionId, user: { id: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, name: user.name, role: roles[0] } } });
}

export function buildFixedServer(opts: { config?: ReturnType<typeof loadConfig>; productionPersistence?: boolean } = {}) {
  const config = opts.config ?? loadConfig();
  const productionPersistence = opts.productionPersistence ?? isProduction(config);
  if (productionPersistence) configurePersistentSessions();

  const server = buildServer({ config, productionPersistence });
  tenantOnboardingRoutes(server);
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

    if (routePath === "/auth/refresh" && req.method === "POST") {
      const body = (req.body || {}) as RefreshRequestBody;
      const sessionId = String(body.sessionId || "");
      const refreshToken = parseCookies(req.headers?.cookie)[REFRESH_COOKIE] || "";
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
  const server = buildFixedServer();
  await server.listen({ port: Number(process.env.PORT || 8080), host: process.env.HOST || "0.0.0.0" });
  return server;
}

if (typeof require !== "undefined" && require.main === module) void startFixedServer();
