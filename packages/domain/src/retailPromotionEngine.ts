export interface RetailPromotionLine {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
  [key: string]: unknown;
}

export interface RetailPromotionRule {
  id: string;
  name: string;
  kind: string;
  value: number | string | { toString(): string };
  variantId?: string | null;
  rewardVariantId?: string | null;
  buyQuantity?: number | string | null;
  getQuantity?: number | string | null;
  minQuantity?: number | string | null;
  minOrderAmount?: number | string | null;
  startAt: Date | string;
  endAt: Date | string;
  isActive: boolean;
  stackable?: boolean;
  priority?: number;
}

export interface AppliedRetailPromotion {
  id: string;
  name: string;
  discountAmount: number;
}

export interface RetailPromotionResult {
  items: RetailPromotionLine[];
  appliedPromotions: AppliedRetailPromotion[];
  incrementalDiscount: number;
}

const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Deterministic, server-side retail price rule calculator.
 * Inputs must already contain server-authoritative unit prices and validated tenant/branch variants.
 * It only computes discounts; callers persist sale, payments and promotion evidence atomically.
 */
export function applyRetailPricingPromotions(
  inputLines: RetailPromotionLine[],
  promotions: RetailPromotionRule[],
  at: Date = new Date(),
): RetailPromotionResult {
  const items = inputLines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPrice = Number(line.unitPrice);
    const discountAmount = Number(line.discountAmount || 0);
    if (!Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitPrice) || unitPrice < 0 ||
        !Number.isFinite(discountAmount) || discountAmount < 0 ||
        discountAmount > roundMoney(quantity * unitPrice) + 0.005) {
      throw new Error("RETAIL_PROMOTION_CART_LINE_INVALID");
    }
    return { ...line, quantity, unitPrice, discountAmount: roundMoney(discountAmount) };
  });
  const gross = (line: RetailPromotionLine) => roundMoney(Number(line.quantity) * Number(line.unitPrice));
  const baseSubtotal = roundMoney(items.reduce((sum, line) => sum + gross(line), 0));
  const nonStackableBlocked = new Set<number>();
  const appliedPromotions: AppliedRetailPromotion[] = [];
  const active = promotions
    .filter((promo) => {
      const start = new Date(promo.startAt).getTime();
      const end = new Date(promo.endAt).getTime();
      return promo.isActive && Number.isFinite(Number(promo.value)) &&
        Number.isFinite(start) && Number.isFinite(end) && start <= at.getTime() && end > at.getTime();
    })
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || a.id.localeCompare(b.id));

  for (const promo of active) {
    const value = Number(promo.value);
    if (value < 0) continue;
    if (promo.minOrderAmount != null) {
      const threshold = Number(promo.minOrderAmount);
      if (!Number.isFinite(threshold) || threshold < 0 || baseSubtotal < threshold) continue;
    }
    const eligible = items
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => !nonStackableBlocked.has(index) &&
        (!promo.variantId || String(line.variantId) === String(promo.variantId)));
    if (!eligible.length) continue;

    const before = items.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0);
    const room = (index: number) => Math.max(0, roundMoney(gross(items[index]) - Number(items[index].discountAmount || 0)));
    const addDiscount = (index: number, requested: number) => {
      if (!Number.isFinite(requested) || requested <= 0) return 0;
      const applied = roundMoney(Math.min(room(index), requested));
      if (applied <= 0) return 0;
      items[index].discountAmount = roundMoney(Number(items[index].discountAmount || 0) + applied);
      return applied;
    };
    const kind = String(promo.kind).toUpperCase();
    if (kind === "PERCENTAGE" || kind === "PERCENTAGE_DISCOUNT") {
      if (value > 100) continue;
      for (const { index } of eligible) addDiscount(index, gross(items[index]) * value / 100);
    } else if (kind === "FIXED" || kind === "FIXED_AMOUNT_DISCOUNT") {
      let remaining = value;
      for (const { index } of eligible) {
        const applied = addDiscount(index, remaining);
        remaining = roundMoney(remaining - applied);
        if (remaining <= 0) break;
      }
    } else if (kind === "QUANTITY_VOLUME_DISCOUNT") {
      const minQuantity = Number(promo.minQuantity);
      if (!Number.isFinite(minQuantity) || minQuantity <= 0 || value > 100) continue;
      const quantity = eligible.reduce((sum, item) => sum + Number(item.line.quantity), 0);
      if (quantity < minQuantity) continue;
      for (const { index } of eligible) addDiscount(index, gross(items[index]) * value / 100);
    } else if (kind === "BUY_X_GET_Y") {
      const buyQuantity = Number(promo.buyQuantity);
      const getQuantity = Number(promo.getQuantity);
      if (!Number.isSafeInteger(buyQuantity) || buyQuantity <= 0 ||
          !Number.isSafeInteger(getQuantity) || getQuantity <= 0 || value > 100) continue;
      const boughtLines = items.filter((line) => !promo.variantId || String(line.variantId) === String(promo.variantId));
      const bought = boughtLines.reduce((sum, line) => sum + Number(line.quantity), 0);
      const rewardVariantId = promo.rewardVariantId ? String(promo.rewardVariantId) : (promo.variantId ? String(promo.variantId) : null);
      const rewardLines = items.map((line, index) => ({ line, index }))
        .filter(({ line, index }) => !nonStackableBlocked.has(index) &&
          (!rewardVariantId || String(line.variantId) === rewardVariantId))
        .sort((a, b) => Number(a.line.unitPrice) - Number(b.line.unitPrice) || a.index - b.index);
      const rewardsAvailable = rewardLines.reduce((sum, item) => sum + Number(item.line.quantity), 0);
      const earnedRewards = promo.rewardVariantId
        ? Math.floor(bought / buyQuantity) * getQuantity
        : Math.floor(bought / (buyQuantity + getQuantity)) * getQuantity;
      let rewardUnits = Math.min(rewardsAvailable, earnedRewards);
      for (const { index, line } of rewardLines) {
        if (rewardUnits <= 0) break;
        const eligibleUnits = Math.min(Number(line.quantity), rewardUnits);
        addDiscount(index, eligibleUnits * Number(line.unitPrice) * value / 100);
        rewardUnits -= eligibleUnits;
      }
    } else {
      continue;
    }

    const after = items.reduce((sum, line) => sum + Number(line.discountAmount || 0), 0);
    const appliedAmount = roundMoney(after - before);
    if (appliedAmount > 0) {
      appliedPromotions.push({ id: promo.id, name: promo.name, discountAmount: appliedAmount });
      if (promo.stackable !== true) {
        for (const { index } of eligible) {
          if (Number(items[index].discountAmount || 0) > Number(inputLines[index].discountAmount || 0)) {
            nonStackableBlocked.add(index);
          }
        }
      }
    }
  }

  const incrementalDiscount = roundMoney(
    items.reduce((sum, line, index) => sum + Math.max(0,
      Number(line.discountAmount || 0) - Number(inputLines[index].discountAmount || 0)), 0),
  );
  return { items, appliedPromotions, incrementalDiscount };
}
