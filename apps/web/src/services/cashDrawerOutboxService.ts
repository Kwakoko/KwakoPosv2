import type { DrawerOutboxItem, LocalIndexedDbStore, TenantScopedContext } from "../indexedDb.js";

export interface CashDrawerHardwareDriver {
  kick(timeoutMs: number): Promise<void>;
}

const DRAWER_TIMEOUT_MS = 500;
let registeredDriver: CashDrawerHardwareDriver | null = null;
let dispatchInFlight = false;

export function registerCashDrawerHardwareDriver(driver: CashDrawerHardwareDriver | null): void {
  registeredDriver = driver;
}

export function createDrawerOutboxItem(params: {
  saleId: string;
  paymentId: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  requestedAt?: string;
  payload?: Record<string, unknown>;
}): DrawerOutboxItem {
  const requestedAt = params.requestedAt || new Date().toISOString();
  const operationId = `drawer:${params.paymentId}`;
  return { id: operationId, operationId, saleId: params.saleId, paymentId: params.paymentId,
    tenantId: params.tenantId, branchId: params.branchId, deviceId: params.deviceId,
    status: "PENDING", attempts: 0, requestedAt, payload: params.payload || {} };
}

async function withTimeout(work: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([work, new Promise<void>((_, reject) => {
      timer = setTimeout(() => reject(new Error("CASH_DRAWER_TIMEOUT")), timeoutMs);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function persist(db: LocalIndexedDbStore, item: DrawerOutboxItem): void {
  db.drawerOutbox.set(item.id, item);
  db.persist("drawerOutbox", item.id, item);
}

export async function dispatchDrawerOutbox(db: LocalIndexedDbStore, ctx: TenantScopedContext): Promise<void> {
  const driver = registeredDriver;
  if (!driver || dispatchInFlight) return;
  dispatchInFlight = true;
  try {
    await db.ready;
    const pending = [...db.drawerOutbox.values()]
      .filter((item) => item.tenantId === ctx.tenantId && item.branchId === ctx.branchId)
      .filter((item) => item.status === "PENDING")
      .sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
    for (const item of pending) {
      const executing: DrawerOutboxItem = { ...item, status: "EXECUTING",
        attempts: item.attempts + 1, startedAt: new Date().toISOString() };
      persist(db, executing);
      await db.flushPersistence?.();
      try {
        await withTimeout(driver.kick(DRAWER_TIMEOUT_MS), DRAWER_TIMEOUT_MS);
        persist(db, { ...executing, status: "SUCCEEDED", completedAt: new Date().toISOString() });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        persist(db, { ...executing, status: message === "CASH_DRAWER_TIMEOUT" ? "TIMEOUT" : "FAILED",
          completedAt: new Date().toISOString(), lastError: message });
      }
      await db.flushPersistence?.();
    }
  } finally {
    dispatchInFlight = false;
  }
}

export function recoverInterruptedDrawerOutbox(db: LocalIndexedDbStore): void {
  for (const item of db.drawerOutbox.values()) {
    if (item.status !== "EXECUTING") continue;
    persist(db, { ...item, status: "UNKNOWN", completedAt: new Date().toISOString(),
      lastError: "PROCESS_INTERRUPTED_AFTER_HARDWARE_DISPATCH" });
  }
}

export function createEscPosSerialCashDrawerDriver(port: any, baudRate = 9600): CashDrawerHardwareDriver {
  return { kick: async (timeoutMs: number) => {
    const work = (async () => {
      if (!port.readable || !port.writable) await port.open({ baudRate });
      const writer = port.writable.getWriter();
      try { await writer.write(new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa])); }
      finally { writer.releaseLock(); }
    })();
    await withTimeout(work, timeoutMs);
  }};
}
