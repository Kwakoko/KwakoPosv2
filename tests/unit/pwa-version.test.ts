import { describe, it, expect } from "vitest";
import { PwaVersionManager } from "../../apps/web/src/versionManager.js";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";

describe("PWA Versioning & Safe Upgrade Durability Engine", () => {
  it("formats version display string correctly", () => {
    const pwa = new PwaVersionManager("2.0.0");
    expect(pwa.getFormattedVersionDisplay()).toBe("KwakoPos © 2026 • Version 2.0.0");
  });

  it("performs safe PWA upgrade without destroying pending outbox mutations or local products", () => {
    const store = new LocalIndexedDbStore();
    store.schemaVersion = 1;

    // Seed local data
    store.products.set("prod-1", {
      id: "prod-1",
      name: "Super Coffee",
      description: "Organic espresso",
      tenantId: "tenant-pwa",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    store.syncOutbox.set("op-1", {
      id: "op-1",
      entityType: "Product",
      entityId: "prod-1",
      operationType: "CREATE",
      payload: { name: "Super Coffee" },
      clientCreatedAt: new Date().toISOString(),
      idempotencyKey: "idem-pwa-001",
      status: "PENDING",
    });

    const pwa = new PwaVersionManager("2.0.0", 1, store);
    const upgradeResult = pwa.performSafePwaUpgrade(3);

    expect(upgradeResult.upgraded).toBe(true);
    expect(upgradeResult.newVersion).toBe(3);
    expect(upgradeResult.preservedOutboxCount).toBe(1);
    expect(upgradeResult.preservedProductCount).toBe(1);

    // Verify outbox mutation is intact
    expect(store.syncOutbox.get("op-1")?.status).toBe("PENDING");
    expect(store.products.get("prod-1")?.name).toBe("Super Coffee");
  });
});