# KwakoPos v2 — Bootstrap Convergence Specification

## 1. Objective

The Bootstrap process securely initializes or repairs a client's local IndexedDB replica from an authoritative, point-in-time snapshot of server state without destroying pending local Outbox mutations.

## 2. The Complete Synchronization Lifecycle

```text
[User Login]
      |
      v
[Authenticate via /auth/login or /auth/refresh]
      |
      v
[Derive TenantContext { tenantId, branchId, roles, permissions }]
      |
      v
[Check Local Replication Status]
      |
  +---+------------------------------------+
  |                                        |
(Cold Start / Missing State)        (Warm Replica Exists)
  |                                        |
  v                                        v
[POST /sync/bootstrap]               [POST /sync/push (Pending Outbox)]
  |                                        |
  v                                        v
[Verify Snapshot SHA-256 Checksum]   [GET /sync/delta (Since Last Confirmed Cursor)]
  |                                        |
  v                                        v
[Merge Snapshot into IndexedDB]      [Apply Incremental Delta]
(Preserves Pending Outbox Items)           |
  |                                        v
  v                                  [Run Background Reconciliation]
[Replay Safe Pending Outbox]
  |
  v
[Transition to Incremental Delta Sync]
```

## 3. Non-Destructive Bootstrap Merge Invariant

Under no condition may a bootstrap snapshot trigger a blind `indexedDB.deleteDatabase()` or wholesale wipe when pending outbox operations exist.

### Algorithm:
1. Fetch authoritative snapshot from `/sync/bootstrap`.
2. Verify cryptographic SHA-256 integrity hash over the payload.
3. Iterate over snapshot entities (`products`, `variants`, `customers`, etc.):
   - If an entity has a corresponding `PENDING` outbox item for `UPDATE` or `DELETE`, protect the local uncommitted change and mark a conflict notice.
   - Otherwise, overwrite or insert the authoritative server record.
4. Update `lastSyncTime` in `syncMetadata` to `snapshotTimestamp`.
5. Recalculate all parent product stock totals from active variants.
