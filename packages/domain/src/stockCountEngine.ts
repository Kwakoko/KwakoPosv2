import { randomUUID } from "crypto";
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

export class StockCountEngine {
  private static instance: StockCountEngine | null = null;
  private sessions = new Map<string, StockCountSession>();

  public static getInstance(): StockCountEngine {
    if (!StockCountEngine.instance) {
      StockCountEngine.instance = new StockCountEngine();
    }
    return StockCountEngine.instance;
  }

  public static resetInstance(): void {
    StockCountEngine.instance = new StockCountEngine();
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access count session of tenant '${tenantId}'.`
      );
    }
  }

  /**
   * Start a new cycle count session with system baseline snapshot
   */
  public startSession(
    ctx: TenantContext,
    req: StartStockCountRequest,
    baselineItems: StockSnapshotItem[]
  ): StockCountSession {
    const now = new Date().toISOString();
    const id = randomUUID();
    const sessionNumber = `COUNT-${Date.now().toString(36).toUpperCase()}`;

    const lines: StockCountLine[] = baselineItems.map((item) => ({
      id: randomUUID(),
      sessionId: id,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      productName: item.productName,
      systemQuantity: item.systemQuantity,
      countedQuantity: null, // not yet counted
      varianceQuantity: 0,
      varianceValue: 0,
      unitCost: item.unitCost,
    }));

    const session: StockCountSession = {
      id,
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      sessionNumber,
      name: req.name,
      scope: req.scope,
      status: "COUNTING",
      categoryId: req.categoryId,
      locationId: req.locationId,
      lines,
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

    this.sessions.set(id, session);
    return { ...session };
  }

  /**
   * Record physical count for a line item within an active session
   */
  public recordCount(
    ctx: TenantContext,
    sessionId: string,
    req: RecordCountItemRequest
  ): StockCountSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`STOCK_COUNT_NOT_FOUND: Session ${sessionId} does not exist.`);
    this.assertIsolation(ctx, session.tenantId);

    if (session.status !== "COUNTING") {
      throw new Error(`INVALID_SESSION_STATUS: Cannot record counts when session status is ${session.status}.`);
    }

    const line = session.lines.find((l) => l.variantId === req.variantId);
    if (!line) {
      throw new Error(`VARIANT_NOT_IN_SESSION: Variant ${req.variantId} is not part of count session ${sessionId}.`);
    }

    const now = new Date().toISOString();
    line.countedQuantity = req.countedQuantity;
    line.varianceQuantity = Math.round((req.countedQuantity - line.systemQuantity) * 10000) / 10000;
    line.varianceValue = Math.round(line.varianceQuantity * line.unitCost * 100) / 100;
    line.notes = req.notes || line.notes;
    line.countedByUserId = ctx.userId;
    line.countedAt = now;

    // Recalculate session totals
    this.recalculateSessionMetrics(session);
    session.updatedAt = now;

    return { ...session };
  }

  /**
   * Transition session to RECONCILING and calculate final discrepancy totals
   */
  public reconcileSession(
    ctx: TenantContext,
    sessionId: string,
    req: ReconcileStockCountRequest
  ): { session: StockCountSession; adjustmentsToPost: Array<{ variantId: string; quantityChange: number; reason: string }> } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`STOCK_COUNT_NOT_FOUND: Session ${sessionId} does not exist.`);
    this.assertIsolation(ctx, session.tenantId);

    if (session.status !== "COUNTING") {
      throw new Error(`INVALID_SESSION_STATUS: Cannot reconcile when session status is ${session.status}.`);
    }

    const now = new Date().toISOString();
    session.status = "RECONCILING";
    session.reconciledAt = now;
    session.notes = req.notes || session.notes;
    session.updatedAt = now;

    this.recalculateSessionMetrics(session);

    const adjustmentsToPost = session.lines
      .filter((l) => l.varianceQuantity !== 0)
      .map((l) => ({
        variantId: l.variantId,
        quantityChange: l.varianceQuantity,
        reason: `${req.adjustmentReason} (Session: ${session.sessionNumber})`,
      }));

    return { session: { ...session }, adjustmentsToPost };
  }

  /**
   * Finalize and mark session as POSTED after ledger adjustments have been committed
   */
  public finalizeSession(ctx: TenantContext, sessionId: string): StockCountSession {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`STOCK_COUNT_NOT_FOUND: Session ${sessionId} does not exist.`);
    this.assertIsolation(ctx, session.tenantId);

    if (session.status !== "RECONCILING") {
      throw new Error(`INVALID_SESSION_STATUS: Cannot finalize when session status is ${session.status}.`);
    }

    const now = new Date().toISOString();
    session.status = "POSTED";
    session.postedAt = now;
    session.approvedById = ctx.userId;
    session.updatedAt = now;

    return { ...session };
  }

  /**
   * Get session by ID
   */
  public getSession(ctx: TenantContext, sessionId: string): StockCountSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    this.assertIsolation(ctx, session.tenantId);
    return { ...session };
  }

  /**
   * List all sessions for the context tenant/branch
   */
  public listSessions(ctx: TenantContext): StockCountSession[] {
    this.assertIsolation(ctx, ctx.tenantId);
    return Array.from(this.sessions.values())
      .filter((s) => s.tenantId === ctx.tenantId && s.branchId === ctx.branchId)
      .map((s) => ({ ...s }));
  }

  private recalculateSessionMetrics(session: StockCountSession): void {
    let countedCount = 0;
    let discrepantCount = 0;
    let netVarianceQty = 0;
    let netVarianceVal = 0;

    for (const line of session.lines) {
      if (line.countedQuantity !== null) {
        countedCount++;
        if (Math.abs(line.varianceQuantity) > 0.0001) {
          discrepantCount++;
        }
        netVarianceQty += line.varianceQuantity;
        netVarianceVal += line.varianceValue;
      }
    }

    session.totalItemsCounted = countedCount;
    session.totalDiscrepantItems = discrepantCount;
    session.netVarianceQuantity = Math.round(netVarianceQty * 10000) / 10000;
    session.netVarianceValue = Math.round(netVarianceVal * 100) / 100;
  }
}

export const globalStockCountEngine = StockCountEngine.getInstance();
