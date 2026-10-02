import { describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import { TraVfdService } from "../../apps/api/src/services/traVfdService.js";
import { LocalIndexedDbStore } from "../../apps/web/src/indexedDb.js";
import { enqueueTraVfdOutbox } from "../../apps/web/src/services/traVfdOutboxService.js";

function hash(prev: string, invoice: string, timestamp: string, total: number, tax: number): string {
  return createHash("sha256")
    .update(`${prev}|${invoice}|${timestamp}|${total.toFixed(2)}|${tax.toFixed(2)}`, "utf8")
    .digest("hex");
}

describe("TRA VFD fiscal receipt hash-chain certification", () => {
  it("preserves offline sequence/hash on online reconciliation and blocks PostgreSQL tampering", async () => {
    const tenantId = `tenant-tra-chain-${randomUUID()}`;
    const branchId = `branch-tra-chain-${randomUUID()}`;
    const slug = `tra-chain-${randomUUID()}`;
    const deviceId = `terminal-${randomUUID()}`;
    const service = new TraVfdService();
    const ctx = { tenantId, branchId };
    const dbName = `tra-vfd-chain-${randomUUID()}`;
    const local = new LocalIndexedDbStore(5, dbName);
    await local.ready;
    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "TRA Chain Certification",
          slug,
          branches: { create: { id: branchId, name: "Main", code: `TVF-${branchId.slice(0, 6)}` } },
        },
      });
      await prisma.traVfdConfig.create({
        data: { id: randomUUID(), tenantId, branchId, enabled: true, endpoint: "https://vfd.example.test" },
      });

      local.saveConfigurationLocal("tra_vfd_config", {
        enabled: true,
        endpoint: "https://vfd.example.test",
      }, ctx as any);
      await local.flushPersistence();

      const firstPayload = {
        receiptNumber: "R-1001",
        createdAt: "2026-10-02T07:00:00.000Z",
        grandTotal: 1000,
        taxTotal: 180,
      };
      const secondPayload = {
        receiptNumber: "R-1002",
        createdAt: "2026-10-02T07:01:00.000Z",
        grandTotal: 2000,
        taxTotal: 360,
      };
      const localFirst = await enqueueTraVfdOutbox(local, ctx as any, {
        transactionId: "TX-1001",
        deviceId,
        payload: firstPayload,
      });
      const localSecond = await enqueueTraVfdOutbox(local, ctx as any, {
        transactionId: "TX-1002",
        deviceId,
        payload: secondPayload,
      });
      expect(localFirst?.chainSequence).toBe(1);
      expect(localSecond?.chainSequence).toBe(2);
      expect(localFirst?.previousReceiptHash).toBe("GENESIS");
      expect(localSecond?.previousReceiptHash).toBe(localFirst?.receiptHash);

      // Submit the second offline receipt first: the server must reject reordering.
      await expect(service.enqueue(ctx, {
        transactionId: "TX-1002",
        deviceId,
        chainSequence: localSecond!.chainSequence,
        previousReceiptHash: localSecond!.previousReceiptHash,
        receiptHash: localSecond!.receiptHash,
        payload: secondPayload,
      })).rejects.toThrow("TRA_VFD_FISCAL_CHAIN_CONFLICT");

      const serverFirst = await service.enqueue(ctx, {
        transactionId: "TX-1001",
        deviceId,
        chainSequence: localFirst!.chainSequence,
        previousReceiptHash: localFirst!.previousReceiptHash,
        receiptHash: localFirst!.receiptHash,
        payload: firstPayload,
      });
      const serverSecond = await service.enqueue(ctx, {
        transactionId: "TX-1002",
        deviceId,
        chainSequence: localSecond!.chainSequence,
        previousReceiptHash: localSecond!.previousReceiptHash,
        receiptHash: localSecond!.receiptHash,
        payload: secondPayload,
      });

      expect(serverFirst.chainSequence).toBe(localFirst!.chainSequence);
      expect(serverFirst.receiptHash).toBe(localFirst!.receiptHash);
      expect(serverSecond.chainSequence).toBe(localSecond!.chainSequence);
      expect(serverSecond.previousReceiptHash).toBe(localSecond!.previousReceiptHash);
      expect(serverSecond.receiptHash).toBe(localSecond!.receiptHash);
      expect(localSecond!.receiptHash).toBe(
        hash(localFirst!.receiptHash!, "R-1002", secondPayload.createdAt, 2000, 360),
      );

      const trigger = await prisma.$queryRawUnsafe<Array<{ tgname: string; tgenabled: string }>>(
        `SELECT tgname,tgenabled FROM pg_trigger
         WHERE tgrelid='tra_vfd_fiscalizations'::regclass
         AND NOT tgisinternal
         AND tgname='tra_vfd_fiscal_chain_immutable'`,
      );
      expect(trigger).toHaveLength(1);
      expect(trigger[0].tgenabled).toBe("O");
      await expect(
        prisma.traVfdFiscalization.update({
          where: { id: serverFirst.id },
          data: { receiptHash: "tampered" },
        }),
      ).rejects.toThrow("TRA_VFD_FISCAL_RECORD_IMMUTABLE");

      await expect(
        prisma.traVfdFiscalization.update({
          where: { id: serverFirst.id },
          data: { requestPayload: { ...firstPayload, grandTotal: 999999 } as any },
        }),
      ).rejects.toThrow("TRA_VFD_FISCAL_RECORD_IMMUTABLE");

      await expect(
        prisma.traVfdFiscalization.delete({ where: { id: serverFirst.id } }),
      ).rejects.toThrow("TRA_VFD_FISCAL_RECORD_IMMUTABLE");

      const persisted = await prisma.traVfdFiscalization.findUniqueOrThrow({
        where: { id: serverFirst.id },
      });
      expect(persisted.chainSequence).toBe(1);
      expect(persisted.previousReceiptHash).toBe("GENESIS");
      expect(persisted.receiptHash).toBe(localFirst!.receiptHash);

      const chainRows = await prisma.$queryRawUnsafe<Array<{
        chainSequence: number;
        previousReceiptHash: string | null;
        receiptHash: string | null;
      }>>(
        `SELECT "chainSequence","previousReceiptHash","receiptHash"
         FROM "tra_vfd_fiscalizations"
         WHERE "tenantId"=$1 AND "branchId"=$2 AND "deviceId"=$3
         ORDER BY "chainSequence"`,
        tenantId, branchId, deviceId,
      );
      expect(chainRows).toHaveLength(2);
      expect(chainRows[0].chainSequence).toBe(1);
      expect(chainRows[0].previousReceiptHash).toBe("GENESIS");
      expect(chainRows[1].chainSequence).toBe(2);
      expect(chainRows[1].previousReceiptHash).toBe(chainRows[0].receiptHash);
      expect(chainRows[0].receiptHash).toBe(
        hash("GENESIS", "R-1001", firstPayload.createdAt, 1000, 180),
      );
    } finally {
      local.clear({ allowDestructiveReset: true });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
