import { createHash } from "node:crypto";
import type { SyncPushRequest } from "@kwakopos2/contracts";

export type SyncOperationEnvelope = SyncPushRequest["operations"][number];

export const MAX_SYNC_BATCH_SIZE = 500;
export const MAX_SYNC_STRING_LENGTH = 512;

function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stableNormalize(input[key])]));
  }
  return value;
}

export function operationFingerprint(op: SyncOperationEnvelope): string {
  const normalized = stableNormalize({
    entityType: op.entityType,
    entityId: op.entityId,
    operationType: op.operationType,
    payload: op.payload,
  });
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function validateSyncRequest(request: SyncPushRequest): void {
  if (!request || typeof request !== "object") throw new Error("SYNC_PROTOCOL_INVALID: request must be an object");
  if (typeof request.deviceId !== "string" || !request.deviceId.trim() || request.deviceId.length > 128) {
    throw new Error("SYNC_PROTOCOL_INVALID: invalid deviceId");
  }
  if (!Array.isArray(request.operations) || request.operations.length === 0) {
    throw new Error("SYNC_PROTOCOL_INVALID: operations must be a non-empty array");
  }
  if (request.operations.length > MAX_SYNC_BATCH_SIZE) {
    throw new Error(`SYNC_BATCH_TOO_LARGE: maximum ${MAX_SYNC_BATCH_SIZE} operations per push`);
  }

  const seenIds = new Map<string, string>();
  const seenKeys = new Map<string, string>();
  for (const op of request.operations) {
    if (!op || typeof op !== "object") throw new Error("SYNC_PROTOCOL_INVALID: operation must be an object");
    for (const [name, value, max] of [
      ["operationId", op.operationId, MAX_SYNC_STRING_LENGTH],
      ["idempotencyKey", op.idempotencyKey, MAX_SYNC_STRING_LENGTH],
      ["entityType", op.entityType, 128],
      ["entityId", op.entityId, 128],
      ["clientCreatedAt", op.clientCreatedAt, 64],
    ] as const) {
      if (typeof value !== "string" || !value.trim() || value.length > max) {
        throw new Error(`SYNC_PROTOCOL_INVALID: invalid ${name}`);
      }
    }
    if (!["CREATE", "UPDATE", "DELETE"].includes(String(op.operationType))) {
      throw new Error("SYNC_PROTOCOL_INVALID: invalid operationType");
    }
    if (!op.payload || typeof op.payload !== "object" || Array.isArray(op.payload)) {
      throw new Error("SYNC_PROTOCOL_INVALID: payload must be an object");
    }
    if (!Number.isFinite(Date.parse(op.clientCreatedAt))) {
      throw new Error("SYNC_PROTOCOL_INVALID: clientCreatedAt must be a valid ISO date");
    }
    const fingerprint = operationFingerprint(op);
    const priorId = seenIds.get(op.operationId);
    if (priorId && priorId !== fingerprint) throw new Error("SYNC_IDEMPOTENCY_CONFLICT: operationId reused with different content");
    const priorKey = seenKeys.get(op.idempotencyKey);
    if (priorKey && priorKey !== fingerprint) throw new Error("SYNC_IDEMPOTENCY_CONFLICT: idempotencyKey reused with different content");
    seenIds.set(op.operationId, fingerprint);
    seenKeys.set(op.idempotencyKey, fingerprint);

    const forbiddenKeys = Object.keys(op.payload).filter((key) => ["__proto__", "constructor", "prototype"].includes(key));
    if (forbiddenKeys.length) throw new Error("SYNC_PROTOCOL_INVALID: forbidden payload keys");
  }
}

export function syncDependencyRank(op: SyncOperationEnvelope): number {
  if (op.entityType === "Setting" || op.entityType === "FeatureFlag") return 1;
  if (op.entityType === "Category" || op.entityType === "Brand") return 5;
  if (op.entityType === "Product" && op.operationType === "CREATE") return 10;
  if (op.entityType === "Product" && op.operationType === "UPDATE") return 20;
  if (op.entityType === "ProductVariant" && op.operationType === "CREATE") return 30;
  if (op.entityType === "ProductVariant" && op.operationType === "UPDATE") return 40;
  if (op.entityType === "ProductVariant" && op.operationType === "DELETE") return 50;
  if (op.entityType === "StockAdjustment" && op.operationType === "CREATE") return 60;
  if (op.entityType === "Customer" || op.entityType === "Supplier") return 70;
  if (op.entityType === "PurchaseOrder") return 80;
  if (op.entityType === "Sale") return 90;
  if (op.entityType === "Receipt") return 92;
  if (op.entityType === "PurchaseReceipt") return 90;
  if (op.entityType === "Expense") return 95;
  if (op.entityType === "Payment" || op.entityType === "CashSession") return 100;
  if (op.entityType.startsWith("Plugin:") || ["RestaurantTable", "KitchenTicket", "GarageVehicle", "GarageWorkOrder", "PharmacyPrescription", "TelecomSite"].includes(op.entityType)) return 110;
  return 120;
}

export function orderSyncOperations<T extends SyncOperationEnvelope>(operations: T[]): T[] {
  return [...operations].sort((a, b) => {
    const rankDiff = syncDependencyRank(a) - syncDependencyRank(b);
    if (rankDiff !== 0) return rankDiff;
    const timeDiff = Date.parse(a.clientCreatedAt) - Date.parse(b.clientCreatedAt);
    if (timeDiff !== 0) return timeDiff;
    return a.operationId.localeCompare(b.operationId);
  });
}

export function computePayloadChecksum(payload: unknown): string {
  const normalized = stableNormalize(payload);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function verifyPayloadChecksum(payload: unknown, expectedChecksum: string): boolean {
  if (!expectedChecksum) return false;
  return computePayloadChecksum(payload) === expectedChecksum;
}

export function getBaseUpdatedAt(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)._baseUpdatedAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

export function stripSyncControlFields<T extends Record<string, unknown>>(payload: T): T {
  const { _baseUpdatedAt, ...businessPayload } = payload;
  return businessPayload as T;
}

export function validateSyncEpoch(clientEpoch: number | undefined, currentRollbackEpoch: number): void {
  if (clientEpoch !== undefined && clientEpoch < currentRollbackEpoch) {
    throw new Error(
      `STALE_ROLLBACK_EPOCH_CONFLICT: client sync epoch ${clientEpoch} is obsolete (current rollback epoch: ${currentRollbackEpoch}). Client must reconcile local state before submitting mutations.`
    );
  }
}

export function checkRollbackBarrier(isBarrierActive: boolean): void {
  if (isBarrierActive) {
    throw new Error(
      `MUTATIONS_FROZEN_ROLLBACK_IN_PROGRESS: A governed rollback barrier is active. Mutations are temporarily frozen.`
    );
  }
}

