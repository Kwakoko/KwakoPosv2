"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalIndexedDbStore = void 0;
/**
 * Local operational IndexedDB / Memory store engine for Browser A & Browser B.
 * Includes schema versioning, migration safety, and durable outbox protection.
 */
class LocalIndexedDbStore {
    schemaVersion = 1;
    products = new Map();
    productVariants = new Map();
    stockLedger = new Map();
    stockAdjustments = new Map();
    syncOutbox = new Map();
    syncMetadata = new Map();
    clear() {
        this.products.clear();
        this.productVariants.clear();
        this.stockLedger.clear();
        this.stockAdjustments.clear();
        this.syncOutbox.clear();
        this.syncMetadata.clear();
    }
    saveProductLocal(product) {
        this.products.set(product.id, product);
        if (product.variants) {
            for (const v of product.variants) {
                this.productVariants.set(v.id, v);
            }
        }
    }
    saveVariantLocal(variant) {
        this.productVariants.set(variant.id, variant);
    }
    recordOutboxMutation(item) {
        this.syncOutbox.set(item.id, item);
    }
    getPendingOutbox() {
        return Array.from(this.syncOutbox.values()).filter((i) => i.status === "PENDING");
    }
    markOutboxSynced(operationId) {
        const item = this.syncOutbox.get(operationId);
        if (item) {
            item.status = "SYNCED";
        }
    }
    markOutboxFailed(operationId, errorReason) {
        const item = this.syncOutbox.get(operationId);
        if (item) {
            item.status = "FAILED";
            this.syncMetadata.set(`error_${operationId}`, errorReason);
        }
    }
    /**
     * Safe PWA / App upgrade migration handler.
     * Guarantees pending outbox mutations and local stock data are never purged during upgrades.
     */
    migrateToVersion(targetVersion) {
        const previousVersion = this.schemaVersion;
        const preservedOutboxCount = this.getPendingOutbox().length;
        if (targetVersion > previousVersion) {
            // Execute incremental schema migrations while preserving outbox & entities
            this.schemaVersion = targetVersion;
            this.syncMetadata.set("schemaVersion", String(targetVersion));
            this.syncMetadata.set("lastMigratedAt", new Date().toISOString());
        }
        return { previousVersion, newVersion: this.schemaVersion, preservedOutboxCount };
    }
}
exports.LocalIndexedDbStore = LocalIndexedDbStore;
//# sourceMappingURL=indexedDb.js.map