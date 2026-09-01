import type { Product, ProductVariant, StockLedger, StockAdjustment, SyncOperationType } from "@kwakopos2/contracts";
export interface OutboxItem {
    id: string;
    entityType: "Product" | "ProductVariant" | "StockAdjustment" | "StockLedger";
    entityId: string;
    operationType: SyncOperationType;
    payload: Record<string, unknown>;
    clientCreatedAt: string;
    idempotencyKey: string;
    status: "PENDING" | "SYNCED" | "FAILED";
}
/**
 * Local operational IndexedDB / Memory store engine for Browser A & Browser B.
 * Includes schema versioning, migration safety, and durable outbox protection.
 */
export declare class LocalIndexedDbStore {
    schemaVersion: number;
    products: Map<string, Product>;
    productVariants: Map<string, ProductVariant>;
    stockLedger: Map<string, StockLedger>;
    stockAdjustments: Map<string, StockAdjustment>;
    syncOutbox: Map<string, OutboxItem>;
    syncMetadata: Map<string, string>;
    clear(): void;
    saveProductLocal(product: Product): void;
    saveVariantLocal(variant: ProductVariant): void;
    recordOutboxMutation(item: OutboxItem): void;
    getPendingOutbox(): OutboxItem[];
    markOutboxSynced(operationId: string): void;
    markOutboxFailed(operationId: string, errorReason: string): void;
    /**
     * Safe PWA / App upgrade migration handler.
     * Guarantees pending outbox mutations and local stock data are never purged during upgrades.
     */
    migrateToVersion(targetVersion: number): {
        previousVersion: number;
        newVersion: number;
        preservedOutboxCount: number;
    };
}
//# sourceMappingURL=indexedDb.d.ts.map