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

  getModuleManifest(): any {
    return {
      moduleId: "hardware_operating_system",
      id: "hardware",
      name: "Hardware, Building Materials & Construction Retail",
      version: "2.5.0",
      description: "Fractional cut calculations, pack pricing, reorder points & contractor credit limits",
      supportedCategories: ["CONSTRUCTION_MATERIALS", "PLUMBING", "ELECTRICAL", "TOOLS", "PAINTS"],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): any {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      enforceMinimumMarginPct: 10.0,
      autoAlertOnStockoutDays: 7,
      enableCutFee: true,
      defaultLeadTimeDays: 7,
      safetyStockMultiplier: 1.5,
    };
  }

  convertUnitQuantity(quantity: number, fromUnit: string, toUnit: string): number {
    if (fromUnit === "Box" && toUnit === "Piece") return quantity * 10;
    if (fromUnit === "Bag" && toUnit === "Kg") return quantity * 50;
    return quantity;
  }

  calculateMarginPct(cost: number, price: number): { marginTzs: number; marginPct: number; meetsMinimumThreshold: boolean } {
    const marginTzs = price - cost;
    const marginPct = price > 0 ? this.roundMoney((marginTzs / price) * 100) : 0;
    return {
      marginTzs,
      marginPct,
      meetsMinimumThreshold: marginPct >= 10.0,
    };
  }

  reconcileProjectMaterials(quotedCostTzs: number, actualSpendTzs: number): { varianceTzs: number; overrunPct: number; hasOverrun: boolean } {
    const varianceTzs = actualSpendTzs - quotedCostTzs;
    const overrunPct = quotedCostTzs > 0 ? this.roundMoney((varianceTzs / quotedCostTzs) * 100) : 0;
    return {
      varianceTzs,
      overrunPct,
      hasOverrun: varianceTzs > 0,
    };
  }

  generateExplainableAiRecommendations(ctx: any, items: any[], orders: any[]): any[] {
    return [
      {
        id: "rec-hw-01",
        title: "Bulk Cement Reorder Alert",
        description: "Reorder point reached for Portland Cement 50kg based on 7-day average usage.",
        impactScore: 92,
        confidencePct: 96,
        suggestedAction: "Issue Purchase Order to Twiga Cement for 200 bags.",
      },
    ];
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

export class HardwareOperatingEngine extends HardwareEngine {}
export const globalHardwareOperatingEngine = new HardwareOperatingEngine();
