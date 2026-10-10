import { randomUUID } from "node:crypto";
import type {
  TenantContext,
  StockCountSession,
  StockCountLine,
  StartStockCountRequest,
  RecordCountItemRequest,
  ReconcileStockCountRequest,
} from "@kwakopos2/contracts";

export interface StockSnapshotItem {
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  systemQuantity: number;
  unitCost: number;
}

/**
 * Apply one physical count to an immutable line value. Persisting the resulting
 * session belongs to the PostgreSQL inventory production lock, never a process Map.
 */
export function applyCountToLine(
  line: StockCountLine,
  req: RecordCountItemRequest,
  userId?: string,
  countedAt = new Date().toISOString(),
): StockCountLine {
  const countedQuantity = Number(req.countedQuantity);
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new Error("STOCK_COUNT_QUANTITY_INVALID");
  }
  const varianceQuantity = Math.round((countedQuantity - Number(line.systemQuantity)) * 10000) / 10000;
  const varianceValue = Math.round(varianceQuantity * Number(line.unitCost) * 100) / 100;
  return {
    ...line,
    countedQuantity,
    varianceQuantity,
    varianceValue,
    notes: req.notes || line.notes,
    countedByUserId: userId,
    countedAt,
  };
}

/** Recalculate aggregate counts from persisted/value-object count lines. */
export function recalculateStockCountSession(session: StockCountSession): StockCountSession {
  let totalItemsCounted = 0;
  let totalDiscrepantItems = 0;
  let netVarianceQuantity = 0;
  let netVarianceValue = 0;
  for (const line of session.lines) {
    if (line.countedQuantity === null) continue;
    totalItemsCounted += 1;
    if (Math.abs(line.varianceQuantity) > 0.0001) totalDiscrepantItems += 1;
    netVarianceQuantity += line.varianceQuantity;
    netVarianceValue += line.varianceValue;
  }
  return {
    ...session,
    lines: session.lines.map((line) => ({ ...line })),
    totalItemsCounted,
    totalDiscrepantItems,
    netVarianceQuantity: Math.round(netVarianceQuantity * 10000) / 10000,
    netVarianceValue: Math.round(netVarianceValue * 100) / 100,
  };
}

/**
 * Pure stock-count domain calculations only. Session values are explicit inputs
 * and outputs; durable session ownership and concurrency are handled by the
 * PostgreSQL production-lock transaction in packages/sync.
 */
export class StockCountEngine {
  private static instance: StockCountEngine | null = null;

  public static getInstance(): StockCountEngine {
    if (!StockCountEngine.instance) StockCountEngine.instance = new StockCountEngine();
    return StockCountEngine.instance;
  }

  public static resetInstance(): void {
    StockCountEngine.instance = new StockCountEngine();
  }

  private assertSessionScope(ctx: TenantContext, session: StockCountSession): void {
    const elevated = ctx.roles?.some((role) => ["SUPER_ADMIN", "SUPERADMIN"].includes(String(role).toUpperCase())) ?? false;
    if (!elevated && (ctx.tenantId !== session.tenantId || ctx.branchId !== session.branchId)) {
      throw new Error("TENANT_BOUNDARY_VIOLATION: Count session does not belong to the active tenant and branch.");
    }
  }

  public startSession(
    ctx: TenantContext,
    req: StartStockCountRequest,
    baselineItems: StockSnapshotItem[],
  ): StockCountSession {
    const now = new Date().toISOString();
    const id = randomUUID();
    const session: StockCountSession = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sessionNumber: "COUNT-" + Date.now().toString(36).toUpperCase(),
      name: req.name,
      scope: req.scope,
      status: "COUNTING",
      categoryId: req.categoryId,
      locationId: req.locationId,
      lines: baselineItems.map((item) => ({
        id: randomUUID(),
        sessionId: id,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        systemQuantity: item.systemQuantity,
        countedQuantity: null,
        varianceQuantity: 0,
        varianceValue: 0,
        unitCost: item.unitCost,
      })),
      totalItemsCounted: 0,
      totalDiscrepantItems: 0,
      netVarianceQuantity: 0,
      netVarianceValue: 0,
      startedAt: now,
      createdById: ctx.userId,
      notes: req.notes,
      createdAt: now,
      updatedAt: now,
    };
    return recalculateStockCountSession(session);
  }

  public recordCount(
    ctx: TenantContext,
    session: StockCountSession,
    req: RecordCountItemRequest,
  ): StockCountSession {
    this.assertSessionScope(ctx, session);
    if (session.status !== "COUNTING") throw new Error("INVALID_SESSION_STATUS: Count entry requires COUNTING status.");
    const index = session.lines.findIndex((line) => line.variantId === req.variantId);
    if (index < 0) throw new Error("VARIANT_NOT_IN_SESSION: Variant " + req.variantId + " is not in this count session.");
    const now = new Date().toISOString();
    const lines = session.lines.map((line, lineIndex) =>
      lineIndex === index ? applyCountToLine(line, req, ctx.userId, now) : { ...line }
    );
    return recalculateStockCountSession({ ...session, lines, updatedAt: now });
  }

  public reconcileSession(
    ctx: TenantContext,
    session: StockCountSession,
    req: ReconcileStockCountRequest,
  ): { session: StockCountSession; adjustmentsToPost: Array<{ variantId: string; quantityChange: number; reason: string }> } {
    this.assertSessionScope(ctx, session);
    if (session.status !== "COUNTING") throw new Error("INVALID_SESSION_STATUS: Reconciliation requires COUNTING status.");
    const now = new Date().toISOString();
    const reconciled = recalculateStockCountSession({
      ...session,
      status: "RECONCILING",
      reconciledAt: now,
      notes: req.notes || session.notes,
      updatedAt: now,
    });
    const adjustmentsToPost = reconciled.lines
      .filter((line) => line.countedQuantity !== null && Math.abs(line.varianceQuantity) > 0.0000001)
      .map((line) => ({
        variantId: line.variantId,
        quantityChange: line.varianceQuantity,
        reason: req.adjustmentReason + " (Session: " + reconciled.sessionNumber + ")",
      }));
    return { session: reconciled, adjustmentsToPost };
  }

  public finalizeSession(ctx: TenantContext, session: StockCountSession): StockCountSession {
    this.assertSessionScope(ctx, session);
    if (session.status !== "RECONCILING") throw new Error("INVALID_SESSION_STATUS: Finalization requires RECONCILING status.");
    const now = new Date().toISOString();
    return { ...session, status: "POSTED", postedAt: now, approvedById: ctx.userId, updatedAt: now };
  }
}

export const globalStockCountEngine = StockCountEngine.getInstance();
