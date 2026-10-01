import { apiFetch } from "./apiClient.js";
import type { LocalIndexedDbStore, TenantScopedContext } from "../indexedDb.js";

export type TraVfdFiscalState =
  | "LOCAL_FISCAL_PENDING" | "SUBMITTING" | "TRA_ACCEPTED"
  | "TRA_REJECTED" | "TRA_RETRY" | "TRA_VERIFIED";

export interface TraVfdOutboxItem {
  id: string; tenantId: string; branchId: string;
  receiptId?: string | null; transactionId: string; deviceId: string;
  chainSequence: number; previousReceiptHash?: string | null; receiptHash?: string | null;
  payload: Record<string, unknown>; fiscalState: TraVfdFiscalState;
  status: "PENDING" | "SUBMITTING" | "SENT" | "FAILED";
  fiscalizationId?: string; attempts: number; lastError?: string;
  nextAttemptAt?: string | null; createdAt: string; updatedAt: string;
}

const CONFIG_KEY = "tra_vfd_config";

export function getTraVfdConfig(db: LocalIndexedDbStore, ctx: TenantScopedContext) {
  return db.getConfigurationLocal(CONFIG_KEY, ctx) || { enabled: false, endpoint: "" };
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalMoney(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) throw new Error("TRA_VFD_INVALID_MONEY");
  return amount.toFixed(2);
}

