import { createHash } from "node:crypto";
import { prisma } from "@kwakopos2/database";
import {
  TraVfdFiscalState,
  TraVfdFiscalizationDTO,
  CreateTraVfdFiscalizationRequest,
  TraVfdConfig,
  TraVfdIntegrationStatus,
} from "@kwakopos2/contracts";
import { createTraVfdProvider, type TraVfdReceiptInput } from "./traVfdProvider.js";

const TRANSITIONS: Record<TraVfdFiscalState, readonly TraVfdFiscalState[]> = {
  LOCAL_FISCAL_PENDING: ["SUBMITTING", "TRA_RETRY"],
  SUBMITTING: ["TRA_ACCEPTED", "TRA_REJECTED", "TRA_RETRY"],
  TRA_ACCEPTED: ["TRA_VERIFIED"],
  TRA_REJECTED: ["TRA_RETRY"],
  TRA_RETRY: ["SUBMITTING", "TRA_REJECTED"],
  TRA_VERIFIED: [],
};
const STATES: TraVfdFiscalState[] = ["LOCAL_FISCAL_PENDING", "SUBMITTING", "TRA_ACCEPTED", "TRA_REJECTED", "TRA_RETRY", "TRA_VERIFIED"];
const RECONCILIATION = ["PENDING", "MATCHED", "MISMATCH", "UNAVAILABLE"] as const;

