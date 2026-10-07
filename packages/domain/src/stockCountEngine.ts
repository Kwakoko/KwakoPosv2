import type { StockCountSession, StockCountLine } from "@kwakopos2/contracts";

export function applyCountToLine(line: StockCountLine, countedQuantity: number, userId?: string, notes?: string): StockCountLine {
  const varianceQuantity = Math.round((countedQuantity - line.systemQuantity) * 10000) / 10000;
  return {
    ...line,
    countedQuantity,
    varianceQuantity,
    varianceValue: Math.round(varianceQuantity * line.unitCost * 100) / 100,
    notes: notes || line.notes,
    countedByUserId: userId || line.countedByUserId,
    countedAt: new Date().toISOString(),
  };
}

export function recalculateStockCountSession(session: StockCountSession): StockCountSession {
  let totalItemsCounted = 0;
  let totalDiscrepantItems = 0;
  let netVarianceQuantity = 0;
  let netVarianceValue = 0;
  for (const line of session.lines) {
    if (line.countedQuantity !== null) {
      totalItemsCounted += 1;
      if (Math.abs(line.varianceQuantity) > 0.0001) totalDiscrepantItems += 1;
      netVarianceQuantity += line.varianceQuantity;
      netVarianceValue += line.varianceValue;
    }
  }
  return {
    ...session,
    totalItemsCounted,
    totalDiscrepantItems,
    netVarianceQuantity: Math.round(netVarianceQuantity * 10000) / 10000,
    netVarianceValue: Math.round(netVarianceValue * 100) / 100,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Pure count calculator. Durable session state is PostgreSQL StockCount/StockCountItem,
 * synchronized through the existing durable syncOutbox + sync journal.
 */
export class StockCountEngine {
  static applyCount(line: StockCountLine, countedQuantity: number, userId?: string, notes?: string): StockCountLine {
    return applyCountToLine(line, countedQuantity, userId, notes);
  }

  static recalculate(session: StockCountSession): StockCountSession {
    return recalculateStockCountSession(session);
  }
}
