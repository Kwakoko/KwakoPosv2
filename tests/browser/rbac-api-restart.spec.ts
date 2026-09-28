import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";

const apiBase = (process.env.RBAC_CERT_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const webBase = (process.env.RBAC_CERT_WEB_URL || "http://127.0.0.1:5173").replace(/\/$/, "");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: process.platform === "win32",
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[RBAC_CHILD] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[RBAC_CHILD_ERR] ${chunk}`));
  return child;
}

async function waitForHttp(url: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "unknown";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function stopProcess(child: ChildProcess | null) {
  if (!child || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
  } else {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

async function api(page: any, method: string, pathname: string, body?: unknown, token?: string) {
  return page.evaluate(async ({ method, pathname, body, token, apiBase }) => {
    const response = await fetch(`${apiBase}${pathname}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  }, { method, pathname, body, token, apiBase });
}

async function readPrivilegedOutboxItems(page: any, tenantId: string) {
  return page.evaluate(async (tenantId) => {
    return new Promise<any[]>((resolve, reject) => {
      const request = indexedDB.open("kwakopos-v2");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("syncOutbox")) {
          db.close();
          resolve([]);
          return;
        }
        const tx = db.transaction("syncOutbox", "readonly");
        const getAll = tx.objectStore("syncOutbox").getAll();
        getAll.onerror = () => reject(getAll.error);
        getAll.onsuccess = () => {
          const items = (getAll.result || []).filter((item: any) =>
            item?.tenantId === tenantId && (item?.entityType === "User" || item?.entityType === "Role")
          );
          db.close();
          resolve(items);
        };
      };
    });
  }, tenantId);
}

