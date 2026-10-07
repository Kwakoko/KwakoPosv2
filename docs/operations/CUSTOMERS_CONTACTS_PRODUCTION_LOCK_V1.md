# Customers / Contacts Production Lock v1

**Lock ID:** `CUSTOMERS-CONTACTS-PRODUCTION-LOCK-2026-10-07`  
**Status:** Mandatory, fail-closed  
**Scope:** Customers, Suppliers, Contacts, customer credit/balance workflows, and contact lifecycle

## Locked surfaces

1. Customers
2. Suppliers
3. Customer profiles
4. Supplier profiles
5. Customer transactions
6. Supplier transactions
7. Credit limits
8. Customer balances
9. Contact search
10. Contact history
11. Import / export
12. Contact synchronization
13. Audit

## Authority contract

- PostgreSQL is authoritative for shared Customer, Supplier, Contact, payment, and balance state.
- Customer and Supplier reads/writes are tenant + branch scoped.
- Customer balances are financial state and cannot be edited through ordinary profile updates.
- Customer repayment and wallet-deposit mutations are atomic PostgreSQL transactions.
- Offline customer/contact changes are persisted in IndexedDB and enter the durable sync outbox.
- Customer, Supplier, and CustomerContact sync operations are idempotent and tenant/branch isolated.
- Customer Contact is a first-class PostgreSQL model with independent IndexedDB replication.
- Contact creation/update enforces one primary contact per customer.
- Customer archival is non-destructive and blocked while financial balances remain non-zero.
- Financial mutations cannot reduce customer balances below zero through concurrent requests.
- Import/export is permission-governed and import writes are server-authoritative.
- Customer/contact state-changing operations generate immutable audit events.
- Customer transaction history reads authoritative Sales, Payments, and Returns.
- No production path may report an authoritative write as successful when the PostgreSQL mutation failed.
- No demo, fabricated, placeholder, or local-only business state may be presented as synchronized.

## Synchronization contract

Customer and Supplier records are PostgreSQL-authoritative replicas. CustomerContact is a dependency of Customer and is ordered after Customer CREATE operations in the durable outbox. Payment CREATE operations settle customer or supplier balances transactionally and produce audit evidence. Stale profile/contact writes are rejected into the existing conflict-resolution lifecycle rather than silently overwritten.

## Enforcement

Lock enforcement is implemented by `scripts/certification/customers-contacts-production-lock.ts` and is a mandatory CI gate. The gate pins the customer/contact UI, API, contracts, Prisma schema, migration, production repository, sync engine, IndexedDB persistence, client sync mapping, navigation, and integration-regression test blobs.

## Regression scope

- Customer CREATE / UPDATE / archive lifecycle
- Customer Contact CREATE / UPDATE / history
- Customer repayment
- Customer wallet deposit
- Wallet-backed repayment
- Payment idempotency
- Tenant isolation
- Cross-tenant contact mutation rejection
- Customer transaction history
- Bootstrap and delta contact convergence
- Non-zero-balance archive blocking
- Immutable audit evidence

## Change rule

Any Customers / Contacts P0/P1/P2 remediation after this lock requires the lock gate and its pinned evidence to be intentionally re-certified. Bypassing the lock is release-blocking.
