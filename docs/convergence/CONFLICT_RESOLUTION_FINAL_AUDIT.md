# KwakoPos v2 — Conflict Resolution Final Audit

**Audit status: PASS**

**Certified branch:** `conflict-remediation`  
**Certified implementation commit:** `66dc4af32c5eccd322eb220d9cc5634d9c2bd1d0`  
**Certification workflow:** `Conflict Resolution — PostgreSQL Certification`  
**Certification result:** PASS  
**Verified:** 2026-10-02

## Final remediation matrix

| Gate | Requirement | Status |
|---|---|---|
| P0-1 | Server conflict responses become durable client conflict state | PASS |
| P0-2 | Authoritative PostgreSQL conflict list is available to the UI | PASS |
| P0-3 | Conflicting outbox mutation is retired after authoritative resolution | PASS |
| P0-4 | No legacy `outboxQueue` resolution path remains | PASS |
| P0-5 | Resolution failures are surfaced; no swallowed resolver errors | PASS |
| P0-6 | Category, Brand, SaleOversell and UnitConversion conflict classes have defined resolution behavior | PASS |
| P0-7 | Specialized conflict registration is durable and initialized before use | PASS |
| P0-8 | Conflict detection/resolution is recorded in persistent PostgreSQL audit events | PASS |
| P0-9 | Unsafe bulk conflict-resolution bypass was removed | PASS |
| P1-1 | Merge semantics are explicit and documentation matches implementation | PASS |
| P1-2 | Conflict lookup and resolution enforce tenant/branch scope | PASS |
| P1-3 | PostgreSQL conflict lifecycle and deterministic client conflict detection are certified automatically | PASS |

## Runtime certification evidence

The dedicated certification executed against an ephemeral PostgreSQL 16 instance created from the repository Prisma schema.

| Runtime assertion | Result |
|---|---|
| Stale Product → Accept Local | PASS |
| Category → Accept Local | PASS |
| Brand → MERGE | PASS |
| SaleOversell → Acknowledge Server | PASS |
| UnitConversionConflict → Acknowledge Server | PASS |
| Tenant/branch isolation | PASS |
| Persistent conflict audit trail | PASS |
| Conflict-resolution journal | PASS |
| Conflict registration deduplication | PASS |
| Sync package build | PASS |
| Web client build | PASS |
| Deterministic client conflict test | PASS |
| Test count | **8 passed / 8** |
| Conflict detections | **5** |
| Conflict resolutions | **5** |
| Resolution journal entries | **3** |

## Architecture after remediation

```text
Local mutation
    ↓
IndexedDB syncOutbox
    ↓
/sync/push
    ↓
PostgreSQL transaction
    ├── domain mutation
    ├── syncOperation
    └── sync_change_journal
            ↓
      conflict detection
            ↓
      sync_conflict_record
            ↓
      authoritative conflict feed
            ↓
      operator resolution
            ↓
      PostgreSQL transaction
        ├── chosen/merged state
        ├── conflict-resolution syncOperation
        ├── new journal revision
        └── persistent audit event
            ↓
      /sync/delta
            ↓
      IndexedDB replica convergence
```

## Operational rules now enforced

1. Blind LWW is not used for exclusive overwrite conflicts.
2. Inventory conflict state remains governed by StockLedger; ProductVariant inventory cannot be rewritten through catalog conflict resolution.
3. SaleOversell and UnitConversion conflicts are treated as business incidents with explicit server-state acknowledgement rather than silently rewriting historical business events.
4. Client-generated conflict IDs are deterministic and compatible with server resolution IDs.
5. Conflict metadata remains durable locally when the network is unavailable.
6. PostgreSQL is the authoritative conflict state; local metadata is a durable replica/queue, not the authority.
7. Tenant and branch boundaries are enforced during conflict lookup and resolution.
8. Duplicate conflict registration does not create duplicate detection audit events.

## Certification scope

This PASS applies to the **conflict-resolution remediation gates** listed above. It does not assert that unrelated repository governance workflows, migration-order workflows, or live multi-device deployment certification are green.



## 5. Additional hardening verified on 2026-10-05

- Explicit function-level authorization for conflict read and resolve.
- Immutable conflict identity and duplicate-ID reuse rejection.
- Entity-state revalidation under row lock before privileged resolution.
- Revisioned resolution acknowledgement for every resolution path.
- Deterministic parent/child variant row locking for unit conversion.
- Conflict audit metadata reduced to fingerprints and changed-field names.
- Workspace typecheck/build and dedicated authorization/concurrency regression gates added to the production lock.


## 5. Additional hardening verified on 2026-10-05

- Explicit function-level authorization for conflict read and resolve.
- Immutable conflict identity and duplicate-ID reuse rejection.
- Entity-state revalidation under row lock before privileged resolution, using serialization-safe canonical comparison.
- Revisioned resolution acknowledgement for every resolution path.
- Deterministic parent/child variant row locking for unit conversion.
- Conflict audit metadata reduced to fingerprints and changed-field names.
- Minimal authoritative conflict counts exposed through `/sync/status` so low-privilege users do not need full conflict-detail access.
- Dedicated authorization, concurrency, lifecycle, typecheck, and build gates added to the production lock.
