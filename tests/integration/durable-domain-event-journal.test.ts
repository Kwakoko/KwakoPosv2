import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma, PrismaProductRepository, PrismaStockRepository } from "@kwakopos2/database";
import { PrismaSyncEngine } from "@kwakopos2/sync";

describe("Production durable domain-event bridge", () => {
  it("persists a domain event in the same PostgreSQL transaction as the sync operation", async () => {
    const tenantId = randomUUID();
    const branchId = randomUUID();
    const customerId = randomUUID();
    const operationId = randomUUID();
    const ctx: any = { tenantId, branchId, userId: randomUUID(), roles: ["OWNER"], permissions: ["*"] };
    const sync = new PrismaSyncEngine(new PrismaProductRepository(), new PrismaStockRepository());

    try {
      await prisma.tenant.create({
        data: {
          id: tenantId,
          name: "Domain Event Journal Test",
          slug: "domain-event-" + tenantId.slice(0, 8),
          branches: { create: { id: branchId, name: "Main", code: "DE-" + branchId.slice(0, 6) } },
        },
      });

      const result = await sync.processPush(ctx, {
        deviceId: "DEVICE-DOMAIN-EVENT-1",
        operations: [{
          operationId,
          entityType: "Customer",
          entityId: customerId,
          operationType: "CREATE",
          payload: {
            id: customerId,
            customerCode: "C-" + customerId.slice(0, 8),
            name: "Durable Event Customer",
          },
          clientCreatedAt: new Date().toISOString(),
          idempotencyKey: "DEVICE-DOMAIN-EVENT-1/" + operationId,
        }],
      });

      expect(result.results[0].status).toBe("SUCCESS");

      const rows = await prisma.$queryRawUnsafe<Array<{
        event_id: string;
        event_type: string;
        tenant_id: string;
        branch_id: string;
        published_at: Date | null;
      }>>(
        `SELECT event_id, event_type, tenant_id, branch_id, published_at
           FROM domain_event_journal
          WHERE tenant_id = $1
            AND branch_id = $2
            AND event_id = $3`,
        tenantId,
        branchId,
        "domain:" + operationId + ":CUSTOMER_CREATED",
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].event_type).toBe("CUSTOMER_CREATED");
      expect(rows[0].tenant_id).toBe(tenantId);
      expect(rows[0].branch_id).toBe(branchId);
      expect(rows[0].published_at).toBeTruthy();

      const syncRows = await prisma.$queryRawUnsafe<Array<{ operation_id: string }>>(
        `SELECT operation_id
           FROM sync_change_journal
          WHERE tenant_id = $1
            AND branch_id = $2
            AND operation_id = $3`,
        tenantId,
        branchId,
        operationId,
      );
      expect(syncRows).toHaveLength(1);
    } finally {
      await prisma.$executeRawUnsafe("DELETE FROM domain_event_journal WHERE tenant_id = $1", tenantId).catch(() => undefined);
      await prisma.$executeRawUnsafe("DELETE FROM sync_change_journal WHERE tenant_id = $1", tenantId).catch(() => undefined);
      await prisma.syncOperation.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.customer.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
  });
});
