import { describe, it, expect, beforeEach } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import {
  loadSampleData,
  purgeSampleData,
  isDemoModeActive,
  DEMO_MODE_STORAGE_KEY,
} from "../../apps/web/src/services/sampleDataService.js";

describe("KwakoPos V2 — Data Cleanliness & Universal Sample Data Engine", () => {
  let db: LocalIndexedDbStore;

  beforeEach(async () => {
    // Fresh in-memory store
    db = new LocalIndexedDbStore("test_db_" + Date.now());
    await db.ready;
  });

  it("should initialize store with pristine zero-data state", () => {
    expect(db.products.size).toBe(0);
    expect(db.productVariants.size).toBe(0);
    expect(db.customers.size).toBe(0);
    expect(db.suppliers.size).toBe(0);
    expect(db.sales.size).toBe(0);
    expect(db.stockLedger.size).toBe(0);
    expect(isDemoModeActive(db)).toBe(false);
  });

  it("should load localized retail sample data on demand and tag all records", async () => {
    const summary = await loadSampleData(db, "tenant_test_01");

    expect(summary.products).toBeGreaterThan(0);
    expect(summary.customers).toBeGreaterThan(0);
    expect(summary.suppliers).toBeGreaterThan(0);
    expect(summary.sales).toBeGreaterThan(0);
    expect(summary.expenses).toBeGreaterThan(0);

    // Verify all injected products are tagged
    for (const prod of db.products.values()) {
      expect((prod as any).isDemo).toBe(true);
    }

    // Verify all injected customers are tagged
    for (const cust of db.customers.values()) {
      expect((cust as any).isDemo).toBe(true);
    }

    // Verify all injected sales are tagged
    for (const sale of db.sales.values()) {
      expect((sale as any).isDemo).toBe(true);
    }

    // Verify shift and expenses configuration
    const activeShift = db.getConfigurationLocal("active_shift_session") as any;
    expect(activeShift).toBeDefined();
    expect(activeShift?.isDemo).toBe(true);

    const demoExpenses = db.getConfigurationLocal("demo_expenses") as any[];
    expect(Array.isArray(demoExpenses)).toBe(true);
    expect(demoExpenses.length).toBe(summary.expenses);

    // Verify demo mode is active
    expect(isDemoModeActive(db)).toBe(true);
  });

  it("should cleanly purge 100% of demo data with 1-click without affecting real data", async () => {
    // 1. First add a genuine tenant product and customer
    db.saveProductLocal({
      id: "real-prod-999",
      name: "Actual Store Product",
      sku: "ACTUAL-001",
      sellingPrice: 15000,
      stock: 50,
      status: "Active",
      isDemo: false,
    } as any);

    db.saveCustomerLocal({
      id: "real-cust-999",
      name: "Real VIP Client",
      phone: "+255 700 000 000",
      isDemo: false,
    } as any);

    expect(db.products.size).toBe(1);
    expect(db.customers.size).toBe(1);

    // 2. Load demo dataset
    await loadSampleData(db, "tenant_test_01");
    expect(db.products.size).toBeGreaterThan(1);
    expect(db.customers.size).toBeGreaterThan(1);
    expect(isDemoModeActive(db)).toBe(true);

    // 3. Purge demo data
    await purgeSampleData(db, "tenant_test_01");

    // 4. Verify only real data remains
    expect(db.products.size).toBe(1);
    expect(db.products.get("real-prod-999")?.name).toBe("Actual Store Product");

    expect(db.customers.size).toBe(1);
    expect(db.customers.get("real-cust-999")?.name).toBe("Real VIP Client");

    // Configs reset
    expect(db.getConfigurationLocal("active_shift_session")).toBeNull();
    expect(db.getConfigurationLocal("demo_expenses")).toEqual([]);
    expect(isDemoModeActive(db)).toBe(false);
  });
});
