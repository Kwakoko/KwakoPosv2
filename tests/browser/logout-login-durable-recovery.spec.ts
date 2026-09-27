import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "@kwakopos2/database";
import { generateAccessToken, hashPassword } from "@kwakopos2/auth";

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");

type LocalState = {
  deviceId: string;
  sessionPresent: boolean;
  customerCount: number;
  lastSyncRevision: string;
  syncEpoch: string;
};

async function readLocalState(page: Page, tenantId: string, branchId: string): Promise<LocalState> {
  return page.evaluate(async ({ tenantId, branchId }) => {
    const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("kwakopos-v2");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openDb();
    const customers = await new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction("customers", "readonly");
      const request = tx.objectStore("customers").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();

    const metaDb = await openDb();
    const readKey = (key: string) => new Promise<any>((resolve, reject) => {
      const tx = metaDb.transaction("syncMetadata", "readonly");
      const request = tx.objectStore("syncMetadata").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const lastSyncRevision = await readKey(`lastSyncRevision:${tenantId}:${branchId}`);
    const syncEpoch = await readKey(`syncEpoch:${tenantId}:${branchId}`);
    metaDb.close();

    return {
      deviceId: localStorage.getItem("kwakopos:v2:device-id") || "",
      sessionPresent: Boolean(localStorage.getItem("kwakopos:v2:session")),
      customerCount: customers.filter((row) => row?.tenantId === tenantId && row?.branchId === branchId).length,
      lastSyncRevision: String(lastSyncRevision ?? "0"),
      syncEpoch: String(syncEpoch ?? ""),
    };
  }, { tenantId, branchId });
}

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes("/auth/login") && response.request().method() === "POST",
  );
  await page.locator("form").getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page.getByText("Inventory").first()).toBeVisible({ timeout: 20000 });
}

