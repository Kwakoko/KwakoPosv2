import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { TenantContext } from "@kwakopos2/contracts";
import { prisma } from "@kwakopos2/database";
import { RetailService } from "../../apps/api/src/services/retailService.js";

describe("Retail durable promotion and audit lifecycle", () => {
  const tenantId = randomUUID();
  const branchId = randomUUID();
  const ctx: TenantContext = {
    tenantId,
    branchId,
    userId: randomUUID(),
    roles: ["ADMIN"],
    permissions: ["*"],
  };
  const service = new RetailService();

  // Each test uses a unique tenant. Do not delete audit events: the database
  // enforces append-only audit retention by rejecting UPDATE and DELETE.

  it("persists supported promotions and audit events across service instances", async () => {
    await prisma.tenant.create({
      data: { id: tenantId, name: "Retail Persistence Test", slug: "retail-persist-" + tenantId.slice(0, 8) },
    });
    await prisma.branch.create({
      data: { id: branchId, tenantId, name: "Retail Main", code: "RTL-" + branchId.slice(0, 8) },
    });

    const now = new Date();
    const promo = await service.createPromotion(ctx, {
      branchId,
      name: "Weekend Discount",
      type: "PERCENTAGE_DISCOUNT",
      discountValue: 15,
      startDate: now,
      endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      isActive: true,
    });

    expect(promo.tenantId).toBe(tenantId);
    expect(promo.branchId).toBe(branchId);
    expect(promo.type).toBe("PERCENTAGE_DISCOUNT");

    const saved = await prisma.pricingPromotion.findFirst({
      where: { id: promo.id, tenantId, branchId, sourceModule: "RETAIL" },
    });
    expect(saved).not.toBeNull();
    expect(Number(saved?.value)).toBe(15);

    const secondInstance = new RetailService();
    const visible = await secondInstance.getPromotions(ctx);
    expect(visible.some((item) => item.id === promo.id)).toBe(true);

    const events = await secondInstance.getAuditEvents(ctx);
    expect(events.some((event) => event.entityId === promo.id && event.action === "RETAIL_PROMOTION_CREATED")).toBe(true);
  });

  it("keeps loyalty points append-only, idempotent, tenant/branch scoped, and balance-safe", async () => {
    const customerId = randomUUID();
    await prisma.customer.create({
      data: {
        id: customerId, tenantId, branchId,
        customerCode: "LOY-" + customerId.slice(0, 8).toUpperCase(),
        name: "Loyalty Ledger Test Customer",
      },
    });

    const { globalRetailParityService } = await import("../../apps/api/src/services/retailParityService.js");
    await globalRetailParityService.saveLoyaltyProgram(ctx, {
      currencyUnitsPerPoint: 100,
      currencyValuePerPoint: 0.01,
      maxRedemptionPct: 100,
      isActive: true,
    });

    const earn = await globalRetailParityService.adjustLoyaltyPoints(ctx, {
      customerId, pointsDelta: 100, idempotencyKey: "loyalty-adjust-" + randomUUID(),
      reason: "Opening points adjustment for integration test",
    });
    expect(earn.pointsBalance).toBe(100);
    expect(earn.duplicate).toBe(false);

    const duplicateAdjustment = await globalRetailParityService.adjustLoyaltyPoints(ctx, {
      customerId, pointsDelta: 100, idempotencyKey: earn.entry.idempotencyKey,
      reason: "Retry the exact opening points adjustment",
    });
    expect(duplicateAdjustment.pointsBalance).toBe(100);
    expect(duplicateAdjustment.duplicate).toBe(true);

    const quote = await globalRetailParityService.quoteLoyaltyRedemption(ctx, {
      customerId, points: 50, basketAmount: 10,
    });
    expect(quote.pointsRemaining).toBe(50);
    expect(quote.monetaryValue).toBe(0.5);
    expect(quote.requiresCheckout).toBe(true);

    await expect(globalRetailParityService.adjustLoyaltyPoints(ctx, {
      customerId, pointsDelta: -500, idempotencyKey: "loyalty-overdraw-" + randomUUID(),
      reason: "Rejected attempt to overdraw points",
    })).rejects.toThrow("LOYALTY_INSUFFICIENT_POINTS");

    const otherBranchId = randomUUID();
    await prisma.branch.create({
      data: { id: otherBranchId, tenantId, name: "Other Loyalty Branch", code: "LOY-" + otherBranchId.slice(0, 8) },
    });
    await expect(globalRetailParityService.getLoyaltyBalance({ ...ctx, branchId: otherBranchId }, customerId))
      .rejects.toThrow("LOYALTY_CUSTOMER_NOT_FOUND_IN_ACTIVE_SCOPE");

    const ledger = await prisma.loyaltyLedgerEntry.findMany({ where: { tenantId, branchId, customerId } });
    expect(ledger).toHaveLength(1);
    await expect(prisma.loyaltyLedgerEntry.update({
      where: { id: ledger[0].id },
      data: { reason: "Attempted mutation must fail" },
    })).rejects.toThrow(/LOYALTY_LEDGER_APPEND_ONLY/);
  });

  it("persists Buy-X-Get-Y rule fields and serves the same semantics through a new service instance", async () => {
    const promo = await service.createPromotion(ctx, {
      branchId,
      name: "Buy Two Get One",
      type: "BUY_X_GET_Y",
      discountValue: 100,
      buyQuantity: 2,
      getQuantity: 1,
      startDate: new Date(Date.now() - 60_000),
      endDate: new Date(Date.now() + 60_000),
      isActive: true,
    });

    expect(promo.type).toBe("BUY_X_GET_Y");
    expect(promo.buyQuantity).toBe(2);
    expect(promo.getQuantity).toBe(1);

    const saved = await prisma.pricingPromotion.findFirst({
      where: { id: promo.id, tenantId, branchId, sourceModule: "RETAIL" },
    });
    expect(saved?.kind).toBe("BUY_X_GET_Y");
    expect(Number(saved?.buyQuantity)).toBe(2);
    expect(Number(saved?.getQuantity)).toBe(1);

    const secondInstance = new RetailService();
    const visible = await secondInstance.getPromotions(ctx);
    expect(visible.find((item) => item.id === promo.id)).toMatchObject({
      type: "BUY_X_GET_Y",
      buyQuantity: 2,
      getQuantity: 1,
    });
  });
});
