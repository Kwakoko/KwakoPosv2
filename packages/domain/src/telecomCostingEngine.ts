import { randomUUID } from "crypto";
import type {
  TenantContext,
  TelecomQuotation,
  TelecomQuotationCostItem,
  TelecomProject,
} from "@kwakopos2/contracts";

export interface ProjectCostBreakdown {
  equipmentCost: number;
  materialsCost: number;
  laborCost: number;
  logisticsCost: number;
  subcontractorCost: number;
  overheadCost: number;
  contingencyCost: number;
  totalCost: number;
}

export class TelecomCostingEngine {
  /**
   * Calculates a complete Telecom Project Quotation with direct costs, overheads, contingency, and margin.
   */
  static calculateQuotation(
    ctx: TenantContext,
    customerId: string,
    quotationNumber: string,
    title: string,
    items: { category: TelecomQuotationCostItem["category"]; description: string; quantity: number; unitCost: number }[],
    targetMarginPct = 25.0
  ): TelecomQuotation {
    let directCost = 0;
    let laborCost = 0;
    let logisticsCost = 0;
    let overheadCost = 0;
    let contingencyCost = 0;

    const computedItems: TelecomQuotationCostItem[] = items.map((item) => {
      const totalCost = Math.round(item.quantity * item.unitCost * 100) / 100;

      switch (item.category) {
        case "EQUIPMENT":
        case "MATERIALS":
          directCost += totalCost;
          break;
        case "LABOR":
        case "SUBCONTRACTOR":
          laborCost += totalCost;
          break;
        case "TRAVEL_LOGISTICS":
          logisticsCost += totalCost;
          break;
        case "OVERHEAD":
          overheadCost += totalCost;
          break;
        case "CONTINGENCY":
          contingencyCost += totalCost;
          break;
      }

      return {
        category: item.category,
        description: item.description,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost,
      };
    });

    const totalProjectCost = Math.round((directCost + laborCost + logisticsCost + overheadCost + contingencyCost) * 100) / 100;
    const marginMultiplier = 1 + Math.max(0, targetMarginPct) / 100;
    const customerPrice = Math.round(totalProjectCost * marginMultiplier * 100) / 100;

    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      customerId,
      quotationNumber,
      title,
      items: computedItems,
      directCost: Math.round(directCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      logisticsCost: Math.round(logisticsCost * 100) / 100,
      overheadCost: Math.round(overheadCost * 100) / 100,
      contingencyCost: Math.round(contingencyCost * 100) / 100,
      totalProjectCost,
      targetMarginPct,
      customerPrice,
      status: "DRAFT",
      convertedProjectId: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Reconciles project actual costs against budget and calculates variance.
   */
  static reconcileProjectBudget(
    project: TelecomProject,
    actualCost: number
  ): {
    budgetAmount: number;
    actualCost: number;
    varianceAmount: number;
    variancePct: number;
    isOverBudget: boolean;
  } {
    const budget = Number(project.budgetAmount) || 0;
    const actual = Number(actualCost) || 0;
    const varianceAmount = Math.round((budget - actual) * 100) / 100; // Positive = under budget (favorable)
    const variancePct = budget > 0 ? Math.round(((actual - budget) / budget) * 10000) / 100 : 0;

    return {
      budgetAmount: budget,
      actualCost: actual,
      varianceAmount,
      variancePct,
      isOverBudget: actual > budget,
    };
  }
}