test("real logout -> login -> durable IndexedDB recovery", async ({ browser }) => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const deviceId = "DEVICE-RECOVERY";
  const email = `recovery-${tenantId.slice(0, 8)}@kwakopos.test`;
  const password = "Recovery-Cert-2026!";
  let context;
  let firstSessionId = "";
  let secondSessionId = "";

  try {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Logout Login Recovery Tenant", slug: `recovery-${tenantId.slice(0, 18)}` },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: `REC-${branchId.slice(0, 8)}` },
    });
    await prisma.role.create({
      data: { id: roleId, tenantId, name: "ADMIN", permissions: ["*"] },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        branchId,
        email,
        passwordHash: await hashPassword(password),
        name: "Recovery Certification Admin",
        roleId,
        status: "ACTIVE",
      },
    });
    await prisma.customer.create({
      data: {
        id: customerId,
        tenantId,
        branchId,
        customerCode: "REC-CUSTOMER",
        name: "Durable Recovery Customer",
        email: "durable-recovery@kwakopos.test",
      },
    });

    const preAuthToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ["ADMIN"],
      permissions: ["*"],
      deviceId,
    });
    const acceptance = await fetch(`${APP_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${preAuthToken}` },
    });
    expect(acceptance.ok).toBe(true);

    context = await browser.newContext();
    await context.addInitScript(({ deviceId }) => {
      localStorage.setItem("kwakopos:v2:device-id", deviceId);
    }, { deviceId });
    const page = await context.newPage();

    const loginRequests: string[] = [];
    const syncRequests: string[] = [];
    const logoutResponses: number[] = [];
    page.on("request", (request) => {
      if (/\/auth\/login/.test(request.url()) && request.method() === "POST") loginRequests.push(request.url());
      if (/\/sync\//.test(request.url())) syncRequests.push(request.url());
    });
    page.on("response", (response) => {
      if (/\/auth\/logout/.test(response.url()) && response.request().method() === "POST") logoutResponses.push(response.status());
    });

    await page.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
    expect((await readLocalState(page, tenantId, branchId)).sessionPresent).toBe(false);
    expect((await readLocalState(page, tenantId, branchId)).deviceId).toBe(deviceId);

    await loginThroughUi(page, email, password);
    await expect.poll(
      async () => (await readLocalState(page, tenantId, branchId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(1);
    await expect.poll(
      async () => (await readLocalState(page, tenantId, branchId)).syncEpoch,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).not.toBe("");
    const beforeLogout = await readLocalState(page, tenantId, branchId);
    expect(beforeLogout.deviceId).toBe(deviceId);
    expect(beforeLogout.sessionPresent).toBe(true);
    expect(beforeLogout.customerCount).toBe(1);
    // The initial customer is seeded before the first login, so bootstrap has
    // no journal revision to consume yet. Revision 0 is therefore valid here.
    expect(beforeLogout.lastSyncRevision).toBe("0");
    expect(beforeLogout.syncEpoch).not.toBe("");

    const firstStoredSession = await page.evaluate(() => {
      const raw = localStorage.getItem("kwakopos:v2:session");
      return raw ? JSON.parse(raw) : null;
    });
    firstSessionId = String(firstStoredSession?.sessionId || "");
    expect(firstSessionId).not.toBe("");

    await page.locator("#topbar-user-btn").click();
    const signOutResponse = page.waitForResponse((response) =>
      response.url().includes("/auth/logout") && response.request().method() === "POST",
    );
    await page.locator("#topbar-signout-btn").click();
    expect((await signOutResponse).status()).toBe(200);
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => logoutResponses.length).toBeGreaterThan(0);

    const afterLogout = await readLocalState(page, tenantId, branchId);
    expect(afterLogout.sessionPresent).toBe(false);
    expect(afterLogout.deviceId).toBe(deviceId);
    expect(afterLogout.customerCount).toBe(1);
    expect(afterLogout.lastSyncRevision).toBe(beforeLogout.lastSyncRevision);
    expect(afterLogout.syncEpoch).toBe(beforeLogout.syncEpoch);
    expect(loginRequests.length).toBe(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#email")).toBeVisible({ timeout: 15000 });
    const afterLoggedOutReload = await readLocalState(page, tenantId, branchId);
    expect(afterLoggedOutReload.sessionPresent).toBe(false);
    expect(afterLoggedOutReload.deviceId).toBe(deviceId);
    expect(afterLoggedOutReload.customerCount).toBe(1);
    expect(afterLoggedOutReload.lastSyncRevision).toBe(beforeLogout.lastSyncRevision);
    expect(afterLoggedOutReload.syncEpoch).toBe(beforeLogout.syncEpoch);

    // While the browser is logged out, mutate the authoritative server through
    // a separate authenticated device. This creates a real journal revision
    // that the next login MUST recover into this browser's durable IndexedDB.
    const recoveredCustomerId = randomUUID();
    const mutatorToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ["ADMIN"],
      permissions: ["*"],
      deviceId: "DEVICE-SERVER-MUTATOR",
    });
    const mutationOperationId = randomUUID();
    const serverMutation = await fetch(`${APP_URL}/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${mutatorToken}` },
      body: JSON.stringify({
        deviceId: "DEVICE-SERVER-MUTATOR",
        operations: [{
          operationId: mutationOperationId,
          entityType: "Customer",
          entityId: recoveredCustomerId,
          operationType: "CREATE",
          payload: {
            id: recoveredCustomerId,
            customerCode: "REC-POST-LOGOUT",
            name: "Customer Created While Browser Was Logged Out",
            email: "post-logout-recovery@kwakopos.test",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: `RECOVERY-${mutationOperationId}`,
        }],
      }),
    });
    expect(serverMutation.ok).toBe(true);
    const serverMutationBody: any = await serverMutation.json();
    const serverMutationData = serverMutationBody?.data ?? serverMutationBody;
    expect(serverMutationData.processedCount).toBe(1);
    expect(serverMutationData.results?.[0]?.status).toBe("SUCCESS");

    const serverCustomer = await prisma.customer.findUnique({ where: { id: recoveredCustomerId } });
    expect(serverCustomer?.tenantId).toBe(tenantId);
    expect(serverCustomer?.branchId).toBe(branchId);

    const postLogoutBeforeRelogin = await readLocalState(page, tenantId, branchId);
    expect(postLogoutBeforeRelogin.sessionPresent).toBe(false);
    expect(postLogoutBeforeRelogin.customerCount).toBe(1);
    expect(postLogoutBeforeRelogin.lastSyncRevision).toBe(beforeLogout.lastSyncRevision);

    await loginThroughUi(page, email, password);
    await expect.poll(
      async () => (await readLocalState(page, tenantId, branchId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(2);

    const serverHeadAfterLogout = await prisma.$queryRawUnsafe<Array<{ revision: bigint | number | string }>>(
      `SELECT COALESCE(MAX(revision), 0) AS revision
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2`,
      tenantId,
      branchId,
    );
    const expectedRecoveredRevision = String(serverHeadAfterLogout[0]?.revision ?? "0");
    expect(expectedRecoveredRevision).not.toBe("0");

    await expect.poll(
      async () => (await readLocalState(page, tenantId, branchId)).lastSyncRevision,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(expectedRecoveredRevision);

    const afterLogin = await readLocalState(page, tenantId, branchId);
    expect(afterLogin.deviceId).toBe(deviceId);
    expect(afterLogin.sessionPresent).toBe(true);
    expect(afterLogin.customerCount).toBe(2);
    expect(afterLogin.lastSyncRevision).toBe(expectedRecoveredRevision);
    expect(afterLogin.syncEpoch).toBe(beforeLogout.syncEpoch);

    const secondStoredSession = await page.evaluate(() => {
      const raw = localStorage.getItem("kwakopos:v2:session");
      return raw ? JSON.parse(raw) : null;
    });
    secondSessionId = String(secondStoredSession?.sessionId || "");
    expect(secondSessionId).not.toBe("");
    expect(secondSessionId).not.toBe(firstSessionId);
    expect(loginRequests.length).toBe(2);

    const sessions = await prisma.deviceSession.findMany({
      where: { tenantId, userId, deviceId },
      orderBy: { createdAt: "asc" },
      select: { id: true, deviceId: true, revokedAt: true },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe(firstSessionId);
    expect(sessions[0].revokedAt).not.toBeNull();
    expect(sessions[1].id).toBe(secondSessionId);
    expect(sessions[1].revokedAt).toBeNull();

    const evidence = {
      status: "PASS",
      test: "real-logout-login-durable-indexeddb-recovery",
      appUrl: APP_URL,
      browserEngine: "Chromium",
      deviceId,
      transportPath: "Chromium UI -> /auth/logout -> persistent PostgreSQL session -> /auth/login -> sync -> IndexedDB",
      lifecycle: {
        firstSessionCreated: firstSessionId !== "",
        serverLogoutHttpStatus: logoutResponses[logoutResponses.length - 1] ?? null,
        localSessionClearedOnLogout: !afterLogout.sessionPresent,
        durableDeviceIdentity: afterLoggedOutReload.deviceId === deviceId,
        customerDataSurvivedLogout: afterLogout.customerCount === 1,
        customerDataSurvivedLoggedOutReload: afterLoggedOutReload.customerCount === 1,
        secondSessionCreated: secondSessionId !== "",
        firstSessionRevoked: sessions[0].revokedAt !== null,
        secondSessionActive: sessions[1].revokedAt === null,
      },
      indexedDbRecovery: {
        beforeLogout,
        afterLogout,
        afterLoggedOutReload,
        postLogoutBeforeRelogin,
        afterLogin,
        recoveredCustomerId,
      },
      serverRecoveryMutation: {
        operationId: mutationOperationId,
        recoveredCustomerId,
        expectedRecoveredRevision,
        transportStatus: serverMutation.status,
      },
      syncRequestsObserved: syncRequests.length,
      sessions: sessions.map((session) => ({
        id: session.id,
        deviceId: session.deviceId,
        revoked: session.revokedAt !== null,
      })),
      timestamp: new Date().toISOString(),
    };
    await fs.promises.mkdir("artifacts/release-evidence", { recursive: true });
    await fs.promises.writeFile(
      "artifacts/release-evidence/kwakopos-logout-login-durable-recovery.json",
      JSON.stringify(evidence, null, 2),
      "utf8",
    );
  } finally {
    await context?.close();
    await prisma.deviceSession.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});
