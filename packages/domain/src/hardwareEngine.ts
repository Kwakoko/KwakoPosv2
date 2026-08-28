export interface HardwarePackRule {
  unitName: string;
  unitsPerPack: number;
  packPrice?: number;
}

export interface HardwareCutCharge {
  chargePerUnit: number;
  minimumCharge?: number;
}

export interface HardwarePricingResult {
  unitPrice: number;
  quantity: number;
  extendedPrice: number;
  priceBasis: "UNIT" | "PACK";
  packs?: number;
  looseUnits?: number;
}

/**
 * Hardware-specific pricing and quantity utilities.
 * The engine is deterministic and contains no persistence side effects.
 */
export class HardwareEngine {
  calculatePackPricing(
    quantity: number,
    baseUnitPrice: number,
    rule?: HardwarePackRule | null
  ): HardwarePricingResult {
    this.assertNonNegativeFinite(quantity, "quantity");
    this.assertNonNegativeFinite(baseUnitPrice, "baseUnitPrice");

    if (!rule) {
      return {
        unitPrice: baseUnitPrice,
        quantity,
        extendedPrice: this.roundMoney(quantity * baseUnitPrice),
        priceBasis: "UNIT",
      };
    }

    this.assertPositive(rule.unitsPerPack, "unitsPerPack");
    const packs = Math.floor(quantity / rule.unitsPerPack);
    const looseUnits = quantity % rule.unitsPerPack;

    if (rule.packPrice !== undefined) {
      this.assertNonNegativeFinite(rule.packPrice, "packPrice");
      const extendedPrice = packs * rule.packPrice + looseUnits * baseUnitPrice;
      return {
        unitPrice: this.roundMoney(extendedPrice / (quantity || 1)),
        quantity,
        extendedPrice: this.roundMoney(extendedPrice),
        priceBasis: "PACK",
        packs,
        looseUnits,
      };
    }

    return {
      unitPrice: baseUnitPrice,
      quantity,
      extendedPrice: this.roundMoney(quantity * baseUnitPrice),
      priceBasis: "PACK",
      packs,
      looseUnits,
    };
  }

  calculateCutCharge(
    quantity: number,
    charge: HardwareCutCharge
  ): number {
    this.assertNonNegativeFinite(quantity, "quantity");
    this.assertNonNegativeFinite(charge.chargePerUnit, "chargePerUnit");
    const raw = quantity * charge.chargePerUnit;
    const minimum = charge.minimumCharge ?? 0;
    this.assertNonNegativeFinite(minimum, "minimumCharge");
    return this.roundMoney(quantity === 0 ? 0 : Math.max(raw, minimum));
  }

  calculateReorderPoint(
    averageDailyUsage: number,
    leadTimeDays: number,
    safetyStockUnits: number
  ): number {
    this.assertNonNegativeFinite(averageDailyUsage, "averageDailyUsage");
    this.assertNonNegativeFinite(leadTimeDays, "leadTimeDays");
    this.assertNonNegativeFinite(safetyStockUnits, "safetyStockUnits");
    return Math.ceil(averageDailyUsage * leadTimeDays + safetyStockUnits);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private assertPositive(value: number, name: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`INVALID_HARDWARE_RULE: ${name} must be greater than zero.`);
    }
  }

  private assertNonNegativeFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`INVALID_HARDWARE_INPUT: ${name} must be a finite non-negative number.`);
    }
  }
}
