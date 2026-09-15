import { randomUUID } from "crypto";
import type {
  TenantContext,
  PaymentMethod,
  PaymentProvider,
  EngineDescriptor,
  EngineCommandEnvelope,
  EngineCommandResult,
  EngineQueryEnvelope,
} from "@kwakopos2/contracts";
import { CoreEngineRegistry } from "../engineRegistry/coreEngineRegistry.js";
import { DomainEventBusEngine } from "../foundation/eventBusEngine.js";
import { AuditComplianceEngine } from "../foundation/auditComplianceEngine.js";
import { PartyContactEngine } from "./partyContactEngine.js";

export interface PaymentTransactionRecord {
  id: string;
  tenantId: string;
  branchId: string;
  referenceType: "SALE" | "INVOICE" | "CUSTOMER_DEPOSIT" | "MANUAL";
  referenceId: string;
  customerId?: string | null;
  method: PaymentMethod;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  providerReference?: string | null; // e.g. M-Pesa transaction ID
  status: "COMPLETED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "FAILED";
  refundedAmount: number;
  notes?: string;
  metadata?: Record<string, any>;
  processedAt: string;
}

export interface ProcessPaymentParams {
  tenantId: string;
  branchId: string;
  referenceType: "SALE" | "INVOICE" | "CUSTOMER_DEPOSIT" | "MANUAL";
  referenceId: string;
  customerId?: string | null;
  method: PaymentMethod;
  provider?: PaymentProvider;
  amount: number;
  currency?: string;
  providerReference?: string | null;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface SplitPaymentItem {
  method: PaymentMethod;
  provider?: PaymentProvider;
  amount: number;
  providerReference?: string | null;
}

export interface ProcessSplitPaymentParams {
  tenantId: string;
  branchId: string;
  referenceType: "SALE" | "INVOICE" | "CUSTOMER_DEPOSIT" | "MANUAL";
  referenceId: string;
  customerId?: string | null;
  totalRequired: number;
  currency?: string;
  splits: SplitPaymentItem[];
  notes?: string;
}

export interface RefundPaymentParams {
  paymentId: string;
  tenantId: string;
  refundAmount: number;
  reason: string;
}

export class UniversalPaymentEngine {
  private static instance: UniversalPaymentEngine | null = null;
  private transactions = new Map<string, PaymentTransactionRecord>(); // key: paymentId

  public static readonly ENGINE_ID = "core.universal_payment";

  public static getInstance(): UniversalPaymentEngine {
    if (!UniversalPaymentEngine.instance) {
      UniversalPaymentEngine.instance = new UniversalPaymentEngine();
    }
    return UniversalPaymentEngine.instance;
  }

  public static resetInstance(): void {
    UniversalPaymentEngine.instance = new UniversalPaymentEngine();
  }

  public constructor() {
    this.registerSelf();
  }

