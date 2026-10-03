# Dashboard Authoritative Convergence Certification

## Scope
The Dashboard online reporting path is certified against a single PostgreSQL-authoritative snapshot.

## Remediation gates
- P0: Core KPI authority — PostgreSQL snapshot with tenant/branch scope and repeatable-read consistency.
- P0: Revenue/profit/COGS chart data — PostgreSQL Sale aggregates.
- P0: Payment-channel analytics — PostgreSQL Payment aggregates.
- P0: Top-products analytics — PostgreSQL SaleLine + Product + Stock Balance aggregates.
- P0: Online Dashboard analytics no longer derives from IndexedDB/local sales state.
- P0: Shared `asOfRevision` identifies the authoritative snapshot.
- P1: Device Sync is explicitly separated from business KPIs.
- P1: Dashboard freshness labels identify the authoritative snapshot scope.
- P1: A/B/C convergence test asserts KPI and analytics equality.

## Certification test
`tests/browser/dashboard-convergence.spec.ts`

The certification asserts:
1. PostgreSQL and initial Dashboard KPIs agree.
2. An offline sale remains invisible to an independent online browser until synchronization.
3. PostgreSQL, Browser A, Browser B and Browser C converge after sync.
4. KPI maps converge across all browsers.
5. Revenue analytics, payment analytics and top-product analytics converge across all browsers.
6. Logout → login preserves authoritative Dashboard recovery.

## Remaining operational distinction
Device-local sync queue and active cash-shift state remain device/terminal operational state; they are not treated as enterprise business KPIs.
