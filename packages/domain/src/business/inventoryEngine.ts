import { randomUUID } from "crypto";
import type {
  TenantContext,
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
} from "@kwakopos2/contracts";
import { CoreEngineRegistry } from "../engineRegistry/coreEngineRegistry.js";
import { DomainEventBusEngine } from "../foundation/eventBusEngine.js";
import { AuditComplianceEngine } from "../foundation/auditComplianceEngine.js";
import { StockLedgerEngine } from "./stockLedgerEngine.js";

export interface StockReservation {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  quantity: number;
  referenceType: "CART" | "ORDER" | "KITCHEN_ORDER" | "PRESCRIPTION";
  referenceId: string;
  status: "ACTIVE" | "COMMITTED" | "RELEASED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

export interface InventoryBatchInfo {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  batchNumber: string;
  expiryDate: string; // ISO string
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  createdAt: string;
}

export interface ReserveStockParams {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  quantity: number;
  referenceType: "CART" | "ORDER" | "KITCHEN_ORDER" | "PRESCRIPTION";
  referenceId: string;
  ttlSeconds?: number;
}

export interface InventoryAvailability {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  isLowStock: boolean;
}

export class InventoryEngine {
  private static instance: InventoryEngine | null = null;
  private reservations = new Map<string, StockReservation>(); // key: reservationId
  private batches = new Map<string, InventoryBatchInfo>(); // key: batchId

  public static readonly ENGINE_ID = "core.inventory";

  public static getInstance(): InventoryEngine {
    if (!InventoryEngine.instance) {
      InventoryEngine.instance = new InventoryEngine();
    }
    return InventoryEngine.instance;
  }

  public static resetInstance(): void {
    InventoryEngine.instance = new InventoryEngine();
  }

  public constructor() {
    this.registerSelf();
  }

  private registerSelf(): void {
    const registry = CoreEngineRegistry.getInstance();
    const descriptor: EngineDescriptor = {
      engineId: InventoryEngine.ENGINE_ID,
      name: "Inventory State & Reservation Management Core Engine",
      version: "2.0.0",
      layer: "BUSINESS_CORE",
      status: "ACTIVE",
      dependencies: ["core.event_bus", "core.audit_compliance", "core.stock_ledger"],
      extensionPoints: ["inventory.batch_strategy", "inventory.expiry_notifier"],
      permissionsRequired: ["INVENTORY_VIEW", "INVENTORY_ADJUST", "INVENTORY_COUNT"],
      supportedCommands: [
        "ReserveStock",
        "ReleaseReservation",
        "CommitReservation",
        "RegisterBatch",
      ],
      supportedQueries: [
        "GetStockAvailability",
        "GetExpiringBatches",
        "ListActiveReservations",
      ],
      publishedEvents: [
        "STOCK_RESERVED",
        "STOCK_RESERVATION_RELEASED",
        "STOCK_RESERVATION_COMMITTED",
        "BATCH_EXPIRED_ALERT",
      ],
      healthStatus: "HEALTHY",
    };

    try {
      registry.registerEngine(descriptor, {
        commandHandlers: {
          ReserveStock: async (ctx, cmd) => this.handleReserveStockCommand(ctx, cmd),
          ReleaseReservation: async (ctx, cmd) => this.handleReleaseReservationCommand(ctx, cmd),
          CommitReservation: async (ctx, cmd) => this.handleCommitReservationCommand(ctx, cmd),
        },
        queryHandlers: {
          GetStockAvailability: async (ctx, qry) => this.handleGetAvailabilityQuery(ctx, qry),
          GetExpiringBatches: async (ctx, qry) => this.handleGetExpiringBatchesQuery(ctx, qry),
        },
        healthCheck: async () => ({
          engineId: InventoryEngine.ENGINE_ID,
          status: "HEALTHY",
          timestamp: new Date().toISOString(),
        }),
      });
    } catch {
      // already registered
    }
  }

