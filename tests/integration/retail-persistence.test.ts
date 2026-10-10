import { afterEach, describe, expect, it } from "vitest";
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

  afterEach(async () => {
    await prisma.auditEvent.deleteMany({ where: { tenantId, branchId } });
    await prisma.pricingPromotion.deleteMany({ where: { tenantId, sourceModule: "RETAIL" } });
    await prisma.branch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

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

  it("fails closed for promotion types without implemented checkout semantics", async () => {
    await expect(service.createPromotion(ctx, {
      branchId,
      name: "Unsupported Buy One Get One",
      type: "BUY_X_GET_Y",
      discountValue: 1,
      buyQuantity: 1,
      getQuantity: 1,
      startDate: new Date(),
      endDate: new Date(Date.now() + 60_000),
      isActive: true,
    })).rejects.toThrow("RETAIL_PROMOTION_TYPE_UNSUPPORTED:BUY_X_GET_Y");
  });
});
