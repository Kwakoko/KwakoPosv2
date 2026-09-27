import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import pathFs from 'node:path';
import { prisma } from '@kwakopos2/database';
import { generateAccessToken, hashPassword } from '@kwakopos2/auth';

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || 'http://127.0.0.1:5173').trim().replace(/\/$/, '');

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

async function loginThroughUi(page: Page, email: string, password: string): Promise<void> {
  await expect(page.locator('#email')).toBeVisible({ timeout: 15000 });
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  const loginResponse = page.waitForResponse((response) =>
    response.url().includes('/auth/login') && response.request().method() === 'POST',
  );
  await page.locator('form').getByRole('button', { name: /sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await expect(page.getByText('Inventory').first()).toBeVisible({ timeout: 20000 });
}
async function readCrashState(page: Page, tenantId: string, branchId: string, operationId: string) {
  return page.evaluate(async ({ tenantId, branchId, operationId }) => {
    const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('kwakopos-v2');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openDb();
    const readAll = (store: string) => new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
    const [outbox, customers] = await Promise.all([readAll('syncOutbox'), readAll('customers')]);
    const readMeta = (key: string) => new Promise<any>((resolve, reject) => {
      const tx = db.transaction('syncMetadata', 'readonly');
      const request = tx.objectStore('syncMetadata').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const bootstrapKey = 'bootstrap:' + tenantId + ':' + branchId;
    const cursorKey = 'lastSyncRevision:' + tenantId + ':' + branchId;
    const syncEpochKey = 'syncEpoch:' + tenantId + ':' + branchId;
    const [bootstrap, cursor, syncEpoch] = await Promise.all([
      readMeta(bootstrapKey),
      readMeta(cursorKey),
      readMeta(syncEpochKey),
    ]);
    db.close();

    const item = outbox.find((row) => row?.id === operationId);
    return {
      outboxStatus: item?.status ?? null,
      outboxError: item?.error ?? null,
      outboxCount: outbox.filter((row) => row?.tenantId === tenantId && row?.status === 'PENDING').length,
      customerPresent: customers.some((row) =>
        row?.id === item?.entityId && row?.tenantId === tenantId && row?.branchId === branchId,
      ),
      bootstrapPresent: Boolean(bootstrap),
      cursor: String(cursor ?? '0'),
      syncEpoch: String(syncEpoch ?? ''),
      deviceId: localStorage.getItem('kwakopos:v2:device-id') || '',
      sessionPresent: Boolean(localStorage.getItem('kwakopos:v2:session')),
    };
  }, { tenantId, branchId, operationId });
}

test('crash/restart during an in-flight outbox transaction preserves and exactly-once applies the mutation', async () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const customerId = randomUUID();
  const operationId = randomUUID();
  const idempotencyKey = 'CRASH-RESTART-' + operationId;
  const deviceId = 'DEVICE-CRASH-RESTART';
  const email = 'crash-restart-' + tenantId.slice(0, 8) + '@kwakopos.test';
  const password = 'Crash-Restart-Cert-2026!';
  const userDataDir = pathFs.resolve('artifacts', 'tmp', 'crash-restart-' + tenantId);

  let context: BrowserContext | undefined;
  let restartedContext: BrowserContext | undefined;
  const releaseRoute = deferred<void>();
  const serverResponseFetched = deferred<{ status: number; body: string }>();
  let routeEntered = false;
  let serverResponse: { status: number; body: string } | null = null;

  try {
    await prisma.tenant.create({
      data: { id: tenantId, name: 'Crash Restart Certification Tenant', slug: 'crash-' + tenantId.slice(0, 18) },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: 'Main', code: 'CRS-' + branchId.slice(0, 8) },
    });
    await prisma.role.create({
      data: { id: roleId, tenantId, name: 'ADMIN', permissions: ['*'] },
    });
    await prisma.user.create({
      data: {
        id: userId,
        tenantId,
        branchId,
        email,
        passwordHash: await hashPassword(password),
        name: 'Crash Restart Certification Admin',
        roleId,
        status: 'ACTIVE',
      },
    });
    const preAuthToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ['ADMIN'],
      permissions: ['*'],
      deviceId,
    });
    const acceptance = await fetch(APP_URL + '/api/legal/acceptance/accept-all', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + preAuthToken },
    });
    expect(acceptance.ok).toBe(true);

    await fs.promises.mkdir(userDataDir, { recursive: true });
    context = await chromium.launchPersistentContext(userDataDir, { headless: true });
    await context.addInitScript(({ deviceId }) => {
      localStorage.setItem('kwakopos:v2:device-id', deviceId);
    }, { deviceId });
    const page = await context.newPage();
    await page.goto(APP_URL + '/inventory', { waitUntil: 'domcontentloaded' });
    await loginThroughUi(page, email, password);

    await expect.poll(
      async () => (await readCrashState(page, tenantId, branchId, operationId)).bootstrapPresent,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(true);
    const bootState = await readCrashState(page, tenantId, branchId, operationId);
    expect(bootState.deviceId).toBe(deviceId);
    expect(bootState.sessionPresent).toBe(true);
    expect(bootState.outboxCount).toBe(0);

    await page.route('**/sync/push', async (route) => {
      routeEntered = true;
      try {
        const response = await route.fetch();
        const body = await response.text();
        serverResponse = { status: response.status(), body };
        serverResponseFetched.resolve(serverResponse);
        await releaseRoute.promise;
        try {
          await route.fulfill({ response, body });
        } catch {
          // Expected after the persistent Chromium context is closed.
        }
      } catch (error) {
        try { serverResponseFetched.reject(error); } catch { /* route may already be torn down */ }
      }
    });

    const enqueueResult = await page.evaluate(async ({ customerId, tenantId, branchId, operationId, idempotencyKey }) => {
      const mod = await import('/src/atomicOutbox.ts');
      await mod.db.ready;
      const item = await mod.enqueueOutbox({
        id: operationId,
        entityType: 'Customer',
        entityId: customerId,
        operationType: 'CREATE',
        payload: {
          id: customerId,
          customerCode: 'CRASH-001',
          name: 'Customer Created Before Browser Crash',
          email: 'crash-restart@kwakopos.test',
          tenantId,
          branchId,
        },
        clientCreatedAt: new Date().toISOString(),
        idempotencyKey,
        tenantId,
        branchId,
      });
      return { id: item.id, status: item.status };
    }, { customerId, tenantId, branchId, operationId, idempotencyKey });
    expect(enqueueResult).toEqual({ id: operationId, status: 'PENDING' });
    const initialState = await readCrashState(page, tenantId, branchId, operationId);
    expect(initialState.outboxStatus).toBe('PENDING');
    expect(initialState.customerPresent).toBe(true);
    await expect.poll(
      async () => routeEntered,
      { timeout: 30000, intervals: [250, 500, 1000] },
    ).toBe(true);
    serverResponse = await serverResponseFetched.promise;
    expect(serverResponse.status).toBe(200);

    await expect.poll(
      async () => prisma.syncOperation.count({ where: { tenantId, branchId, operationId } }),
      { timeout: 30000, intervals: [250, 500, 1000] },
    ).toBe(1);

    const serverOperationBeforeCrash = await prisma.syncOperation.findFirst({
      where: { tenantId, branchId, operationId },
      select: { operationId: true, idempotencyKey: true, status: true, processedAt: true, deviceId: true },
    });
    expect(serverOperationBeforeCrash?.status).toBe('PROCESSED');
    expect(serverOperationBeforeCrash?.idempotencyKey).toBe(idempotencyKey);
    expect(serverOperationBeforeCrash?.deviceId).toBe(deviceId);
    expect(serverOperationBeforeCrash?.processedAt).not.toBeNull();

    const serverCustomerBeforeCrash = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(serverCustomerBeforeCrash?.tenantId).toBe(tenantId);
    expect(serverCustomerBeforeCrash?.branchId).toBe(branchId);
    expect(serverCustomerBeforeCrash?.name).toBe('Customer Created Before Browser Crash');

    const preCrashState = await readCrashState(page, tenantId, branchId, operationId);
    expect(preCrashState.outboxStatus).toBe('PENDING');
    expect(preCrashState.outboxCount).toBe(1);
    expect(preCrashState.customerPresent).toBe(true);

    const cdp = await context.newCDPSession(page);
    try {
      await Promise.race([
        cdp.send('Browser.crash').catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {
      // Browser.crash normally terminates the target before CDP can acknowledge it.
    }
    context = undefined;
    releaseRoute.resolve();
    await expect.poll(
      async () => page.isClosed(),
      { timeout: 10000, intervals: [250, 500, 1000] },
    ).toBe(true);
    restartedContext = await chromium.launchPersistentContext(userDataDir, { headless: true });
    await restartedContext.addInitScript(({ deviceId }) => {
      localStorage.setItem('kwakopos:v2:device-id', deviceId);
    }, { deviceId });

    const restartedPage = await restartedContext.newPage();
    const restartPushRequests: string[] = [];
    const restartPushResponses: number[] = [];
    restartedPage.on('request', (request) => {
      if (request.url().includes('/sync/push') && request.method() === 'POST') {
        restartPushRequests.push(request.url());
      }
    });
    restartedPage.on('response', (response) => {
      if (response.url().includes('/sync/push') && response.request().method() === 'POST') {
        restartPushResponses.push(response.status());
      }
    });
    await restartedPage.goto(APP_URL + '/inventory', { waitUntil: 'domcontentloaded' });
    const restartSessionPresent = await restartedPage.evaluate(() =>
      Boolean(localStorage.getItem('kwakopos:v2:session')),
    ).catch(() => false);
    if (!restartSessionPresent) {
      const loginResult = await restartedPage.evaluate(async ({ email, password, deviceId }) => {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password, deviceId }),
        });
        const body = await response.json();
        if (!response.ok || !body?.success || !body?.data) {
          throw new Error('RESTART_AUTH_RECOVERY_FAILED: HTTP ' + response.status);
        }
        localStorage.setItem('kwakopos:v2:session', JSON.stringify({
          sessionId: body.data.sessionId,
          accessToken: body.data.accessToken,
          user: body.data.user,
        }));
        return { status: response.status };
      }, { email, password, deviceId });
      expect(loginResult.status).toBe(200);
      await restartedPage.reload({ waitUntil: 'domcontentloaded' });
    }
    await expect(restartedPage.getByText('Inventory').first()).toBeVisible({ timeout: 30000 });

    await expect.poll(
      async () => (await readCrashState(restartedPage, tenantId, branchId, operationId)).deviceId,
      { timeout: 10000, intervals: [250, 500, 1000] },
    ).toBe(deviceId);

    await expect.poll(
      async () => (await readCrashState(restartedPage, tenantId, branchId, operationId)).outboxStatus,
      { timeout: 45000, intervals: [500, 1000, 2000] },
    ).toBe('SYNCED');

    await expect.poll(
      async () => prisma.syncOperation.count({ where: { tenantId, branchId, operationId } }),
      { timeout: 10000, intervals: [250, 500, 1000] },
    ).toBe(1);
    const journalRows = await prisma.$queryRawUnsafe<Array<{
      revision: bigint | number | string;
      entity_type: string;
      entity_id: string;
      operation_type: string;
      source: string;
    }>>(
      'SELECT revision, entity_type, entity_id, operation_type, source ' +
      'FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2 AND entity_id = $3 ' +
      'ORDER BY revision ASC',
      tenantId,
      branchId,
      customerId,
    );
    expect(journalRows).toHaveLength(1);
    expect(journalRows[0]?.entity_type).toBe('Customer');
    expect(journalRows[0]?.entity_id).toBe(customerId);
    expect(journalRows[0]?.operation_type).toBe('CREATE');
    expect(journalRows[0]?.source).toBe('push');

    const postRestartState = await readCrashState(restartedPage, tenantId, branchId, operationId);
    expect(postRestartState.deviceId).toBe(deviceId);
    expect(postRestartState.sessionPresent).toBe(true);
    expect(postRestartState.outboxStatus).toBe('SYNCED');
    expect(postRestartState.outboxCount).toBe(0);
    expect(postRestartState.customerPresent).toBe(true);

    const serverOperationAfterRestart = await prisma.syncOperation.findFirst({
      where: { tenantId, branchId, operationId },
      select: { operationId: true, idempotencyKey: true, status: true, processedAt: true, deviceId: true },
    });
    expect(serverOperationAfterRestart?.status).toBe('PROCESSED');
    expect(serverOperationAfterRestart?.idempotencyKey).toBe(idempotencyKey);
    expect(serverOperationAfterRestart?.deviceId).toBe(deviceId);
    expect(serverOperationAfterRestart?.processedAt).not.toBeNull();

    const serverCustomerAfterRestart = await prisma.customer.findUnique({ where: { id: customerId } });
    expect(serverCustomerAfterRestart?.id).toBe(customerId);
    expect(serverCustomerAfterRestart?.status).toBe('ACTIVE');

    await expect.poll(
      async () => restartPushRequests.length,
      { timeout: 15000, intervals: [250, 500, 1000] },
    ).toBe(1);
    await expect.poll(
      async () => restartPushResponses.length,
      { timeout: 15000, intervals: [250, 500, 1000] },
    ).toBe(1);
    expect(restartPushResponses[0]).toBe(200);

    const evidence = {
      status: 'PASS',
      test: 'crash-restart-inflight-outbox-exactly-once',
      appUrl: APP_URL,
      browserEngine: 'Chromium',
      transportPath: 'Chromium persistent profile -> atomic IndexedDB outbox -> in-flight /sync/push -> PostgreSQL -> crash before ACK -> same profile restart -> retry/idempotency -> IndexedDB SYNCED',
      tenantId,
      branchId,
      deviceId,
      customerId,
      operationId,
      idempotencyKey,
      crashWindow: {
        routeEntered,
        serverResponseFetched: serverResponse !== null,
        serverCommittedBeforeCrash: serverOperationBeforeCrash?.status === 'PROCESSED',
        outboxPendingBeforeCrash: preCrashState.outboxStatus === 'PENDING',
        browserProfileRestarted: true,
        crashMethod: 'Chromium CDP Browser.crash',
      },
      recovery: {
        outboxSyncedAfterRestart: postRestartState.outboxStatus === 'SYNCED',
        pendingOutboxAfterRestart: postRestartState.outboxCount,
        customerPresentAfterRestart: postRestartState.customerPresent,
        serverOperationCount: 1,
        syncJournalRowsForEntity: journalRows.length,
        duplicateJournalRows: journalRows.length - 1,
        restartPushRequests: restartPushRequests.length,
        restartPushResponses: restartPushResponses.length,
        restartPushHttpStatus: restartPushResponses[0] ?? null,
      },
      exactlyOnce: {
        singleSyncOperation: true,
        singleCreateJournalRevision: journalRows.length === 1,
        serverRecordPresentOnce: serverCustomerAfterRestart?.id === customerId,
        idempotencyKeyPreserved: serverOperationAfterRestart?.idempotencyKey === idempotencyKey,
      },
      timestamp: new Date().toISOString(),
    };
    await fs.promises.mkdir('artifacts/release-evidence', { recursive: true });
    await fs.promises.writeFile(
      'artifacts/release-evidence/kwakopos-crash-restart-inflight-outbox.json',
      JSON.stringify(evidence, null, 2),
      'utf8',
    );
  } finally {
    releaseRoute.resolve();
    await restartedContext?.close();
    await context?.close();
    await prisma.$executeRawUnsafe('DELETE FROM sync_change_journal WHERE tenant_id = $1', tenantId);
    await prisma.$executeRawUnsafe('DELETE FROM sync_conflict_record WHERE tenant_id = $1', tenantId);
    await prisma.syncOperation.deleteMany({ where: { tenantId } });
    await prisma.deviceSession.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await fs.promises.rm(userDataDir, { recursive: true, force: true });
  }
});
