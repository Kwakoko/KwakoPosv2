import {
  Product,
  ProductVariant,
  StockLedger,
  StockAdjustment,
  SyncOperationType,
} from "@kwakopos2/contracts";

export interface OutboxItem {
  id: string; // operationId
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
 */
export class LocalIndexedDbStore {
  products: Map<string, Product> = new Map();
  productVariants: Map<string, ProductVariant> = new Map();
  stockLedger: Map<string, StockLedger> = new Map();
  stockAdjustments: Map<string, StockAdjustment> = new Map();
  syncOutbox: Map<string, OutboxItem> = new Map();
  syncMetadata: Map<string, string> = new Map();

  clear() {
    this.products.clear();
    this.productVariants.clear();
    this.stockLedger.clear();
    this.stockAdjustments.clear();
    this.syncOutbox.clear();
    this.syncMetadata.clear();
  }

  saveProductLocal(product: Product) {
    this.products.set(product.id, product);
    if (product.variants) {
      for (const v of product.variants) {
        this.productVariants.set(v.id, v);
      }
    }
  }

  saveVariantLocal(variant: ProductVariant) {
    this.productVariants.set(variant.id, variant);
  }

  recordOutboxMutation(item: OutboxItem) {
    this.syncOutbox.set(item.id, item);
  }

  getPendingOutbox(): OutboxItem[] {
    return Array.from(this.syncOutbox.values()).filter((i) => i.status === "PENDING");
  }

  markOutboxSynced(operationId: string) {
    const item = this.syncOutbox.get(operationId);
    if (item) {
      item.status = "SYNCED";
    }
  }
}
