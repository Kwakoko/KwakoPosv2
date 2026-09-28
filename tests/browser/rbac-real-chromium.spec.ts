import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { prisma } from "@kwakopos2/database";

const ROOT = process.cwd();
const API = "http://127.0.0.1:3000";
const WEB = "http://127.0.0.1:5174";

function launch(args: string[], env: NodeJS.ProcessEnv) {
  if (process.platform === "win32") {
    return spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", args.join(" ")], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: "ignore",
      windowsHide: true,
    });
  }
  return spawn(args[0], args.slice(1), {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "ignore",
  });
}

async function waitFor(url: string, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for " + url);
}

async function stopProcess(child: ChildProcess | null) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await once(killer, "exit");
  } else {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}

async function startApi() {
  return launch(
    ["npm", "run", "dev:api"],
    {
      NODE_ENV: "test",
      PORT: "3000",
      HOST: "127.0.0.1",
      SYNC_CERTIFICATION_PRISMA: "true",
      KWAKOPOS_MOCK_AUTH: "false",
      KWAKOPOS_DISABLE_SUPPORT_AUTOMATION: "true",
    },
  );
}

async function startWeb() {
  return launch(
    ["npm", "run", "dev:web"],
    {
      NODE_ENV: "test",
      WEB_PORT: "5174",
    },
  );
}
async function pageRequest(page: any, path: string, init: RequestInit = {}) {
  return page.evaluate(async ({ path, init }) => {
    const response = await fetch(path, init);
    const text = await response.text();
    let body: any = {};
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    return { status: response.status, body };
  }, { path, init });
}

