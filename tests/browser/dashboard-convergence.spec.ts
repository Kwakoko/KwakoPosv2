import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import { generateAccessToken, hashPassword } from "@kwakopos2/auth";

const APP_URL = (process.env.KWAKOPOS_LOCAL_URL || "http://127.0.0.1:5173").trim().replace(/\/$/, "");

type DashboardSnapshot = {
  asOfRevision: string;
  tenantId: string;
  branchId: string;
  salesToday: number;
  grossProfit: number;
  aov: number;
  todayOrderCount: number;
  completedOrders: number;
  inventoryValue: number;
  stockAlerts: number;
  lowStockCount: number;
  outOfStockCount: number;
  customerDebts: number;
  customerCount: number;
  productCount: number;
  supplierCount: number;
  kpis: Record<string, number | null>;
  analytics: {
    timeframe: "today" | "7d" | "30d" | "month";
    chartPoints: Array<{ name: string; fullLabel: string; Revenue: number; Profit: number; COGS: number; PriorRevenue: number; ordersCount: number; marginPct: string }>;
    totalRevenue: number;
    totalCOGS: number;
    totalProfit: number;
    marginPct: string;
    revenueDeltaPct: string | null;
    profitDeltaPct: string | null;
    priorTotalRevenue: number;
    peakHour: { hour: string; revenue: number; ordersCount: number } | null;
    paymentChannels: Array<{ name: string; volume: number; count: number; paymentCount: number; orderCount: number; volumeShare: number; countShare: number; aov: number }>;
    paymentTotalVolume: number;
    paymentTotalCount: number;
    paymentTotalOrderCount: number;
    paymentOverallAov: number;
    topProducts: Array<{ productId: string; name: string; revenue: number; units: number; stock: number; category: string; rank: number }>;
    topProductsTotalTracked: number;
  };
};

async function readDashboardSnapshot(page: Page, tenantId: string, branchId: string): Promise<DashboardSnapshot> {
  return page.evaluate(async ({ tenantId, branchId }) => {
    const raw = localStorage.getItem("kwakopos:v2:session");
    const session = raw ? JSON.parse(raw) : null;
    const response = await fetch("/api/v1/dashboard/kpis?timeframe=7d", {
      headers: {
        Authorization: "Bearer " + String(session?.accessToken || ""),
        "x-tenant-id": tenantId,
        "x-branch-id": branchId,
      },
      credentials: "include",
    });
    const body = await response.json();
    if (!response.ok || !body?.success || !body?.data) {
      throw new Error("Dashboard KPI snapshot unavailable: HTTP " + response.status);
    }
    return body.data as DashboardSnapshot;
  }, { tenantId, branchId });
}

async function readLocalSalesState(page: Page, tenantId: string, branchId: string) {
  return page.evaluate(async ({ tenantId, branchId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("kwakopos-v2");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const readAll = (store: string) => new Promise<any[]>((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    const [sales, outbox] = await Promise.all([readAll("sales"), readAll("syncOutbox")]);
    db.close();
    return {
      localSales: sales.filter((row) => row?.tenantId === tenantId && row?.branchId === branchId),
      pendingOutbox: outbox.filter((row) =>
        row?.tenantId === tenantId &&
        row?.branchId === branchId &&
        row?.status === "PENDING",
      ),
      pendingSaleOutbox: outbox.filter((row) =>
        row?.tenantId === tenantId &&
        row?.branchId === branchId &&
        row?.status === "PENDING" &&
        row?.entityType === "Sale",
      ),
    };
  }, { tenantId, branchId });
}

async function invokeProductionSync(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      window.dispatchEvent(new CustomEvent("kwakopos:context-sync-now", {
        detail: { onComplete: () => resolve(), onError: (error: unknown) => reject(error) },
      }));
    });
  });
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

