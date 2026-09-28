import { apiFetch } from "./apiClient.js";
import type { LocalIndexedDbStore, TenantScopedContext } from "../indexedDb.js";

export type TraVfdFiscalState =
  | "LOCAL_FISCAL_PENDING" | "SUBMITTING" | "TRA_ACCEPTED"
  | "TRA_REJECTED" | "TRA_RETRY" | "TRA_VERIFIED";

export interface TraVfdOutboxItem {
  id: string; tenantId: string; branchId: string;
  receiptId?: string | null; transactionId: string; deviceId: string;
  payload: Record<string, unknown>; fiscalState: TraVfdFiscalState;
  status: "PENDING" | "SUBMITTING" | "SENT" | "FAILED";
  fiscalizationId?: string; attempts: number; lastError?: string;
  nextAttemptAt?: string | null; createdAt: string; updatedAt: string;
}

const CONFIG_KEY = "tra_vfd_config";

export function getTraVfdConfig(db: LocalIndexedDbStore, ctx: TenantScopedContext) {
  return db.getConfigurationLocal(CONFIG_KEY, ctx) || { enabled: false, endpoint: "" };
}

function makeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID() : `TVFD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
export function enqueueTraVfdOutbox(
  db: LocalIndexedDbStore,
  ctx: Required<Pick<TenantScopedContext, "tenantId" | "branchId">>,
  input: { receiptId?: string | null; transactionId: string; deviceId: string; payload: Record<string, unknown> },
): TraVfdOutboxItem | null {
  const config = getTraVfdConfig(db, ctx);
  if (!config.enabled) return null;
  const existing = [...db.traVfdOutbox.values()].find(
    (item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId && item.transactionId === input.transactionId,
  );
  if (existing) return existing;
  const now = new Date().toISOString();
  const item: TraVfdOutboxItem = {
    id: makeId(), tenantId: ctx.tenantId, branchId: ctx.branchId,
    receiptId: input.receiptId ?? null, transactionId: input.transactionId, deviceId: input.deviceId,
    payload: input.payload, fiscalState: "LOCAL_FISCAL_PENDING", status: "PENDING",
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
          deviceId: item.deviceId, payload: item.payload,
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
  return { processed, accepted, failed };
}
