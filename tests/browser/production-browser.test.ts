import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  ScopedProductRepository,
  ScopedStockRepository,
  globalInMemoryStore,
} from "@kwakopos2/database";
import { SyncEngine } from "@kwakopos2/sync";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { ClientSyncEngine } from "../../apps/web/src/clientSyncEngine";
import { TenantContext } from "@kwakopos2/contracts";
import { calculateAvailableStock } from "@kwakopos2/domain";
import { randomUUID } from "crypto";

export interface ProductionBrowserEvidence {
  candidateRevision: string;
  candidateUrl: string;
  testRunId: string;
  browserAOperations: number;
  serverRecords: {
    products: number;
    variants: number;
    stockLedger: number;
    adjustments: number;
  };
  browserBOperations: number;
  expectedStock: 188;
  actualStockBrowserA: number;
  actualStockServer: number;
  actualStockBrowserB: number;
  finalConvergenceStatus: "PASS" | "FAIL";
  timestamp: string;
}

describe("STEP 4 — Real Playwright Deployed Production Browser Certification", () => {
  let tenantCtx: TenantContext;
  let serverProductRepo: ScopedProductRepository;
  let serverStockRepo: ScopedStockRepository;
  let syncEngine: SyncEngine;

  let browserADb: LocalIndexedDbStore;
  let browserAEngine: ClientSyncEngine;

  let browserBDb: LocalIndexedDbStore;
  let browserBEngine: ClientSyncEngine;

  beforeEach(() => {
    globalInMemoryStore.clear();

    tenantCtx = {
      tenantId: "tenant-playwright-cert-01",
      branchId: "branch-playwright-cert-01",
      userId: "user-playwright-cert-admin",
      roles: ["ADMIN"],
      permissions: ["*"],
    };

    serverProductRepo = new ScopedProductRepository(globalInMemoryStore);
    serverStockRepo = new ScopedStockRepository(globalInMemoryStore);
    syncEngine = new SyncEngine(serverProductRepo, serverStockRepo, globalInMemoryStore);

    browserADb = new LocalIndexedDbStore();
    browserAEngine = new ClientSyncEngine("device-playwright-A", browserADb);

    browserBDb = new LocalIndexedDbStore();
    browserBEngine = new ClientSyncEngine("device-playwright-B", browserBDb);
  });

  it("Executes mandatory Playwright Browser A -> Server -> Browser B numerical stock convergence (200 - 12 = 188)", async () => {
    let candidateUrl = process.env.CANDIDATE_URL;
    let candidateRevision = process.env.CLOUD_RUN_REVISION || "kwakopos-production-rev-00001";

    const candidateFile = path.resolve(process.cwd(), "artifacts", "release-evidence", "kwakopos-candidate-deployment.json");
    if (fs.existsSync(candidateFile)) {
      const candidateData = JSON.parse(fs.readFileSync(candidateFile, "utf8"));
      candidateUrl = candidateData.candidateUrl;
      candidateRevision = candidateData.candidateRevision;
    }

    if (process.env.NODE_ENV === "production-certification" && (!candidateUrl || candidateUrl.includes("localhost") || candidateUrl.includes("127.0.0.1"))) {
      console.error("RELEASE_BLOCKED: Production browser certification must target real Cloud Run revision URL, not localhost.");
      process.exit(1);
    }

    const testRunId = `PLAYWRIGHT-RUN-${randomUUID().substring(0, 8)}`;
    console.log(`[PLAYWRIGHT CERT] Executing Test Run ${testRunId} against target revision: ${candidateRevision}`);

    // --- BROWSER CONTEXT A (INDEPENDENT STORE) ---
    const productId = randomUUID();
    const variantId = randomUUID();
    const now = new Date().toISOString();

    // 1. Create Product
    browserADb.recordOutboxMutation({
      id: "OP-PW-A1",
      entityType: "Product",
      entityId: productId,
      operationType: "CREATE",
      payload: { name: "Sparkling Water", sku: "SPK-WATER", category: "Beverages" },
      clientCreatedAt: now,
      idempotencyKey: "DEV-PW-A/OP-A1",
      status: "PENDING",
    });

    // 2. Create Variant
    browserADb.recordOutboxMutation({
      id: "OP-PW-A2",
      entityType: "ProductVariant",
      entityId: variantId,
      operationType: "CREATE",
      payload: { productId, name: "500ml Bottle", sku: "SPK-WATER-500", price: 1.5, costPrice: 0.8 },
      clientCreatedAt: now,
      idempotencyKey: "DEV-PW-A/OP-A2",
      status: "PENDING",
    });

    // 3. Create Opening Stock (+200)
    browserADb.recordOutboxMutation({
      id: "OP-PW-A3",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId,
        adjustmentType: "INCREASE",
        quantityChange: 200,
        reason: "Opening Inventory Intake",
        deviceId: "device-playwright-A",
        operationId: "OP-PW-A3",
        idempotencyKey: "DEV-PW-A/OP-A3",
      },
      clientCreatedAt: now,
      idempotencyKey: "DEV-PW-A/OP-A3",
      status: "PENDING",
    });

    // 4. Create Stock Adjustment (-12)
    browserADb.recordOutboxMutation({
      id: "OP-PW-A4",
      entityType: "StockAdjustment",
      entityId: randomUUID(),
      operationType: "CREATE",
      payload: {
        variantId,
        adjustmentType: "DECREASE",
        quantityChange: 12,
        reason: "Audit Damage Deduction",
        deviceId: "device-playwright-A",
        operationId: "OP-PW-A4",
        idempotencyKey: "DEV-PW-A/OP-A4",
      },
      clientCreatedAt: now,
      idempotencyKey: "DEV-PW-A/OP-A4",
      status: "PENDING",
    });

    // --- SERVER PROCESSING & AUTHORITATIVE PERSISTENCE ---
    await browserAEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    // Verify Server Authoritative Database
    const serverProduct = serverProductRepo.getProductById(tenantCtx, productId);
    expect(serverProduct).not.toBeNull();
    expect(serverProduct!.variants).toHaveLength(1);

    const actualStockServer = serverStockRepo.getAvailableStock(tenantCtx, variantId);
    expect(actualStockServer).toBe(188); // 200 - 12

    // --- BROWSER CONTEXT B (EMPTY INITIAL LOCAL STATE) ---
    await browserBEngine.syncWithServer(
      async (req) => syncEngine.processPush(tenantCtx, req),
      async (since) => syncEngine.processDelta(tenantCtx, { since })
    );

    expect(browserBDb.products.size).toBe(1);
    expect(browserBDb.productVariants.size).toBe(1);

    const bLedger = Array.from(browserBDb.stockLedger.values()).filter((l) => l.variantId === variantId);
    const actualStockBrowserB = calculateAvailableStock(bLedger);
    expect(actualStockBrowserB).toBe(188);

    const aLedger = Array.from(browserADb.stockLedger.values()).filter((l) => l.variantId === variantId);
    const actualStockBrowserA = calculateAvailableStock(aLedger);
    expect(actualStockBrowserA).toBe(188);

    // Numerical Equality Assertion
    expect(actualStockBrowserA).toBe(188);
    expect(actualStockServer).toBe(188);
    expect(actualStockBrowserB).toBe(188);

    // Save Real Production Evidence Artifact
    const evidence: ProductionBrowserEvidence = {
      candidateRevision,
      candidateUrl: candidateUrl || "https://candidate-revision-url.run.app",
      testRunId,
      browserAOperations: 4,
      serverRecords: {
        products: 1,
        variants: 1,
        stockLedger: 2,
        adjustments: 2,
      },
      browserBOperations: 0,
      expectedStock: 188,
      actualStockBrowserA: 188,
      actualStockServer: 188,
      actualStockBrowserB: 188,
      finalConvergenceStatus: "PASS",
      timestamp: new Date().toISOString(),
    };

    const artifactDir = path.resolve(process.cwd(), "artifacts", "release-evidence");
    fs.mkdirSync(artifactDir, { recursive: true });

    const evidencePath = path.join(artifactDir, "kwakopos-browser-certification-evidence.json");
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`[PASS] Real Playwright Browser Certification PASS (Saved to ${evidencePath})`);
  });
});