function assertTransition(from: TraVfdFiscalState, to: TraVfdFiscalState): void {
  if (!TRANSITIONS[from]?.includes(to)) throw new Error("TRA_VFD_INVALID_TRANSITION:" + from + "->" + to);
}
function extractString(body: any, keys: string[]): string | null {
  for (const key of keys) { const value = body?.[key]; if (typeof value === "string" && value.trim()) return value.trim(); }
  return null;
}
function mapFiscalization(row: any): TraVfdFiscalizationDTO {
  return {
    id: row.id, tenantId: row.tenantId, branchId: row.branchId, receiptId: row.receiptId,
    transactionId: row.transactionId, deviceId: row.deviceId, chainSequence: row.chainSequence,
    previousReceiptHash: row.previousReceiptHash ?? null, receiptHash: row.receiptHash ?? null,
    state: row.state as TraVfdFiscalState,
    requestPayload: row.requestPayload, responsePayload: row.responsePayload ?? null,
    fiscalReceiptNumber: row.fiscalReceiptNumber ?? null, fiscalCode: row.fiscalCode ?? null,
    verificationCode: row.verificationCode ?? null, lastError: row.lastError ?? null,
    attempts: row.attempts, nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    reconciliationStatus: row.reconciliationStatus || "PENDING",
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
    reconciliationError: row.reconciliationError ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function canonicalMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("TRA_VFD_INVALID_MONEY");
  return amount.toFixed(2);
}

function canonicalFiscalTimestamp(payload: any, fallback: Date): string {
  const value = payload?.createdAt || payload?.created_at;
  const parsed = value ? new Date(String(value)) : fallback;
  if (Number.isNaN(parsed.getTime())) throw new Error("TRA_VFD_INVALID_TIMESTAMP");
  return parsed.toISOString();
}

function computeReceiptHash(previousHash: string, invoiceNumber: string, timestampUtc: string, grandTotal: unknown, taxTotal: unknown): string {
  const payload = `${previousHash}|${invoiceNumber}|${timestampUtc}|${canonicalMoney(grandTotal)}|${canonicalMoney(taxTotal)}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
async function recordFiscalAudit(ctx: { tenantId: string; branchId: string; userId?: string }, action: string, fiscalizationId: string, metadata: Record<string, unknown> = {}) {
  await prisma.auditEvent.create({
    data: {
      id: crypto.randomUUID(),
      tenantId: ctx.tenantId,
      branchId: ctx.branchId,
      userId: ctx.userId || "system",
      deviceId: "tra-vfd",
      action,
      entityType: "TraVfdFiscalization",
      entityId: fiscalizationId,
      metadata,
    },
  });
}

function totalOf(payload: any): number {
  return Number(payload?.grandTotal ?? payload?.total ?? payload?.totalAmount ?? 0);
}
function toDateParts(value: unknown): { date: string; time: string } {
  const d = new Date(String(value || new Date().toISOString()));
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 19) };
}
function buildReceiptInput(row: any, config: any, counters: { dailyCounter: number; globalCounter: number }): TraVfdReceiptInput {
  const payload = row.requestPayload || {};
  const parts = toDateParts(payload.createdAt || payload.created_at || new Date().toISOString());
  const items = Array.isArray(payload.items) ? payload.items.map((item: any) => ({
    id: String(item.id || item.productId || item.variantId || "ITEM"),
    description: String(item.description || item.name || item.productName || "Item"),
    quantity: Number(item.quantity ?? item.qty ?? 0),
    unitPrice: Number(item.unitPrice ?? item.price ?? 0),
    discount: Number(item.discount ?? item.discountAmount ?? 0),
    taxCode: Number(item.taxCode ?? ((Number(payload.taxAmount || 0) > 0 || Number(item.taxRate || payload.taxRate || 0) > 0) ? 1 : 3)),
  })).filter((item: any) => item.quantity > 0) : [];
  const paymentMethod = String(payload.paymentMethod || payload.payment_type || "CASH");
  const amount = Number(payload.paidAmount ?? payload.grandTotal ?? 0);
  return {
    date: parts.date, time: parts.time, receiptNumber: String(payload.receiptNumber || row.transactionId),
    dailyCounter: counters.dailyCounter, globalCounter: counters.globalCounter,
    zNumber: String(payload.zNumber || parts.date.replaceAll("-", "")),
    receiptVNumber: String(payload.receiptVNumber || payload.rctvnum || ""),
    customerId: String(payload.customerId || "NIL"),
    customerName: String(payload.customerName || "WALK-IN CUSTOMER"),
    customerMobile: String(payload.customerMobile || payload.phone || ""),
    customerIdType: Number(payload.customerIdType || 6),
    items,
    payments: [{ type: paymentMethod, amount }],
  };
}

async function reserveCounters(configId: string): Promise<{ dailyCounter: number; globalCounter: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const sql = "UPDATE tra_vfd_configs SET global_counter = global_counter + 1, daily_counter = CASE WHEN counter_date = $1 THEN daily_counter + 1 ELSE 1 END, counter_date = $1 WHERE id = $2 RETURNING global_counter, daily_counter";
  const rows = await prisma.$queryRawUnsafe<Array<{ global_counter: number; daily_counter: number }>>(sql, today, configId);
  if (!rows[0]) throw new Error("TRA_VFD_COUNTER_RESERVATION_FAILED");
  return { globalCounter: Number(rows[0].global_counter), dailyCounter: Number(rows[0].daily_counter) };
}
const RECONCILIATION_RETRY_MS = 60_000;

function reconciliationRetryAt(): Date {
  return new Date(Date.now() + RECONCILIATION_RETRY_MS);
}

export class TraVfdService {
  async getConfig(ctx: { tenantId: string; branchId: string }): Promise<TraVfdConfig> {
    const row = await prisma.traVfdConfig.findUnique({
      where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } },
    });
    return {
      enabled: Boolean(row?.enabled),
      endpoint: row?.endpoint || "",
      environment: row?.environment as "TEST" | "PRODUCTION" | undefined,
      tin: row?.tin || undefined, certSerial: row?.certSerial || undefined,
      registrationId: row?.registrationId || undefined, efdSerial: row?.efdSerial || undefined,
      receiptCode: row?.receiptCode || undefined, routingKey: row?.routingKey || undefined,
    };
  }

  async setConfig(ctx: { tenantId: string; branchId: string }, input: TraVfdConfig): Promise<TraVfdConfig> {
    const row = await prisma.traVfdConfig.upsert({
      where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } },
      create: {
        tenantId: ctx.tenantId, branchId: ctx.branchId, enabled: input.enabled, endpoint: input.endpoint,
        environment: input.environment || "TEST", tin: input.tin, certSerial: input.certSerial,
        registrationId: input.registrationId, efdSerial: input.efdSerial, receiptCode: input.receiptCode,
        routingKey: input.routingKey || "vfdrct",
      },
      update: {
        enabled: input.enabled, endpoint: input.endpoint, environment: input.environment,
        tin: input.tin, certSerial: input.certSerial, registrationId: input.registrationId,
        efdSerial: input.efdSerial, receiptCode: input.receiptCode, routingKey: input.routingKey,
      },
    });
    await recordFiscalAudit(
      { tenantId: ctx.tenantId, branchId: ctx.branchId, userId: (ctx as any).userId },
      "TRA_VFD_CONFIG_UPDATED",
      row.id,
      {
        enabled: row.enabled, environment: row.environment, endpointConfigured: Boolean(row.endpoint),
        tinConfigured: Boolean(row.tin), certificateConfigured: Boolean(row.certSerial),
        registrationConfigured: Boolean(row.registrationId), efdSerialConfigured: Boolean(row.efdSerial),
      },
    );
    return {
      enabled: row.enabled, endpoint: row.endpoint, environment: row.environment as "TEST" | "PRODUCTION",
      tin: row.tin || undefined, certSerial: row.certSerial || undefined, registrationId: row.registrationId || undefined,
      efdSerial: row.efdSerial || undefined, receiptCode: row.receiptCode || undefined, routingKey: row.routingKey || undefined,
    };
  }
  async enqueue(ctx: { tenantId: string; branchId: string }, req: CreateTraVfdFiscalizationRequest) {
    const existing = await prisma.traVfdFiscalization.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, transactionId: req.transactionId },
    });
    if (existing) return mapFiscalization(existing);
    const config = await prisma.traVfdConfig.findUnique({ where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } } });
    if (!config?.enabled) throw new Error("TRA_VFD_DISABLED");
    const fiscalization = await prisma.$transaction(async tx => {
      const lockKey = `kwakopos:tra-vfd-chain:${ctx.tenantId}:${ctx.branchId}:${req.deviceId}`;
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", lockKey);
      const latest = await tx.traVfdFiscalization.findFirst({
        where: { tenantId: ctx.tenantId, branchId: ctx.branchId, deviceId: req.deviceId },
        orderBy: { chainSequence: "desc" },
        select: { chainSequence: true, receiptHash: true },
      });
      const chainSequence = (latest?.chainSequence ?? 0) + 1;
      const previousReceiptHash = latest?.receiptHash || "GENESIS";
      const payload = req.payload as any;
      const invoiceNumber = String(payload.invoiceNumber || payload.receiptNumber || req.transactionId);
      const timestampUtc = canonicalFiscalTimestamp(payload, new Date());
      const receiptHash = computeReceiptHash(previousReceiptHash, invoiceNumber, timestampUtc, payload.grandTotal ?? payload.total, payload.taxTotal ?? payload.taxAmount);
      if (req.chainSequence !== undefined && (req.chainSequence !== chainSequence || req.previousReceiptHash !== previousReceiptHash || req.receiptHash !== receiptHash)) {
        throw new Error("TRA_VFD_FISCAL_CHAIN_CONFLICT");
      }
      const created = await tx.traVfdFiscalization.create({
        data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, receiptId: req.receiptId ?? null,
          transactionId: req.transactionId, deviceId: req.deviceId, chainSequence, previousReceiptHash, receiptHash,
          state: "LOCAL_FISCAL_PENDING", requestPayload: req.payload as any, attempts: 0, reconciliationStatus: "PENDING",
        },
      });
      await tx.traVfdOutbox.create({
        data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, fiscalizationId: created.id,
          operationId: created.id,
          idempotencyKey: "TRA-VFD:" + ctx.tenantId + ":" + ctx.branchId + ":" + req.transactionId,
          payload: req.payload as any, status: "PENDING",
        },
      });
      return created;
    });
    const mapped = mapFiscalization(fiscalization);
    await recordFiscalAudit(ctx as any, "TRA_VFD_FISCAL_ENQUEUED", mapped.id, {
      transactionId: mapped.transactionId, chainSequence: mapped.chainSequence, receiptId: mapped.receiptId, state: mapped.state,
    });
    return mapped;
  }

  async get(ctx: { tenantId: string; branchId: string }, id: string) {
    const row = await prisma.traVfdFiscalization.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    return row ? mapFiscalization(row) : null;
  }
  async submit(ctx: { tenantId: string; branchId: string }, id: string) {
    let row = await prisma.traVfdFiscalization.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!row) throw new Error("TRA_VFD_FISCALIZATION_NOT_FOUND");
    if (row.state === "TRA_VERIFIED") return mapFiscalization(row);

    const config = await prisma.traVfdConfig.findUnique({ where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } } });
    if (!config?.enabled) throw new Error("TRA_VFD_DISABLED");
    const provider = createTraVfdProvider(ctx.tenantId);
    if (!provider) return this.retry(row.id, ctx, "TRA_VFD_REAL_CREDENTIALS_NOT_CONFIGURED");
    if (row.state === "TRA_ACCEPTED") return this.reconcile(ctx, id);

    let submissionState = row.state as TraVfdFiscalState;
    if (submissionState === "TRA_REJECTED") {
      assertTransition(submissionState, "TRA_RETRY");
      await prisma.traVfdFiscalization.update({ where: { id: row.id }, data: { state: "TRA_RETRY", rejectedAt: null, nextAttemptAt: null } });
      submissionState = "TRA_RETRY";
    }
    assertTransition(submissionState, "SUBMITTING");
    const attempt = row.attempts + 1;
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({
        where: { id: row.id },
        data: { state: "SUBMITTING", attempts: attempt, submittedAt: new Date(), lastError: null, reconciliationStatus: "PENDING", reconciliationError: null },
      }),
      prisma.traVfdOutbox.updateMany({
        where: { fiscalizationId: row.id, tenantId: ctx.tenantId, branchId: ctx.branchId },
        data: { status: "SUBMITTING", attempts: attempt, lastError: null },
      }),
    ]);
    await recordFiscalAudit(ctx as any, "TRA_VFD_SUBMITTING", row.id, { attempt });
    try {
      const counters = await reserveCounters(config.id);
      const input = buildReceiptInput(row, config, counters);
      const response = await provider.submitReceipt(input);
      const responsePayload = { provider: "TRA", environment: config.environment, verificationUrl: response.verificationUrl, number: response.number, date: response.date, time: response.time, code: response.code, message: response.message };
      await prisma.$transaction([
        prisma.traVfdFiscalization.update({
          where: { id: row.id },
          data: {
            state: "TRA_ACCEPTED", responsePayload: responsePayload as any,
            fiscalReceiptNumber: response.number == null ? null : String(response.number),
            fiscalCode: response.verificationCode || null, verificationCode: response.verificationCode || null,
            acceptedAt: new Date(), verifiedAt: null, reconciliationStatus: "PENDING", reconciliationError: null,
            lastError: null, nextAttemptAt: null,
          },
        }),
        prisma.traVfdOutbox.updateMany({
          where: { fiscalizationId: row.id, tenantId: ctx.tenantId, branchId: ctx.branchId },
          data: { status: "SENT", processedAt: new Date(), lastError: null, nextAttemptAt: null },
        }),
      ]);
      await recordFiscalAudit(ctx as any, "TRA_VFD_ACCEPTED", row.id, {
        fiscalReceiptNumber: response.number == null ? null : String(response.number),
        verificationCode: response.verificationCode || null,
      });
      return this.reconcile(ctx, row.id);
    } catch (error: any) {
      const message = error?.message || "TRA_VFD_SUBMISSION_FAILED";
      if (message.startsWith("TRA_VFD_REJECTED:")) return this.reject(row.id, ctx, message, { message }, attempt);
      return this.retry(row.id, ctx, message, attempt);
    }
  }
  async reconcile(ctx: { tenantId: string; branchId: string }, id: string) {
    const row = await prisma.traVfdFiscalization.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!row) throw new Error("TRA_VFD_FISCALIZATION_NOT_FOUND");
    if (row.state === "TRA_VERIFIED") return mapFiscalization(row);
    if (row.state !== "TRA_ACCEPTED") return mapFiscalization(row);

    const provider = createTraVfdProvider(ctx.tenantId);
    const responsePayload: any = row.responsePayload || {};
    const verificationUrl = extractString(responsePayload, ["verificationUrl"]);
    const expectedReceiptNumber = String(row.fiscalReceiptNumber || responsePayload.number || "");
    const totalIncl = totalOf(row.requestPayload);
    const config = await this.getConfig(ctx);

    if (!provider || !verificationUrl || !expectedReceiptNumber || !config.tin) {
      const message = !provider ? "TRA_VFD_REAL_CREDENTIALS_NOT_CONFIGURED" : "TRA_VFD_VERIFICATION_REFERENCE_MISSING";
      const updated = await prisma.traVfdFiscalization.update({
        where: { id: row.id },
        data: { reconciliationStatus: "UNAVAILABLE", reconciliationError: message, nextAttemptAt: reconciliationRetryAt() },
      });
      return mapFiscalization(updated);
    }

    try {
      const result = await provider.verifyReceipt(verificationUrl, {
        receiptNumber: expectedReceiptNumber,
        tin: config.tin,
        totalIncl,
        verificationCode: row.verificationCode,
      });
      if (result.matched) {
        const verified = await prisma.traVfdFiscalization.update({
          where: { id: row.id },
          data: {
            state: "TRA_VERIFIED", verifiedAt: new Date(), reconciliationStatus: "MATCHED",
            reconciledAt: new Date(), reconciliationError: null, lastError: null,
            responsePayload: { ...responsePayload, reconciliation: result.details } as any,
          },
        });
        return mapFiscalization(verified);
      }
      const mismatch = await prisma.traVfdFiscalization.update({
        where: { id: row.id },
        data: { reconciliationStatus: "MISMATCH", reconciledAt: new Date(), reconciliationError: "TRA_VFD_VERIFICATION_MISMATCH", lastError: "TRA_VFD_VERIFICATION_MISMATCH" },
      });
      return mapFiscalization(mismatch);
    } catch (error: any) {
      const unavailable = await prisma.traVfdFiscalization.update({
        where: { id: row.id },
        data: { reconciliationStatus: "UNAVAILABLE", reconciliationError: error?.message || "TRA_VFD_VERIFICATION_UNAVAILABLE", nextAttemptAt: reconciliationRetryAt() },
      });
      return mapFiscalization(unavailable);
    }
  }
  async listPending(ctx: { tenantId: string; branchId: string }) {
    const rows = await prisma.traVfdFiscalization.findMany({
      where: {
        tenantId: ctx.tenantId, branchId: ctx.branchId,
        OR: [
          { state: "LOCAL_FISCAL_PENDING" },
          { state: "TRA_RETRY", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
          { state: "TRA_ACCEPTED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
          { reconciliationStatus: "UNAVAILABLE", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
          { reconciliationStatus: "PENDING", state: "TRA_ACCEPTED" },
        ],
      },
      orderBy: { createdAt: "asc" }, take: 100,
    });
    return rows.map(mapFiscalization);
  }

  async getStatus(ctx: { tenantId: string; branchId: string }): Promise<TraVfdIntegrationStatus> {
    const config = await prisma.traVfdConfig.findUnique({ where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } } });
    const rows = await prisma.traVfdFiscalization.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId },
      select: { state: true, reconciliationStatus: true, verifiedAt: true },
    });
    const stateCounts = Object.fromEntries(STATES.map(s => [s, 0])) as Record<TraVfdFiscalState, number>;
    const reconciliationCounts = Object.fromEntries(RECONCILIATION.map(s => [s, 0])) as Record<(typeof RECONCILIATION)[number], number>;
    let lastVerifiedAt: Date | null = null;
    for (const row of rows) {
      if (STATES.includes(row.state as TraVfdFiscalState)) stateCounts[row.state as TraVfdFiscalState]++;
      const reconciliationStatus = row.reconciliationStatus as (typeof RECONCILIATION)[number];
      if (RECONCILIATION.includes(reconciliationStatus)) reconciliationCounts[reconciliationStatus]++;
      if (row.verifiedAt && (!lastVerifiedAt || row.verifiedAt > lastVerifiedAt)) lastVerifiedAt = row.verifiedAt;
    }
    const pendingOutboxCount = await prisma.traVfdOutbox.count({ where: { tenantId: ctx.tenantId, branchId: ctx.branchId, status: { in: ["PENDING", "SUBMITTING"] } } });
    const providerReady = Boolean(createTraVfdProvider(ctx.tenantId));
    let status: TraVfdIntegrationStatus["status"] = "DISABLED";
    if (config?.enabled) {
      if (!providerReady) status = "NOT_CONFIGURED";
      else if (reconciliationCounts.MISMATCH > 0) status = "RECONCILIATION_REQUIRED";
      else if (stateCounts.TRA_RETRY > 0) status = "RETRY";
      else if (stateCounts.TRA_REJECTED > 0) status = "REJECTED";
      else if (stateCounts.SUBMITTING > 0) status = "SUBMITTING";
      else if (pendingOutboxCount > 0 || stateCounts.LOCAL_FISCAL_PENDING > 0) status = "PENDING";
      else if (stateCounts.TRA_VERIFIED > 0) status = "VERIFIED";
      else if (stateCounts.TRA_ACCEPTED > 0) status = "ACCEPTED";
    }
    return {
      configured: providerReady,
      environment: config?.environment === "PRODUCTION" ? "PRODUCTION" : "TEST",
      stateCounts, reconciliationCounts, pendingOutboxCount,
      lastVerifiedAt: lastVerifiedAt?.toISOString() || null, status,
    };
  }

  private async reject(id: string, ctx: { tenantId: string; branchId: string }, reason: string, body: any, attempt: number) {
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({
        where: { id },
        data: { state: "TRA_REJECTED", rejectedAt: new Date(), lastError: reason, responsePayload: body, attempts: attempt, nextAttemptAt: null },
      }),
      prisma.traVfdOutbox.updateMany({
        where: { fiscalizationId: id, tenantId: ctx.tenantId, branchId: ctx.branchId },
        data: { status: "FAILED", lastError: reason },
      }),
    ]);
    await recordFiscalAudit(ctx as any, "TRA_VFD_REJECTED", id, { reason, attempt });
    return mapFiscalization(await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } }));
  }
  private async retry(id: string, ctx: { tenantId: string; branchId: string }, reason: string, attempt?: number) {
    const currentAttempt = attempt ?? ((await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } })).attempts + 1);
    const next = new Date(Date.now() + Math.min(300000, 5000 * Math.pow(2, Math.max(0, currentAttempt - 1))));
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({
        where: { id },
        data: { state: "TRA_RETRY", attempts: currentAttempt, lastError: reason, nextAttemptAt: next },
      }),
      prisma.traVfdOutbox.updateMany({
        where: { fiscalizationId: id, tenantId: ctx.tenantId, branchId: ctx.branchId },
        data: { status: "PENDING", attempts: currentAttempt, lastError: reason, nextAttemptAt: next },
      }),
    ]);
    await recordFiscalAudit(ctx as any, "TRA_VFD_RETRY_SCHEDULED", id, {
      reason, attempt: currentAttempt, nextAttemptAt: next.toISOString(),
    });
    return mapFiscalization(await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } }));
  }
}

export const globalTraVfdService = new TraVfdService();

let traVfdWorkerTimer: NodeJS.Timeout | null = null;
let traVfdWorkerRunning = false;

export async function runTraVfdReconciliationCycle(limitPerScope = 25): Promise<{ scopes: number; processed: number }> {
  if (traVfdWorkerRunning) return { scopes: 0, processed: 0 };
  traVfdWorkerRunning = true;
  let scopes = 0;
  let processed = 0;
  try {
    const lockRows = await prisma.$queryRawUnsafe<Array<{ locked: boolean }>>(
      "SELECT pg_try_advisory_lock(hashtext('kwakopos:tra-vfd-reconciliation')) AS locked",
    );
    if (!lockRows[0]?.locked) return { scopes: 0, processed: 0 };
    try {
      const configs = await prisma.traVfdConfig.findMany({
        where: { enabled: true },
        select: { tenantId: true, branchId: true },
        orderBy: [{ tenantId: "asc" }, { branchId: "asc" }],
      });
      for (const config of configs) {
        scopes++;
        const rows = await globalTraVfdService.listPending({ tenantId: config.tenantId, branchId: config.branchId });
        for (const fiscal of rows.slice(0, limitPerScope)) {
          try {
            if (fiscal.state === "TRA_ACCEPTED") await globalTraVfdService.reconcile(config, fiscal.id);
            else if (fiscal.state === "LOCAL_FISCAL_PENDING" || fiscal.state === "TRA_RETRY") await globalTraVfdService.submit(config, fiscal.id);
            processed++;
          } catch {
            // Individual fiscalizations remain durable and are retried on the next cycle.
          }
        }
      }
      return { scopes, processed };
    } finally {
      await prisma.$queryRawUnsafe("SELECT pg_advisory_unlock(hashtext('kwakopos:tra-vfd-reconciliation'))");
    }
  } finally {
    traVfdWorkerRunning = false;
  }
}

export function startTraVfdReconciliationWorker(intervalMs = 60_000): void {
  if (traVfdWorkerTimer) return;
  void runTraVfdReconciliationCycle();
  traVfdWorkerTimer = setInterval(() => void runTraVfdReconciliationCycle(), intervalMs);
}
