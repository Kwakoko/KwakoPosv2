import { randomUUID } from "crypto";
import type {
  TenantContext,
  UniversalStockMovementRecord,
  StockLedgerMovementType,
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
} from "@kwakopos2/contracts";
import { CoreEngineRegistry } from "../engineRegistry/coreEngineRegistry.js";
import { DomainEventBusEngine } from "../foundation/eventBusEngine.js";
import { AuditComplianceEngine } from "../foundation/auditComplianceEngine.js";

export interface RecordMovementParams {
  tenantId: string;
  branchId: string;
  movementType: StockLedgerMovementType;
  productId: string;
  variantId?: string | null;
  batchId?: string | null;
  batchNumber?: string | null;
  quantityDelta: number; // positive for intake, negative for decrement
  unitCost: number;
  referenceType: "SALE" | "PURCHASE" | "ADJUSTMENT" | "TRANSFER" | "PLUGIN_DISPENSE" | "RECIPE_PRODUCTION" | "MANUAL";
  referenceId: string;
  actorId: string;
  deviceId?: string;
  allowNegativeStock?: boolean;
  notes?: string;
}

export interface StockBalanceInfo {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string | null;
  currentBalance: number;
  totalCostValue: number;
  lastUpdated: string;
}

export class StockLedgerEngine {
  private static instance: StockLedgerEngine | null = null;
  // In-memory append-only ledger entries
  private ledgerEntries: UniversalStockMovementRecord[] = [];
  // Running balance cache: key = `${tenantId}:${branchId}:${productId}:${variantId || 'base'}`
  private balanceCache = new Map<string, number>();

  public static readonly ENGINE_ID = "core.stock_ledger";

  public static getInstance(): StockLedgerEngine {
    if (!StockLedgerEngine.instance) {
      StockLedgerEngine.instance = new StockLedgerEngine();
    }
    return StockLedgerEngine.instance;
  }

  public static resetInstance(): void {
    StockLedgerEngine.instance = new StockLedgerEngine();
  }

  public constructor() {
    this.registerSelf();
  }