test("REAL Chromium RBAC -> API -> PostgreSQL -> exact API restart", async ({ browser }) => {
  test.setTimeout(180000);
  let apiProcess: ChildProcess | null = null;
  let webProcess: ChildProcess | null = null;
  let tenantId = "";

  const runId = randomUUID().slice(0, 8);
  const actorEmail = "chromium-rbac-" + runId + "@kwakopos.test";
  const actorPassword = "Chromium-" + randomUUID() + "!";
  const targetEmail = "chromium-target-" + runId + "@kwakopos.test";
  const targetPassword = "Target-" + randomUUID() + "!";
  const roleName = "Chromium Role " + runId;

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    apiProcess = await startApi();
    await waitFor(API + "/health");
    webProcess = await startWeb();
    await waitFor(WEB + "/");
    await page.goto(WEB + "/users", { waitUntil: "domcontentloaded" });

    const login = await pageRequest(page, "/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: actorEmail,
        password: actorPassword,
        deviceId: "REAL-CHROMIUM-RBAC",
      }),
    });
    expect(login.status, JSON.stringify(login.body)).toBe(200);

    const session = login.body.data;
    const token = session.accessToken;
    const branchId = session.user.branchId;
    tenantId = session.user.tenantId;

    await page.evaluate((stored) => {
      localStorage.setItem("kwakopos:v2:session", JSON.stringify(stored));
      sessionStorage.setItem("kwakopos:v2:session", JSON.stringify(stored));
    }, {
      sessionId: session.sessionId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    });
    const legal = await pageRequest(page, "/api/legal/acceptance/accept-all", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    });
    expect(legal.status, JSON.stringify(legal.body)).toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Employees" }).click();
    await expect(
      page.getByRole("button", { name: "Add Employee Account" }),
    ).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: "Custom Role Builder" }).click();
    await page.getByRole("button", { name: "Build Custom Role" }).click();
    await expect(
      page.getByRole("heading", { name: "Build Custom Role" }),
    ).toBeVisible({ timeout: 10000 });
    await page.getByLabel("Role name").fill(roleName);
    await page.getByLabel("Role description").fill("Real Chromium RBAC certification role");
    await page.getByRole("button", { name: "Create Role" }).click();
    await expect(page.getByText(roleName, { exact: true })).toBeVisible({ timeout: 30000 });

    const roleDbCreated = await prisma.role.findFirst({
      where: { tenantId, name: roleName },
    });
    expect(roleDbCreated?.tenantId).toBe(tenantId);
    expect(roleDbCreated?.name).toBe(roleName);
    const roleId = roleDbCreated!.id;

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Employees" }).click();
    await page.getByRole("button", { name: "Add Employee Account" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Staff Employee Account" }),
    ).toBeVisible({ timeout: 10000 });
    const form = page.locator("form").filter({
      has: page.getByRole("button", { name: "Create Account" }),
    });
    const inputs = form.locator("input");
    await inputs.nth(0).fill("Chromium");
    await inputs.nth(1).fill("RestartProof");
    await inputs.nth(2).fill(targetEmail);
    await inputs.nth(4).fill(targetPassword);

    const selects = form.locator("select");
    await selects.nth(0).selectOption({ label: roleName });
    await selects.nth(1).selectOption({ index: 0 });
    await form.getByRole("button", { name: "Create Account" }).click();

    await expect(
      page.getByText(targetEmail, { exact: true }),
    ).toBeVisible({ timeout: 30000 });

    const userDb = await prisma.user.findFirst({
      where: { tenantId, email: targetEmail },
      include: { role: true },
    });
    expect(userDb?.email).toBe(targetEmail);
    expect(userDb?.role?.id).toBe(roleId);
    const userId = userDb!.id;

    const userAudit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: userId,
      },
    });
    const roleAudit = await prisma.auditEvent.findFirst({
      where: {
        tenantId,
        action: "ROLE_CREATED",
        entityType: "Role",
        entityId: roleId,
      },
    });
    expect(userAudit?.entityId).toBe(userId);
    expect(roleAudit?.entityId).toBe(roleId);

    const outbox = await page.evaluate(async () => {
      const request = indexedDB.open("kwakopos-v2");
      return await new Promise<{ exists: boolean; forbiddenCount: number }>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("syncOutbox")) {
            db.close();
            resolve({ exists: false, forbiddenCount: 0 });
            return;
          }
          const read = db.transaction("syncOutbox", "readonly")
            .objectStore("syncOutbox").getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            const all = Array.isArray(read.result) ? read.result : [];
            db.close();
            resolve({
              exists: true,
              forbiddenCount: all.filter(
                (x: any) => x.entityType === "User" || x.entityType === "Role",
              ).length,
            });
          };
        };
      });
    });
    expect(outbox.exists).toBe(true);
    expect(outbox.forbiddenCount).toBe(0);

    const firstPid = apiProcess?.pid;
    expect(firstPid).toBeTruthy();
    await stopProcess(apiProcess);
    apiProcess = null;
    await new Promise((resolve) => setTimeout(resolve, 750));
    apiProcess = await startApi();
    await waitFor(API + "/health");
    const secondPid = apiProcess?.pid;
    expect(secondPid).toBeTruthy();
    expect(secondPid).not.toBe(firstPid);

    const restartLegal = await pageRequest(page, "/api/legal/acceptance/accept-all", {
      method: "POST",
      headers: { authorization: "Bearer " + token },
    });
    expect(restartLegal.status).toBe(200);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Employees" }).click();
    await expect(
      page.getByRole("button", { name: "Add Employee Account" }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByText(targetEmail, { exact: true }),
    ).toBeVisible({ timeout: 30000 });

    const usersAfter = await pageRequest(page, "/api/v1/users", { headers: { authorization: "Bearer " + token } });
    const rolesAfter = await pageRequest(page, "/api/v1/roles", { headers: { authorization: "Bearer " + token } });
    expect(usersAfter.status).toBe(200);
    expect(rolesAfter.status).toBe(200);
    expect(
      usersAfter.body.data.some(
        (u: any) => u.id === userId && u.email === targetEmail,
      ),
    ).toBe(true);
    expect(
      rolesAfter.body.data.some(
        (r: any) => r.id === roleId && r.name === roleName,
      ),
    ).toBe(true);

    const userAfter = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    const roleAfter = await prisma.role.findUnique({
      where: { id: roleId },
    });
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
      gate: "REAL_CHROMIUM_RBAC_POSTGRES_RESTART",
      browserEngine: "Chromium",
      userCreatedThroughRealUi: true,
      roleCreatedThroughChromiumApi: true,
      exactApiProcessRestart: true,
      userVisibleAfterRestart: true,
      roleVisibleAfterRestart: true,
      postgresqlUserAfterRestart: true,
      postgresqlRoleAfterRestart: true,
      auditEventsAfterRestart: true,
      userRoleSyncOutboxCount: outbox.forbiddenCount,
      status: "PASS",
    }));
  } finally {
    await context.close();
    await stopProcess(apiProcess);
    await stopProcess(webProcess);
    if (tenantId) {
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
