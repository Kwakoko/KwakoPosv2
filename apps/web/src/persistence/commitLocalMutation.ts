import type { LocalIndexedDbStore, NativeStore, OutboxItem, TenantScopedContext } from "../indexedDb.js";

export interface AtomicWrite {
  store: NativeStore;
  key: string;
  value?: unknown;
  delete?: boolean;
}

export interface AtomicMutationInput {
  db: LocalIndexedDbStore;
  tenantContext: TenantScopedContext;
  entityType: OutboxItem["entityType"];
  entityId: string;
  operationType: OutboxItem["operationType"];
  payload: Record<string, unknown>;
  writes: AtomicWrite[];
  idempotencyKey: string;
  outboxItems?: OutboxItem[];
}

export async function commitLocalMutation(input: AtomicMutationInput): Promise<OutboxItem[]> {
  const base: OutboxItem = {
    id: input.idempotencyKey,
    entityType: input.entityType,
    entityId: input.entityId,
    operationType: input.operationType,
    payload: input.payload,
    clientCreatedAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
    status: "PENDING",
    tenantId: input.tenantContext.tenantId,
    branchId: input.tenantContext.branchId,
  };
  const outboxItems = input.outboxItems?.length ? input.outboxItems : [base];
  await input.db.executeAtomicMutation({
    writes: input.writes,
    outboxItems,
    tenantContext: input.tenantContext,
  });
  return outboxItems;
}

export async function commitLocalOutboxes(
  db: LocalIndexedDbStore,
  items: Array<{ entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>>,
  tenantContext?: TenantScopedContext,
  writes: AtomicWrite[] = [],
): Promise<OutboxItem[]> {
  if (!items.length) return [];
  const tenantId = tenantContext?.tenantId || items.find((item) => item.tenantId)?.tenantId;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED_FOR_LOCAL_MUTATION");
  const branchId = tenantContext?.branchId || items.find((item) => item.branchId)?.branchId;
  for (const item of items) {
    if (item.tenantId && item.tenantId !== tenantId) throw new Error("ATOMIC_MUTATION_TENANT_MISMATCH");
    if (branchId && item.branchId && item.branchId !== branchId) throw new Error("ATOMIC_MUTATION_BRANCH_MISMATCH");
  }
  const outboxItems = items.map((item) => db.createOutboxItem({
    ...item,
    tenantId: item.tenantId || tenantId,
    branchId: item.branchId || branchId,
  }));
  const dbAny = db as any;
  const previousAtomicFlag = dbAny.__kwakoAtomicMutationInFlight;
  dbAny.__kwakoAtomicMutationInFlight = true;
  try {
    await db.executeAtomicMutation({
      writes,
      outboxItems,
      tenantContext: { tenantId, branchId },
    });
  } catch (error) {
    await db.refreshStoresFromNative().catch(() => undefined);
    throw error;
  } finally {
    dbAny.__kwakoAtomicMutationInFlight = previousAtomicFlag;
  }
  return outboxItems;
}

export async function commitLocalOutbox(
  db: LocalIndexedDbStore,
  item: { entity?: string; action?: string; data?: Record<string, unknown> } & Partial<OutboxItem>,
): Promise<OutboxItem> {
  const committed = await commitLocalOutboxes(db, [item]);
  return committed[0];
}
