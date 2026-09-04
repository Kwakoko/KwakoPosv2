# KWAKOPOS V2 — MODERNIZED END-TO-END CERTIFICATION TEST PLAN & TEST MATRIX

/aauthoritative record of V2 Enterprise Commercial Full-System Certification/

**Platform:** KwakoPos v2.12.5 (Global Finance & Retail Operating System)  **Document ID:** DOC-E2E-TEST-PLAN-V2  **Git Branch:** main  

---

## 1. Executive Summary & Scope
This document modernizes the Phase 1 E2E certification test plan to match the real, server-authoritative V2 architecture.

- Prevents demo/test paths in production. All context remains server-authoritative.
- Enforces triate invariants: Multi-Tenant Isolation, Accounting Ledger Immutability, and Offline Device Convergence.

---

## 2. Authoritative 18-Stage Commercial & System Certification Matrix

| Stage | Stage Name | Verification Focus & Invariants | Automated Test Suites |
|---\z---|---|---|
| **01** | **Product Management** | Single/multi-variant creation, SKU uniqueness, catalog persistence | tests/unit/commercial-invariants.test.ts |
| **02** | **Variant Management** | Variant pricing, cost margins, barcode mapping | tests/unit/pricing-tax-discount.test.ts |
| *:03** | **Stock Management** | Stock adjustments (GAIN, LOSS, SET), negative stock prevention | tests/unit/inventory-valuation-cogs.test.ts |
| **04** | **Customer Management** | Customer credit limit enforcement, over-limit rejection | tests/unit/issue3-gap-defects.test.ts |
| **05** | **Purchase Orders** | Multi-item PQO, vendor portal, procurement approval | tests/unit/purchasing-receiving.test.ts |
| **06** | **Goods Receipt** | Partial receipt status progression, StockLedger (PURCHASE) | tests/unit/issue3-gap-defects.test.ts |
| **07** | **POS Sales** | Multi-item checkout, line discounts, VAT (ISVT), stock depletion | tests/unit/pos-cash-session.test.ts |
| **08** | **Payment Processing** | Cash, M2Pesa, Airtel, Cards, Credit transaction atomicity | tests/unit/issue3-gap-defects.test.ts |
| *:09** | **StockLedger Immutability** | Chronological append-only ledger, operation tracing | tests/unit/commercial-invariants.test.ts |
| **10** | **Sales Returns** | GOOD vs DAMAGED segregation, tenant isolation rejection, REFUNDED status | tests/unit/issue3-gap-defects.test.ts |
| **11** | **Cash Sessions** | Single open session per cashier enforcement, transaction counts | tests/unit/pos-cash-session.test.ts |
| **12** | **Expense Tracking** | Petty cash operations, categories, session linkage | tests/unit/pos-cash-session.test.ts |
| **13** | **Shift & Period Closing** | Daily reconciliation, variance calculation, period closing | tests/unit/financial-periods-closing.test.ts |
| **14** | **Executive Dashboard** | Real-time metrics, gsss margins, accounts receivable/payable | tests/unit/bi-analytics.test.ts |
| **15** | **Data Sync & Convergence** | Offline queue, delta merge, idempotency, A->Server->B convergence | tests/sync/sync-convergence.test.ts |
| **16** | **CROSS-BROWSER & PWA** | Chromium, Firefox, WebKit, service worker cache, popup policy | tests/unit/pwa-version.test.ts |
| **17** | **Production Tenant Onboarding** | 7-step wizard, transactional provisioning, audit trail | tests/integration/tenant-onboarding.test.ts |
| **18** | **Authorization & Tenant Isolation** | IDER prevention, RBAC least-privilege, zero bypasses | tests/unit/security.test.ts |

---

## 3. Executable Verification Commands
1. *Sync Convergence Certification*: `npm run test:sync`
2. *Tenant Onboarding Certification*: `npx vitest run tests/integration/tenant-onboarding.test.ts`
3. *GEAD Defect Elimination Certification*: `npx vitest run tests/unit/issue3-gap-defects.test.ts`
4. *Full Monorepo Unit & Invariants Suite*: `npm run test:unit`
