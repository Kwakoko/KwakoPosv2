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

## Financial closure coverage
- P0 closed: production sale tax is derived from authoritative tenant/branch settings; dashboard revenue and gross profit exclude VAT from revenue.
- P0 closed: completed returns reduce net revenue and restore returned COGS, maintaining `Gross Profit = Net Revenue - Net COGS`.
- P1 closed: payment analytics separate payment-record counts from distinct orders and compute order AOV from distinct orders.
- P1 closed: Top Products use net revenue and net units after completed returns.
- P1 closed: online Recent Orders are PostgreSQL-authoritative; local sales/outbox are used only for offline operational continuity.
- P1 closed: Recent Orders are enriched from persisted customer, product/variant and payment relations.
- P1 closed: online/offline transition handling includes `isOnline` in the Recent Orders loader dependency.
- P1 closed: navigation production-lock hashing is Git-canonical on Windows and CI, preventing CRLF false failures.
- Certification added: `tests/integration/dashboard-financial-closures.test.ts` covers VAT, split tender, partial returns, product netting and authoritative Recent Orders.
- Browser certification extended: `tests/browser/dashboard-convergence.spec.ts` covers VAT/split-tender/partial-return convergence and PostgreSQL equality.

## Remaining operational distinction
Device-local sync queue and active cash-shift state remain device/terminal operational state; they are not treated as enterprise business KPIs.


## Reporting-time authority

Dashboard financial reporting uses **UTC as the canonical reporting timezone**. The KPI transaction pins PostgreSQL with `SET LOCAL TIME ZONE 'UTC'`, while application windows, calendar-day keys, prior-period arithmetic, and displayed analytics labels are also UTC-based. This prevents database-session or Node-process local timezone differences from moving sales, refunds, or peak-hour metrics across Dashboard day boundaries.
