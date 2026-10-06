# Inventory Production Lock v1

**Lock ID:** `INVENTORY-PRODUCTION-LOCK-2026-10-06`  
**Status:** Mandatory, fail-closed  
**Scope:** Retail/General Inventory module

## Locked surfaces

1. Inventory Overview
2. Products
3. Categories & Brands
4. Stock Adjustment
5. Stock Transfer
6. Stock Alerts
7. Stock Sync Engine
8. Product Bundles & Kits
9. Stock Count
10. Ledger Drilldown
11. Wastage & Spillage
12. Inventory Reports

## Authority contract

- PostgreSQL is authoritative for shared inventory state.
- Stock Ledger is the immutable inventory movement authority.
- Product/Variant quantity is never an independent absolute inventory writer.
- ProductBranchStock is a derived projection/cache, not a competing source of truth.
- IndexedDB is an offline replica/cache.
- Offline inventory mutations must enter the durable outbox and reconcile through the governed sync path.
- Tenant and branch isolation is mandatory on every inventory read/write.
- Inventory convergence is fail-closed: pending, failed, abandoned, conflicted, or unverifiable mutations cannot be represented as synchronized.
- Master data starts clean for new tenants; no fabricated/demo Categories or Brands are permitted.

## Enforcement

The lock is enforced by `scripts/certification/inventory-production-lock.ts` and is a required gate in CI, production-candidate certification, and exact-main production certification.

The gate pins the certified UI, inventory service, database authority, sync engine, IndexedDB persistence, and regression-test blobs. Any drift or missing contract marker fails certification.

## Closed-loop test scope

The release gate also runs the repository's unit, integration, and sync suites. Inventory evidence includes stock-ledger movement/WAC, PostgreSQL stock convergence, catalog master lifecycle, tenant clean-initial-state, inventory valuation, and offline sync/reconciliation coverage.

## Change rule

Any Inventory P0/P1/P2 remediation after this lock requires the lock to be intentionally re-certified and its pinned hashes/evidence updated together. Inventory changes that bypass this gate are release-blocking.
