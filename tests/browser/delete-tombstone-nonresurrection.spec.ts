import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { prisma } from "@kwakopos2/database";
import { generateAccessToken, hashPassword } from "@kwakopos2/auth";

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");

type LocalState = {
  deviceId: string;
  customerCount: number;
  tombstonePresent: boolean;
  lastSyncRevision: string;
};

async function readLocalState(page: Page, tenantId: string, branchId: string, customerId: string): Promise<LocalState> {
  return page.evaluate(async ({ tenantId, branchId, customerId }) => {
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
    const tombstone = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction("syncMetadata", "readonly");
      const request = tx.objectStore("syncMetadata").get(`tombstone:Customer:${customerId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const revision = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction("syncMetadata", "readonly");
      const request = tx.objectStore("syncMetadata").get(`lastSyncRevision:${tenantId}:${branchId}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();

    return {
      deviceId: localStorage.getItem("kwakopos:v2:device-id") || "",
      customerCount: customers.filter((row) => row?.tenantId === tenantId && row?.branchId === branchId && row?.id === customerId).length,
      tombstonePresent: tombstone !== undefined,
      lastSyncRevision: String(revision ?? "0"),
    };
  }, { tenantId, branchId, customerId });
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

async function push(page: Page, token: string, deviceId: string, operation: Record<string, unknown>) {
  return page.evaluate(async ({ token, deviceId, operation }) => {
    const response = await fetch("/sync/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ deviceId, operations: [operation] }),
    });
    const body = await response.json();
    return { status: response.status, body };
  }, { token, deviceId, operation });
}

test("DELETE propagates as tombstone and cannot resurrect a deleted entity", async ({ browser }) => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const email = `tombstone-${tenantId.slice(0, 8)}@kwakopos.test`;
  const password = "Tombstone-Cert-2026!";
  const deviceA = "DEVICE-TOMBSTONE-A";
  const deviceB = "DEVICE-TOMBSTONE-B";
  const deviceC = "DEVICE-TOMBSTONE-C";
  const staleDevice = "DEVICE-STALE-CREATE";

  const contexts: BrowserContext[] = [];
  let createOperationId = "";
  let deleteOperationId = "";
  try {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Tombstone Certification Tenant", slug: `tomb-${tenantId.slice(0, 18)}` },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: `TMB-${branchId.slice(0, 8)}` },
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
        name: "Tombstone Certification Admin",
        roleId,
        status: "ACTIVE",
      },
    });

    const acceptanceToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ["ADMIN"],
      permissions: ["*"],
      deviceId: deviceA,
    });
    const acceptance = await fetch(`${APP_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${acceptanceToken}` },
    });
    expect(acceptance.ok).toBe(true);

    const sessions = new Map<string, string>();
    for (const deviceId of [deviceA, deviceB]) {
      const context = await browser.newContext();
      await context.addInitScript(({ deviceId }) => {
        localStorage.setItem("kwakopos:v2:device-id", deviceId);
      }, { deviceId });
      contexts.push(context);
      const page = await context.newPage();
      const login = await page.request.post(`${APP_URL}/auth/login`, {
        data: { email, password, deviceId },
      });
      expect(login.ok()).toBe(true);
      const loginBody: any = await login.json();
      const accessToken = String(loginBody?.data?.accessToken || "");
      const sessionId = String(loginBody?.data?.sessionId || "");
      const user = loginBody?.data?.user;
      expect(accessToken).not.toBe("");
      expect(sessionId).not.toBe("");
      sessions.set(deviceId, accessToken);
      await context.addInitScript(({ accessToken, sessionId, user }) => {
        localStorage.setItem("kwakopos:v2:session", JSON.stringify({
          sessionId,
          accessToken,
          user,
        }));
      }, { accessToken, sessionId, user });
    }

    const pageA = contexts[0].pages()[0];
    const pageB = contexts[1].pages()[0];
    await pageA.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
    await pageB.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
    await expect(pageA.getByText("Inventory").first()).toBeVisible({ timeout: 20000 });
    await expect(pageB.getByText("Inventory").first()).toBeVisible({ timeout: 20000 });
    createOperationId = randomUUID();
    const createResponse = await push(pageA, sessions.get(deviceA)!, deviceA, {
      operationId: createOperationId,
      entityType: "Customer",
      entityId: customerId,
      operationType: "CREATE",
      payload: {
        id: customerId,
        customerCode: "TMB-CUSTOMER",
        name: "Customer To Tombstone",
        email: "tombstone-target@kwakopos.test",
      },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `TMB-CREATE-${createOperationId}`,
    });
    expect(createResponse.status).toBe(200);
    const createBody: any = createResponse.body?.data ?? createResponse.body;
    expect(createBody.processedCount).toBe(1);
    expect(createBody.results?.[0]?.status).toBe("SUCCESS");

    await expect.poll(
      async () => (await readLocalState(pageB, tenantId, branchId, customerId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(1);

    const createdCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(createdCustomer?.status).toBe("ACTIVE");
    const createdUpdatedAt = createdCustomer?.updatedAt.toISOString();
    expect(createdUpdatedAt).toBeTruthy();

    deleteOperationId = randomUUID();
    const deleteResponse = await push(pageA, sessions.get(deviceA)!, deviceA, {
      operationId: deleteOperationId,
      entityType: "Customer",
      entityId: customerId,
      operationType: "DELETE",
      payload: { _baseUpdatedAt: createdUpdatedAt },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `TMB-DELETE-${deleteOperationId}`,
    });
    expect(deleteResponse.status).toBe(200);
    const deleteBody: any = deleteResponse.body?.data ?? deleteResponse.body;
    expect(deleteBody.processedCount).toBe(1);
    expect(deleteBody.results?.[0]?.status).toBe("SUCCESS");

    const deletedCustomer = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(deletedCustomer?.status).toBe("INACTIVE");

    const journalRows = await prisma.$queryRawUnsafe<Array<{
      revision: bigint | number | string;
      operation_id: string;
      operation_type: string;
      record: any;
    }>>(
      `SELECT revision, operation_id, operation_type, record
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2 AND entity_type = 'Customer' AND entity_id = $3
        ORDER BY revision ASC`,
      tenantId,
      branchId,
      customerId,
    );
    expect(journalRows).toHaveLength(2);
    expect(journalRows[0].operation_id).toBe(createOperationId);
    expect(journalRows[0].operation_type).toBe("CREATE");
    expect(journalRows[1].operation_id).toBe(deleteOperationId);
    expect(journalRows[1].operation_type).toBe("DELETE");
    expect(String(journalRows[1].record?.status).toUpperCase()).toBe("INACTIVE");
    expect(Number(journalRows[1].revision)).toBeGreaterThan(Number(journalRows[0].revision));

    await expect.poll(
      async () => (await readLocalState(pageA, tenantId, branchId, customerId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(0);
    await expect.poll(
      async () => (await readLocalState(pageB, tenantId, branchId, customerId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(0);
    await expect.poll(
      async () => (await readLocalState(pageB, tenantId, branchId, customerId)).tombstonePresent,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(true);
    const afterDeleteB = await readLocalState(pageB, tenantId, branchId, customerId);
    await pageB.reload({ waitUntil: "domcontentloaded" });
    await expect(pageB.getByText("Inventory").first()).toBeVisible({ timeout: 20000 });
    const afterReloadB = await readLocalState(pageB, tenantId, branchId, customerId);
    expect(afterReloadB.customerCount).toBe(0);
    expect(afterReloadB.tombstonePresent).toBe(true);
    expect(afterReloadB.deviceId).toBe(deviceB);
    expect(afterReloadB.lastSyncRevision).toBe(afterDeleteB.lastSyncRevision);

    const freshContext = await browser.newContext();
    contexts.push(freshContext);
    await freshContext.addInitScript(({ deviceId }) => {
      localStorage.setItem("kwakopos:v2:device-id", deviceId);
    }, { deviceId: deviceC });
    const pageC = await freshContext.newPage();
    const loginC = await pageC.request.post(`${APP_URL}/auth/login`, {
      data: { email, password, deviceId: deviceC },
    });
    expect(loginC.ok()).toBe(true);
    const loginCBody: any = await loginC.json();
    await freshContext.addInitScript((session) => {
      localStorage.setItem("kwakopos:v2:session", JSON.stringify(session));
    }, {
      sessionId: String(loginCBody?.data?.sessionId || ""),
      accessToken: String(loginCBody?.data?.accessToken || ""),
      user: loginCBody?.data?.user,
    });

    const bootstrapCounts: number[] = [];
    pageC.on("response", async (response) => {
      if (response.url().includes("/sync/bootstrap") && response.request().method() === "POST") {
        try {
          const body: any = await response.json();
          bootstrapCounts.push(Number((body?.data ?? body)?.entityCounts?.customers ?? -1));
        } catch { /* ignore */ }
      }
    });
    await pageC.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
    await expect(pageC.getByText("Inventory").first()).toBeVisible({ timeout: 20000 });
    await expect.poll(
      async () => (await readLocalState(pageC, tenantId, branchId, customerId)).customerCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(0);
    expect(bootstrapCounts.every((count) => count === 0)).toBe(true);

    const staleToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ["ADMIN"],
      permissions: ["*"],
      deviceId: staleDevice,
    });
    const staleOperationId = randomUUID();
    const staleResponse = await push(pageC, staleToken, staleDevice, {
      operationId: staleOperationId,
      entityType: "Customer",
      entityId: customerId,
      operationType: "CREATE",
      payload: {
        id: customerId,
        customerCode: "TMB-STALE-RECREATE",
        name: "STALE RECREATE ATTEMPT",
      },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: `TMB-STALE-${staleOperationId}`,
    });
    expect(staleResponse.status).toBe(200);
    const staleBody: any = staleResponse.body?.data ?? staleResponse.body;
    expect(staleBody.processedCount).toBe(0);
    expect(staleBody.results?.[0]?.status).toBe("FAILED");
    expect(String(staleBody.results?.[0]?.error)).toContain("TOMBSTONE_RESURRECTION_BLOCKED");

    const stillDeleted = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(stillDeleted?.status).toBe("INACTIVE");
    const journalAfterStale = await prisma.$queryRawUnsafe<Array<{ operation_id: string; operation_type: string }>>(
      `SELECT operation_id, operation_type
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2 AND entity_type = 'Customer' AND entity_id = $3
        ORDER BY revision ASC`,
      tenantId,
      branchId,
      customerId,
    );
    expect(journalAfterStale.map((row) => row.operation_id)).toEqual([createOperationId, deleteOperationId]);
    expect(journalAfterStale.map((row) => row.operation_type)).toEqual(["CREATE", "DELETE"]);

    await expect.poll(
      async () => (await readLocalState(pageB, tenantId, branchId, customerId)).customerCount,
      { timeout: 10000, intervals: [500, 1000] },
    ).toBe(0);

    const evidence = {
      status: "PASS",
      test: "delete-tombstone-non-resurrection-e2e",
      appUrl: APP_URL,
      browserEngine: "Chromium",
      transportPath: "Chromium -> /sync/push DELETE -> PostgreSQL inactive state -> sync_change_journal DELETE -> IndexedDB tombstone",
      tenantId,
      branchId,
      customerId,
      devices: [deviceA, deviceB, deviceC, staleDevice],
      createOperationId,
      deleteOperationId,
      assertions: {
        serverRecordInactiveAfterDelete: deletedCustomer?.status === "INACTIVE",
        deleteJournalIsDeleteRevision: journalRows[1].operation_type === "DELETE",
        deleteJournalRevisionAfterCreate: Number(journalRows[1].revision) > Number(journalRows[0].revision),
        browserARemovedDeletedCustomer: (await readLocalState(pageA, tenantId, branchId, customerId)).customerCount === 0,
        browserBRemovedDeletedCustomer: afterDeleteB.customerCount === 0,
        browserBTombstonePresent: afterDeleteB.tombstonePresent,
        browserBReloadNoResurrection: afterReloadB.customerCount === 0,
        freshBootstrapNoResurrection: (await readLocalState(pageC, tenantId, branchId, customerId)).customerCount === 0,
        staleCreateRejected: staleBody.results?.[0]?.status === "FAILED",
        staleCreateError: String(staleBody.results?.[0]?.error || ""),
        serverStillInactiveAfterStaleCreate: stillDeleted?.status === "INACTIVE",
        noPostDeleteCreateJournal: journalAfterStale.length === 2,
      },
      bootstrapCustomerCounts: bootstrapCounts,
      revisions: journalRows.map((row) => String(row.revision)),
      timestamp: new Date().toISOString(),
    };
    await fs.promises.mkdir("artifacts/release-evidence", { recursive: true });
    await fs.promises.writeFile(
      "artifacts/release-evidence/kwakopos-delete-tombstone-nonresurrection.json",
      JSON.stringify(evidence, null, 2),
      "utf8",
    );
  } finally {
    for (const context of contexts) await context.close();
    await prisma.deviceSession.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});
