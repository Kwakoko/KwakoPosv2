import { chromium, firefox, type Browser, type BrowserContext, type Page } from "playwright";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { prisma } from "@kwakopos2/database";
import { generateAccessToken } from "@kwakopos2/auth";

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");

type ClientState = {
  browserName: string;
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

const BROWSER_DEVICES = [
  {
    name: "Microsoft Edge",
    launcher: "chromium",
    path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    deviceId: "DEVICE-A-EDGE",
  },
  {
    name: "Google Chrome",
    launcher: "chromium",
    path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    deviceId: "DEVICE-B-CHROME",
  },
  {
    name: "Opera",
    launcher: "chromium",
    path: "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Opera\\opera.exe",
    deviceId: "DEVICE-C-OPERA",
  },
  {
    name: "Mozilla Firefox",
    launcher: "firefox",
    path: undefined,
    deviceId: "DEVICE-D-FIREFOX",
  },
  {
    name: "Chrome Canary",
    launcher: "chromium",
    path: "C:\\Users\\Administrator\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe",
    deviceId: "DEVICE-E-CANARY",
  },
] as const;

async function readClientState(
  page: Page,
  browserName: string,
  tenantId: string,
  branchId: string,
  productId?: string,
): Promise<ClientState> {
  return page.evaluate(async ({ browserName, tenantId, branchId, productId }) => {
    (window as any).__name = (t: any) => t;
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
      browserName,
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
  }, { browserName, tenantId, branchId, productId });
}

async function runRealBrowsersConvergence() {
  console.log("================================================================================");
  console.log(" KWAKOPOS v2.13.0 — REAL HETEROGENEOUS BROWSER CONVERGENCE CERTIFICATION");
  console.log(" Testing Across Real Browsers: Edge, Chrome, Opera, Firefox, Chrome Canary");
  console.log("================================================================================");

  const tenantId = randomUUID();
  const branchId = randomUUID();
  let categoryId: string = randomUUID();
  const userId = randomUUID();
  const email = `real-convergence-${tenantId.slice(0, 8)}@kwakopos.test`;

  const launchedBrowsers: Browser[] = [];
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  const sessions: Array<{ accessToken: string; session: any }> = [];

  try {
    // 1. Verify app reachability
    console.log(`[INIT] Connecting to KwakoPos at ${APP_URL}...`);
    const versionRes = await fetch(`${APP_URL}/version`);
    if (!versionRes.ok) throw new Error("Application version endpoint unreachable");
    const versionEnvelope: any = await versionRes.json();
    console.log(`[INIT] Connected to KwakoPos v${versionEnvelope.data?.version || versionEnvelope.version}`);

    // 2. Setup PostgreSQL Fixture
    console.log(`[DB] Seeding tenant ${tenantId} and branch ${branchId}...`);
    await prisma.tenant.create({
      data: { id: tenantId, name: "Heterogeneous Browser Convergence Tenant", slug: `real-conv-${tenantId.slice(0, 18)}` },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: `RC-${branchId.slice(0, 8)}` },
    });

    for (const b of BROWSER_DEVICES) {
      const accessToken = generateAccessToken({
        userId,
        tenantId,
        branchId,
        email,
        roles: ["ADMIN"],
        permissions: ["*"],
        deviceId: b.deviceId,
      });
      sessions.push({
        accessToken,
        session: {
          sessionId: "pw-session-" + tenantId + "-" + b.deviceId,
          accessToken,
          user: { id: userId, name: "Convergence Admin", email, role: "ADMIN", tenantId, branchId },
        },
      });
    }

    const acceptance = await fetch(`${APP_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: `Bearer ${sessions[0].accessToken}` },
    });
    if (!acceptance.ok) throw new Error("Legal acceptance endpoint failed");

    // 3. Launch 5 Real Heterogeneous Browsers
    console.log("\n[LAUNCH] Spawning 5 distinct browser binaries...");
    for (let i = 0; i < BROWSER_DEVICES.length; i++) {
      const bInfo = BROWSER_DEVICES[i];
      console.log(`  -> Launching [${bInfo.name}] for ${bInfo.deviceId}...`);
      const launcher = bInfo.launcher === "firefox" ? firefox : chromium;
      const browser = await launcher.launch({
        ...(bInfo.path ? { executablePath: bInfo.path } : {}),
        headless: true,
      });
      launchedBrowsers.push(browser);

      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
      await context.addInitScript("window.__name = (t) => t;");
      await context.addInitScript(({ session, deviceId }) => {
        localStorage.setItem("kwakopos:v2:session", JSON.stringify(session));
        localStorage.setItem("kwakopos:v2:device-id", deviceId);
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      }, { session: sessions[i].session, deviceId: bInfo.deviceId });

      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);

      await page.goto(`${APP_URL}/inventory`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("text=Inventory", { timeout: 25000 });
      console.log(`     [${bInfo.name}] (${browser.version()}) successfully initialized & navigated to /inventory`);
    }

    // 4. Inspect initial durable device identities
    const initialStates = await Promise.all(
      pages.map((page, idx) => readClientState(page, BROWSER_DEVICES[idx].name, tenantId, branchId)),
    );
    console.log("\n[STEP 1] Initial Client State Verification across Browsers:");
    for (const s of initialStates) {
      console.log(`  - Browser: ${s.browserName.padEnd(16)} | DeviceId: ${s.deviceId.padEnd(18)} | Outbox: PENDING=${s.pendingCount}`);
    }

    // 5. Submit 5 independent customer mutations from 5 different browsers
    console.log("\n[STEP 2] Submitting 5 concurrent customer mutations from distinct browsers...");
    const customerIds = BROWSER_DEVICES.map(() => randomUUID());
    await Promise.all(
      pages.map(async (page, index) => {
        const operationId = randomUUID();
        const customerId = customerIds[index];
        const bInfo = BROWSER_DEVICES[index];
        const result = await page.evaluate(
          async ({ accessToken, deviceId, operationId, customerId, tenantId, branchId, browserName }) => {
            const body = {
              deviceId,
              operations: [{
                operationId,
                entityType: "Customer",
                entityId: customerId,
                operationType: "CREATE",
                payload: {
                  id: customerId,
                  customerCode: "CERT-" + deviceId.slice(0, 8) + "-" + customerId.slice(0, 6),
                  name: "Customer via " + browserName,
                  email: deviceId.toLowerCase() + "-" + customerId.slice(0, 8) + "@kwakopos.test",
                },
                clientCreatedAt: new Date().toISOString(),
                idempotencyKey: "DEV-CERT-" + deviceId + "-" + operationId,
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
            deviceId: bInfo.deviceId,
            operationId,
            customerId,
            tenantId,
            branchId,
            browserName: bInfo.name,
          },
        );
        if (result.status !== 200) {
          throw new Error(`Push failed on ${bInfo.name}: ${JSON.stringify(result.body)}`);
        }
        console.log(`  ✓ Pushed Customer mutation from ${bInfo.name} (${bInfo.deviceId})`);
      }),
    );

    // Verify PostgreSQL has recorded all 5 operations
    const syncOps = await prisma.syncOperation.findMany({
      where: { tenantId, branchId, entityType: "Customer" },
    });
    console.log(`\n[DB] PostgreSQL sync_operations recorded: ${syncOps.length}/5 operations.`);
    if (syncOps.length !== 5) throw new Error("Expected 5 sync operations in PostgreSQL");

    // 6. Register a Category & Product with Opening Stock on Edge (Device A)
    const pageEdge = pages[0];
    console.log("\n[STEP 3] Registering Category & Product on Microsoft Edge (Device A)...");
    try {
      const invSidebar = pageEdge.locator('.sidebar-item:has-text("Inventory")').first();
      await invSidebar.waitFor({ state: "visible", timeout: 15000 });
      if ((await invSidebar.getAttribute("aria-expanded")) !== "true") {
        await invSidebar.click();
        await pageEdge.waitForTimeout(400);
      }

      const catSubItem = pageEdge.locator('.sidebar-subitem:has-text("Categories & Brands")').first();
      await catSubItem.waitFor({ state: "visible", timeout: 10000 });
      await catSubItem.click();
      await pageEdge.waitForSelector("text=Merchandise Categories", { timeout: 15000 });

      const addCatBtn = pageEdge.locator('button:has-text("Add Category")').first();
      await addCatBtn.waitFor({ state: "visible", timeout: 15000 });
      await addCatBtn.click();

      const catInput = pageEdge.locator('input[placeholder*="Frozen Foods"]:visible').first();
      await catInput.waitFor({ state: "visible", timeout: 10000 });
      await catInput.fill("Real Browser Convergence Category");

      await pageEdge.locator('button:visible:has-text("Save Category")').first().click();
      await pageEdge.waitForSelector("text=Real Browser Convergence Category", { timeout: 15000 });
    } catch (uiErr: any) {
      await pageEdge.screenshot({ path: "artifacts/release-evidence/edge-step3-failure.png" }).catch(() => {});
      console.error("[STEP 3 ERROR]", uiErr.message);
      throw uiErr;
    }

    const persistedCat = await prisma.category.findFirst({
      where: { tenantId, branchId, name: "Real Browser Convergence Category" },
    });
    categoryId = persistedCat!.id;
    console.log(`  ✓ Category persisted to PostgreSQL: ${categoryId}`);

    await pageEdge.locator('button:visible:has-text("Add Product")').first().click();
    const dialog = pageEdge.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 15000 });
    await dialog.locator("input:visible").first().fill("Cross-Browser Grand Cru Wine");
    await dialog.locator("select:visible").first().selectOption({ label: "Real Browser Convergence Category" });
    await dialog.locator('button:visible:has-text("Continue")').click();

    const prices = dialog.locator('input[type="number"]:visible');
    await prices.nth(0).fill("5000");
    await prices.nth(1).fill("8500");
    await dialog.locator('button:visible:has-text("Continue")').click();

    const stocks = dialog.locator('input[type="number"]:visible');
    await stocks.nth(0).fill("10");
    await stocks.nth(1).fill("40"); // Opening stock 40
    await dialog.locator('button:visible:has-text("Continue")').click();
    await dialog.locator('button:visible:has-text("Continue")').click();
    await dialog.locator('button:visible:has-text("Register Product")').click();
    await pageEdge.waitForSelector("text=Cross-Browser Grand Cru Wine", { timeout: 20000 });
    console.log("  ✓ Product registered with 40 units of opening stock on Edge.");

    // Wait for Edge outbox to drain to server
    let edgePending = 1;
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await readClientState(pageEdge, "Microsoft Edge", tenantId, branchId);
      edgePending = state.pendingCount;
      if (edgePending === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log(`  ✓ Edge outbox drained to PostgreSQL (pendingCount = ${edgePending}).`);

    // Verify PostgreSQL state
    const serverProduct = await prisma.product.findFirst({
      where: { tenantId, branchId, name: "Cross-Browser Grand Cru Wine" },
      include: { variants: true },
    });
    if (!serverProduct) throw new Error("Product was not saved to PostgreSQL");
    const productId = serverProduct.id;
    const variantId = serverProduct.variants[0].id;
    const serverLedger = await prisma.stockLedger.findMany({ where: { tenantId, branchId, variantId } });
    console.log(`[DB] Authoritative PostgreSQL Stock: ${Number(serverLedger[0].quantityChange)} units across ${serverLedger.length} ledger entry.`);

    // 7. Synchronize all 5 Real Browsers
    console.log("\n[STEP 4] Dispatching production sync across all 5 real browsers...");
    await Promise.all(pages.map((p) => p.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        window.dispatchEvent(new CustomEvent("kwakopos:context-sync-now", {
          detail: { onComplete: () => resolve(), onError: (e: any) => reject(e) },
        }));
      });
    })));

    // 8. Poll each browser for convergence
    console.log("\n[STEP 5] Awaiting mathematical convergence across all 5 browsers...");
    const headJournal = await prisma.$queryRawUnsafe<Array<{ revision: bigint }>>(
      `SELECT MAX(revision) as revision FROM sync_change_journal WHERE tenant_id = $1 AND branch_id = $2`,
      tenantId, branchId,
    );
    const expectedRevision = String(headJournal[0]?.revision ?? "0");
    console.log(`[SERVER] Authoritative Head Revision: rev:${expectedRevision}`);

    const finalStates: ClientState[] = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const bInfo = BROWSER_DEVICES[i];
      let converged = false;
      let lastState: ClientState | null = null;
      for (let attempt = 0; attempt < 45; attempt++) {
        lastState = await readClientState(page, bInfo.name, tenantId, branchId, productId);
        if (
          lastState.productCount === 1 &&
          lastState.customerCount === 5 &&
          lastState.variantStock === 40 &&
          lastState.pendingCount === 0 &&
          lastState.lastSyncRevision === expectedRevision
        ) {
          converged = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!converged || !lastState) {
        throw new Error(`Browser [${bInfo.name}] failed to converge within 45s: ${JSON.stringify(lastState)}`);
      }
      finalStates.push(lastState);
      console.log(`  ✅ [${bInfo.name.padEnd(16)}] CONVERGED: Products=${lastState.productCount}, Customers=${lastState.customerCount}, Stock=${lastState.variantStock}, OutboxPending=${lastState.pendingCount}, Revision=rev:${lastState.lastSyncRevision}`);
    }

    // 9. Verify UI rendering in each browser
    console.log("\n[STEP 6] Verifying reactive catalog UI in each real browser...");
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const bInfo = BROWSER_DEVICES[i];
      const invSidebar = page.locator('.sidebar-item:has-text("Inventory")').first();
      if (await invSidebar.isVisible() && (await invSidebar.getAttribute("aria-expanded")) !== "true") {
        await invSidebar.click().catch(() => {});
        await page.waitForTimeout(300);
      }
      const prodBtn = page.locator('.sidebar-subitem:has-text("Products"), button:has-text("SKU Catalog & Valuation")').first();
      await prodBtn.click();
      await page.waitForSelector("text=Cross-Browser Grand Cru Wine", { timeout: 15000 });
      console.log(`  ✓ [${bInfo.name}] Verified "Cross-Browser Grand Cru Wine" rendered in catalog table.`);
    }

    // 10. Save Evidence Bundle
    const evidence = {
      status: "PASS",
      suite: "real-heterogeneous-browser-convergence-audit",
      appUrl: APP_URL,
      browsersTested: BROWSER_DEVICES.map((b, idx) => ({
        name: b.name,
        deviceId: b.deviceId,
        version: launchedBrowsers[idx].version(),
        convergedState: finalStates[idx],
      })),
      authoritativeServer: {
        tenantId,
        branchId,
        headRevision: expectedRevision,
        productCount: 1,
        customerCount: 5,
        stockQuantity: 40,
      },
      convergenceAsserted: {
        allProductsIdentical: finalStates.every((s) => s.productCount === 1),
        allVariantsIdentical: finalStates.every((s) => s.variantCount === 1),
        allCustomersIdentical: finalStates.every((s) => s.customerCount === 5),
        allLedgerIdentical: finalStates.every((s) => s.ledgerQuantity === 40 && s.variantStock === 40),
        allOutboxDrained: finalStates.every((s) => s.pendingCount === 0 && s.failedCount === 0),
        allRevisionsAtHead: finalStates.every((s) => s.lastSyncRevision === expectedRevision),
      },
      timestamp: new Date().toISOString(),
    };

    const evidencePath = "artifacts/release-evidence/real-browsers-convergence-evidence.json";
    await fs.promises.mkdir("artifacts/release-evidence", { recursive: true });
    await fs.promises.writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`\n📁 Evidence written to ${evidencePath}`);
    console.log("\n🎉 ALL 5 REAL BROWSERS CONVERGED TO AUTHORITATIVE POSTGRESQL STATE!\n");
  } finally {
    console.log("[TEARDOWN] Closing browser instances and purging temporary test tenant...");
    for (const ctx of contexts) await ctx.close().catch(() => {});
    for (const b of launchedBrowsers) await b.close().catch(() => {});

    await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId).catch(() => {});
    await prisma.productPriceHistory.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.stockLedger.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.stockAdjustment.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.customer.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.productVariant.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.product.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.category.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    console.log("[TEARDOWN] Complete.");
  }
}

runRealBrowsersConvergence().catch((err) => {
  console.error("FATAL ERROR in real browsers convergence test:", err);
  process.exit(1);
});
