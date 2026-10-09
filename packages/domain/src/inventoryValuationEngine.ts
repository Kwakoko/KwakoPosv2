import type { StockLedger, ProductVariant } from "@kwakopos2/contracts";
import { calculateAvailableStock } from "./index.js";
import { assertInventoryFinancialReconciliation } from "./financeInvariants.js";

export type ValuationMethod = "WEIGHTED_AVERAGE" | "FIFO" | "STANDARD_COST";

export interface VariantInventorySummary {
  variantId: string;
  variantName: string;
  sku: string;
  availableQuantity: number;
  unitCost: number;
  totalValuation: number;
}

export class InventoryValuationEngine {
  /**
   * Calculates the authoritative Weighted Average Unit Cost for a variant.
   * Total Cost of Purchases / Total Quantity Purchased
   */
  static calculateWeightedAverageCost(
    variant: ProductVariant,
    purchaseReceipts: { quantityReceived: number; unitCost: number }[]
  ): number {
    if (!purchaseReceipts || purchaseReceipts.length === 0) {
      return Number(variant.costPrice) || 0;
    }

    let totalCost = 0;
    let totalQty = 0;
    for (const receipt of purchaseReceipts) {
      totalCost += Number(receipt.quantityReceived) * Number(receipt.unitCost);
      totalQty += Number(receipt.quantityReceived);
    }

    if (totalQty <= 0) return Number(variant.costPrice) || 0;
    return Math.round((totalCost / totalQty) * 100) / 100;
  }

  /**
   * Calculates total inventory valuation across all active variants for a branch.
   */
  static calculateBranchInventoryValuation(
    variants: ProductVariant[],
    ledgers: StockLedger[],
    valuationMethod: ValuationMethod = "WEIGHTED_AVERAGE"
  ): {
    totalValuation: number;
    variantSummaries: VariantInventorySummary[];
  } {
    const variantSummaries: VariantInventorySummary[] = [];
    let grandTotalValuation = 0;

    for (const v of variants) {
      const variantLedgers = ledgers.filter((l) => l.variantId === v.id).slice().sort((a, b) =>
        new Date(a.occurredAt || a.createdAt || 0).getTime() - new Date(b.occurredAt || b.createdAt || 0).getTime()
      );
      let availableQty = 0;
      let unitCost = Number(v.costPrice) || 0;
      for (const ledger of variantLedgers) {
        const rawQty = Number(ledger.quantityChange !== undefined ? ledger.quantityChange : ledger.quantity);
        if (!Number.isFinite(rawQty) || rawQty === 0) continue;
        const inbound = ["OPENING_STOCK","OPENING","PURCHASE_RECEIVE","PURCHASE","TRANSFER_IN","CUSTOMER_RETURN","RETURN","ADJUSTMENT_GAIN","PRODUCTION_OUTPUT"].includes(ledger.movementType) && rawQty >= 0;
        const outbound = rawQty < 0 || ["SALE","SUPPLIER_RETURN","TRANSFER_OUT","DAMAGE","EXPIRY","ADJUSTMENT_LOSS","PRODUCTION_USAGE"].includes(ledger.movementType);
        if (inbound) {
          const receivedQty = Math.abs(rawQty);
          const receiptCost = Number(ledger.unitCost) || 0;
          unitCost = Math.round(((availableQty * unitCost + receivedQty * receiptCost) / (availableQty + receivedQty)) * 100) / 100;
          availableQty += receivedQty;
        } else if (outbound) {
          availableQty = Math.max(0, availableQty - Math.abs(rawQty));
        } else {
          availableQty = Math.max(0, availableQty + rawQty);
        }
      }
      const totalValuation = Math.max(0, Math.round(availableQty * unitCost * 100) / 100);

      variantSummaries.push({
        variantId: v.id,
        variantName: v.name,
        sku: v.sku,
        availableQuantity: availableQty,
        unitCost,
        totalValuation,
      });

      grandTotalValuation += totalValuation;
    }

    return {
      totalValuation: Math.round(grandTotalValuation * 100) / 100,
      variantSummaries,
    };
  }

  /**
   * Reconciles physical/ledger inventory valuation with General Ledger Account 1410 balance.
   */
  static reconcileStockToGeneralLedger(
    glInventoryAccountBalance: number,
    calculatedLedgerValuation: number
  ): {
    glBalance: number;
    valuation: number;
    variance: number;
    isReconciled: boolean;
  } {
    const gl = Math.round(glInventoryAccountBalance * 100) / 100;
    const val = Math.round(calculatedLedgerValuation * 100) / 100;
    const variance = Math.round((gl - val) * 100) / 100;

    return {
      glBalance: gl,
      valuation: val,
      variance,
      isReconciled: Math.abs(variance) <= 0.01,
    };
  }
}
