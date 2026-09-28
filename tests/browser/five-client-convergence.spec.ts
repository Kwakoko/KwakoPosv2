import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { prisma } from "@kwakopos2/database";
import { generateAccessToken } from "@kwakopos2/auth";

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");

type ClientState = {
  deviceId: string;
  productCount: number;
  variantCount: number;
  customerCount: number;
  ledgerCount: number;
  pendingCount: number;
  failedCount: number;
  variantStock: number;
  ledgerQuantity: number;
  lastSyncRevision: string;
  syncEpoch: string;
};

async function readClientState(page: Page, tenantId: string, branchId: string, productId?: string): Promise<ClientState> {
  return page.evaluate(async ({ tenantId, branchId, productId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("kwakopos-v2");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const names = ["products", "productVariants", "stockLedger", "syncOutbox", "customers"];
    const values = await Promise.all(names.map((name) => new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(name, "readonly");
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })));
    db.close();
    const [products, variants, ledger, outbox, customers] = values;
    const own = (row: any) => row?.tenantId === tenantId;
    const metadataDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("kwakopos-v2");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const metadataValues = await Promise.all([
      new Promise<any>((resolve, reject) => {
        const tx = metadataDb.transaction("syncMetadata", "readonly");
        const req = tx.objectStore("syncMetadata").get(`syncScope:${tenantId}:${branchId}:lastSyncRevision`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
      new Promise<any>((resolve, reject) => {
        const tx = metadataDb.transaction("syncMetadata", "readonly");
        const req = tx.objectStore("syncMetadata").get(`syncScope:${tenantId}:${branchId}:syncEpoch`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
    ]);
    metadataDb.close();

    const matchingVariants = variants.filter((row) =>
      own(row) &&
      row.branchId === branchId &&
      (!productId || row.productId === productId),
    );
    const matchingLedger = ledger.filter((row) =>
      own(row) &&
      row.branchId === branchId &&
      (!productId || row.productId === productId),
    );
    const deviceId = String(localStorage.getItem("kwakopos:v2:device-id") ?? "");
    return {
      deviceId,
      productCount: products.filter((row) => own(row) && (!productId || row.id === productId)).length,
      variantCount: matchingVariants.length,
      customerCount: customers.filter((row) => own(row) && row.branchId === branchId).length,
      ledgerCount: matchingLedger.length,
      pendingCount: outbox.filter((row) => own(row) && row.status === "PENDING").length,
      failedCount: outbox.filter((row) => own(row) && row.status === "FAILED").length,
      variantStock: matchingVariants.reduce((sum, row) => sum + Number(row.inventoryQuantity ?? row.stock ?? 0), 0),
      ledgerQuantity: matchingLedger.reduce((sum, row) => sum + Number(row.quantityChange ?? row.quantity ?? 0), 0),
      lastSyncRevision: String(metadataValues[0] ?? "0"),
      syncEpoch: String(metadataValues[1] ?? ""),
    };
  }, { tenantId, branchId, productId });
}

test("five independent browser clients converge through IndexedDB + PostgreSQL", async ({ browser }) => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  let categoryId = randomUUID();
  const userId = randomUUID();
  const email = `convergence-${tenantId.slice(0, 8)}@kwakopos.test`;

  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const deviceIds = ["DEVICE-A", "DEVICE-B", "DEVICE-C", "DEVICE-D", "DEVICE-E"] as const;
  const sessions: Array<{ accessToken: string; session: any }> = [];
  let runtimeIdentity: { version: string; gitSha: string; containerDigest?: string; cloudRunRevision?: string } | null = null;
  try {
    const versionResponse = await fetch(`${APP_URL}/version`);
    expect(versionResponse.ok).toBe(true);
    const versionEnvelope: any = await versionResponse.json();
    runtimeIdentity = {
      version: String(versionEnvelope?.version ?? versionEnvelope?.appVersion ?? ""),
      gitSha: String(versionEnvelope?.gitSha ?? ""),
      containerDigest: versionEnvelope?.containerDigest ? String(versionEnvelope.containerDigest) : undefined,
      cloudRunRevision: versionEnvelope?.cloudRunRevision ? String(versionEnvelope.cloudRunRevision) : undefined,
    };
    expect(runtimeIdentity.version).toBe("2.13.0");
    expect(runtimeIdentity.gitSha).toMatch(/^[0-9a-f]{40}$/i);

    await prisma.tenant.create({
      data: { id: tenantId, name: "Five Client Convergence Tenant", slug: `conv-${tenantId.slice(0, 18)}` },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: `CONV-${branchId.slice(0, 8)}` },
    });
    for (const deviceId of deviceIds) {
      const accessToken = generateAccessToken({
        userId,
        tenantId,
        branchId,
        email,
        roles: ["ADMIN"],
        permissions: ["*"],
        deviceId,
      });
      sessions.push({
        accessToken,
        session: {
          sessionId: "pw-session-" + tenantId + "-" + deviceId,
          accessToken,
          user: { id: userId, name: "Convergence Admin", email, role: "ADMIN", tenantId, branchId },
        },
      });
    }

    const acceptance = await fetch(`${APP_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessions[0].accessToken}` },
    });
    expect(acceptance.ok).toBe(true);

    for (let i = 0; i < 5; i += 1) {
      const context = await browser.newContext();
      await context.addInitScript(({ session, deviceId }) => {
        localStorage.setItem("kwakopos:v2:session", JSON.stringify(session));
        localStorage.setItem("kwakopos:v2:device-id", deviceId);
        // Keep each isolated certification context foreground-visible so the normal
        // 30s production convergence heartbeat is exercised deterministically.
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      }, { session: sessions[i].session, deviceId: deviceIds[i] });
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (/SYNC|sync|IndexedDB|PWA|bootstrap/i.test(msg.text())) {
          console.log(`[CLIENT-${i + 1}] console ${msg.type()}: ${msg.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        console.log(`[CLIENT-${i + 1}] pageerror: ${error.message}`);
      });
      page.on("request", (request) => {
        if (/\/sync\//.test(request.url())) console.log(`[CLIENT-${i + 1}] > ${request.method()} ${request.url()}`);
      });
      page.on("response", async (response) => {
        if (/\/sync\//.test(response.url())) {
          let body = "";
          try { body = (await response.text()).slice(0, 1200); } catch {}
          console.log(`[CLIENT-${i + 1}] < ${response.status()} ${response.url()} ${body}`);
        }
      });
      contexts.push(context);
      pages.push(page);
      await page.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/inventory/);
      await expect(page.getByText("Inventory").first()).toBeVisible({ timeout: 15000 });
    }

    const initialStates = await Promise.all(
      pages.map((page) => readClientState(page, tenantId, branchId)),
    );
    expect(initialStates.map((state) => state.deviceId)).toEqual([...deviceIds]);
    expect(new Set(initialStates.map((state) => state.deviceId)).size).toBe(deviceIds.length);

    // Prove the identity is durable across a real browser reload.
    for (const [index, page] of pages.entries()) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("Inventory").first()).toBeVisible({ timeout: 15000 });
      const state = await readClientState(page, tenantId, branchId);
      expect(state.deviceId).toBe(deviceIds[index]);
    }

    // Each independent device submits one real business mutation using its own
    // durable identity. PostgreSQL must therefore record DEVICE-A through DEVICE-E.
    const deviceCustomerIds = deviceIds.map(() => randomUUID());
    await Promise.all(
      pages.map(async (page, index) => {
        const operationId = randomUUID();
        const customerId = deviceCustomerIds[index];
        const result = await page.evaluate(
          async ({ accessToken, deviceId, operationId, customerId, tenantId, branchId }) => {
            const body = {
              deviceId,
              operations: [{
                operationId,
                entityType: "Customer",
                entityId: customerId,
                operationType: "CREATE",
                payload: {
                  id: customerId,
                  customerCode: "CERT-" + deviceId + "-" + customerId.slice(0, 8),
                  name: "Certification " + deviceId,
                  email: deviceId.toLowerCase() + "-" + customerId.slice(0, 8) + "@kwakopos.test",
                },
                clientCreatedAt: new Date().toISOString(),
                idempotencyKey: "DEVICE-CERT-" + deviceId + "-" + operationId,
              }],
            };
            const response = await fetch("/sync/push", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + accessToken,
                "x-tenant-id": tenantId,
                "x-branch-id": branchId,
              },
              credentials: "include",
              body: JSON.stringify(body),
            });
            return { status: response.status, body: await response.json() };
          },
          {
            accessToken: sessions[index].accessToken,
            deviceId: deviceIds[index],
            operationId,
            customerId,
            tenantId,
            branchId,
          },
        );
        expect(result.status).toBe(200);
        const data = result.body?.data ?? result.body;
        expect(data.processedCount).toBe(1);
        expect(data.results?.[0]?.status).toBe("SUCCESS");
      }),
    );

    const deviceSyncOperations = await prisma.syncOperation.findMany({
      where: { tenantId, branchId, operationType: "CREATE", entityType: "Customer" },
      select: { deviceId: true, operationId: true, entityId: true },
      orderBy: { createdAt: "asc" },
    });
    expect(deviceSyncOperations).toHaveLength(5);
    expect(new Set(deviceSyncOperations.map((row) => row.deviceId))).toEqual(new Set(deviceIds));
    expect(new Set(deviceSyncOperations.map((row) => row.entityId))).toEqual(new Set(deviceCustomerIds));

    const pageA = pages[0];

    // Master data must enter through the same real browser -> IndexedDB -> outbox -> API -> PostgreSQL path.
    // Do not seed Category directly in PostgreSQL; that bypasses the production browser path.
    await pageA.getByRole("button", { name: "Categories & Brands", exact: true }).click();
    await pageA.getByRole("button", { name: "Add Category", exact: true }).click();
    const categoryDialog = pageA.locator('input[placeholder="e.g. Frozen Foods, Dairy, Beverages..."]').locator("..").locator("..");
    await categoryDialog.locator('input[placeholder="e.g. Frozen Foods, Dairy, Beverages..."]').fill("Convergence Test");
    await categoryDialog.getByRole("button", { name: "Save Category", exact: true }).click();
    await expect(pageA.getByText("Convergence Test", { exact: true }).first()).toBeVisible({ timeout: 15000 });
    await expect.poll(
      async () => (await readClientState(pageA, tenantId, branchId)).pendingCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(0);
    const persistedCategory = await prisma.category.findFirst({
      where: { tenantId, branchId, name: "Convergence Test" },
      select: { id: true },
    });
    expect(persistedCategory?.id).toBeTruthy();
    categoryId = persistedCategory!.id;

    await pageA.getByRole("button", { name: "Overview", exact: true }).click();

    await pageA.evaluate(() => {
      (window as any).__kwakoOutboxEnqueueEvents = [];
      window.addEventListener("kwakopos:outbox-enqueued", (event: any) => {
        const items = Array.isArray(event?.detail?.items)
          ? event.detail.items
          : event?.detail?.item
            ? [event.detail.item]
            : [];
        for (const item of items) {
          (window as any).__kwakoOutboxEnqueueEvents.push({
            id: item?.id || item?.operationId || "",
            entityType: item?.entityType || "",
          });
        }
      });
    });
    await pageA.getByRole("button", { name: /^Add Product$/ }).click();
    const dialog = pageA.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Product Registration Wizard" })).toBeVisible();

    const firstInput = dialog.locator("input").first();
    await firstInput.fill("Five Client Convergence Product");
    await dialog.locator("select").first().selectOption({ label: "Convergence Test" });
    await dialog.getByRole("button", { name: "Continue" }).click();

    const commercialNumbers = dialog.locator('input[type="number"]');
    await commercialNumbers.nth(0).fill("1000");
    await commercialNumbers.nth(1).fill("1500");
    await dialog.getByRole("button", { name: "Continue" }).click();

    const inventoryNumbers = dialog.locator('input[type="number"]');
    await inventoryNumbers.nth(0).fill("10");
    await inventoryNumbers.nth(1).fill("25");
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();

    await expect(dialog.getByText("All 5 validation gates certified. Ready to persist locally and enqueue for sync.")).toBeVisible();
    await dialog.getByRole("button", { name: "Register Product" }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    await expect(pageA.getByText("Five Client Convergence Product").first()).toBeVisible({ timeout: 20000 });
    const outboxEnqueueEvents: Array<{ id: string; entityType: string }> = await pageA.evaluate(() =>
      (window as any).__kwakoOutboxEnqueueEvents || []
    );
    expect(outboxEnqueueEvents.length).toBeGreaterThanOrEqual(3);
    expect(new Set(outboxEnqueueEvents.map((event) => event.entityType))).toEqual(
      new Set(["Product", "ProductVariant", "StockAdjustment"]),
    );

    await expect.poll(
      async () => (await readClientState(pageA, tenantId, branchId)).pendingCount,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(0);

    const serverProduct = await prisma.product.findFirst({
      where: { tenantId, branchId, name: "Five Client Convergence Product" },
      include: { variants: true },
    });
    expect(serverProduct).toBeTruthy();
    expect(serverProduct!.variants.length).toBe(1);

    const productId = serverProduct!.id;
    const variantId = serverProduct!.variants[0].id;
    const serverLedger = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId } });
    const serverAdjustments = await prisma.stockAdjustment.findMany({ where: { tenantId, branchId, variantId } });
    expect(serverLedger.length).toBe(1);
    expect(serverAdjustments.length).toBe(1);
    expect(Number(serverLedger[0].quantityChange)).toBe(25);
    expect(Number(serverAdjustments[0].quantityChange)).toBe(25);

    // The database journal is part of the convergence contract: every pushed
    // operation must atomically leave its command journal entry, and every
    // immutable StockLedger movement generated by an adjustment must also be
    // independently replayable by downstream replicas.
    const journalRows = await prisma.$queryRawUnsafe<Array<{
      revision: bigint | number | string;
      operation_id: string;
      entity_type: string;
      entity_id: string;
      operation_type: string;
      source: string;
    }>>(
      `SELECT revision, operation_id, entity_type, entity_id, operation_type, source
         FROM sync_change_journal
        WHERE tenant_id = $1 AND branch_id = $2
        ORDER BY revision ASC`,
      tenantId,
      branchId,
    );
    expect(journalRows).toHaveLength(10);
    expect(journalRows.filter((row) => row.entity_type === "Customer")).toHaveLength(5);
    expect(journalRows.filter((row) => row.entity_type === "Product")).toHaveLength(1);
    expect(journalRows.filter((row) => row.entity_type === "ProductVariant")).toHaveLength(1);
    expect(journalRows.filter((row) => row.entity_type === "StockAdjustment")).toHaveLength(1);
    expect(journalRows.filter((row) => row.entity_type === "StockLedger")).toHaveLength(1);
    const stockAdjustmentOperationId = journalRows.find((row) => row.entity_type === "StockAdjustment")?.operation_id;
    const stockLedgerOperationId = journalRows.find((row) => row.entity_type === "StockLedger")?.operation_id;
    expect(stockLedgerOperationId).toMatch(new RegExp(`^${stockAdjustmentOperationId}:ledger:`));
    expect(journalRows.every((row) => row.source === "push")).toBe(true);
    expect(journalRows.every((row, index) => index === 0 || BigInt(row.revision) > BigInt(journalRows[index - 1].revision))).toBe(true);

    const syncOperations = await prisma.syncOperation.count({ where: { tenantId, branchId, status: "PROCESSED" } });
    expect(syncOperations).toBe(9);
    const outboxOperationIds = outboxEnqueueEvents.map((event) => event.id).filter(Boolean);
    const serverOperationsForOutbox = await prisma.syncOperation.findMany({
      where: { tenantId, branchId, operationId: { in: outboxOperationIds } },
      select: { operationId: true, entityType: true, status: true },
    });
    expect(serverOperationsForOutbox).toHaveLength(outboxOperationIds.length);
    expect(serverOperationsForOutbox.every((operation) => operation.status === "PROCESSED")).toBe(true);

    const headResponse = await fetch(`${APP_URL}/sync/delta?since=rev:0`, {
      headers: { authorization: `Bearer ${sessions[0].accessToken}` },
    });
    expect(headResponse.ok).toBe(true);
    const headEnvelope: any = await headResponse.json();
    const headData = headEnvelope?.data ?? headEnvelope;
    const serverHeadRevision = String(headData?.serverRevision ?? headData?.serverHeadRevision ?? "0");
    const serverSyncEpoch = String(headData?.syncEpoch ?? "");
    expect(serverHeadRevision).toBe(String(journalRows[journalRows.length - 1].revision));
    expect(serverSyncEpoch).not.toBe("");

    // Invoke the production context sync path in every Chromium context.
    // This calls syncOutbox() on the mounted application provider; no network/API
    // mock or direct IndexedDB mutation is used.
    await Promise.all(pages.map((page) => page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        window.dispatchEvent(new CustomEvent("kwakopos:context-sync-now", {
          detail: { onComplete: () => resolve(), onError: (error: unknown) => reject(error) },
        }));
      });
    })));

    const clientCursors: string[] = [];
    for (const [index, page] of pages.entries()) {
      await expect.poll(
        async () => {
          const state = await readClientState(page, tenantId, branchId, productId);
          return JSON.stringify(state);
        },
        { timeout: 45000, intervals: [500, 1000, 2000, 5000], message: `client ${index + 1} did not converge` },
      ).toBe(JSON.stringify({
        deviceId: deviceIds[index],
        productCount: 1,
        variantCount: 1,
        customerCount: 5,
        ledgerCount: 1,
        pendingCount: 0,
        failedCount: 0,
        variantStock: 25,
        ledgerQuantity: 25,
        lastSyncRevision: serverHeadRevision,
        syncEpoch: serverSyncEpoch,
      }));
      const state = await readClientState(page, tenantId, branchId, productId);
      clientCursors.push(state.lastSyncRevision);
      await page.getByRole("button", { name: "SKU Catalog & Valuation" }).click();
      await expect(page.getByText("Five Client Convergence Product").first()).toBeVisible({ timeout: 15000 });
    }

    const finalStates = await Promise.all(pages.map((page) => readClientState(page, tenantId, branchId, productId)));
    expect(finalStates).toHaveLength(5);
    expect(clientCursors).toEqual(Array.from({ length: 5 }, () => serverHeadRevision));
    for (const [index, state] of finalStates.entries()) {
      expect(state.deviceId).toBe(deviceIds[index]);
      expect(state.productCount).toBe(1);
      expect(state.variantCount).toBe(1);
      expect(state.customerCount).toBe(5);
      expect(state.ledgerCount).toBe(1);
      expect(state.pendingCount).toBe(0);
      expect(state.failedCount).toBe(0);
      expect(state.variantStock).toBe(25);
      expect(state.ledgerQuantity).toBe(25);
      expect(state.lastSyncRevision).toBe(serverHeadRevision);
      expect(state.syncEpoch).toBe(serverSyncEpoch);
    }

    const evidence = {
      status: "PASS",
      test: "five-independent-browser-storage-context-convergence",
      appUrl: APP_URL,
      browserEngine: "Chromium",
      clients: 5,
      deviceIds: [...deviceIds],
      transportPath: "Chromium -> IndexedDB -> durable syncOutbox -> localhost:3000 -> API -> Prisma -> PostgreSQL -> sync_change_journal -> /sync/delta -> IndexedDB",
      outbox: {
        atomicEnqueueEvents: outboxEnqueueEvents,
        outboxEntityTypes: outboxEnqueueEvents.map((event) => event.entityType),
        committedServerOperationIds: serverOperationsForOutbox.map((operation) => operation.operationId),
        durableOutboxDrained: finalStates.every((state) => state.pendingCount === 0 && state.failedCount === 0),
      },
      runtimeIdentity,
      tenantId,
      branchId,
      productId,
      variantId,
      authoritativePostgres: {
        products: 1,
        productVariants: 1,
        stockLedger: 1,
        stockAdjustments: 1,
        openingStock: 25,
        syncOperationsProcessed: syncOperations,
        independentDeviceSyncOperations: deviceSyncOperations.length,
        independentDeviceIds: [...new Set(deviceSyncOperations.map((row) => row.deviceId))],
        syncJournalRows: journalRows.length,
        journalRevisions: journalRows.map((row) => String(row.revision)),
        serverHeadRevision,
        syncEpoch: serverSyncEpoch,
      },
      indexedDbConvergence: {
        clientCount: finalStates.length,
        deviceIds: finalStates.map((state) => state.deviceId),
        allDeviceIdsUnique: new Set(finalStates.map((state) => state.deviceId)).size === finalStates.length,
        clientCursors,
        allCursorsAtServerHead: clientCursors.every((cursor) => cursor === serverHeadRevision),
        allSameSyncEpoch: finalStates.every((state) => state.syncEpoch === serverSyncEpoch),
        eachVariantStock: finalStates.map((state) => state.variantStock),
        eachLedgerQuantity: finalStates.map((state) => state.ledgerQuantity),
        eachCustomerCount: finalStates.map((state) => state.customerCount),
        pendingOutboxPerClient: finalStates.map((state) => state.pendingCount),
        failedOutboxPerClient: finalStates.map((state) => state.failedCount),
      },
      clientsConverged: finalStates.every((state) =>
        deviceIds.includes(state.deviceId as typeof deviceIds[number]) &&
        state.productCount === 1 &&
        state.variantCount === 1 &&
        state.customerCount === 5 &&
        state.ledgerCount === 1 &&
        state.pendingCount === 0 &&
        state.failedCount === 0 &&
        state.variantStock === 25 &&
        state.ledgerQuantity === 25 &&
        state.lastSyncRevision === serverHeadRevision &&
        state.syncEpoch === serverSyncEpoch,
      ),
      timestamp: new Date().toISOString(),
    };
    const evidenceDir = "artifacts/release-evidence";
    await fs.promises.mkdir(evidenceDir, { recursive: true });
    await fs.promises.writeFile(
      `${evidenceDir}/kwakopos-five-client-convergence.json`,
      JSON.stringify(evidence, null, 2),
      "utf8",
    );
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    // sync_change_journal and sync_conflict_record are intentionally raw
    // infrastructure tables, so their test rows must be purged explicitly;
    // otherwise a passing fixture can leak tenant data into later certification runs.
    await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId);
    await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId);
    await prisma.productPriceHistory.deleteMany({ where: { tenantId } });
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.stockAdjustment.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.productVariant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.category.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});
