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
    const item = await enqueueTraVfdOutbox(db, ctx, {
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

    const item = await enqueueTraVfdOutbox(db, ctx, {
      transactionId: "SALE-VFD-ON-001",
      receiptId: "SALE-VFD-ON-001",
      deviceId: "TEST",
      payload: { grandTotal: 2500, currency: "TZS" },
    });
    await db.flushPersistence();

    expect(item?.fiscalState).toBe("LOCAL_FISCAL_PENDING");
    expect(item?.chainSequence).toBe(1);
    expect(item?.previousReceiptHash).toBe("GENESIS");
    expect(item?.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(item?.status).toBe("PENDING");
    expect(db.syncOutbox.size).toBe(0);
    expect(db.traVfdOutbox.get(item!.id)?.transactionId).toBe("SALE-VFD-ON-001");

    const reopened = new LocalIndexedDbStore(5, dbName);
    await reopened.ready;
    expect(reopened.traVfdOutbox.get(item!.id)?.fiscalState).toBe("LOCAL_FISCAL_PENDING");
    expect(reopened.syncOutbox.size).toBe(0);
    expect(reopened.traVfdOutbox.get(item!.id)?.receiptHash).toBe(item!.receiptHash);
  });
  it("chains consecutive fiscal receipts on the same terminal", async () => {
    const db = new LocalIndexedDbStore(5, `kwakopos-vfd-chain-${Date.now()}`);
    await db.ready;
    const ctx = { tenantId: "tenant-chain", branchId: "branch-chain" };
    db.saveConfigurationLocal("tra_vfd_config", { enabled: true, endpoint: "https://vfd.example.test/api" }, ctx);
    await db.flushPersistence();

    const first = await enqueueTraVfdOutbox(db, ctx, { transactionId: "SALE-CHAIN-001", deviceId: "terminal-a", payload: { receiptNumber: "R-1", createdAt: "2026-10-01T10:00:00.000Z", grandTotal: 1000, taxTotal: 180 } });
    const second = await enqueueTraVfdOutbox(db, ctx, { transactionId: "SALE-CHAIN-002", deviceId: "terminal-a", payload: { receiptNumber: "R-2", createdAt: "2026-10-01T10:01:00.000Z", grandTotal: 2000, taxTotal: 360 } });

    expect(first?.chainSequence).toBe(1);
    expect(second?.chainSequence).toBe(2);
    expect(second?.previousReceiptHash).toBe(first?.receiptHash);
    expect(second?.receiptHash).toMatch(/^[a-f0-9]{64}$/);
  });

});