test("RBAC real Chromium -> API -> PostgreSQL survives exact API restart", async ({ browser }) => {
  test.setTimeout(180_000);
  let apiProcess: ChildProcess | null = null;
  let webProcess: ChildProcess | null = null;
  const runId = randomUUID().slice(0, 8);
  const email = `rbac-browser-${runId}@example.com`;
  const password = `RbacBrowser-${randomUUID()}!`;
  const roleName = `RBAC Browser Role ${runId}`;
  const userEmail = `rbac-target-${runId}@example.com`;

  try {
    apiProcess = startProcess(npmCommand(), ["run", "dev:api"], {
      PORT: "3000",
      NODE_ENV: "development",
      SYNC_CERTIFICATION_PRISMA: "true",
    });
    webProcess = startProcess(npmCommand(), ["run", "dev:web"], { NODE_ENV: "development" });
    await waitForHttp(`${apiBase}/version`);
    await waitForHttp(`${webBase}/`);

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(webBase, { waitUntil: "domcontentloaded" });

    const login = await api(page, "POST", "/auth/login", { email, password, deviceId: `chromium-rbac-${runId}` });
    expect(login.status, JSON.stringify(login.data)).toBe(200);
    const token = login.data?.data?.accessToken;
    expect(token).toMatch(/^.+$/);
    const tenantId = login.data?.data?.user?.tenantId;
    const branchId = login.data?.data?.user?.branchId;
    expect(tenantId).toMatch(/^.+$/);
    expect(branchId).toMatch(/^.+$/);

    const legalAcceptance = await api(page, "POST", "/api/legal/acceptance/accept-all", undefined, token);
    expect(legalAcceptance.status, JSON.stringify(legalAcceptance.data)).toBe(200);

    // Execute the same HTTP mutation boundary used by UsersRolesPage, from a real Chromium page.
    const roleCreate = await api(page, "POST", "/api/v1/roles", {
      name: roleName,
      description: "Real Chromium RBAC restart proof",
      permissions: ["sales.create"],
    }, token);
    expect(roleCreate.status, JSON.stringify(roleCreate.data)).toBeGreaterThanOrEqual(200);
    expect(roleCreate.status, JSON.stringify(roleCreate.data)).toBeLessThan(300);
    const roleId = roleCreate.data?.data?.id;
    expect(roleId).toMatch(/^.+$/);

    const userCreate = await api(page, "POST", "/api/v1/users", {
      firstName: "Chromium",
      lastName: "RestartProof",
      email: userEmail,
      password: `Target-${randomUUID()}!`,
      roleId,
      branchId,
    }, token);
    expect(userCreate.status, JSON.stringify(userCreate.data)).toBeGreaterThanOrEqual(200);
    expect(userCreate.status, JSON.stringify(userCreate.data)).toBeLessThan(300);
    const userId = userCreate.data?.data?.id;
    expect(userId).toMatch(/^.+$/);

    const beforeRestart = await api(page, "GET", "/api/v1/users", undefined, token);
    expect(beforeRestart.status).toBe(200);
    expect(beforeRestart.data.data.some((u: any) => u.id === userId && u.email === userEmail)).toBe(true);

    const roleBeforeRestart = await api(page, "GET", "/api/v1/roles", undefined, token);
    expect(roleBeforeRestart.status).toBe(200);
    expect(roleBeforeRestart.data.data.some((r: any) => r.id === roleId && r.name === roleName)).toBe(true);

    const dbUserBefore = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    const dbRoleBefore = await prisma.role.findUnique({ where: { id: roleId } });
    expect(dbUserBefore?.tenantId).toBe(tenantId);
    expect(dbUserBefore?.roleId).toBe(roleId);
    expect(dbRoleBefore?.tenantId).toBe(tenantId);

    const auditUserBefore = await prisma.auditEvent.findFirst({ where: { tenantId, action: "USER_CREATED", entityType: "User", entityId: userId } });
    const auditRoleBefore = await prisma.auditEvent.findFirst({ where: { tenantId, action: "ROLE_CREATED", entityType: "Role", entityId: roleId } });
    expect(auditUserBefore).not.toBeNull();
    expect(auditRoleBefore).not.toBeNull();

    // User/Role identity mutations must never be materialized as ordinary browser outbox work.
    expect(await readPrivilegedOutboxItems(page, tenantId)).toHaveLength(0);

    // Kill the exact API process that served the mutations, then start a fresh process on the same port.
    await stopProcess(apiProcess);
    apiProcess = null;
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    apiProcess = startProcess(npmCommand(), ["run", "dev:api"], {
      PORT: "3000",
      NODE_ENV: "development",
      SYNC_CERTIFICATION_PRISMA: "true",
    });
    await waitForHttp(`${apiBase}/version`);

    // The workspace gate is intentionally re-established after a fresh API process starts.
    const legalAcceptanceAfterRestart = await api(page, "POST", "/api/legal/acceptance/accept-all", undefined, token);
    expect(legalAcceptanceAfterRestart.status, JSON.stringify(legalAcceptanceAfterRestart.data)).toBe(200);

    // Real Chromium rereads the exact persisted records through the newly restarted API process.
    const afterRestartUsers = await api(page, "GET", "/api/v1/users", undefined, token);
    expect(afterRestartUsers.status, JSON.stringify(afterRestartUsers.data)).toBe(200);
    expect(afterRestartUsers.data.data.some((u: any) => u.id === userId && u.email === userEmail)).toBe(true);

    const afterRestartRoles = await api(page, "GET", "/api/v1/roles", undefined, token);
    expect(afterRestartRoles.status, JSON.stringify(afterRestartRoles.data)).toBe(200);
    expect(afterRestartRoles.data.data.some((r: any) => r.id === roleId && r.name === roleName)).toBe(true);

    const dbUserAfter = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    const dbRoleAfter = await prisma.role.findUnique({ where: { id: roleId } });
    const auditUserAfter = await prisma.auditEvent.findFirst({ where: { tenantId, action: "USER_CREATED", entityType: "User", entityId: userId } });
    const auditRoleAfter = await prisma.auditEvent.findFirst({ where: { tenantId, action: "ROLE_CREATED", entityType: "Role", entityId: roleId } });

    expect(dbUserAfter?.id).toBe(userId);
    expect(dbUserAfter?.roleId).toBe(roleId);
    expect(dbRoleAfter?.id).toBe(roleId);
    expect(auditUserAfter?.entityId).toBe(userId);
    expect(auditRoleAfter?.entityId).toBe(roleId);
    expect(await readPrivilegedOutboxItems(page, tenantId)).toHaveLength(0);

    const evidence = {
      test: "RBAC real Chromium -> API -> PostgreSQL survives exact API restart",
      runId,
      browserEngine: "Chromium",
      webBase,
      apiBase,
      tenantId,
      roleId,
      userId,
      roleName,
      userEmail,
      beforeRestart: "PASS",
      exactApiProcessRestart: "PASS",
      afterRestartUserRead: "PASS",
      afterRestartRoleRead: "PASS",
      postgresqlUser: "PASS",
      postgresqlRole: "PASS",
      userAuditEvent: "PASS",
      roleAuditEvent: "PASS",
      userRoleSyncOutboxCount: 0,
      finalStatus: "PASS",
      timestamp: new Date().toISOString(),
    };
    if (process.env.RBAC_CERT_EVIDENCE_JSON) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(process.env.RBAC_CERT_EVIDENCE_JSON, JSON.stringify(evidence, null, 2), "utf8");
    }

    await context.close();
  } finally {
    await stopProcess(apiProcess);
    await stopProcess(webProcess);
    await prisma.$disconnect();
  }
});
