# KwakoPos v2 — Durable Outbox Specification

## 1. Outbox Lifecycle

The Outbox is the durable buffer ensuring reliable delivery across intermittent connections, crashes, and browser restarts.

```text
[Local Business Action]
          |
          v
[Atomic Write to syncOutbox Store (status: PENDING)]
          |
          +------> (Survives Refresh, Crash, PWA Update)
          |
[Network Online / Dispatch Trigger]
          |
          v
[Topological Dependency Sort]
  (Products -> Variants -> StockAdjustments -> Customers -> Sales)
          |
          v
[HTTP POST /sync/push]
          |
     +----+------------------------+
     |                             |
     v                             v
[Server Status: SUCCESS]     [Server Status: FAILED]
     |                             |
     v                             v
[markOutboxSynced(id)]       [markOutboxFailed(id, error)]
(Retained for audit/idemp)   (Flagged for Operator Retry / Reconcile)
```

## 2. Dependency Ordering (Topological Sorting)

To prevent foreign key or reference failures when replaying outbox batches, items are ordered by `syncDependencyRank`:

1. **Rank 10:** `Product CREATE`
2. **Rank 20:** `Product UPDATE`
3. **Rank 30:** `ProductVariant CREATE`
4. **Rank 40:** `ProductVariant UPDATE`
5. **Rank 50:** `ProductVariant DELETE`
6. **Rank 60:** `StockAdjustment CREATE`
7. **Rank 70:** `Customer CREATE`, `Supplier CREATE`
8. **Rank 80:** `PurchaseOrder CREATE`
9. **Rank 90:** `PurchaseReceipt CREATE`, `Sale CREATE`
10. **Rank 100:** `Payment CREATE`, `CashSession CREATE`
11. **Rank 110:** Industry Module Entities (`KitchenTicket`, `Table`, `Vehicle`)
12. **Rank 120:** General Extensions

Secondary sort is by `clientCreatedAt` ascending, and tertiary sort is by `operationId`.

## 3. Durability Guarantees

1. **Never Silently Deleted:** An outbox item is never removed from storage upon a failed push. It transitions to `status: "FAILED"` with the server rejection reason recorded in `syncMetadata`.
2. **Automatic Retry with Jitter:** Exponential backoff with random jitter prevents thundering herd upon network reconnection.
3. **Idempotent Retries:** Network timeouts that occur while a server transaction commits are safe to retry because the server returns `ALREADY_PROCESSED` without double-mutating state.
