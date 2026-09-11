# KwakoPos v2 — Authoritative Convergence Architecture

## 1. System Overview

KwakoPos v2 utilizes a **Single-Authority, Multi-Replica Distributed Architecture**. The authoritative source of truth is PostgreSQL on Google Cloud Run, while local browser nodes run an offline-capable operational replica powered by IndexedDB and Service Workers.

```text
+-------------------------------------------------------------------------+
|                              LOCAL CLIENT                               |
|                                                                         |
|  [User / UI Action]                                                     |
|          |                                                              |
|          v                                                              |
|  [Atomic Local Write] <---------------------------------------------+   |
|          |                                                          |   |
|     +----+-------------------+                                      |   |
|     |                        |                                      |   |
|     v                        v                                      |   |
|  [Local IndexedDB Replica] [Durable Outbox Queue]                   |   |
|                              |                                      |   |
|                              | (Online / Event Trigger)             |   |
|                              v                                      |   |
|                   [Sync Dispatcher Engine]                          |   |
|                              |                                      |   |
+------------------------------|--------------------------------------+---+
                               |  HTTPS / Bearer Auth Token
                               |  Payload: SyncPushRequest { ops, deviceId }
                               v
+-------------------------------------------------------------------------+
|                           SERVER API GATEWAY                            |
|                                                                         |
|  [Authentication & Tenant Derivation Hook]                              |
|          |                                                              |
|          v                                                              |
|  [Rollback Barrier & Epoch Gate]                                        |
|          |                                                              |
|          v                                                              |
|  [Dependency Sorter & Topological Ranker]                               |
|          |                                                              |
|          v                                                              |
|  [Idempotency & Fingerprint Verification]                               |
|          |                                                              |
|          v                                                              |
|  [Authoritative Database Transaction] (PostgreSQL / Prisma)             |
|     - Immutable Stock Ledger Movements                                  |
|     - Parent Product / Variant Aggregation                              |
|     - General Ledger Balancing                                          |
|     - Deduplication & Audit Log                                         |
|          |                                                              |
|          v                                                              |
|  [Deterministic Acknowledgement Engine]                                 |
|          |                                                              |
+----------|--------------------------------------------------------------+
           |
           | HTTP 200 { results: [ { opId, status: "SUCCESS" } ] }
           v
+-------------------------------------------------------------------------+
|                              LOCAL CLIENT                               |
|                                                                         |
|  [Acknowledge Processing & Outbox Mark Synced]                          |
|          |                                                              |
|          v                                                              |
|  [Pull Delta / Incremental Reconciliation]                              |
|          |                                                              |
|          v                                                              |
|  [Converged Client State Verified]                                      |
+-------------------------------------------------------------------------+
```

## 2. Persistence Taxonomy

| Store / Table | Authority Level | Primary Storage | Client Cache | Conflict Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Product** | Authoritative Server | PostgreSQL `Product` | IndexedDB `products` | Stale-Check (`_baseUpdatedAt`) |
| **ProductVariant** | Authoritative Server | PostgreSQL `ProductVariant` | IndexedDB `productVariants` | Parent-Preserving Stale Check |
| **StockLedger** | Append-Only Server | PostgreSQL `StockLedger` | IndexedDB `stockLedger` | Immutable Monotonic Sequence |
| **StockAdjustment**| Append-Only Server | PostgreSQL `StockAdjustment`| IndexedDB `stockAdjustments` | Idempotent Append |
| **Sale / Order** | Append-Only Server | PostgreSQL `Sale` / `OrderItem` | IndexedDB `sales` | Idempotent Business Commit |
| **Customer** | Authoritative Server | PostgreSQL `Customer` | IndexedDB `customers` | Field Merge / Stale Check |
| **Supplier** | Authoritative Server | PostgreSQL `Supplier` | IndexedDB `suppliers` | Field Merge / Stale Check |
| **PurchaseReceipt**| Append-Only Server | PostgreSQL `PurchaseReceipt`| IndexedDB `receipts` | Idempotent Financial Append |
| **SyncOutbox** | Client-Ephemeral | IndexedDB `syncOutbox` | Memory / Disk | Server ACK Deletion Barrier |
| **SyncMetadata** | Client-Local | IndexedDB `syncMetadata`| Memory / Disk | Monotonic Cursor Update |

## 3. Guarantees & Verification

1. **No Competing Truths:** IndexedDB mutations are marked `PENDING` until server acknowledgement. Uncommitted local mutations are distinct from confirmed server records.
2. **Deterministic Parent-Variant Stock Rollup:** Product parent stock is strictly the calculated sum of its active variants:
   $$\text{Stock}_{\text{Product}} = \sum_{v \in \text{Variants}_{\text{active}}} \text{Stock}(v)$$
3. **Ledger-Only Stock Derivation:** Any change in inventory quantity requires an immutable entry in `StockLedger`. Direct mutation of cached stock numbers without a ledger movement is blocked.
