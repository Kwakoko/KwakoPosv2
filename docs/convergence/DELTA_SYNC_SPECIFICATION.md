# KwakoPos v2 — Delta Sync Specification

## 1. Incremental Cursor Mechanics

Delta synchronization operates on monotonic, server-authoritative timestamps to retrieve only changes committed since the client's last confirmed synchronization point.

### 1.1 The Delta Contract
The client supplies its last confirmed cursor:
```http
GET /sync/delta?since=2026-09-10T12:00:00.000Z
```

The server:
1. Validates the `since` timestamp.
2. Captures an anchor timestamp `serverTimestamp = now()`.
3. Filters all tenant-scoped entities where `updatedAt >= since AND updatedAt <= serverTimestamp`.
4. Returns the changes sorted by `updatedAt ASC, id ASC`.

### 1.2 Cursor Advancement Invariant
The client MUST NOT advance `lastSyncTime` until:
1. All payload entities have been durably written to IndexedDB.
2. The transaction has successfully committed (`tx.oncomplete`).
3. Local parent-variant aggregates have updated.

If any failure occurs during payload application, `lastSyncTime` remains at its previous value, ensuring the changes are re-requested on the subsequent cycle without data omission.
