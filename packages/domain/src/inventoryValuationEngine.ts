import type { StockLedger, ProductVariant } from "@kwakopos2/contracts";

export type ValuationMethod = "WEIGHTED_AVERAGE" | "FIFO" | "STANDARD_COST";

export interface VariantInventorySummary {
  variantId: string;
  variantName: string;
  sku: string;
  availableQuantity: number;
  unitCost: number;
  totalValuation: number;
}

interface ValuationResult {
  quantity: number;
  unitCost: number;
  totalValuation: number;
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function normalizeCost(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sortLedger(ledgers: StockLedger[]): StockLedger[] {
  return [...ledgers].sort((a, b) => {
    const occurred = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (occurred !== 0) return occurred;
    const created = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (created !== 0) return created;
    return a.id.localeCompare(b.id);
  });
}

function calculateMovingWeightedAverage(
  variant: ProductVariant,
  ledgers: StockLedger[],
): ValuationResult {
  let quantity = 0;
  let averageCost = 0;
  const fallbackCost = normalizeCost(variant.costPrice);

  for (const row of sortLedger(ledgers)) {
    const change = Number(row.quantityChange ?? 0);
    if (!Number.isFinite(change) || change === 0) continue;

    if (change > 0) {
      const rowCost = normalizeCost(row.unitCost);
      const incomingCost = rowCost > 0
        ? rowCost
        : quantity > 0
          ? averageCost
          : fallbackCost;

      if (quantity <= 0) {
        quantity = change;
        averageCost = incomingCost;
      } else {
        const totalCost = (quantity * averageCost) + (change * incomingCost);
        quantity += change;
        averageCost = totalCost / quantity;
      }
    } else {
      quantity = Math.max(0, quantity + change);
      if (quantity === 0) averageCost = 0;
    }
  }

  quantity = Math.max(0, quantity);
  return {
    quantity,
    unitCost: quantity > 0 ? roundMoney(averageCost) : 0,
    totalValuation: roundMoney(quantity * averageCost),
  };
}

function calculateFifo(
  variant: ProductVariant,
  ledgers: StockLedger[],
): ValuationResult {
  type Layer = { quantity: number; unitCost: number };
  const layers: Layer[] = [];
  const fallbackCost = normalizeCost(variant.costPrice);

  for (const row of sortLedger(ledgers)) {
    const change = Number(row.quantityChange ?? 0);
    if (!Number.isFinite(change) || change === 0) continue;

    if (change > 0) {
      const rowCost = normalizeCost(row.unitCost);
      const unitCost = rowCost > 0
        ? rowCost
        : layers.length > 0
          ? layers[layers.length - 1].unitCost
          : fallbackCost;
      layers.push({ quantity: change, unitCost });
      continue;
    }

    let remainingToIssue = Math.abs(change);
    while (remainingToIssue > 0 && layers.length > 0) {
      const layer = layers[0];
      const consumed = Math.min(layer.quantity, remainingToIssue);
      layer.quantity -= consumed;
      remainingToIssue -= consumed;
      if (layer.quantity <= 0) layers.shift();
    }
  }

  const quantity = layers.reduce((sum, layer) => sum + layer.quantity, 0);
  const totalValuation = layers.reduce(
    (sum, layer) => sum + layer.quantity * layer.unitCost,
    0,
  );
  return {
    quantity: Math.max(0, quantity),
    unitCost: quantity > 0 ? roundMoney(totalValuation / quantity) : 0,
    totalValuation: roundMoney(totalValuation),
  };
}

function calculateStandardCost(
  variant: ProductVariant,
  ledgers: StockLedger[],
): ValuationResult {
  const quantity = Math.max(
    0,
    ledgers.reduce((sum, row) => sum + Number(row.quantityChange ?? 0), 0),
  );
  const unitCost = normalizeCost(variant.costPrice);
  return {
    quantity,
    unitCost: roundMoney(unitCost),
    totalValuation: roundMoney(quantity * unitCost),
  };
}

export class InventoryValuationEngine {
  static calculateWeightedAverageCost(
    variant: ProductVariant,
    purchaseReceipts: { quantityReceived: number; unitCost: number }[],
  ): number {
    if (!purchaseReceipts || purchaseReceipts.length === 0) {
      return normalizeCost(variant.costPrice);
    }

    let totalCost = 0;
    let totalQty = 0;
    for (const receipt of purchaseReceipts) {
      const qty = Number(receipt.quantityReceived);
      const cost = Number(receipt.unitCost);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost < 0) continue;
      totalCost += qty * cost;
      totalQty += qty;
    }

    if (totalQty <= 0) return normalizeCost(variant.costPrice);
    return roundMoney(totalCost / totalQty);
  }

  static calculateBranchInventoryValuation(
    variants: ProductVariant[],
    ledgers: StockLedger[],
    valuationMethod: ValuationMethod = "WEIGHTED_AVERAGE",
  ): {
    totalValuation: number;
    variantSummaries: VariantInventorySummary[];
  } {
    const variantSummaries: VariantInventorySummary[] = [];

    for (const variant of variants) {
      const variantLedgers = ledgers.filter((ledger) => ledger.variantId === variant.id);
      let valuation: ValuationResult;

      switch (valuationMethod) {
        case "FIFO":
          valuation = calculateFifo(variant, variantLedgers);
          break;
        case "STANDARD_COST":
          valuation = calculateStandardCost(variant, variantLedgers);
          break;
        case "WEIGHTED_AVERAGE":
        default:
          valuation = calculateMovingWeightedAverage(variant, variantLedgers);
          break;
      }

      variantSummaries.push({
        variantId: variant.id,
        variantName: variant.name,
        sku: variant.sku,
        availableQuantity: valuation.quantity,
        unitCost: valuation.unitCost,
        totalValuation: valuation.totalValuation,
      });
    }

    return {
      totalValuation: roundMoney(
        variantSummaries.reduce((sum, summary) => sum + summary.totalValuation, 0),
      ),
      variantSummaries,
    };
  }

  static reconcileStockToGeneralLedger(
    glInventoryAccountBalance: number,
    calculatedLedgerValuation: number,
  ): {
    glBalance: number;
    valuation: number;
    variance: number;
    isReconciled: boolean;
  } {
    const gl = roundMoney(glInventoryAccountBalance);
    const val = roundMoney(calculatedLedgerValuation);
    const variance = roundMoney(gl - val);

    return {
      glBalance: gl,
      valuation: val,
      variance,
      isReconciled: Math.abs(variance) <= 0.01,
    };
  }
}
