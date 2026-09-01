import { FastifyInstance } from "fastify";
import { loadConfig } from "@kwakopos2/config";
import { prisma } from "@kwakopos2/database";
import { comparePassword, generateAccessToken, globalSessionManager } from "@kwakopos2/auth";
import { buildServer } from "./server.js";
import type { JwtPayload } from "@kwakopos2/auth";

function isProduction(config: ReturnType<typeof loadConfig>): boolean {
  return config.NODE_ENV === "production" || config.NODE_ENV === "production-certification";
}

const REFRESH_COOKIE = "kwakopos_refresh";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function configurePersistentSessions(): void {
  globalSessionManager.setStoreProvider({
    create: async (record) => { await prisma.deviceSession.create({ data: record as any }); },
    get: async (sessionId) => await prisma.deviceSession.findUnique({ where: { id: sessionId } }) as any,
    update: async (record) => {
      await prisma.deviceSession.update({
        where: { id: record.id },
        data: { refreshTokenHash: record.refreshTokenHash, expiresAt: record.expiresAt, revokedAt: record.revokedAt },
      });
    },
    revokeAllForUser: async (tenantId, userId) => (
      await prisma.deviceSession.updateMany({ where: { tenantId, userId, revokedAt: null }, data: { revokedAt: new Date() } })
    ).count,
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

function setRefreshCookie(reply: any, token: string, secure: boolean): void {
  const cookie = `${REFRESH_COOKIE}=${encodeURIComponent(token)}; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure ? "; Secure" : ""}`;
  reply.header("Set-Cookie", cookie);
}

function clearRefreshCookie(reply: any, secure: boolean): void {
  const cookie = `${REFRESH_COOKIE}=; Path=/auth; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
  reply.header("Set-Cookie", cookie);
}

async function handleProductionLogin(req: any, reply: any): Promise<void> {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!email || !password || !deviceId) {
    reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "email, password and deviceId are required" } });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { email, status: "ACTIVE" },
    include: { tenant: true, branch: true, role: true },
  });

  if (!user || !comparePassword(password, user.passwordHash)) {
    reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } });
    return;
  }

  const roles = [String(user.role?.name || "ADMIN")];
  const permissions = Array.isArray(user.role?.permissions) ? user.role.permissions.map((value: unknown) => String(value)) : [];
  const payload: JwtPayload = {
    sub: user.id,
    tenantId: user.tenantId,
    branchId: user.branchId,
    email: user.email,
    roles,
    permissions,
    deviceId,
  };
  const accessToken = generateAccessToken(payload);
  const session = await globalSessionManager.createSession(user.tenantId, user.id, deviceId);
  const secure = true;
  setRefreshCookie(reply, session.refreshToken, secure);

  reply.send({
    success: true,
    data: {
      accessToken,
      sessionId: session.sessionId,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        branchId: user.branchId,
        email: user.email,
        name: user.name,
        role: roles[0],
      },
    },
  });
}

export function buildFixedServer(opts: { config?: ReturnType<typeof loadConfig>; productionPersistence?: boolean } = {}): FastifyInstance {
  const config = opts.config ?? loadConfig();
  const productionPersistence = opts.productionPersistence ?? isProduction(config);
  if (productionPersistence) configurePersistentSessions();
  const server = buildServer({ config, productionPersistence });

  server.addHook("preValidation", async (req, reply) => {
    if (!productionPersistence) return;
    const routePath = req.url.split("?")[0];
    const secure = true;

    if (routePath === "/auth/login" && req.method === "POST") {
      await handleProductionLogin(req, reply);
      return;
    }

    if (routePath === "/auth/refresh" && req.method === "POST") {
      const body = (req.body || {}) as Record<string, any>;
      const sessionId = String(body.sessionId || "");
      const refreshToken = parseCookies(req.headers?.cookie)[REFRESH_COOKIE] || "";
      if (!sessionId || !refreshToken) {
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } });
        return;
      }
      const session = await prisma.deviceSession.findUnique({
        where: { id: sessionId },
        include: { user: { include: { role: true } } },
      });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
        clearRefreshCookie(reply, secure);
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } });
        return;
      }
      const rotated = await globalSessionManager.rotateRefreshToken(sessionId, refreshToken, {
        sub: session.user.id,
        tenantId: session.user.tenantId,
        branchId: session.user.branchId,
        email: session.user.email,
        roles: [String(session.user.role.name)],
        permissions: Array.isArray(session.user.role.permissions) ? session.user.role.permissions.map((value: unknown) => String(value)) : [],
      });
      if (!rotated) {
        clearRefreshCookie(reply, secure);
        reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or revoked refresh token" } });
        return;
      }
      setRefreshCookie(reply, rotated.refreshToken, secure);
      reply.send({ success: true, data: { accessToken: rotated.accessToken } });
      return;
    }

    if (routePath === "/auth/logout" && req.method === "POST") {
      const sessionId = String((req.body as any)?.sessionId || "");
      if (sessionId) await globalSessionManager.revokeSession(sessionId);
      clearRefreshCookie(reply, secure);
      reply.send({ success: true, data: { loggedOut: true } });
    }
  });

  return server;
}

export async function startFixedServer(): Promise<FastifyInstance> {
  const server = buildFixedServer();
  await server.listen({ port: Number(process.env.PORT || 8080), host: process.env.HOST || "0.0.0.0" });
  return server;
}

if (typeof require !== "undefined" && require.main === module) {
  void startFixedServer();
}
