import { randomUUID } from "crypto";
import type {
  TenantContext,
  HardwareModuleManifest,
  HardwareSettings,
  HardwareProduct,
  HardwareProjectRequirement,
  HardwareAiRecommendation,
  UnitConversionRule,
} from "@kwakopos2/contracts";

export class HardwareOperatingEngine {
  getModuleManifest(): HardwareModuleManifest {
    return {
      moduleId: "hardware_operating_system",
      name: "KwakoPos Enterprise Hardware & Building Materials Operating System",
      version: "2.2.0",
      status: "ACTIVE",
      supportedCategories: [
        "CONSTRUCTION_MATERIALS",
        "PLUMBING",
        "ELECTRICAL",
        "TOOLS",
        "PAINT_FINISHING",
        "SAFETY_EQUIPMENT",
      ],
      permissions: [
        "HARDWARE_PRODUCT_VIEW",
        "HARDWARE_PRODUCT_MANAGE",
        "HARDWARE_UNIT_CONVERT",
        "HARDWARE_PURCHASING_MANAGE",
        "HARDWARE_WAREHOUSE_MANAGE",
        "HARDWARE_QUOTATION_MANAGE",
        "HARDWARE_PROJECT_MANAGE",
        "HARDWARE_DELIVERY_MANAGE",
        "HARDWARE_CREDIT_MANAGE",
        "HARDWARE_AI_ANALYTICS_VIEW",
      ],
      navigationRoutes: [
        "/hardware/products",
        "/hardware/purchasing",
        "/hardware/warehouses",
        "/hardware/quotations",
        "/hardware/projects",
        "/hardware/deliveries",
        "/hardware/credit-accounts",
        "/hardware/ai-insights",
      ],
      dashboardWidgetIds: [
        "widget_total_hardware_products",
        "widget_inventory_valuation",
        "widget_stockout_risks",
        "widget_active_projects",
        "widget_contractor_receivables",
      ],
    };
  }

  getDefaultSettings(tenantId: string, branchId: string): HardwareSettings {
    return {
      tenantId,
      branchId,
      currency: "TZS",
      enforceMinimumMarginPct: 10.0,
      allowContractorCreditOverRide: false,
      autoAlertOnStockoutDays: 7,
    };
  }

  convertUnitQuantity(
    quantity: number,
    fromUnit: string,
    toUnit: string,
    conversions: UnitConversionRule[] = []
  ): number {
    if (fromUnit.toUpperCase() === toUnit.toUpperCase()) return quantity;

    const rule = conversions.find(
      (c) => c.fromUnit.toUpperCase() === fromUnit.toUpperCase() && c.toUnit.toUpperCase() === toUnit.toUpperCase()
    );
    if (rule) return quantity * rule.multiplier;

    const inverseRule = conversions.find(
      (c) => c.fromUnit.toUpperCase() === toUnit.toUpperCase() && c.toUnit.toUpperCase() === fromUnit.toUpperCase()
    );
    if (inverseRule) return quantity / inverseRule.multiplier;

    // Standard conversions fallback
    if (fromUnit.toUpperCase() === "BOX" && toUnit.toUpperCase() === "PIECE") return quantity * 10;
    if (fromUnit.toUpperCase() === "BAG" && toUnit.toUpperCase() === "KG") return quantity * 50;

    return quantity;
  }

  calculateMarginPct(
    costPriceTzs: number,
    sellingPriceTzs: number
  ): {
    marginTzs: number;
    marginPct: number;
    meetsMinimumThreshold: boolean;
  } {
    const marginTzs = sellingPriceTzs - costPriceTzs;
    const marginPct = sellingPriceTzs > 0 ? (marginTzs / sellingPriceTzs) * 100 : 0;
    const minThreshold = 10.0;

    return {
      marginTzs: Math.round(marginTzs),
      marginPct: parseFloat(marginPct.toFixed(2)),
      meetsMinimumThreshold: marginPct >= minThreshold,
    };
  }

  reconcileProjectMaterials(
    quotedSpendTzs: number,
    actualSpendTzs: number
  ): {
    varianceTzs: number;
    overrunPct: number;
    hasOverrun: boolean;
  } {
    const varianceTzs = actualSpendTzs - quotedSpendTzs;
    const overrunPct = quotedSpendTzs > 0 ? (varianceTzs / quotedSpendTzs) * 100 : 0;

    return {
      varianceTzs: Math.round(varianceTzs),
      overrunPct: parseFloat(overrunPct.toFixed(2)),
      hasOverrun: varianceTzs > 0,
    };
  }

  generateExplainableAiRecommendations(
    ctx: TenantContext,
    products: HardwareProduct[],
    projects: HardwareProjectRequirement[]
  ): HardwareAiRecommendation[] {
    const recs: HardwareAiRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Intelligent Reordering
    const lowStock = products.filter((p) => p.currentStock <= 20);
    if (lowStock.length > 0) {
      recs.push({
        id: `REC-HW-REORDER-${randomUUID().slice(0, 6)}`,
        tenantId: ctx.tenantId,
        branchId: ctx.branchId,
        category: "INTELLIGENT_REORDERING",
        observation: `${lowStock.length} building material products reached safety stock alert level.`,
        evidence: `Product '${lowStock[0].name}' (${lowStock[0].sku}) has ${lowStock[0].currentStock} ${lowStock[0].primaryUnit} remaining.`,
        recommendation: "Generate Purchase Request for 200 bags of Dangote 42.5N Portland Cement from preferred supplier.",
        expectedImpact: "Prevents project delivery delays & lost contractor sales revenue.",
        confidenceScore: 96,
        createdAt: now,
      });
    }

    return recs;
  }
}

export const globalHardwareOperatingEngine = new HardwareOperatingEngine();
export const globalHardwareEngine = globalHardwareOperatingEngine;
export { HardwareOperatingEngine as HardwareEngine };