async function buildLocalChain(db: LocalIndexedDbStore, ctx: { tenantId: string; branchId: string }, input: { deviceId: string; transactionId: string; payload: Record<string, unknown>; createdAt: string }) {
  const previous = [...db.traVfdOutbox.values()]
    .filter((item: any) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId && item.deviceId === input.deviceId && item.receiptHash)
    .sort((a: any, b: any) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .at(-1);
  const chainSequence = Number(previous?.chainSequence || 0) + 1;
  const previousReceiptHash = previous?.receiptHash || "GENESIS";
  const payload = input.payload;
  const invoiceNumber = String(payload.invoiceNumber || payload.receiptNumber || input.transactionId);
  const timestampUtc = new Date(String(payload.createdAt || payload.created_at || input.createdAt)).toISOString();
  const canonical = `${previousReceiptHash}|${invoiceNumber}|${timestampUtc}|${canonicalMoney(payload.grandTotal ?? payload.total)}|${canonicalMoney(payload.taxTotal ?? payload.taxAmount)}`;
  const receiptHash = await sha256Hex(canonical);
  return { chainSequence, previousReceiptHash, receiptHash };
}
function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `TVFD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export async function enqueueTraVfdOutbox(
  db: LocalIndexedDbStore,
  ctx: Required<Pick<TenantScopedContext, "tenantId" | "branchId">>,
  input: { receiptId?: string | null; transactionId: string; deviceId: string; payload: Record<string, unknown> },
): Promise<TraVfdOutboxItem | null> {
  const config = getTraVfdConfig(db, ctx);
  if (!config.enabled) return null;
  const existing = [...db.traVfdOutbox.values()].find(
    (item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId && item.transactionId === input.transactionId,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const chain = await buildLocalChain(db, ctx, { deviceId: input.deviceId, transactionId: input.transactionId, payload: input.payload, createdAt: now });
  const item: TraVfdOutboxItem = {
    id: makeId(), tenantId: ctx.tenantId, branchId: ctx.branchId,
    receiptId: input.receiptId ?? null, transactionId: input.transactionId, deviceId: input.deviceId,
    payload: input.payload, fiscalState: "LOCAL_FISCAL_PENDING", status: "PENDING",
    chainSequence: chain.chainSequence, previousReceiptHash: chain.previousReceiptHash, receiptHash: chain.receiptHash,
    attempts: 0, nextAttemptAt: null, createdAt: now, updatedAt: now,
  };
  db.traVfdOutbox.set(item.id, item);
  db.persist("traVfdOutbox", item.id, item);
  return item;
}

function saveItem(db: LocalIndexedDbStore, item: TraVfdOutboxItem) {
  item.updatedAt = new Date().toISOString();
  db.traVfdOutbox.set(item.id, item);
  db.persist("traVfdOutbox", item.id, item);
}
function applyFiscalResult(db: LocalIndexedDbStore, item: TraVfdOutboxItem, result: any) {
  const sale = db.sales.get(item.transactionId);
  const receipt = db.receipts.get(item.receiptId || item.transactionId);
  for (const row of [sale, receipt]) {
    if (!row) continue;
    row.fiscalizationState = result.state;
    row.fiscalizationId = result.id;
    if (result.fiscalCode) row.rctv = result.fiscalCode;
    if (result.fiscalReceiptNumber) row.fiscalReceiptNumber = result.fiscalReceiptNumber;
    if (result.verificationCode) row.verificationCode = result.verificationCode;
    db.persist(row === sale ? "sales" : "receipts", row.id, row);
  }
}

export async function processTraVfdOutbox(
  db: LocalIndexedDbStore,
  ctx: Required<Pick<TenantScopedContext, "tenantId" | "branchId">>,
): Promise<{ processed: number; accepted: number; failed: number }> {
  await db.ready;
  const config = getTraVfdConfig(db, ctx);
  if (!config.enabled) return { processed: 0, accepted: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { processed: 0, accepted: 0, failed: 0 };
  const now = Date.now();
  const items = [...db.traVfdOutbox.values()].filter((item) =>
    item.tenantId === ctx.tenantId && item.branchId === ctx.branchId &&
    item.status !== "SENT" &&
    ["LOCAL_FISCAL_PENDING", "TRA_RETRY"].includes(item.fiscalState) &&
    (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now),
  );
  let processed = 0, accepted = 0, failed = 0;
  for (const item of items.slice(0, 10)) {
    try {
      saveItem(db, { ...item, status: "SUBMITTING", fiscalState: "SUBMITTING" });
      const queued = await apiFetch<any>("/api/v1/tra-vfd/queue", {
        method: "POST",
        headers: { "x-tenant-id": ctx.tenantId, "x-branch-id": ctx.branchId },
        body: JSON.stringify({
          receiptId: item.receiptId, transactionId: item.transactionId,
          deviceId: item.deviceId, chainSequence: item.chainSequence, previousReceiptHash: item.previousReceiptHash, receiptHash: item.receiptHash, payload: item.payload,
        }),
      });
      const fiscal = queued.data || queued;
      item.fiscalizationId = fiscal.id;
      item.fiscalState = fiscal.state;
      saveItem(db, item);

      const submitted = await apiFetch<any>(`/api/v1/tra-vfd/submit/${encodeURIComponent(fiscal.id)}`, {
        method: "POST", headers: { "x-tenant-id": ctx.tenantId, "x-branch-id": ctx.branchId },
      });
      const result = submitted.data || submitted;
      item.fiscalizationId = result.id;
      item.fiscalState = result.state;
      item.status = ["TRA_ACCEPTED", "TRA_VERIFIED"].includes(result.state) ? "SENT" : "PENDING";
      item.lastError = result.lastError || undefined;
      item.nextAttemptAt = result.nextAttemptAt || null;
      item.attempts = result.attempts ?? item.attempts;
      saveItem(db, item);
      applyFiscalResult(db, item, result);
      processed++;
      if (result.state === "TRA_ACCEPTED" || result.state === "TRA_VERIFIED") accepted++;
      else if (result.state === "TRA_REJECTED") failed++;
    } catch (error: any) {
      const nextAttempt = item.attempts + 1;
      item.attempts = nextAttempt;
      item.status = "PENDING";
      item.fiscalState = "TRA_RETRY";
      item.lastError = error?.message || "TRA_VFD_DISPATCH_FAILED";
      item.nextAttemptAt = new Date(Date.now() + Math.min(300000, 5000 * Math.pow(2, nextAttempt - 1))).toISOString();
      saveItem(db, item);
      failed++;
    }
  }

  // Reconcile server-side accepted receipts even after the local dispatch item is SENT.
  // The server remains authoritative for TRA fiscal state and verification.
  try {
    const pendingResponse = await apiFetch<any>("/api/v1/tra-vfd/pending", {
      headers: { "x-tenant-id": ctx.tenantId, "x-branch-id": ctx.branchId },
    });
    const pendingFiscalizations = Array.isArray(pendingResponse?.data || pendingResponse)
      ? (pendingResponse.data || pendingResponse)
      : [];
    for (const fiscal of pendingFiscalizations.slice(0, 10)) {
      const endpoint = fiscal.state === "TRA_ACCEPTED"
        ? `/api/v1/tra-vfd/reconcile/${encodeURIComponent(fiscal.id)}`
        : `/api/v1/tra-vfd/submit/${encodeURIComponent(fiscal.id)}`;
      try {
        const response = await apiFetch<any>(endpoint, {
          method: "POST",
          headers: { "x-tenant-id": ctx.tenantId, "x-branch-id": ctx.branchId },
        });
        const result = response.data || response;
        const local = [...db.traVfdOutbox.values()].find(
          item => item.fiscalizationId === result.id || item.transactionId === result.transactionId,
        );
        if (local) {
          local.fiscalizationId = result.id;
          local.fiscalState = result.state;
          local.status = result.state === "TRA_VERIFIED" ? "SENT" : "PENDING";
          local.lastError = result.lastError || result.reconciliationError || undefined;
          local.nextAttemptAt = result.nextAttemptAt || null;
          saveItem(db, local);
          applyFiscalResult(db, local, result);
        }
        processed++;
        if (result.state === "TRA_VERIFIED") accepted++;
      } catch {
        // Reconciliation remains durable on the server and will be retried later.
      }
    }
  } catch {
    // Offline/provider unavailability must not destroy the dedicated fiscal queue.
  }

  return { processed, accepted, failed };
}
