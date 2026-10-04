export interface DurableSessionState {
  id: "current";
  sessionId: string;
  tenantId: string;
  branchId: string;
  userId: string;
  deviceId: string;
  status: string;
  authenticatedAt: number;
  lastOnlineAt: number;
  lastActivityAt: number;
  offlineStartedAt?: number | null;
  offlineExpiresAt?: number | null;
  serverExpiresAt?: number | null;
  permissionsVersion?: number;
  tenantVersion?: number;
  lastValidatedAt?: number | null;
  lastSyncAt?: number | null;
  localLogoutPending?: boolean;
}

const DB_NAME = "kwakopos_session";
const STORE_NAME = "session";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("INDEXEDDB_UNAVAILABLE"));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("SESSION_DB_OPEN_FAILED"));
  });
}

export async function readDurableSessionState(): Promise<DurableSessionState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("current");
    request.onsuccess = () => { db.close(); resolve((request.result as DurableSessionState | undefined) || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error("SESSION_DB_READ_FAILED")); };
  });
}

export async function saveDurableSessionState(state: Omit<DurableSessionState, "id">): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put({ id: "current", ...state });
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error || new Error("SESSION_DB_WRITE_FAILED")); };
  });
}

export async function clearDurableSessionState(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete("current");
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error || new Error("SESSION_DB_DELETE_FAILED")); };
  });
}
