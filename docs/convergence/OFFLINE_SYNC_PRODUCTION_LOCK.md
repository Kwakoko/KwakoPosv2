# KwakoPos v2 — Offline Sync Platform Production Lock

**Lock ID:** `OFFLINE-SYNC-PLATFORM-PRODUCTION-LOCK-2026-10-08`

## Purpose

Offline synchronization is treated as a platform primitive, not a feature module. Release certification must prove the full mutation and replication chain:

```text
UI mutation
    ↓
Domain action
    ↓
Local transaction
    ↓
IndexedDB
    ↓
Outbox
    ↓
Sync engine
    ↓
API
    ↓
PostgreSQL transaction
    ↓
Sync journal
    ↓
Delta/bootstrap
    ↓
Other client
    ↓
IndexedDB
    ↓
UI projection
```

A release is blocked when any lock below is missing, drifts from its authoritative implementation, or lacks executable evidence.

## Production controls

| Control | Locked invariant | Primary authority |
|---|---|---|
| IndexedDB schema | Database `kwakopos-v2`; authoritative schema version 7; durable stores exist and critical stores are tenant-indexed. | `apps/web/src/indexedDb.ts` |
| Migrations | Forward migrations are deterministic through V7; V5/V6/V7 transitions are explicit; downgrade never destroys durable business data. | `apps/web/src/persistence/migrationEngine.ts` |
| Local transaction | Business state and sync outbox are committed in the same native IndexedDB read/write transaction. | `apps/web/src/indexedDb.ts`, `apps/web/src/atomicOutbox.ts` |
| Outbox | Mutations are durable, scoped by tenant/branch, ordered before replay, and never silently discarded on failure. | `apps/web/src/indexedDb.ts`, `docs/convergence/OUTBOX_SPECIFICATION.md` |
| Retry | Failed operations retain retry count and a durable next-attempt timestamp; manual retry explicitly clears the deadline. | `apps/web/src/indexedDb.ts` |
| Backoff | Automatic retry uses bounded exponential delay with jitter; production sync does not depend on a single in-memory retry loop. | `apps/web/src/indexedDb.ts`, `apps/web/src/atomicOutbox.ts` |
| Idempotency | Server identity is bound to operation/idempotency keys and payload fingerprint; changed replay content is rejected. | `packages/sync/src/worldStandardPrismaSyncEngine.ts`, PostgreSQL unique constraints |
| Sync journal | Domain mutation, `sync_operations`, and journal insertion are committed atomically in PostgreSQL. | `packages/sync/src/worldStandardPrismaSyncEngine.ts` |
| Tombstones | DELETE propagation persists a tombstone so later stale deltas cannot resurrect removed records. | `apps/web/src/clientSyncEngine.ts`, `apps/web/src/indexedDb.ts` |
| Sequence/cursor | PostgreSQL sequence-backed revisions are the authoritative monotonic cursor; client cursors are tenant/branch scoped. | `sync_change_revision_seq`, `lastSyncRevision` |
| Bootstrap | Bootstrap reads revision + authoritative records from one repeatable-read snapshot and preserves pending local mutations. | `processBootstrap`, `bootstrapFromAuthoritativeSnapshot` |
| Delta sync | Revision deltas are ordered, scoped, cursor based, and signal `requiresBootstrap` after journal compaction gaps. | `processDelta`, `applyRevisionedChanges` |
| Conflict resolution | Stale writes create durable conflict records; resolution is concurrency checked, audited, and journaled. | `sync_conflict_record`, `resolveConflict` |
| Multi-device convergence | Real browser certification exercises five independent devices and verifies durable revision/epoch convergence. | `tests/browser/five-client-convergence.spec.ts` |
| Offline mutation | UI mutations reach an atomic local persistence boundary before network delivery. | `apps/web/src/atomicOutbox.ts`, `executeAtomicMutation` |
| Online replay | ACKs change the outbox state only after a verified server response; duplicate replay returns `ALREADY_PROCESSED`. | `apps/web/src/clientSyncEngine.ts`, `processPush` |
| Zero-data-loss | Browser reload, crash/restart, PWA upgrade, retry, and recovery certification require outbox preservation and authoritative convergence. | `scripts/certification/runPwaZeroDataLossCertification.ts`, `scripts/certification/world-standard-offline-e2e.ts` |
| UI projection | Successful delta/bootstrap/reconciliation refreshes IndexedDB-backed state before publishing the convergence event to UI consumers. | `apps/web/src/clientSyncEngine.ts`, `apps/web/src/context/KwakoPosContexts.tsx` |

## Release gates

The lock is executable through:

- `npm run certify:offline-sync-lock` — static production lock, blob drift, marker and wiring gate.
- `npm run certify:offline-sync` — 100-point offline sync architecture certification.
- `npm run certify:offline-e2e` — Chromium + PostgreSQL offline reload, duplicate replay, revision replay, service-worker upgrade, and second-device convergence evidence.
- `npm run certify:pwa-durability` — IndexedDB upgrade, recovery snapshot, and zero-data-loss durability gate.
- `npm run test:sync` — sync/convergence regression suite.

The production lock is wired into CI, candidate certification, and exact-main production certification.

## Zero-data-loss invariant

For every locally committed production mutation:

```text
LOCAL_COMMITTED
      ↓
SYNC_PENDING
      ↓
SERVER_CONFIRMED | CONFLICT | FAILED
```

A browser crash, reload, worker restart, network interruption, server timeout, or duplicate replay may change delivery timing, but may not make a committed mutation disappear.

The authoritative safety rule is:

> No local business mutation is considered durably completed until the business write and its outbox record are committed in IndexedDB.

Server acceptance does not erase history. Duplicate delivery is safe because the server operation/idempotency identity is durable. Replica completeness is verified through revision cursors and reconciliation, with bootstrap as the recovery path when a delta cannot reconstruct the client state.

## Known operational boundary

Transport outages leave unsent work in `PENDING` state so data remains durable. Server rejections move work to `FAILED` with a persisted retry schedule and a bounded retry cap. Manual conflict resolution is a separate audited state transition.

This distinction is intentional: an unreachable server must never be confused with an accepted mutation or with a permanently rejected business command.
