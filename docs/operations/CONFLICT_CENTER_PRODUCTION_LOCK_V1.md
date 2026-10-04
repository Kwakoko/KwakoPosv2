# Conflict Center Production Lock v1

## Contract

The Conflict Center is production-locked against false-zero convergence claims.

A replica may be presented as verified only when all of the following are true:

- the latest sync completed successfully;
- authoritative reconciliation is `IN_SYNC`;
- there are zero pending outbox mutations;
- there are zero failed outbox mutations;
- there are zero abandoned outbox mutations; and
- the authoritative server reports zero OPEN sync conflicts.

Authority failures and malformed authority responses fail closed to UNKNOWN and cannot become a verified zero.

The lock is enforced by:

- a static production-lock certification;
- dedicated Conflict Center unit contract tests;
- the PostgreSQL conflict lifecycle certification; and
- a dedicated required CI workflow on pull requests and pushes to `main`.

## Protected regression classes

The lock explicitly protects against:

- false "zero divergence" after an unverified or incomplete sync;
- authoritative server conflicts being hidden by an empty local conflict list;
- malformed or unavailable conflict-authority responses being treated as zero;
- pending, failed, or abandoned mutations being presented as synchronized;
- divergence being presented as verification; and
- duplicate local conflict aliases inflating the conflict count.

## Operational rule

CI check name: `Conflict Center Production Lock v1`.

Do not weaken, bypass, rename, or remove this contract without a deliberate production-governance change that updates the lock, its tests, and its required CI check together.
