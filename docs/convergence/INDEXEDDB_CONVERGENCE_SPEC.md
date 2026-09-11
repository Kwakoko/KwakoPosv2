# KwakoPos v2 — IndexedDB Convergence Specification

## 1. Storage Architecture

IndexedDB operates as an operational replica on browser clients. The database name is `kwakopos-v2` with authoritative schema version `4`.

### 1.1 Object Stores & Key Paths

| Store Name | Key Path | Primary Purpose | Indices |
| :--- | :--- | :--- | :--- |
| `products` | `id` | Product parent records | `tenantId`, `sku` |
| `productVariants` | `id` | Variant specifications and prices | `productId`, `tenantId`, `sku` |
| `stockLedger` | `id` | Immutable movements | `variantId`, `tenantId`, `occurredAt` |
| `stockAdjustments` | `id` | Local adjustments | `tenantId`, `operationId` |
| `stockBalance` | `id` | Cached balances (`variantId:branchId`) | `tenantId`, `variantId` |
| `sales` | `id` | Completed and pending sales | `tenantId`, `cashSessionId`, `createdAt` |
| `payments` | `id` | Tender transactions | `tenantId`, `saleId` |
| `receipts` | `id` | Formatted receipt payloads | `tenantId`, `receiptNumber` |
| `customers` | `id` | Customer profiles & balances | `tenantId`, `phone` |
| `suppliers` | `id` | Supplier records & balances | `tenantId` |
| `syncOutbox` | `id` | Durable pending sync queue | `status`, `tenantId`, `clientCreatedAt` |
| `syncMetadata` | key string | Cursors, schema version, sync health | - |
| `configuration` | `key` | Settings, feature flags, tax rules | `tenantId` |
| `recoverySnapshots`| `id` | Pre-migration disaster recovery copies | `timestamp` |
| `migrationJournal` | `id` | Schema upgrade history & metrics | `fromVersion`, `toVersion` |

## 2. Transactional Atomicity (Multi-Store Writes)

To satisfy **Invariant C-005 (Durable Outbox)** and **Invariant C-006 (No Silent Data Loss)**, any business mutation that modifies local state and generates a synchronizable mutation must be executed inside a single IndexedDB transaction:

```typescript
const tx = nativeDb.transaction([targetStore, "syncOutbox"], "readwrite");
tx.objectStore(targetStore).put(entityData, entityId);
tx.objectStore("syncOutbox").put(outboxItem, outboxItem.id);
await transactionComplete(tx);
```

If the transaction aborts or fails, neither the business state nor the outbox item persists, leaving the local replica in an uncorrupted state.

## 3. Zero-Data-Loss Migration Protocol

Before advancing `schemaVersion`:
1. **Pre-Migration Snapshot:** `createVerifiedSnapshot()` captures all active store data and computes a SHA-256 integrity hash.
2. **Schema Upgrade:** Forward migration is performed inside IndexedDB `onupgradeneeded`.
3. **Verification:** Migration journal verifies that all pending outbox records survived without loss.
4. **Rollback Safety:** If validation fails, `restoreSnapshot()` restores the previous schema and data immediately.