async function readPostgresKpis(tenantId: string, branchId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{
    sales_today: unknown;
    gross_profit: unknown;
    order_count: bigint | number | string;
    completed_orders: bigint | number | string;
    inventory_value: unknown;
    low_stock: bigint | number | string;
    out_of_stock: bigint | number | string;
    customer_debts: unknown;
    customer_count: bigint | number | string;
    product_count: bigint | number | string;
    supplier_count: bigint | number | string;
  }>>(
    `SELECT
       COALESCE((SELECT SUM("grandTotal" - "taxTotal") FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'COMPLETED'
            AND "soldAt" >= CURRENT_DATE AND "soldAt" < CURRENT_DATE + INTERVAL '1 day'), 0) AS sales_today,
       COALESCE((SELECT SUM(("grandTotal" - "taxTotal") - "totalCost") FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'COMPLETED'
            AND "soldAt" >= CURRENT_DATE AND "soldAt" < CURRENT_DATE + INTERVAL '1 day'), 0) AS gross_profit,
       (SELECT COUNT(*) FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'COMPLETED'
            AND "soldAt" >= CURRENT_DATE AND "soldAt" < CURRENT_DATE + INTERVAL '1 day') AS order_count,
       (SELECT COUNT(*) FROM sales
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'COMPLETED'
            AND "soldAt" >= CURRENT_DATE AND "soldAt" < CURRENT_DATE + INTERVAL '1 day') AS completed_orders,
       (SELECT COALESCE(SUM("stockValue"), 0) FROM product_branch_stock
          WHERE "tenantId" = $1 AND "branchId" = $2) AS inventory_value,
       (SELECT COUNT(*) FROM product_branch_stock pbs
          JOIN product_variants pv ON pv."id" = pbs."variantId"
          AND pv."tenantId" = pbs."tenantId" AND pv."branchId" = pbs."branchId"
          WHERE pbs."tenantId" = $1 AND pbs."branchId" = $2
            AND pv."isActive" = TRUE AND pbs."currentQuantity" > 0
            AND pbs."currentQuantity" <= pv."reorderLevel") AS low_stock,
       (SELECT COUNT(*) FROM product_branch_stock pbs
          JOIN product_variants pv ON pv."id" = pbs."variantId"
          AND pv."tenantId" = pbs."tenantId" AND pv."branchId" = pbs."branchId"
          WHERE pbs."tenantId" = $1 AND pbs."branchId" = $2
            AND pv."isActive" = TRUE AND pbs."currentQuantity" <= 0) AS out_of_stock,
       (SELECT COALESCE(SUM("currentBalance"), 0) FROM customers
          WHERE "tenantId" = $1 AND "branchId" = $2) AS customer_debts,
       (SELECT COUNT(*) FROM customers
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'ACTIVE') AS customer_count,
       (SELECT COUNT(*) FROM products
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "isActive" = TRUE) AS product_count,
       (SELECT COUNT(*) FROM suppliers
          WHERE "tenantId" = $1 AND "branchId" = $2 AND "status" = 'ACTIVE') AS supplier_count`,
    tenantId,
    branchId,
  );
  const row = rows[0];
  const num = (value: unknown) => Number(value ?? 0);
  const orders = num(row.order_count);
  const salesToday = num(row.sales_today);
  const lowStockCount = num(row.low_stock);
  const outOfStockCount = num(row.out_of_stock);
  return {
    salesToday,
    grossProfit: num(row.gross_profit),
    aov: orders > 0 ? salesToday / orders : 0,
    todayOrderCount: orders,
    completedOrders: num(row.completed_orders),
    inventoryValue: num(row.inventory_value),
    stockAlerts: lowStockCount + outOfStockCount,
    lowStockCount,
    outOfStockCount,
    customerDebts: num(row.customer_debts),
    customerCount: num(row.customer_count),
    productCount: num(row.product_count),
    supplierCount: num(row.supplier_count),
  };
}

