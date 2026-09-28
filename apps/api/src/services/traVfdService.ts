import { prisma } from "@kwakopos2/database";
import {
  TraVfdFiscalState,
  TraVfdFiscalizationDTO,
  CreateTraVfdFiscalizationRequest,
  TraVfdConfig,
} from "@kwakopos2/contracts";

const TRANSITIONS: Record<TraVfdFiscalState, readonly TraVfdFiscalState[]> = {
  LOCAL_FISCAL_PENDING: ["SUBMITTING"],
  SUBMITTING: ["TRA_ACCEPTED", "TRA_REJECTED", "TRA_RETRY"],
  TRA_ACCEPTED: ["TRA_VERIFIED"],
  TRA_REJECTED: ["TRA_RETRY"],
  TRA_RETRY: ["SUBMITTING", "TRA_REJECTED"],
  TRA_VERIFIED: [],
};

function assertTransition(from: TraVfdFiscalState, to: TraVfdFiscalState): void {
  if (!TRANSITIONS[from]?.includes(to)) throw new Error(`TRA_VFD_INVALID_TRANSITION:${from}->${to}`);
}

function mapFiscalization(row: any): TraVfdFiscalizationDTO {
  return {
    id: row.id, tenantId: row.tenantId, branchId: row.branchId,
    receiptId: row.receiptId, transactionId: row.transactionId, deviceId: row.deviceId,
    state: row.state as TraVfdFiscalState, requestPayload: row.requestPayload,
    responsePayload: row.responsePayload ?? null, fiscalReceiptNumber: row.fiscalReceiptNumber ?? null,
    fiscalCode: row.fiscalCode ?? null, verificationCode: row.verificationCode ?? null,
    lastError: row.lastError ?? null, attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function extractString(body: any, keys: string[]): string | null {
  for (const key of keys) {
    const value = body?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export class TraVfdService {
  async getConfig(ctx: { tenantId: string; branchId: string }): Promise<TraVfdConfig> {
    const row = await prisma.traVfdConfig.findUnique({
      where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } },
    });
    return { enabled: Boolean(row?.enabled), endpoint: row?.endpoint || "" };
  }

  async setConfig(ctx: { tenantId: string; branchId: string }, input: TraVfdConfig): Promise<TraVfdConfig> {
    if (input.enabled && !input.endpoint) throw new Error("TRA_VFD_ENDPOINT_REQUIRED_WHEN_ENABLED");
    const row = await prisma.traVfdConfig.upsert({
      where: { tenantId_branchId: { tenantId: ctx.tenantId, branchId: ctx.branchId } },
      create: { tenantId: ctx.tenantId, branchId: ctx.branchId, enabled: input.enabled, endpoint: input.endpoint },
      update: { enabled: input.enabled, endpoint: input.endpoint },
    });
    return { enabled: row.enabled, endpoint: row.endpoint };
  }
  async enqueue(ctx: { tenantId: string; branchId: string }, req: CreateTraVfdFiscalizationRequest) {
    const existing = await prisma.traVfdFiscalization.findFirst({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, transactionId: req.transactionId },
    });
    if (existing) return mapFiscalization(existing);
    const config = await this.getConfig(ctx);
    if (!config.enabled) throw new Error("TRA_VFD_DISABLED");

    const fiscalization = await prisma.$transaction(async (tx) => {
      const created = await tx.traVfdFiscalization.create({
        data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, receiptId: req.receiptId ?? null,
          transactionId: req.transactionId, deviceId: req.deviceId, state: "LOCAL_FISCAL_PENDING",
          requestPayload: req.payload as any, attempts: 0,
        },
      });
      await tx.traVfdOutbox.create({
        data: {
          tenantId: ctx.tenantId, branchId: ctx.branchId, fiscalizationId: created.id,
          operationId: created.id, idempotencyKey: `TRA-VFD:${ctx.tenantId}:${ctx.branchId}:${req.transactionId}`,
          payload: req.payload as any, status: "PENDING",
        },
      });
      return created;
    });
    return mapFiscalization(fiscalization);
  }
  async get(ctx: { tenantId: string; branchId: string }, id: string) {
    const row = await prisma.traVfdFiscalization.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    return row ? mapFiscalization(row) : null;
  }

  async submit(ctx: { tenantId: string; branchId: string }, id: string) {
    const row = await prisma.traVfdFiscalization.findFirst({ where: { id, tenantId: ctx.tenantId, branchId: ctx.branchId } });
    if (!row) throw new Error("TRA_VFD_FISCALIZATION_NOT_FOUND");
    let current = row.state as TraVfdFiscalState;
    if (current === "TRA_VERIFIED" || current === "TRA_ACCEPTED") return mapFiscalization(row);
    const config = await this.getConfig(ctx);
    if (!config.enabled) throw new Error("TRA_VFD_DISABLED");
    if (!config.endpoint) return this.retry(row.id, ctx, "TRA_VFD_ENDPOINT_NOT_CONFIGURED");

    if (current === "TRA_REJECTED") {
      assertTransition(current, "TRA_RETRY");
      await prisma.$transaction([
        prisma.traVfdFiscalization.update({
          where: { id: row.id },
          data: { state: "TRA_RETRY", nextAttemptAt: null, rejectedAt: null },
        }),
        prisma.traVfdOutbox.updateMany({
          where: { fiscalizationId: row.id, tenantId: ctx.tenantId, branchId: ctx.branchId },
          data: { status: "PENDING", nextAttemptAt: null },
        }),
      ]);
      current = "TRA_RETRY";
    }

    assertTransition(current, "SUBMITTING");
    const attempt = row.attempts + 1;
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({ where: { id: row.id }, data: {
        state: "SUBMITTING", attempts: attempt, submittedAt: new Date(), lastError: null,
      }}),
      prisma.traVfdOutbox.updateMany({ where: { fiscalizationId: row.id, tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { status: "SUBMITTING", attempts: attempt, lastError: null }}),
    ]);

    let response: Response;
    let body: any = {};
    try {
      response = await fetch(config.endpoint, {
        method: "POST", headers: { "content-type": "application/json", "x-idempotency-key": row.id },
        body: JSON.stringify(row.requestPayload),
      });
      body = await response.json().catch(() => ({}));
    } catch (error: any) {
      return this.retry(row.id, ctx, error?.message || "TRA_VFD_NETWORK_ERROR", attempt);
    }
    if (!response.ok || body?.success === false || body?.accepted === false) {
      return this.reject(row.id, ctx, extractString(body, ["message", "error", "reason"]) || `HTTP_${response.status}`, body, attempt);
    }
    const fiscalReceiptNumber = extractString(body, ["fiscalReceiptNumber", "fiscalInvoiceNumber"]);
    const fiscalCode = extractString(body, ["fiscalCode", "rctv"]);
    const verificationCode = extractString(body, ["verificationCode", "verification", "qrCode"]);
    const verified = body?.verified === true || body?.verificationStatus === "VERIFIED";
    const nextState: TraVfdFiscalState = verified ? "TRA_VERIFIED" : "TRA_ACCEPTED";

    await prisma.$transaction([
      prisma.traVfdFiscalization.update({
        where: { id: row.id },
        data: {
          state: nextState, responsePayload: body,
          fiscalReceiptNumber, fiscalCode, verificationCode,
          acceptedAt: new Date(), verifiedAt: verified ? new Date() : null, lastError: null, nextAttemptAt: null,
        },
      }),
      prisma.traVfdOutbox.updateMany({
        where: { fiscalizationId: row.id, tenantId: ctx.tenantId, branchId: ctx.branchId },
        data: { status: "SENT", processedAt: new Date(), lastError: null, nextAttemptAt: null },
      }),
    ]);
    const finalRow = await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id: row.id } });
    return mapFiscalization(finalRow);
  }

  private async reject(id: string, ctx: { tenantId: string; branchId: string }, reason: string, body: any, attempt: number) {
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({ where: { id }, data: { state: "TRA_REJECTED", rejectedAt: new Date(), lastError: reason, responsePayload: body, attempts: attempt, nextAttemptAt: null } }),
      prisma.traVfdOutbox.updateMany({ where: { fiscalizationId: id, tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { status: "FAILED", lastError: reason } }),
    ]);
    return mapFiscalization(await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } }));
  }
  private async retry(id: string, ctx: { tenantId: string; branchId: string }, reason: string, attempt?: number) {
    const currentAttempt = attempt ?? ((await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } })).attempts + 1);
    const next = new Date(Date.now() + Math.min(300000, 5000 * Math.pow(2, Math.max(0, currentAttempt - 1))));
    await prisma.$transaction([
      prisma.traVfdFiscalization.update({ where: { id }, data: { state: "TRA_RETRY", attempts: currentAttempt, lastError: reason, nextAttemptAt: next } }),
      prisma.traVfdOutbox.updateMany({ where: { fiscalizationId: id, tenantId: ctx.tenantId, branchId: ctx.branchId }, data: { status: "PENDING", attempts: currentAttempt, lastError: reason, nextAttemptAt: next } }),
    ]);
    return mapFiscalization(await prisma.traVfdFiscalization.findUniqueOrThrow({ where: { id } }));
  }

  async listPending(ctx: { tenantId: string; branchId: string }) {
    const rows = await prisma.traVfdFiscalization.findMany({
      where: { tenantId: ctx.tenantId, branchId: ctx.branchId, state: { in: ["LOCAL_FISCAL_PENDING", "TRA_RETRY"] } },
      orderBy: { createdAt: "asc" }, take: 100,
    });
    return rows.map(mapFiscalization);
  }
}

export const globalTraVfdService = new TraVfdService();
