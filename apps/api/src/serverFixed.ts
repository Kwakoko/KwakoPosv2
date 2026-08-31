import { FastifyInstance } from "fastify";
import { randomUUID } from "crypto";
import { loadConfig } from "@kwakopos2/config";
import { prisma } from "@kwakopos2/database";
import { comparePassword, generateAccessToken, globalSessionManager, hashPassword } from "@kwakopos2/auth";
import { buildServer } from "./server.js";
import type { JwtPayload } from "@kwakopos2/auth";

function isProduction(config: ReturnType<typeof loadConfig>): boolean {
  return config.NODE_ENV === "production" || config.NODE_ENV === "production-certification";
}

function configurePersistentSessions(): void {
  globalSessionManager.setStoreProvider({
    create: async (record) => { await prisma.deviceSession.create({ data: record as any }); },
    get: async (sessionId) => await prisma.deviceSession.findUnique({ where: { id: sessionId } }) as any,
    update: async (record) => await prisma.deviceSession.update({ where: { id: record.id }, data: { refreshTokenHash: record.refreshTokenHash, expiresAt: record.expiresAt, revokedAt: record.revokedAt } }),
    revokeAllForUser: async (tenantId, userId) => (await prisma.deviceSession.updateMany({ where: { tenantId, userId, revokedAt: null }, data: { revokedAt: new Date() } })).count,
  });
}

async function handleProductionLogin(req: any, reply: any): Promise<void> {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!email || !password || !deviceId) { reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "email, password and deviceId are required" } }); return; }

  const users: any[] = await prisma.user.findMany({ where: { email, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true } });
  if (users.length > 1) { reply.status(409).send({ success: false, error: { code: "AMBIGUOUS_ACCOUNT", message: "Multiple active accounts match this email; tenant selection is required." } }); return; }

  let user: any = users[0] || null;
  if (!user) {
    const bootstrapEmail = String(process.env.KWAKOPOS_BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    const bootstrapPassword = String(process.env.KWAKOPOS_BOOTSTRAP_ADMIN_PASSWORD || "");
    if (bootstrapEmail && bootstrapPassword && email === bootstrapEmail && password === bootstrapPassword) {
      user = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({ data: { name: `${email.split("@")[0]} Organization`, slug: `${email.split("@")[0].replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tenant"}-${randomUUID().slice(0, 8)}`, status: "ACTIVE" } });
        const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: "Main Branch", code: `MAIN-${randomUUID().slice(0, 6)}`, isMain: true } });
        const role = await tx.role.create({ data: { tenantId: tenant.id, name: "ADMIN", permissions: ["*"] } });
        return tx.user.create({ data: { tenantId: tenant.id, branchId: branch.id, email, passwordHash: hashPassword(password), name: "Admin User", roleId: role.id, status: "ACTIVE" }, include: { tenant: true, branch: true, role: true } });
      });
    }
  }
  if (!user || !comparePassword(password, user.passwordHash)) { reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid email or password" } }); return; }

  const roles = [String(user.role?.name || "ADMIN")];
  const permissions = Array.isArray(user.role?.permissions) ? user.role.permissions.map((value: unknown) => String(value)) : [];
  const payload: JwtPayload = { sub: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, roles, permissions, deviceId };
  const accessToken = generateAccessToken(payload);
  const session = await globalSessionManager.createSession(user.tenantId, user.id, deviceId);
  reply.send({ success: true, data: { accessToken, refreshToken: session.refreshToken, sessionId: session.sessionId, user: { id: user.id, tenantId: user.tenantId, branchId: user.branchId, email: user.email, name: user.name, role: roles[0] } } });
}

export function buildFixedServer(opts: { config?: ReturnType<typeof loadConfig>; productionPersistence?: boolean } = {}): FastifyInstance {
  const config = opts.config ?? loadConfig();
  const productionPersistence = opts.productionPersistence ?? isProduction(config);
  if (productionPersistence) configurePersistentSessions();
  const server = buildServer({ config, productionPersistence });

  // Fastify request bodies are available after request parsing; preValidation is
  // therefore the correct interception point for login/refresh/logout payloads.
  server.addHook("preValidation", async (req, reply) => {
    if (!productionPersistence) return;
    const routePath = req.url.split("?")[0];
    if (routePath === "/auth/login" && req.method === "POST") { await handleProductionLogin(req, reply); return; }
    if (routePath === "/auth/refresh" && req.method === "POST") {
      const sessionId = String(req.body?.sessionId || "");
      const refreshToken = String(req.body?.refreshToken || "");
      if (!sessionId || !refreshToken) { reply.status(400).send({ success: false, error: { code: "BAD_REQUEST", message: "sessionId and refreshToken are required" } }); return; }
      const session = await prisma.deviceSession.findUnique({ where: { id: sessionId }, include: { user: { include: { role: true } } } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") { reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } }); return; }
      const rotated = await globalSessionManager.rotateRefreshToken(sessionId, refreshToken, { sub: session.user.id, tenantId: session.user.tenantId, branchId: session.user.branchId, email: session.user.email, roles: [String(session.user.role.name)], permissions: Array.isArray(session.user.role.permissions) ? session.user.role.permissions.map((value: unknown) => String(value)) : [] });
      if (!rotated) { reply.status(401).send({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid or revoked refresh token" } }); return; }
      reply.send({ success: true, data: { accessToken: rotated.accessToken, refreshToken: rotated.refreshToken } });
      return;
    }
    if (routePath === "/auth/logout" && req.method === "POST") {
      const sessionId = String(req.body?.sessionId || "");
      if (sessionId) await globalSessionManager.revokeSession(sessionId);
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

if (import.meta.url === `file://${process.argv[1]}`) void startFixedServer();
