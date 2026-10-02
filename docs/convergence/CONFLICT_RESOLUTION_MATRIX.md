# KwakoPos v2 — Conflict Resolution Matrix

## 1. Conflict Classification & Resolution Rules

KwakoPos v2 strictly bans blind "Last Write Wins" (LWW). Every conflict is categorized into one of four deterministic classes:

```text
[Incoming Mutation vs Existing State]
                   |
     +-------------+-------------+-------------+
     |                           |             |
     v                           v             v
[Class 1: Safe Merge]  [Class 2: Sequential] [Class 3: Stale Write]
- Independent fields   - Stock movements     - Check _baseUpdatedAt
- Combined atomically  - Both apply to ledger- Stale write rejected
                                               - User review requested
```

### Class 1: Safe Merge (Independent Non-Overlapping Attributes)
- **Applies to:** Customer profiles, Supplier contact details, Product metadata (description, barcode) where attributes do not overlap.
- **Resolution Rule:** The server never silently field-merges a stale mutation. An operator may select `MERGE` with an explicit merged payload; the result is committed atomically and journaled.
- **Example:** Device A updates customer phone number while Device B updates customer delivery address. An explicit merge can retain both values.

### Class 2: Sequential Business Operations (Additive / Ledger Mutations)
- **Applies to:** Sales, Stock Movements, Payments, Expenses, Returns.
- **Resolution Rule:** Both operations represent legitimate real-world occurrences and MUST apply sequentially.
- **Example:** Device A sells 2 units of SKU-1 while offline. Device B sells 3 units of SKU-1 while offline. Upon reconnection, both stock ledger movements (-2 and -3) are appended. The resultant available stock is decremented by 5.

### Class 3: Stale Write Precondition Conflicts (Exclusive Overwriting Mutations)
- **Applies to:** Product pricing, Product SKU, Variant structure, Account codes.
- **Resolution Rule:** Precondition validation using `_baseUpdatedAt`.
  - If `server.updatedAt > client._baseUpdatedAt`: The mutation is rejected with `STALE_WRITE_CONFLICT`.
  - The client retains its uncommitted mutation in the Outbox marked `FAILED`, flags a conflict in `syncMetadata`, and requests operator intervention.
  - Silent overwriting of updated pricing or catalog data is strictly prevented.

### Class 4: Structural & Referential Conflicts
- **Applies to:** Variant creation for an archived product, or stock adjustments for a deleted variant.
- **Resolution Rule:** Hard referential integrity validation. If parent entity is inactive or deleted, mutation fails closed with descriptive business error code.

## 2. Audit Trail
All conflict detection and resolution events are persisted transactionally in PostgreSQL `audit_events` with the tenant, branch, actor, operation, conflict id and payload metadata. The in-memory `ProductionAuditStream` is not the authoritative conflict audit store.

## 3. Specialized Business Incidents

- `SaleOversell` is a durable business incident tied to a committed sale and immutable StockLedger. Resolution acknowledges the incident and never rewrites ledger history.
- `UnitConversionConflict` is persisted after the failed transaction rolls back. `ACCEPT_SERVER` acknowledges the authoritative stock state; `ACCEPT_LOCAL` and `MERGE` reattempt the conversion against current PostgreSQL state.
- PostgreSQL `audit_events` is the authoritative conflict audit store; the in-memory `ProductionAuditStream` is not authoritative.
