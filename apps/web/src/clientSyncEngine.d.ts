import { LocalIndexedDbStore } from "./indexedDb";
import type { SyncPushRequest, SyncPushResponse, SyncDeltaResponse } from "@kwakopos2/contracts";
export declare class ClientSyncEngine {
    deviceId: string;
    localDb: LocalIndexedDbStore;
    constructor(deviceId: string, localDb: LocalIndexedDbStore);
    /**
     * Pushes all pending outbox operations from local IndexedDB to the Server API,
     * then fetches authoritative delta sync from Server and updates local IndexedDB.
     */
    syncWithServer(pushApiFn: (req: SyncPushRequest) => Promise<SyncPushResponse>, deltaApiFn: (since?: string) => Promise<SyncDeltaResponse>): Promise<{
        pushed: number;
        pulled: number;
    }>;
}
export * from "./rum/rumCollector";
//# sourceMappingURL=clientSyncEngine.d.ts.map