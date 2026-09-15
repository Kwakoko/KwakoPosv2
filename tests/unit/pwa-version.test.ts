import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { PwaVersionManager } from "../../apps/web/src/versionManager.js";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("PWA Versioning & Safe Upgrade Durability Engine", () => {
  it("formats version display string correctly with authoritative release version", () => {
    const pwa = new PwaVersionManager("2.12.5");
    expect(pwa.getFormattedVersionDisplay()).toBe("KwakoPos © 2026 • Version 2.12.5");
  });

  it("performs safe PWA upgrade without destroying pending outbox mutations or local products", async () => {
    const store = new LocalIndexedDbStore(1);
    await store.ready;

    // Seed local data
    store.saveProductLocal({
      id: "prod-1",
      name: "Super Coffee",
      description: "Organic espresso",
      tenantId: "tenant-pwa",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.recordOutboxMutation({
      id: "op-1",
      entityType: "Product",
      entityId: "prod-1",
      operationType: "CREATE",
      payload: { name: "Super Coffee", tenantId: "tenant-pwa" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "idem-pwa-001",
      status: "PENDING",
      tenantId: "tenant-pwa",
    });

    const pwa = new PwaVersionManager("2.12.5", 1, store);
    const upgradeResult = await pwa.performSafePwaUpgrade(4);

    expect(upgradeResult.upgraded).toBe(true);
    expect(upgradeResult.newVersion).toBe(4);
    expect(upgradeResult.preservedOutboxCount).toBe(1);
    expect(upgradeResult.preservedProductCount).toBe(1);

    // Verify outbox mutation is intact
    expect(store.syncOutbox.get("op-1")?.status).toBe("PENDING");
    expect(store.products.get("prod-1")?.name).toBe("Super Coffee");
    expect(upgradeResult.state).toBe("COMMITTED");
  });
});