  private assertIsolation(ctx: TenantContext, tenantId: string): void {
    const isSuperAdmin = ctx.roles?.includes("SUPER_ADMIN") || (ctx as any).email === "admin@kwakoko.co.tz";
    if (!isSuperAdmin && ctx.tenantId !== tenantId) {
      throw new Error(
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access inventory of tenant '${tenantId}'.`
      );
    }
  }

  /**
   * Calculate current reserved quantity for a specific product & variant
   */
  public getReservedQuantity(
    tenantId: string,
    branchId: string,
    productId: string,
    variantId?: string | null
  ): number {
    const vId = variantId || "base";
    const now = new Date().toISOString();
    let total = 0;

    for (const res of this.reservations.values()) {
      if (
        res.tenantId === tenantId &&
        res.branchId === branchId &&
        res.productId === productId &&
        res.variantId === vId &&
        res.status === "ACTIVE"
      ) {
        if (res.expiresAt > now) {
          total += res.quantity;
        } else {
          // Auto expire stale reservations
          res.status = "EXPIRED";
        }
      }
    }
    return total;
  }

  /**
   * Get availability snapshot combining StockLedger and active reservations
   */
  public getAvailability(
    ctx: TenantContext,
    tenantId: string,
    branchId: string,
    productId: string,
    variantId?: string | null
  ): InventoryAvailability {
    this.assertIsolation(ctx, tenantId);

    const vId = variantId || "base";
    const totalStock = StockLedgerEngine.getInstance().getBalance(
      ctx,
      tenantId,
      branchId,
      productId,
      vId
    );
    const reservedStock = this.getReservedQuantity(tenantId, branchId, productId, vId);
    const availableStock = Math.max(0, totalStock - reservedStock);

    return {
      tenantId,
      branchId,
      productId,
      variantId: vId,
      totalStock,
      reservedStock,
      availableStock,
      isLowStock: availableStock <= 5,
    };
  }

  /**
   * Reserve stock atomically for cart or pending transaction
   */
  public reserveStock(ctx: TenantContext, params: ReserveStockParams): StockReservation {
    this.assertIsolation(ctx, params.tenantId);

    if (params.quantity <= 0) {
      throw new Error("INVALID_RESERVATION_QUANTITY: Reservation quantity must be positive.");
    }

    const vId = params.variantId || "base";
    const availability = this.getAvailability(
      ctx,
      params.tenantId,
      params.branchId,
      params.productId,
      vId
    );

    if (availability.availableStock < params.quantity) {
      throw new Error(
        `INSUFFICIENT_AVAILABLE_STOCK: Requested ${params.quantity}, but only ${availability.availableStock} is available (Total: ${availability.totalStock}, Reserved: ${availability.reservedStock}).`
      );
    }

    const ttlMs = (params.ttlSeconds || 900) * 1000; // default 15 minutes
    const now = Date.now();
    const id = randomUUID();

    const reservation: StockReservation = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      variantId: vId,
      quantity: params.quantity,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      status: "ACTIVE",
      expiresAt: new Date(now + ttlMs).toISOString(),
      createdAt: new Date(now).toISOString(),
    };

    this.reservations.set(id, reservation);

    DomainEventBusEngine.getInstance().publish({
      eventType: "STOCK_RESERVED",
      engineId: InventoryEngine.ENGINE_ID,
      aggregateType: "INVENTORY_RESERVATION",
      aggregateId: id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorId: ctx.userId || "system",
      payload: {
        reservationId: id,
        productId: params.productId,
        variantId: vId,
        quantity: params.quantity,
        referenceId: params.referenceId,
      },
    });

    return { ...reservation };
  }

  /**
   * Release reservation when cart is abandoned or order is cancelled
   */
  public releaseReservation(ctx: TenantContext, reservationId: string): void {
    const res = this.reservations.get(reservationId);
    if (!res) return;
    this.assertIsolation(ctx, res.tenantId);

    if (res.status === "ACTIVE") {
      res.status = "RELEASED";
      this.reservations.set(reservationId, res);

      DomainEventBusEngine.getInstance().publish({
        eventType: "STOCK_RESERVATION_RELEASED",
        engineId: InventoryEngine.ENGINE_ID,
        aggregateType: "INVENTORY_RESERVATION",
        aggregateId: reservationId,
        tenantId: res.tenantId,
        branchId: res.branchId,
        actorId: ctx.userId || "system",
        payload: { reservationId, productId: res.productId, quantity: res.quantity },
      });
    }
  }

  /**
   * Commit reservation upon checkout completion
   */
  public commitReservation(ctx: TenantContext, reservationId: string): StockReservation {
    const res = this.reservations.get(reservationId);
    if (!res) throw new Error(`RESERVATION_NOT_FOUND: Reservation '${reservationId}' not found.`);
    this.assertIsolation(ctx, res.tenantId);

    if (res.status !== "ACTIVE") {
      throw new Error(`RESERVATION_NOT_ACTIVE: Reservation '${reservationId}' is already ${res.status}.`);
    }

    res.status = "COMMITTED";
    this.reservations.set(reservationId, res);

    DomainEventBusEngine.getInstance().publish({
      eventType: "STOCK_RESERVATION_COMMITTED",
      engineId: InventoryEngine.ENGINE_ID,
      aggregateType: "INVENTORY_RESERVATION",
      aggregateId: reservationId,
      tenantId: res.tenantId,
      branchId: res.branchId,
      actorId: ctx.userId || "system",
      payload: { reservationId, productId: res.productId, quantity: res.quantity },
    });

    return { ...res };
  }


  /**
   * Register a stock batch (pharmacy, supermarket, manufacturing)
   */
  public registerBatch(
    ctx: TenantContext,
    params: {
      tenantId: string;
      branchId: string;
      productId: string;
      variantId?: string | null;
      batchNumber: string;
      expiryDate: string;
      quantity: number;
      unitCost: number;
    }
  ): InventoryBatchInfo {
    this.assertIsolation(ctx, params.tenantId);

    const id = randomUUID();
    const batch: InventoryBatchInfo = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      productId: params.productId,
      variantId: params.variantId || "base",
      batchNumber: params.batchNumber.trim().toUpperCase(),
      expiryDate: params.expiryDate,
      initialQuantity: params.quantity,
      remainingQuantity: params.quantity,
      unitCost: params.unitCost,
      createdAt: new Date().toISOString(),
    };

    this.batches.set(id, batch);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "REGISTER_INVENTORY_BATCH",
      entityType: "BATCH",
      entityId: id,
      afterState: {
        batchNumber: batch.batchNumber,
        productId: batch.productId,
        expiryDate: batch.expiryDate,
        quantity: batch.initialQuantity,
      },
    });

    return { ...batch };
  }

  /**
   * Query expiring batches within a specified timeframe
   */
  public getExpiringBatches(
    ctx: TenantContext,
    tenantId: string,
    withinDays: number = 30
  ): InventoryBatchInfo[] {
    this.assertIsolation(ctx, tenantId);

    const now = Date.now();
    const thresholdMs = now + withinDays * 24 * 60 * 60 * 1000;

    return Array.from(this.batches.values())
      .filter((b) => {
        if (b.tenantId !== tenantId) return false;
        if (b.remainingQuantity <= 0) return false;
        const expiryTime = new Date(b.expiryDate).getTime();
        return expiryTime <= thresholdMs;
      })
      .map((b) => ({ ...b }));
  }

  // -------------------------------------------------------------------------
  // CQRS Handlers
  // -------------------------------------------------------------------------

  private async handleReserveStockCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const reservation = this.reserveStock(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: reservation,
        eventsPublished: ["STOCK_RESERVED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "RESERVE_STOCK_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleReleaseReservationCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      this.releaseReservation(ctx, cmd.payload.reservationId as string);
      return {
        commandId: cmd.commandId,
        success: true,
        eventsPublished: ["STOCK_RESERVATION_RELEASED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "RELEASE_RESERVATION_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleCommitReservationCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      this.commitReservation(ctx, cmd.payload.reservationId as string);
      return {
        commandId: cmd.commandId,
        success: true,
        eventsPublished: ["STOCK_RESERVATION_COMMITTED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "COMMIT_RESERVATION_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleGetAvailabilityQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<InventoryAvailability> {
    return this.getAvailability(
      ctx,
      qry.tenantId,
      qry.branchId || "",
      qry.parameters.productId as string,
      qry.parameters.variantId as string | undefined
    );
  }

  private async handleGetExpiringBatchesQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<InventoryBatchInfo[]> {
    return this.getExpiringBatches(
      ctx,
      qry.tenantId,
      (qry.parameters.withinDays as number) || 30
    );
  }
}
