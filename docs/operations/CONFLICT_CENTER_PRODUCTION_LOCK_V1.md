# Conflict Center Production Lock v1

## Contract

The Conflict Center is production-locked against false-zero convergence claims and unsafe administrative resolution.

A replica may be presented as verified only when all of the following are true:

- latest sync completed successfully;
- authoritative reconciliation is `IN_SYNC`;
- pending outbox mutations = 0;
- retriable failed outbox mutations = 0;
- abandoned outbox mutations = 0; and
- authoritative OPEN server conflicts = 0.

Authority failures and malformed authority responses fail closed to `UNKNOWN` and cannot become a verified zero.

Conflict detail reads require explicit `sync.conflict.read` authorization. Conflict resolution requires explicit `sync.conflict.resolve` authorization. Conflict registration is a constrained authenticated reporting path with deterministic conflict identity; it is not an administrative resolution capability.

Privileged resolution revalidates the authoritative entity under row lock before applying the stored decision. A changed entity remains OPEN and fails closed. Every resolution produces a revisioned `conflict-resolution` acknowledgement so offline replicas retire the original conflicted outbox mutation through the same ordered authority.

Inventory unit conversion locks parent/child variants in deterministic order before stock validation and ledger append.

## Enforcement

The lock is enforced by static production-lock certification, regression tests, PostgreSQL lifecycle certification, concurrency coverage, authorization coverage, workspace typecheck/build, and CI.

CI check name: `Conflict Center Production Lock v1`.

Lock version: v1. Enforcement status: `MANDATORY`.

Release rule: this gate is a merge blocker for Conflict Center changes.

## Protected regression classes

False zero-divergence claims; hidden authoritative server conflicts; malformed authority responses becoming zero; pending/failed/abandoned mutations reported as synchronized; unauthorized conflict inspection or resolution; stale resolution overwriting newer server state; conflict ID reuse; simultaneous conversions oversubtracting inventory; resolved conflicts being re-detected by an offline replica; and PII duplication into audit payloads.

## Operational rule

Do not weaken, bypass, rename, or remove this contract without a deliberate production-governance change that updates the lock, its tests, and its required CI check together.
