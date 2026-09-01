"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientSyncEngine = void 0;
const rumCollector_1 = require("./rum/rumCollector");
class ClientSyncEngine {
    deviceId;
    localDb;
    constructor(deviceId, localDb) {
        this.deviceId = deviceId;
        this.localDb = localDb;
    }
    /**
     * Pushes all pending outbox operations from local IndexedDB to the Server API,
     * then fetches authoritative delta sync from Server and updates local IndexedDB.
     */
    async syncWithServer(pushApiFn, deltaApiFn) {
        const startTime = Date.now();
        const pendingOps = this.localDb.getPendingOutbox();
        let pushedCount = 0;
        try {
            if (pendingOps.length > 0) {
                const pushPayload = {
                    deviceId: this.deviceId,
                    operations: pendingOps.map((op) => ({
                        operationId: op.id,
                        entityType: op.entityType,
                        entityId: op.entityId,
                        operationType: op.operationType,
                        payload: op.payload,
                        clientCreatedAt: op.clientCreatedAt,
                        idempotencyKey: op.idempotencyKey,
                    })),
                };
                const pushRes = await pushApiFn(pushPayload);
                pushedCount = pushRes.processedCount;
                for (const res of pushRes.results) {
                    if (res.status === "SUCCESS" || res.status === "ALREADY_PROCESSED") {
                        this.localDb.markOutboxSynced(res.operationId);
                    }
                }
            }
            // Pull Delta from Server
            const lastSyncTime = this.localDb.syncMetadata.get("lastSyncTime");
            const deltaRes = await deltaApiFn(lastSyncTime);
            // Apply Server Delta to Local IndexedDB
            for (const p of deltaRes.products) {
                this.localDb.saveProductLocal(p);
            }
            for (const v of deltaRes.variants) {
                this.localDb.saveVariantLocal(v);
            }
            for (const l of deltaRes.stockLedger) {
                this.localDb.stockLedger.set(l.id, l);
            }
            for (const a of deltaRes.adjustments) {
                this.localDb.stockAdjustments.set(a.id, a);
            }
            this.localDb.syncMetadata.set("lastSyncTime", deltaRes.serverTimestamp);
            const totalPulled = deltaRes.products.length +
                deltaRes.variants.length +
                deltaRes.stockLedger.length +
                deltaRes.adjustments.length;
            rumCollector_1.globalRumCollector.recordSyncMetrics({
                durationMs: Date.now() - startTime,
                pushedCount,
                deltaCount: totalPulled,
                success: true,
                outboxDepth: this.localDb.getPendingOutbox().length,
            });
            return { pushed: pushedCount, pulled: totalPulled };
        }
        catch (err) {
            rumCollector_1.globalRumCollector.recordSyncMetrics({
                durationMs: Date.now() - startTime,
                pushedCount,
                deltaCount: 0,
                success: false,
                outboxDepth: this.localDb.getPendingOutbox().length,
            });
            rumCollector_1.globalRumCollector.recordError(err);
            throw err;
        }
    }
}
exports.ClientSyncEngine = ClientSyncEngine;
__exportStar(require("./rum/rumCollector"), exports);
export { ClientSyncEngine };
//# sourceMappingURL=clientSyncEngine.js.map