test("dashboard converges PostgreSQL -> Browser A/B/C and survives offline sale + logout/login", async ({ browser }) => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  const productId = randomUUID();
  const variantId = randomUUID();
  const email = `dashboard-convergence-${tenantId.slice(0, 8)}@kwakopos.test`;
  const password = "Dashboard-Convergence-Cert-2026!";
  const deviceIds = ["DEVICE-A", "DEVICE-B", "DEVICE-C"] as const;
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];

  try {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Dashboard Convergence Tenant", slug: `dash-${tenantId.slice(0, 18)}` },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Main", code: `DASH-${branchId.slice(0, 8)}` },
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
        name: "Dashboard Certification Admin",
        roleId,
        status: "ACTIVE",
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        tenantId,
        branchId,
        name: "Dashboard Convergence Product",
        sku: "DASH-CONV-001",
        category: "Certification",
        buyingPrice: 1000,
        sellingPrice: 1500,
        hasVariants: true,
        totalStock: 10,
        availableStock: 10,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: variantId,
        tenantId,
        branchId,
        productId,
        name: "Standard",
        sku: "DASH-CONV-001-STD",
        price: 1500,
        costPrice: 1000,
        inventoryQuantity: 10,
        reorderLevel: 2,
      },
    });
    await prisma.stockLedger.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        productId,
        variantId,
        movementType: "OPENING_STOCK",
        referenceType: "CERTIFICATION",
        quantityBefore: 0,
        quantityChange: 10,
        quantity: 10,
        quantityAfter: 10,
        unitCost: 1000,
        totalCost: 10000,
        deviceId: "CERT-SETUP",
        operationId: "CERT-SETUP-" + productId,
        idempotencyKey: "CERT-SETUP-" + productId,
        occurredAt: new Date(),
      },
    });
    await prisma.productBranchStock.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        productId,
        variantId,
        currentQuantity: 10,
        averageCost: 1000,
        stockValue: 10000,
      },
    });

    const preAuthToken = generateAccessToken({
      userId,
      tenantId,
      branchId,
      email,
      roles: ["ADMIN"],
      permissions: ["*"],
      deviceId: "DEVICE-A",
    });
    const acceptance = await fetch(`${APP_URL}/api/legal/acceptance/accept-all`, {
      method: "POST",
      headers: { authorization: "Bearer " + preAuthToken },
    });
    expect(acceptance.ok).toBe(true);

    const sessions = deviceIds.map((deviceId) => {
      const accessToken = generateAccessToken({
        userId,
        tenantId,
        branchId,
        email,
        roles: ["ADMIN"],
        permissions: ["*"],
        deviceId,
      });
      return {
        accessToken,
        session: {
          sessionId: "dash-session-" + tenantId + "-" + deviceId,
          accessToken,
          user: { id: userId, name: "Dashboard Certification Admin", email, role: "ADMIN", tenantId, branchId },
        },
      };
    });

    for (let index = 0; index < deviceIds.length; index += 1) {
      const context = await browser.newContext();
      await context.addInitScript(({ session, deviceId }) => {
        localStorage.setItem("kwakopos:v2:session", JSON.stringify(session));
        localStorage.setItem("kwakopos:v2:device-id", deviceId);
      }, { session: sessions[index].session, deviceId: deviceIds[index] });
      const page = await context.newPage();
      contexts.push(context);
      pages.push(page);
      await page.goto(APP_URL + "/dashboard", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Business Dashboard").first()).toBeVisible({ timeout: 30000 });
      await expect.poll(
        async () => {
          try {
            return (await readDashboardSnapshot(page, tenantId, branchId)).productCount;
          } catch {
            return -1;
          }
        },
        { timeout: 30000, intervals: [500, 1000, 2000] },
      ).toBe(1);
      const productCard = page.getByText("Total Products", { exact: true }).locator("..");
      await expect(productCard).toContainText("1", { timeout: 30000 });
      await expect(page.getByText(/Data as of: Revision/).first()).toBeVisible({ timeout: 30000 });
    }

    const initial = await Promise.all(pages.map((page) => readDashboardSnapshot(page, tenantId, branchId)));
    expect(initial.map((snapshot) => snapshot.salesToday)).toEqual([0, 0, 0]);
    expect(new Set(initial.map((snapshot) => snapshot.asOfRevision)).size).toBe(1);

    const initialPostgres = await readPostgresKpis(tenantId, branchId);
    for (const snapshot of initial) {
      expect(snapshot.tenantId).toBe(tenantId);
      expect(snapshot.branchId).toBe(branchId);
      expect(snapshot.salesToday).toBe(initialPostgres.salesToday);
      expect(snapshot.grossProfit).toBe(initialPostgres.grossProfit);
      expect(snapshot.aov).toBe(initialPostgres.aov);
      expect(snapshot.todayOrderCount).toBe(initialPostgres.todayOrderCount);
      expect(snapshot.completedOrders).toBe(initialPostgres.completedOrders);
      expect(snapshot.inventoryValue).toBe(initialPostgres.inventoryValue);
      expect(snapshot.stockAlerts).toBe(initialPostgres.stockAlerts);
      expect(snapshot.lowStockCount).toBe(initialPostgres.lowStockCount);
      expect(snapshot.outOfStockCount).toBe(initialPostgres.outOfStockCount);
      expect(snapshot.customerDebts).toBe(initialPostgres.customerDebts);
      expect(snapshot.customerCount).toBe(initialPostgres.customerCount);
      expect(snapshot.productCount).toBe(initialPostgres.productCount);
      expect(snapshot.supplierCount).toBe(initialPostgres.supplierCount);
    }

    const pageA = pages[0];
    const pageB = pages[1];
    const pageC = pages[2];

    await pageA.goto(APP_URL + "/pos", { waitUntil: "domcontentloaded" });
    await expect(pageA.getByText("Dashboard Convergence Product", { exact: true })).toBeVisible({ timeout: 30000 });

    // Browser A goes offline, but it already has the authoritative catalog bootstrap.
    await pageA.context().setOffline(true);

    await pageA.getByText("Dashboard Convergence Product", { exact: true }).click();
    await expect(pageA.getByRole("button", { name: "Add", exact: true }).first()).toBeVisible({ timeout: 10000 });
    await pageA.getByRole("button", { name: "Add", exact: true }).first().click();
    await pageA.getByRole("button", { name: /Pay Now/i }).click();
    await expect(pageA.getByRole("heading", { name: /Checkout/i })).toBeVisible({ timeout: 10000 });
    await pageA.getByRole("button", { name: /Complete Sale/i }).click();

    await expect.poll(
      async () => (await readLocalSalesState(pageA, tenantId, branchId)).pendingSaleOutbox.length,
      { timeout: 15000, intervals: [250, 500, 1000] },
    ).toBeGreaterThanOrEqual(1);

    const localOfflineState = await readLocalSalesState(pageA, tenantId, branchId);
    expect(localOfflineState.localSales.length).toBe(1);
    expect(Number(localOfflineState.localSales[0]?.grandTotal)).toBe(1500);

    const bWhileAOffline = await readDashboardSnapshot(pageB, tenantId, branchId);
    expect(bWhileAOffline.salesToday).toBe(initialPostgres.salesToday);
    expect(Number(localOfflineState.localSales[0]?.grandTotal)).not.toBe(bWhileAOffline.salesToday);

    await pageA.context().setOffline(false);
    await invokeProductionSync(pageA);

    await expect.poll(
      async () => prisma.sale.count({
        where: { tenantId, branchId, status: "COMPLETED" },
      }),
      { timeout: 45000, intervals: [500, 1000, 2000] },
    ).toBe(1);

    const serverSale = await prisma.sale.findFirst({
      where: { tenantId, branchId, status: "COMPLETED" },
      select: { id: true, grandTotal: true, grossProfit: true, operationId: true },
    });
    expect(serverSale?.id).toBeTruthy();
    expect(Number(serverSale?.grandTotal)).toBe(1500);

    await Promise.all([pageB.reload({ waitUntil: "domcontentloaded" }), pageC.reload({ waitUntil: "domcontentloaded" })]);
    await expect(pageB.getByText("Business Dashboard").first()).toBeVisible({ timeout: 30000 });
    await expect(pageC.getByText("Business Dashboard").first()).toBeVisible({ timeout: 30000 });

    const postgresAfterSale = await readPostgresKpis(tenantId, branchId);
    expect(postgresAfterSale.salesToday).toBe(1500);
    expect(postgresAfterSale.todayOrderCount).toBe(1);
    expect(postgresAfterSale.completedOrders).toBe(1);
    expect(postgresAfterSale.grossProfit).toBeGreaterThan(0);

    const expectedCore = [
      postgresAfterSale.salesToday,
      postgresAfterSale.grossProfit,
      postgresAfterSale.aov,
      postgresAfterSale.todayOrderCount,
      postgresAfterSale.completedOrders,
      postgresAfterSale.inventoryValue,
      postgresAfterSale.stockAlerts,
      postgresAfterSale.lowStockCount,
      postgresAfterSale.outOfStockCount,
      postgresAfterSale.customerDebts,
      postgresAfterSale.customerCount,
      postgresAfterSale.productCount,
      postgresAfterSale.supplierCount,
    ];
    const coreFromSnapshot = (snapshot: DashboardSnapshot) => [
      snapshot.salesToday,
      snapshot.grossProfit,
      snapshot.aov,
      snapshot.todayOrderCount,
      snapshot.completedOrders,
      snapshot.inventoryValue,
      snapshot.stockAlerts,
      snapshot.lowStockCount,
      snapshot.outOfStockCount,
      snapshot.customerDebts,
      snapshot.customerCount,
      snapshot.productCount,
      snapshot.supplierCount,
    ];

    await expect.poll(
      async () => {
        const [a, b, c] = await Promise.all([
          readDashboardSnapshot(pageA, tenantId, branchId),
          readDashboardSnapshot(pageB, tenantId, branchId),
          readDashboardSnapshot(pageC, tenantId, branchId),
        ]);
        return { a: coreFromSnapshot(a), b: coreFromSnapshot(b), c: coreFromSnapshot(c) };
      },
      { timeout: 45000, intervals: [500, 1000, 2000] },
    ).toEqual({ a: expectedCore, b: expectedCore, c: expectedCore });

    const convergedRevisions = await Promise.all([
      readDashboardSnapshot(pageA, tenantId, branchId),
      readDashboardSnapshot(pageB, tenantId, branchId),
      readDashboardSnapshot(pageC, tenantId, branchId),
    ]);
    expect(convergedRevisions[0].asOfRevision).toBe(convergedRevisions[1].asOfRevision);
    expect(convergedRevisions[1].asOfRevision).toBe(convergedRevisions[2].asOfRevision);
    expect(BigInt(convergedRevisions[0].asOfRevision)).toBeGreaterThan(BigInt(initial[0].asOfRevision));

    const [finalA, finalB, finalC] = await Promise.all([
      readDashboardSnapshot(pageA, tenantId, branchId),
      readDashboardSnapshot(pageB, tenantId, branchId),
      readDashboardSnapshot(pageC, tenantId, branchId),
    ]);
    const serverFinal = await readPostgresKpis(tenantId, branchId);
    const kpiKeys = [
      "SalesToday", "GrossProfitToday", "AovToday", "ProductCount", "StockAlerts",
      "CustomerDebts", "InventoryValue", "CompletedOrders", "LowStock", "OutOfStock",
      "CustomerCount", "SupplierCount",
    ];
    expect(finalA.kpis).toEqual(finalB.kpis);
    expect(finalB.kpis).toEqual(finalC.kpis);
    expect(finalA.analytics).toEqual(finalB.analytics);
    expect(finalB.analytics).toEqual(finalC.analytics);
    expect(finalA.analytics.timeframe).toBe("7d");
    expect(finalA.analytics.totalRevenue).toBe(serverFinal.salesToday);
    expect(finalA.analytics.chartPoints.length).toBe(7);
    expect(finalA.analytics.paymentTotalCount).toBeGreaterThanOrEqual(1);
    expect(finalA.analytics.topProducts[0]?.revenue).toBeGreaterThan(0);
    expect(finalA.kpis.SalesToday).toBe(serverFinal.salesToday);
    expect(finalA.kpis.GrossProfitToday).toBe(serverFinal.grossProfit);
    expect(finalA.kpis.AovToday).toBe(serverFinal.aov);
    expect(finalA.kpis.ProductCount).toBe(serverFinal.productCount);
    expect(finalA.kpis.StockAlerts).toBe(serverFinal.stockAlerts);
    expect(finalA.kpis.CustomerDebts).toBe(serverFinal.customerDebts);
    expect(finalA.kpis.InventoryValue).toBe(serverFinal.inventoryValue);
    expect(finalA.kpis.CompletedOrders).toBe(serverFinal.completedOrders);
    expect(finalA.kpis.LowStock).toBe(serverFinal.lowStockCount);
    expect(finalA.kpis.OutOfStock).toBe(serverFinal.outOfStockCount);
    expect(finalA.kpis.CustomerCount).toBe(serverFinal.customerCount);
    expect(finalA.kpis.SupplierCount).toBe(serverFinal.supplierCount);
    for (const key of kpiKeys) {
      expect(finalA.kpis[key]).toBe(finalB.kpis[key]);
      expect(finalB.kpis[key]).toBe(finalC.kpis[key]);
    }
    expect(finalA.asOfRevision).toBe(finalB.asOfRevision);
    expect(finalB.asOfRevision).toBe(finalC.asOfRevision);
    expect(BigInt(finalA.asOfRevision)).toBeGreaterThan(BigInt(initial[0].asOfRevision));

    // Financial closure coverage: authoritative tax calculation, split tender and partial return.
    await prisma.setting.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        scope: 'BRANCH',
        key: 'tax.config',
        value: { vatEnabled: true, vatRatePercent: 18, taxInclusivePricing: true, currencyCode: 'TZS' },
      },
    });
    const taxSaleResponse = await pageA.evaluate(async ({ tenantId, branchId, productId, variantId }) => {
      const raw = localStorage.getItem('kwakopos:v2:session');
      const session = raw ? JSON.parse(raw) : null;
      const response = await fetch('/api/v1/pos/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + String(session?.accessToken || ''),
          'x-tenant-id': tenantId,
          'x-branch-id': branchId,
        },
        credentials: 'include',
        body: JSON.stringify({
          items: [{ productId, variantId, quantity: 1, unitPrice: 1180, unitCost: 600 }],
          payments: [
            { amount: 590, paymentMethod: 'CARD' },
            { amount: 590, paymentMethod: 'MOBILE_MONEY' },
          ],
          deviceId: 'DEVICE-A',
          operationId: 'dashboard-financial-closure-' + crypto.randomUUID(),
          idempotencyKey: 'dashboard-financial-closure-' + crypto.randomUUID(),
        }),
      });
      return { status: response.status, body: await response.json() };
    }, { tenantId, branchId, productId, variantId });
    expect(taxSaleResponse.status).toBe(201);
    const taxSaleId = taxSaleResponse.body?.data?.sale?.id || taxSaleResponse.body?.data?.id;
    expect(taxSaleId).toBeTruthy();
    const taxSale = await prisma.sale.findUnique({ where: { id: taxSaleId }, select: { grandTotal: true, subtotal: true, taxTotal: true, totalCost: true, grossProfit: true } });
    expect(Number(taxSale?.grandTotal)).toBe(1180);
    expect(Number(taxSale?.subtotal)).toBe(1000);
    expect(Number(taxSale?.taxTotal)).toBe(180);
    expect(Number(taxSale?.totalCost)).toBe(600);
    expect(Number(taxSale?.grossProfit)).toBe(400);

    await prisma.return.create({
      data: {
        id: randomUUID(),
        tenantId,
        branchId,
        returnNumber: 'RET-DASH-' + randomUUID().slice(0, 8),
        originalSaleId: taxSaleId,
        reason: 'Financial closure certification partial return',
        refundType: 'CASH',
        totalRefundAmount: 590,
        status: 'COMPLETED',
        lines: {
          create: [{
            id: randomUUID(),
            variantId,
            quantityReturned: 0.5,
            refundUnitPrice: 1180,
            refundLineTotal: 590,
            condition: 'GOOD',
          }],
        },
      },
    });
    const financialSnapshot = await readDashboardSnapshot(pageA, tenantId, branchId);
    expect(financialSnapshot.salesToday).toBe(2000);
    expect(financialSnapshot.grossProfit).toBe(1100);
    expect(financialSnapshot.netSalesToday).toBe(2000);
    expect(financialSnapshot.cogsToday).toBe(900);
    expect(financialSnapshot.analytics.paymentTotalVolume).toBe(2680);
    expect(financialSnapshot.analytics.paymentTotalCount).toBe(3);
    expect(financialSnapshot.analytics.paymentTotalOrderCount).toBe(2);
    expect(financialSnapshot.analytics.paymentOverallAov).toBe(1340);
    const cashChannel = financialSnapshot.analytics.paymentChannels.find((c) => c.name === 'CASH');
    const cardChannel = financialSnapshot.analytics.paymentChannels.find((c) => c.name === 'CARD');
    const mobileChannel = financialSnapshot.analytics.paymentChannels.find((c) => c.name === 'MOBILE_MONEY');
    expect(cashChannel?.orderCount).toBe(1);
    expect(cashChannel?.paymentCount).toBe(1);
    expect(cardChannel?.orderCount).toBe(1);
    expect(cardChannel?.paymentCount).toBe(1);
    expect(mobileChannel?.orderCount).toBe(1);
    expect(mobileChannel?.paymentCount).toBe(1);
    expect(financialSnapshot.analytics.topProducts[0]?.units).toBe(1.5);
    expect(financialSnapshot.analytics.topProducts[0]?.revenue).toBe(2000);
    expect(financialSnapshot.analytics.totalRevenue).toBe(2000);
    expect(financialSnapshot.analytics.totalCOGS).toBe(900);
    expect(financialSnapshot.analytics.totalProfit).toBe(1100);
    expect(financialSnapshot.analytics.marginPct).toBe('55.0');
    // Browser C: real logout -> login -> dashboard recovery.
    await pageC.locator("#topbar-user-btn").click();
    const signOutResponse = pageC.waitForResponse((response) =>
      response.url().includes("/auth/logout") && response.request().method() === "POST",
    );
    await pageC.locator("#topbar-signout-btn").click();
    expect((await signOutResponse).status()).toBe(200);
    await expect(pageC.locator("#email")).toBeVisible({ timeout: 15000 });
    expect((await pageC.evaluate(() => localStorage.getItem("kwakopos:v2:device-id")))).toBe("DEVICE-C");

    await loginThroughUi(pageC, email, password);
    await pageC.goto(APP_URL + "/dashboard", { waitUntil: "domcontentloaded" });
    await expect(pageC.getByText("Business Dashboard").first()).toBeVisible({ timeout: 30000 });
    await expect.poll(
      async () => (await readDashboardSnapshot(pageC, tenantId, branchId)).salesToday,
      { timeout: 30000, intervals: [500, 1000, 2000] },
    ).toBe(1500);

    const afterReloginC = await readDashboardSnapshot(pageC, tenantId, branchId);
    expect(afterReloginC.kpis).toEqual(finalA.kpis);
    expect(afterReloginC.asOfRevision).toBe(finalA.asOfRevision);

    const evidence = {
      status: "PASS",
      test: "dashboard-convergence-offline-sale-three-browser",
      tenantId,
      branchId,
      browsers: [...deviceIds],
      assertions: {
        initialDashboardEqualsPostgreSQL: true,
        offlineBrowserALocalOperationalStateDiffersFromOnlineB: true,
        postSyncDashboardAEqualsBEqualsC: true,
        postSyncDashboardEqualsPostgreSQL: true,
        sharedAsOfRevision: finalA.asOfRevision,
        logoutLoginDashboardRecovery: true,
      },
      offline: {
        localSaleGrandTotal: Number(localOfflineState.localSales[0]?.grandTotal ?? 0),
        pendingOutboxCount: localOfflineState.pendingOutbox.length,
        onlineBrowserBSalesToday: bWhileAOffline.salesToday,
      },
      finalKpis: finalA.kpis,
      postgres: serverFinal,
      timestamp: new Date().toISOString(),
    };
    await import("node:fs/promises").then(async (fs) => {
      await fs.mkdir("artifacts/release-evidence", { recursive: true });
      await fs.writeFile(
        "artifacts/release-evidence/kwakopos-dashboard-convergence.json",
        JSON.stringify(evidence, null, 2),
        "utf8",
      );
    });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId);
    await prisma.$executeRawUnsafe("DELETE FROM sync_conflict_record WHERE tenant_id = $1", tenantId);
    await prisma.returnLine.deleteMany({ where: { returnRel: { tenantId } } });
    await prisma.return.deleteMany({ where: { tenantId } });
    await prisma.setting.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.saleLine.deleteMany({ where: { sale: { tenantId } } });
    await prisma.sale.deleteMany({ where: { tenantId } });
    await prisma.syncOperation.deleteMany({ where: { tenantId } });
    await prisma.productBranchStock.deleteMany({ where: { tenantId } });
    await prisma.stockLedger.deleteMany({ where: { tenantId } });
    await prisma.productVariant.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.deviceSession.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.role.deleteMany({ where: { tenantId } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
});
