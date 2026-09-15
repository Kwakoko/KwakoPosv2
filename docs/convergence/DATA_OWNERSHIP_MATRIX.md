# KwakoPos v2 — Data Ownership & Authority Matrix

## 1. Authority Model

Every business domain entity has an explicit **Primary Authority** and designated **Replica Roles**. Replicas never claim write authority without server consensus.

| Domain Entity | Primary Authority | Local Cache Store | Mutability Mode | Local Mutation Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Tenants** | PostgreSQL (`Tenant`) | Read-Only Session | Server Master | Read-only on client |
| **Branches** | PostgreSQL (`Branch`) | Read-Only Session | Server Master | Read-only on client |
| **Users & Roles** | PostgreSQL (`User`, `Role`) | Read-Only Token | Server Master | Outbox mutation blocked (`PRIVILEGE_ESCALATION_ATTEMPT_DENIED`) |
| **Categories** | PostgreSQL (`Category`) | `configuration` | Bidirectional Sync | Enqueue Outbox $\rightarrow$ Server Commit |
| **Brands** | PostgreSQL (`Brand`) | `configuration` | Bidirectional Sync | Enqueue Outbox $\rightarrow$ Server Commit |
| **Products** | PostgreSQL (`Product`) | `products` | Bidirectional Sync | Optimistic write with `_baseUpdatedAt` |
| **Product Variants** | PostgreSQL (`ProductVariant`)| `productVariants` | Bidirectional Sync | Parent-preserving lifecycle |
| **Stock Ledger** | PostgreSQL (`StockLedger`) | `stockLedger` | Append-Only Master | Immutable movements, never updated in place |
| **Stock Adjustments**| PostgreSQL (`StockAdjustment`)| `stockAdjustments` | Append-Only Master | Optimistic local record, server commit |
| **Sales** | PostgreSQL (`Sale`) | `sales` | Append-Only Master | Local atomic commit, outbox dispatch |
| **Sale Returns** | PostgreSQL (`SaleReturn`) | `sales` | Append-Only Master | Immutable reverse ledger movement |
| **Purchases** | PostgreSQL (`PurchaseOrder`) | `sales` / `receipts` | Append-Only Master | Requires vendor + line item reconciliation |
| **Expenses** | PostgreSQL (`Expense`) | `payments` | Append-Only Master | Linked to cash session and ledger account |
| **Receivables** | PostgreSQL (`CustomerBalance`) | `customers` | Derived Server State | Derived from sales and incoming payments |
| **Payables** | PostgreSQL (`SupplierBalance`) | `suppliers` | Derived Server State | Derived from purchase receipts and payments |
| **Reports** | PostgreSQL Views / OLAP | In-Memory Aggregate | Server Computed | Replicas calculate preliminary local totals |
| **Settings** | PostgreSQL (`Setting`) | `configuration` | Server Master | Tenant-scoped configuration sync |
| **Feature Flags** | PostgreSQL (`FeatureFlag`) | `configuration` | Server Master | Governed by license and subscription tier |

## 2. Immutability Enforcements

1. **Financial Immutability:** Sales, Payments, Stock Movements, and Journal Entries are strictly append-only. Voids and corrections create compensating reversal entries rather than mutating historical records.
2. **Identity Stability:** Entities must retain their client-generated `id` throughout the sync lifecycle. Server never substitutes client UUIDs with server-generated IDs.
