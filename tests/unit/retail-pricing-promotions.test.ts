import { describe, expect, it } from "vitest";
import { applyRetailPricingPromotions } from "../../apps/api/src/services/retailParityService.js";

const now = new Date("2026-10-10T10:00:00.000Z");

function promo(overrides: Record<string, unknown> = {}) {
  return {
    id: "promo-1",
    name: "Test promotion",
    kind: "BUY_X_GET_Y",
    value: 100,
    variantId: null,
    rewardVariantId: null,
    buyQuantity: 2,
    getQuantity: 1,
    minQuantity: null,
    minOrderAmount: null,
    startAt: new Date("2026-10-09T00:00:00.000Z"),
    endAt: new Date("2026-10-11T00:00:00.000Z"),
    isActive: true,
    stackable: false,
    priority: 10,
    ...overrides,
  };
}

const line = (variantId: string, quantity: number, unitPrice: number, discountAmount = 0) => ({
  productId: "product-" + variantId,
  variantId,
  quantity,
  unitPrice,
  unitCost: unitPrice / 2,
  discountAmount,
});

describe("Retail pricing promotion engine", () => {
  it("applies Buy-X-Get-Y free units to the least expensive eligible line", () => {
    const result = applyRetailPricingPromotions(
      [line("buy", 2, 10), line("reward", 1, 5)],
      [promo({ variantId: "buy", rewardVariantId: "reward" })],
      now,
    );
    expect(result.items[0].discountAmount).toBe(0);
    expect(result.items[1].discountAmount).toBe(5);
    expect(result.incrementalDiscount).toBe(5);
    expect(result.appliedPromotions).toEqual([{ id: "promo-1", name: "Test promotion", discountAmount: 5 }]);
  });

  it("requires enough units for an all-in-one-variant Buy-X-Get-Y promotion", () => {
    const result = applyRetailPricingPromotions(
      [line("one-sku", 2, 10)],
      [promo({ variantId: "one-sku" })],
      now,
    );
    expect(result.incrementalDiscount).toBe(0);
    const eligible = applyRetailPricingPromotions(
      [line("one-sku", 3, 10)],
      [promo({ variantId: "one-sku" })],
      now,
    );
    expect(eligible.items[0].discountAmount).toBe(10);
    expect(eligible.incrementalDiscount).toBe(10);
  });

  it("applies volume discounts only after the qualified quantity threshold", () => {
    const volume = promo({ kind: "QUANTITY_VOLUME_DISCOUNT", value: 15, buyQuantity: null, getQuantity: null, minQuantity: 3 });
    const below = applyRetailPricingPromotions([line("sku", 2, 10)], [volume], now);
    expect(below.incrementalDiscount).toBe(0);
    const above = applyRetailPricingPromotions([line("sku", 3, 10)], [volume], now);
    expect(above.incrementalDiscount).toBe(4.5);
  });

  it("rejects expired or inactive promotions and checks minimum order value", () => {
    const expired = promo({ endAt: new Date("2026-10-10T09:59:59.000Z") });
    const inactive = promo({ isActive: false, id: "inactive" });
    const minOrder = promo({ minOrderAmount: 100 });
    const result = applyRetailPricingPromotions([line("sku", 3, 10)], [expired, inactive, minOrder], now);
    expect(result.incrementalDiscount).toBe(0);
    expect(result.appliedPromotions).toEqual([]);
  });

  it("never discounts more than line gross and preserves pre-existing discounts", () => {
    const result = applyRetailPricingPromotions(
      [line("sku", 1, 10, 8)],
      [promo({ kind: "PERCENTAGE", value: 100, variantId: "sku" })],
      now,
    );
    expect(result.items[0].discountAmount).toBe(10);
    expect(result.incrementalDiscount).toBe(2);
  });

  it("does not apply the same non-stackable promotion twice to the same lines", () => {
    const first = promo({ id: "first", kind: "PERCENTAGE", value: 10, variantId: "sku", priority: 20 });
    const second = promo({ id: "second", kind: "PERCENTAGE", value: 10, variantId: "sku", priority: 10 });
    const result = applyRetailPricingPromotions([line("sku", 1, 100)], [first, second], now);
    expect(result.incrementalDiscount).toBe(10);
    expect(result.appliedPromotions.map((item) => item.id)).toEqual(["first"]);
  });
});