  private registerSelf(): void {
    const registry = CoreEngineRegistry.getInstance();
    const descriptor: EngineDescriptor = {
      engineId: UniversalPaymentEngine.ENGINE_ID,
      name: "Universal Payment & Settlement Core Engine",
      version: "2.0.0",
      layer: "BUSINESS_CORE",
      status: "ACTIVE",
      dependencies: ["core.event_bus", "core.audit_compliance", "core.party_contact"],
      extensionPoints: ["payment.gateway_adapter", "payment.settlement_hook"],
      permissionsRequired: ["PAYMENT_VIEW", "PAYMENT_CREATE", "PAYMENT_REFUND"],
      supportedCommands: [
        "ProcessPayment",
        "ProcessSplitPayment",
        "RefundPayment",
      ],
      supportedQueries: [
        "GetPaymentById",
        "ListPaymentsForReference",
      ],
      publishedEvents: [
        "PAYMENT_PROCESSED",
        "PAYMENT_REFUNDED",
        "SPLIT_PAYMENT_SETTLED",
      ],
      healthStatus: "HEALTHY",
    };

    try {
      registry.registerEngine(descriptor, {
        commandHandlers: {
          ProcessPayment: async (ctx, cmd) => this.handleProcessPaymentCommand(ctx, cmd),
          ProcessSplitPayment: async (ctx, cmd) => this.handleProcessSplitPaymentCommand(ctx, cmd),
          RefundPayment: async (ctx, cmd) => this.handleRefundPaymentCommand(ctx, cmd),
        },
        queryHandlers: {
          GetPaymentById: async (ctx, qry) => this.handleGetPaymentByIdQuery(ctx, qry),
          ListPaymentsForReference: async (ctx, qry) => this.handleListForReferenceQuery(ctx, qry),
        },
        healthCheck: async () => ({
          engineId: UniversalPaymentEngine.ENGINE_ID,
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
        `TENANT_BOUNDARY_VIOLATION: Context tenant '${ctx.tenantId}' cannot access payments of tenant '${tenantId}'.`
      );
    }
  }

  /**
   * Process a single payment transaction
   */
  public processPayment(ctx: TenantContext, params: ProcessPaymentParams): PaymentTransactionRecord {
    this.assertIsolation(ctx, params.tenantId);

    if (params.amount <= 0) {
      throw new Error("INVALID_PAYMENT_AMOUNT: Payment amount must be strictly greater than zero.");
    }

    // If payment method is CREDIT, check and adjust customer's credit balance via PartyContactEngine
    if (params.method === "CREDIT") {
      if (!params.customerId) {
        throw new Error("CREDIT_REQUIRES_CUSTOMER: Credit payment requires a valid customerId.");
      }
      // Deduct available credit / increase balance owed
      PartyContactEngine.getInstance().adjustCreditBalance(ctx, {
        partyId: params.customerId,
        tenantId: params.tenantId,
        amountDelta: params.amount,
        referenceType: "SALE",
        referenceId: params.referenceId,
        notes: `Credit extension for ${params.referenceType} ${params.referenceId}`,
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const defaultProvider: PaymentProvider = params.provider || (params.method === "CASH" ? "CASH" : "OTHER");

    const record: PaymentTransactionRecord = {
      id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      customerId: params.customerId || null,
      method: params.method,
      provider: defaultProvider,
      amount: params.amount,
      currency: params.currency || "TZS",
      providerReference: params.providerReference || null,
      status: "COMPLETED",
      refundedAmount: 0,
      notes: params.notes || "",
      metadata: params.metadata || {},
      processedAt: now,
    };

    this.transactions.set(id, record);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "PROCESS_PAYMENT",
      entityType: "PAYMENT",
      entityId: id,
      afterState: {
        method: record.method,
        provider: record.provider,
        amount: record.amount,
        currency: record.currency,
        referenceType: record.referenceType,
        referenceId: record.referenceId,
      },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PAYMENT_PROCESSED",
      engineId: UniversalPaymentEngine.ENGINE_ID,
      aggregateType: "PAYMENT",
      aggregateId: id,
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorId: ctx.userId || "system",
      payload: {
        paymentId: id,
        method: record.method,
        amount: record.amount,
        referenceId: record.referenceId,
      },
    });

    return { ...record };
  }

  /**
   * Process split payments atomically
   */
  public processSplitPayment(
    ctx: TenantContext,
    params: ProcessSplitPaymentParams
  ): {
    totalPaid: number;
    payments: PaymentTransactionRecord[];
  } {
    this.assertIsolation(ctx, params.tenantId);

    if (!params.splits || params.splits.length === 0) {
      throw new Error("EMPTY_SPLITS: At least one payment split must be provided.");
    }

    const splitTotal = params.splits.reduce((acc, curr) => acc + curr.amount, 0);
    // Tolerance for floating point precision
    if (Math.abs(splitTotal - params.totalRequired) > 0.01) {
      throw new Error(
        `SPLIT_AMOUNT_MISMATCH: Split total ${splitTotal} does not match required total ${params.totalRequired}.`
      );
    }

    const results: PaymentTransactionRecord[] = [];
    for (const split of params.splits) {
      const record = this.processPayment(ctx, {
        tenantId: params.tenantId,
        branchId: params.branchId,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        customerId: params.customerId,
        method: split.method,
        provider: split.provider,
        amount: split.amount,
        currency: params.currency,
        providerReference: split.providerReference,
        notes: params.notes,
      });
      results.push(record);
    }

    DomainEventBusEngine.getInstance().publish({
      eventType: "SPLIT_PAYMENT_SETTLED",
      engineId: UniversalPaymentEngine.ENGINE_ID,
      aggregateType: "SPLIT_PAYMENT",
      aggregateId: params.referenceId,
      tenantId: params.tenantId,
      branchId: params.branchId,
      actorId: ctx.userId || "system",
      payload: {
        referenceId: params.referenceId,
        totalPaid: splitTotal,
        splitsCount: results.length,
      },
    });

    return {
      totalPaid: splitTotal,
      payments: results,
    };
  }

  /**
   * Refund a payment transaction
   */
  public refundPayment(ctx: TenantContext, params: RefundPaymentParams): PaymentTransactionRecord {
    this.assertIsolation(ctx, params.tenantId);

    const payment = this.transactions.get(params.paymentId);
    if (!payment) {
      throw new Error(`PAYMENT_NOT_FOUND: Payment '${params.paymentId}' does not exist.`);
    }
    this.assertIsolation(ctx, payment.tenantId);

    if (params.refundAmount <= 0) {
      throw new Error("INVALID_REFUND_AMOUNT: Refund amount must be positive.");
    }

    const remainingRefundable = payment.amount - payment.refundedAmount;
    if (params.refundAmount > remainingRefundable) {
      throw new Error(
        `REFUND_EXCEEDS_PAYMENT: Refund amount ${params.refundAmount} exceeds remaining refundable balance ${remainingRefundable}.`
      );
    }

    payment.refundedAmount += params.refundAmount;
    payment.status = payment.refundedAmount >= payment.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";

    // If original payment was credit, adjust credit balance back down
    if (payment.method === "CREDIT" && payment.customerId) {
      PartyContactEngine.getInstance().adjustCreditBalance(ctx, {
        partyId: payment.customerId,
        tenantId: payment.tenantId,
        amountDelta: -params.refundAmount, // reduce customer balance owed
        referenceType: "CREDIT_NOTE",
        referenceId: payment.id,
        notes: `Refund for payment ${payment.id}: ${params.reason}`,
      });
    }

    this.transactions.set(payment.id, payment);

    AuditComplianceEngine.getInstance().record(ctx, {
      action: "REFUND_PAYMENT",
      entityType: "PAYMENT",
      entityId: payment.id,
      afterState: {
        refundAmount: params.refundAmount,
        reason: params.reason,
        newStatus: payment.status,
      },
    });

    DomainEventBusEngine.getInstance().publish({
      eventType: "PAYMENT_REFUNDED",
      engineId: UniversalPaymentEngine.ENGINE_ID,
      aggregateType: "PAYMENT",
      aggregateId: payment.id,
      tenantId: payment.tenantId,
      branchId: payment.branchId,
      actorId: ctx.userId || "system",
      payload: {
        paymentId: payment.id,
        refundAmount: params.refundAmount,
        status: payment.status,
      },
    });

    return { ...payment };
  }

  public getPayment(ctx: TenantContext, paymentId: string): PaymentTransactionRecord | null {
    const payment = this.transactions.get(paymentId);
    if (!payment) return null;
    this.assertIsolation(ctx, payment.tenantId);
    return { ...payment };
  }

  public listPaymentsForReference(
    ctx: TenantContext,
    tenantId: string,
    referenceId: string
  ): PaymentTransactionRecord[] {
    this.assertIsolation(ctx, tenantId);
    return Array.from(this.transactions.values())
      .filter((t) => t.tenantId === tenantId && t.referenceId === referenceId)
      .map((t) => ({ ...t }));
  }

  // -------------------------------------------------------------------------
  // CQRS Handlers
  // -------------------------------------------------------------------------

  private async handleProcessPaymentCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const record = this.processPayment(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: record,
        eventsPublished: ["PAYMENT_PROCESSED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "PROCESS_PAYMENT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleProcessSplitPaymentCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const result = this.processSplitPayment(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: result,
        eventsPublished: ["SPLIT_PAYMENT_SETTLED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "SPLIT_PAYMENT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleRefundPaymentCommand(
    ctx: TenantContext,
    cmd: EngineCommandEnvelope
  ): Promise<EngineCommandResult> {
    const startTime = Date.now();
    try {
      const record = this.refundPayment(ctx, cmd.payload as any);
      return {
        commandId: cmd.commandId,
        success: true,
        data: record,
        eventsPublished: ["PAYMENT_REFUNDED"],
        executionDurationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        commandId: cmd.commandId,
        success: false,
        error: { code: "REFUND_PAYMENT_FAILED", message: err.message },
        eventsPublished: [],
        executionDurationMs: Date.now() - startTime,
      };
    }
  }

  private async handleGetPaymentByIdQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<PaymentTransactionRecord | null> {
    return this.getPayment(ctx, qry.parameters.paymentId as string);
  }

  private async handleListForReferenceQuery(
    ctx: TenantContext,
    qry: EngineQueryEnvelope
  ): Promise<PaymentTransactionRecord[]> {
    return this.listPaymentsForReference(
      ctx,
      qry.tenantId,
      qry.parameters.referenceId as string
    );
  }
}
