import { apiFetch, getStoredSession, safeUUID } from "./apiClient.js";
import { LocalIndexedDbStore } from "../indexedDb.js";

export interface MutationContext { tenantId: string; branchId: string; }

function sessionContext(): MutationContext {
  const session = getStoredSession();
  if (!session?.user.tenantId || !session.user.branchId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return { tenantId: session.user.tenantId, branchId: session.user.branchId };
}

async function localDb(): Promise<LocalIndexedDbStore> {
  const db = new LocalIndexedDbStore();
  await db.ready;
  return db;
}

async function enqueuePluginMutation(
  pluginId: string,
  action: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const db = await localDb();
  const ctx = sessionContext();
  const id = safeUUID();
  db.enqueueOutbox({
    id,
    entityType: `Plugin:${pluginId}`,
    entityId: id,
    operationType: "CREATE",
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    payload: { id, pluginId, action, ...payload, tenantId: ctx.tenantId, branchId: ctx.branchId },
  });
  return id;
}

export async function recordLawFirmPayment(invoiceId: string, amount: number): Promise<{ id: string; source: "SERVER" | "OUTBOX" }> {
  try {
    const result = await apiFetch<{ success: boolean; data?: { id?: string } }>("/api/v1/billing/payments/process", {
      method: "POST",
      body: JSON.stringify({ invoiceId, amount, paymentMethod: "CASH", reference: `LAW-${invoiceId}-${Date.now()}`, idempotencyKey: safeUUID() }),
    });
    return { id: result.data?.id || invoiceId, source: "SERVER" };
  } catch {
    return { id: await enqueuePluginMutation("law-firm", "RECORD_PAYMENT", { invoiceId, amount }), source: "OUTBOX" };
  }
}

export async function saveLawFirmSettings(settings: Record<string, unknown>): Promise<string> {
  return enqueuePluginMutation("law-firm", "SAVE_SETTINGS", { settings });
}

export async function dispensePharmacyMedicine(request: { medicineId: string; quantityRequired: number; patientId?: string; prescriptionId?: string }): Promise<{ fulfilled: boolean; source: "SERVER" | "OUTBOX"; id: string }> {
  try {
    const result = await apiFetch<{ success: boolean; data?: { fulfilled?: boolean; dispensingRecords?: Array<{ id?: string }> } }>("/api/v1/pharmacy/dispense", {
      method: "POST",
      body: JSON.stringify(request),
    });
    return { fulfilled: Boolean(result.data?.fulfilled), source: "SERVER", id: result.data?.dispensingRecords?.[0]?.id || safeUUID() };
  } catch {
    return { fulfilled: true, source: "OUTBOX", id: await enqueuePluginMutation("pharmacy", "DISPENSE_MEDICINE", request) };
  }
}

export async function persistPharmacyBatchAction(action: "DISPOSE_BATCH" | "RECORD_CONTROLLED_ISSUE", payload: Record<string, unknown>): Promise<string> {
  return enqueuePluginMutation("pharmacy", action, payload);
}

export async function persistFleetFueling(payload: Record<string, unknown>): Promise<string> {
  return enqueuePluginMutation("vehicle-fleet", "RECORD_FUELING", payload);
}
