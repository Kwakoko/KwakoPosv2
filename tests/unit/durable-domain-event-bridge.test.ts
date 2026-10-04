import { describe, expect, it, vi } from "vitest";
import {
  buildDomainEvent,
  domainEventTypeForOperation,
  persistDomainEvent,
} from "../../packages/sync/src/durableDomainEventBridge.js";

const ctx = {
  tenantId: "tenant-event-test",
  branchId: "branch-event-test",
  userId: "user-event-test",
  roles: ["OWNER"],
} as any;

describe("Durable domain event bridge", () => {
  it("maps synchronizable operations to typed domain events", () => {
    expect(domainEventTypeForOperation("Product", "CREATE")).toBe("PRODUCT_CREATED");
    expect(domainEventTypeForOperation("Payment", "CREATE")).toBe("PAYMENT_PROCESSED");
    expect(domainEventTypeForOperation("StockAdjustment", "CREATE")).toBe("STOCK_MOVEMENT_RECORDED");
    expect(domainEventTypeForOperation("Customer", "UPDATE")).toBe("CUSTOMER_UPDATED");
  });

  it("builds tenant/branch-scoped deterministic event identities", () => {
    const op = {
      operationId: "op-event-1",
      idempotencyKey: "device-1/op-event-1",
      entityType: "Product",
      entityId: "product-1",
      operationType: "CREATE",
      payload: { name: "Event Product" },
      clientCreatedAt: new Date().toISOString(),
    } as any;

    const event = buildDomainEvent(ctx, op, { id: "product-1", name: "Event Product" }, "42");

    expect(event.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(event.tenantId).toBe(ctx.tenantId);
    expect(event.branchId).toBe(ctx.branchId);
    expect(event.eventType).toBe("PRODUCT_CREATED");
    expect(event.payload.revision).toBe("42");
  });

  it("persists exactly once against a duplicate event identity", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      $executeRawUnsafe: vi.fn(async (sql: string, ...params: unknown[]) => {
        calls.push({ sql, params });
      }),
    };

    const event = buildDomainEvent(
      ctx,
      {
        operationId: "op-event-2",
        idempotencyKey: "device-1/op-event-2",
        entityType: "Customer",
        entityId: "customer-1",
        operationType: "CREATE",
        payload: { name: "Event Customer" },
      } as any,
      { id: "customer-1", name: "Event Customer" },
      "43",
    );

    await persistDomainEvent(db, event, "test");
    const insert = calls.find((c) => c.sql.includes("INSERT INTO domain_event_journal"));
    expect(insert).toBeDefined();
    expect(insert!.sql).toContain("ON CONFLICT (event_id) DO NOTHING");
    expect(insert!.params[0]).toBe(event.eventId);
  });
});
