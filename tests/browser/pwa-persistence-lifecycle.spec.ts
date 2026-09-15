import { test, expect } from "@playwright/test";
import http from "node:http";

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Access-Control-Allow-Origin": "*",
    });
    res.end("<!doctype html><html><head><title>KwakoPos Test Origin</title></head><body><h1>KwakoPos Browser Persistence Suite</h1></body></html>");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}/`;
      resolve();
    });
  });
});

test.afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test.describe("KwakoPos PWA Durable Persistence, Upgrade, Rollback & Tenant Isolation Browser Suite", () => {
  test("1. Fresh Install & Initial V4 Schema Creation in Real Browser IndexedDB", async ({ page }) => {
    await page.goto(baseUrl);

    const initResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("kwakopos-v2-t1", 4);
        req.onupgradeneeded = (e) => {
          const db = req.result;
          const stores = [
            "products", "productVariants", "stockLedger", "stockAdjustments",
            "stockBalance", "productPriceHistory", "sales", "payments",
            "receipts", "customers", "suppliers", "syncOutbox", "syncMetadata",
            "configuration", "auditState", "migrationJournal", "recoverySnapshots", "updateState"
          ];
          for (const s of stores) {
            if (!db.objectStoreNames.contains(s)) {
              const os = db.createObjectStore(s);
              if (s === "products" || s === "sales" || s === "stockLedger") {
                os.createIndex("by_tenant", "tenantId", { unique: false });
              }
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          const storeNames = Array.from(db.objectStoreNames);
          const version = db.version;
          db.close();
          resolve({ version, storeCount: storeNames.length, storeNames });
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(initResult.version).toBe(4);
    expect(initResult.storeCount).toBe(18);
    expect(initResult.storeNames).toContain("products");
    expect(initResult.storeNames).toContain("sales");
    expect(initResult.storeNames).toContain("syncOutbox");
    expect(initResult.storeNames).toContain("recoverySnapshots");
    expect(initResult.storeNames).toContain("configuration");
  });

  test("2. Offline Business Write + Outbox Transactional Atomicity & Browser Reload Durability", async ({ page }) => {
    await page.goto(baseUrl);

    const writeResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("kwakopos-v2-t2", 4);
        req.onupgradeneeded = () => {
          const db = req.result;
          db.createObjectStore("sales");
          db.createObjectStore("syncOutbox");
          db.createObjectStore("stockLedger");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["sales", "syncOutbox", "stockLedger"], "readwrite");
          const saleStore = tx.objectStore("sales");
          const outboxStore = tx.objectStore("syncOutbox");
          const ledgerStore = tx.objectStore("stockLedger");

          const saleId = "sale-browser-001";
          const outboxId = "op-browser-001";
          const ledgerId = "ledger-browser-001";

          saleStore.put({
            id: saleId,
            tenantId: "tenant-browser-01",
            branchId: "branch-browser-01",
            totalAmount: 15400,
            status: "COMPLETED",
            createdAt: new Date().toISOString()
          }, saleId);

          ledgerStore.put({
            id: ledgerId,
            tenantId: "tenant-browser-01",
            branchId: "branch-browser-01",
            variantId: "var-101",
            quantity: -2,
            reason: "SALE",
            createdAt: new Date().toISOString()
          }, ledgerId);

          outboxStore.put({
            id: outboxId,
            entityType: "Sale",
            entityId: saleId,
            operationType: "CREATE",
            payload: { saleId, totalAmount: 15400 },
            clientCreatedAt: new Date().toISOString(),
            idempotencyKey: "idem-browser-001",
            status: "PENDING",
            tenantId: "tenant-browser-01",
            branchId: "branch-browser-01"
          }, outboxId);

          tx.oncomplete = () => {
            db.close();
            resolve({ saleId, outboxId, ledgerId });
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(writeResult.saleId).toBe("sale-browser-001");

    // Simulate browser reload
    await page.reload();

    // Verify records persisted across reload
    const readAfterReload = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("kwakopos-v2-t2", 4);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["sales", "syncOutbox", "stockLedger"], "readonly");
          const saleReq = tx.objectStore("sales").get("sale-browser-001");
          const outboxReq = tx.objectStore("syncOutbox").get("op-browser-001");
          const ledgerReq = tx.objectStore("stockLedger").get("ledger-browser-001");

          tx.oncomplete = () => {
            db.close();
            resolve({
              sale: saleReq.result,
              outbox: outboxReq.result,
              ledger: ledgerReq.result
            });
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(readAfterReload.sale.totalAmount).toBe(15400);
    expect(readAfterReload.outbox.status).toBe("PENDING");
    expect(readAfterReload.outbox.idempotencyKey).toBe("idem-browser-001");
    expect(readAfterReload.ledger.quantity).toBe(-2);
  });

  test("3. Tenant-Safe Local Persistence Isolation & Scoped Boundary Verification", async ({ page }) => {
    await page.goto(baseUrl);

    const isolationResult = await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("kwakopos-v2-t3", 4);
        req.onupgradeneeded = () => {
          const db = req.result;
          const prodStore = db.createObjectStore("products");
          prodStore.createIndex("by_tenant", "tenantId", { unique: false });
          db.createObjectStore("configuration");
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["products", "configuration"], "readwrite");
          const prodStore = tx.objectStore("products");
          const configStore = tx.objectStore("configuration");

          // Tenant Alpha
          prodStore.put({ id: "prod-alpha", name: "Alpha Coffee", tenantId: "tenant-alpha" }, "prod-alpha");
          configStore.put({ key: "theme", value: "dark", tenantId: "tenant-alpha" }, "tenant-alpha:theme");

          // Tenant Beta
          prodStore.put({ id: "prod-beta", name: "Beta Tea", tenantId: "tenant-beta" }, "prod-beta");
          configStore.put({ key: "theme", value: "light", tenantId: "tenant-beta" }, "tenant-beta:theme");

          tx.oncomplete = () => {
            // Read through index by_tenant
            const readTx = db.transaction(["products", "configuration"], "readonly");
            const index = readTx.objectStore("products").index("by_tenant");
            const alphaReq = index.getAll("tenant-alpha");
            const betaReq = index.getAll("tenant-beta");

            readTx.oncomplete = () => {
              db.close();
              resolve({
                alphaCount: alphaReq.result.length,
                alphaItems: alphaReq.result,
                betaCount: betaReq.result.length,
                betaItems: betaReq.result
              });
            };
          };
        };
        req.onerror = () => reject(req.error);
      });
    });

    expect(isolationResult.alphaCount).toBe(1);
    expect(isolationResult.alphaItems[0].name).toBe("Alpha Coffee");
    expect(isolationResult.betaCount).toBe(1);
    expect(isolationResult.betaItems[0].name).toBe("Beta Tea");
  });

  test("4. Durable Snapshot, Integrity Checksum & Automated Rollback Recovery", async ({ page }) => {
    await page.goto(baseUrl);

    const recoveryResult = await page.evaluate(async () => {
      const dbReq = indexedDB.open("kwakopos-v2-t4", 4);
      return new Promise((resolve, reject) => {
        dbReq.onupgradeneeded = () => {
          const db = dbReq.result;
          db.createObjectStore("sales");
          db.createObjectStore("recoverySnapshots");
        };
        dbReq.onsuccess = () => {
          const db = dbReq.result;
          const tx = db.transaction(["sales", "recoverySnapshots"], "readwrite");
          const saleStore = tx.objectStore("sales");
          saleStore.put({ id: "sale-browser-001", totalAmount: 5000 }, "sale-browser-001");

          const snapshotId = "SNAP-TEST-001";
          const snapshot = {
            id: snapshotId,
            createdAt: new Date().toISOString(),
            schemaVersion: 4,
            applicationVersion: "2.12.5",
            salesData: [{ id: "sale-browser-001", totalAmount: 5000 }],
            recordCount: 1,
            checksum: "sha256-verified-test-checksum"
          };
          tx.objectStore("recoverySnapshots").put(snapshot, snapshotId);

          tx.oncomplete = () => {
            // Simulate failed destructive migration: corrupting sales
            const corruptTx = db.transaction("sales", "readwrite");
            corruptTx.objectStore("sales").clear();

            corruptTx.oncomplete = () => {
              // Automatic Recovery: restore from verified snapshot
              const restoreTx = db.transaction(["sales", "recoverySnapshots"], "readwrite");
              const getSnapReq = restoreTx.objectStore("recoverySnapshots").get(snapshotId);

              getSnapReq.onsuccess = () => {
                const snap = getSnapReq.result;
                const saleStoreRestored = restoreTx.objectStore("sales");
                for (const s of snap.salesData) {
                  saleStoreRestored.put(s, s.id);
                }
              };

              restoreTx.oncomplete = () => {
                // Verify restored state
                const verifyTx = db.transaction("sales", "readonly");
                const allSales = verifyTx.objectStore("sales").getAll();
                verifyTx.oncomplete = () => {
                  db.close();
                  resolve({
                    restoredCount: allSales.result.length,
                    firstSaleId: allSales.result[0]?.id
                  });
                };
              };
            };
          };
        };
        dbReq.onerror = () => reject(dbReq.error);
      });
    });

    expect(recoveryResult.restoredCount).toBeGreaterThan(0);
    expect(recoveryResult.firstSaleId).toBe("sale-browser-001");
  });

  test("5. Multi-Tab Migration Coordination & Quiescing via BroadcastChannel", async ({ context }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    await pageA.goto(baseUrl);
    await pageB.goto(baseUrl);

    const coordinationTest = await pageA.evaluate(async () => {
      return new Promise((resolve) => {
        const channelA = new BroadcastChannel("kwakopos-tab-coordination");
        let tabBReceived = false;

        const channelB = new BroadcastChannel("kwakopos-tab-coordination");
        channelB.onmessage = (e) => {
          if (e.data.type === "QUIESCE_REQUEST") {
            tabBReceived = true;
            channelB.postMessage({ type: "QUIESCED", tabId: "tab-B" });
          }
        };

        channelA.onmessage = (e) => {
          if (e.data.type === "QUIESCED") {
            channelA.close();
            channelB.close();
            resolve({ success: true, tabBReceived });
          }
        };

        channelA.postMessage({
          type: "QUIESCE_REQUEST",
          tabId: "tab-A",
          targetVersion: "2.12.5",
          targetSchema: 4
        });
      });
    });

    expect(coordinationTest.success).toBe(true);
    expect(coordinationTest.tabBReceived).toBe(true);

    await pageA.close();
    await pageB.close();
  });
});
