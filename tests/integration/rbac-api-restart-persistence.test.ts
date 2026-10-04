import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve as resolvePath } from "node:path";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

const ROOT = process.cwd();
const PORT = 3012;
const BASE = "http://127.0.0.1:" + PORT;

describe("RBAC API mutations survive exact API restart", () => {
  let api: ChildProcess | null = null;
  let tenantId = "";
  let token = "";
  let roleId = "";
  let userId = "";

  const actorEmail = "rbac-restart-" + randomUUID().slice(0, 8) + "@kwakopos.test";
  const targetEmail = "restart-user-" + randomUUID().slice(0, 8) + "@kwakopos.test";
  const actorPassword = "RbacRestart-" + randomUUID() + "!";
  const targetPassword = "Target-" + randomUUID() + "!";

  const assert2xx = (status: number, body: unknown) => {
    expect(status, JSON.stringify(body)).toBeGreaterThanOrEqual(200);
    expect(status, JSON.stringify(body)).toBeLessThan(300);
  };

  async function startApi() {
    const tsx = resolvePath(ROOT, "node_modules/tsx/dist/cli.mjs");
    const serverEntry = resolvePath(ROOT, "apps/api/src/serverFixed.ts");
    api = spawn(process.execPath, [tsx, serverEntry], {
      cwd: ROOT,
      env: {
        ...process.env,
        NODE_ENV: "test",
        SYNC_CERTIFICATION_PRISMA: "true",
        HOST: "127.0.0.1",
        PORT: String(PORT),
        KWAKOPOS_MOCK_AUTH: "false",
        KWAKOPOS_DISABLE_SUPPORT_AUTOMATION: "true",
      },
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let errors = "";
    api.stderr?.on("data", (chunk) => { errors += chunk.toString(); });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (api.exitCode !== null) throw new Error("API exited " + api.exitCode + ": " + errors);
      try {
        if ((await fetch(BASE + "/health")).ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("API startup timeout: " + errors);
  }

  async function stopApi() {
    if (!api || api.exitCode !== null || !api.pid) return;
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/PID", String(api.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      await once(killer, "exit");
    } else {
      api.kill("SIGTERM");
      await Promise.race([
        once(api, "exit").then(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
      if (api.exitCode === null) api.kill("SIGKILL");
    }
    api = null;
  }

  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set("content-type", "application/json");
    if (token) headers.set("authorization", "Bearer " + token);
    const response = await fetch(BASE + path, { ...init, headers });
    return { response, body: await response.json().catch(() => ({})) };
  }

  afterAll(async () => {
    await stopApi();
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it("persists User + Role + AuditEvent across exact API process restart", async () => {
    await startApi();
    const firstPid = api?.pid;
    expect(firstPid).toBeTruthy();

    const login = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: actorEmail,
        password: actorPassword,
        deviceId: "RBAC-RESTART-PROOF",
      }),
    });
    assert2xx(login.response.status, login.body);

    token = String(login.body?.data?.accessToken || "");
    tenantId = String(login.body?.data?.user?.tenantId || "");
    const branchId = String(login.body?.data?.user?.branchId || "");
    expect(token).not.toBe("");
    expect(tenantId).not.toBe("");
    expect(branchId).not.toBe("");

    const firstLegal = await request("/api/legal/acceptance/accept-all", { method: "POST" });
    assert2xx(firstLegal.response.status, firstLegal.body);
    const roleName = "RBAC Restart Role " + randomUUID().slice(0, 8);
    const role = await request("/api/v1/roles", {
      method: "POST",
      body: JSON.stringify({
        name: roleName,
        description: "Exact restart proof",
        permissions: ["sales.create"],
      }),
    });
    assert2xx(role.response.status, role.body);
    roleId = String(role.body?.data?.id || "");
    expect(roleId).not.toBe("");

    const user = await request("/api/v1/users", {
      method: "POST",
      body: JSON.stringify({
        firstName: "Restart",
        lastName: "Proof",
        email: targetEmail,
        password: targetPassword,
        roleId,
        branchId,
      }),
    });
    assert2xx(user.response.status, user.body);
    userId = String(user.body?.data?.id || "");
    expect(userId).not.toBe("");

    const userBefore = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const roleBefore = await prisma.role.findUnique({ where: { id: roleId } });
    const userAuditBefore = await prisma.auditEvent.findFirst({
      where: { tenantId, action: "USER_CREATED", entityType: "User", entityId: userId },
    });
    const roleAuditBefore = await prisma.auditEvent.findFirst({
      where: { tenantId, action: "ROLE_CREATED", entityType: "Role", entityId: roleId },
    });

    expect(userBefore?.id).toBe(userId);
    expect(userBefore?.roleId).toBe(roleId);
    expect(roleBefore?.id).toBe(roleId);
    expect(userAuditBefore?.entityId).toBe(userId);
    expect(roleAuditBefore?.entityId).toBe(roleId);

    await stopApi();
    await startApi();
    const secondPid = api?.pid;
    expect(secondPid).toBeTruthy();
    expect(secondPid).not.toBe(firstPid);
    const secondLegal = await request("/api/legal/acceptance/accept-all", { method: "POST" });
    assert2xx(secondLegal.response.status, secondLegal.body);

    const usersAfter = await request("/api/v1/users");
    const rolesAfter = await request("/api/v1/roles");
    assert2xx(usersAfter.response.status, usersAfter.body);
    assert2xx(rolesAfter.response.status, rolesAfter.body);

    expect(
      usersAfter.body?.data?.some(
        (u: any) => u.id === userId && u.email === targetEmail,
      ),
    ).toBe(true);
    expect(
      rolesAfter.body?.data?.some(
        (r: any) => r.id === roleId && r.name === roleName,
      ),
    ).toBe(true);

    const userAfter = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const roleAfter = await prisma.role.findUnique({ where: { id: roleId } });
    const userAuditAfter = await prisma.auditEvent.findFirst({
      where: { tenantId, action: "USER_CREATED", entityType: "User", entityId: userId },
    });
    const roleAuditAfter = await prisma.auditEvent.findFirst({
      where: { tenantId, action: "ROLE_CREATED", entityType: "Role", entityId: roleId },
    });

    expect(userAfter?.id).toBe(userId);
    expect(userAfter?.tenantId).toBe(tenantId);
    expect(userAfter?.roleId).toBe(roleId);
    expect(userAfter?.role?.id).toBe(roleId);
    expect(roleAfter?.id).toBe(roleId);
    expect(roleAfter?.tenantId).toBe(tenantId);
    expect(userAuditAfter?.entityId).toBe(userId);
    expect(roleAuditAfter?.entityId).toBe(roleId);

    console.log(JSON.stringify({
      gate: "RBAC_API_RESTART_PERSISTENCE",
      exactApiRestart: true,
      userAfterRestart: true,
      roleAfterRestart: true,
      auditAfterRestart: true,
      status: "PASS",
    }));
  }, 120000);
});
