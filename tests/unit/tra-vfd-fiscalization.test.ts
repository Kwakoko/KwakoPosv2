import { describe, it, expect } from "vitest";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb";
import { TraVfdFiscalStateEnum } from "@kwakopos2/contracts";
import { enqueueTraVfdOutbox, getTraVfdConfig } from "../../apps/web/src/services/traVfdOutboxService";

describe("TRA VFD fiscalization separation", () => {
  it("defines the complete fiscalization lifecycle", () => {
    expect(TraVfdFiscalStateEnum.options).toEqual([
      "LOCAL_FISCAL_PENDING",
      "SUBMITTING",
      "TRA_ACCEPTED",
      "TRA_REJECTED",
      "TRA_RETRY",
      "TRA_VERIFIED",
    ]);
  });

  it("defaults VFD to OFF and never uses syncOutbox when disabled", async () => {
    const db = new LocalIndexedDbStore(5, `kwakopos-vfd-off-${Date.now()}`);
    await db.ready;
    const ctx = { tenantId: "tenant-vfd-off", branchId: "branch-vfd-off" };

    expect(getTraVfdConfig(db, ctx).enabled).toBe(false);
    const item = enqueueTraVfdOutbox(db, ctx, {
      transactionId: "SALE-VFD-OFF-001",
      receiptId: "SALE-VFD-OFF-001",
      deviceId: "TEST",
      payload: { grandTotal: 1000 },
    });

    expect(item).toBeNull();
    expect(db.syncOutbox.size).toBe(0);
    expect(db.traVfdOutbox.size).toBe(0);
  });

  it("persists a VFD queue item in traVfdOutbox and leaves syncOutbox untouched", async () => {
    const dbName = `kwakopos-vfd-on-${Date.now()}`;
    const db = new LocalIndexedDbStore(5, dbName);
    await db.ready;
    const ctx = { tenantId: "tenant-vfd-on", branchId: "branch-vfd-on" };

    db.saveConfigurationLocal("tra_vfd_config", {
      enabled: true,
      endpoint: "https://vfd.example.test/api",
    }, ctx);
    await db.flushPersistence();

    const item = enqueueTraVfdOutbox(db, ctx, {
      transactionId: "SALE-VFD-ON-001",
      receiptId: "SALE-VFD-ON-001",
      deviceId: "TEST",
      payload: { grandTotal: 2500, currency: "TZS" },
    });
    await db.flushPersistence();

    expect(item?.fiscalState).toBe("LOCAL_FISCAL_PENDING");
    expect(item?.status).toBe("PENDING");
    expect(db.syncOutbox.size).toBe(0);
    expect(db.traVfdOutbox.get(item!.id)?.transactionId).toBe("SALE-VFD-ON-001");

    const reopened = new LocalIndexedDbStore(5, dbName);
    await reopened.ready;
    expect(reopened.traVfdOutbox.get(item!.id)?.fiscalState).toBe("LOCAL_FISCAL_PENDING");
    expect(reopened.syncOutbox.size).toBe(0);
  });
});