  private registerSelf(): void {
    const registry = CoreEngineRegistry.getInstance();
    const descriptor: EngineDescriptor = {
      engineId: StockLedgerEngine.ENGINE_ID,
      name: "Authoritative Stock Movement Ledger Core Engine",
      version: "2.0.0",
      layer: "BUSINESS_CORE",
      status: "ACTIVE",
      dependencies: ["core.event_bus", "core.audit_compliance"],
      extensionPoints: ["stock.valuation_strategy", "stock.fifo_lifo_allocator"],
      permissionsRequired: ["INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_TRANSFER"],
      supportedCommands: [
        "RecordStockMovement",
        "PerformAdjustment",
      ],
      supportedQueries: [
        "GetStockBalance",
        "GetMovementHistory",
        "GetLedgerByReference",
      ],
      publishedEvents: [
        "STOCK_MOVEMENT_RECORDED",
        "STOCK_DEPLETED",
        "LOW_STOCK_ALERT",
      ],
      healthStatus: "HEALTHY",
    };

    try {
      registry.registerEngine(descriptor, {
        commandHandlers: {
          RecordStockMovement: async (ctx, cmd) => this.handleRecordMovementCommand(ctx, cmd),
        },
        queryHandlers: {
          GetStockBalance: async (ctx, qry) => this.handleGetBalanceQuery(ctx, qry),
          GetMovementHistory: async (ctx, qry) => this.handleGetHistoryQuery(ctx, qry),
        },
        healthCheck: async () => ({
          engineId: StockLedgerEngine.ENGINE_ID,
          status: "HEALTHY",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // already registered
    }
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || ctx.roles?.includes("SUPERADMIN");
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access ledger of tenant '${tenantId}'.`
      );
    }
  }

  private buildBalanceKey(tenantId: string, branchId: string, productId: string, variantId?: string | null): string {
    return `${tenantId}:${branchId}:${productId}:${variantId || "base"}`;
  }

  /**
   * Append-only atomic stock movement recording
   */
  public recordMovement(ctx: TenantContext, params: RecordMovementParams): UniversalStockMovementRecord {
    this.assertIsolation(ctx, params.tenantId);

    if (params.quantityDelta === 0) {
      throw new Error("INVALID_STOCK_DELTA: Quantity delta cannot be zero.");
    }
    if (params.unitCost < 0) {
      throw new Error("INVALID_UNIT_COST: Unit cost cannot be negative.");
    }

    const balanceKey = this.buildBalanceKey(
      params.tenantId,
      params.branchId,
      params.productId,
      params.variantId
    );
    const previousBalance = this.balanceCache.get(balanceKey) || 0;
    const runningBalanceAfter = previousBalance + params.quantityDelta;



    // Disallow negative inventory if not explicitly allowed
    if (runningBalanceAfter < 0 && !params.allowNegativeStock) {
      throw new Error(
        `INSUFFICIENT_STOCK: Required ${Math.abs(params.quantityDelta)}, but current available balance is ${previousBalance}. Negative inventory is disallowed.`
      );
    }

    const now = new Date().toISOString();
    const id = randomUUID();
    const totalCostValue = Number((params.quantityDelta * params.unitCost).toFixed(2));

    const record: UniversalStockMovementRecord = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      movementType: params.movementType,
      productId: params.productId,
      variantId: params.variantId || "base",
      batchId: params.batchId || null,
      batchNumber: params.batchNumber || null,
      quantityDelta: params.quantityDelta,
      unitCost: params.unitCost,
      totalCostValue,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      actorId: params.actorId || ctx.userId || "system",
      deviceId: params.deviceId || "system",
      clientCreatedAt: now,
      serverRecordedAt: now,
      runningBalanceAfter,
      notes: params.notes || "",
    };

    // Immutable append
    this.ledgerEntries.push(record);
    this.balanceCache.set(balanceKey, runningBalanceAfter);

    // Audit compliance logging
    AuditComplianceEngine.getInstance().record(ctx, {
      action: "RECORD_STOCK_MOVEMENT",
      entityType: "STOCK_MOVEMENT",
      entityId: id,
      afterState: {
        movementType: record.movementType,
        productId: record.productId,
        quantityDelta: record.quantityDelta,
        runningBalanceAfter,
        referenceType: record.referenceType,
        referenceId: record.referenceId,
      },
    });

    // Domain event
    DomainEventBusEngine.getInstance().publish({
      eventType: "STOCK_MOVEMENT_RECORDED",
      engineId: StockLedgerEngine.ENGINE_ID,
      aggregateType: "INVENTORY",
      aggregateId: record.productId,
      tenantId: record.tenantId,
      branchId: record.branchId,
      actorId: ctx.userId || "system",
      payload: {
        movementId: id,
        productId: record.productId,
        variantId: record.variantId,
        delta: record.quantityDelta,
        runningBalance: runningBalanceAfter,
        movementType: record.movementType,
        referenceId: record.referenceId,
      },
    });

    if (runningBalanceAfter === 0) {
      DomainEventBusEngine.getInstance().publish({
        eventType: "STOCK_DEPLETED",
        engineId: StockLedgerEngine.ENGINE_ID,
        aggregateType: "INVENTORY",
        aggregateId: record.productId,
        tenantId: record.tenantId,
        branchId: record.branchId,
        actorId: ctx.userId || "system",
        payload: { productId: record.productId, variantId: record.variantId },
      });
    }

    return { ...record };
  }

  public getBalance(
    ctx: TenantContext,
    tenantId: string,
    branchId: string,
    productId: string,
    variantId?: string | null
  ): number {
    this.assertIsolation(ctx, tenantId);
    const balanceKey = this.buildBalanceKey(tenantId, branchId, productId, variantId);
    return this.balanceCache.get(balanceKey) || 0;
  }

  public getMovementHistory(
    ctx: TenantContext,
    tenantId: string,
    branchId?: string | null,
    productId?: string | null
  ): UniversalStockMovementRecord[] {
    this.assertIsolation(ctx, tenantId);
    return this.ledgerEntries
      .filter((entry) => {
        if (entry.tenantId !== tenantId) return false;
        if (branchId && entry.branchId !== branchId) return false;
        if (productId && entry.productId !== productId) return false;
        return true;
      })
      .map((entry) => ({ ...entry }));
  }

  public getMovementsByReference(
    ctx: TenantContext,
    tenantId: string,
    referenceId: string
  ): UniversalStockMovementRecord[] {
    this.assertIsolation(ctx, tenantId);
    return this.ledgerEntries
      .filter((entry) => entry.tenantId === tenantId && entry.referenceId === referenceId)
      .map((entry) => ({ ...entry }));
  }

  // -------------------------------------------------------------------------
  // CQRS Handlers
  // -------------------------------------------------------------------------

  private async handleRecordMovementCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const record = this.recordMovement(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: record,
        eventsPublished: ["STOCK_MOVEMENT_RECORDED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "RECORD_MOVEMENT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleGetBalanceQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<{ currentBalance: number }> {
    const currentBalance = this.getBalance(
      ctx,
      qry.tenantId,
      qry.branchId || "",
      qry.parameters.productId as string,
      qry.parameters.variantId as string | undefined
    );
    return { currentBalance };
  }

  private async handleGetHistoryQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<UniversalStockMovementRecord[]> {
    return this.getMovementHistory(
      ctx,
      qry.tenantId,
      qry.branchId,
      qry.parameters.productId as string | undefined
    );
  }
}
